# 今回の変更まとめ（GitHub 反映用）

このzipには変更・新規ファイルのみが、リポジトリと同じフォルダ構成で入っています。
**既存プロジェクトの同じパスに上書き**してからコミット＆プッシュしてください。

## 変更ファイル（14）
- lib/i18n.js
- lib/i18nOwnerAdmin.js
- lib/data.js
- app/api/vehicles/route.js
- app/api/data/route.js
- app/api/cancel/route.js
- components/BookingModal.jsx
- components/OwnerDashboard.jsx
- components/FrontendApp.jsx
- components/AdminApp.jsx
- components/StripeForm.jsx
- components/Shared.jsx
- supabase/schema.sql
- supabase/RUN_THIS_今回の追加ぶん.sql

## 新規ファイル（3）
- lib/insurance.js
- app/api/checkout/route.js
- supabase/migrations/20260718_insurance_plans.sql

## 実装した内容
1. 補償プラン（利用者が選ぶ4段階の免責補償）＋オーナーが提供プランを選択
2. メインページの Premium ボタンを中央へ移動、Car Share(P2P) を削除
3. 予約モーダルの z-index 修正（検索シートが前面に出る不具合）＋飛び石を全プラン補償外に
4. キャンセル規定に「予約開始時刻を過ぎたキャンセルは返金不可」を追加（5言語）＋自動返金停止
5. 決済の Invalid amount（¥50未満）に分かりやすいメッセージ
6. Apple Pay / Google Pay ボタン（Stripe Checkout 方式）
7. 予約 Step 1 に戻るボタン（前の画面に戻れる）

## GitHub 反映後に別途必要な設定（コードではない）
1. **Supabase**: SQLエディタで `supabase/RUN_THIS_今回の追加ぶん.sql` を実行し `insurance_plans` 列を追加。
2. **Stripe Webhook**: ダッシュボード → 開発者 → Webhook で `https://<本番ドメイン>/api/webhook` を登録し、
   イベント `payment_intent.succeeded`（任意で payment_intent.payment_failed, charge.refunded）を有効化。
   `STRIPE_WEBHOOK_SECRET` を環境変数（Vercel等）に設定。
3. **料金**: 車両の1日料金は¥50以上（Stripe最低額）。
4. 反映前に `npm run build` が通るか確認推奨。
