import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import {
  assignRole,
  getIdentityByWallet,
  registerIdentity,
  updateIdentityStatus,
} from "./services/identity.service.js";

function bootstrapAdmin() {
  if (env.isProduction || !env.bootstrapAdminWallet) {
    return;
  }

  const existingIdentity = getIdentityByWallet(env.bootstrapAdminWallet);
  const identity = existingIdentity
    ? updateIdentityStatus(existingIdentity.identityId, "ACTIVE")
    : registerIdentity(env.bootstrapAdminWallet, env.bootstrapAdminDisplayName);
  assignRole(identity.identityId, "admin");
  console.log(`Bootstrapped development administrator for ${identity.walletAddress} (active)`);
}

async function bootstrap() {
  await connectDatabase();
  bootstrapAdmin();

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`Aegis backend listening on port ${env.port}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down Aegis backend.`);
    server.close(async (error) => {
      if (error) {
        console.error("Failed to close the HTTP server cleanly.", error);
        process.exitCode = 1;
      }
      try {
        await disconnectDatabase();
      } catch (disconnectError) {
        console.error("Failed to close the MongoDB connection cleanly.", disconnectError);
        process.exitCode = 1;
      }
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

void bootstrap().catch((error) => {
  console.error("Failed to start backend", error);
  process.exitCode = 1;
});
