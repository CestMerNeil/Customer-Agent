@echo off
chcp 65001 >nul
title Customer Agent - 开发者工具

:menu
cls
echo ========================================
echo    Customer Agent - 开发者工具
echo ========================================
echo.
echo 请选择操作:
echo.
echo 1. 启动程序 (正常模式)
echo 2. 启动程序 (调试模式)
echo 3. 测试LM Studio连接
echo 4. 查看日志文件
echo 5. 清理日志文件
echo 6. 重新安装依赖
echo 7. 检查系统环境
echo 8. 退出
echo.
set /p choice=请输入选项 (1-8): 

if "%choice%"=="1" goto start_normal
if "%choice%"=="2" goto start_debug
if "%choice%"=="3" goto test_lmstudio
if "%choice%"=="4" goto view_logs
if "%choice%"=="5" goto clean_logs
if "%choice%"=="6" goto reinstall_deps
if "%choice%"=="7" goto check_env
if "%choice%"=="8" goto exit

echo 无效选项，请重新选择
pause
goto menu

:start_normal
echo.
echo [信息] 启动程序 (正常模式)...
python app.py
pause
goto menu

:start_debug
echo.
echo [信息] 启动程序 (调试模式)...
echo 调试信息将显示在控制台中
set PYTHONPATH=%cd%
python -u app.py
pause
goto menu

:test_lmstudio
echo.
echo [信息] 测试LM Studio连接...
if exist "test_lmstudio.py" (
    python test_lmstudio.py
) else (
    echo test_lmstudio.py 文件不存在
)
pause
goto menu

:view_logs
echo.
echo [信息] 查看日志文件...
if exist "logs\app.log" (
    type "logs\app.log"
) else (
    echo 日志文件不存在
)
pause
goto menu

:clean_logs
echo.
echo [信息] 清理日志文件...
if exist "logs" (
    del /q "logs\*.log" 2>nul
    echo 日志文件已清理
) else (
    echo logs目录不存在
)
pause
goto menu

:reinstall_deps
echo.
echo [信息] 重新安装依赖...
pip install -r requirements.txt --force-reinstall
pause
goto menu

:check_env
echo.
call "检查系统环境.bat"
goto menu

:exit
echo.
echo 再见！
exit /b 0