import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();
dotenv.config({ path: "../.env" });

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().trim().min(1, "MONGODB_URI is required."),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  RPC_URL: z.string().url().optional(),
  CHAIN_ID: z.coerce.bigint().positive().optional(),
  IDENTITY_REGISTRY_ADDRESS: z.string().optional(),
  POLICY_REGISTRY_ADDRESS: z.string().optional(),
  REVOCATION_REGISTRY_ADDRESS: z.string().optional(),
});

const parsed = environmentSchema.parse(process.env);

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  mongodbUri: parsed.MONGODB_URI.trim(),
  frontendOrigin: parsed.FRONTEND_ORIGIN,
  rpcUrl: parsed.RPC_URL,
  chainId: parsed.CHAIN_ID,
  identityRegistryAddress: parsed.IDENTITY_REGISTRY_ADDRESS,
  policyRegistryAddress: parsed.POLICY_REGISTRY_ADDRESS,
  revocationRegistryAddress: parsed.REVOCATION_REGISTRY_ADDRESS,
  isProduction: parsed.NODE_ENV === "production",
};
