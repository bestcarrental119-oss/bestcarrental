# Best One-Way（片道GO）実装まとめ

回送車両を格安でユーザーに運転して戻してもらうマッチング機能。既存の Best Car Rental
（JS/JSX・独自context・Google Maps・保険モジュール・Stripe）に統合しています。

## 画面遷移・ルーティング
既存はSPA（`frontendPage` を `SET_PAGE` で切替）。新ページを1つ追加しました。

- `home` … トップに **OneWayBanner** を表示（宝探し感・破格バッジ）。タップで `one-way` へ。
- `one-way`（新規）… **OneWayPage** = マップ探索（UserMapExplorer）＋ルートアラート＋予約モーダル。
- オーナー: 車両管理タブに **OneWayPublishLauncher**（🚗↩️ Best One-Way）を追加。
  乗り捨て検知の自動レコメンド（AdminRecommendPublish）と同じプレフィルフローを手動で起動できます。
  ※本番では「异地还车（乗り捨て）返却イベント」をトリガーに AdminRecommendPublish を自動起動する想定。

## 新規ファイル
- lib/oneWay.js … デポジット/手数料定数、距離(Haversine)、推奨期限・推奨料金、オーソリ計算、ピン状態
- lib/i18nOneWay.js … 5言語の翻訳（i18n.js に連携済み）
- app/api/one-way/listings/route.js … GET(公開一覧)/POST(出品)/PATCH(状態更新)
- app/api/one-way/route-alerts/route.js … ルートアラート登録
- app/api/one-way/reserve/route.js … **Stripeオーソリ(manual capture)で与信確保**＋予約作成
- app/api/one-way/capture/route.js … 返却時に capture(基本料+保険+未給油なら手数料) / release(解放)
- components/oneway/OneWayBanner.jsx / OneWayPage.jsx / UserMapExplorer.jsx /
  ReservationModal.jsx / AdminRecommendPublish.jsx / OneWayPublishLauncher.jsx
- supabase/migrations/20260719_best_one_way.sql … one_way_listings / one_way_route_alerts

## 変更ファイル
- lib/i18n.js（oneWayTranslations を t() に連携）
- components/FrontendApp.jsx（バナー配置・one-way ページ描画）
- components/OwnerDashboard.jsx（出品ランチャー追加）
- supabase/RUN_THIS_今回の追加ぶん.sql（テーブル追記）

## 決済ロジック（重要）
- **即時引き落としではなく Stripe Pre-authorization（capture_method: 'manual'）で与信確保**。
- オーソリ確保額 ＝ 基本料金 ＋ 選択保険料 ＋ デポジット（一律 ¥50,000）。
- UIは「**予約を確定する（カードの与信枠を確保します）**」。「決済完了」の語は不使用。
- 満タン＆指定店舗返却で `/api/one-way/capture` により基本料＋保険のみ capture（デポジット解放）。
  未給油時は実費＋代行手数料 ¥5,000 を上乗せ capture。

## 反映後に必要な設定
1. Supabase で `RUN_THIS_今回の追加ぶん.sql`（O項）を実行。
2. Stripe 本番キー＋Webhook（既存 /api/webhook）。オーソリの capture/cancel は /api/one-way/capture を
   オーナー返却確認オペレーションから呼ぶ（管理UIは今後追加可）。
3. 地図は NEXT_PUBLIC_GOOGLE_MAPS_API_KEY 必須。未設定時はリスト表示に自動フォールバック。
4. 車種・距離からの推奨料金/期限はヒューリスティック。運用に合わせて lib/oneWay.js を調整可。
