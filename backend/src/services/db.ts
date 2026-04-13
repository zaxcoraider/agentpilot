// DB is optional — if DATABASE_URL is not set, all DB operations silently no-op.
// Core onchainos functionality (swap, discover, protect, earn, pay) works without DB.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

function makeNoopProxy(): AnyRecord {
  return new Proxy({} as AnyRecord, {
    get() {
      return () => Promise.resolve(null);
    },
  });
}

let _client: AnyRecord | null = null;

function getDb(): AnyRecord {
  if (!process.env.DATABASE_URL) return makeNoopProxy();
  if (_client) return _client;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaClient } = require("@prisma/client");
    const g = globalThis as AnyRecord;
    _client = g["prisma"] ?? new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
    if (process.env.NODE_ENV !== "production") g["prisma"] = _client;
    return _client!;
  } catch {
    return makeNoopProxy();
  }
}

// Proxy that silently no-ops when DB is unavailable
export const db = new Proxy({} as AnyRecord, {
  get(_target, prop: string) {
    return getDb()[prop];
  },
}) as import("@prisma/client").PrismaClient;
