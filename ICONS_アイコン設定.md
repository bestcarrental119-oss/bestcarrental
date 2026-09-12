# アプリアイコン設定（PC/Web版・iOS/Android アプリ版）

新しいアイコンを **Web版・iOS・Android** の全プラットフォームに適用しました。

## 追加・変更したファイル

### PC / Web版（Next.js）— そのまま反映されます
- `app/favicon.ico` … ブラウザタブのアイコン
- `app/icon.png`（512px） … 標準ファビコン（Next.jsが自動配信）
- `app/apple-icon.png`（180px） … iOSのホーム画面追加用
- `public/icons/icon-192.png` / `icon-512.png` … PWA用アイコン
- `public/icons/icon-maskable-512.png` … Android PWAのマスク対応アイコン
- `public/manifest.webmanifest` … PWA設定（インストール時の名前・アイコン・色）
- `app/layout.jsx` … 上記アイコンとマニフェストへの参照を追加
- **確認方法**: `npm run dev` → ブラウザのタブとインストール時のアイコンが新しくなります。

### アプリ版（iOS / Android）— 1コマンドで全サイズ自動生成
- `assets/icon.png`（1024px） … アイコンの元画像
- `assets/splash.png` / `assets/splash-dark.png`（2732px） … 起動スプラッシュ
- `package.json` に `@capacitor/assets` と `assets:generate` スクリプトを追加

#### 手順
```bash
npm install                 # @capacitor/assets を含めて取得
npm run cap:add:ios         # ios/ が未生成なら（macのみ）
npm run cap:add:android     # android/ が未生成なら
npm run assets:generate     # assets/ から iOS・Android の全アイコン/スプラッシュを自動生成
npm run cap:sync            # ネイティブへ反映
```
`assets:generate` が iPhone/iPad/Android の各解像度アイコン、Androidのアダプティブアイコン、
スプラッシュ画像をまとめて生成し、`ios/` `android/` に書き込みます。

## 元画像について
- ご提供のアイコン（角丸・白背景付き）から、角の白余白を除いてエッジまで塗った
  フルブリード版を生成し、ストア用アイコンに使用しています（iOS/Androidが自動で角丸を適用）。
- スプラッシュはロゴを濃紫背景（#17012E）の中央に配置しています。
