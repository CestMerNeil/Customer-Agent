# LM Studio Agent

LM Studio Agent 允许系统通过 LM Studio 本地运行的大语言模型进行对话。

## 配置说明

在 `config.json` 中添加以下配置：

```json
{
    "lmstudio_api_base": "http://localhost:1234/v1",
    "lmstudio_model": "local-model",
    "lmstudio_max_tokens": 1000,
    "lmstudio_temperature": 0.7,
    "bot_type": "lmstudio"
}
```

### 配置参数说明

- `lmstudio_api_base`: LM Studio API 地址，默认为 `http://localhost:1234/v1`
- `lmstudio_model`: 模型名称，通常为 `local-model` 或你在 LM Studio 中加载的模型名
- `lmstudio_max_tokens`: 最大生成token数，默认1000
- `lmstudio_temperature`: 生成温度，控制回复的随机性，范围0-1，默认0.7
- `bot_type`: 设置为 `"lmstudio"` 以启用 LM Studio Agent

## 使用前准备

1. 确保 LM Studio 已安装并运行
2. 在 LM Studio 中加载一个模型
3. 启动 LM Studio 的本地服务器（通常在端口1234）
4. 修改 `config.json` 中的 `bot_type` 为 `"lmstudio"`

## 特性

- 支持本地大语言模型对话
- 可配置的生成参数
- 错误处理和超时机制
- 与现有系统架构完全兼容

## 注意事项

- 确保 LM Studio 服务正在运行
- 检查防火墙设置，确保可以访问本地API
- 根据你的模型调整 `max_tokens` 和 `temperature` 参数