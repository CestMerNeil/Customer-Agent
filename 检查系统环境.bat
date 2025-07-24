@echo off
chcp 65001 >nul
title Customer Agent - 系统环境检查

echo ========================================
echo    Customer Agent - 系统环境检查
echo ========================================
echo.

:: 检查Python
echo [检查] Python环境...
python --version 2>nul
if errorlevel 1 (
    echo   ❌ Python未安装或不在PATH中
    echo   请从 https://www.python.org/downloads/ 下载安装Python 3.8+
) else (
    echo   ✅ Python已安装
)
echo.

:: 检查pip
echo [检查] pip包管理器...
pip --version 2>nul
if errorlevel 1 (
    echo   ❌ pip不可用
) else (
    echo   ✅ pip可用
)
echo.

:: 检查项目文件
echo [检查] 项目文件...
if exist "app.py" (
    echo   ✅ app.py 存在
) else (
    echo   ❌ app.py 不存在
)

if exist "requirements.txt" (
    echo   ✅ requirements.txt 存在
) else (
    echo   ❌ requirements.txt 不存在
)

if exist "config.json" (
    echo   ✅ config.json 存在
) else (
    echo   ❌ config.json 不存在
)
echo.

:: 检查关键依赖
echo [检查] 关键Python包...
python -c "import PyQt6; print('  ✅ PyQt6已安装')" 2>nul || echo   ❌ PyQt6未安装
python -c "import requests; print('  ✅ requests已安装')" 2>nul || echo   ❌ requests未安装
python -c "import sqlalchemy; print('  ✅ SQLAlchemy已安装')" 2>nul || echo   ❌ SQLAlchemy未安装
echo.

:: 检查日志目录
echo [检查] 日志目录...
if exist "logs" (
    echo   ✅ logs目录存在
) else (
    echo   ⚠️  logs目录不存在，程序运行时会自动创建
)
echo.

:: 检查Agent目录
echo [检查] Agent模块...
if exist "Agent" (
    echo   ✅ Agent目录存在
    if exist "Agent\CozeAgent" echo   ✅ CozeAgent模块存在
    if exist "Agent\DifyAgent" echo   ✅ DifyAgent模块存在
    if exist "Agent\LMStudioAgent" echo   ✅ LMStudioAgent模块存在
) else (
    echo   ❌ Agent目录不存在
)
echo.

echo ========================================
echo    检查完成
echo ========================================
echo.
echo 如果发现问题，请：
echo 1. 运行 "首次安装依赖.bat" 安装依赖
echo 2. 检查Python版本是否为3.8+
echo 3. 确保所有项目文件完整
echo.
pause