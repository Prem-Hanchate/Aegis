import { Router } from "express";
import { healthCheckController, readinessCheckController } from "../controllers/health.controller.js";

export const healthRouter = Router();

healthRouter.get("/", healthCheckController);
healthRouter.get("/ready", readinessCheckController);
