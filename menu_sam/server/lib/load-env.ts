import fs from "fs";
import path from "path";
import dotenv from "dotenv";

function loadEnvFile(fileName: string) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return;

  dotenv.config({
    path: filePath,
    override: false,
  });
}

// Load local-first, then fallback.
// - Vite commonly uses .env.local
// - Plesk deployments often use a .env or custom env vars
loadEnvFile(".env.local");
loadEnvFile(".env");
