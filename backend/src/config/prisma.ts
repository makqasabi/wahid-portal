import { PrismaClient } from "@prisma/client";

const base = new PrismaClient();

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
  },
});

export type ExtendedPrisma = typeof prisma;
export default prisma;
