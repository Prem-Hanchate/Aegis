import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();
dotenv.config({ path: "../.env" });

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().trim().min(1, "MONGODB_URI is required."),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
});

const parsed = environmentSchema.parse(process.env);

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  mongodbUri: parsed.MONGODB_URI.trim(),
  frontendOrigin: parsed.FRONTEND_ORIGIN,
  isProduction: parsed.NODE_ENV === "production",
};
