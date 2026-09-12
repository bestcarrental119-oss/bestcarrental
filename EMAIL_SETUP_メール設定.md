# メール通知の設定ガイド（bestcar-rental.com）

チャットの新着メール通知を **実際に送れるようにする** ための手順です。コード側は実装済みなので、あとは「①Resend登録 → ②ドメイン認証(DNS) → ③APIキーを環境変数に設定」の3ステップだけです。

---

## ① Resend に登録（無料枠あり）

1. https://resend.com にアクセスして登録（Googleアカウント等でOK）。
2. ログイン後、左メニュー **API Keys** → **Create API Key**。
3. 作成されたキー（`re_...`）をコピー。これが `RESEND_API_KEY` です。

> 無料枠: 1日100通・月3,000通まで（2025年時点）。小規模運用なら無料で足ります。

---

## ② ドメイン bestcar-rental.com を認証（DNS設定）

メールを `noreply@bestcar-rental.com` から送るには、ドメインの所有確認が必要です。

1. Resend 左メニュー **Domains** → **Add Domain** → `bestcar-rental.com` を入力。
2. 画面に **追加すべきDNSレコード** が表示されます（アカウントごとに値が異なります）。だいたい以下の種類です:

| 種類 | ホスト名（例） | 値 | 役割 |
|---|---|---|---|
| TXT | `bestcar-rental.com` または `send` | `v=spf1 include:amazonses.com ~all` 等 | SPF（なりすまし防止） |
| TXT / CNAME | `resend._domainkey` 等 | Resendが提示する文字列 | DKIM（署名） |
| MX | `send` | `feedback-smtp.~.amazonses.com`（優先度10） | バウンス受信 |
| TXT（任意） | `_dmarc` | `v=DMARC1; p=none;` | DMARC（推奨） |

3. これらを **ドメインを管理しているところ**（お名前.com / Cloudflare / Route53 / レジストラの管理画面など）の DNS 設定に追加します。
4. Resend の Domains 画面で **Verify** を押す（反映に数分〜最大48時間）。**Verified** になれば完了です。

> ⚠️ 認証が完了するまでは、Resend は「登録した自分のメール宛」かつ `onboarding@resend.dev` 差出人でしか送れません。本番送信には上記の認証が必須です。

---

## ③ 環境変数を設定

`.env.local`（ローカル）と、本番（Vercel等）の両方に設定します。`.env.example` を参考にしてください。

```
RESEND_API_KEY=re_あなたのキー
NOTIFY_EMAIL_FROM=BEST Car Rental <noreply@bestcar-rental.com>
NEXT_PUBLIC_SITE_URL=https://www.bestcar-rental.com
NEXT_PUBLIC_APP_URL=https://www.bestcar-rental.com
```

Vercel の場合: プロジェクト → **Settings → Environment Variables** に上記を追加して再デプロイ。

> パスワード再設定メールは Supabase Auth が送信します。リンクが `localhost:3000` になる場合は、`AUTH_SETUP_ログイン設定.md` の「パスワード再設定メールのURL」を確認し、Supabase の Site URL / Redirect URLs / Reset Password テンプレートを本番URLに変更してください。

---

## ④ 動作テスト

サーバー起動後、ブラウザで次のURLを開くとテストメールを送信します（自分のメール宛に）:

```
https://bestcar-rental.com/api/notify-email/test?to=あなたのメール@example.com
```

- `{"ok":true}` が返り、メールが届けば成功です。
- `{"ok":false,...}` の場合は、返ってきた `error` の内容（多くは「ドメイン未認証」か「キー誤り」）を確認してください。
- `RESEND_API_KEY` 未設定だと 503（送信スキップ）になります。

---

## 仕組み（実装の概要）

- チャットでメッセージが送られると、サーバー（`/api/chat/[id]` の POST）が**受信者のメールアドレス**を解決し、`lib/email.js` 経由で Resend に送信します。
- **スパム防止**: 同じ会話の同じ相手へは **10分に1回まで**（`lib/kv.js` の `acquireNotifyLock`、Upstash Redis 使用。未設定時は毎回送信）。
- `RESEND_API_KEY` が無い環境では送信を**自動スキップ**するので、設定前でもアプリは通常どおり動きます。

> 別のメール送信サービス（SendGrid / Amazon SES / 自前SMTP 等）を使いたい場合は、`lib/email.js` の `fetch('https://api.resend.com/emails', …)` の部分を差し替えれば対応できます。ご希望あればこちらで対応します。
