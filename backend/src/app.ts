import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import {
  type AppVariables,
  buildAuthMiddleware,
  authMiddleware as defaultAuthMiddleware,
} from "./middleware/auth";

export function createApp(
  authMW: MiddlewareHandler<{ Variables: AppVariables }> = defaultAuthMiddleware,
) {
  const app = new Hono<{ Variables: AppVariables }>();

  app.use(
    "*",
    cors({
      origin: "http://localhost:5173",
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
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

  app.get("/api/orders", (c) => {
    const user = c.get("user");
    const allOrders = [
      { id: "order-1", tenantId: "tenant-a", item: "Widget A", amount: 100 },
      { id: "order-2", tenantId: "tenant-a", item: "Widget B", amount: 200 },
      { id: "order-3", tenantId: "tenant-b", item: "Gadget X", amount: 300 },
      { id: "order-4", tenantId: "tenant-b", item: "Gadget Y", amount: 150 },
    ];
    const orders = allOrders.filter((o) => o.tenantId === user.tenantId);
    return c.json({ orders });
  });

  return app;
}

// Re-export buildAuthMiddleware for convenience
export { buildAuthMiddleware };

export default createApp();
