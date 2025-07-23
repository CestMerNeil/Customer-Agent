import requests
import json
from Agent.bot import Bot
from bridge.context import ContextType, Context
from bridge.reply import Reply, ReplyType
from utils.logger import get_logger
from config import Config as conf
from Agent.DifyAgent.user_session import DifyUserSessionManager
from Agent.DifyAgent.conversation_manager import DifyConversationManager


class DifyBot(Bot):
    def __init__(self):
        super().__init__()
        self.logger = get_logger("DifyBot")
        self.api_key = conf().get("dify_api_key")
        self.base_url = conf().get("dify_api_base", "https://api.dify.ai/v1")
        self.app_id = conf().get("dify_app_id")
        
        # 初始化会话管理组件
        self.session_manager = DifyUserSessionManager()
        self.conv_manager = DifyConversationManager(
            api_key=self.api_key,
            base_url=self.base_url,
            session_manager=self.session_manager
        )

    def reply(self, context: Context) -> Reply:
        try:
            # 统一获取用户ID
            from_id = context.kwargs.get("from_uid")
            shop_id = context.kwargs.get("shop_id")
            user_id = f"{shop_id}_{from_id}"
            
            # 直接使用预处理后的消息内容
            query = context.content
            
            # 获取或创建会话
            conversation_id = self.session_manager.get_session(user_id)
            if not conversation_id:
                conversation_id = self.conv_manager.create_conversation(user_id)
                if not conversation_id:
                    return Reply(ReplyType.TEXT, "会话创建失败")

            # 发送消息并获取回复
            return self._send_message_and_get_reply(conversation_id, query, user_id)
            
        except Exception as e:
            self.logger.error(f"处理消息异常: {str(e)}", exc_info=True)
            return Reply(ReplyType.TEXT, "消息处理失败")

    def _send_message_and_get_reply(self, conversation_id, query, user_id):
        """发送消息并获取回复"""
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            data = {
                "inputs": {},
                "query": query,
                "response_mode": "blocking",
                "conversation_id": conversation_id,
                "user": user_id
            }
            
            response = requests.post(
                f"{self.base_url}/chat-messages",
                headers=headers,
                json=data,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                answer = result.get("answer", "")
                if answer:
                    self.logger.debug(f"Dify回复: {answer}")
                    return Reply(ReplyType.TEXT, answer)
                else:
                    return Reply(ReplyType.TEXT, "未能获取到回复")
            else:
                self.logger.error(f"Dify API请求失败: {response.status_code}, {response.text}")
                return Reply(ReplyType.TEXT, "请求处理失败")
                
        except requests.exceptions.Timeout:
            self.logger.error("Dify API请求超时")
            return Reply(ReplyType.TEXT, "请求处理超时")
        except Exception as e:
            self.logger.error(f"消息处理失败: {str(e)}")
            return Reply(ReplyType.TEXT, "请求处理失败")