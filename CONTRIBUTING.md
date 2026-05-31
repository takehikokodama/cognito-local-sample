# コーディング規約

このプロジェクトに貢献する際のコーディング規約です。

---

## Biome（自動チェック）

[Biome](https://biomejs.dev/) を linter / formatter として使用しています。
`git commit` 時に pre-commit フックが `biome check --write` を自動実行します。
インデント・クォート・セミコロン・import 整列など書式は**すべて自動修正**されるので、
意識しなくてかまいません。詳細は [`biome.json`](biome.json) を参照してください。

手動確認・修正するには:

```bash
npm run check   # lint + format チェック
npm run format  # フォーマットのみ自動修正
```

---

## 書くときに意識すること

Biome が自動修正できないルールです。コードを書く段階で意識してください。

### Node.js 組み込みモジュールは `node:` プロトコルで import する

```ts
import crypto from "node:crypto";  // ✅
import crypto from "crypto";       // ❌ lint エラー
```

### `<button>` には `type` 属性を付ける

省略するとフォームの submit ボタンとして動作し、意図しない送信が起きることがあります。

```tsx
<button type="button" onClick={...}>クリック</button>  // ✅
<button onClick={...}>クリック</button>               // ❌ lint エラー
```

### lint ルールを抑制する場合は理由を記載する

非 null アサーション（`!`）など禁止されているパターンを使わざるを得ない場合は、
`biome-ignore` コメントで個別に抑制し、必ず理由を書いてください。

```ts
// biome-ignore lint/style/noNonNullAssertion: root 要素は index.html が保証する
ReactDOM.createRoot(document.getElementById("root")!).render(...);
```

---

## 命名規則

| 対象 | 規則 | 例 |
|---|---|---|
| React コンポーネントファイル | PascalCase | `Home.tsx`, `Protected.tsx` |
| その他の TypeScript ファイル | camelCase | `auth.ts`, `app.ts`, `server.ts` |
| テストファイル | `*.test.ts` / `*.test.tsx` | `app.test.ts`, `Home.test.tsx` |
| 関数・変数 | camelCase | `buildAuthMiddleware`, `loadOrGenerateKeys` |
| グローバル定数 | SCREAMING\_SNAKE\_CASE | `PORT`, `ISSUER`, `CLIENT_ID` |
| 型・インターフェース | PascalCase | `AuthUser`, `ApiResult` |

---

## TypeScript

- ルートの `tsconfig.base.json` で `strict: true` を有効化しています。`any` や `as unknown` の使用は最小限にしてください。
- **型のエクスポート**は `export type` を使い、値と区別します
  ```ts
  export type AuthUser = { sub: string; email: string; groups: string[] };
  ```
- **`interface` vs `type`**: オブジェクト形状には `interface`、ユニオン型やエイリアスには `type` を使います
- **型引数は明示する**（`useState<string | null>(null)` 等）

---

## React コンポーネント

- **export**: `export default function ComponentName()` 形式を使います（named export は使いません）
- **スタイル**: ファイル末尾に `const styles: Record<string, React.CSSProperties> = { ... }` としてまとめます
- **`useEffect` の依存配列は省略しない**

---

## エラーハンドリング

- `catch (e)` の `e` は `unknown` 型です。文字列に変換する場合は `String(e)` を使います
- 非同期処理の後処理（loading フラグのリセット等）は `finally` ブロックに書きます

---

## テスト

- `describe` / `it` の説明は**日本語**で書きます
  ```ts
  describe("GET /api/me — 認証済み", () => {
    it("200 とユーザー情報を返す", async () => { ... });
  });
  ```
- `describe` のネスト: 「コンポーネント名 — 状態」→ `it` の形にします
- React Testing Library のテストでは **`afterEach(cleanup)` を必ず書きます**
- モジュールモックは `vi.mock(...)` の後に `await import(...)` でインポートします
  ```ts
  vi.mock("../auth", () => ({ userManager: { getUser: vi.fn() } }));
  const { userManager } = await import("../auth");
  ```

---

## コメント

このプロジェクトでは **「WHY のみコメントを書く」** 方針を採用しています。

- 関数名・変数名で WHAT（何をするか）を表現し、それ自体にはコメントを書きません
- コメントが必要な場合は、**非自明な制約・回避策・不変条件**など「なぜそう書いたか」に限定します
