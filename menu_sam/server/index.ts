import "./lib/load-env";

import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { proRouter } from "./routes/pro";
import { superadminRouter } from "./routes/superadmin";
import { supabaseProxyRouter } from "./routes/supabase-proxy";
import { publicMenuRouter } from "./routes/public-menu";
import { mysqlApiRouter } from "./routes/mysql-api";
import { authRouter } from "./routes/auth";
import { migratePasswordsRouter } from "./routes/migrate-passwords";
import { chatRouter } from "./routes/chat";
import { samSyncRouter } from "./routes/sam-sync";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  app.use("/api/pro", proRouter);
  app.use("/api/superadmin", superadminRouter);
  app.use("/api/supabase", supabaseProxyRouter);
  app.use("/api/menu", publicMenuRouter);
  app.use("/api/mysql", mysqlApiRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/migrate", migratePasswordsRouter);
  app.use("/api", chatRouter);
  app.use("/api/sync", samSyncRouter);

  return app;
}
