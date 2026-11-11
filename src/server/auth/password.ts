import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { byteLength, PASSWORD_MAX_BYTES } from "@/server/validation/common";

function rounds(): number {
  const configured = Number(process.env.BCRYPT_ROUNDS ?? 12);
  const value = Number.isInteger(configured) ? configured : 12;
  // Tests may lower the cost; production never goes below 10.
  return process.env.NODE_ENV === "production" ? Math.max(10, value) : Math.max(4, value);
}

export async function hashPassword(password: string): Promise<string> {
  if (byteLength(password) > PASSWORD_MAX_BYTES) {
    throw new Error("Password exceeds bcrypt's 72-byte limit");
  }
  return bcrypt.hash(password, rounds());
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (byteLength(password) > PASSWORD_MAX_BYTES) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * A real hash of a random value. Sign-in compares against it when the email
 * doesn't exist, so response times don't reveal which emails have accounts.
 */
export function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash(randomBytes(16).toString("hex"), rounds());
  return dummyHash;
}
