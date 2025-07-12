from .base_request import BaseRequest
from typing import Dict, Any


class SendMessage(BaseRequest):
    def __init__(self, shop_id: str, user_id: str, channel_name: str = "pinduoduo"):
        super().__init__(shop_id, user_id, channel_name)
        
        # 检查账户信息是否正确加载
        if not hasattr(self, 'account_name'):
            self.logger.error(f"无法在数据库中找到账户: shop_id={shop_id}, user_id={user_id}")
            raise ValueError("找不到指定的账户信息")

    def send_text(self, recipient_uid, message_content):
        """
        发送文本消息
        """
        url = "https://mms.pinduoduo.com/plateau/chat/send_message"
        data = {
            "data": {
                "cmd": "send_message",
                "request_id": self.generate_request_id(),
                "message": {
                    "to": {
                        "role": "user",
                        "uid": recipient_uid
                    },
                    "from": {
                        "role": "mall_cs"
                    },
                    "content": message_content,
                    "msg_id": None,
                    "type": 0,
                    "is_aut": 0,
                    "manual_reply": 1,
                },
            },
            "client": "WEB"
        }

        result = self.post(url, json_data=data)
        if result and result.get("success") == True:
            if result.get("result", {}).get("error_code") == 10002:
                error_msg = result.get('result', {}).get('error')
                self.logger.error(f"发送文本消息失败: {error_msg}")
                return error_msg
            else:
                return result
        else:
            self.logger.error(f"发送文本消息失败: {result}")
            return None

 
        
    def send_image(self, recipient_uid, image_url):
        """
        发送图片消息
        """
        url = "https://mms.pinduoduo.com/plateau/chat/send_message"
        data = {
            "data": {
                "cmd": "send_message",
                "request_id": self.generate_request_id(),
                "message": {
                    "to": {
                        "role": "user",
                        "uid": recipient_uid
                    },
                    "from": {
                        "role": "mall_cs"
                    },
                    "content": image_url,
                    "msg_id": None,
                    "chat_type": "cs",
                    "type": 1,
                    "is_aut": 0,
                    "manual_reply": 1,
                }
            },
            "client": "WEB"
        }

        result = self.post(url, json_data=data)
        if result:
            self.logger.debug(f"发送图片消息成功: {result}")
            return result


    def send_mallGoodsCard(self, recipient_uid, goods_id):
        """
        发送商城商品卡片消息
        """
        url = "https://mms.pinduoduo.com/plateau/message/send/mallGoodsCard"
        data = {
            "uid": recipient_uid,
            "goods_id": goods_id,
            "biz_type": 3
        }

        result = self.post(url, json_data=data)
        if result:
            self.logger.debug(f"发送商城商品卡片消息成功: {result}")
            return result


    def getAssignCsList(self):
        """
        获取分配的客服列表
        """
        url = "https://mms.pinduoduo.com/latitude/assign/getAssignCsList"
        data = {"wechatCheck": True}
        
        result = self.post(url, json_data=data)
        if result and result.get('success'):
            return result['result']['csList']
        else:
            error_msg = result.get('result', {}).get('error') if result else "请求失败"
            self.logger.error(f"获取分配的客服列表失败: {error_msg}")
            return None


    def move_conversation(self, recipient_uid, cs_uid):
        """
        转移会话
        """
        url = "https://mms.pinduoduo.com/plateau/chat/move_conversation"
        data = {
            "data": {
                "cmd": "move_conversation",
                "request_id": self.generate_request_id(),
                "conversation": {
                    "csid": cs_uid,
                    "uid": recipient_uid,
                    "need_wx": False,
                    "remark": "无原因直接转移"
                }
            },
            "client": "WEB"
        }
        
        result = self.post(url, json_data=data)
        if result:
            self.logger.debug(f"转移会话成功: {result}")
            return result
