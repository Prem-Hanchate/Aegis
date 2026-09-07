import { createApp } from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

async function bootstrap() {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`Aegis backend listening on port ${env.port}`);
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
