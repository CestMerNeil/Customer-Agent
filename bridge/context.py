"""
上下文类型枚举
"""
from enum import Enum

class ChannelType(Enum):
    PINDUODUO = "pinduoduo"
    JINGDONG = "jingdong"
    TAOBAO = "taobao"
    DOUYIN = "douyin"
    KUAISHOU = "kuaishou"
    def __str__(self):
        return self.name

class ContextType(Enum):
    TEXT = "text" # 文本
    IMAGE = "image" # 图片
    VIDEO = "video" # 视频
    EMOTION = "emotion" # 表情
    GOODS_CARD = "goods_card" # 商品卡片
    GOODS_INQUIRY = "goods_inquiry"  # 商品规格咨询
    GOODS_SPEC = "goods_spec"  # 商品规格
    ORDER_INFO = "order_info"  # 订单信息
    SYSTEM_STATUS = "system_status"#系统状态
    MALL_SYSTEM_MSG = "mall_system_msg"#商城消息
    SYSTEM_HINT = "system_hint"#系统提示
    SYSTEM_BIZ = "system_biz"#系统业务
    MALL_CS = "mall_cs"#商城客服
    WITHDRAW = "withdraw"#撤回
    AUTH = "auth"#认证
    TRANSFER = "transfer"#转接
    def __str__(self):
        return self.name

class Context:
    def __init__(self, type: ContextType, content: None,kwargs=dict(),channel_type: ChannelType=None):
        self.type = type
        self.content = content
        self.kwargs = kwargs
        self.channel_type = channel_type

    def __str__(self):
        return "Context(type={}, content={}, kwargs={}, channel_type={})".format(self.type, self.content, self.kwargs, self.channel_type)
    