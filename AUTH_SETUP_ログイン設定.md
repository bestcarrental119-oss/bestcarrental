# ログイン強化の設定ガイド（Turnstile / Google / LINE）

コードは実装済みです。各サービスのキーを取得して環境変数（Vercel）に入れ、Supabase/各社の管理画面で有効化すれば動きます。**キー未設定でもアプリは壊れません**（Turnstileは自動で計算チャレンジにフォールバック、Google/LINEボタンは押すと設定要求のエラーになるだけ）。

---

## 1. Cloudflare Turnstile（ロボット防止）
1. Cloudflare → **Turnstile** → サイト追加（ドメイン bestcar-rental.com）。**Site key** と **Secret key** を取得。
2. **Supabase** → Authentication → **Attack Protection（または Bot/Captcha）** → CAPTCHA を有効化し、Provider を **Turnstile**、Secret key を登録。
3. Vercel 環境変数に追加：`NEXT_PUBLIC_TURNSTILE_SITE_KEY=（Site key）` → 再デプロイ。
- これで登録/ログイン画面に Turnstile が表示され、サーバー検証は Supabase が行います。

## 2. Google ログイン
1. **Google Cloud Console** → OAuth 同意画面を設定 → 認証情報で **OAuth クライアントID（ウェブ）** を作成。
   - 承認済みリダイレクトURI に **Supabase の** `https://（あなたのプロジェクト）.supabase.co/auth/v1/callback` を登録。
2. **Supabase** → Authentication → Providers → **Google** を有効化し、Client ID / Secret を登録。
3. Supabase → Authentication → URL Configuration の **Redirect URLs** に本番URL（例 `https://bestcar-rental.com`）を追加。
- コードは変更不要。「Googleで続行」ボタンから動きます。

## 2.5. パスワード再設定メール
パスワード再設定メールは、Supabase に有効な recovery link だけを生成させ、本文の送信はアプリ側の Resend メールで行います。Supabase 標準メールの本文が空になる環境でも、Resend が設定されていれば再設定メールを送信できます。

1. Vercel など本番環境の環境変数に、実際の公開URLを入れて再デプロイします。
   ```
   NEXT_PUBLIC_SITE_URL=https://www.bestcar-rental.com
   NEXT_PUBLIC_APP_URL=https://www.bestcar-rental.com
   ```
2. Resend の送信用環境変数を入れて再デプロイします。
   ```
   RESEND_API_KEY=（Resend の API キー）
   NOTIFY_EMAIL_FROM=BEST Car Rental <noreply@bestcar-rental.com>
   ```
   `NOTIFY_EMAIL_FROM` のドメインは Resend 側で認証済みにしてください。
3. **Supabase → Authentication → URL Configuration** を開きます。
   - **Site URL**: `https://www.bestcar-rental.com`
   - **Redirect URLs**: `https://www.bestcar-rental.com/reset-password`
   - `https://bestcar-rental.com` でも公開している場合は、`https://bestcar-rental.com/reset-password` も追加します。
4. 設定後、古いメールではなく新しい「パスワードを忘れた」メールを送ってテストします。

## 3. LINE ログイン
1. **LINE Developers** → プロバイダー作成 → **「LINEログイン」チャネル** を作成。
   - **Channel ID / Channel secret** を取得。
   - 「LINEログイン設定」→ **コールバックURL** に `https://（本番URL）/api/auth/line/callback` を登録。
   - メールアドレス取得が必要なら **email 権限を申請**（任意。未申請なら `line_<id>@line.bestcar-rental.com` の擬似メールで作成）。
2. Vercel 環境変数：`LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET`（必要なら `LINE_CALLBACK_URL`）→ 再デプロイ。
3. 仕組み：LINEログイン → `/api/auth/line/callback` がプロフィール取得 → Supabase にユーザー作成 → マジックリンク経由でセッション確立（パスワード不要）。
- ※Supabase → Authentication → URL Configuration の Redirect URLs に本番URLを入れておいてください（マジックリンクのリダイレクト先）。

---

## 動作の要点
- 認証状態は `lib/context.jsx` の Supabase セッション監視で自動反映されます（Google/LINE/メールいずれでもログイン後にそのままアプリに反映）。
- ログアウトは Supabase セッションも破棄します。
- 変更ファイル：`components/Turnstile.jsx`（新規）、`components/AuthModal.jsx`、`app/api/auth/line/login/route.js`（新規）、`app/api/auth/line/callback/route.js`（新規）、`.env.example`。
