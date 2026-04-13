// DB is optional — if DATABASE_URL is not set, all DB operations silently no-op.
// Core onchainos functionality (swap, discover, protect, earn, pay) works without DB.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

function makeNoopProxy(): AnyRecord {
  const noop = (): Promise<null> => Promise.resolve(null);
  return new Proxy(noop as AnyRecord, {
    get() { return makeNoopProxy(); },
    apply() { return Promise.resolve(null); },
  });
}

let _client: AnyRecord | null = null;

function getDb(): AnyRecord {
  const url = process.env.DATABASE_URL || "";
  if (!url.startsWith("postgresql://") && !url.startsWith("postgres://")) return makeNoopProxy();
  if (_client) return _client;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaClient } = require("@prisma/client");
    const g = globalThis as AnyRecord;
    _client = g["prisma"] ?? new PrismaClient({ log: [] });
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
