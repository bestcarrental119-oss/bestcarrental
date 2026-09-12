/**
 * Vercel Cron Job — runs daily at 09:00 JST.
 * Checks vehicle inspection expiry dates and sends reminder emails.
 *
 * Setup in vercel.json:
 * {
 *   "crons": [{ "path": "/api/cron/inspection-reminder", "schedule": "0 0 * * *" }]
 * }
 *
 * Email provider: Resend (https://resend.com) — free plan: 3,000 emails/month
 * npm install resend
 */

// Uncomment and configure for production:
// import { Resend } from 'resend';
// const resend = new Resend(process.env.RESEND_API_KEY);

const REMIND_DAYS = [30, 7]; // Send reminders at 30 days and 7 days before expiry

export async function GET(req) {
  // Verify this is called by Vercel Cron (not a random HTTP request)
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // In production, replace with actual DB query:
  // const vehicles = await db.query(`
  //   SELECT v.*, u.email, u.name
  //   FROM vehicles v
  //   JOIN users u ON u.id = v.owner_id
  //   WHERE v.inspection_expiry IS NOT NULL
  //     AND v.status = 'active'
  // `);

  // Demo: mock vehicles with inspection expiry
  const vehicles = getMockVehicles();
  const sent = [];
  const skipped = [];

  for (const vehicle of vehicles) {
    if (!vehicle.inspectionExpiry) continue;

    const expiry = new Date(vehicle.inspectionExpiry);
    expiry.setHours(0, 0, 0, 0);
    const daysLeft = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));

    for (const threshold of REMIND_DAYS) {
      if (daysLeft !== threshold) continue;

      // In production: check DB for duplicate reminder
      // const alreadySent = await db.inspectionReminders.findFirst({
      //   where: { vehicleId: vehicle.id, daysBefore: threshold, remindedAt: today }
      // });
      // if (alreadySent) continue;

      const subject = `⚠️ Vehicle Inspection Expiring in ${threshold} Days — ${vehicle.maker} ${vehicle.model}`;
      const html = buildEmailHtml({ vehicle, daysLeft, expiry });

      try {
        // Production: await resend.emails.send({ from: 'noreply@best-car-rental.com', to: vehicle.ownerEmail, subject, html });

        // Log in DB to prevent re-send:
        // await db.inspectionReminders.create({ data: { vehicleId: vehicle.id, daysBefore: threshold, remindedAt: today } });

        console.log(`📧 Reminder sent to ${vehicle.ownerEmail} — ${vehicle.maker} ${vehicle.model} (${threshold} days)`);
        sent.push({ vehicleId: vehicle.id, daysLeft, email: vehicle.ownerEmail });
      } catch (err) {
        console.error(`Failed to send to ${vehicle.ownerEmail}:`, err);
      }
    }
  }

  return Response.json({
    ok: true,
    checked: vehicles.length,
    remindersSent: sent.length,
    sent,
  });
}

// ── Email template ────────────────────────────────────────────────────────────
function buildEmailHtml({ vehicle, daysLeft, expiry }) {
  const urgency = daysLeft <= 7 ? '#ef4444' : '#f59e0b';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family:-apple-system,sans-serif;background:#f9fafb;margin:0;padding:40px 20px;">
  <div style="max-width:520px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#7C3AED,#6D28D9);padding:32px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:24px;">Best Car Rental</h1>
      <p style="color:rgba(255,255,255,0.8);margin:8px 0 0;font-size:14px;">Vehicle Inspection Reminder</p>
    </div>
    <!-- Body -->
    <div style="padding:32px;">
      <div style="background:${urgency}18;border:1px solid ${urgency}33;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
        <p style="color:${urgency};font-size:36px;font-weight:900;margin:0;">${daysLeft}</p>
        <p style="color:${urgency};font-weight:600;margin:4px 0 0;">days until inspection expiry</p>
      </div>
      <h2 style="color:#111827;margin:0 0 16px;">Action Required</h2>
      <table style="width:100%;border-collapse:collapse;">
        ${row('Vehicle', `${vehicle.maker} ${vehicle.model} (${vehicle.year})`)}
        ${row('License Plate', vehicle.licensePlate || '—')}
        ${row('Inspection Expiry', expiry.toLocaleDateString('en-JP', { year: 'numeric', month: 'long', day: 'numeric' }))}
        ${row('Current Status', vehicle.status)}
      </table>
      <div style="margin-top:28px;padding:16px;background:#faf5ff;border-radius:12px;border-left:4px solid #7C3AED;">
        <p style="margin:0;font-size:14px;color:#4B5563;">
          Please schedule a vehicle inspection appointment as soon as possible to keep your vehicle compliant and available for rental.
        </p>
      </div>
      <div style="text-align:center;margin-top:28px;">
        <a href="${process.env.NEXT_PUBLIC_BASE_URL ?? 'https://best-car-rental.vercel.app'}/admin/vehicles/${vehicle.id}"
           style="background:linear-gradient(135deg,#7C3AED,#6D28D9);color:white;text-decoration:none;padding:14px 32px;border-radius:12px;font-weight:700;font-size:15px;display:inline-block;">
          Manage Vehicle →
        </a>
      </div>
    </div>
    <div style="padding:20px 32px;border-top:1px solid #f3f4f6;text-align:center;">
      <p style="color:#9CA3AF;font-size:12px;margin:0;">Best Car Rental · Automated Compliance Reminder</p>
    </div>
  </div>
</body>
</html>`;
}

function row(label, value) {
  return `
  <tr>
    <td style="padding:10px 0;color:#6B7280;font-size:14px;border-bottom:1px solid #F3F4F6;width:45%;">${label}</td>
    <td style="padding:10px 0;color:#111827;font-size:14px;font-weight:600;border-bottom:1px solid #F3F4F6;">${value}</td>
  </tr>`;
}

// ── Mock data (replace with DB in production) ─────────────────────────────────
function getMockVehicles() {
  const today = new Date();
  const addDays = (d) => { const dt = new Date(today); dt.setDate(dt.getDate() + d); return dt.toISOString().slice(0, 10); };
  return [
    { id: 1, maker: 'Honda', model: 'N-BOX', year: 2023, status: 'active', inspectionExpiry: addDays(30), ownerEmail: 'agentkaku0221@gmail.com', licensePlate: '品川 300 あ 1234' },
    { id: 2, maker: 'Toyota', model: 'Corolla', year: 2024, status: 'active', inspectionExpiry: addDays(7),  ownerEmail: 'agentkaku0221@gmail.com', licensePlate: '新宿 301 い 5678' },
    { id: 3, maker: 'Toyota', model: 'Alphard', year: 2023, status: 'active', inspectionExpiry: addDays(60), ownerEmail: 'yuki@example.com', licensePlate: '渋谷 302 う 9012' },
  ];
}
