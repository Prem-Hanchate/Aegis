#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign } from "node:crypto";

const statePath = new URL("./.aegis-device.json", import.meta.url);
const apiBaseUrl = process.env.AEGIS_API_URL || "http://127.0.0.1:4000/api";

function readState() {
  if (!existsSync(statePath)) return null;
  return JSON.parse(readFileSync(statePath, "utf8"));
}

function writeState(state) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

function required(name, value) {
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

async function request(path, token, init = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `Aegis request failed (${response.status}).`);
  }
  return body;
}

function proofPayload(deviceId, sessionId, timestamp, method, path) {
  return [
    "Aegis-Device-Proof:v1",
    deviceId,
    sessionId,
    timestamp,
    method.toUpperCase(),
    path,
  ].join("\n");
}

async function pair(args) {
  const token = required("--token", args.token);
  const name = required("--name", args.name);
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "jwk" },
  });
  const response = await request("/devices/pair", token, {
    method: "POST",
    body: JSON.stringify({ name, publicKey: JSON.stringify(publicKey) }),
  });
  writeState({ deviceId: response.device.deviceId, privateKey, publicKey, name });
  console.log(JSON.stringify(response, null, 2));
  console.log("Device key saved locally. An administrator must approve this device before access is allowed.");
}

async function access(args) {
  const token = required("--token", args.token);
  const resource = required("--resource", args.resource);
  const state = required("tools/.aegis-device.json", readState());
  const session = await request("/auth/me", token);
  const path = `/api/resources/${resource}`;
  const timestamp = new Date().toISOString();
  const signature = sign(
    "sha256",
    Buffer.from(proofPayload(state.deviceId, session.session.sessionId, timestamp, "GET", path)),
    createPrivateKey(state.privateKey),
  ).toString("base64url");
  const response = await request(path, token, {
    headers: {
      "X-Aegis-Device-Timestamp": timestamp,
      "X-Aegis-Device-Signature": signature,
    },
  });
  console.log(JSON.stringify(response, null, 2));
}

const args = Object.fromEntries(
  process.argv.slice(2).reduce((entries, value, index, values) => {
    if (value.startsWith("--")) entries.push([value, values[index + 1]]);
    return entries;
  }, []),
);

try {
  if (process.argv[2] === "pair") await pair(args);
  else if (process.argv[2] === "access") await access(args);
  else {
    console.error("Usage: node tools/device-agent.mjs pair --token <session-token> --name <device-name>");
    console.error("   or: node tools/device-agent.mjs access --token <session-token> --resource <employee|reports|payroll>");
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
