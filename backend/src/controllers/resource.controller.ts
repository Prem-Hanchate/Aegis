import type { Request, Response } from "express";
import { requireAuthenticatedRequest } from "../middleware/authentication.js";

export function employeeResourceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  return response.status(200).json({ resource: "employee", identityId: auth.identityId, data: "Employee portal" });
}

export function reportsResourceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  return response.status(200).json({ resource: "reports", identityId: auth.identityId, data: "Reports portal" });
}

export function payrollResourceController(request: Request, response: Response) {
  const { auth } = requireAuthenticatedRequest(request);
  return response.status(200).json({ resource: "payroll", identityId: auth.identityId, data: "Payroll portal" });
}