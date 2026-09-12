# IDPペーパーレス受取（QRパス）機能

IDPの印刷をやめ、QRコードで受取時の本人確認を完結させる機能です。

## 流れ

1. **借りる人**：マイページの「本人確認書類」タブでIDP・免許・パスポートの情報と写真を事前登録（任意）。
2. 予約が確定・支払い済みになると、予約カードに **「📱 受取パス」** ボタンが出ます。押すと予約専用のQRコードが表示されます。
3. **受取時**：借りる人がスマホでQRを提示。
4. **オーナー**：オーナー画面の **「🪪 受取確認」タブ** で「QRをスキャン」（またはコード手入力）。読み取ると、その予約のIDP情報・写真・予約情報がオーナーアカウントに保存されます。
5. オーナーは保存した記録を **印刷 / CSV / 画像ダウンロード** できます。
6. 記録は **返却日から30日後に自動削除**（毎日3時のcron）。

## セキュリティ / プライバシー設計

- **QRの中身は不透明なトークンのみ**（例: `BCR-XXXXXXXXXX`）。氏名・免許番号・写真は一切含まれないため、QRをスクショされても情報は漏れません。
- オーナーが読み取ると、サーバー側で「その予約が本当にそのオーナーのものか」を検証してから情報を返します（他店は読めません）。
- 個人情報（IDP等）は返却+30日で自動消去。

## セットアップ（本番で一度だけ）

1. Supabaseで `supabase/pickup_pass.sql` を実行（予約テーブルへの列追加と `owner_pickup_records` テーブル作成）。
2. Vercel Cronは `vercel.json` に `purge-pickup-records`（毎日3時）を追加済み。`CRON_SECRET` 環境変数を設定してください。
3. QR生成・読み取りライブラリは実行時にCDNから読み込むため、追加のnpm installは不要です（地図のLeafletと同じ方式）。

## 追加/変更ファイル

- `supabase/pickup_pass.sql` — DB
- `app/api/pickup-pass/route.js` — パス生成/状態取得（借りる人）
- `app/api/owner/pickup-records/route.js` — スキャン保存/一覧/削除（オーナー）
- `app/api/cron/purge-pickup-records/route.js` — 30日自動削除
- `components/PickupPass.jsx` — 借りる人のQR表示
- `components/OwnerPickupScanner.jsx` — オーナーのスキャナ/保存/印刷/CSV/画像
- `components/MyPage.jsx`, `components/OwnerDashboard.jsx` — 導線を追加
- `lib/i18nOwnerAdmin.js` — 5言語の文言
