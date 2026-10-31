import mongoose from "mongoose";
import { env } from "./env.js";

let connected = false;
let lastError: string | null = null;
let listenersRegistered = false;

function registerConnectionListeners() {
  if (listenersRegistered) {
    return;
  }
  listenersRegistered = true;

  mongoose.connection.on("connected", () => {
    connected = true;
    lastError = null;
  });
  mongoose.connection.on("reconnected", () => {
    connected = true;
    lastError = null;
    console.log("MongoDB connection recovered");
  });
  mongoose.connection.on("disconnected", () => {
    connected = false;
  });
  mongoose.connection.on("error", (error: Error) => {
    connected = false;
    lastError = error.message;
    console.error(`MongoDB connection error: ${error.message}`);
  });
}

export async function connectDatabase(uri?: string) {
  const connectionUri = uri ?? env.mongodbUri;
  if (!connectionUri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  registerConnectionListeners();

  if (mongoose.connection.readyState === 1) {
    connected = true;
    return { connected: true, skipped: false };
  }

  try {
    await mongoose.connect(connectionUri, {
      serverSelectionTimeoutMS: env.mongodbServerSelectionTimeoutMs,
      connectTimeoutMS: env.mongodbServerSelectionTimeoutMs,
    });
    connected = true;
    lastError = null;
    console.log("MongoDB Connected Successfully");
    console.log(`Database: ${mongoose.connection.name}`);
    return { connected: true, skipped: false };
  } catch (error) {
    connected = false;
    const message = error instanceof Error ? error.message : "Unknown MongoDB connection error.";
    lastError = message;
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
    lastError,
  };
}
