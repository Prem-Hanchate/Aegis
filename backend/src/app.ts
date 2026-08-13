import express from "express";
import { applySecurityMiddleware } from "./middleware/security.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler } from "./middleware/notFound.js";
import { registerRoutes } from "./routes/index.js";

export function createApp() {
  const app = express();

  applySecurityMiddleware(app);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  registerRoutes(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
