"""
channel factory
"""
from config import config


def create_bot():
    """
    创建一个bot实例
    :return: bot实例
    """
    bot_type = config.get("bot_type")
    if bot_type == "coze":
        from Agent.CozeAgent.bot import CozeBot
        return CozeBot()
    elif bot_type == "dify":
        from Agent.DifyAgent.bot import DifyBot
        return DifyBot()
    elif bot_type == "lmstudio":
        from Agent.LMStudioAgent.bot import LMStudioBot
        return LMStudioBot()
    else:
        raise RuntimeError(f"Invalid bot type: {bot_type}")