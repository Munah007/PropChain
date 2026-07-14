// Hand-rolled request validation helpers (kept dependency-free on purpose —
// no class-validator in this workspace). Every helper throws a 400 so
// malformed input never reaches Solana code and never turns into a 500.

import { BadRequestException } from "@nestjs/common";
import { PublicKey } from "@solana/web3.js";

/** Parse a base58 address or 400 — never let PublicKey throw a raw error. */
export function parsePublicKey(value: unknown, field: string): PublicKey {
  if (typeof value !== "string" || !value) {
    throw new BadRequestException(`${field} required`);
  }
  try {
    return new PublicKey(value);
  } catch {
    throw new BadRequestException(`${field} is not a valid base58 address`);
  }
}

export function requireString(value: unknown, field: string, maxLength = 190): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException(`${field} required`);
  }
  const s = value.trim();
  if (s.length > maxLength) {
    throw new BadRequestException(`${field} too long (max ${maxLength} chars)`);
  }
  return s;
}

export interface NumberBounds {
  min?: number;
  max?: number;
  integer?: boolean;
}

export function requireNumber(value: unknown, field: string, bounds: NumberBounds = {}): number {
  const n = typeof value === "number" ? value : Number(value);
  if (value == null || value === "" || !Number.isFinite(n)) {
    throw new BadRequestException(`${field} must be a number`);
  }
  if (bounds.integer && !Number.isInteger(n)) {
    throw new BadRequestException(`${field} must be an integer`);
  }
  if (bounds.min !== undefined && n < bounds.min) {
    throw new BadRequestException(`${field} must be >= ${bounds.min}`);
  }
  if (bounds.max !== undefined && n > bounds.max) {
    throw new BadRequestException(`${field} must be <= ${bounds.max}`);
  }
  return n;
}
