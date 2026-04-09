/**
 * Google OAuth 2.0 — Direct integration
 * Shows "CloudPDF" on the Google consent screen.
 *
 * Routes:
 *   GET /api/auth/google          — Redirect user to Google
 *   GET /api/auth/google/callback — Handle Google callback, create session
 */

import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";
import * as db from "../db";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

function buildGoogleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: ENV.googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const params = new URLSearchParams({
    code,
    client_id: ENV.googleClientId,
    client_secret: ENV.googleClientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  return res.json() as Promise<{ access_token: string; id_token: string }>;
}

async function getGoogleUserInfo(accessToken: string) {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error("Failed to fetch Google user info");
  }

  return res.json() as Promise<{
    sub: string;       // Google user ID
    email: string;
    name: string;
    picture?: string;
    email_verified: boolean;
  }>;
}

export function registerGoogleOAuthRoutes(app: Express) {
  const callbackUrl = `${ENV.appUrl}/api/auth/google/callback`;

  // Step 1: Redirect to Google
  app.get("/api/auth/google", (req: Request, res: Response) => {
    const origin = (req.query.origin as string) || ENV.appUrl;
    const returnPath = (req.query.returnPath as string) || "/";

    // Encode state so callback knows where to redirect after login
    const stateData = JSON.stringify({ origin, returnPath });
    const state = Buffer.from(stateData).toString("base64url");

    const authUrl = buildGoogleAuthUrl(callbackUrl, state);

    res.redirect(302, authUrl);
  });

  // Step 2: Handle Google callback
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    const error = req.query.error as string | undefined;

    if (error) {
      console.error("[Google OAuth] User denied access:", error);
      return res.redirect(302, "/?error=google_denied");
    }

    if (!code || !state) {
      return res.status(400).json({ error: "code and state are required" });
    }

    try {
      // Decode state
      let origin = ENV.appUrl;
      let returnPath = "/";
      try {
        const stateData = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
        if (stateData.origin) origin = stateData.origin;
        if (stateData.returnPath && typeof stateData.returnPath === "string") {
          const rp = stateData.returnPath;
          if (rp.startsWith("/") && !rp.startsWith("//")) returnPath = rp;
        }
      } catch {
        // Use defaults
      }

      const redirectUri = callbackUrl;

      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(code, redirectUri);

      // Get user info from Google
      const googleUser = await getGoogleUserInfo(tokens.access_token);

      if (!googleUser.sub) {
        return res.status(400).json({ error: "Google user ID missing" });
      }

      // Find or create user in our DB
      let user = await db.getUserByGoogleId(googleUser.sub);

      if (!user) {
        // Check if email already exists (user registered with email/password)
        const existingByEmail = await db.getUserByEmail(googleUser.email);
        if (existingByEmail) {
          // Link Google ID to existing account
          await db.setGoogleId(existingByEmail.id, googleUser.sub);
          user = (await db.getUserById(existingByEmail.id)) ?? undefined;
        } else {
          // Create new user
          const role = googleUser.email === "sergisd39@gmail.com" ? "admin" : "user";
          user = (await db.createOwnUser({
            email: googleUser.email,
            name: googleUser.name || googleUser.email.split("@")[0],
            googleId: googleUser.sub,
            loginMethod: "google",
            role,
          })) ?? undefined;
        }
      }

      if (!user) {
        return res.status(500).json({ error: "Failed to create or find user" });
      }

      // Create session token using the same SDK as the rest of the app
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name ?? "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      console.log(`[Google OAuth] User logged in: ${user.email} (${user.openId})`);
      console.log(`[Google OAuth] State decoded - origin: ${origin}, returnPath: ${returnPath}`);
      console.log(`[Google OAuth] Cookie set with options:`, JSON.stringify(cookieOptions));
      console.log(`[Google OAuth] Redirecting to: ${origin}${returnPath}`);
      // Use full origin + returnPath so user returns to the correct page
      res.redirect(302, `${origin}${returnPath}`);
    } catch (err) {
      console.error("[Google OAuth] Callback error:", err);
      res.redirect(302, "/?error=google_auth_failed");
    }
  });
}
