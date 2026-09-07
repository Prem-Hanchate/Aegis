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

export function readinessCheckController(_request: Request, response: Response) {
  const database = getDatabaseStatus();
  const ready = database.connected && database.readyState === 1;

  return response.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    service: "aegis-backend",
    database: {
      connected: database.connected,
      readyState: database.readyState,
      name: database.name,
    },
  });
}
