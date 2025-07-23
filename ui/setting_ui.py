# 设置界面

import json
import os
from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (QFrame, QHBoxLayout, QVBoxLayout, QWidget, QLabel, 
                            QFormLayout, QGroupBox, QMessageBox)
from PyQt6.QtGui import QFont
from qfluentwidgets import (CardWidget, SubtitleLabel, CaptionLabel, BodyLabel, 
                           PrimaryPushButton, PushButton, StrongBodyLabel, 
                           LineEdit, ComboBox, ScrollArea, FluentIcon as FIF,
                           InfoBar, InfoBarPosition, TextEdit, PasswordLineEdit,
                           TimePicker)
from PyQt6.QtCore import QTime
from utils.logger import get_logger
from config import config


class AIServiceCard(CardWidget):
    """AI服务选择卡片"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setupUI()
    
    def setupUI(self):
        """设置UI"""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 16, 20, 16)
        layout.setSpacing(16)
        
        # 卡片标题
        title_label = StrongBodyLabel("AI 服务选择")
        title_label.setFont(QFont("Microsoft YaHei", 12, QFont.Weight.Bold))
        layout.addWidget(title_label)
        
        # 表单布局
        form_layout = QFormLayout()
        form_layout.setSpacing(12)
        form_layout.setLabelAlignment(Qt.AlignmentFlag.AlignLeft)
        form_layout.setFieldGrowthPolicy(QFormLayout.FieldGrowthPolicy.ExpandingFieldsGrow)
        form_layout.setFormAlignment(Qt.AlignmentFlag.AlignLeft)
        
        # AI服务选择下拉框
        self.bot_type_combo = ComboBox()
        self.bot_type_combo.addItems(["coze", "dify"])
        self.bot_type_combo.setCurrentText("dify")
        self.bot_type_combo.currentTextChanged.connect(self.onBotTypeChanged)
        form_layout.addRow("AI 服务类型:", self.bot_type_combo)
        
        layout.addLayout(form_layout)
        
        # 说明文本
        description_label = CaptionLabel(
            "选择要使用的AI服务：\n"
            "• Coze - 字节跳动的AI对话平台\n"
            "• Dify - 开源的LLM应用开发平台"
        )
        description_label.setStyleSheet("color: #666; padding: 8px 0;")
        layout.addWidget(description_label)
    
    def onBotTypeChanged(self, bot_type):
        """AI服务类型改变时的回调"""
        # 通知父组件更新配置卡片显示
        parent = self.parent()
        while parent:
            if hasattr(parent, 'onAIServiceChanged'):
                parent.onAIServiceChanged(bot_type)
                break
            parent = parent.parent()
    
    def getConfig(self) -> dict:
        """获取配置"""
        return {
            "bot_type": self.bot_type_combo.currentText()
        }
    
    def setConfig(self, config: dict):
        """设置配置"""
        bot_type = config.get("bot_type", "dify")
        self.bot_type_combo.setCurrentText(bot_type)


class CozeConfigCard(CardWidget):
    """Coze配置卡片"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setupUI()
    
    def setupUI(self):
        """设置UI"""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 16, 20, 16)
        layout.setSpacing(16)
        
        # 卡片标题
        title_label = StrongBodyLabel("Coze AI 配置")
        title_label.setFont(QFont("Microsoft YaHei", 12, QFont.Weight.Bold))
        layout.addWidget(title_label)
        
        # 表单布局
        form_layout = QFormLayout()
        form_layout.setSpacing(12)
        form_layout.setLabelAlignment(Qt.AlignmentFlag.AlignLeft)
        form_layout.setFieldGrowthPolicy(QFormLayout.FieldGrowthPolicy.ExpandingFieldsGrow)
        form_layout.setFormAlignment(Qt.AlignmentFlag.AlignLeft)
        
        # API Base URL
        self.api_base_edit = LineEdit()
        self.api_base_edit.setPlaceholderText("https://api.coze.cn")
        self.api_base_edit.setText("https://api.coze.cn")
        form_layout.addRow("API Base URL:", self.api_base_edit)
        
        # API Token
        self.api_token_edit = PasswordLineEdit()
        self.api_token_edit.setPlaceholderText("输入您的 Coze API Token")
        form_layout.addRow("API Token:", self.api_token_edit)
        
        # Bot ID
        self.bot_id_edit = LineEdit()
        self.bot_id_edit.setPlaceholderText("输入您的 Bot ID")
        form_layout.addRow("Bot ID:", self.bot_id_edit)
                
        layout.addLayout(form_layout)
        
        # 说明文本
        description_label = CaptionLabel(
            "请在 Coze 平台获取您的 API Token 和 Bot ID。\n"
            "API Token 用于身份验证，Bot ID 用于指定使用的特定机器人。"
        )
        description_label.setStyleSheet("color: #666; padding: 8px 0;")
        layout.addWidget(description_label)
    
    def getConfig(self) -> dict:
        """获取配置"""
        return {
            "coze_api_base": self.api_base_edit.text().strip() or "https://api.coze.cn",
            "coze_token": self.api_token_edit.text().strip(),
            "coze_bot_id": self.bot_id_edit.text().strip()
        }
    
    def setConfig(self, config: dict):
        """设置配置"""
        self.api_base_edit.setText(config.get("coze_api_base", "https://api.coze.cn"))
        self.api_token_edit.setText(config.get("coze_token", ""))
        self.bot_id_edit.setText(config.get("coze_bot_id", ""))


class DifyConfigCard(CardWidget):
    """Dify配置卡片"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setupUI()
    
    def setupUI(self):
        """设置UI"""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 16, 20, 16)
        layout.setSpacing(16)
        
        # 卡片标题
        title_label = StrongBodyLabel("Dify AI 配置")
        title_label.setFont(QFont("Microsoft YaHei", 12, QFont.Weight.Bold))
        layout.addWidget(title_label)
        
        # 表单布局
        form_layout = QFormLayout()
        form_layout.setSpacing(12)
        form_layout.setLabelAlignment(Qt.AlignmentFlag.AlignLeft)
        form_layout.setFieldGrowthPolicy(QFormLayout.FieldGrowthPolicy.ExpandingFieldsGrow)
        form_layout.setFormAlignment(Qt.AlignmentFlag.AlignLeft)
        
        # API Base URL
        self.api_base_edit = LineEdit()
        self.api_base_edit.setPlaceholderText("https://api.dify.ai/v1")
        self.api_base_edit.setText("https://api.dify.ai/v1")
        form_layout.addRow("API Base URL:", self.api_base_edit)
        
        # API Key
        self.api_key_edit = PasswordLineEdit()
        self.api_key_edit.setPlaceholderText("输入您的 Dify API Key")
        form_layout.addRow("API Key:", self.api_key_edit)
        
        # App ID (可选)
        self.app_id_edit = LineEdit()
        self.app_id_edit.setPlaceholderText("输入您的 App ID (可选)")
        form_layout.addRow("App ID:", self.app_id_edit)
                
        layout.addLayout(form_layout)
        
        # 说明文本
        description_label = CaptionLabel(
            "请在 Dify 平台获取您的 API Key。\n"
            "API Key 用于身份验证，App ID 为可选参数。"
        )
        description_label.setStyleSheet("color: #666; padding: 8px 0;")
        layout.addWidget(description_label)
    
    def getConfig(self) -> dict:
        """获取配置"""
        return {
            "dify_api_base": self.api_base_edit.text().strip() or "https://api.dify.ai/v1",
            "dify_api_key": self.api_key_edit.text().strip(),
            "dify_app_id": self.app_id_edit.text().strip()
        }
    
    def setConfig(self, config: dict):
        """设置配置"""
        self.api_base_edit.setText(config.get("dify_api_base", "https://api.dify.ai/v1"))
        self.api_key_edit.setText(config.get("dify_api_key", ""))
        self.app_id_edit.setText(config.get("dify_app_id", ""))


class BusinessHoursCard(CardWidget):
    """业务时间配置卡片"""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setupUI()
    
    def setupUI(self):
        """设置UI"""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(20, 16, 20, 16)
        layout.setSpacing(16)
        
        # 卡片标题
        title_label = StrongBodyLabel("业务时间设置")
        title_label.setFont(QFont("Microsoft YaHei", 12, QFont.Weight.Bold))
        layout.addWidget(title_label)
        
        # 表单布局
        form_layout = QFormLayout()
        form_layout.setSpacing(12)
        form_layout.setLabelAlignment(Qt.AlignmentFlag.AlignLeft)
        form_layout.setFieldGrowthPolicy(QFormLayout.FieldGrowthPolicy.ExpandingFieldsGrow)
        form_layout.setFormAlignment(Qt.AlignmentFlag.AlignLeft)
        
        # 开始时间
        self.start_time_picker = TimePicker()
        self.start_time_picker.setTime(QTime(8, 0))  # 默认8:00
        form_layout.addRow("开始时间:", self.start_time_picker)
        
        # 结束时间
        self.end_time_picker = TimePicker()
        self.end_time_picker.setTime(QTime(23, 0))  # 默认23:00
        form_layout.addRow("结束时间:", self.end_time_picker)
        
        layout.addLayout(form_layout)
        
        # 说明文本
        description_label = CaptionLabel(
            "设置AI客服的工作时间。在工作时间内，系统将自动响应客户消息。\n"
            "在非工作时间，系统将不会自动回复。"
        )
        description_label.setStyleSheet("color: #666; padding: 8px 0;")
        layout.addWidget(description_label)
    
    def getConfig(self) -> dict:
        """获取配置"""
        return {
            "businessHours": {
                "start": self.start_time_picker.getTime().toString("HH:mm"),
                "end": self.end_time_picker.getTime().toString("HH:mm")
            }
        }
    
    def setConfig(self, config: dict):
        """设置配置"""
        business_hours = config.get("businessHours", {})
        
        # 解析开始时间
        start_time_str = business_hours.get("start", "08:00")
        start_time = QTime.fromString(start_time_str, "HH:mm")
        if start_time.isValid():
            self.start_time_picker.setTime(start_time)
        
        # 解析结束时间
        end_time_str = business_hours.get("end", "23:00")
        end_time = QTime.fromString(end_time_str, "HH:mm")
        if end_time.isValid():
            self.end_time_picker.setTime(end_time)


class SettingUI(QFrame):
    """设置界面"""
    
    def __init__(self, parent=None):
        super().__init__(parent=parent)
        self.logger = get_logger("SettingUI")
        self.setupUI()
        self.loadConfig()
        
        # 设置对象名
        self.setObjectName("设置")
    
    def onAIServiceChanged(self, bot_type):
        """AI服务类型改变时的回调"""
        if bot_type == "coze":
            self.coze_config_card.show()
            self.dify_config_card.hide()
        elif bot_type == "dify":
            self.coze_config_card.hide()
            self.dify_config_card.show()
        else:
            # 默认显示Dify
            self.coze_config_card.hide()
            self.dify_config_card.show()
    
    def setupUI(self):
        """设置主界面UI"""
        # 主布局
        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(30, 30, 30, 30)
        main_layout.setSpacing(25)
        
        # 创建头部区域
        header_widget = self.createHeaderWidget()
        
        # 创建内容区域
        content_widget = self.createContentWidget()
        
        # 连接按钮信号
        self.save_btn.clicked.connect(self.onSaveConfig)
        self.reset_btn.clicked.connect(self.onResetConfig)
        
        # 添加到主布局
        main_layout.addWidget(header_widget)
        main_layout.addWidget(content_widget, 1)
    
    def createHeaderWidget(self):
        """创建头部区域"""
        header_widget = QWidget()
        header_layout = QHBoxLayout(header_widget)
        header_layout.setContentsMargins(0, 0, 0, 0)
        header_layout.setSpacing(20)
        
        # 标题
        title_label = SubtitleLabel("系统设置")
        title_label.setFont(QFont("Microsoft YaHei", 18, QFont.Weight.Bold))
        
        # 描述
        description_label = CaptionLabel("配置AI客服的基本参数和工作时间")
        description_label.setStyleSheet("color: #666;")
        
        # 左侧标题区域
        title_area = QWidget()
        title_layout = QVBoxLayout(title_area)
        title_layout.setContentsMargins(0, 0, 0, 0)
        title_layout.setSpacing(5)
        title_layout.addWidget(title_label)
        title_layout.addWidget(description_label)
        
        # 按钮区域
        buttons_widget = QWidget()
        buttons_layout = QHBoxLayout(buttons_widget)
        buttons_layout.setContentsMargins(0, 0, 0, 0)
        buttons_layout.setSpacing(10)
        
        # 重置按钮
        self.reset_btn = PushButton("重置")
        self.reset_btn.setIcon(FIF.UPDATE)
        self.reset_btn.setFixedSize(80, 40)
        
        # 保存按钮
        self.save_btn = PrimaryPushButton("保存")
        self.save_btn.setIcon(FIF.SAVE)
        self.save_btn.setFixedSize(100, 40)
        
        buttons_layout.addWidget(self.reset_btn)
        buttons_layout.addWidget(self.save_btn)
        
        # 添加到头部布局
        header_layout.addWidget(title_area)
        header_layout.addStretch()
        header_layout.addWidget(buttons_widget)
        
        return header_widget
    
    def createContentWidget(self):
        """创建内容区域"""
        # 滚动区域
        scroll_area = ScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        scroll_area.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        
        # 去除边框
        scroll_area.setStyleSheet("""
            ScrollArea {
                border: none;
                background-color: transparent;
            }
        """)
        
        # 内容容器
        content_container = QWidget()
        content_layout = QVBoxLayout(content_container)
        content_layout.setSpacing(20)
        content_layout.setContentsMargins(20, 20, 20, 20)
        content_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        
        # 创建配置卡片
        self.ai_service_card = AIServiceCard(self)
        self.coze_config_card = CozeConfigCard()
        self.dify_config_card = DifyConfigCard()
        self.business_hours_card = BusinessHoursCard()
        
        # 添加到布局
        content_layout.addWidget(self.ai_service_card)
        content_layout.addWidget(self.coze_config_card)
        content_layout.addWidget(self.dify_config_card)
        content_layout.addWidget(self.business_hours_card)
        content_layout.addStretch()
        
        # 设置容器样式
        content_container.setStyleSheet("""
            QWidget {
                background-color: transparent;
                border: none;
            }
        """)
        
        scroll_area.setWidget(content_container)
        
        return scroll_area
    
    def loadConfig(self):
        """从config模块加载配置"""
        try:            
            loaded_config = {
                "bot_type": config.get("bot_type", "dify"),
                "coze_api_base": config.get("coze_api_base", "https://api.coze.cn"),
                "coze_token": config.get("coze_token", ""),
                "coze_bot_id": config.get("coze_bot_id", ""),
                "dify_api_base": config.get("dify_api_base", "https://api.dify.ai/v1"),
                "dify_api_key": config.get("dify_api_key", ""),
                "dify_app_id": config.get("dify_app_id", ""),
                "businessHours": config.get("businessHours", {"start": "08:00", "end": "23:00"})
            }
            
            # 验证并设置配置
            self._validateAndSetConfig(loaded_config)
            self.logger.info("配置加载成功")
            
        except Exception as e:
            self.logger.error(f"加载配置失败: {e}")
            QMessageBox.warning(self, "加载失败", f"加载配置失败：{str(e)}")
            self._loadDefaultConfig()
    
    def _loadDefaultConfig(self):
        """加载默认配置"""
        default_config = {
            "bot_type": "dify",
            "coze_api_base": "https://api.coze.cn",
            "coze_token": "",
            "coze_bot_id": "",
            "dify_api_base": "https://api.dify.ai/v1",
            "dify_api_key": "",
            "dify_app_id": "",
            "businessHours": {
                "start": "08:00",
                "end": "23:00"
            }
        }
        
        self.ai_service_card.setConfig(default_config)
        self.coze_config_card.setConfig(default_config)
        self.dify_config_card.setConfig(default_config)
        self.business_hours_card.setConfig(default_config)
        self.logger.info("已加载默认配置")
    
    def _validateAndSetConfig(self, config_data):
        """验证并设置配置"""
        # 确保必要的字段存在
        validated_config = {
            "bot_type": config_data.get("bot_type", "dify"),
            "coze_api_base": config_data.get("coze_api_base", "https://api.coze.cn"),
            "coze_token": config_data.get("coze_token", ""),
            "coze_bot_id": config_data.get("coze_bot_id", ""),
            "dify_api_base": config_data.get("dify_api_base", "https://api.dify.ai/v1"),
            "dify_api_key": config_data.get("dify_api_key", ""),
            "dify_app_id": config_data.get("dify_app_id", ""),
            "businessHours": config_data.get("businessHours", {"start": "08:00", "end": "23:00"})
        }
        
        # 验证businessHours格式
        business_hours = validated_config["businessHours"]
        if not isinstance(business_hours, dict):
            business_hours = {"start": "08:00", "end": "23:00"}
            validated_config["businessHours"] = business_hours
        
        if "start" not in business_hours:
            business_hours["start"] = "08:00"
        if "end" not in business_hours:
            business_hours["end"] = "23:00"
        
        # 设置到界面
        self.ai_service_card.setConfig(validated_config)
        self.coze_config_card.setConfig(validated_config)
        self.dify_config_card.setConfig(validated_config)
        self.business_hours_card.setConfig(validated_config)
        
        # 根据bot_type显示对应的配置卡片
        self.onAIServiceChanged(validated_config.get("bot_type", "dify"))
    
    def onSaveConfig(self):
        """保存配置到config模块"""
        try:
            # 获取配置
            ai_service_config = self.ai_service_card.getConfig()
            coze_config = self.coze_config_card.getConfig()
            dify_config = self.dify_config_card.getConfig()
            business_config = self.business_hours_card.getConfig()
            
            # 合并配置
            new_config = {**ai_service_config, **coze_config, **dify_config, **business_config}
            
            # 根据选择的AI服务验证必填项
            bot_type = new_config.get("bot_type", "dify")
            
            if bot_type == "coze":
                if not new_config.get("coze_token"):
                    QMessageBox.warning(self, "配置错误", "请输入 Coze API Token！")
                    return
                
                if not new_config.get("coze_bot_id"):
                    QMessageBox.warning(self, "配置错误", "请输入 Bot ID！")
                    return
            
            elif bot_type == "dify":
                if not new_config.get("dify_api_key"):
                    QMessageBox.warning(self, "配置错误", "请输入 Dify API Key！")
                    return
            
            # 验证时间设置
            start_time = self.business_hours_card.start_time_picker.getTime()
            end_time = self.business_hours_card.end_time_picker.getTime()
            
            if start_time >= end_time:
                QMessageBox.warning(self, "时间设置错误", "开始时间必须早于结束时间！")
                return
            
            # 使用config模块保存配置
            config.update(new_config, save=True)
            
            self.logger.info("配置保存成功")
            
            # 显示成功消息
            InfoBar.success(
                title="保存成功",
                content="配置已保存！",
                orient=Qt.Orientation.Horizontal,
                isClosable=True,
                position=InfoBarPosition.TOP,
                duration=2000,
                parent=self
            )
            
        except Exception as e:
            self.logger.error(f"保存配置失败: {e}")
            QMessageBox.critical(self, "保存失败", f"保存配置时发生错误：{str(e)}")
    
    def onResetConfig(self):
        """重置配置"""
        reply = QMessageBox.question(
            self,
            "确认重置",
            "确定要重置所有配置吗？\n这将重新加载配置文件中的原始设置。",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No
        )
        
        if reply == QMessageBox.StandardButton.Yes:
            try:
                # 使用config模块重新加载配置文件
                config.reload()
                self.loadConfig()
                self.logger.info("配置已重置")
                
                InfoBar.success(
                    title="重置成功",
                    content="配置已重置为配置文件中的设置！",
                    orient=Qt.Orientation.Horizontal,
                    isClosable=True,
                    position=InfoBarPosition.TOP,
                    duration=2000,
                    parent=self
                )
            except Exception as e:
                self.logger.error(f"重置配置失败: {e}")
                QMessageBox.critical(self, "重置失败", f"重置配置失败：{str(e)}")
    
 