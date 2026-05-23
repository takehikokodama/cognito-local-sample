# cognito-local-sample

AWS Cognito + API Gateway + Lambda + React SPA 構成のローカル開発ひな形。
`npm run dev` 一発で IdP・Backend・Frontend の3つが起動します。

## アーキテクチャ

```
[ブラウザ]
   ↓
[React SPA] (Vite, http://localhost:5173)
   ↓ ① ログインボタン → /authorize へリダイレクト
[Local IdP] (Express, http://localhost:4000)
   ↓ ② ユーザー選択 → code発行 → SPAへリダイレクト
[React SPA]
   ↓ ③ code を token endpoint に送信 (PKCE)
[Local IdP]
   ↓ ④ JWT (access / id token) を返却
[React SPA]
   ↓ ⑤ Authorization: Bearer <access_token> を付与
[Backend API] (Hono, http://localhost:3000)
   ↓ ⑥ JWKS を Local IdP から取得して JWT 検証
   ↓ ⑦ レスポンス
```

## セットアップ・起動

```bash
npm install
npm run dev
```

ブラウザで http://localhost:5173 を開くとホーム画面が表示されます。

## テスト

### 全パッケージまとめて実行

```bash
npm test
```

### パッケージ単体で実行

```bash
npm test --workspace=backend    # backend: 9件
npm test --workspace=local-idp  # local-idp: 16件
npm test --workspace=frontend   # frontend: 20件
```

### ウォッチモード (ファイル変更時に自動再実行)

```bash
npx vitest --workspace=backend
npx vitest --workspace=local-idp
npx vitest --workspace=frontend
```

### テスト構成

| パッケージ | テストファイル | 主な確認内容 |
| ---------- | -------------- | ------------ |
| `backend` | `src/app.test.ts` | JWT検証、各APIエンドポイントの認可ロジック |
| `local-idp` | `src/server.test.ts` | PKCE検証、認証コードフロー、トークンクレーム |
| `frontend` | `src/pages/*.test.tsx` | コンポーネント表示、ユーザー操作、fetch呼び出し |

## テストユーザー

| 名前              | email                | グループ        | テナント   |
| ----------------- | -------------------- | --------------- | ---------- |
| Admin User        | admin@example.com    | admin, user     | tenant-a   |
| Normal User       | normal@example.com   | user            | tenant-a   |
| Other Tenant User | other@example.com    | user            | tenant-b   |

## API エンドポイント

| メソッド | パス                | 認証      | 説明                                 |
| -------- | ------------------- | --------- | ------------------------------------ |
| GET      | /health             | 不要      | ヘルスチェック                       |
| GET      | /api/me             | 必須      | ログインユーザーの情報を返す         |
| GET      | /api/orders         | 必須      | テナントに紐づく注文一覧を返す       |
| GET      | /api/admin/stats    | admin必須 | 統計情報 (adminグループのみ)         |

## 動作確認フロー

1. http://localhost:5173 を開く
2. 「ログイン」ボタン → Local IdP のユーザー選択画面へ
3. ユーザーを選択 → `/callback` 経由でホームに戻る
4. 「API を叩く」→ `/api/me`, `/api/orders`, `/api/admin/stats` を試す
5. admin ユーザーなら stats が成功、一般ユーザーは 403
6. 「ログアウト」で未ログイン状態に戻る

## 環境変数

| 変数名              | デフォルト                                         | 用途                              |
| ------------------- | -------------------------------------------------- | --------------------------------- |
| `VITE_OIDC_AUTHORITY` | `http://localhost:4000`                          | フロントの OIDC authority         |
| `OIDC_ISSUER`       | `http://localhost:4000`                            | バックエンドのトークン検証用 iss  |
| `OIDC_JWKS_URI`     | `http://localhost:4000/.well-known/jwks.json`      | バックエンドの JWKS 取得先        |

本番環境では `.env` に Cognito の値を設定してください:

```env
VITE_OIDC_AUTHORITY=https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_XXXXXXXX
OIDC_ISSUER=https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_XXXXXXXX
OIDC_JWKS_URI=https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_XXXXXXXX/.well-known/jwks.json
```

## ディレクトリ構成

```
project-root/
  package.json              # ルート、concurrentlyで全部起動
  tsconfig.base.json        # 共通TypeScript設定
  .gitignore

  frontend/                 # React + Vite (port 5173)
    src/
      auth.ts               # oidc-client-ts の設定
      App.tsx
      pages/
        Home.tsx            # ログイン/ログアウト
        Callback.tsx        # OIDC コールバック処理
        Protected.tsx       # API 呼び出し画面

  backend/                  # Hono on Node.js (port 3000)
    src/
      app.ts                # ルーティング
      local.ts              # ローカル起動エントリ
      lambda.ts             # 本番 Lambda エントリ (雛形)
      middleware/
        auth.ts             # JWT 検証ミドルウェア

  local-idp/                # ローカル OIDC IdP (port 4000)
    src/
      server.ts             # IdP 本体
      users.ts              # テストユーザー定義
    keys/                   # 起動時生成の RSA 鍵 (.gitignore 済み)
```

## トラブルシューティング

**ポートが使用中のエラー**

```bash
kill $(lsof -ti:4000 -ti:3000 -ti:5173)
```

**鍵を再生成したい**

```bash
rm -rf local-idp/keys/
npm run dev:idp  # 次回起動時に新しい鍵が生成される
```

**ログインボタンを押しても何も起きない**

- Local IdP (port 4000) が起動しているか確認: `curl http://localhost:4000/.well-known/openid-configuration`
- ブラウザのコンソールでエラーを確認

**API が 401 になる**

- Backend (port 3000) が起動しているか確認: `curl http://localhost:3000/health`
- Local IdP の鍵と Backend が一致しているか確認 (鍵を再生成した場合はログインしなおす)
