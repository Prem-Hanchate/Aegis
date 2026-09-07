import mongoose from "mongoose";
import { env } from "./env.js";

let connected = false;

export async function connectDatabase() {
  if (!env.mongodbUri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  if (mongoose.connection.readyState === 1) {
    connected = true;
    return { connected: true, skipped: false };
  }

  try {
    await mongoose.connect(env.mongodbUri);
    connected = true;
    console.log("MongoDB Connected Successfully");
    console.log(`Database: ${mongoose.connection.name}`);
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
