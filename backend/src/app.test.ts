import { describe, it, expect, beforeAll } from "vitest";
import {
  generateKeyPair,
  exportJWK,
  createLocalJWKSet,
  SignJWT,
  type KeyLike,
} from "jose";
import { createApp, buildAuthMiddleware } from "./app";
import type { OrderRepository } from "./db/repository";
import type { Order } from "./db/schema";

const ISSUER = "http://localhost:4000";
const CLIENT_ID = "local-client";

const mockOrders: Order[] = [
  {
    id: "uuid-1",
    tenantId: "tenant-a",
    item: "Widget A",
    amount: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "uuid-2",
    tenantId: "tenant-a",
    item: "Widget B",
    amount: 200,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "uuid-3",
    tenantId: "tenant-b",
    item: "Gadget X",
    amount: 300,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "uuid-4",
    tenantId: "tenant-b",
    item: "Gadget Y",
    amount: 150,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const mockOrderRepo: OrderRepository = {
  findByTenant: async (tenantId) =>
    mockOrders.filter((o) => o.tenantId === tenantId),
  findById: async (id, tenantId) =>
    mockOrders.find((o) => o.id === id && o.tenantId === tenantId) ?? null,
  create: async (data) => ({
    id: "uuid-new",
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  update: async (id, tenantId, data) => {
    const order = mockOrders.find(
      (o) => o.id === id && o.tenantId === tenantId
    );
    if (!order) return null;
    return { ...order, ...data, updatedAt: new Date() };
  },
  remove: async (id, tenantId) =>
    mockOrders.some((o) => o.id === id && o.tenantId === tenantId),
};

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
  app = createApp(buildAuthMiddleware(ISSUER, jwks), mockOrderRepo);
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

describe("GET /api/orders/:id", () => {
  it("存在する注文 → 200 と注文詳細を返す", async () => {
    const token = await makeAccessToken({ "custom:tenant_id": "tenant-a" });
    const res = await app.request("/api/orders/uuid-1", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const { order } = (await res.json()) as { order: { id: string } };
    expect(order.id).toBe("uuid-1");
  });

  it("別テナントの注文 → 404", async () => {
    const token = await makeAccessToken({ "custom:tenant_id": "tenant-a" });
    const res = await app.request("/api/orders/uuid-3", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/orders", () => {
  it("有効なリクエスト → 201 と新規注文を返す", async () => {
    const token = await makeAccessToken({ "custom:tenant_id": "tenant-a" });
    const res = await app.request("/api/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ item: "New Widget", amount: 500 }),
    });
    expect(res.status).toBe(201);
    const { order } = (await res.json()) as {
      order: { item: string; amount: number; tenantId: string };
    };
    expect(order.item).toBe("New Widget");
    expect(order.amount).toBe(500);
    expect(order.tenantId).toBe("tenant-a");
  });

  it("item が空 → 400", async () => {
    const token = await makeAccessToken();
    const res = await app.request("/api/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: 100 }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/orders/:id", () => {
  it("存在する注文を更新 → 200", async () => {
    const token = await makeAccessToken({ "custom:tenant_id": "tenant-a" });
    const res = await app.request("/api/orders/uuid-1", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: 999 }),
    });
    expect(res.status).toBe(200);
    const { order } = (await res.json()) as { order: { amount: number } };
    expect(order.amount).toBe(999);
  });

  it("存在しない注文 → 404", async () => {
    const token = await makeAccessToken({ "custom:tenant_id": "tenant-a" });
    const res = await app.request("/api/orders/no-such-id", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: 999 }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/orders/:id", () => {
  it("存在する注文を削除 → 200", async () => {
    const token = await makeAccessToken({ "custom:tenant_id": "tenant-a" });
    const res = await app.request("/api/orders/uuid-1", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it("別テナントの注文は削除できない → 404", async () => {
    const token = await makeAccessToken({ "custom:tenant_id": "tenant-a" });
    const res = await app.request("/api/orders/uuid-3", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });
});
