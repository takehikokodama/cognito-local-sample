// @ts-check
"use strict";

/** @type {Record<string, string>} */
const RULE_MESSAGES = {
  "type-empty": "type が指定されていません",
  "type-enum":
    "type が正しくありません。使用できる type は下記の一覧を参照してください",
  "type-case": "type は小文字にしてください",
  "subject-empty": "subject（説明文）が空です",
  "subject-full-stop": "subject の末尾にピリオドを付けないでください",
  "header-max-length": "コミットメッセージが長すぎます（50文字以内にしてください）",
};

const GUIDE = `
  正しい形式:
    <type>: <subject>

  使用できる type:
    feat     新機能
    fix      バグ修正
    docs     ドキュメントのみの変更
    test     テストの追加・修正
    refactor リファクタリング
    chore    依存更新・ビルド設定・CI など
    style    フォーマット変更（動作に影響なし）

  例:
    feat: add JWT refresh token support
    fix: resolve CORS error on /api/me endpoint
    docs: update README with AWS deployment steps`;

/**
 * @param {{ results?: { errors?: { name: string; message: string }[]; warnings?: { name: string; message: string }[] }[] }} report
 */
module.exports = (report) => {
  const { results = [] } = report;
  const errors = results.flatMap((r) => r.errors ?? []);
  if (errors.length === 0) return "";

  const errorLines = errors
    .map((e) => `    - ${RULE_MESSAGES[e.name] ?? `${e.message}（${e.name}）`}`)
    .join("\n");

  return `\n✖ コミットメッセージの形式が正しくありません\n\n  エラー:\n${errorLines}\n${GUIDE}\n`;
};
