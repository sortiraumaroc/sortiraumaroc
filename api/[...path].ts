import { createServer } from "../server";

const app = createServer();

export const config = {
  api: {
    // Let Express handle body parsing.
    bodyParser: false,
  },
};

export default function handler(req: any, res: any) {
  // Vercel catch-all functions typically receive req.url without the "/api" prefix.
  // Our Express app registers routes under "/api/*", so we normalize here.
  const url = typeof req.url === "string" ? req.url : "";
  if (url && !url.startsWith("/api/")) {
    req.url = url.startsWith("/") ? `/api${url}` : `/api/${url}`;
  }

  return app(req as any, res as any);
}
