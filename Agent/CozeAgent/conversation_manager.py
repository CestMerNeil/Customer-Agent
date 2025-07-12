from cozepy import Coze
from .user_session import UserSessionManager
from utils.logger import get_logger
from typing import Optional

class ConversationManager:
    def __init__(self, coze_client: Coze, session_manager: UserSessionManager):
        self.coze = coze_client
        self.session_manager = session_manager
        self.logger =  get_logger()
    def create_conversation(self, user_id: str = None) -> Optional[str]:
        """创建新会话并保存到数据库"""
        try:
            conversation = self.coze.conversations.create()
            conversation_id = conversation.id
            if user_id:
                self.session_manager.create_session(user_id, conversation_id)
                self.logger.debug(f"创建会话: {conversation_id} for user: {user_id}")
            return conversation_id
        except Exception as e:
            self.logger.error(f"创建会话失败: {str(e)}")
            return None 