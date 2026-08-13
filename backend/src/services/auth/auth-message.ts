import type { IssuedLoginChallenge } from "./challenge.types.js";

export const AUTH_DOMAIN = "aegis.local";
export const AUTH_PURPOSE = "Authenticate with Aegis";

export function createAuthMessage(payload: Omit<IssuedLoginChallenge, "message">) {
  return [
    "Aegis Authentication Challenge",
    `Domain: ${payload.domain}`,
    `Wallet Address: ${payload.walletAddress}`,
    `Nonce: ${payload.nonce}`,
    `Issued At: ${payload.issuedAt}`,
    `Expires At: ${payload.expiresAt}`,
    `Purpose: ${payload.purpose}`,
  ].join("\n");
}

export function parseAuthMessage(message: string) {
  const lines = message.split("\n").map((line) => line.trim());

  if (lines.length !== 7 || lines[0] !== "Aegis Authentication Challenge") {
    return null;
  }

  const values = Object.fromEntries(
    lines.slice(1).map((line) => {
      const separatorIndex = line.indexOf(": ");
      if (separatorIndex === -1) {
        return ["", ""];
      }

      return [line.slice(0, separatorIndex), line.slice(separatorIndex + 2)];
    }),
  );

  const domain = values.Domain;
  const walletAddress = values["Wallet Address"];
  const nonce = values.Nonce;
  const issuedAt = values["Issued At"];
  const expiresAt = values["Expires At"];
  const purpose = values.Purpose;

  if (!domain || !walletAddress || !nonce || !issuedAt || !expiresAt || !purpose) {
    return null;
  }

  return {
    domain,
    walletAddress,
    nonce,
    issuedAt,
    expiresAt,
    purpose,
  };
}