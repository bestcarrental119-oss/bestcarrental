# セーフティ3機能（¥0オーソリ／電子契約書／AI損傷チェック）

## ① ¥0事前オーソリ＋損害同意
- 決済前に「損害補償の同意」（¥0カード登録＋事故・破損時に後日実費請求できる）を必須チェック化。
  通常予約（BookingModal）と Best One-Way（ReservationModal）の両方に組み込み。同意なしは決済不可。
- 店内で拒否された場合などの事前オーソリ用に `/api/preauth`（¥0 SetupIntent / ¥1 manual-capture）を追加。
- 新規: `components/DamageConsent.jsx`, `app/api/preauth/route.js`

## ② 電子契約書
- 予約ごとの契約書を `/api/contract?reservationId=…&locale=…` が HTML で生成（印刷→PDF保存可）。
- 利用者（マイページ）とオーナー（予約一覧）の両方に「📄 契約書」ボタン。
- 新規: `app/api/contract/route.js`

## ③ AI損傷チェック（before/after比較）
- オーナーの予約一覧に「📸 車両状態チェック」ボタン → 各アングル（前/後/左/右/内装/メーター）で
  貸出前・返却後の写真を撮影（返却時は前の写真をガイド表示）。
- 「🤖 AIで比較」で新たな損傷と推定修理費を自動算出しオーナーに提示。
- **AI有効化**: 環境変数 `OPENAI_API_KEY`（gpt-4o）または `ANTHROPIC_API_KEY`（Claude）を設定すると自動解析。
  未設定時は手動記録モード（損傷内容＋見積入力）に自動切替。
- 新規: `components/DamageInspection.jsx`, `app/api/inspection/route.js`, `app/api/inspection/analyze/route.js`

## DB
`supabase/SUPABASE_今回実行するSQL.sql` の Q項を実行（`reservations` に preauth 列、`damage_inspections` テーブル）。

## 反映後に必要な環境変数（任意）
- `OPENAI_API_KEY`（＋任意 `OPENAI_VISION_MODEL`）または `ANTHROPIC_API_KEY`（＋`ANTHROPIC_VISION_MODEL`）
  … ③のAI自動解析を有効化。未設定でも手動運用は可能。
