# Google Maps 導入手順

このアプリの地図は Leaflet + OpenStreetMap から **Google Maps** に切り替わりました。
動作には Google Maps の **API キー**が必要です（Google の仕様上、課金設定が必須）。

対象コンポーネント:

- `components/MapSearch.jsx` — お客様向けの車両検索マップ
- `components/AdminMapPicker.jsx` — 管理者 / オーナーの車両位置設定ピッカー
- `lib/googleMaps.js` — 上記が共有する Google Maps ローダー & ジオコーディング

---

## 1. Google Cloud で API キーを取得する

1. [Google Cloud Console](https://console.cloud.google.com/) にログイン
2. 画面上部でプロジェクトを新規作成（例: `bestcar-rental`）
3. **お支払い（Billing）** を有効化
   - Google Maps は無料枠がありますが、キー発行には課金アカウントの紐付けが必須です
   - 無料枠を超えなければ請求は発生しません（下記「料金」参照）
4. **API とサービス → ライブラリ** で以下の 2 つを有効化:
   - **Maps JavaScript API**（地図の表示）
   - **Geocoding API**（住所 ⇄ 座標の変換）
5. **API とサービス → 認証情報 → 認証情報を作成 → API キー**
6. 発行された `AIza...` で始まるキーをコピー

## 2. キーに制限をかける（重要 / セキュリティ）

`NEXT_PUBLIC_` の環境変数はブラウザに露出します。**必ず制限を設定**してください。

作成した API キーを開き:

- **アプリケーションの制限 → HTTP リファラー**
  - 本番: `https://bestcar-rental.com/*`
  - 開発: `http://localhost:3000/*`
- **API の制限 → キーを制限**
  - `Maps JavaScript API` と `Geocoding API` のみにチェック

## 3. 環境変数を設定する

`.env.local`（なければ `.env.example` をコピー）に追記:

```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

開発サーバーを再起動して反映:

```bash
npm run dev
```

## 4. 動作確認

- お客様側: 検索結果ページの地図に、車両が **紫の価格ピル型ピン**で表示される
- ピンをクリック → 下部に車両カードが出る / リストのカードをクリック → 地図が該当地点へ移動
- 管理側: 車両編集の位置ピッカーで、地図クリックでピン設置・ドラッグ移動・住所検索ができる

キー未設定・課金無効・ネットワーク不通の場合は「地図を読み込めませんでした」と表示され、
リスト表示は引き続き利用できます（フォールバック）。

---

## 料金の目安

Google Maps Platform は従量課金で、毎月一定の無料枠があります（2024 年時点）。

| API | 主な用途 | 無料枠の目安 |
| --- | --- | --- |
| Maps JavaScript API | 地図表示（マップ読み込み単位で課金） | 月あたり一定回数まで無料 |
| Geocoding API | 住所⇄座標変換（1 リクエスト単位） | 月あたり一定回数まで無料 |

- 実装側でも無駄打ちを抑えています: 住所ジオコーディングは**同一住所を 1 回だけ**実行しキャッシュ、地図スクリプトは**1 回だけ**ロード。
- 最新の料金・無料枠は公式ページで必ず確認してください:
  https://mapsplatform.google.com/pricing/
- Cloud Console で **予算アラート**（Billing → 予算とアラート）を設定しておくと安心です。

---

## 補足: サーバー側ジオコーディングについて

`lib/geocode.js` と `app/api/admin/geocode-vehicles/route.js` は、
バッチ処理用に別途 OpenStreetMap Nominatim を使っています（今回の地図 UI 変更の対象外）。
こちらも Google に統一したい場合は、`GOOGLE_MAPS_SERVER_KEY`（HTTP リファラー制限なしの
サーバー専用キー）を発行し、REST の Geocoding API に置き換える形で対応できます。必要であればお知らせください。
