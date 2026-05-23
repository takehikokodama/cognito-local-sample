import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { generateKeyPair, exportJWK, jwtVerify, decodeJwt } from "jose";
import request from "supertest";
import { createApp, setKeys, clearAuthCodes } from "./server";
import { verifyPkce } from "./pkce";
import type { Application } from "express";
import crypto from "crypto";

let app: Application;

beforeAll(async () => {
  const keyPair = await generateKeyPair("RS256", { extractable: true });
  const jwk = await exportJWK(keyPair.publicKey);
  setKeys(keyPair.privateKey, jwk);
  app = createApp();
});

beforeEach(() => {
  clearAuthCodes();
});

// ---------------------------------------------------------------------------
// PKCE ユーティリティ
// ---------------------------------------------------------------------------

describe("verifyPkce", () => {
  it("S256: sha256(verifier) の base64url が challenge と一致すれば true", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64url");
    expect(verifyPkce(verifier, challenge, "S256")).toBe(true);
  });

  it("S256: verifier が違えば false", () => {
    const challenge = crypto
      .createHash("sha256")
      .update("correct-verifier")
      .digest("base64url");
    expect(verifyPkce("wrong-verifier", challenge, "S256")).toBe(false);
  });

  it("plain: verifier と challenge が同じなら true", () => {
    expect(verifyPkce("my-secret", "my-secret", "plain")).toBe(true);
  });

  it("plain: 異なれば false", () => {
    expect(verifyPkce("wrong", "my-secret", "plain")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OIDC Discovery / JWKS
// ---------------------------------------------------------------------------

describe("GET /.well-known/openid-configuration", () => {
  it("issuer が http://localhost:4000 である", async () => {
    const res = await request(app).get("/.well-known/openid-configuration");
    expect(res.status).toBe(200);
    expect(res.body.issuer).toBe("http://localhost:4000");
    expect(res.body.token_endpoint).toBe("http://localhost:4000/token");
    expect(res.body.jwks_uri).toBe(
      "http://localhost:4000/.well-known/jwks.json"
    );
  });
});

describe("GET /.well-known/jwks.json", () => {
  it("RSA 公開鍵が kid=local-key-1 で返る", async () => {
    const res = await request(app).get("/.well-known/jwks.json");
    expect(res.status).toBe(200);
    expect(res.body.keys).toHaveLength(1);
    expect(res.body.keys[0].kid).toBe("local-key-1");
    expect(res.body.keys[0].kty).toBe("RSA");
    expect(res.body.keys[0].alg).toBe("RS256");
  });
});

// ---------------------------------------------------------------------------
// Authorization Code フロー
// ---------------------------------------------------------------------------

const REDIRECT_URI = "http://localhost:5173/callback";
const CLIENT_ID = "local-client";

async function getAuthCode(
  userId: string,
  opts: { codeChallenge?: string; codeChallengeMethod?: string; nonce?: string } = {}
) {
  const res = await request(app)
    .post("/authorize/login")
    .type("form")
    .send({
      user_id: userId,
      redirect_uri: REDIRECT_URI,
      state: "test-state",
      code_challenge: opts.codeChallenge ?? "",
      code_challenge_method: opts.codeChallengeMethod ?? "",
      nonce: opts.nonce ?? "",
    });
  expect(res.status).toBe(302);
  const location = res.headers["location"] as string;
  return new URL(location).searchParams.get("code")!;
}

async function exchangeCode(
  code: string,
  opts: { codeVerifier?: string } = {}
) {
  return request(app)
    .post("/token")
    .type("form")
    .send({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: opts.codeVerifier ?? "",
    });
}

describe("POST /authorize/login", () => {
  it("有効なユーザーID → code を含む redirect", async () => {
    const res = await request(app)
      .post("/authorize/login")
      .type("form")
      .send({
        user_id: "user-admin-1",
        redirect_uri: REDIRECT_URI,
        state: "my-state",
        code_challenge: "",
        code_challenge_method: "",
        nonce: "",
      });
    expect(res.status).toBe(302);
    const url = new URL(res.headers["location"] as string);
    expect(url.searchParams.get("code")).toBeTruthy();
    expect(url.searchParams.get("state")).toBe("my-state");
  });

  it("不正なユーザーID → 400", async () => {
    const res = await request(app)
      .post("/authorize/login")
      .type("form")
      .send({
        user_id: "no-such-user",
        redirect_uri: REDIRECT_URI,
        state: "",
        code_challenge: "",
        code_challenge_method: "",
        nonce: "",
      });
    expect(res.status).toBe(400);
  });
});

describe("POST /token", () => {
  it("有効な code → access_token と id_token を返す", async () => {
    const code = await getAuthCode("user-admin-1");
    const res = await exchangeCode(code);
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.id_token).toBeTruthy();
    expect(res.body.token_type).toBe("Bearer");
    expect(res.body.expires_in).toBe(3600);
  });

  it("access_token のクレームが正しい", async () => {
    const code = await getAuthCode("user-admin-1");
    const { body } = await exchangeCode(code);
    const payload = decodeJwt(body.access_token as string);

    expect(payload.sub).toBe("user-admin-1");
    expect(payload.iss).toBe("http://localhost:4000");
    expect(payload.token_use).toBe("access");
    expect(payload.email).toBe("admin@example.com");
    expect(payload["cognito:groups"]).toContain("admin");
    expect(payload["custom:tenant_id"]).toBe("tenant-a");
  });

  it("access_token の署名が JWKS で検証できる", async () => {
    const code = await getAuthCode("user-normal-1");
    const { body } = await exchangeCode(code);

    const jwksRes = await request(app).get("/.well-known/jwks.json");
    const { createLocalJWKSet } = await import("jose");
    const jwks = createLocalJWKSet(jwksRes.body as Parameters<typeof createLocalJWKSet>[0]);

    const { payload } = await jwtVerify(body.access_token as string, jwks, {
      issuer: "http://localhost:4000",
    });
    expect(payload.sub).toBe("user-normal-1");
  });

  it("同じ code を2回使うと2回目は invalid_grant", async () => {
    const code = await getAuthCode("user-normal-1");
    await exchangeCode(code); // 1回目: 成功してコードを消費
    const res = await exchangeCode(code); // 2回目: 失敗
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_grant");
  });

  it("存在しない code → invalid_grant", async () => {
    const res = await exchangeCode("nonexistent-code-xyz");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_grant");
  });

  it("PKCE S256: 正しい code_verifier → 成功", async () => {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64url");

    const code = await getAuthCode("user-normal-1", {
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
    });
    const res = await exchangeCode(code, { codeVerifier: verifier });
    expect(res.status).toBe(200);
  });

  it("PKCE S256: 間違った code_verifier → invalid_grant", async () => {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64url");

    const code = await getAuthCode("user-normal-1", {
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
    });
    const res = await exchangeCode(code, { codeVerifier: "wrong-verifier" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_grant");
  });

  it("nonce が id_token に含まれる", async () => {
    const nonce = "random-nonce-value";
    const code = await getAuthCode("user-normal-1", { nonce });
    const { body } = await exchangeCode(code);
    const payload = decodeJwt(body.id_token as string);
    expect(payload.nonce).toBe(nonce);
  });
});
