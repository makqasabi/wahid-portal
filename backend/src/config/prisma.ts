import { PrismaClient } from "@prisma/client";
import { writeLog } from "../services/logStore.js";

const base = new PrismaClient();

/** Mirror a security/audit DB write into the SQLite log store. Never throws. */
function teeAudit(data: any) {
  try {
    writeLog({
      category: "audit",
      level: "info",
      message: `${data.action}${data.fieldName ? ` ${data.fieldName}` : ""}`,
      userId: data.userId ?? null,
      meta: {
        ticketId: data.ticketId,
        action: data.action,
        fieldName: data.fieldName ?? undefined,
        oldValue: data.oldValue ?? undefined,
        newValue: data.newValue ?? undefined,
      },
    });
  } catch {
    /* ignore */
  }
}

function teeLoginAttempt(data: any) {
  try {
    writeLog({
      category: "auth",
      level: data.success ? "info" : "warn",
      message: `login ${data.success ? "success" : "failed"}: ${data.email}`,
      userEmail: data.email ?? null,
      ip: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      meta: { success: data.success, reason: data.reason ?? undefined },
    });
  } catch {
    /* ignore */
  }
}

/** Unscoped client — bypasses the soft-delete filter. Use sparingly (e.g., display-ID generation, undelete). */
export const prismaUnscoped = base;

/**
 * Soft-delete extension for Ticket: queries automatically filter out rows
 * with deletedAt != null, so callers don't have to remember to add it.
 *
 * Caller can opt out by explicitly setting `deletedAt` in the where clause
 * (e.g., `where: { deletedAt: { not: null } }` for a trash view).
 *
 * findUnique can't take deletedAt in its where (not a unique field), so we
 * filter the result instead.
 */
const READ_OPS = new Set(["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy"]);
const WRITE_BY_WHERE_OPS = new Set(["update", "updateMany", "delete", "deleteMany"]);

function injectNotDeleted(args: any) {
  const where = args?.where ?? {};
  if (where.deletedAt !== undefined) return args; // caller opted out
  return { ...(args ?? {}), where: { ...where, deletedAt: null } };
}

const prisma = base.$extends({
  query: {
    ticket: {
      async $allOperations({ operation, args, query }) {
        if (READ_OPS.has(operation) || WRITE_BY_WHERE_OPS.has(operation)) {
          return query(injectNotDeleted(args));
        }
        if (operation === "findUnique" || operation === "findUniqueOrThrow") {
          const result: any = await query(args);
          if (result?.deletedAt) return null as any;
          return result;
        }
        return query(args);
      },
    },
    // Mirror the security/audit trail into the SQLite log store at the single
    // source of truth, so it's captured no matter which route wrote it.
    auditLog: {
      async create({ args, query }) {
        const r = await query(args);
        teeAudit(args.data);
        return r;
      },
      async createMany({ args, query }) {
        const r = await query(args);
        const rows = Array.isArray(args.data) ? args.data : [args.data];
        for (const d of rows) teeAudit(d);
        return r;
      },
    },
    loginAttempt: {
      async create({ args, query }) {
        const r = await query(args);
        teeLoginAttempt(args.data);
        return r;
      },
    },
  },
});

export type ExtendedPrisma = typeof prisma;
export default prisma;
