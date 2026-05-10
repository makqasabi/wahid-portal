import type { Response, NextFunction } from "express";
import type { AuthRequest } from "./auth.js";

const ROLE_HIERARCHY: readonly string[] = [
  "SUPER_ADMIN",
  "ENTITY_ADMIN",
  "TEAM_LEAD",
  "MEMBER",
  "OBSERVER",
  "EXTERNAL_STAKEHOLDER",
] as const;

type Role = (typeof ROLE_HIERARCHY)[number];

/**
 * Middleware factory that checks whether the authenticated user
 * holds one of the explicitly listed roles.
 */
export function requireRole(...roles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden: insufficient role privileges" });
      return;
    }

    next();
  };
}

/**
 * Middleware factory that enforces a minimum role level based on the
 * hierarchy: SUPER_ADMIN > ENTITY_ADMIN > TEAM_LEAD > MEMBER > OBSERVER > EXTERNAL_STAKEHOLDER
 */
export function requireMinRole(minRole: Role) {
  const minIndex = ROLE_HIERARCHY.indexOf(minRole);

  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const userIndex = ROLE_HIERARCHY.indexOf(req.user.role);

    // Lower index = higher privilege. -1 means unknown role.
    if (userIndex === -1 || userIndex > minIndex) {
      res.status(403).json({ error: "Forbidden: insufficient role level" });
      return;
    }

    next();
  };
}
