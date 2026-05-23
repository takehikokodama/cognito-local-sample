import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { User } from "oidc-client-ts";
import Protected from "./Protected";

vi.mock("../auth", () => ({
  userManager: {
    getUser: vi.fn(),
  },
}));

const { userManager } = await import("../auth");

function makeUser(overrides: Partial<User["profile"]> = {}): User {
  return {
    access_token: "test-access-token",
    profile: {
      sub: "user-1",
      email: "test@example.com",
      "cognito:groups": ["user"],
      "custom:tenant_id": "tenant-a",
      ...overrides,
    },
  } as unknown as User;
}

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={["/protected"]}>
      <Routes>
        <Route path="/protected" element={<Protected />} />
        <Route path="/" element={<div>Home Page</div>} />
      </Routes>
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Protected — 未ログイン", () => {
  it("ホーム画面へリダイレクトする", async () => {
    vi.mocked(userManager.getUser).mockResolvedValue(null);
    renderProtected();
    expect(await screen.findByText("Home Page")).toBeInTheDocument();
  });
});

describe("Protected — ログイン済み", () => {
  beforeEach(() => {
    vi.mocked(userManager.getUser).mockResolvedValue(makeUser());
  });

  it("API ボタンが3つ表示される", async () => {
    renderProtected();
    expect(await screen.findByRole("button", { name: /\/api\/me/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\/api\/orders/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /\/api\/admin\/stats/ })).toBeInTheDocument();
  });

  it("「ホームへ」ボタンクリック → ホームへ遷移する", async () => {
    const user = userEvent.setup();
    renderProtected();
    await screen.findByRole("button", { name: /\/api\/me/ }); // 描画完了待ち
    await user.click(screen.getByText("← ホームへ"));
    expect(await screen.findByText("Home Page")).toBeInTheDocument();
  });

  it("GET /api/me 成功 → レスポンスを表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        json: () =>
          Promise.resolve({ user: { sub: "user-1", email: "test@example.com" } }),
      })
    );
    const user = userEvent.setup();
    renderProtected();
    await user.click(await screen.findByRole("button", { name: /\/api\/me/ }));

    // レスポンスが JSON 表示される
    expect(await screen.findByText(/test@example\.com/)).toBeInTheDocument();
    // ステータスコードが表示される
    expect(screen.getByText("200")).toBeInTheDocument();
  });

  it("GET /api/me → Authorization: Bearer ヘッダーを付与してリクエストする", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ user: {} }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const user = userEvent.setup();
    renderProtected();
    await user.click(await screen.findByRole("button", { name: /\/api\/me/ }));

    await screen.findByText("200");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-access-token",
        }),
      })
    );
  });

  it("GET /api/admin/stats 403 → ステータスコード 403 を表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 403,
        json: () => Promise.resolve({ error: "Forbidden" }),
      })
    );
    const user = userEvent.setup();
    renderProtected();
    await user.click(
      await screen.findByRole("button", { name: /\/api\/admin\/stats/ })
    );

    expect(await screen.findByText("403")).toBeInTheDocument();
    expect(screen.getByText(/Forbidden/)).toBeInTheDocument();
  });

  it("複数の API を叩いた結果がそれぞれ表示される", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce({
          status: 200,
          json: () => Promise.resolve({ user: { email: "me@example.com" } }),
        })
        .mockResolvedValueOnce({
          status: 200,
          json: () => Promise.resolve({ orders: [{ id: "order-1" }] }),
        })
    );

    const user = userEvent.setup();
    renderProtected();
    await user.click(await screen.findByRole("button", { name: /\/api\/me/ }));
    await screen.findByText(/me@example\.com/);

    await user.click(screen.getByRole("button", { name: /\/api\/orders/ }));
    expect(await screen.findByText(/order-1/)).toBeInTheDocument();
  });
});
