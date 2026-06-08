import { Issuer, generators, type Client } from "openid-client";
import type { Request } from "express";
import { config } from "../config/env.js";

/**
 * Provider-agnostic OpenID Connect client. Works with Microsoft Entra ID or
 * on-prem ADFS (OIDC) — only OIDC_ISSUER / client id / secret / redirect change.
 * The IdP enforces MFA (e.g. Microsoft Authenticator / Defender), so this app
 * never sees a password for SSO users.
 *
 * Lazily discovers the issuer on first use; all functions assume OIDC_ENABLED.
 */

let clientPromise: Promise<Client> | null = null;

async function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const issuer = await Issuer.discover(config.OIDC_ISSUER);
      return new issuer.Client({
        client_id: config.OIDC_CLIENT_ID,
        client_secret: config.OIDC_CLIENT_SECRET || undefined,
        redirect_uris: [config.OIDC_REDIRECT_URI],
        response_types: ["code"],
        token_endpoint_auth_method: config.OIDC_CLIENT_SECRET
          ? "client_secret_post"
          : "none",
      });
    })().catch((err) => {
      // reset so a transient discovery failure can be retried next request
      clientPromise = null;
      throw err;
    });
  }
  return clientPromise;
}

export interface PkcePair {
  state: string;
  nonce: string;
  codeVerifier: string;
}

/** Generate fresh state / nonce / PKCE verifier for an auth request. */
export function newPkce(): PkcePair {
  return {
    state: generators.state(),
    nonce: generators.nonce(),
    codeVerifier: generators.codeVerifier(),
  };
}

/** Build the IdP authorization URL to redirect the user to. */
export async function buildAuthUrl(p: PkcePair): Promise<string> {
  const client = await getClient();
  return client.authorizationUrl({
    scope: config.OIDC_SCOPES,
    state: p.state,
    nonce: p.nonce,
    code_challenge: generators.codeChallenge(p.codeVerifier),
    code_challenge_method: "S256",
    response_mode: "query",
  });
}

export interface OidcClaims {
  email: string;
  name?: string;
  sub: string;
}

/**
 * Validate the callback and return the verified identity claims.
 * Throws if state/nonce/PKCE don't check out.
 */
export async function handleCallback(req: Request, p: PkcePair): Promise<OidcClaims> {
  const client = await getClient();
  const params = client.callbackParams(req);
  const tokenSet = await client.callback(config.OIDC_REDIRECT_URI, params, {
    state: p.state,
    nonce: p.nonce,
    code_verifier: p.codeVerifier,
  });
  const claims = tokenSet.claims();
  const extra = claims as Record<string, unknown>;
  const email = (
    (claims.email as string | undefined) ??
    (claims.preferred_username as string | undefined) ??
    (extra.upn as string | undefined) ??
    ""
  );
  return {
    email: email.toLowerCase(),
    name: claims.name as string | undefined,
    sub: claims.sub,
  };
}
