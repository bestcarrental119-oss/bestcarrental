# Best Car Rental 🚗

グローバル対応モビリティシェアリングプラットフォーム（通常レンタカー / P2P カーシェア / 駐車場シェア）

## Tech Stack

- **Frontend**: Next.js 14 (App Router) + React 18 + Tailwind CSS
- **Payment**: Stripe Elements + Payment Intents API
- **Deployment**: Vercel

## Project Structure

```
best-car-rental/
├── app/
│   ├── layout.jsx              # Root layout + providers
│   ├── globals.css             # Global styles
│   ├── page.jsx                # Main entry point
│   └── api/
│       ├── payments/route.js   # Stripe PaymentIntent creation
│       └── webhook/route.js    # Stripe webhook handler
├── components/
│   ├── Shared.jsx              # Reusable UI components
│   ├── StripeForm.jsx          # Stripe Elements card form
│   ├── AdminApp.jsx            # Admin panel (full)
│   ├── FrontendApp.jsx         # User-facing app
│   ├── BookingModal.jsx        # 8-step booking flow
│   ├── AuthModal.jsx           # Login / Register
│   └── MyPage.jsx              # Profile + reservation history
└── lib/
    ├── data.js                 # Initial data (vehicles, theme…)
    └── context.jsx             # Global state (Context + useReducer)
```

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/best-car-rental.git
cd best-car-rental
npm install
```

### 2. Set up Environment Variables

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and fill in your Stripe keys:

| Variable | Where to find |
|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | [Stripe Dashboard → API keys](https://dashboard.stripe.com/apikeys) |
| `STRIPE_SECRET_KEY` | Same page (secret key) |
| `STRIPE_WEBHOOK_SECRET` | After running `stripe listen` (see below) |

### 3. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Test Stripe Webhooks locally

Install [Stripe CLI](https://stripe.com/docs/stripe-cli), then:

```bash
stripe listen --forward-to localhost:3000/api/webhook
```

Copy the `whsec_...` secret into `.env.local` as `STRIPE_WEBHOOK_SECRET`.

### 5. Stripe Test Cards

| Card | Result |
|---|---|
| `4242 4242 4242 4242` | ✅ Success |
| `4000 0000 0000 9995` | ❌ Insufficient funds |
| `4000 0025 0000 3155` | 🔐 3D Secure required |

Use any future expiry (e.g. `12/34`) and any 3-digit CVC.

## Deploy to Vercel

### One-click deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/YOUR_USERNAME/best-car-rental)

### Manual deploy

```bash
npm i -g vercel
vercel
```

Then add environment variables in the Vercel dashboard:
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

### Vercel Stripe Webhook

After deploying, add a new webhook endpoint in [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks):

```
https://your-app.vercel.app/api/webhook
```

Events to listen for:
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

## Admin Panel

Access the admin panel from the frontend footer → **"Admin"** link.

Features:
- 🎨 **Design Editor** — Change colors, logo, hero text → reflected instantly on frontend
- 🚗 **Vehicle Manager** — Add/edit/delete vehicles with photo, price, class
- 📅 **Reservation Manager** — View & update booking statuses
- 👥 **User Manager** — View registered users
- 💰 **Finance Report** — Revenue breakdown by type

## Cancellation Policy (ニコニコレンタカー準拠)

| Timing | Fee |
|---|---|
| 7+ days before pickup | Free (0%) |
| 6–2 days before | 30% of base rate |
| 1 day before | 50% of base rate |
| Same day | 80% of base rate |
| No-show | 100% of base rate |

## License

MIT
