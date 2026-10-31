export * from "./interfaces.js";
export * from "./mongodb.js";

import { MongoAuditRepository, MongoChallengeRepository, MongoDeviceRepository, MongoIdentityRepository, MongoPolicyRepository, MongoSessionRepository } from "./mongodb.js";

export const identityRepository = new MongoIdentityRepository();
export const challengeRepository = new MongoChallengeRepository();
export const sessionRepository = new MongoSessionRepository();
export const deviceRepository = new MongoDeviceRepository();
export const policyRepository = new MongoPolicyRepository();
export const auditRepository = new MongoAuditRepository();
