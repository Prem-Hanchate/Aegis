import type { Express } from "express";
import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { healthRouter } from "./health.routes.js";

export function registerRoutes(app: Express) {
  const apiRouter = Router();

  apiRouter.get("/", (_request, response) => {
    response.json({
      service: "aegis-backend",
      status: "ready",
      version: "0.1.0",
    });
  });

  apiRouter.use("/auth", authRouter);
  apiRouter.use("/health", healthRouter);

  app.use("/api", apiRouter);
}
