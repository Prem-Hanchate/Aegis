import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";
import {
  assignRoleAsync,
  getIdentityByWalletAsync,
  registerIdentityAsync,
  updateIdentityStatusAsync,
} from "./services/identity.service.js";

async function bootstrapAdmin() {
  if (!env.bootstrapAdminWallet) {
    return;
  }

  const existingIdentity = await getIdentityByWalletAsync(env.bootstrapAdminWallet);
  const identity = existingIdentity
    ? await updateIdentityStatusAsync(existingIdentity.identityId, "ACTIVE")
    : await registerIdentityAsync(env.bootstrapAdminWallet, env.bootstrapAdminDisplayName);
  await assignRoleAsync(identity.identityId, "admin");
  console.log(`Bootstrapped administrator for ${identity.walletAddress} (active, admin role)`);
}

async function bootstrap() {
  await connectDatabase();
  await bootstrapAdmin();

  const app = createApp();
  const server = app.listen(env.port, env.host, () => {
    console.log(`Aegis backend listening on http://${env.host}:${env.port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}; shutting down Aegis backend.`);
    server.close(async (error) => {
      if (error) {
        console.error("Failed to close the HTTP server cleanly.", error);
        process.exitCode = 1;
      }
      await disconnectDatabase();
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

void bootstrap().catch((error) => {
  console.error("Failed to start backend", error);
  process.exitCode = 1;
});
