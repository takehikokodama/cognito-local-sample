import express, { Request, Response } from "express";
import {
  generateKeyPair,
  exportJWK,
  exportPKCS8,
  importPKCS8,
  SignJWT,
  type JWK,
  type KeyLike,
} from "jose";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { users } from "./users";

const PORT = 4000;
const ISSUER = process.env.OIDC_ISSUER ?? "http://localhost:4000";
const CLIENT_ID = "local-client";
const KID = "local-key-1";
const KEYS_DIR = path.join(__dirname, "..", "keys");
const PRIVATE_KEY_FILE = path.join(KEYS_DIR, "private.pem");
const PUBLIC_JWK_FILE = path.join(KEYS_DIR, "public.jwk.json");

let privateKey: KeyLike;
let publicKeyJwk: JWK;

interface AuthCodeEntry {
  userId: string;
  redirectUri: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  nonce?: string;
  expiresAt: number;
}

const authCodes = new Map<string, AuthCodeEntry>();

async function loadOrGenerateKeys(): Promise<void> {
  if (fs.existsSync(PRIVATE_KEY_FILE) && fs.existsSync(PUBLIC_JWK_FILE)) {
    const pem = fs.readFileSync(PRIVATE_KEY_FILE, "utf8");
    privateKey = await importPKCS8(pem, "RS256");
    publicKeyJwk = JSON.parse(fs.readFileSync(PUBLIC_JWK_FILE, "utf8")) as JWK;
    console.log("[IdP] Loaded existing RSA key pair");
  } else {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
    const keyPair = await generateKeyPair("RS256", { extractable: true });
    const pem = await exportPKCS8(keyPair.privateKey);
    publicKeyJwk = await exportJWK(keyPair.publicKey);
    fs.writeFileSync(PRIVATE_KEY_FILE, pem);
    fs.writeFileSync(PUBLIC_JWK_FILE, JSON.stringify(publicKeyJwk));
    privateKey = keyPair.privateKey;
    console.log("[IdP] Generated new RSA key pair");
  }
}

async function signJwt(
  payload: Record<string, unknown>,
  expiresIn: string
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(privateKey);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main() {
  await loadOrGenerateKeys();

  const app = express();

  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
  });

  app.options("*", (_req, res) => {
    res.status(204).send();
  });

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  // OIDC Discovery
  app.get("/.well-known/openid-configuration", (_req: Request, res: Response) => {
    res.json({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`,
      end_session_endpoint: `${ISSUER}/logout`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      scopes_supported: ["openid", "email", "profile"],
      token_endpoint_auth_methods_supported: ["none"],
      claims_supported: [
        "sub",
        "iss",
        "aud",
        "email",
        "name",
        "cognito:groups",
        "custom:tenant_id",
      ],
      code_challenge_methods_supported: ["S256", "plain"],
    });
  });

  // JWKS
  app.get("/.well-known/jwks.json", (_req: Request, res: Response) => {
    res.json({
      keys: [{ ...publicKeyJwk, use: "sig", kid: KID, alg: "RS256" }],
    });
  });

  // Authorize endpoint - show user selection page
  app.get("/authorize", (req: Request, res: Response) => {
    const {
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method,
      response_type,
      client_id,
      nonce,
    } = req.query as Record<string, string>;

    if (response_type !== "code" || client_id !== CLIENT_ID) {
      res.status(400).send("Invalid request: unsupported response_type or client_id");
      return;
    }

    const buttons = users
      .map(
        (u) =>
          `<form method="POST" action="/authorize/login" style="display:inline-block;margin:8px">
            <input type="hidden" name="user_id" value="${escapeHtml(u.id)}">
            <input type="hidden" name="redirect_uri" value="${escapeHtml(redirect_uri ?? "")}">
            <input type="hidden" name="state" value="${escapeHtml(state ?? "")}">
            <input type="hidden" name="code_challenge" value="${escapeHtml(code_challenge ?? "")}">
            <input type="hidden" name="code_challenge_method" value="${escapeHtml(code_challenge_method ?? "")}">
            <input type="hidden" name="nonce" value="${escapeHtml(nonce ?? "")}">
            <button type="submit" style="padding:12px 24px;font-size:15px;cursor:pointer;border:1px solid #333;border-radius:6px;background:#fff">
              ${escapeHtml(u.name)}<br>
              <small style="color:#666">${escapeHtml(u.email)} [${escapeHtml(u.groups.join(", "))}]</small>
            </button>
          </form>`
      )
      .join("\n");

    res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Local IdP - ログイン</title>
</head>
<body style="font-family:sans-serif;max-width:600px;margin:80px auto;text-align:center">
  <h1>🔑 ローカル IdP</h1>
  <p>ログインするユーザーを選択してください:</p>
  <div style="margin-top:24px">
    ${buttons}
  </div>
</body>
</html>`);
  });

  // Handle login form POST
  app.post("/authorize/login", (req: Request, res: Response) => {
    const {
      user_id,
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method,
      nonce,
    } = req.body as Record<string, string>;

    const user = users.find((u) => u.id === user_id);
    if (!user || !redirect_uri) {
      res.status(400).send("Invalid user or missing redirect_uri");
      return;
    }

    const code = crypto.randomBytes(32).toString("hex");
    authCodes.set(code, {
      userId: user_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge || undefined,
      codeChallengeMethod: code_challenge_method || undefined,
      nonce: nonce || undefined,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const url = new URL(redirect_uri);
    url.searchParams.set("code", code);
    if (state) url.searchParams.set("state", state);

    res.redirect(url.toString());
  });

  // Token endpoint
  app.post("/token", async (req: Request, res: Response) => {
    const { grant_type, code, redirect_uri, client_id, code_verifier } =
      req.body as Record<string, string>;

    res.header("Cache-Control", "no-store");

    if (grant_type !== "authorization_code" || client_id !== CLIENT_ID) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }

    const entry = authCodes.get(code);
    if (!entry || Date.now() > entry.expiresAt) {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }

    if (entry.redirectUri !== redirect_uri) {
      res.status(400).json({
        error: "invalid_grant",
        error_description: "redirect_uri mismatch",
      });
      return;
    }

    // PKCE verification
    if (entry.codeChallenge) {
      if (!code_verifier) {
        res.status(400).json({
          error: "invalid_grant",
          error_description: "code_verifier required",
        });
        return;
      }

      let computed: string;
      if (entry.codeChallengeMethod === "S256") {
        computed = crypto
          .createHash("sha256")
          .update(code_verifier)
          .digest("base64url");
      } else {
        computed = code_verifier;
      }

      if (computed !== entry.codeChallenge) {
        res.status(400).json({
          error: "invalid_grant",
          error_description: "code_verifier mismatch",
        });
        return;
      }
    }

    authCodes.delete(code);

    const user = users.find((u) => u.id === entry.userId);
    if (!user) {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }

    const commonClaims = {
      sub: user.id,
      iss: ISSUER,
      client_id: CLIENT_ID,
      "cognito:groups": user.groups,
      "custom:tenant_id": user.tenantId,
      email: user.email,
    };

    const accessToken = await signJwt(
      {
        ...commonClaims,
        token_use: "access",
        scope: "openid email profile",
      },
      "1h"
    );

    const idToken = await signJwt(
      {
        ...commonClaims,
        token_use: "id",
        aud: CLIENT_ID,
        name: user.name,
        ...(entry.nonce ? { nonce: entry.nonce } : {}),
      },
      "1h"
    );

    res.json({
      access_token: accessToken,
      id_token: idToken,
      token_type: "Bearer",
      expires_in: 3600,
    });
  });

  // Logout endpoint
  app.get("/logout", (req: Request, res: Response) => {
    const { post_logout_redirect_uri } = req.query as Record<string, string>;
    if (post_logout_redirect_uri) {
      res.redirect(post_logout_redirect_uri);
    } else {
      res.send("Logged out");
    }
  });

  app.listen(PORT, () => {
    console.log(`[IdP] Running at http://localhost:${PORT}`);
  });
}

main().catch(console.error);
