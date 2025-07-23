# 🏗️ 构建指南

本文档介绍如何使用 GitHub Actions 和本地环境构建拼多多智能客服系统的跨平台应用。

## 📋 目录

- [GitHub Actions 自动构建](#github-actions-自动构建)
- [本地构建](#本地构建)
- [构建配置](#构建配置)
- [故障排除](#故障排除)

## 🤖 GitHub Actions 自动构建

### 工作流说明

项目包含两个主要的 GitHub Actions 工作流：

#### 1. `build-release.yml` - 正式发布构建
- **触发条件**: 
  - 推送到 `main` 或 `develop` 分支
  - 创建标签 (如 `v1.0.0`)
  - 手动触发
- **构建平台**: 
  - Windows x64
  - macOS ARM64 (Apple Silicon)
- **输出**: 
  - Windows: `.exe` 可执行文件
  - macOS: `.dmg` 安装包
- **自动发布**: 当推送标签时自动创建 GitHub Release

#### 2. `test-build.yml` - 开发测试构建
- **触发条件**: 
  - 推送到 `develop` 或 `feature/*` 分支
  - Pull Request 到 `main` 或 `develop`
- **功能**: 
  - 快速构建测试
  - 代码质量检查
  - 依赖验证

### 使用方法

#### 自动构建发布版本
1. 创建并推送标签：
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. GitHub Actions 将自动：
   - 构建 Windows 和 macOS 版本
   - 创建 GitHub Release
   - 上传构建产物

#### 手动触发构建
1. 访问 GitHub 仓库的 Actions 页面
2. 选择 "Build Multi-Platform Release" 工作流
3. 点击 "Run workflow"
4. 选择分支并可选择创建 Release

### 构建产物下载

构建完成后，可以从以下位置下载：

- **GitHub Actions Artifacts**: 每次构建的临时下载
- **GitHub Releases**: 标签构建的正式发布版本

## 💻 本地构建

### 环境要求

- Python 3.11+
- 操作系统：Windows 10+ 或 macOS 11+
- 网络连接（用于下载依赖和浏览器驱动）

### 快速开始

1. **克隆仓库**
   ```bash
   git clone https://github.com/JC0v0/Customer-Agent.git
   cd Customer-Agent
   ```

2. **安装依赖**
   ```bash
   pip install -r requirements.txt
   pip install pyinstaller>=6.0.0
   ```

3. **运行构建脚本**
   ```bash
   python build-local.py
   ```

### 手动构建

#### Windows
```bash
pyinstaller --clean --noconfirm \
  --onefile \
  --windowed \
  --name="拼多多智能客服系统" \
  --add-data="icon;icon" \
  --add-data="config.json;." \
  --hidden-import="PyQt6.QtCore" \
  --hidden-import="qfluentwidgets" \
  --collect-all="qfluentwidgets" \
  app.py
```

#### macOS
```bash
pyinstaller --clean --noconfirm \
  --onefile \
  --windowed \
  --name="拼多多智能客服系统" \
  --add-data="icon:icon" \
  --add-data="config.json:." \
  --hidden-import="PyQt6.QtCore" \
  --hidden-import="qfluentwidgets" \
  --collect-all="qfluentwidgets" \
  --target-arch="arm64" \
  app.py
```

## ⚙️ 构建配置

### PyInstaller 配置选项

| 选项 | 说明 | 用途 |
|------|------|------|
| `--onefile` | 打包为单个文件 | 便于分发 |
| `--windowed` | 无控制台窗口 | GUI 应用 |
| `--add-data` | 添加数据文件 | 包含配置和资源 |
| `--hidden-import` | 显式导入模块 | 解决动态导入问题 |
| `--collect-all` | 收集包的所有文件 | 确保完整性 |
| `--target-arch` | 目标架构 | macOS ARM64 |

### 包含的文件和目录

- `icon/` - 应用图标和界面图片
- `config.json` - 默认配置文件
- `database/` - 数据库文件（如果存在）

### 隐式导入的模块

构建配置包含以下关键模块的显式导入：

- PyQt6 核心组件
- qfluentwidgets UI 库
- Playwright 浏览器自动化
- 自定义 Agent 和 Channel 模块

## 🔧 故障排除

### 常见问题

#### 1. 构建失败：缺少依赖
**错误**: `ModuleNotFoundError: No module named 'xxx'`

**解决方案**:
```bash
pip install -r requirements.txt
# 或安装特定模块
pip install 缺少的模块名
```

#### 2. PyInstaller 找不到模块
**错误**: 运行时提示找不到某个模块

**解决方案**: 在构建命令中添加 `--hidden-import`：
```bash
--hidden-import="模块名"
```

#### 3. macOS 应用无法运行
**错误**: "应用已损坏" 或安全警告

**解决方案**:
```bash
# 移除隔离属性
xattr -cr "应用路径.app"

# 或在系统偏好设置中允许运行
```

#### 4. Windows Defender 误报
**问题**: Windows Defender 将 exe 文件标记为病毒

**解决方案**:
- 这是 PyInstaller 打包应用的常见问题
- 添加到 Windows Defender 排除列表
- 考虑代码签名（需要证书）

#### 5. 文件过大
**问题**: 生成的可执行文件过大

**解决方案**:
```bash
# 添加排除选项
--exclude-module=不需要的模块

# 使用 UPX 压缩（可选）
--upx-dir=UPX路径
```

### 调试技巧

#### 1. 启用调试模式
```bash
pyinstaller --debug=all app.py
```

#### 2. 保留控制台输出
```bash
pyinstaller --console app.py  # 而不是 --windowed
```

#### 3. 检查导入问题
```python
# 在 app.py 开头添加
import sys
print("Python 路径:", sys.path)
print("已导入模块:", list(sys.modules.keys()))
```

### 性能优化

#### 1. 减少启动时间
- 使用 `--onedir` 而不是 `--onefile`（如果可接受多文件分发）
- 移除不必要的隐式导入

#### 2. 减少文件大小
- 排除不需要的模块
- 使用虚拟环境确保依赖最小化

## 📚 参考资源

- [PyInstaller 官方文档](https://pyinstaller.readthedocs.io/)
- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [PyQt6 文档](https://doc.qt.io/qtforpython/)
- [qfluentwidgets 文档](https://qfluentwidgets.com/)

## 🤝 贡献

如果你在构建过程中遇到问题或有改进建议，欢迎：

1. 提交 Issue 描述问题
2. 提交 Pull Request 改进构建配置
3. 更新文档帮助其他开发者

---

💡 **提示**: 首次构建可能需要较长时间下载依赖，后续构建会更快。建议在稳定的网络环境下进行构建。