@echo off
:: 静默启动模式 - 不显示控制台窗口

:: 检查Python是否安装
python --version >nul 2>&1
if errorlevel 1 (
    exit /b 1
)

:: 检查当前目录是否正确
if not exist "app.py" (
    exit /b 1
)

:: 使用pythonw静默启动（不显示控制台窗口）
start "" pythonw app.py