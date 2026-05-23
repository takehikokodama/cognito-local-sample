import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Callback from "./Callback";

vi.mock("../auth", () => ({
  userManager: {
    signinRedirectCallback: vi.fn(),
  },
}));

const { userManager } = await import("../auth");

function renderCallback() {
  return render(
    <MemoryRouter initialEntries={["/callback"]}>
      <Routes>
        <Route path="/callback" element={<Callback />} />
        <Route path="/" element={<div>Home Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

describe("Callback", () => {
  it("処理中のメッセージが表示される", () => {
    vi.mocked(userManager.signinRedirectCallback).mockReturnValue(
      new Promise(() => {}) // 意図的に resolve しない
    );
    renderCallback();
    expect(screen.getByText("ログイン処理中...")).toBeInTheDocument();
  });

  it("signinRedirectCallback が呼ばれる", () => {
    vi.mocked(userManager.signinRedirectCallback).mockResolvedValue(
      {} as never
    );
    renderCallback();
    expect(userManager.signinRedirectCallback).toHaveBeenCalledOnce();
  });

  it("成功後にホーム画面へ遷移する", async () => {
    vi.mocked(userManager.signinRedirectCallback).mockResolvedValue(
      {} as never
    );
    renderCallback();
    expect(await screen.findByText("Home Page")).toBeInTheDocument();
  });

  it("失敗してもホーム画面へ遷移する", async () => {
    vi.mocked(userManager.signinRedirectCallback).mockRejectedValue(
      new Error("callback failed")
    );
    renderCallback();
    expect(await screen.findByText("Home Page")).toBeInTheDocument();
  });
});
