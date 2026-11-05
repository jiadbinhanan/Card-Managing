import { CardData, BillingCycle, BillSchedule, BillCycleStatus } from '../types';

/**
 * Calculates days to next bill date for a given due day.
 */
export function calculateDaysToBill(targetDay: number, referenceDate?: Date): number {
  const now = referenceDate || new Date();
  let target = new Date(now.getFullYear(), now.getMonth(), targetDay);
  if (now > target) {
    target = new Date(now.getFullYear(), now.getMonth() + 1, targetDay);
  }
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

/**
 * Computes days until next bill and formatted date string for the dashboard header.
 * Formats date as e.g. "26th Nov".
 */
export function calculateNextBillCountdown(
  cards: CardData[],
  selectedCardId: string,
  referenceDate?: Date
): { daysToBill: number; nextBillDate: string } {
  let targetDay = 26;
  if (selectedCardId !== 'all') {
    const card = cards.find((c) => c.id === selectedCardId);
    if (card?.bill_due_day) targetDay = card.bill_due_day;
  } else if (cards.length > 0) {
    targetDay = cards[0].bill_due_day || 26;
  }

  const now = referenceDate || new Date();
  let target = new Date(now.getFullYear(), now.getMonth(), targetDay);
  if (now > target) {
    target = new Date(now.getFullYear(), now.getMonth() + 1, targetDay);
  }
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const nth = (d: number) => {
    if (d > 3 && d < 21) return 'th';
    switch (d % 10) {
      case 1:
        return 'st';
      case 2:
        return 'nd';
      case 3:
        return 'rd';
      default:
        return 'th';
    }
  };
  const month = target.toLocaleString('default', { month: 'short' });

  return {
    daysToBill: Math.max(0, diff),
    nextBillDate: `${targetDay}${nth(targetDay)} ${month}`,
  };
}

/**
 * Deduplicates billing cycles to keep only the latest bill per card.
 */
export function deduplicateLatestBillsPerCard(bills: BillingCycle[]): BillingCycle[] {
  const map = new Map<string, BillingCycle>();
  bills.forEach((b) => {
    if (!map.has(b.card_id)) {
      map.set(b.card_id, b);
    }
  });
  return Array.from(map.values());
}

/**
 * Calculates the 19-day offset due date, days remaining, and due status.
 * Due Date = Generation Date + 19 days.
 */
export function calculateBillSchedule(
  bill: BillingCycle,
  card?: CardData,
  referenceDate?: Date
): BillSchedule {
  const now = referenceDate || new Date();
  const billMonthDate = new Date(bill.billing_month);

  const genDay = bill.bill_gen_day || card?.bill_gen_day || 7;
  const genDate = new Date(billMonthDate.getFullYear(), billMonthDate.getMonth(), genDay);

  // Core 19-Day Offset Rule
  const dueDate = new Date(genDate);
  dueDate.setDate(dueDate.getDate() + 19);

  // Midnight normalized days left calculation
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDayStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const daysRemaining = Math.round((dueDayStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const generatedAmt = Number(bill.generated_amount || 0);
  const paidAmt = Number(bill.paid_amount || 0);
  const dueAmount = Math.max(0, generatedAmt - paidAmt);
  const isPaid = bill.status === 'paid' || dueAmount <= 0;

  let statusText = `${daysRemaining}d left`;
  if (isPaid) {
    statusText = 'Paid';
  } else if (daysRemaining === 0) {
    statusText = 'Due today!';
  } else if (daysRemaining < 0) {
    statusText = `Overdue by ${Math.abs(daysRemaining)}d`;
  }

  return {
    genDate,
    dueDate,
    daysRemaining,
    dueAmount,
    isPaid,
    statusText,
  };
}

/**
 * Calculates bill entry status ('paid' | 'partially_paid' | 'unpaid')
 */
export function calculateBillEntryStatus(
  generatedAmount: number,
  paidAmount: number
): BillCycleStatus {
  if (paidAmount >= generatedAmount) {
    return 'paid';
  }
  if (paidAmount > 0) {
    return 'partially_paid';
  }
  return 'unpaid';
}

/**
 * Pure calculation for FIFO bill payment distribution across cycles.
 */
export function calculateFIFOProcessBillPayment(
  unpaidCycles: BillingCycle[],
  latestCycleFallback: BillingCycle | null,
  paymentAmount: number
): {
  targetCycleId: string | null;
  newPaidAmount: number;
  newStatus: BillCycleStatus;
  remainingDue: number;
} {
  const targetCycle = (unpaidCycles.length > 0 ? unpaidCycles[0] : latestCycleFallback);
  if (!targetCycle) {
    return {
      targetCycleId: null,
      newPaidAmount: paymentAmount,
      newStatus: 'paid',
      remainingDue: 0,
    };
  }

  const generatedAmt = Number(targetCycle.generated_amount || 0);
  const currentPaid = Number(targetCycle.paid_amount || 0);
  const newPaidAmount = currentPaid + paymentAmount;

  let newStatus: BillCycleStatus = targetCycle.status;
  let remainingDue = 0;

  if (newPaidAmount >= generatedAmt) {
    newStatus = 'paid';
    remainingDue = 0;
  } else if (newPaidAmount > 0) {
    newStatus = 'partially_paid';
    remainingDue = generatedAmt - newPaidAmount;
  } else {
    newStatus = 'unpaid';
    remainingDue = generatedAmt;
  }

  return {
    targetCycleId: targetCycle.id,
    newPaidAmount,
    newStatus,
    remainingDue,
  };
}

/**
 * Legacy limit usage calculation helper
 */
export function calculateCardLimitUsage(card: CardData, activeBills: BillingCycle[]) {
  const cardBills = activeBills.filter((b) => b.card_id === card.id);
  const outstandingAmount = cardBills.reduce((acc, b) => {
    return acc + (Number(b.generated_amount || 0) - Number(b.paid_amount || 0));
  }, 0);

  const availableLimit = Math.max(0, Number(card.total_limit || 0) - outstandingAmount);
  const usagePercentage =
    card.total_limit > 0
      ? Math.min(100, Math.round((outstandingAmount / card.total_limit) * 100))
      : 0;

  return {
    totalLimit: card.total_limit,
    availableLimit,
    outstandingAmount,
    usagePercentage,
  };
}
