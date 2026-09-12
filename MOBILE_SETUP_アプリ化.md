# スマホアプリ化（iOS / Android）セットアップ手順

このプロジェクトは **Capacitor** で iOS・Android のネイティブアプリにします。
Web（Next.js）のコードを **100% そのまま再利用**し、App Store / Google Play に出せる
本物のネイティブアプリになります。1つのコードベースで Web・iOS・Android の3つを維持できます。

---

## 方式（重要）

このアプリは Stripe・Supabase・cron などの **サーバー側 API ルート**を持つため、
ネイティブアプリは「デプロイ済みの Web アプリ（HTTPS）を読み込む」方式にしています。
これが Next.js + API ルート構成で最も確実・最短で、コード分岐も不要です。

- `capacitor.config.js` の `server.url` に本番URLを設定します。
- 環境変数 `NEXT_PUBLIC_APP_URL` でも上書きできます（例: `https://your-domain.com`）。

> 完全オフライン型（Webサーバー無しで動かす）にしたい場合は、API を別ホストに分離して
> `next build` の静的エクスポートを使う構成も可能です。まずは上記のURL方式を推奨します。

---

## 必要なもの

| 対象 | 必要ツール |
|------|-----------|
| iOS  | macOS + Xcode 15 以上、Apple Developer アカウント（年99ドル） |
| Android | Android Studio、Google Play Developer アカウント（初回25ドル） |
| 共通 | Node.js 18+ |

---

## 手順

### 1. 依存関係をインストール
```bash
npm install
```
（`package.json` に Capacitor 一式を追加済みです）

### 2. 本番URLを設定
`capacitor.config.js` の `APP_URL`、または環境変数を実際のデプロイ先に変更します。
```bash
export NEXT_PUBLIC_APP_URL="https://あなたの本番ドメイン"
```

### 3. ネイティブプロジェクトを生成
```bash
npm run cap:add:ios       # ios/ フォルダを生成（macのみ）
npm run cap:add:android   # android/ フォルダを生成
npm run cap:sync          # 設定・プラグインを同期
```

### 4. 実機／シミュレータで起動
```bash
npm run cap:open:ios      # Xcode が開く → ▶ で実行
npm run cap:open:android  # Android Studio が開く → ▶ で実行
```

### 5. 設定を変えたら毎回
```bash
npm run cap:sync
```

---

## 追加済みのネイティブ機能

`lib/native.js` に用意しています（Webでは自動で無効化されます）。

- **スプラッシュ画面 / ステータスバー**：起動時に自動適用（`initNative()` を `FrontendApp` で呼び出し済み）。
- **Androidの戻るボタン**：履歴があれば戻る、なければアプリを終了しない。
- **GPS 位置情報**：`getCurrentPosition()` →「近くの車」検索に利用可能。
- **プッシュ通知**：`registerPush(token => ...)` でデバイストークンを取得し、バックエンドに登録。
- **カメラ**：車両点検写真の撮影に `@capacitor/camera` を利用可能。

---

## ストア申請の要点

### iOS（App Store）
- Xcode で Bundle ID = `com.bestcarrental.app`、署名（Team）を設定。
- アプリアイコン（1024px）とスプラッシュを差し替え。
- 位置情報・カメラ・通知の**利用目的文言**を `Info.plist` に記載（審査必須）。
  - `NSLocationWhenInUseUsageDescription`、`NSCameraUsageDescription` など。
- 決済は**現状のStripe（実物の車・レンタルという現実のサービス）**なので、Appleのアプリ内課金（IAP）対象外です。物理サービスの決済は外部決済でOK（App Store Guideline 3.1.5）。

### Android（Google Play）
- `applicationId = com.bestcarrental.app`、署名鍵を作成。
- 権限（位置情報・カメラ・通知）とプライバシーポリシーURLを登録。

---

## よくある確認事項

- **中身が真っ白**：`server.url` が正しい本番URLか、HTTPSか確認。`npm run cap:sync` を実行。
- **ログインや決済の外部遷移が開かない**：`capacitor.config.js` の `allowNavigation` に対象ドメインを追加。
- **地図が出ない**：CSP/ネットワーク許可（OpenStreetMap タイル、unpkg の Leaflet）を確認。
