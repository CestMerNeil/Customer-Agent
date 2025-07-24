@echo off
chcp 65001 >nul
title Customer Agent - 启动器

:: 设置窗口大小和颜色
mode con cols=80 lines=25
color 0A

:main_menu
cls
echo.
echo     ╔══════════════════════════════════════════════════════════════╗
echo     ║                    Customer Agent                            ║
echo     ║                   AI客服系统启动器                           ║
echo     ╚══════════════════════════════════════════════════════════════╝
echo.
echo     ┌──────────────────────────────────────────────────────────────┐
echo     │  🚀 启动选项                                                │
echo     │                                                              │
echo     │  1. 启动程序 (标准模式)                                      │
echo     │  2. 启动程序 (静默模式)                                      │
echo     │  3. 启动程序 (调试模式)                                      │
echo     │                                                              │
echo     │  🔧 工具选项                                                │
echo     │                                                              │
echo     │  4. 首次安装依赖                                            │
echo     │  5. 检查系统环境                                            │
echo     │  6. 测试LM Studio                                           │
echo     │  7. 创建桌面快捷方式                                        │
echo     │                                                              │
echo     │  📋 其他选项                                                │
echo     │                                                              │
echo     │  8. 查看日志                                                │
echo     │  9. 打开配置文件                                            │
echo     │  0. 退出                                                    │
echo     └──────────────────────────────────────────────────────────────┘
echo.
set /p choice=     请选择操作 (0-9): 

if "%choice%"=="1" goto start_standard
if "%choice%"=="2" goto start_silent
if "%choice%"=="3" goto start_debug
if "%choice%"=="4" goto install_deps
if "%choice%"=="5" goto check_env
if "%choice%"=="6" goto test_lm
if "%choice%"=="7" goto create_shortcut
if "%choice%"=="8" goto view_logs
if "%choice%"=="9" goto open_config
if "%choice%"=="0" goto exit_program

echo.
echo     ❌ 无效选项，请重新选择
timeout /t 2 >nul
goto main_menu

:start_standard
cls
echo.
echo     🚀 启动程序 (标准模式)
echo     ═══════════════════════════════════════
echo.
call "启动软件.bat"
echo.
echo     按任意键返回主菜单...
pause >nul
goto main_menu

:start_silent
cls
echo.
echo     🚀 启动程序 (静默模式)
echo     ═══════════════════════════════════════
echo.
echo     程序将在后台启动，不显示控制台窗口
call "启动软件-静默模式.bat"
echo     ✅ 程序已启动
echo.
echo     按任意键返回主菜单...
pause >nul
goto main_menu

:start_debug
cls
echo.
echo     🚀 启动程序 (调试模式)
echo     ═══════════════════════════════════════
echo.
echo     调试信息将显示在控制台中
set PYTHONPATH=%cd%
python -u app.py
echo.
echo     按任意键返回主菜单...
pause >nul
goto main_menu

:install_deps
cls
echo.
echo     🔧 安装依赖包
echo     ═══════════════════════════════════════
echo.
call "首次安装依赖.bat"
echo.
echo     按任意键返回主菜单...
pause >nul
goto main_menu

:check_env
cls
echo.
echo     🔧 检查系统环境
echo     ═══════════════════════════════════════
echo.
call "检查系统环境.bat"
echo.
echo     按任意键返回主菜单...
pause >nul
goto main_menu

:test_lm
cls
echo.
echo     🔧 测试LM Studio连接
echo     ═══════════════════════════════════════
echo.
if exist "test_lmstudio.py" (
    python test_lmstudio.py
) else (
    echo     ❌ test_lmstudio.py 文件不存在
)
echo.
echo     按任意键返回主菜单...
pause >nul
goto main_menu

:create_shortcut
cls
echo.
echo     🔧 创建桌面快捷方式
echo     ═══════════════════════════════════════
echo.
call "创建桌面快捷方式.bat"
echo.
echo     按任意键返回主菜单...
pause >nul
goto main_menu

:view_logs
cls
echo.
echo     📋 查看日志文件
echo     ═══════════════════════════════════════
echo.
if exist "logs\app.log" (
    echo     最新日志内容:
    echo     ─────────────────────────────────────
    powershell "Get-Content 'logs\app.log' -Tail 20"
    echo     ─────────────────────────────────────
    echo.
    echo     完整日志文件位置: logs\app.log
) else (
    echo     ❌ 日志文件不存在
)
echo.
echo     按任意键返回主菜单...
pause >nul
goto main_menu

:open_config
cls
echo.
echo     📋 打开配置文件
echo     ═══════════════════════════════════════
echo.
if exist "config.json" (
    echo     正在打开配置文件...
    start notepad config.json
    echo     ✅ 配置文件已在记事本中打开
) else (
    echo     ❌ config.json 文件不存在
)
echo.
echo     按任意键返回主菜单...
pause >nul
goto main_menu

:exit_program
cls
echo.
echo     👋 感谢使用 Customer Agent
echo.
echo     再见！
timeout /t 2 >nul
exit /b 0