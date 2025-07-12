"""
拼多多API模块
统一管理所有API请求类
"""

from .base_request import BaseRequest
from .get_token import GetToken
from .send_message import SendMessage
from .get_user_info import GetUserInfo
from .get_shop_info import GetShopInfo
from .Set_up_online import AccountMonitor

__all__ = [
    'BaseRequest',
    'GetToken',
    'SendMessage', 
    'GetUserInfo',
    'GetShopInfo',
    'AccountMonitor'
]

# 版本信息
__version__ = '1.0.0'
__author__ = 'Agent-Customer Team'
__description__ = '拼多多API统一请求基类和相关API实现' 