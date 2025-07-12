"""
消息队列管理器
用于管理基于Context格式的消息队列
"""

import asyncio
import threading
from collections import deque
from typing import Optional, List, Callable, Dict, Any
from datetime import datetime
import uuid
import json
from bridge.context import Context, ContextType, ChannelType
from utils.logger import get_logger


class MessageQueue:
    """消息队列类，支持异步操作"""
    
    def __init__(self, max_size: int = 1000):
        """
        初始化消息队列
        
        Args:
            max_size: 队列最大容量，防止内存溢出
        """
        self.max_size = max_size
        self._queue = deque(maxlen=max_size)
        self._lock = asyncio.Lock()
        self._condition = asyncio.Condition(self._lock)
        self._closed = False
        self.logger = get_logger()
        
    async def put(self, context: Context) -> str:
        """
        将消息放入队列
        
        Args:
            context: Context格式的消息对象
            
        Returns:
            str: 消息ID
        """
        if not isinstance(context, Context):
            raise ValueError("消息必须是Context类型")
            
        async with self._condition:
            if self._closed:
                raise RuntimeError("消息队列已关闭")
                
            # 为消息添加唯一ID和时间戳
            message_id = str(uuid.uuid4())
            timestamp = datetime.now().isoformat()
            
            # 创建消息包装器
            message_wrapper = {
                'id': message_id,
                'timestamp': timestamp,
                'context': context,
                'processed': False
            }
            
            self._queue.append(message_wrapper)
            self.logger.debug(f"消息已入队: {message_id}, 队列长度: {len(self._queue)}")
            
            # 通知等待的消费者
            self._condition.notify_all()
            
            return message_id
    
    async def get(self, timeout: Optional[float] = None) -> Optional[Dict[str, Any]]:
        """
        从队列获取消息
        
        Args:
            timeout: 超时时间(秒)，None表示无限等待
            
        Returns:
            消息包装器字典或None
        """
        async with self._condition:
            if self._closed and not self._queue:
                return None
                
            # 等待消息可用
            try:
                await asyncio.wait_for(
                    self._condition.wait_for(lambda: self._queue or self._closed),
                    timeout=timeout
                )
            except asyncio.TimeoutError:
                return None
                
            if not self._queue:
                return None
                
            message_wrapper = self._queue.popleft()
            self.logger.debug(f"消息已出队: {message_wrapper['id']}, 队列长度: {len(self._queue)}")
            
            return message_wrapper
    
    async def peek(self) -> Optional[Dict[str, Any]]:
        """
        查看队列头部消息但不移除
        
        Returns:
            消息包装器字典或None
        """
        async with self._lock:
            if not self._queue:
                return None
            return dict(self._queue[0])  # 返回副本
    
    async def size(self) -> int:
        """获取队列当前大小"""
        async with self._lock:
            return len(self._queue)
    
    async def is_empty(self) -> bool:
        """检查队列是否为空"""
        async with self._lock:
            return len(self._queue) == 0
    
    async def is_full(self) -> bool:
        """检查队列是否已满"""
        async with self._lock:
            return len(self._queue) >= self.max_size
    
    async def clear(self) -> int:
        """
        清空队列
        
        Returns:
            清除的消息数量
        """
        async with self._lock:
            count = len(self._queue)
            self._queue.clear()
            self.logger.info(f"已清空消息队列，清除了 {count} 条消息")
            return count
    
    async def close(self):
        """关闭队列，不再接受新消息"""
        async with self._condition:
            self._closed = True
            self._condition.notify_all()
            self.logger.info("消息队列已关闭")
    
    async def get_stats(self) -> Dict[str, Any]:
        """
        获取队列统计信息
        
        Returns:
            统计信息字典
        """
        async with self._lock:
            return {
                'size': len(self._queue),
                'max_size': self.max_size,
                'is_closed': self._closed,
                'is_empty': len(self._queue) == 0,
                'is_full': len(self._queue) >= self.max_size
            }


class MessageQueueManager:
    """消息队列管理器，支持多个命名队列"""
    
    def __init__(self):
        self.queues: Dict[str, MessageQueue] = {}
        self._lock = threading.Lock()
        self.logger = get_logger()
    
    def create_queue(self, name: str, max_size: int = 1000) -> MessageQueue:
        """
        创建新的消息队列
        
        Args:
            name: 队列名称
            max_size: 队列最大容量
            
        Returns:
            MessageQueue实例
        """
        with self._lock:
            if name in self.queues:
                raise ValueError(f"队列 '{name}' 已存在")
                
            queue = MessageQueue(max_size)
            self.queues[name] = queue
            self.logger.info(f"创建消息队列: {name}, 最大容量: {max_size}")
            
            return queue
    
    def get_queue(self, name: str) -> Optional[MessageQueue]:
        """
        获取指定名称的队列
        
        Args:
            name: 队列名称
            
        Returns:
            MessageQueue实例或None
        """
        with self._lock:
            return self.queues.get(name)
    
    def get_or_create_queue(self, name: str, max_size: int = 1000) -> MessageQueue:
        """
        获取队列，如果不存在则创建
        
        Args:
            name: 队列名称
            max_size: 队列最大容量
            
        Returns:
            MessageQueue实例
        """
        with self._lock:
            if name not in self.queues:
                queue = MessageQueue(max_size)
                self.queues[name] = queue
                self.logger.debug(f"创建消息队列: {name}, 最大容量: {max_size}")
            return self.queues[name]
    
    def remove_queue(self, name: str) -> bool:
        """
        移除指定队列
        
        Args:
            name: 队列名称
            
        Returns:
            是否成功移除
        """
        with self._lock:
            if name in self.queues:
                # 异步关闭队列
                asyncio.create_task(self.queues[name].close())
                del self.queues[name]
                self.logger.debug(f"移除消息队列: {name}")
                return True
            return False
    
    def list_queues(self) -> List[str]:
        """
        获取所有队列名称
        
        Returns:
            队列名称列表
        """
        with self._lock:
            return list(self.queues.keys())
    
    async def get_all_stats(self) -> Dict[str, Dict[str, Any]]:
        """
        获取所有队列的统计信息
        
        Returns:
            所有队列的统计信息
        """
        stats = {}
        with self._lock:
            queue_items = list(self.queues.items())
        
        for name, queue in queue_items:
            stats[name] = await queue.get_stats()
        
        return stats


# 全局消息队列管理器实例
message_queue_manager = MessageQueueManager() 