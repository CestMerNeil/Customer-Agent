@echo off
chcp 65001 >nul
title Customer Agent - 依赖安装

echo ========================================
echo    Customer Agent - 依赖安装
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
python --version
echo.

:: 检查pip是否可用
pip --version >nul 2>&1
if errorlevel 1 (
    echo [错误] pip不可用，请检查Python安装
    pause
    exit /b 1
)

echo [信息] pip检查通过
echo.

:: 检查requirements.txt是否存在
if not exist "requirements.txt" (
    echo [错误] 未找到requirements.txt文件
    pause
    exit /b 1
)

echo [信息] 开始安装依赖包...
echo 这可能需要几分钟时间，请耐心等待...
echo.

:: 升级pip
echo [步骤1/3] 升级pip...
python -m pip install --upgrade pip

echo.
echo [步骤2/3] 安装项目依赖...
:: 安装依赖
pip install -r requirements.txt

if errorlevel 1 (
    echo.
    echo [错误] 依赖安装失败，请检查网络连接或尝试使用国内镜像源
    echo 使用镜像源安装命令: pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple/
    pause
    exit /b 1
)

echo.
echo [步骤3/3] 验证安装...
python -c "import PyQt6; print('PyQt6安装成功')" 2>nul
if errorlevel 1 (
    echo [警告] PyQt6验证失败，可能需要手动安装
) else (
    echo [信息] 核心依赖验证通过
)

echo.
echo ========================================
echo    安装完成！
echo ========================================
echo.
echo 现在可以运行 "启动软件.bat" 来启动程序
echo.
pause