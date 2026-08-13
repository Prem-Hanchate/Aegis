import { Router } from "express";
import { healthCheckController } from "../controllers/health.controller.js";

export const healthRouter = Router();

healthRouter.get("/", healthCheckController);
