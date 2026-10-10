import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// Owner connection: used ONLY for identity (Better Auth), rate-limit storage,
// and admin jobs. Never use it for customer data reads on behalf of a user.
// Lazily initialized so importing this module doesn't crash when
// POSTGRES_URL_ADMIN is absent (e.g. in test/build environments).

let _adminSql: ReturnType<typeof postgres> | undefined;
let _adminDb: ReturnType<typeof drizzle> | undefined;

function getAdminSql() {
  if (!_adminSql) {
    const url = process.env.POSTGRES_URL_ADMIN;
    if (!url) throw new Error("POSTGRES_URL_ADMIN is not set");
    _adminSql = postgres(url);
  }
  return _adminSql;
}

export const adminSql: ReturnType<typeof postgres> = new Proxy(
  (() => {}) as unknown as ReturnType<typeof postgres>,
  {
    get(_, prop) { return (getAdminSql() as never)[prop]; },
    apply(_t, thisArg, args) {
      return (getAdminSql() as unknown as (...a: unknown[]) => unknown).apply(thisArg, args);
    },
  }
);

export const adminDb: ReturnType<typeof drizzle> = new Proxy(
  {} as ReturnType<typeof drizzle>,
  {
    get(_, prop) {
      if (!_adminDb) _adminDb = drizzle(getAdminSql());
      return (_adminDb as never)[prop];
    },
  }
);
