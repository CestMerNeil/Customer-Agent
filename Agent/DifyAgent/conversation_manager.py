import requests
import json
from .user_session import DifyUserSessionManager
from utils.logger import get_logger
from typing import Optional
import uuid


class DifyConversationManager:
    def __init__(self, api_key: str, base_url: str, session_manager: DifyUserSessionManager):
        self.api_key = api_key
        self.base_url = base_url
        self.session_manager = session_manager
        self.logger = get_logger()

    def create_conversation(self, user_id: str = None) -> Optional[str]:
        """创建新会话并保存到数据库"""
        try:
            # Dify使用UUID作为conversation_id
            conversation_id = str(uuid.uuid4())
            
            if user_id:
                self.session_manager.create_session(user_id, conversation_id)
                self.logger.debug(f"创建Dify会话: {conversation_id} for user: {user_id}")
            
            return conversation_id
        except Exception as e:
            self.logger.error(f"创建Dify会话失败: {str(e)}")
            return None

    def get_conversation_messages(self, conversation_id: str, limit: int = 20) -> list:
        """获取会话消息历史"""
        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            params = {
                "conversation_id": conversation_id,
                "limit": limit
            }
            
            response = requests.get(
                f"{self.base_url}/messages",
                headers=headers,
                params=params,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                return result.get("data", [])
            else:
                self.logger.error(f"获取会话消息失败: {response.status_code}")
                return []
                
        except Exception as e:
            self.logger.error(f"获取会话消息异常: {str(e)}")
            return []