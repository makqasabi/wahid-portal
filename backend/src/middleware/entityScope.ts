import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./auth.js";

export interface ScopedRequest extends AuthRequest {
  entityScope?: string | null; // null = super admin (no filter)
}

export function entityScopeMiddleware(req: ScopedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (req.user.role === "SUPER_ADMIN") {
    req.entityScope = null;
  } else {
    req.entityScope = req.user.entityId;
  }

  next();
}

/**
 * Returns a Prisma-compatible filter object.
 * Super admins get an empty filter (see all data).
 * All other roles are scoped to their entity.
 */
export function applyScopeFilter(req: ScopedRequest): { entityId?: string } {
  if (req.entityScope === null || req.entityScope === undefined) {
    // SUPER_ADMIN or unset -- no scope restriction
    if (req.user?.role === "SUPER_ADMIN") {
      return {};
    }
  }
  return req.entityScope ? { entityId: req.entityScope } : {};
}
