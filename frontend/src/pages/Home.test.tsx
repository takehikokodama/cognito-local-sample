import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "oidc-client-ts";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

// userManager をモック (auth.ts がブラウザ API を使うため)
vi.mock("../auth", () => ({
  userManager: {
    getUser: vi.fn(),
    signinRedirect: vi.fn(),
    signoutRedirect: vi.fn(),
  },
}));

// モック後にインポート
const { userManager } = await import("../auth");

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/protected" element={<div>Protected Page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function makeUser(overrides: Partial<User["profile"]> = {}): User {
  return {
    access_token: "test-token",
    profile: {
      sub: "user-1",
      email: "test@example.com",
      "cognito:groups": ["user"],
      "custom:tenant_id": "tenant-a",
      ...overrides,
    },
  } as unknown as User;
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

describe("Home — 未ログイン", () => {
  beforeEach(() => {
    vi.mocked(userManager.getUser).mockResolvedValue(null);
  });

  it("ログインボタンが表示される", async () => {
    renderHome();
    expect(await screen.findByRole("button", { name: "ログイン" })).toBeInTheDocument();
  });

  it("API を叩くボタンは表示されない", async () => {
    renderHome();
    await screen.findByRole("button", { name: "ログイン" }); // 描画完了待ち
    expect(screen.queryByText("API を叩く")).not.toBeInTheDocument();
  });

  it("ログインボタンクリック → signinRedirect が呼ばれる", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(await screen.findByRole("button", { name: "ログイン" }));
    expect(userManager.signinRedirect).toHaveBeenCalledOnce();
  });
});

describe("Home — ログイン済み", () => {
  beforeEach(() => {
    vi.mocked(userManager.getUser).mockResolvedValue(makeUser());
  });

  it("メールアドレスが表示される", async () => {
    renderHome();
    expect(await screen.findByText(/test@example\.com/)).toBeInTheDocument();
  });

  it("「API を叩く」ボタンが表示される", async () => {
    renderHome();
    expect(await screen.findByRole("button", { name: "API を叩く" })).toBeInTheDocument();
  });

  it("ログアウトボタンが表示される", async () => {
    renderHome();
    expect(await screen.findByRole("button", { name: "ログアウト" })).toBeInTheDocument();
  });

  it("「API を叩く」クリック → /protected に遷移する", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(await screen.findByRole("button", { name: "API を叩く" }));
    expect(await screen.findByText("Protected Page")).toBeInTheDocument();
  });

  it("ログアウトボタンクリック → signoutRedirect が呼ばれる", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(await screen.findByRole("button", { name: "ログアウト" }));
    expect(userManager.signoutRedirect).toHaveBeenCalledOnce();
  });

  it("グループ情報が表示される", async () => {
    vi.mocked(userManager.getUser).mockResolvedValue(
      makeUser({ "cognito:groups": ["admin", "user"] }),
    );
    renderHome();
    expect(await screen.findByText(/admin/)).toBeInTheDocument();
  });
});
