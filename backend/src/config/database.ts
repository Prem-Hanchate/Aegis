import mongoose from "mongoose";
import { env } from "./env.js";
import { rehydrateIdentityStore } from "../services/identity.service.js";
import { rehydrateSessionStore } from "../services/session.service.js";
import { rehydrateDeviceStore } from "../services/device.service.js";
import { rehydratePolicyStore } from "../services/authorization/authorization.service.js";
import { rehydrateAuditStore } from "../services/audit/audit.service.js";
import { policyRepository } from "../repositories/policy.repository.js";
import {
  IdentityModel,
  SessionModel,
  ChallengeModel,
  DeviceModel,
  PolicyModel,
  AuditLogModel,
} from "../models/index.js";

let connected = false;
let listenersRegistered = false;

mongoose.set("bufferTimeoutMS", 5000);

    function registerConnectionListeners() {
      if (listenersRegistered) return;
      listenersRegistered = true;

      mongoose.connection.on("connected", () => {
        connected = true;
        console.log("MongoDB Connected Successfully");
        console.log(`Database: ${mongoose.connection.name}`);
      });

      mongoose.connection.on("error", (error) => {
        connected = false;
        const message = error instanceof Error ? error.message : "Unknown MongoDB connection error.";
        console.error(`MongoDB connection error: ${message}`);
      });

      mongoose.connection.on("disconnected", () => {
        connected = false;
        console.warn("MongoDB connection disconnected.");
      });

      mongoose.connection.on("reconnected", () => {
        connected = true;
        console.log("MongoDB connection reconnected successfully.");
        void rehydrateAllStores().catch((err) => {
          console.error("Failed to rehydrate stores after MongoDB reconnection:", err);
        });
      });
    }

    export async function rehydrateAllStores() {
      await Promise.all([
        rehydrateIdentityStore(),
        rehydrateSessionStore(),
        rehydrateDeviceStore(),
        rehydratePolicyStore(),
        rehydrateAuditStore(),
      ]);
    }

    export async function syncDatabaseIndexes() {
      try {
        await Promise.all([
          IdentityModel.syncIndexes(),
          SessionModel.syncIndexes(),
          ChallengeModel.syncIndexes(),
          DeviceModel.syncIndexes(),
          PolicyModel.syncIndexes(),
          AuditLogModel.syncIndexes(),
        ]);
      } catch (error) {
        console.warn("Warning: Could not sync some indexes:", error);
      }
    }

    export async function connectDatabase(uri?: string, options?: mongoose.ConnectOptions) {
      const targetUri = uri !== undefined ? uri.trim() : env.mongodbUri;
      if (!targetUri) {
        throw new Error("MONGODB_URI is not configured.");
      }

      registerConnectionListeners();

      if (mongoose.connection.readyState === 1) {
        connected = true;
        return { connected: true, skipped: false };
      }

      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }

      try {
        await mongoose.connect(targetUri, {
          serverSelectionTimeoutMS: options?.serverSelectionTimeoutMS ?? 5000,
          connectTimeoutMS: options?.connectTimeoutMS ?? 10000,
          autoIndex: options?.autoIndex ?? true,
          ...options,
        });
        connected = true;

        // Initialize defaults, indexes, and rehydrate state safely
        try {
          await syncDatabaseIndexes();
          await policyRepository.seedDefaults();
          await rehydrateAllStores();
        } catch (initErr) {
          console.warn("Database initialization warning:", initErr);
        }

        return { connected: true, skipped: false };
      } catch (error) {
        connected = false;
        const message = error instanceof Error ? error.message : "Unknown MongoDB connection error.";
        console.error(`MongoDB connection failed: ${message}`);
        throw error;
      }
    }

    export async function disconnectDatabase() {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      connected = false;
    }

    export function getDatabaseStatus() {
      return {
        connected,
        readyState: mongoose.connection.readyState,
        name: mongoose.connection.name ?? null,
      };
    }
