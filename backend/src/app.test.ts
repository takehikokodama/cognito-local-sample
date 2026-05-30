import { type KeyLike, SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { buildAuthMiddleware, createApp } from "./app";

const ISSUER = "http://localhost:4000";
const CLIENT_ID = "local-client";

let app: ReturnType<typeof createApp>;
let privateKey: KeyLike;

async function makeAccessToken(overrides: Record<string, unknown> = {}) {
  return new SignJWT({
    sub: "user-test-1",
    iss: ISSUER,
    client_id: CLIENT_ID,
    token_use: "access",
    email: "test@example.com",
    "cognito:groups": ["user"],
    "custom:tenant_id": "tenant-a",
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}

beforeAll(async () => {
  const keyPair = await generateKeyPair("RS256");
  privateKey = keyPair.privateKey;
  const jwks = createLocalJWKSet({
    keys: [
      {
        ...(await exportJWK(keyPair.publicKey)),
        use: "sig",
        kid: "test-key",
        alg: "RS256",
      },
    ],
  });
  app = createApp(buildAuthMiddleware(ISSUER, jwks));
});

describe("GET /health", () => {
  it("認証なしで 200 を返す", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("GET /api/me", () => {
  it("Authorization ヘッダーなし → 401", async () => {
    const res = await app.request("/api/me");
    expect(res.status).toBe(401);
  });

  it("不正なトークン → 401", async () => {
    const res = await app.request("/api/me", {
      headers: { Authorization: "Bearer invalid.token.here" },
    });
    expect(res.status).toBe(401);
  });

  it("有効な access_token → ユーザー情報を返す", async () => {
    const token = await makeAccessToken();
    const res = await app.request("/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const { user } = (await res.json()) as { user: Record<string, unknown> };
    expect(user).toMatchObject({
      sub: "user-test-1",
      email: "test@example.com",
      groups: ["user"],
      tenantId: "tenant-a",
    });
  });

  it("id_token (token_use=id) を渡すと 401", async () => {
    const token = await makeAccessToken({ token_use: "id", aud: CLIENT_ID });
    const res = await app.request("/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/stats", () => {
  it("admin グループのユーザー → 200 と統計を返す", async () => {
    const token = await makeAccessToken({
      sub: "user-admin-1",
      email: "admin@example.com",
      "cognito:groups": ["admin", "user"],
    });
    const res = await app.request("/api/admin/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const { stats } = (await res.json()) as { stats: Record<string, unknown> };
    expect(stats).toMatchObject({
      totalUsers: 42,
      totalOrders: 123,
      revenue: 98765,
    });
  });

  it("一般ユーザー → 403", async () => {
    const token = await makeAccessToken();
    const res = await app.request("/api/admin/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/orders", () => {
  it("tenant-a のユーザー → tenant-a の注文のみ返す", async () => {
    const token = await makeAccessToken({ "custom:tenant_id": "tenant-a" });
    const res = await app.request("/api/orders", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const { orders } = (await res.json()) as {
      orders: { tenantId: string }[];
    };
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((o) => o.tenantId === "tenant-a")).toBe(true);
  });

  it("tenant-b のユーザー → tenant-b の注文のみ返す", async () => {
    const token = await makeAccessToken({ "custom:tenant_id": "tenant-b" });
    const res = await app.request("/api/orders", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const { orders } = (await res.json()) as {
      orders: { tenantId: string }[];
    };
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((o) => o.tenantId === "tenant-b")).toBe(true);
  });
});
