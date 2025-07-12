import sys
import ctypes
from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import QApplication

from ui.main_ui import MainWindow
from utils.logger import get_logger

def main():
    """ 应用程序主函数 """
    logger = get_logger("App")
    logger.info("应用程序启动...")

    # 启用高分屏支持
    if hasattr(Qt.ApplicationAttribute, 'AA_EnableHighDpiScaling'):
        QApplication.setAttribute(Qt.ApplicationAttribute.AA_EnableHighDpiScaling)
    if hasattr(Qt.ApplicationAttribute, 'AA_UseHighDpiPixmaps'):
        QApplication.setAttribute(Qt.ApplicationAttribute.AA_UseHighDpiPixmaps)

    app = QApplication(sys.argv)
    
    # 在Windows上设置AppUserModelID，以确保任务栏图标正确显示
    try:
        if sys.platform == "win32":
            ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("my.company.my.product.version")
    except Exception as e:
        logger.warning(f"设置AppUserModelID失败: {e}")

    # 初始化并显示主窗口
    window = MainWindow()
    window.show()

    # 运行事件循环
    sys.exit(app.exec())

if __name__ == '__main__':
    main()
