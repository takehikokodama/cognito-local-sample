import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  authMiddleware as defaultAuthMiddleware,
  buildAuthMiddleware,
  type AppVariables,
} from "./middleware/auth";
import type { MiddlewareHandler } from "hono";
import {
  drizzleOrderRepository,
  type OrderRepository,
} from "./db/repository";

export function createApp(
  authMW: MiddlewareHandler<{ Variables: AppVariables }> = defaultAuthMiddleware,
  orderRepo: OrderRepository = drizzleOrderRepository
) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use(
    "*",
    cors({
      origin: "http://localhost:5173",
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    })
  );

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.use("/api/*", authMW);

  app.get("/api/me", (c) => {
    const user = c.get("user");
    return c.json({ user });
  });

  app.get("/api/admin/stats", (c) => {
    const user = c.get("user");
    if (!user.groups.includes("admin")) {
      return c.json({ error: "Forbidden" }, 403);
    }
    return c.json({
      stats: {
        totalUsers: 42,
        totalOrders: 123,
        revenue: 98765,
      },
    });
  });

  // GET /api/orders - テナントの注文一覧
  app.get("/api/orders", async (c) => {
    const user = c.get("user");
    const rows = await orderRepo.findByTenant(user.tenantId);
    return c.json({ orders: rows });
  });

  // GET /api/orders/:id - 注文詳細
  app.get("/api/orders/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const order = await orderRepo.findById(id, user.tenantId);
    if (!order) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json({ order });
  });

  // POST /api/orders - 注文作成
  app.post("/api/orders", async (c) => {
    const user = c.get("user");
    const body = await c.req.json<{ item: string; amount: number }>();
    if (!body.item || body.amount == null) {
      return c.json({ error: "item and amount are required" }, 400);
    }
    const order = await orderRepo.create({
      tenantId: user.tenantId,
      item: body.item,
      amount: body.amount,
    });
    return c.json({ order }, 201);
  });

  // PUT /api/orders/:id - 注文更新
  app.put("/api/orders/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const body = await c.req.json<{ item?: string; amount?: number }>();
    const order = await orderRepo.update(id, user.tenantId, body);
    if (!order) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json({ order });
  });

  // DELETE /api/orders/:id - 注文削除
  app.delete("/api/orders/:id", async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const deleted = await orderRepo.remove(id, user.tenantId);
    if (!deleted) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json({ message: "Deleted" });
  });

  return app;
}

// Re-export buildAuthMiddleware for convenience
export { buildAuthMiddleware };

export default createApp();
