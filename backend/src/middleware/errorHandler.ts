import type { NextFunction, Request, Response } from "express";
import { AppError } from "./AppError.js";

export function errorHandler(error: unknown, _request: Request, response: Response, _next: NextFunction) {
  if (error instanceof AppError) {
    return response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? null,
      },
    });
  }

  const message = error instanceof Error ? error.message : "Unexpected server error";
  return response.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message,
    },
  });
}
