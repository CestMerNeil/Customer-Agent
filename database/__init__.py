"""
数据库模块初始化文件

此模块导出数据库管理器实例，确保整个应用程序使用同一个实例
"""

from database.db_manager import DatabaseManager

# 导出数据库管理器实例
db_manager = DatabaseManager() 