@echo off
chcp 65001 >nul
title Customer Agent - 创建桌面快捷方式

echo ========================================
echo    创建桌面快捷方式
echo ========================================
echo.

:: 获取当前目录
set "CURRENT_DIR=%~dp0"
set "CURRENT_DIR=%CURRENT_DIR:~0,-1%"

:: 获取桌面路径
for /f "tokens=3*" %%i in ('reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" /v Desktop 2^>nul') do set "DESKTOP=%%i %%j"

if "%DESKTOP%"=="" (
    echo [错误] 无法获取桌面路径
    pause
    exit /b 1
)

echo [信息] 当前目录: %CURRENT_DIR%
echo [信息] 桌面路径: %DESKTOP%
echo.

:: 创建VBS脚本来生成快捷方式
echo [信息] 正在创建快捷方式...

(
echo Set WshShell = CreateObject^("WScript.Shell"^)
echo Set oShellLink = WshShell.CreateShortcut^("%DESKTOP%\Customer Agent.lnk"^)
echo oShellLink.TargetPath = "%CURRENT_DIR%\启动软件.bat"
echo oShellLink.WorkingDirectory = "%CURRENT_DIR%"
echo oShellLink.Description = "Customer Agent - AI客服系统"
echo oShellLink.Save
) > "%TEMP%\create_shortcut.vbs"

:: 执行VBS脚本
cscript //nologo "%TEMP%\create_shortcut.vbs"

:: 清理临时文件
del "%TEMP%\create_shortcut.vbs"

if exist "%DESKTOP%\Customer Agent.lnk" (
    echo ✅ 桌面快捷方式创建成功！
    echo.
    echo 现在可以通过桌面上的 "Customer Agent" 快捷方式启动程序
) else (
    echo ❌ 快捷方式创建失败
)

echo.
pause