#!/usr/bin/env python3
"""
本地构建脚本
支持在本地环境构建应用，用于测试 GitHub Actions 配置
"""

import os
import sys
import platform
import subprocess
import shutil
from pathlib import Path

APP_NAME = "拼多多智能客服系统"

def check_dependencies():
    """检查构建依赖"""
    print("🔍 检查构建依赖...")
    
    # 检查 Python 版本
    if sys.version_info < (3, 11):
        print("❌ Python 版本需要 3.11 或更高")
        return False
    
    # 检查 PyInstaller
    try:
        import PyInstaller
        print(f"✅ PyInstaller 版本: {PyInstaller.__version__}")
    except ImportError:
        print("❌ PyInstaller 未安装，正在安装...")
        subprocess.run([sys.executable, "-m", "pip", "install", "pyinstaller>=6.0.0"], check=True)
    
    # 检查关键依赖
    required_packages = ["PyQt6", "qfluentwidgets", "playwright", "requests", "SQLAlchemy"]
    missing_packages = []
    
    for package in required_packages:
        try:
            __import__(package.replace("-", "_").lower())
            print(f"✅ {package}")
        except ImportError:
            missing_packages.append(package)
            print(f"❌ {package}")
    
    if missing_packages:
        print(f"❌ 缺少依赖: {', '.join(missing_packages)}")
        print("请运行: pip install -r requirements.txt")
        return False
    
    return True

def prepare_build_env():
    """准备构建环境"""
    print("🛠️ 准备构建环境...")
    
    # 创建必要的目录
    os.makedirs("icon", exist_ok=True)
    os.makedirs("database", exist_ok=True)
    
    # 创建默认配置文件
    config_path = Path("config.json")
    if not config_path.exists():
        default_config = {
            "coze_api_base": "https://api.coze.cn",
            "coze_token": "",
            "coze_bot_id": "",
            "bot_type": "coze",
            "businessHours": {
                "start": "08:00",
                "end": "23:00"
            }
        }
        
        import json
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(default_config, f, ensure_ascii=False, indent=4)
        print("✅ 创建默认配置文件")
    
    # 清理之前的构建
    for dir_name in ["build", "dist"]:
        if os.path.exists(dir_name):
            shutil.rmtree(dir_name)
            print(f"🧹 清理 {dir_name} 目录")

def build_windows():
    """构建 Windows 应用"""
    print("🏗️ 构建 Windows 应用...")
    
    cmd = [
        "pyinstaller",
        "--clean",
        "--noconfirm",
        "--onefile",
        "--windowed",
        f"--name={APP_NAME}",
        "--add-data=icon;icon",
        "--add-data=config.json;.",
        "--add-data=database;database",
        "--hidden-import=PyQt6.QtCore",
        "--hidden-import=PyQt6.QtWidgets",
        "--hidden-import=PyQt6.QtGui",
        "--hidden-import=qfluentwidgets",
        "--hidden-import=playwright",
        "--hidden-import=Agent.CozeAgent.bot",
        "--hidden-import=Agent.DifyAgent.bot",
        "--collect-all=qfluentwidgets",
        "--collect-all=playwright",
        "app.py"
    ]
    
    # 添加图标（如果存在）
    icon_path = Path("icon/icon.ico")
    if icon_path.exists():
        cmd.insert(-1, f"--icon={icon_path}")
    
    subprocess.run(cmd, check=True)
    
    exe_path = Path(f"dist/{APP_NAME}.exe")
    if exe_path.exists():
        size_mb = exe_path.stat().st_size / (1024 * 1024)
        print(f"✅ Windows 应用构建成功")
        print(f"📦 文件大小: {size_mb:.2f} MB")
        print(f"📁 位置: {exe_path}")
        return True
    else:
        print("❌ Windows 应用构建失败")
        return False

def build_macos():
    """构建 macOS 应用"""
    print("🏗️ 构建 macOS 应用...")
    
    cmd = [
        "pyinstaller",
        "--clean",
        "--noconfirm",
        "--onefile",
        "--windowed",
        f"--name={APP_NAME}",
        "--add-data=icon:icon",
        "--add-data=config.json:.",
        "--add-data=database:database",
        "--hidden-import=PyQt6.QtCore",
        "--hidden-import=PyQt6.QtWidgets",
        "--hidden-import=PyQt6.QtGui",
        "--hidden-import=qfluentwidgets",
        "--hidden-import=playwright",
        "--hidden-import=Agent.CozeAgent.bot",
        "--hidden-import=Agent.DifyAgent.bot",
        "--collect-all=qfluentwidgets",
        "--collect-all=playwright",
        "--target-arch=arm64",
        "app.py"
    ]
    
    # 添加图标（如果存在）
    icon_path = Path("icon/icon.icns")
    if icon_path.exists():
        cmd.insert(-1, f"--icon={icon_path}")
    
    subprocess.run(cmd, check=True)
    
    # 创建 .app 包
    app_path = Path(f"dist/{APP_NAME}.app")
    if not app_path.exists():
        os.makedirs(app_path / "Contents/MacOS", exist_ok=True)
        os.makedirs(app_path / "Contents/Resources", exist_ok=True)
        
        # 移动可执行文件
        exe_path = Path(f"dist/{APP_NAME}")
        if exe_path.exists():
            shutil.move(str(exe_path), str(app_path / "Contents/MacOS/"))
        
        # 创建 Info.plist
        info_plist = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>{APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>com.jc0v0.pdd-customer-agent</string>
    <key>CFBundleName</key>
    <string>{APP_NAME}</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
</dict>
</plist>"""
        
        with open(app_path / "Contents/Info.plist", 'w') as f:
            f.write(info_plist)
    
    if app_path.exists():
        print(f"✅ macOS 应用构建成功")
        print(f"📁 位置: {app_path}")
        return True
    else:
        print("❌ macOS 应用构建失败")
        return False

def main():
    """主函数"""
    print(f"🚀 {APP_NAME} 本地构建工具")
    print(f"🖥️ 当前平台: {platform.system()} {platform.machine()}")
    print("=" * 50)
    
    # 检查依赖
    if not check_dependencies():
        sys.exit(1)
    
    # 准备构建环境
    prepare_build_env()
    
    # 根据平台构建
    success = False
    if platform.system() == "Windows":
        success = build_windows()
    elif platform.system() == "Darwin":
        success = build_macos()
    else:
        print(f"❌ 不支持的平台: {platform.system()}")
        sys.exit(1)
    
    if success:
        print("\n🎉 构建完成！")
        print("💡 提示: 首次运行时需要安装浏览器驱动")
    else:
        print("\n❌ 构建失败！")
        sys.exit(1)

if __name__ == "__main__":
    main()