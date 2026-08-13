import mongoose from "mongoose";
import { env } from "./env.js";

let connected = false;

export async function connectDatabase() {
  if (!env.mongodbUri) {
    connected = false;
    return { connected: false, skipped: true };
  }

  if (mongoose.connection.readyState === 1) {
    connected = true;
    return { connected: true, skipped: false };
  }

  await mongoose.connect(env.mongodbUri);
  connected = true;
  return { connected: true, skipped: false };
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
