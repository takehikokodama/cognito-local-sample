import "dotenv/config";
import { db } from "./index";
import { orders } from "./schema";

const seedData = [
  { tenantId: "tenant-a", item: "Widget A", amount: 100 },
  { tenantId: "tenant-a", item: "Widget B", amount: 200 },
  { tenantId: "tenant-b", item: "Gadget X", amount: 300 },
  { tenantId: "tenant-b", item: "Gadget Y", amount: 150 },
];

async function seed() {
  await db.insert(orders).values(seedData);
  console.log(`Seeded ${seedData.length} orders.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
