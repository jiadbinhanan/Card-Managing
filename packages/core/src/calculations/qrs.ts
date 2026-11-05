import { QRItem, ActiveCooldown } from '../types';

/**
 * Builds list of active cooldowns from 5-day personal transaction history.
 * Each used QR has a 24h cooling timer from the timestamp of its latest transaction.
 */
export function extractActiveCooldowns(
  recentTxs: Array<{ qr_id: string; created_at: string }>,
  allQrs: QRItem[],
  nowMs?: number
): ActiveCooldown[] {
  const now = nowMs || Date.now();
  const cooldownList: ActiveCooldown[] = [];
  const processedQrIds = new Set<string>();

  recentTxs.forEach((t) => {
    if (!t.qr_id || processedQrIds.has(t.qr_id)) return;
    const qrInfo = allQrs.find((q) => q.id === t.qr_id);
    if (!qrInfo) return;

    const expiresAt = new Date(t.created_at).getTime() + 24 * 60 * 60 * 1000;
    if (expiresAt > now) {
      cooldownList.push({
        qrId: t.qr_id,
        merchantName: qrInfo.merchant_name,
        expiresAt,
      });
    }
    processedQrIds.add(t.qr_id);
  });

  return cooldownList;
}

/**
 * Filters and ranks suggested operational QRs using:
 * 1. 24h cooling timer.
 * 2. 5-day BharatPe cooldown (120 hours).
 * 3. First-name blacklist (prevents self-rotation into personal UPI).
 * 4. Ascending order of last_used_date (oldest/coldest QR first).
 */
export function filterSuggestedQRs(params: {
  qrs: QRItem[];
  activeCooldowns: ActiveCooldown[];
  userFirstName: string;
  nowMs?: number;
}): QRItem[] {
  const { qrs, activeCooldowns, userFirstName, nowMs } = params;
  const now = nowMs || Date.now();

  const operational = qrs.filter((q) => {
    if (q.status !== 'active') return false;

    // First-name blacklist
    const nameLower = q.merchant_name.toLowerCase();
    const firstWord = nameLower.split(/\s+/)[0];
    if (userFirstName && firstWord === userFirstName.toLowerCase()) return false;

    // BharatPe 5-Day Cooldown (120 hours)
    const isBharatPe = nameLower.includes('bharatpe') || (q.platform || '').toLowerCase().includes('bharatpe');
    if (isBharatPe && q.last_used_date) {
      const daysSinceUsed = (now - new Date(q.last_used_date).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUsed < 5) return false;
    }

    // 24h Cooldown
    if (activeCooldowns.some((c) => c.qrId === q.id)) return false;

    return true;
  });

  // Sort: never used (null) first, then oldest last_used_date
  operational.sort((a, b) => {
    const timeA = a.last_used_date ? new Date(a.last_used_date).getTime() : 0;
    const timeB = b.last_used_date ? new Date(b.last_used_date).getTime() : 0;
    return timeA - timeB;
  });

  return operational;
}

/**
 * Generates anti-fraud transaction amounts (<₹2,000 threshold to prevent banking surcharge/audit flags).
 */
export function generateAntiFraudAmounts(mode: 'once' | 'multiple', splitCount: number = 2): number[] {
  if (mode === 'once') {
    // 90% chance: 1900-1999, 10% chance: 1850-1899
    const isHigh = Math.random() < 0.9;
    const amt = isHigh
      ? Math.floor(Math.random() * 100) + 1900
      : Math.floor(Math.random() * 50) + 1850;
    return [amt];
  }

  if (splitCount === 2) {
    // 2-Split: Total 1900-1999, split across two random parts
    const targetTotal = Math.floor(Math.random() * 100) + 1900;
    const first = Math.floor(Math.random() * (targetTotal - 1000)) + 500;
    const second = targetTotal - first;
    return [first, second];
  }

  if (splitCount === 3) {
    // 3-Split: 3 distinct swipes each 1800-1998
    return [
      Math.floor(Math.random() * 199) + 1800,
      Math.floor(Math.random() * 199) + 1800,
      Math.floor(Math.random() * 199) + 1800,
    ];
  }

  return [Math.floor(Math.random() * 100) + 1900];
}

/**
 * Builds standard UPI intent link or appends amount to base_payment_link.
 */
export function buildUpiPaymentLink(qr: QRItem, amount?: number): string {
  if (qr.base_payment_link) {
    if (!amount) return qr.base_payment_link;
    const sep = qr.base_payment_link.includes('?') ? '&' : '?';
    return `${qr.base_payment_link}${sep}am=${amount}`;
  }

  const base = `upi://pay?pa=${qr.upi_id || ''}&pn=${encodeURIComponent(qr.merchant_name || '')}`;
  if (amount) {
    return `${base}&am=${amount}&cu=INR`;
  }
  return `${base}&cu=INR`;
}
