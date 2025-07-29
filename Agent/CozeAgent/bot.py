from re import S
from Agent.bot import Bot
from bridge.context import ContextType, Context
from bridge.reply import Reply, ReplyType
from utils.logger import get_logger
from config import config
from cozepy import Coze, TokenAuth, MessageContentType, MessageType
from Agent.CozeAgent.user_session import UserSessionManager
from Agent.CozeAgent.conversation_manager import ConversationManager
class CozeBot(Bot):
    def __init__(self):
        super().__init__()
        self.logger = get_logger("CozeBot")
        self.token = config.get("coze_token")
        self.bot_id = config.get("coze_bot_id")
        # 初始化Coze客户端
        self.coze_client = Coze(
            auth=TokenAuth(token=self.token),
            base_url=config.get("coze_api_base")
        )
        # 初始化会话管理组件
        self.session_manager = UserSessionManager()
        self.conv_manager = ConversationManager(
            coze_client=self.coze_client,
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
            
            # 获取或创建会话（使用数据库管理）
            conversation_id = self.session_manager.get_session(user_id)
            if not conversation_id:
                if not (conversation_id := self.conv_manager.create_conversation(user_id)):
                    return Reply(ReplyType.TEXT, "会话创建失败")

            # 创建消息并获取回复
            return self._create_message_and_get_reply(conversation_id, query, context)
            
        except Exception as e:
            self.logger.error(f"处理消息异常: {str(e)}", exc_info=True)
            return Reply(ReplyType.TEXT, "消息处理失败")

    def _create_message_and_get_reply(self, conversation_id, query, context):
        """创建消息并获取回复"""
        try:
            message = self.coze_client.conversations.messages.create(
                conversation_id=conversation_id,
                content=query,
                role="user",
                content_type="object_string"
            )
            self.logger.debug(f"消息已创建: {message.id}")

            # 获取用户ID
            user_id = context.kwargs.get("from_uid")

            chat = self.coze_client.chat.create_and_poll(
                conversation_id=conversation_id,
                bot_id=self.bot_id,
                user_id=user_id,
                additional_messages=[message],
                auto_save_history=True
            )


            for messages in chat.messages:
                if messages.type.value == MessageType.ANSWER:
                    if messages.content_type.value == MessageContentType.TEXT:
                        text_reply = Reply(ReplyType.TEXT, messages.content)

                        return text_reply                    
            return Reply(ReplyType.TEXT, "未能获取到回复")
        except Exception as e:
            self.logger.error(f"消息处理失败: {str(e)}")
            return Reply(ReplyType.TEXT, "请求处理超时")