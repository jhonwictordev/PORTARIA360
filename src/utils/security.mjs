import crypto from "node:crypto";

const APP_SECRET = process.env.APP_SECRET ?? "condo-access-demo-secret";
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET ?? `${APP_SECRET}-enc`;
const TOKEN_TTL_SECONDS = 60 * 60 * 12;

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64url(input) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function deriveKey(secret) {
  return crypto.createHash("sha256").update(secret).digest();
}

export function randomId(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 120000;
  const digest = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex");
  return `${iterations}$${salt}$${digest}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const [iterations, salt, digest] = storedHash.split("$");
  const candidate = crypto.pbkdf2Sync(password, salt, Number(iterations), 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(digest, "hex"));
}

export function signToken(payload, ttlSeconds = TOKEN_TTL_SECONDS) {
  const fullPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds
  };
  const encodedPayload = base64url(JSON.stringify(fullPayload));
  const signature = crypto.createHmac("sha256", APP_SECRET).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyToken(token) {
  if (!token?.includes(".")) return null;
  const [encodedPayload, signature] = token.split(".");
  const expected = crypto.createHmac("sha256", APP_SECRET).update(encodedPayload).digest("base64url");
  if (signature !== expected) return null;

  const payload = JSON.parse(fromBase64url(encodedPayload).toString("utf8"));
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function encryptSensitive(value) {
  if (!value) return "";
  const iv = crypto.randomBytes(12);
  const key = deriveKey(ENCRYPTION_SECRET);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSensitive(payload) {
  if (!payload) return "";
  const [ivHex, tagHex, encryptedHex] = payload.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(ENCRYPTION_SECRET), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]);
  return decrypted.toString("utf8");
}

export function maskValue(value) {
  if (!value) return "";
  if (value.length <= 4) return value;
  return `${value.slice(0, 2)}${"*".repeat(Math.max(2, value.length - 4))}${value.slice(-2)}`;
}

export function generateTemporaryCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join("");
}

export function generateOneTimeCode(length = 6) {
  return Array.from({ length }, () => crypto.randomInt(0, 10)).join("");
}

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  const chunks = bits.match(/.{1,5}/g) ?? [];
  return chunks
    .map((chunk) => BASE32_ALPHABET[Number.parseInt(chunk.padEnd(5, "0"), 2)])
    .join("");
}

export function base32Decode(input) {
  const normalized = input.replace(/=+$/g, "").toUpperCase();
  let bits = "";
  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{1,8}/g) ?? [];
  return Buffer.from(
    bytes
      .filter((chunk) => chunk.length === 8)
      .map((chunk) => Number.parseInt(chunk, 2))
  );
}

export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

export function generateTotp(secret, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const secretBuffer = base32Decode(secret);
  const digest = crypto.createHmac("sha1", secretBuffer).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 1000000).padStart(6, "0");
}

export function verifyTotp(code, secret, tolerance = 1) {
  if (!code || !secret) return false;
  for (let step = -tolerance; step <= tolerance; step += 1) {
    const candidate = generateTotp(secret, Date.now() + step * 30000);
    if (candidate === String(code)) return true;
  }
  return false;
}

export function buildProvisioningUri({ secret, email, issuer = "App Portaria360" }) {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(
    issuer
  )}`;
}
