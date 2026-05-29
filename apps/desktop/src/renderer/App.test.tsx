import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders the first-version shell sections", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "拼多多 AI 客服助手" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "自动回复" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "账号管理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "知识库" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "模型设置" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "日志" })).toBeInTheDocument();
  });
});
