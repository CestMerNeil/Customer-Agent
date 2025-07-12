#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
日志模块 - 提供全局日志功能
"""

import os
import sys
import logging
from logging.handlers import RotatingFileHandler

# 日志级别映射
log_levels = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
    "critical": logging.CRITICAL
}

# 默认配置
DEFAULT_LOG_LEVEL = "info"
DEFAULT_LOG_FORMAT = "%(asctime)s - %(levelname)s - %(filename)s:%(lineno)d - %(message)s"
DEFAULT_LOG_FILE = "logs/app.log"
MAX_LOG_SIZE = 10 * 1024 * 1024  # 10MB
BACKUP_COUNT = 5

# 确保日志目录存在
os.makedirs(os.path.dirname(DEFAULT_LOG_FILE), exist_ok=True)

# 全局日志级别设置
log_level = os.environ.get("LOG_LEVEL", DEFAULT_LOG_LEVEL).lower()
global_log_level = log_levels.get(log_level, logging.INFO)

# 创建一个名为 'app' 的父logger
logger = logging.getLogger("app")
logger.setLevel(global_log_level)
logger.propagate = False # 不向root logger传播

# 只给父logger配置handlers
if not logger.handlers:
    # 控制台处理器
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(logging.Formatter(DEFAULT_LOG_FORMAT))
    logger.addHandler(console_handler)
    
    # 文件处理器
    try:
        file_handler = RotatingFileHandler(
            DEFAULT_LOG_FILE,
            maxBytes=MAX_LOG_SIZE,
            backupCount=BACKUP_COUNT,
            encoding="utf-8"
        )
        file_handler.setFormatter(logging.Formatter(DEFAULT_LOG_FORMAT))
        logger.addHandler(file_handler)
    except Exception as e:
        logger.warning(f"无法创建日志文件处理器: {str(e)}", exc_info=True)

def get_logger(name=None):
    """
    获取一个 'app' logger的子logger.
    
    日志消息会通过这个子logger传播到父logger 'app',
    然后由 'app' logger的处理器(包括UI处理器)来处理.
    
    Args:
        name: logger名称, 如果为None则使用调用模块的名称.
        
    Returns:
        logging.Logger: 配置好的子logger实例.
    """
    if name is None:
        # 获取调用者的模块名
        import inspect
        frame = inspect.currentframe().f_back
        name = frame.f_globals.get('__name__', 'unknown')
        
        # 如果是__main__, 使用文件名
        if name == '__main__':
            filename = frame.f_globals.get('__file__', 'main')
            name = os.path.splitext(os.path.basename(filename))[0]

    # 所有获取的logger都是'app'的子logger
    child_logger = logging.getLogger(f"app.{name}")
    return child_logger

# 导出全局日志对象和获取logger的函数
__all__ = ["logger", "get_logger"]