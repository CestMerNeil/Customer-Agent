"""
消息消费者系统
用于处理消息队列中的Context格式消息
"""

import asyncio
from typing import Callable, Optional, Dict, Any, List, Awaitable
from abc import ABC, abstractmethod
from venv import logger
from bridge.context import Context
from Message.message_queue import message_queue_manager
from utils.logger import get_logger

logger = get_logger()

class MessageHandler(ABC):
    """消息处理器抽象基类"""
    
    @abstractmethod
    async def handle(self, context: Context, metadata: Dict[str, Any]) -> bool:
        """
        处理消息
        
        Args:
            context: Context格式的消息
            metadata: 消息元数据（包含ID、时间戳等）
            
        Returns:
            bool: 是否处理成功
        """
        pass
    
    @abstractmethod
    def can_handle(self, context: Context) -> bool:
        """
        判断是否能处理该消息
        
        Args:
            context: Context格式的消息
            
        Returns:
            bool: 是否能处理
        """
        pass


class TypeBasedHandler(MessageHandler):
    """基于消息类型的处理器"""
    
    def __init__(self, supported_types: set, handler_func: Callable[[Context, Dict[str, Any]], Awaitable[bool]]):
        """
        初始化类型处理器
        
        Args:
            supported_types: 支持的消息类型集合
            handler_func: 处理函数
        """
        self.supported_types = supported_types
        self.handler_func = handler_func
    
    def can_handle(self, context: Context) -> bool:
        """检查是否支持该消息类型"""
        return context.type in self.supported_types
    
    async def handle(self, context: Context, metadata: Dict[str, Any]) -> bool:
        """调用处理函数处理消息"""
        try:
            return await self.handler_func(context, metadata)
        except Exception as e:
            logger.error(f"消息处理失败: {e}")
            return False


class ChannelBasedHandler(MessageHandler):
    """基于渠道类型的处理器"""
    
    def __init__(self, supported_channels: set, handler_func: Callable[[Context, Dict[str, Any]], Awaitable[bool]]):
        """
        初始化渠道处理器
        
        Args:
            supported_channels: 支持的渠道类型集合
            handler_func: 处理函数
        """
        self.supported_channels = supported_channels
        self.handler_func = handler_func
    
    def can_handle(self, context: Context) -> bool:
        """检查是否支持该渠道类型"""
        return context.channel_type in self.supported_channels
    
    async def handle(self, context: Context, metadata: Dict[str, Any]) -> bool:
        """调用处理函数处理消息"""
        try:
            return await self.handler_func(context, metadata)
        except Exception as e:
            logger.error(f"消息处理失败: {e}")
            return False


class UserSequentialProcessor:
    """用户消息顺序处理器"""
    
    def __init__(self, user_id: str, handlers: List[MessageHandler]):
        self.user_id = user_id
        self.handlers = handlers
        self.message_queue = asyncio.Queue()
        self.is_processing = False
        self.processor_task = None
        self.logger = get_logger()
    
    async def add_message(self, message_wrapper: Dict[str, Any]):
        """添加消息到用户队列"""
        await self.message_queue.put(message_wrapper)
        
        # 启动处理器（如果未运行）
        if not self.is_processing:
            self.processor_task = asyncio.create_task(self._process_user_messages())
    
    async def _process_user_messages(self):
        """处理用户消息队列（串行处理）"""
        self.is_processing = True
        try:
            while True:
                try:
                    # 获取消息，超时后退出
                    message_wrapper = await asyncio.wait_for(
                        self.message_queue.get(), 
                        timeout=30.0  # 30秒无消息则关闭处理器
                    )
                    
                    await self._process_single_message(message_wrapper)
                    
                except asyncio.TimeoutError:
                    # 超时无消息，退出处理器
                    self.logger.debug(f"用户 {self.user_id} 消息处理器超时退出")
                    break
                    
        except Exception as e:
            self.logger.error(f"用户 {self.user_id} 消息处理器异常: {e}")
        finally:
            self.is_processing = False
    
    async def _process_single_message(self, message_wrapper: Dict[str, Any]):
        """处理单条消息"""
        message_id = message_wrapper['id']
        context = message_wrapper['context']
        
        try:
            # 查找能处理该消息的处理器
            handled = False
            for handler in self.handlers:
                if handler.can_handle(context):
                    self.logger.debug(f"用户 {self.user_id} 使用处理器 {handler.__class__.__name__} 处理消息 {message_id}")
                    
                    success = await handler.handle(context, message_wrapper)
                    if success:
                        handled = True
                        self.logger.debug(f"用户 {self.user_id} 消息 {message_id} 处理成功")
                    else:
                        self.logger.warning(f"用户 {self.user_id} 消息 {message_id} 处理失败")
                    break
            
            if not handled:
                self.logger.warning(f"用户 {self.user_id} 消息 {message_id} 没有合适的处理器")
                
        except Exception as e:
            self.logger.error(f"用户 {self.user_id} 处理消息 {message_id} 时发生异常: {e}")
    
    async def stop(self):
        """停止用户消息处理器"""
        if self.processor_task and not self.processor_task.done():
            self.processor_task.cancel()
            try:
                await self.processor_task
            except asyncio.CancelledError:
                pass
        self.is_processing = False


class MessageConsumer:
    """消息消费者 - 支持按用户分组的串行处理"""
    
    def __init__(self, queue_name: str, max_concurrent: int = 10):
        """
        初始化消息消费者
        
        Args:
            queue_name: 要消费的队列名称
            max_concurrent: 最大并发处理数（不同用户的并发数）
        """
        self.queue_name = queue_name
        self.max_concurrent = max_concurrent
        self.handlers: list[MessageHandler] = []
        self.is_running = False
        self.logger = get_logger()
        self.semaphore = asyncio.Semaphore(max_concurrent)
        
        # 用户消息处理器字典 {user_id: UserSequentialProcessor}
        self.user_processors: Dict[str, UserSequentialProcessor] = {}
        self.cleanup_task = None
        
    def add_handler(self, handler: MessageHandler):
        """
        添加消息处理器
        
        Args:
            handler: 消息处理器实例
        """
        self.handlers.append(handler)
        self.logger.debug(f"添加消息处理器: {handler.__class__.__name__}")
    
    def add_type_handler(self, message_types: set, handler_func: Callable[[Context, Dict[str, Any]], Awaitable[bool]]):
        """
        添加基于消息类型的处理器
        
        Args:
            message_types: 支持的消息类型集合
            handler_func: 处理函数
        """
        handler = TypeBasedHandler(message_types, handler_func)
        self.add_handler(handler)
    
    def add_channel_handler(self, channel_types: set, handler_func: Callable[[Context, Dict[str, Any]], Awaitable[bool]]):
        """
        添加基于渠道类型的处理器
        
        Args:
            channel_types: 支持的渠道类型集合
            handler_func: 处理函数
        """
        handler = ChannelBasedHandler(channel_types, handler_func)
        self.add_handler(handler)
    
    def _get_user_id(self, context: Context) -> str:
        """从Context中提取用户ID"""
        from_uid = context.kwargs.get('from_uid')
        channel = context.channel_type
        user_id = channel.value + "_" + from_uid
        return str(user_id)
    
    def _get_or_create_user_processor(self, user_id: str) -> UserSequentialProcessor:
        """获取或创建用户消息处理器"""
        if user_id not in self.user_processors:
            processor = UserSequentialProcessor(user_id, self.handlers)
            self.user_processors[user_id] = processor
            self.logger.debug(f"为用户 {user_id} 创建消息处理器")
        
        return self.user_processors[user_id]
    
    async def _process_message(self, message_wrapper: Dict[str, Any]):
        """
        处理单条消息 - 分配给对应用户的处理器
        
        Args:
            message_wrapper: 消息包装器
        """
        async with self.semaphore:
            context = message_wrapper['context']
            user_id = self._get_user_id(context)
            
            # 获取或创建用户处理器
            user_processor = self._get_or_create_user_processor(user_id)
            
            # 将消息添加到用户处理器的队列中
            await user_processor.add_message(message_wrapper)
            
            self.logger.debug(f"消息已分配给用户 {user_id} 的处理器")

    async def start(self):
        """启动消息消费者"""
        if self.is_running:
            self.logger.warning(f"消费者 {self.queue_name} 已在运行")
            return
            
        self.is_running = True
        self.logger.debug(f"启动消息消费者: {self.queue_name}")
        
        # 获取或创建队列
        queue = message_queue_manager.get_or_create_queue(self.queue_name)
        
        # 启动清理任务
        self.cleanup_task = asyncio.create_task(self._cleanup_inactive_processors())
        
        try:
            while self.is_running:
                # 从队列获取消息
                message_wrapper = await queue.get(timeout=1.0)
                
                if message_wrapper is None:
                    continue
                
                # 异步处理消息（分配给用户处理器）
                asyncio.create_task(self._process_message(message_wrapper))
                
        except Exception as e:
            self.logger.error(f"消费者 {self.queue_name} 运行时发生错误: {e}")
        finally:
            self.is_running = False
            
            # 停止清理任务
            if self.cleanup_task:
                self.cleanup_task.cancel()
                try:
                    await self.cleanup_task
                except asyncio.CancelledError:
                    pass
            
            # 停止所有用户处理器
            await self._stop_all_user_processors()
            
            self.logger.debug(f"消息消费者 {self.queue_name} 已停止")
    
    async def _cleanup_inactive_processors(self):
        """定期清理不活跃的用户处理器"""
        try:
            while self.is_running:
                await asyncio.sleep(60)  # 每分钟检查一次
                
                inactive_users = []
                for user_id, processor in self.user_processors.items():
                    if not processor.is_processing:
                        inactive_users.append(user_id)
                
                # 清理不活跃的处理器
                for user_id in inactive_users:
                    processor = self.user_processors.pop(user_id, None)
                    if processor:
                        await processor.stop()
                        self.logger.debug(f"清理用户 {user_id} 的不活跃处理器")
                        
        except asyncio.CancelledError:
            pass
        except Exception as e:
            self.logger.error(f"清理任务异常: {e}")
    
    async def _stop_all_user_processors(self):
        """停止所有用户处理器"""
        tasks = []
        for processor in self.user_processors.values():
            tasks.append(processor.stop())
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        
        self.user_processors.clear()
        self.logger.debug("所有用户处理器已停止")

    async def stop(self):
        """停止消息消费者"""
        self.is_running = False
        self.logger.debug(f"正在停止消息消费者: {self.queue_name}")


class MessageConsumerManager:
    """消息消费者管理器"""
    
    def __init__(self):
        self.consumers: Dict[str, MessageConsumer] = {}
        self.consumer_tasks: Dict[str, asyncio.Task] = {}
        self.logger = get_logger()
    
    def create_consumer(self, queue_name: str, max_concurrent: int = 10) -> MessageConsumer:
        """
        创建消息消费者
        
        Args:
            queue_name: 队列名称
            max_concurrent: 最大并发处理数
            
        Returns:
            MessageConsumer实例
        """
        if queue_name in self.consumers:
            raise ValueError(f"消费者 '{queue_name}' 已存在")
            
        consumer = MessageConsumer(queue_name, max_concurrent)
        self.consumers[queue_name] = consumer
        self.logger.debug(f"创建消息消费者: {queue_name}")
        
        return consumer
    
    def get_consumer(self, queue_name: str) -> Optional[MessageConsumer]:
        """
        获取消息消费者
        
        Args:
            queue_name: 队列名称
            
        Returns:
            MessageConsumer实例或None
        """
        return self.consumers.get(queue_name)
    
    async def start_consumer(self, queue_name: str):
        """
        启动消息消费者
        
        Args:
            queue_name: 队列名称
        """
        consumer = self.consumers.get(queue_name)
        if not consumer:
            raise ValueError(f"消费者 '{queue_name}' 不存在")
            
        if queue_name in self.consumer_tasks:
            self.logger.warning(f"消费者 {queue_name} 已在运行")
            return
            
        # 创建消费者任务
        task = asyncio.create_task(consumer.start())
        self.consumer_tasks[queue_name] = task
        self.logger.debug(f"启动消费者任务: {queue_name}")
    
    async def stop_consumer(self, queue_name: str):
        """
        停止消息消费者
        
        Args:
            queue_name: 队列名称
        """
        consumer = self.consumers.get(queue_name)
        if consumer:
            await consumer.stop()
            
        # 取消并清理任务
        task = self.consumer_tasks.get(queue_name)
        if task:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            del self.consumer_tasks[queue_name]
            self.logger.debug(f"停止消费者任务: {queue_name}")
    
    async def stop_all_consumers(self):
        """停止所有消费者"""
        tasks = []
        for queue_name in list(self.consumers.keys()):
            tasks.append(self.stop_consumer(queue_name))
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        
        self.logger.debug("所有消费者已停止")
    
    def list_consumers(self) -> List[str]:
        """获取所有消费者名称"""
        return list(self.consumers.keys())
    
    def get_running_consumers(self) -> List[str]:
        """获取正在运行的消费者名称"""
        return list(self.consumer_tasks.keys())


# 全局消息消费者管理器实例
message_consumer_manager = MessageConsumerManager() 