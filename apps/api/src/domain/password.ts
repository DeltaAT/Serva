import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(value: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(value, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(value: string, stored: string) {
  const [algorithm, saltB64, hashB64] = stored.split("$");
  if (algorithm !== "scrypt" || !saltB64 || !hashB64) {
    return false;
  }

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(value, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

