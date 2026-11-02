import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();
dotenv.config({ path: "../.env" });

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().trim().default("0.0.0.0"),
  MONGODB_URI: z.string().trim().min(1).default("mongodb://127.0.0.1:27017/aegis"),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  AUTH_DOMAIN: z.string().trim().min(1).optional(),
  RPC_URL: z.string().url().optional(),
  CHAIN_ID: z.coerce.bigint().positive().optional(),
  IDENTITY_REGISTRY_ADDRESS: z.string().optional(),
  POLICY_REGISTRY_ADDRESS: z.string().optional(),
  REVOCATION_REGISTRY_ADDRESS: z.string().optional(),
  BOOTSTRAP_ADMIN_WALLET: z.string().optional().default("0xfe2400b9A20f2A3C824D8D46c68046b0264c6253"),
  BOOTSTRAP_ADMIN_DISPLAY_NAME: z.string().trim().min(1).max(120).default("Aegis Administrator"),
  BOOTSTRAP_ADMIN_DEVICE_FINGERPRINT: z.string().trim().min(8).optional(),
});

const parsed = environmentSchema.parse(process.env);

export const env = {
  nodeEnv: parsed.NODE_ENV,
  port: parsed.PORT,
  host: parsed.HOST,
  mongodbUri: parsed.MONGODB_URI.trim(),
  frontendOrigin: parsed.FRONTEND_ORIGIN,
  authDomain: parsed.AUTH_DOMAIN ?? new URL(parsed.FRONTEND_ORIGIN).host,
  rpcUrl: parsed.RPC_URL,
  chainId: parsed.CHAIN_ID,
  identityRegistryAddress: parsed.IDENTITY_REGISTRY_ADDRESS,
  policyRegistryAddress: parsed.POLICY_REGISTRY_ADDRESS,
  revocationRegistryAddress: parsed.REVOCATION_REGISTRY_ADDRESS,
  bootstrapAdminWallet: parsed.BOOTSTRAP_ADMIN_WALLET,
  bootstrapAdminDisplayName: parsed.BOOTSTRAP_ADMIN_DISPLAY_NAME,
  bootstrapAdminDeviceFingerprint: parsed.BOOTSTRAP_ADMIN_DEVICE_FINGERPRINT
    ?? `admin-workstation:${parsed.BOOTSTRAP_ADMIN_WALLET.toLowerCase()}`,
  isProduction: parsed.NODE_ENV === "production",
};
