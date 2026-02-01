import { createServer } from "../server";

const app = createServer();

export const config = {
  api: {
    // Let Express handle response streaming and headers.
    bodyParser: false,
  },
};

export default function handler(req: any, res: any) {
  req.url = "/sitemap.xml";
  return app(req as any, res as any);
}
