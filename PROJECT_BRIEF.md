# プロジェクト要件: ローカル動作するCognito風認証付きAPI構成

## ゴール

AWS本番環境を **Cognito + API Gateway + Lambda + S3/CloudFront + React SPA** で構成する想定のプロジェクトについて、**ローカル環境で完全に動作するサンプル**を作りたい。AWSへの依存をなくし、`npm run dev` 一発で全部立ち上がる状態にする。

このリポジトリは「ローカル開発環境のひな形」として作る。本番デプロイ用のCDKコードはスコープ外(後で追加する)。ただし、本番との差分が環境変数だけで済む設計にしておくこと。

## 技術スタック

- **フロントエンド**: React + Vite + TypeScript
- **認証ライブラリ(フロント)**: `oidc-client-ts`
- **バックエンド**: Hono on Node.js (本番ではLambda想定だが、ローカルでは `@hono/node-server` で起動)
- **JWT検証(バックエンド)**: `jose`(ローカル用)、本番は `aws-jwt-verify` を使う前提だが今回は実装不要
- **ローカルIdP**: Express + `jsonwebtoken` + `jose` で自作する
- **並列起動**: `concurrently`
- **言語**: TypeScript、実行は `tsx`

## アーキテクチャ(ローカル)

```
[ブラウザ]
   ↓
[React SPA] (Vite, http://localhost:5173)
   ↓ ① ログインボタン → /authorize へリダイレクト
[Local IdP] (Express, http://localhost:4000)
   ↓ ② ユーザー選択 → code発行 → SPAへリダイレクト
[React SPA]
   ↓ ③ codeをtoken endpointに送信
[Local IdP]
   ↓ ④ JWT(access/id token)を返却
[React SPA]
   ↓ ⑤ APIリクエストに Authorization: Bearer <access_token> を付与
[Backend API] (Hono, http://localhost:3000)
   ↓ ⑥ JWKSを Local IdPから取得して検証
   ↓ ⑦ レスポンス
```

## ディレクトリ構成

```
project-root/
  package.json              # ルート、concurrentlyで全部起動
  tsconfig.base.json        # 共通TypeScript設定
  .gitignore
  README.md
  
  frontend/
    package.json
    vite.config.ts
    tsconfig.json
    index.html
    src/
      main.tsx
      App.tsx
      auth.ts               # oidc-client-tsの設定
      pages/
        Home.tsx
        Callback.tsx
        Protected.tsx       # ログイン後に見える画面
  
  backend/
    package.json
    tsconfig.json
    src/
      app.ts                # Honoアプリ本体(ロジック)
      local.ts              # ローカル起動エントリ(@hono/node-server)
      lambda.ts             # 本番Lambdaエントリ(雛形だけでOK)
      middleware/
        auth.ts             # JWT検証ミドルウェア
  
  local-idp/
    package.json
    tsconfig.json
    src/
      server.ts             # ローカルIdP本体
      users.ts              # テストユーザー定義
```

## 機能要件

### Local IdP (`local-idp/`)

- ポート `4000` で起動
- 以下のエンドポイントを実装:
  - `GET /.well-known/openid-configuration` (OIDC Discovery)
  - `GET /.well-known/jwks.json` (公開鍵のJWKS)
  - `GET /authorize` (簡易ログイン画面: HTMLでユーザー選択ボタンを表示)
  - `POST /token` (Authorization Code Grant、PKCEは簡略化してOK)
  - `GET /logout` (post_logout_redirect_uriへリダイレクト)
- 起動時にRSA鍵ペアを生成(またはファイルに保存して再利用)。`kid` は固定値 `local-key-1`
- JWTには以下のクレームを含める:
  - `iss`: `http://localhost:4000`
  - `sub`: ユーザーごとの固定ID
  - `token_use`: `access` または `id`
  - `cognito:groups`: 配列(例: `["admin"]`, `["user"]`)
  - `custom:tenant_id`: 文字列(例: `"tenant-a"`)
  - `email`, `client_id`, `scope`, `aud`, `iat`, `exp`
- テストユーザーは2〜3人定義(admin、一般ユーザー、別テナントのユーザーなど)
- `/authorize` 画面はシンプルで良い。ユーザー名のボタンを並べて、押すとそのユーザーとしてログインする

### Backend (`backend/`)

- ポート `3000` で起動
- Honoでルーティング:
  - `GET /api/me` (認証必須): 認証済みユーザーの情報を返す
  - `GET /api/admin/stats` (認証 + adminグループ必須): ダミー統計を返す
  - `GET /api/orders` (認証必須): ユーザーのテナントに紐づくダミー注文一覧を返す
  - `GET /health` (認証不要): ヘルスチェック
- `middleware/auth.ts` でJWT検証:
  - `jose` の `createRemoteJWKSet` でLocal IdPのJWKSを取得
  - `iss`, `exp`, `token_use === "access"` を検証
  - 検証結果を `c.set("user", {...})` でコンテキストに保存
- CORSミドルウェアで `http://localhost:5173` を許可
- 本番想定の `lambda.ts` は `hono/aws-lambda` の `handle` でアプリをラップするだけの雛形

### Frontend (`frontend/`)

- Viteで起動(ポート `5173`)
- React Router で以下のページ:
  - `/`: ホーム画面、未ログインなら「ログイン」ボタン、ログイン済みなら「APIを叩く」ボタンとログアウト
  - `/callback`: OIDCコールバック処理
  - `/protected`: ログイン必須、APIを叩いた結果を表示
- `auth.ts` で `UserManager` を初期化:
  - `authority`: 環境変数 `VITE_OIDC_AUTHORITY`(デフォルト `http://localhost:4000`)
  - `client_id`: `local-client`
  - `redirect_uri`: `http://localhost:5173/callback`
  - `scope`: `openid email profile`
  - `response_type`: `code`
- APIリクエスト時に Access Token を `Authorization: Bearer <token>` で付与
- Viteのproxy設定で `/api` を `http://localhost:3000` に転送

### ルートpackage.json

- `npm run dev` で `concurrently` を使って3つを並列起動:
  - `npm run dev:idp` → local-idpを起動
  - `npm run dev:api` → backendを起動
  - `npm run dev:web` → frontendを起動
- ワークスペース機能(npm workspaces)を使って依存を管理

## 受け入れ基準

1. リポジトリのルートで `npm install` → `npm run dev` を実行すると、IdP・Backend・Frontendの3つが起動する
2. ブラウザで `http://localhost:5173` を開くと、ホーム画面に「ログイン」ボタンが表示される
3. ログインボタンを押すと、Local IdPの画面に遷移し、ユーザー選択ボタンが並ぶ
4. ユーザーを選択すると、フロントの `/callback` 経由でホームに戻り、ログイン状態になる
5. 「APIを叩く」ボタンで `/api/me`, `/api/orders` を叩いて結果が表示される
6. adminユーザーでログインすれば `/api/admin/stats` も成功する、一般ユーザーだと 403 になる
7. ログアウトすると未ログイン状態に戻る
8. トークンを改ざんしてAPIを叩くと 401 になる

## 設計上の注意

- **本番との差分を環境変数だけにする**: `VITE_OIDC_AUTHORITY`、`OIDC_ISSUER`、`OIDC_JWKS_URI` などを `.env` で切り替えられるようにする。コードに `if (isLocal)` の分岐を入れすぎない
- **シークレット情報をリポジトリに含めない**: ローカルIdPの鍵は起動時生成、もしくは `local-idp/keys/` に保存して `.gitignore` する
- **TypeScript strict mode**: 全パッケージで `"strict": true`
- **依存は最小限**: 必要なライブラリだけ入れる
- **README.md**: セットアップ手順、起動方法、テストユーザー一覧、トラブルシューティングを書く

## 作業の進め方(参考)

1. ルートの `package.json`、ワークスペース設定、`tsconfig.base.json` から作る
2. `local-idp/` を実装 → 単体で `curl` で動作確認できる状態にする
3. `backend/` を実装 → Local IdPで発行したトークンで `curl http://localhost:3000/api/me` が通る状態
4. `frontend/` を実装 → ブラウザでログイン〜API呼び出しまで通す
5. README.md を整備
6. 受け入れ基準をひとつずつ確認

## やらないこと(スコープ外)

- 本番AWSへのデプロイ用CDKコード
- リフレッシュトークンのローテーション(基本実装のみでOK)
- ユーザー登録機能(テストユーザー固定)
- データベース連携(モックデータをコード内に持つ)
- 単体テスト(動作確認用のサンプルが目的なので)
