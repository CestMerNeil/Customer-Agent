# Manual Acceptance: PDD Live Session

Use a real Pinduoduo merchant account on macOS.

1. Start the Electron app with the renderer and main process.
2. Open **账号管理**, enter the merchant username and optional password, then click **登录**.
3. Complete any Pinduoduo captcha, QR, or risk challenge in the Playwright browser.
4. Confirm the account appears with status `online` and the log records a successful login.
5. Click **启动** for the account.
6. Confirm the log records WebSocket startup and the dashboard shows the account as online.
7. Send a buyer text message to the shop from another account.
8. Confirm the message appears in **自动回复** with state `received`.
9. Configure an OpenAI-compatible endpoint in **模型设置** and import at least one knowledge file.
10. Generate or approve a text reply and send it.
11. Confirm the buyer receives the text reply and the source message or draft becomes `sent`.
12. Click **停止** and confirm the account becomes `offline` without reconnecting automatically.
