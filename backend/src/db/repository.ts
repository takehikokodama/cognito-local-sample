import { db } from "./index";
import { orders } from "./schema";
import { eq, and } from "drizzle-orm";
import type { Order, NewOrder } from "./schema";

export interface OrderRepository {
  findByTenant(tenantId: string): Promise<Order[]>;
  findById(id: string, tenantId: string): Promise<Order | null>;
  create(data: Omit<NewOrder, "id" | "createdAt" | "updatedAt">): Promise<Order>;
  update(id: string, tenantId: string, data: Partial<Pick<Order, "item" | "amount">>): Promise<Order | null>;
  remove(id: string, tenantId: string): Promise<boolean>;
}

export const drizzleOrderRepository: OrderRepository = {
  async findByTenant(tenantId) {
    return db.select().from(orders).where(eq(orders.tenantId, tenantId));
  },
  async findById(id, tenantId) {
    const rows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)));
    return rows[0] ?? null;
  },
  async create(data) {
    const rows = await db.insert(orders).values(data).returning();
    return rows[0];
  },
  async update(id, tenantId, data) {
    const rows = await db
      .update(orders)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
      .returning();
    return rows[0] ?? null;
  },
  async remove(id, tenantId) {
    const rows = await db
      .delete(orders)
      .where(and(eq(orders.id, id), eq(orders.tenantId, tenantId)))
      .returning();
    return rows.length > 0;
  },
};
