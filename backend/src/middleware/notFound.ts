import type { Request, Response } from "express";

export function notFoundHandler(_request: Request, response: Response) {
  return response.status(404).json({
    error: {
      code: "RESOURCE_NOT_FOUND",
      message: "The requested endpoint does not exist.",
    },
  });
}
