import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";
import { AppError } from "./AppError.js";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (request: Request, _response: Response, next: NextFunction) => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return next(new AppError("Request validation failed.", 400, "VALIDATION_ERROR", parsed.error.flatten()));
    }

    request.body = parsed.data;
    return next();
  };
}
