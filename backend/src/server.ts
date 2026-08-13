import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { env } from "./config/env.js";

async function bootstrap() {
  await connectDatabase();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`Aegis backend listening on port ${env.port}`);
  });
}

void bootstrap().catch((error) => {
  console.error("Failed to start backend", error);
  process.exitCode = 1;
});
