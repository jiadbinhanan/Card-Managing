# Credics — Architecture Overview

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.2.4 (App Router, Turbopack) |
| Language | TypeScript 5.9 |
| UI | React 19, Tailwind CSS 4, shadcn/ui, Motion (Framer Motion v12), Lucide React |
| State | Zustand 5 (persisted via localStorage) |
| Backend / DB | Supabase (PostgreSQL + Supabase Auth + Realtime) |
| Auth middleware | `proxy.ts` (Next.js 16 middleware — export must be named `proxy`, not `default`) |
| WhatsApp | Meta Cloud API v18.0 via `/api/send-whatsapp` route |
| Scheduled alerts | QStash (Upstash) — `Upstash-Delay` header on fetch to `/api/send-whatsapp` |
| AI | Google Gemini (`@google/genai`) |
| PWA | `@ducanh2912/next-pwa` — service worker, offline cache |
| Analytics | Vercel Analytics + Speed Insights |
| Hosting | Vercel (production: `credics.vercel.app`) |

---

## Frontend Architecture

### Pages (App Router — all `"use client"`)

```
/login          → app/login/page.tsx          Email+password auth, OTP password reset
/dashboard      → app/dashboard/page.tsx       Overview: limits, billing cycles, user stats
/transactions   → app/transactions/page.tsx    Full ledger: rotations, spends, bill payments
/settlements    → app/settlements/page.tsx     QR vault, pending settlements, history
/lents          → app/lents/page.tsx           Personal loan tracking
/settings       → app/settings/page.tsx        Profile, card + user management
```

### Test / Sandbox Pages (no DB writes)
```
/test-settle    → app/test-settle/page.tsx     Mirror of settlements — fires WhatsApp but skips DB
/test-lents     → app/test-lents/page.tsx      Mirror of lents — testing only
/test-trans     → app/test-trans/page.tsx      Mirror of transactions — testing only
```

### Global State (Zustand)
- `store/cardStore.ts` — `globalSelectedCardIds: string[]` (default `['all']`). Persisted in `localStorage` under key `card-store`. Used by transactions, settlements, and dashboard to filter data by card.
- `store/index.ts` — `useAppStore` with `sidebarOpen` toggle (legacy/unused in current UI).

### Auth Flow
1. `proxy.ts` intercepts every request. Passes through `/login`, `/api/*`, static assets, PWA files.
2. Uses `createServerClient` from `@supabase/ssr` to read session from cookies.
3. If no user session → hard redirect to `/login`.
4. On login success → `window.location.href = "/dashboard"` (hard redirect to sync cookies).
5. `lib/supabase.ts` uses `createBrowserClient` from `@supabase/ssr` for client-side usage.

### UI Patterns
- Dark glassmorphism theme (`#030014` / `#050505` backgrounds, `backdrop-blur`, `border-white/10`)
- Accent colors: `#0ea5e9` (sky blue), `#a855f7` (purple), `#10b981` (emerald)
- Animated backgrounds: floating radial gradients via Framer Motion
- `BottomNav` fixed at bottom — 4 tabs: Home, Trans, Settled, Loans
- All modals use shadcn `Dialog` component

---

## Backend Architecture

### API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/send-whatsapp` | POST | Sends WhatsApp template message via Meta Graph API v18.0. Accepts `components[]` (Meta format) OR `variables{}` (key-value, auto-converted). Language code: `bn` (Bengali). |
| `/api/internal/agent/apply-patch` | POST | Write file content — requires `HUB_SECRET` bearer token. Used by AI Hub. |
| `/api/internal/agent/list-files` | GET | List all project files — requires `HUB_SECRET`. |
| `/api/internal/agent/project-memory` | GET | Read `.agendevai/` memory files — requires `HUB_SECRET`. |
| `/api/internal/agent/read-file` | POST | Read any file by path — requires `HUB_SECRET`. |

### Environment Secrets
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role (server-side only)
- `GEMINI_API_KEY` — Google Gemini API key
- `META_WA_TOKEN` — Meta WhatsApp Cloud API Bearer token
- `META_WA_PHONE_ID` — Meta WhatsApp sender phone number ID
- `NEXT_PUBLIC_QSTASH_TOKEN` — Upstash QStash token for scheduled delivery

---

## Database Schema (Supabase / PostgreSQL)

### `profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid | References `auth.users.id` |
| name | text | Display name |
| phone | text | Used for WhatsApp alerts |
| avatar_url | text | Supabase Storage URL |

### `cards`
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| card_name | text | e.g. "HDFC Regalia" |
| last_4_digits | text | Last 4 digits of card |
| total_limit | numeric | Credit limit in INR |
| is_primary | boolean | Primary vs sub-card |
| parent_card_id | uuid | FK to primary card (for sub-cards) |
| bill_gen_day | int | Day of month bill is generated |
| bill_due_day | int | Day of month bill is due |

### `card_access`
| Column | Type | Notes |
|---|---|---|
| user_id | uuid | FK to profiles |
| card_id | uuid | FK to cards |

### `card_transactions`
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| type | text | `withdrawal` (rotation) or `bill_payment` |
| amount | numeric | |
| status | text | `pending_settlement` or `settled` |
| qr_id | uuid | FK to qrs (for rotations) |
| card_id | uuid | FK to cards |
| recorded_by | uuid | FK to profiles |
| settled_to_user | uuid | FK to profiles (settlement receiver) |
| billing_cycle_id | uuid | FK to billing_cycles (for bill payments) |
| payment_method | text | `cash_on_hand`, `own_pocket` |
| settled_date | timestamptz | |
| remarks | text | |
| transaction_date | timestamptz | |

### `spends`
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | uuid | FK to profiles |
| card_id | uuid | FK to cards |
| amount | numeric | |
| spend_type | text | `personal`, `repayment` |
| payment_method | text | `credit_card`, `cash_on_hand` |
| remarks | text | |
| spend_date | date | |

### `qrs`
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| merchant_name | text | e.g. "PhonePe", "BharatPe" |
| platform | text | |
| settlement_time | text | Human-readable e.g. "T+1" |
| qr_image_url | text | Supabase Storage URL |
| last_used_date | date | Tracks cooling period |
| status | text | `active`, `cooling` |
| upi_id | text | |
| base_payment_link | text | Optional deep link |

### `billing_cycles`
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| card_id | uuid | FK to cards (primary only) |
| billing_month | date | First day of billing month |
| generated_amount | numeric | Total bill amount |
| paid_amount | numeric | Amount paid so far |
| status | text | `unpaid`, `partially_paid`, `paid` |

### `cash_on_hand`
| Column | Type | Notes |
|---|---|---|
| user_id | uuid | FK to profiles |
| card_id | uuid | FK to cards |
| current_balance | numeric | Cash balance per user per card |

### `lents`
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| borrower_name | text | Person who borrowed money |
| amount | numeric | |
| lent_date | date | |
| due_date | date | |
| status | text | `unpaid`, `partial`, `paid` |
| given_by | uuid | FK to profiles |
| funding_source | text | Source of funds |
| card_id | uuid | FK to cards (if from card limit) |
| remarks | text | |
| payment_history | jsonb | Array of partial payment records |

---

## Key Data Flows

### 1. Card Rotation (QR Withdrawal)
```
User opens /settlements → QR Vault tab
  → Selects QR → enters amount → confirms
  → Marks QR as "used today" (updates last_used_date)
  → Inserts card_transactions row (type=withdrawal, status=pending_settlement)
  → Instant WhatsApp: rotation_withdraw_alert (all profiles)
  → Scheduled WhatsApp (QStash 24h5m): qr_cooling_period_alert
```

### 2. Settlement
```
User opens /settlements → In Transit tab
  → Selects pending transaction → confirms receiver + amount
  → Updates card_transactions status → settled
  → Updates cash_on_hand (credit receiver, debit source)
  → Instant WhatsApp: rotation_settlement_alert (all profiles, components array format)
```

### 3. Bill Payment
```
User opens /transactions → opens modal → selects Bill tab
  → Selects primary card → enters amount → confirms
  → processBillPayment() → queries billing_cycles for current month
     → updates paid_amount, sets status: partially_paid | paid
     → returns { cycleId, status, remainingDue }
  → Inserts card_transactions (type=bill_payment, status=settled)
  → WhatsApp (fire & forget): partial_bill_pay_alert OR full_billpay_complete + credit_transaction_alert
```

### 4. Personal Spend
```
User opens /transactions → modal → Spend tab
  → Selects user + card → enters amount → chooses credit_card or cash_on_hand
  → If splitting: inserts both credit_card and cash_on_hand spends
  → Updates cash_on_hand if payment_method=cash_on_hand
  → WhatsApp (fire & forget): personal_spend_alert (debit_transaction_alert removed — spam prevention)
```

### 5. WhatsApp Alert Pipeline
```
Page code → triggerAlert() / fetch('/api/send-whatsapp') [fire & forget]
  → /api/send-whatsapp route.ts
  → Constructs Meta Cloud API payload
     → If components[]: use directly
     → If variables{}: auto-wrap in body component array
  → POST to https://graph.facebook.com/v18.0/{PHONE_ID}/messages
  → Language: "bn" (Bengali templates)
```

### 6. Realtime Updates
```
All pages subscribe to Supabase Realtime on:
  → card_transactions changes → refetch ledger
  → spends changes → refetch ledger
  → cash_on_hand changes → refetch balances
```
