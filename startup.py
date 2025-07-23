#!/usr/bin/env python3
"""
应用启动脚本
处理 Playwright 浏览器驱动的自动安装和应用启动
"""

import sys
import os
import subprocess
from pathlib import Path

def ensure_playwright_browsers():
    """确保 Playwright 浏览器已安装"""
    try:
        print("🔍 检查浏览器驱动...")
        
        # 检查是否已安装浏览器
        import playwright
        from playwright.sync_api import sync_playwright
        
        with sync_playwright() as p:
            try:
                # 尝试启动浏览器
                browser = p.chromium.launch(headless=True)
                browser.close()
                print("✅ 浏览器驱动已就绪")
                return True
            except Exception as e:
                print(f"⚠️ 浏览器驱动需要安装: {e}")
                print("🌐 正在安装浏览器驱动，请稍候...")
                
                # 安装浏览器驱动
                result = subprocess.run([
                    sys.executable, "-m", "playwright", "install", "chrome"
                ], capture_output=True, text=True)
                
                if result.returncode == 0:
                    print("✅ 浏览器驱动安装成功")
                    return True
                else:
                    print(f"❌ 浏览器驱动安装失败: {result.stderr}")
                    return False
                    
    except ImportError as e:
        print(f"❌ Playwright 模块导入失败: {e}")
        return False
    except Exception as e:
        print(f"❌ 浏览器驱动检查失败: {e}")
        return False

def show_startup_dialog():
    """显示启动对话框"""
    try:
        from PyQt6.QtWidgets import QApplication, QMessageBox, QProgressDialog
        from PyQt6.QtCore import Qt, QTimer
        
        app = QApplication(sys.argv)
        
        # 创建进度对话框
        progress = QProgressDialog("正在初始化应用...", "取消", 0, 100)
        progress.setWindowTitle("拼多多智能客服系统")
        progress.setWindowModality(Qt.WindowModality.WindowModal)
        progress.setMinimumDuration(0)
        progress.show()
        
        # 模拟进度
        for i in range(101):
            progress.setValue(i)
            app.processEvents()
            if progress.wasCanceled():
                return False
        
        progress.close()
        return True
        
    except ImportError:
        # 如果 PyQt6 不可用，直接返回 True
        return True

def main():
    """主函数"""
    print("🚀 启动拼多多智能客服系统...")
    
    # 设置环境变量
    os.environ['PYTHONPATH'] = os.path.dirname(os.path.abspath(__file__))
    
    # 确保浏览器驱动已安装
    if not ensure_playwright_browsers():
        print("⚠️ 浏览器驱动安装失败，某些功能可能无法正常使用")
        
        # 询问用户是否继续
        try:
            from PyQt6.QtWidgets import QApplication, QMessageBox
            app = QApplication(sys.argv)
            
            reply = QMessageBox.question(
                None, 
                "警告", 
                "浏览器驱动安装失败，某些功能可能无法正常使用。\n\n是否继续启动应用？",
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
                QMessageBox.StandardButton.Yes
            )
            
            if reply == QMessageBox.StandardButton.No:
                print("❌ 用户取消启动")
                return
                
        except ImportError:
            # 如果无法显示对话框，继续启动
            pass
    
    try:
        # 导入并启动主应用
        print("🎯 启动主应用...")
        from app import main as app_main
        app_main()
        
    except ImportError as e:
        print(f"❌ 应用模块导入失败: {e}")
        
        # 尝试显示错误对话框
        try:
            from PyQt6.QtWidgets import QApplication, QMessageBox
            app = QApplication(sys.argv)
            
            QMessageBox.critical(
                None,
                "错误",
                f"应用启动失败:\n\n{e}\n\n请检查应用完整性或重新下载。"
            )
        except ImportError:
            pass
            
        sys.exit(1)
        
    except Exception as e:
        print(f"❌ 应用启动失败: {e}")
        
        # 尝试显示错误对话框
        try:
            from PyQt6.QtWidgets import QApplication, QMessageBox
            app = QApplication(sys.argv)
            
            QMessageBox.critical(
                None,
                "错误", 
                f"应用运行时错误:\n\n{e}\n\n请查看日志文件获取详细信息。"
            )
        except ImportError:
            pass
            
        sys.exit(1)

if __name__ == "__main__":
    main()