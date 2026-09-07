import { Router } from "express";
import { employeeResourceController, payrollResourceController, reportsResourceController } from "../controllers/resource.controller.js";
import { authenticateRequest, requireDevice } from "../middleware/authentication.js";
import { requireAuthorization } from "../services/authorization/authorization.service.js";

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
resourceRouter.get("/employee", requireAuthorization("employee", "read"), employeeResourceController);
resourceRouter.get("/reports", requireAuthorization("reports", "read"), reportsResourceController);
resourceRouter.get("/payroll", requireAuthorization("payroll", "read"), payrollResourceController);