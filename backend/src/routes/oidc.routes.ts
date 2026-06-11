import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "node:crypto";
import { config } from "../config/env.js";
import prisma from "../config/prisma.js";
import {
  generateAccessToken,
  generateRefreshToken,
  type TokenPayload,
} from "../middleware/auth.js";
import { newPkce, buildAuthUrl, handleCallback, type PkcePair } from "../services/oidc.service.js";
import { toggleEnabled } from "../services/settings.service.js";

const router = Router();

/** SSO is usable only when env credentials exist AND the admin toggle allows it. */
async function ssoEnabled(): Promise<boolean> {
  if (!config.OIDC_ISSUER || !config.OIDC_CLIENT_ID) return false;
  return toggleEnabled("oidc", config.OIDC_ENABLED);
}

// ── One-time SSO tickets (in-memory; single backend instance) ──
// The callback issues a ticket; the SPA exchanges it for the normal
// { accessToken, user } payload. Avoids putting tokens in the redirect URL.
const tickets = new Map<string, { userId: string; exp: number }>();

function issueTicket(userId: string): string {
  const t = crypto.randomBytes(24).toString("hex");
  tickets.set(t, { userId, exp: Date.now() + 60_000 });
  return t;
}

function consumeTicket(t: string): string | null {
  const entry = tickets.get(t);
  if (!entry) return null;
  tickets.delete(t);
  return Date.now() > entry.exp ? null : entry.userId;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of tickets) if (v.exp < now) tickets.delete(k);
}, 60_000).unref();

const isProduction = process.env.NODE_ENV === "production";
const TX_COOKIE = "oidc_tx";
const txCookieOpts = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  maxAge: 10 * 60 * 1000, // 10 min to complete the round-trip
  path: "/api/auth/oidc",
};

function frontend(pathAndQuery: string): string {
  return `${config.FRONTEND_URL.replace(/\/$/, "")}${pathAndQuery}`;
}

// ── GET /enabled — public: lets the login page decide whether to show the button
router.get("/enabled", async (_req, res: Response) => {
  res.json({ enabled: await ssoEnabled() });
});

// ── GET /login — kick off the OIDC redirect
router.get("/login", async (_req, res: Response) => {
  if (!(await ssoEnabled())) {
    res.status(404).json({ error: "SSO is not configured" });
    return;
  }
  try {
    const pkce = newPkce();
    // stash the transaction in a short-lived signed-ish cookie (httpOnly)
    res.cookie(TX_COOKIE, JSON.stringify(pkce), txCookieOpts);
    const url = await buildAuthUrl(pkce);
    res.redirect(url);
  } catch (err) {
    console.error("[OIDC] login init failed:", err);
    res.redirect(frontend("/login?sso_error=init_failed"));
  }
});

// ── GET /callback — IdP redirects here after (MFA) auth
router.get("/callback", async (req: Request, res: Response) => {
  if (!(await ssoEnabled())) {
    res.status(404).json({ error: "SSO is not configured" });
    return;
  }
  try {
    const raw = req.cookies?.[TX_COOKIE];
    res.clearCookie(TX_COOKIE, { path: "/api/auth/oidc" });
    if (!raw) {
      res.redirect(frontend("/login?sso_error=expired"));
      return;
    }
    const pkce = JSON.parse(raw) as PkcePair;
    const claims = await handleCallback(req, pkce);

    if (!claims.email) {
      res.redirect(frontend("/login?sso_error=no_email"));
      return;
    }

    let user = await prisma.user.findUnique({ where: { email: claims.email } });

    if (!user) {
      // "alongside" mode: only pre-existing users may sign in via SSO,
      // unless explicitly allowed to auto-provision later.
      if (!config.OIDC_ALLOW_SIGNUP) {
        res.redirect(frontend("/login?sso_error=not_provisioned"));
        return;
      }
      // (auto-provisioning intentionally not implemented yet — needs entity/team)
      res.redirect(frontend("/login?sso_error=not_provisioned"));
      return;
    }

    if (!user.isActive) {
      res.redirect(frontend("/login?sso_error=deactivated"));
      return;
    }

    // Link the Microsoft identity on first SSO login + clear any lockout
    await prisma.user.update({
      where: { id: user.id },
      data: {
        microsoftId: user.microsoftId ?? claims.sub,
        lastLogin: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    const ticket = issueTicket(user.id);
    res.redirect(frontend(`/auth/callback?ticket=${ticket}`));
  } catch (err) {
    console.error("[OIDC] callback failed:", err);
    res.redirect(frontend("/login?sso_error=failed"));
  }
});

// ── POST /exchange — SPA trades the one-time ticket for tokens + user
router.post("/exchange", async (req: Request, res: Response) => {
  try {
    const { ticket } = req.body as { ticket?: string };
    const userId = ticket ? consumeTicket(ticket) : null;
    if (!userId) {
      res.status(401).json({ error: "Invalid or expired sign-in ticket" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        entity: { select: { name: true } },
        team: { select: { name: true } },
      },
    });
    if (!user || !user.isActive) {
      res.status(401).json({ error: "User not found or deactivated" });
      return;
    }

    const payload: TokenPayload = {
      id: user.id,
      email: user.email,
      entityId: user.entityId,
      teamId: user.teamId,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    res.cookie("refreshToken", generateRefreshToken(payload), {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/auth",
    });

    res.json({
      accessToken: generateAccessToken(payload),
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        entityId: user.entityId,
        teamId: user.teamId,
        entity: { name: user.entity.name },
        team: { name: user.team.name },
        mfaEnabled: user.mfaEnabled,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (err) {
    console.error("[OIDC] exchange failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
