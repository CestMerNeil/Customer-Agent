import requests
import json
from Agent.bot import Bot
from bridge.context import Context
from bridge.reply import Reply, ReplyType
from utils.logger import get_logger
from config import Config as conf


class LMStudioBot(Bot):
    def __init__(self):
        super().__init__()
        self.logger = get_logger("LMStudioBot")
        self.api_base = conf().get("lmstudio_api_base", "http://localhost:1234/v1")
        self.model = conf().get("lmstudio_model", "local-model")
        self.max_tokens = conf().get("lmstudio_max_tokens", 1000)
        self.temperature = conf().get("lmstudio_temperature", 0.7)
        
    def reply(self, context: Context) -> Reply:
        try:
            query = context.content
            
            # 构建请求数据
            data = {
                "model": self.model,
                "messages": [
                    {
                        "role": "user",
                        "content": query
                    }
                ],
                "max_tokens": self.max_tokens,
                "temperature": self.temperature,
                "stream": False
            }
            
            # 发送请求到LM Studio
            response = self._send_request(data)
            
            if response and "choices" in response and len(response["choices"]) > 0:
                reply_content = response["choices"][0]["message"]["content"]
                self.logger.info(f"LM Studio回复: {reply_content[:100]}...")
                return Reply(ReplyType.TEXT, reply_content)
            else:
                self.logger.error("LM Studio返回格式异常")
                return Reply(ReplyType.TEXT, "抱歉，我现在无法回复您的消息")
                
        except Exception as e:
            self.logger.error(f"LM Studio处理消息异常: {str(e)}", exc_info=True)
            return Reply(ReplyType.TEXT, "消息处理失败，请稍后重试")
    
    def _send_request(self, data):
        """发送请求到LM Studio API"""
        try:
            url = f"{self.api_base}/chat/completions"
            headers = {
                "Content-Type": "application/json"
            }
            
            self.logger.debug(f"发送请求到LM Studio: {url}")
            response = requests.post(
                url, 
                headers=headers, 
                json=data, 
                timeout=30
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                self.logger.error(f"LM Studio API请求失败: {response.status_code}, {response.text}")
                return None
                
        except requests.exceptions.Timeout:
            self.logger.error("LM Studio API请求超时")
            return None
        except requests.exceptions.ConnectionError:
            self.logger.error("无法连接到LM Studio服务")
            return None
        except Exception as e:
            self.logger.error(f"LM Studio API请求异常: {str(e)}")
            return None