import sqlite3
from sqlite3 import Error
from typing import Optional
import os
from pathlib import Path
from utils.logger import get_logger
import time


class DifyUserSessionManager:
    def __init__(self, db_path: str = "logs/dify_user_session.db"):
        self.db_path = Path(db_path)
        self._init_db()
        self.logger = get_logger()

    def _init_db(self):
        """初始化数据库和表结构"""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._get_connection() as conn:
            try:
                conn.execute('''PRAGMA foreign_keys = ON''')
                conn.execute('''PRAGMA journal_mode = WAL''')
                conn.execute('''PRAGMA synchronous = NORMAL''')
                
                conn.execute('''CREATE TABLE IF NOT EXISTS dify_user_sessions (
                                user_id TEXT PRIMARY KEY,
                                conversation_id TEXT NOT NULL,
                                created_at INTEGER NOT NULL,
                                updated_at INTEGER NOT NULL
                            )''')
                conn.commit()
            except Error as e:
                self.logger.error(f"初始化Dify数据库失败: {str(e)}")

    def _get_connection(self):
        """获取数据库连接"""
        return sqlite3.connect(self.db_path)

    def create_session(self, user_id: str, conversation_id: str) -> bool:
        """创建或更新用户会话"""
        with self._get_connection() as conn:
            try:
                current_time = int(time.time())
                conn.execute('''INSERT OR REPLACE INTO dify_user_sessions 
                             (user_id, conversation_id, created_at, updated_at)
                             VALUES (?, ?, ?, ?)''',
                          (user_id, conversation_id, current_time, current_time))
                conn.commit()
                return True
            except Error as e:
                self.logger.error(f"创建Dify会话失败: {str(e)}")
                return False

    def get_session(self, user_id: str) -> Optional[str]:
        """获取用户会话ID"""
        with self._get_connection() as conn:
            try:
                cursor = conn.execute('''SELECT conversation_id 
                                      FROM dify_user_sessions 
                                      WHERE user_id = ?''', (user_id,))
                result = cursor.fetchone()
                return result[0] if result else None
            except Error as e:
                self.logger.error(f"获取Dify会话失败: {str(e)}")
                return None

    def update_session_time(self, user_id: str) -> bool:
        """更新会话时间"""
        with self._get_connection() as conn:
            try:
                conn.execute('''UPDATE dify_user_sessions 
                             SET updated_at = ? 
                             WHERE user_id = ?''', 
                          (int(time.time()), user_id))
                conn.commit()
                return True
            except Error as e:
                self.logger.error(f"更新Dify会话时间失败: {str(e)}")
                return False

    def delete_session(self, user_id: str) -> bool:
        """删除用户会话"""
        with self._get_connection() as conn:
            try:
                conn.execute('''DELETE FROM dify_user_sessions 
                             WHERE user_id = ?''', (user_id,))
                conn.commit()
                return True
            except Error as e:
                self.logger.error(f"删除Dify会话失败: {str(e)}")
                return False

    def get_all_sessions(self) -> list:
        """获取所有会话"""
        with self._get_connection() as conn:
            try:
                cursor = conn.execute('''SELECT user_id, conversation_id, created_at, updated_at 
                                      FROM dify_user_sessions 
                                      ORDER BY updated_at DESC''')
                return cursor.fetchall()
            except Error as e:
                self.logger.error(f"获取所有Dify会话失败: {str(e)}")
                return []