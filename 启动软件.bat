@echo off
chcp 65001 >nul
title Customer Agent - AI客服系统

echo ========================================
echo    Customer Agent - AI客服系统
echo ========================================
echo.

:: 检查Python是否安装
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到Python，请先安装Python 3.8+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [信息] Python环境检查通过
echo.

:: 检查当前目录是否正确
if not exist "app.py" (
    echo [错误] 未找到app.py文件，请确保在正确的目录下运行此脚本
    pause
    exit /b 1
)

echo [信息] 正在启动AI客服系统...
echo.

:: 启动应用程序
python app.py

:: 如果程序异常退出，显示错误信息
if errorlevel 1 (
    echo.
    echo [错误] 程序异常退出，错误代码: %errorlevel%
    echo 请检查日志文件: logs\app.log
    pause
)