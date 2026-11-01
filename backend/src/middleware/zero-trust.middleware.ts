import type { RequestHandler } from "express";
import { evaluateZeroTrustAuthorization } from "../services/authorization/zero-trust.service.js";

export function requireZeroTrustAuthorization(resource: string, action: string): RequestHandler {
  return async (request, _response, next) => {
    try {
      const authorization = request.header("authorization");
      const accessToken = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
      const rawIp = (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || request.ip;
      const userAgent = request.header("user-agent");

      await evaluateZeroTrustAuthorization({
        accessToken,
        resource,
        action,
        context: {
          ipAddress: rawIp,
          userAgent,
          requestMethod: request.method,
          requestPath: (request.originalUrl || request.path).split("?")[0] ?? "",
          deviceProofTimestamp: request.header("x-aegis-device-timestamp") ?? undefined,
          deviceProofSignature: request.header("x-aegis-device-signature") ?? undefined,
        },
      });

      next();
    } catch (error) {
      next(error);
    }
  };
}
