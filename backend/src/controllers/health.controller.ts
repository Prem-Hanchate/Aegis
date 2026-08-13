import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { getDatabaseStatus } from "../config/database.js";

export function healthCheckController(_request: Request, response: Response) {
  const database = getDatabaseStatus();

  return response.status(200).json({
    status: "ok",
    service: "aegis-backend",
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
    database: {
      connected: database.connected,
      readyState: database.readyState,
      name: database.name,
    },
  });
}
