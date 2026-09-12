/**
 * Lightweight transactional email helper (chat notifications).
 *
 * Uses Resend (https://resend.com) when RESEND_API_KEY is set. No key →
 * the function is a graceful no-op so the app still works without email.
 *
 * Env:
 *   RESEND_API_KEY     — Resend API key
 *   NOTIFY_EMAIL_FROM  — verified sender (defaults to noreply@bestcar-rental.com).
 *                        The domain must be verified in Resend before delivery.
 *   NEXT_PUBLIC_APP_URL — site URL used for the "reply" link (defaults below).
 */
const FROM = process.env.NOTIFY_EMAIL_FROM || 'BEST Car Rental <noreply@bestcar-rental.com>';
const DEFAULT_APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://bestcar-rental.com';

const SUBJECTS = {
  ja: '💬 新しいメッセージが届きました — BEST Car Rental',
  en: '💬 You have a new message — BEST Car Rental',
  'zh-CN': '💬 您有一条新消息 — BEST Car Rental',
  'zh-TW': '💬 您有一則新訊息 — BEST Car Rental',
  ko: '💬 새 메시지가 도착했습니다 — BEST Car Rental',
};

const INTRO = {
  ja: (who) => `${who}さんから新しいメッセージが届いています。`,
  en: (who) => `You have a new message from ${who}.`,
  'zh-CN': (who) => `您收到了来自${who}的新消息。`,
  'zh-TW': (who) => `您收到了來自${who}的新訊息。`,
  ko: (who) => `${who}님으로부터 새 메시지가 도착했습니다.`,
};

const CTA = {
  ja: 'アプリで返信する', en: 'Open the app to reply',
  'zh-CN': '打开应用回复', 'zh-TW': '開啟應用程式回覆', ko: '앱에서 답장하기',
};

/**
 * Generic transactional email. No-op when RESEND_API_KEY is unset so the app
 * keeps working without email configured.
 */
export async function sendEmail({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) return { skipped: true, reason: 'no RESEND_API_KEY' };
  if (!to || !subject) return { skipped: true, reason: 'missing to/subject' };
  try {
    const payload = { from: FROM, to: [to], subject, html: html || '' };
    if (text) payload.text = text;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Verification code (OTP) email ────────────────────────────────────────────
const OTP_SUBJECT = {
  ja: '認証コード / Verification code — BEST Car Rental',
  en: 'Your verification code — BEST Car Rental',
  'zh-CN': '验证码 — BEST Car Rental',
  'zh-TW': '驗證碼 — BEST Car Rental',
  ko: '인증 코드 — BEST Car Rental',
};
const OTP_TEXT = {
  ja: { title: 'メール認証コード', body: '下記の6桁コードを画面に入力してください。', expiry: 'このコードは10分間有効です。心当たりがない場合は破棄してください。' },
  en: { title: 'Email verification code', body: 'Enter the 6-digit code below to continue.', expiry: 'This code expires in 10 minutes. If you did not request it, please ignore this email.' },
  'zh-CN': { title: '邮箱验证码', body: '请在页面输入下方的6位验证码。', expiry: '验证码10分钟内有效。如非本人操作请忽略。' },
  'zh-TW': { title: '電子郵件驗證碼', body: '請在畫面輸入下方的6位驗證碼。', expiry: '驗證碼10分鐘內有效。如非本人操作請忽略。' },
  ko: { title: '이메일 인증 코드', body: '아래 6자리 코드를 화면에 입력하세요.', expiry: '코드는 10분간 유효합니다. 요청하지 않았다면 무시하세요.' },
};

const PASSWORD_RESET_SUBJECT = {
  ja: 'パスワード再設定 - BEST Car Rental',
  en: 'Reset your password - BEST Car Rental',
  'zh-CN': '重置密码 - BEST Car Rental',
  'zh-TW': '重設密碼 - BEST Car Rental',
  ko: '비밀번호 재설정 - BEST Car Rental',
};

const PASSWORD_RESET_TEXT = {
  ja: {
    title: 'パスワード再設定',
    body: '下のボタンを押して、新しいパスワードを設定してください。',
    cta: 'パスワードを再設定する',
    expiry: 'このリンクは一定時間で期限切れになります。心当たりがない場合は、このメールを破棄してください。',
    fallback: 'ボタンが開けない場合は、次のURLをブラウザに貼り付けてください。',
  },
  en: {
    title: 'Reset your password',
    body: 'Use the button below to choose a new password.',
    cta: 'Reset password',
    expiry: 'This link expires after a limited time. If you did not request it, you can ignore this email.',
    fallback: 'If the button does not open, paste this URL into your browser.',
  },
  'zh-CN': {
    title: '重置密码',
    body: '请点击下方按钮设置新密码。',
    cta: '重置密码',
    expiry: '此链接会在一定时间后失效。如非本人操作，请忽略此邮件。',
    fallback: '如果按钮无法打开，请将以下URL复制到浏览器。',
  },
  'zh-TW': {
    title: '重設密碼',
    body: '請點擊下方按鈕設定新密碼。',
    cta: '重設密碼',
    expiry: '此連結會在一定時間後失效。如非本人操作，請忽略此郵件。',
    fallback: '如果按鈕無法開啟，請將以下URL貼到瀏覽器。',
  },
  ko: {
    title: '비밀번호 재설정',
    body: '아래 버튼을 눌러 새 비밀번호를 설정하세요.',
    cta: '비밀번호 재설정',
    expiry: '이 링크는 일정 시간이 지나면 만료됩니다. 요청한 적이 없다면 이 메일을 무시하세요.',
    fallback: '버튼이 열리지 않으면 아래 URL을 브라우저에 붙여 넣으세요.',
  },
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

export async function sendPasswordResetEmail({ to, resetUrl, locale = 'ja' }) {
  if (!process.env.RESEND_API_KEY) return { skipped: true, reason: 'no RESEND_API_KEY' };
  if (!to || !resetUrl) return { skipped: true, reason: 'missing to/resetUrl' };
  const L = PASSWORD_RESET_TEXT[locale] ? locale : 'ja';
  const tx = PASSWORD_RESET_TEXT[L];
  const safeResetUrl = escapeHtml(resetUrl);
  const subject = PASSWORD_RESET_SUBJECT[L];
  const text = `${tx.title}

${tx.body}

${resetUrl}

${tx.expiry}

BEST Car Rental`;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#ffffff">
    <div style="background:#2f168f;border-radius:16px 16px 0 0;padding:22px 24px;color:#fff">
      <div style="font-size:13px;font-weight:800;letter-spacing:0.08em">BEST Car Rental</div>
      <h1 style="margin:8px 0 0;font-size:24px;line-height:1.3">${escapeHtml(tx.title)}</h1>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;padding:24px">
      <p style="color:#111827;font-size:15px;line-height:1.7;margin:0 0 20px">${escapeHtml(tx.body)}</p>
      <a href="${safeResetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;font-weight:800;font-size:15px;padding:12px 22px;border-radius:10px">${escapeHtml(tx.cta)}</a>
      <p style="color:#6b7280;font-size:12px;line-height:1.7;margin:22px 0 0">${escapeHtml(tx.expiry)}</p>
      <p style="color:#9ca3af;font-size:12px;line-height:1.7;margin:18px 0 6px">${escapeHtml(tx.fallback)}</p>
      <p style="word-break:break-all;color:#4f46e5;font-size:12px;line-height:1.6;margin:0">${safeResetUrl}</p>
    </div>
  </div>`;
  return sendEmail({ to, subject, html, text });
}

/**
 * Send a 6-digit verification code. No-op when RESEND_API_KEY is unset.
 * `purpose` is only used for a slightly tailored intro line.
 */
export async function sendVerificationCode({ to, code, locale = 'ja', purpose = 'signup' }) {
  if (!process.env.RESEND_API_KEY) return { skipped: true, reason: 'no RESEND_API_KEY' };
  if (!to || !code) return { skipped: true, reason: 'missing to/code' };
  const L = OTP_TEXT[locale] ? locale : 'ja';
  const tx = OTP_TEXT[L];
  const subject = OTP_SUBJECT[L];
  const html = `
  <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <div style="background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:16px;padding:20px;color:#fff">
      <h2 style="margin:0;font-size:18px">🔐 ${tx.title}</h2>
    </div>
    <div style="border:1px solid #eee;border-top:none;border-radius:0 0 16px 16px;padding:24px;text-align:center">
      <p style="color:#374151;font-size:14px;margin:0 0 16px">${tx.body}</p>
      <div style="display:inline-block;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:14px 26px;font-size:34px;font-weight:800;letter-spacing:10px;color:#5b21b6;font-family:monospace">${String(code)}</div>
      <p style="color:#9ca3af;font-size:12px;margin-top:20px">${tx.expiry}</p>
      <p style="color:#c4c4c4;font-size:11px;margin-top:10px">BEST Car Rental</p>
    </div>
  </div>`;
  return sendEmail({ to, subject, html });
}

export async function sendChatEmail({ to, recipientName, senderName, vehicleName, preview, locale = 'ja', appUrl }) {
  if (!process.env.RESEND_API_KEY) return { skipped: true, reason: 'no RESEND_API_KEY' };
  if (!to) return { skipped: true, reason: 'no recipient email' };

  const L = SUBJECTS[locale] ? locale : 'ja';
  const subject = SUBJECTS[L];
  const intro = INTRO[L](senderName || (L === 'ja' ? '相手' : 'a user'));
  const carLine = vehicleName ? `<p style="color:#6b7280;font-size:13px;margin:4px 0 16px">🚗 ${vehicleName}</p>` : '';
  const link = appUrl || DEFAULT_APP_URL;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <div style="background:linear-gradient(135deg,#7c3aed,#a855f7);border-radius:16px;padding:20px;color:#fff">
      <h2 style="margin:0;font-size:18px">💬 ${intro}</h2>
    </div>
    <div style="border:1px solid #eee;border-top:none;border-radius:0 0 16px 16px;padding:20px">
      ${carLine}
      <div style="background:#f5f3ff;border-radius:12px;padding:14px;color:#374151;font-size:14px;line-height:1.6">
        ${(preview || '').replace(/</g, '&lt;')}
      </div>
      ${link ? `<a href="${link}" style="display:inline-block;margin-top:18px;background:#7c3aed;color:#fff;text-decoration:none;font-weight:bold;font-size:14px;padding:11px 20px;border-radius:10px">${CTA[L]} →</a>` : ''}
      <p style="color:#9ca3af;font-size:11px;margin-top:20px">BEST Car Rental · この通知はチャットの新着メッセージによるものです。</p>
    </div>
  </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, error: `Resend ${res.status}: ${txt.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
