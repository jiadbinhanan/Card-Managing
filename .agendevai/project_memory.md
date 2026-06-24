# Credics — Project Memory

## What This App Does

Credics is a **shared credit card management PWA** for a financial community (family/group). Members share credit card limits, track who owes what, rotate card usage through QR codes, pay bills collectively, and receive automated WhatsApp notifications for every financial event. All data is stored in Supabase. Alerts go via Meta WhatsApp Cloud API in Bengali.

---

## Current Project State (as of June 2026)

### Stable & Production-Ready
- Auth middleware (`proxy.ts`) using `@supabase/ssr` `createServerClient` — cookie-based session check, server-side redirect to `/login` for unauthenticated routes
- Login page with email/password + OTP-based password reset
- Dashboard — card limit overview, billing cycles countdown, per-user cash/due stats, QR vault, analytics
- Transactions page — full ledger with multi-card filter, rotation/spend/bill entry modal
- Settlements page — QR vault with cooling period, pending In Transit list, settlement modal
- Lents page — personal loan tracking with partial payment support
- Settings page — profile editing, card management, user (profile) management
- PWA manifest, service worker, offline caching

### WhatsApp Alert Status

| Template | Trigger Point | Format | Status |
|---|---|---|---|
| `rotation_withdraw_alert` | QR used in settlements/qr.tsx | `variables{}` via sendWhatsAppAlert | ✅ Working |
| `qr_cooling_period_alert` | QR used in settlements/qr.tsx + transactions/page.tsx | `components[]` via QStash (24h5m delay) | ✅ Working |
| `rotation_settlement_alert` | Settlement confirmed in settlements/page.tsx | `components[]` direct fetch | ✅ Fixed (was rawVars) |
| `rotation_settlement_alert` | Test settlement in test-settle/page.tsx | `components[]` direct fetch | ✅ Fixed (was rawVars) |
| `partial_bill_pay_alert` | Bill pay (partial) in transactions/page.tsx | `variables{}` fire & forget | ✅ Implemented |
| `full_billpay_complete` | Bill pay (full) in transactions/page.tsx | `variables{}` fire & forget | ✅ Implemented |
| `credit_transaction_alert` | Any bill pay in transactions/page.tsx | `variables{}` fire & forget | ✅ Implemented |
| `rotation_withdraw_alert` | Rotate in transactions/page.tsx | `variables{}` fire & forget | ✅ Implemented |
| `qr_cooling_period_alert` | Rotate in transactions/page.tsx | `components[]` QStash 24h5m | ✅ Implemented |
| `personal_spend_alert` | Spend in transactions/page.tsx | `variables{}` fire & forget | ✅ Implemented |
| `debit_transaction_alert` | Spend — **intentionally removed** | — | 🚫 Removed (spam) |
| `lent_issue_alert` | New loan in lents/page.tsx | via `sendLentIssueAlert()` in WaAlert.tsx | ✅ Working |
| `lent_recovery_alert` | Loan repayment in lents/page.tsx | via `sendLentRecoveryAlert()` in WaAlert.tsx | ✅ Working |
| `rotation_withdraw_alert` | Manual entry in settlements/page.tsx (handleManualEntry) | QStash 24h5m | ✅ Working |

---

## Recent Major Changes (Chronological)

### 1. Auth Middleware — `proxy.ts`
- Next.js 16 uses `proxy.ts` (not `middleware.ts`). Export must be named `proxy`, not `default`.
- Uses `@supabase/ssr` `createServerClient` for server-side session verification from cookies.
- `lib/supabase.ts` changed from `createClient` to `createBrowserClient` (from `@supabase/ssr`) so auth tokens persist in cookies and the middleware can read them.
- `app/page.tsx` root redirects to `/dashboard`.
- `public/manifest.json` `start_url` changed to `/dashboard`.

### 2. `rotation_settlement_alert` — Components Array Fix
- **Problem**: Meta API returned `(#100) Invalid parameter` when using `rawVars` object with `sendWhatsAppAlert`. Template requires named parameters with `parameter_name` field in header + body.
- **Fix**: Replaced `rawVars` + `sendWhatsAppAlert` with direct `fetch('/api/send-whatsapp')` using proper `components[]` array in both `settlements/page.tsx` and `test-settle/page.tsx`.
- **Structure**: Header has `qr_name` param. Body has 9 named params: `greeting_user`, `card_name`, `last_4`, `qr_name`, `entry_user`, `time`, `amount`, `receiver_name`, `total_cash`.

### 3. Multi-Card Selection — `globalSelectedCardIds`
- **Before**: `globalSelectedCardId: string` in cardStore (single selection, `'all'` or one card ID).
- **After**: `globalSelectedCardIds: string[]` (default `['all']`). Persisted in localStorage.
- `transactions/page.tsx` header dropdown is now a multi-select checkbox UI. Selecting multiple cards merges their family card IDs for filtering. Display: "All Vault Cards" / "Card Name (**1234)" / "3 Cards".
- `settlements/page.tsx` and `dashboard/page.tsx` use a backward-compat wrapper: derive a single `globalSelectedCardId` string from the array (takes first item or `'all'`).
- **Note**: `dashboard/qrs.tsx` still receives `globalSelectedCardId: string` prop — it is passed the derived single value from `settlements/page.tsx`.

### 4. Non-Blocking WhatsApp Alerts in `transactions/page.tsx` handleSave
- `triggerAlert()` helper function defined inside the component — wraps `fetch('/api/send-whatsapp')` with `.catch`, no `await`.
- `processBillPayment()` now returns `{ cycleId, status, remainingDue }` instead of just `activeCycleId`.
- `sendAlerts()` closure defined inside `handleSave` captures all transaction context — called at the end of handleSave with no `await` (fire & forget).
- `debit_transaction_alert` intentionally not sent for `spend` type — reduces notification spam.

---

## Known Issues & Caveats

1. **`dashboard/qrs.tsx` prop type**: Receives `globalSelectedCardId: string` (not array). Settlements page passes the derived single string. If multi-select is ever extended to settlements, this prop needs updating.

2. **`settlements/page.tsx` — sendWhatsAppAlert still in use**: The `rotation_withdraw_alert` in `handleConfirmSettlement` and the manual entry QStash alert still use `sendWhatsAppAlert` (not direct fetch). Only `rotation_settlement_alert` was migrated to components format.

3. **`transactions/WaAlert.tsx` — partially used**: Contains `buildMetaComponents` helper and `AlertParams` interface but is not imported by `transactions/page.tsx` (which has inline `sendAlerts`). May be orphaned.

4. **`store/index.ts` — `useAppStore` (sidebarOpen)**: Defined but not used in current UI. Can be cleaned up.

5. **QStash cooling alert sends to only one profile**: In `transactions/page.tsx` `sendAlerts`, the QStash cooling alert only sends to `targetPhone` (acting user), not all profiles. In `settlements/qr.tsx` it sends to all profiles.

6. **Bill alert only fires when `billResult.status` is non-null**: If `processBillPayment` finds no active billing cycle for the card/month, `billResult.status` stays `null` and no bill alerts are sent.

7. **`metadataBase` warning**: Console shows "metadataBase property not set" — OG/Twitter images resolve to localhost. Harmless in dev; set in production via Vercel env.

---

## Next Steps / Backlog

- [ ] Migrate remaining `sendWhatsAppAlert` calls in `settlements/page.tsx` to components array format
- [ ] Extend multi-card selection to settlements page header (currently single-select `<select>`)
- [ ] Clean up orphaned `transactions/WaAlert.tsx` or wire it into `handleSave`
- [ ] Add `metadataBase` to `app/layout.tsx` for correct OG image URLs in production
- [ ] Consider sending QStash cooling alert to all profiles (not just acting user) in `transactions/page.tsx`
- [ ] Add pagination or virtual scroll to ledger for large transaction histories
