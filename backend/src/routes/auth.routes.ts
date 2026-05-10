import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import * as OTPAuth from "otpauth";
import { config } from "../config/env.js";
import prisma from "../config/prisma.js";
import { authenticateToken, generateAccessToken, generateRefreshToken } from "../middleware/auth.js";
import type { AuthRequest, TokenPayload } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { validateBody } from "../middleware/validate.js";
import {
  loginSchema,
  changePasswordSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../schemas/auth.schema.js";

const router = Router();

// ── Helpers ─────────────────────────────────────────────────

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
}

async function logLoginAttempt(
  email: string,
  success: boolean,
  req: Request,
  reason?: string,
): Promise<void> {
  try {
    await prisma.loginAttempt.create({
      data: {
        email,
        success,
        ipAddress: getClientIp(req),
        userAgent: (req.headers["user-agent"] ?? "unknown").substring(0, 500),
        reason,
      },
    });
  } catch (err) {
    console.error("Failed to log login attempt:", err);
  }
}

// ── POST /login ──────────────────────────────────────────────

router.post("/login", authLimiter, validateBody(loginSchema), async (req, res: Response) => {
  try {
    const { email, password, totpCode } = req.body as {
      email: string;
      password: string;
      totpCode?: string;
    };

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        entity: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      await logLoginAttempt(email, false, req, "user_not_found");
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    if (!user.isActive) {
      await logLoginAttempt(email, false, req, "account_deactivated");
      res.status(403).json({ error: "Account is deactivated" });
      return;
    }

    // ── Brute-force lockout check ──
    if (user.lockedUntil && new Date() < user.lockedUntil) {
      const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
      await logLoginAttempt(email, false, req, "account_locked");
      res.status(423).json({
        error: `Account is locked. Try again in ${minutesLeft} minute(s).`,
      });
      return;
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      // Increment failed attempts
      const attempts = user.failedLoginAttempts + 1;
      const lockData: Record<string, any> = { failedLoginAttempts: attempts };
      if (attempts >= LOCKOUT_THRESHOLD) {
        lockData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      }
      await prisma.user.update({ where: { id: user.id }, data: lockData });

      await logLoginAttempt(email, false, req, "invalid_password");

      if (attempts >= LOCKOUT_THRESHOLD) {
        res.status(423).json({
          error: "Too many failed attempts. Account locked for 15 minutes.",
        });
      } else {
        res.status(401).json({
          error: "Invalid email or password",
          attemptsRemaining: LOCKOUT_THRESHOLD - attempts,
        });
      }
      return;
    }

    // ── 2FA check ──
    if (user.mfaEnabled && user.mfaSecret) {
      if (!totpCode) {
        // Password correct but 2FA required — tell frontend to ask for code
        res.status(200).json({
          requires2FA: true,
          message: "Enter your 2FA code to continue",
        });
        return;
      }

      const totp = new OTPAuth.TOTP({
        issuer: "Wahid",
        label: user.email,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(user.mfaSecret),
      });

      const delta = totp.validate({ token: totpCode, window: 1 });
      if (delta === null) {
        await logLoginAttempt(email, false, req, "invalid_2fa_code");
        res.status(401).json({ error: "Invalid 2FA code" });
        return;
      }
    }

    // ── Login success — reset lockout ──
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLogin: new Date(),
      },
    });

    await logLoginAttempt(email, true, req);

    const tokenPayload: TokenPayload = {
      id: user.id,
      email: user.email,
      entityId: user.entityId,
      teamId: user.teamId,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Set refresh token as httpOnly cookie
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/auth",
    });

    res.json({
      accessToken,
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
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /refresh ────────────────────────────────────────────

router.post("/refresh", validateBody(refreshSchema), async (req, res: Response) => {
  try {
    const token: string | undefined =
      req.cookies?.refreshToken || (req.body as { refreshToken?: string }).refreshToken;

    if (!token) {
      res.status(401).json({ error: "Refresh token is required" });
      return;
    }

    let decoded: TokenPayload;
    try {
      decoded = jwt.verify(token, config.JWT_REFRESH_SECRET) as TokenPayload;
    } catch {
      res.status(401).json({ error: "Invalid or expired refresh token" });
      return;
    }

    // Verify user still exists, is active, and token version matches
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true, email: true, entityId: true, teamId: true,
        role: true, isActive: true, tokenVersion: true,
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ error: "User not found or deactivated" });
      return;
    }

    // Token version mismatch = password was changed, invalidate all sessions
    if (decoded.tokenVersion !== undefined && decoded.tokenVersion !== user.tokenVersion) {
      res.status(401).json({ error: "Session invalidated. Please log in again." });
      return;
    }

    const tokenPayload: TokenPayload = {
      id: user.id,
      email: user.email,
      entityId: user.entityId,
      teamId: user.teamId,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    const newAccessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "strict" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/api/auth",
    });

    res.json({ accessToken: newAccessToken });
  } catch (error) {
    console.error("Refresh error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /logout ─────────────────────────────────────────────

router.post("/logout", (_req, res: Response) => {
  res.clearCookie("refreshToken", { path: "/api/auth" });
  res.json({ message: "Logged out successfully" });
});

// ── POST /change-password ────────────────────────────────────

router.post(
  "/change-password",
  authenticateToken,
  validateBody(changePasswordSchema),
  async (req, res: Response) => {
    try {
      const authReq = req as AuthRequest;
      const { oldPassword, newPassword } = req.body as { oldPassword: string; newPassword: string };

      const user = await prisma.user.findUnique({
        where: { id: authReq.user!.id },
        select: { id: true, passwordHash: true, tokenVersion: true },
      });

      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const passwordValid = await bcrypt.compare(oldPassword, user.passwordHash);
      if (!passwordValid) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }

      const newHash = await bcrypt.hash(newPassword, 12);

      // Increment tokenVersion to invalidate all existing sessions
      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: newHash,
          tokenVersion: user.tokenVersion + 1,
          mustChangePassword: false,
        },
      });

      res.json({ message: "Password changed successfully. Please log in again." });
    } catch (error) {
      console.error("Change password error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ── 2FA Setup Endpoints ──────────────────────────────────────

// POST /2fa/setup — Generate secret and QR code URL
router.post("/2fa/setup", authenticateToken, async (req, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, mfaEnabled: true },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (user.mfaEnabled) {
      res.status(400).json({ error: "2FA is already enabled" });
      return;
    }

    // Generate a new secret
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: "Wahid",
      label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });

    // Store secret (not yet enabled — user must verify first)
    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret.base32 },
    });

    res.json({
      secret: secret.base32,
      otpauthUrl: totp.toString(),
    });
  } catch (error) {
    console.error("2FA setup error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /2fa/verify — Verify TOTP code and enable 2FA
router.post("/2fa/verify", authenticateToken, async (req, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { code } = req.body as { code: string };

    if (!code) {
      res.status(400).json({ error: "Verification code is required" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, mfaSecret: true, mfaEnabled: true },
    });

    if (!user || !user.mfaSecret) {
      res.status(400).json({ error: "2FA setup not initiated" });
      return;
    }

    if (user.mfaEnabled) {
      res.status(400).json({ error: "2FA is already enabled" });
      return;
    }

    const totp = new OTPAuth.TOTP({
      issuer: "Wahid",
      label: user.email,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(user.mfaSecret),
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      res.status(401).json({ error: "Invalid verification code" });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });

    res.json({ message: "2FA enabled successfully" });
  } catch (error) {
    console.error("2FA verify error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /2fa/disable — Disable 2FA (requires password confirmation)
router.post("/2fa/disable", authenticateToken, async (req, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;
    const { password } = req.body as { password: string };

    if (!password) {
      res.status(400).json({ error: "Password is required to disable 2FA" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, mfaEnabled: true },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      res.status(401).json({ error: "Invalid password" });
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null },
    });

    res.json({ message: "2FA disabled" });
  } catch (error) {
    console.error("2FA disable error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /forgot-password ────────────────────────────────────

router.post(
  "/forgot-password",
  authLimiter,
  validateBody(forgotPasswordSchema),
  async (req, res: Response) => {
    try {
      const { email } = req.body as { email: string };
      const successMsg = "If an account with that email exists, a reset link has been generated.";

      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, isActive: true, fullName: true },
      });

      if (!user || !user.isActive) {
        res.json({ message: successMsg });
        return;
      }

      // Invalidate any existing reset tokens for this user
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      await prisma.passwordResetToken.create({
        data: { userId: user.id, token, expiresAt },
      });

      console.log(`[Password Reset] User: ${user.fullName} (${email}) — Token: ${token.slice(0, 8)}… — Expires: ${expiresAt.toISOString()}`);

      res.json({ message: successMsg });
    } catch (error) {
      console.error("Forgot password error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ── POST /reset-password ─────────────────────────────────────

router.post(
  "/reset-password",
  authLimiter,
  validateBody(resetPasswordSchema),
  async (req, res: Response) => {
    try {
      const { token, newPassword } = req.body as { token: string; newPassword: string };

      const entry = await prisma.passwordResetToken.findUnique({
        where: { token },
      });

      if (!entry || entry.usedAt) {
        res.status(400).json({ error: "Invalid or expired reset code" });
        return;
      }

      if (new Date() > entry.expiresAt) {
        await prisma.passwordResetToken.update({
          where: { id: entry.id },
          data: { usedAt: new Date() },
        });
        res.status(400).json({ error: "Reset code has expired" });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: entry.userId },
        select: { tokenVersion: true },
      });

      const newHash = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({
        where: { id: entry.userId },
        data: {
          passwordHash: newHash,
          tokenVersion: (user?.tokenVersion ?? 0) + 1,
          mustChangePassword: false,
        },
      });

      // Mark token as used
      await prisma.passwordResetToken.update({
        where: { id: entry.id },
        data: { usedAt: new Date() },
      });
      res.json({ message: "Password has been reset successfully" });
    } catch (error) {
      console.error("Reset password error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
