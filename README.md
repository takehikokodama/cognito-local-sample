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

## AWS 手動デプロイ手順

### 前提条件

- AWS CLI v2 設定済み (`aws configure`)
- デプロイ先リージョン: `ap-northeast-1`（変更可）
- 必要な IAM 権限: Cognito / Lambda / API Gateway / S3 / CloudFront / IAM

### デプロイ前のコード修正

以下の2箇所をコードで変更してからビルドしてください。

**① build スクリプトの追加**

`frontend/package.json` の `scripts` に追加:
```json
"build": "vite build"
```

`backend/package.json` の `scripts` に追加:
```json
"build": "tsc"
```

**② CORS オリジンの変更**

`backend/src/app.ts` の以下の行を CloudFront ドメインに書き換える (Step 4 で取得):
```typescript
// 変更前
cors({ origin: "http://localhost:5173" })
// 変更後
cors({ origin: "https://<CLOUDFRONT_DOMAIN>" })
```

> **Tip**: CloudFront で `/api/*` を API Gateway にルーティングすると同一オリジンになるため、CORS の設定を省略することも可能です。

---

### Step 1: Cognito ユーザープールとアプリクライアントの作成

```bash
# ユーザープール作成
POOL_ID=$(aws cognito-idp create-user-pool \
  --pool-name cognito-local-sample \
  --query UserPool.Id --output text --region ap-northeast-1)
echo "POOL_ID: $POOL_ID"

# Hosted UI 用ドメイン（グローバルで一意なサフィックスを付ける）
aws cognito-idp create-user-pool-domain \
  --domain cognito-local-sample-<任意のサフィックス> \
  --user-pool-id $POOL_ID --region ap-northeast-1

# アプリクライアント作成（PKCE, code grant, シークレットなし）
# ※ CloudFront ドメインは Step 4 で取得後に Step 5 で更新するため仮の値でよい
CLIENT_ID=$(aws cognito-idp create-user-pool-client \
  --user-pool-id $POOL_ID \
  --client-name cognito-local-sample-client \
  --no-generate-secret \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --supported-identity-providers COGNITO \
  --callback-urls "https://example.com/callback" \
  --logout-urls "https://example.com" \
  --allowed-o-auth-flows-user-pool-client \
  --query UserPoolClient.ClientId --output text --region ap-northeast-1)
echo "CLIENT_ID: $CLIENT_ID"
```

テストユーザーの作成:
```bash
aws cognito-idp admin-create-user \
  --user-pool-id $POOL_ID \
  --username admin@example.com \
  --temporary-password "Temp1234!" \
  --region ap-northeast-1

# グループ追加 (admin グループ)
aws cognito-idp create-group \
  --group-name admin --user-pool-id $POOL_ID --region ap-northeast-1
aws cognito-idp admin-add-user-to-group \
  --user-pool-id $POOL_ID --username admin@example.com \
  --group-name admin --region ap-northeast-1
```

### Step 2: Lambda ビルドとパッケージング

```bash
# TypeScript ビルド
npm run build --workspace=backend   # → backend/dist/ に出力

# Lambda パッケージング
# モノレポの node_modules はルートにホイスティングされるため
# .pkg/ に本番依存のみ再インストールしてからzip化する
cd backend
mkdir -p .pkg
cp -r dist .pkg/
cp package.json .pkg/
(cd .pkg && npm install --omit=dev --no-package-lock)
(cd .pkg && zip -r ../function.zip .)
rm -rf .pkg
cd ..
```

### Step 3: Lambda + API Gateway のデプロイ

```bash
# IAM ロール作成
ROLE_ARN=$(aws iam create-role \
  --role-name lambda-cognito-sample-role \
  --assume-role-policy-document \
    '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  --query Role.Arn --output text)
aws iam attach-role-policy \
  --role-name lambda-cognito-sample-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

# ロールの伝播を待つ
sleep 10

# Lambda 関数作成
LAMBDA_ARN=$(aws lambda create-function \
  --function-name cognito-local-sample-api \
  --runtime nodejs22.x \
  --role $ROLE_ARN \
  --handler dist/lambda.handler \
  --zip-file fileb://backend/function.zip \
  --environment "Variables={OIDC_ISSUER=https://cognito-idp.ap-northeast-1.amazonaws.com/${POOL_ID},OIDC_JWKS_URI=https://cognito-idp.ap-northeast-1.amazonaws.com/${POOL_ID}/.well-known/jwks.json}" \
  --query FunctionArn --output text --region ap-northeast-1)
echo "LAMBDA_ARN: $LAMBDA_ARN"

# HTTP API 作成（Lambda プロキシ統合、ペイロード v2.0）
API_ID=$(aws apigatewayv2 create-api \
  --name cognito-local-sample-api \
  --protocol-type HTTP \
  --query ApiId --output text --region ap-northeast-1)

INTEGRATION_ID=$(aws apigatewayv2 create-integration \
  --api-id $API_ID \
  --integration-type AWS_PROXY \
  --integration-uri $LAMBDA_ARN \
  --payload-format-version 2.0 \
  --query IntegrationId --output text --region ap-northeast-1)

aws apigatewayv2 create-route \
  --api-id $API_ID --route-key '$default' \
  --target "integrations/$INTEGRATION_ID" --region ap-northeast-1

aws apigatewayv2 create-stage \
  --api-id $API_ID --stage-name '$default' \
  --auto-deploy --region ap-northeast-1

# Lambda への API Gateway 実行権限付与
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws lambda add-permission \
  --function-name cognito-local-sample-api \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:ap-northeast-1:${ACCOUNT_ID}:${API_ID}/*/*" \
  --region ap-northeast-1

echo "API URL: https://${API_ID}.execute-api.ap-northeast-1.amazonaws.com"
```

動作確認:
```bash
curl https://${API_ID}.execute-api.ap-northeast-1.amazonaws.com/health
# → {"status":"ok"}
```

### Step 4: フロントエンドビルドと S3 + CloudFront デプロイ

```bash
# 環境変数ファイル作成
cat > frontend/.env.production << EOF
VITE_OIDC_AUTHORITY=https://cognito-idp.ap-northeast-1.amazonaws.com/${POOL_ID}
EOF

# ビルド
npm run build --workspace=frontend  # → frontend/dist/ に出力

# S3 バケット作成
BUCKET="cognito-local-sample-frontend-$(date +%s)"
aws s3 mb s3://${BUCKET} --region ap-northeast-1
echo "BUCKET: $BUCKET"
```

**CloudFront ディストリビューションの作成（マネジメントコンソール推奨）**

複数オリジンの設定が必要なため、コンソールから作成してください。

| 設定項目 | 値 |
| --- | --- |
| Origins (1) | S3 バケット、OAC を使用 |
| Origins (2) | `<API_ID>.execute-api.ap-northeast-1.amazonaws.com` |
| Behaviors `/api/*` | Origins (2) を指定、全 HTTP メソッド許可、キャッシュ無効 |
| Behaviors `/*` (default) | Origins (1) を指定 |
| Error pages 403/404 | `/index.html` へ転送、レスポンスコード `200`（SPA ルーティング用） |
| Viewer protocol policy | Redirect HTTP to HTTPS |

```bash
# CloudFront ドメインを確認後にファイルをアップロード
CLOUDFRONT_DOMAIN=<コンソールで確認した xxxx.cloudfront.net>
aws s3 sync frontend/dist s3://${BUCKET} --delete
```

### Step 5: Cognito コールバック URL の更新と Lambda の再デプロイ

```bash
# Cognito コールバック URL を CloudFront ドメインに更新
aws cognito-idp update-user-pool-client \
  --user-pool-id $POOL_ID \
  --client-id $CLIENT_ID \
  --callback-urls "https://${CLOUDFRONT_DOMAIN}/callback" \
  --logout-urls "https://${CLOUDFRONT_DOMAIN}" \
  --allowed-o-auth-flows code \
  --allowed-o-auth-scopes openid email profile \
  --supported-identity-providers COGNITO \
  --allowed-o-auth-flows-user-pool-client \
  --region ap-northeast-1
```

「デプロイ前のコード修正」で変更した CORS オリジンを `https://${CLOUDFRONT_DOMAIN}` に設定し、
Step 2-3 のビルドとデプロイを再実行して Lambda を更新:

```bash
# Lambda コード更新
npm run build --workspace=backend
cd backend
mkdir -p .pkg && cp -r dist .pkg/ && cp package.json .pkg/
(cd .pkg && npm install --omit=dev --no-package-lock)
(cd .pkg && zip -r ../function.zip .)
rm -rf .pkg && cd ..

aws lambda update-function-code \
  --function-name cognito-local-sample-api \
  --zip-file fileb://backend/function.zip \
  --region ap-northeast-1
```

---

### 環境変数まとめ（本番）

| 設定先 | 変数名 / 設定 | 値 |
| --- | --- | --- |
| `frontend/.env.production` | `VITE_OIDC_AUTHORITY` | `https://cognito-idp.ap-northeast-1.amazonaws.com/<POOL_ID>` |
| Lambda 環境変数 | `OIDC_ISSUER` | `https://cognito-idp.ap-northeast-1.amazonaws.com/<POOL_ID>` |
| Lambda 環境変数 | `OIDC_JWKS_URI` | `https://cognito-idp.ap-northeast-1.amazonaws.com/<POOL_ID>/.well-known/jwks.json` |
| `backend/src/app.ts` | CORS origin | `https://<CLOUDFRONT_DOMAIN>` |

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
