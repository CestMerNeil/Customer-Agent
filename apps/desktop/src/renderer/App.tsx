const navItems = ["自动回复", "账号管理", "知识库", "模型设置", "日志", "设置"];

export function App() {
  return (
    <main style={{ minHeight: "100vh", background: "#f7f9fc", color: "#172033" }}>
      <aside
        style={{
          position: "fixed",
          inset: "0 auto 0 0",
          width: 240,
          borderRight: "1px solid #d8dee9",
          background: "#ffffff",
          padding: 24,
        }}
      >
        <h1 style={{ fontSize: 20, margin: "0 0 24px" }}>拼多多 AI 客服助手</h1>
        <nav style={{ display: "grid", gap: 8 }}>
          {navItems.map((item) => (
            <button
              key={item}
              type="button"
              style={{
                border: 0,
                borderRadius: 8,
                background: item === "自动回复" ? "#d7e3ff" : "transparent",
                color: "#172033",
                cursor: "pointer",
                fontSize: 15,
                padding: "10px 12px",
                textAlign: "left",
              }}
            >
              {item}
            </button>
          ))}
        </nav>
      </aside>

      <section style={{ marginLeft: 240, padding: 32 }}>
        <header style={{ marginBottom: 24 }}>
          <p style={{ margin: 0, color: "#5f6b7a" }}>Electron + TypeScript rewrite</p>
          <h2 style={{ margin: "8px 0 0", fontSize: 28 }}>自动回复</h2>
        </header>

        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          }}
        >
          <section style={{ border: "1px solid #d8dee9", borderRadius: 8, padding: 20 }}>
            <h3 style={{ marginTop: 0 }}>运行账号</h3>
            <p>等待连接拼多多账号。</p>
          </section>
          <section style={{ border: "1px solid #d8dee9", borderRadius: 8, padding: 20 }}>
            <h3 style={{ marginTop: 0 }}>待审核草稿</h3>
            <p>人工审核模式的 AI 草稿会显示在这里。</p>
          </section>
          <section style={{ border: "1px solid #d8dee9", borderRadius: 8, padding: 20 }}>
            <h3 style={{ marginTop: 0 }}>模型状态</h3>
            <p>等待配置本地 vLLM 或外部 endpoint。</p>
          </section>
        </div>
      </section>
    </main>
  );
}
