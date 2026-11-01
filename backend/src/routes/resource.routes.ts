import { Router } from "express";
import { employeeResourceController, payrollResourceController, reportsResourceController } from "../controllers/resource.controller.js";
import { authenticateRequest, requireDevice } from "../middleware/authentication.js";
import { requireZeroTrustAuthorization } from "../middleware/zero-trust.middleware.js";

export const resourceRouter = Router();

resourceRouter.use(authenticateRequest);
resourceRouter.use((request, _response, next) => {
  try {
    requireDevice(request);
    next();
  } catch (error) {
    next(error);
  }
});

resourceRouter.get("/employee", requireZeroTrustAuthorization("employee", "read"), employeeResourceController);
resourceRouter.get("/reports", requireZeroTrustAuthorization("reports", "read"), reportsResourceController);
resourceRouter.get("/payroll", requireZeroTrustAuthorization("payroll", "read"), payrollResourceController);
