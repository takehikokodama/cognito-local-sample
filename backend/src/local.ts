import { serve } from "@hono/node-server";
import app from "./app";

const PORT = 3000;

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[API] Running at http://localhost:${PORT}`);
});
