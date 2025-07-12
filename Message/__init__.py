"""
Message模块初始化文件
提供消息队列和消费者系统的便捷接口
"""

from Message.message_queue import MessageQueue, MessageQueueManager, message_queue_manager
from Message.message_consumer import (
    MessageHandler, 
    MessageConsumer, 
    MessageConsumerManager,
    TypeBasedHandler,
    ChannelBasedHandler,
    message_consumer_manager
)

from Message.message import ChatMessage
from bridge.context import Context, ContextType, ChannelType

# 便捷函数

def init_message_system():
    """
    初始化消息系统
    
    Returns:
        tuple: (queue_manager, consumer_manager)
    """
    return message_queue_manager, message_consumer_manager


def create_queue(name: str, max_size: int = 1000) -> MessageQueue:
    """
    创建消息队列
    
    Args:
        name: 队列名称
        max_size: 最大容量
        
    Returns:
        MessageQueue实例
    """
    return message_queue_manager.get_or_create_queue(name, max_size)


def create_consumer(queue_name: str, max_concurrent: int = 10) -> MessageConsumer:
    """
    创建消息消费者
    
    Args:
        queue_name: 队列名称
        max_concurrent: 最大并发数
        
    Returns:
        MessageConsumer实例
    """
    return message_consumer_manager.create_consumer(queue_name, max_concurrent)


def get_queue(name: str) -> MessageQueue:
    """
    获取消息队列
    
    Args:
        name: 队列名称
        
    Returns:
        MessageQueue实例或None
    """
    return message_queue_manager.get_queue(name)


def get_consumer(queue_name: str) -> MessageConsumer:
    """
    获取消息消费者
    
    Args:
        queue_name: 队列名称
        
    Returns:
        MessageConsumer实例或None
    """
    return message_consumer_manager.get_consumer(queue_name)


async def start_consumer(queue_name: str):
    """
    启动消息消费者
    
    Args:
        queue_name: 队列名称
    """
    await message_consumer_manager.start_consumer(queue_name)


async def stop_consumer(queue_name: str):
    """
    停止消息消费者
    
    Args:
        queue_name: 队列名称
    """
    await message_consumer_manager.stop_consumer(queue_name)


async def put_message(queue_name: str, context: Context) -> str:
    """
    向队列放入消息
    
    Args:
        queue_name: 队列名称
        context: Context格式的消息
        
    Returns:
        消息ID
    """
    queue = message_queue_manager.get_or_create_queue(queue_name)
    return await queue.put(context)


async def get_message(queue_name: str, timeout: float = None):
    """
    从队列获取消息
    
    Args:
        queue_name: 队列名称
        timeout: 超时时间
        
    Returns:
        消息包装器或None
    """
    queue = message_queue_manager.get_queue(queue_name)
    if queue:
        return await queue.get(timeout)
    return None


# 导出主要类和函数
__all__ = [
    'MessageQueue',
    'MessageQueueManager', 
    'MessageHandler',
    'MessageConsumer',
    'MessageConsumerManager',
    'TypeBasedHandler',
    'ChannelBasedHandler',
    'ChatMessage',
    'Context',
    'ContextType',
    'ChannelType',
    'message_queue_manager',
    'message_consumer_manager',

    # 便捷函数
    'init_message_system',
    'create_queue',
    'create_consumer',
    'get_queue',
    'get_consumer',
    'start_consumer',
    'stop_consumer',
    'put_message',
    'get_message'
] 