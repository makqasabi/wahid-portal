import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";

export interface TokenPayload {
  id: string;
  email: string;
  entityId: string;
  teamId: string;
  role: string;
  tokenVersion?: number;
}

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export function generateAccessToken(user: TokenPayload): string {
  return jwt.sign(
    { id: user.id, email: user.email, entityId: user.entityId, teamId: user.teamId, role: user.role, tokenVersion: user.tokenVersion ?? 0 },
    config.JWT_SECRET,
    { expiresIn: "1h" },
  );
}

export function generateRefreshToken(user: TokenPayload): string {
  return jwt.sign(
    { id: user.id, email: user.email, entityId: user.entityId, teamId: user.teamId, role: user.role, tokenVersion: user.tokenVersion ?? 0 },
    config.JWT_REFRESH_SECRET,
    { expiresIn: "7d" },
  );
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as TokenPayload;
    (req as AuthRequest).user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
