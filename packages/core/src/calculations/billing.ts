import { CardData, BillingCycle } from '../types';

export function calculateDaysToBill(billGenDay: number): number {
  const now = new Date();
  const currentDay = now.getDate();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let targetDate = new Date(currentYear, currentMonth, billGenDay);
  if (currentDay > billGenDay) {
    // Bill date has passed for this month, target is next month
    targetDate = new Date(currentYear, currentMonth + 1, billGenDay);
  }

  const diffTime = targetDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

export function calculateNextBillDate(billGenDay: number): string {
  const now = new Date();
  const currentDay = now.getDate();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  let targetDate = new Date(currentYear, currentMonth, billGenDay);
  if (currentDay > billGenDay) {
    targetDate = new Date(currentYear, currentMonth + 1, billGenDay);
  }

  return targetDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function calculateCardLimitUsage(card: CardData, activeBills: BillingCycle[]) {
  const cardBills = activeBills.filter((b) => b.card_id === card.id);
  const outstandingAmount = cardBills.reduce((acc, b) => {
    return acc + (b.generated_amount - (b.paid_amount || 0));
  }, 0);

  const availableLimit = Math.max(0, card.total_limit - outstandingAmount);
  const usagePercentage = card.total_limit > 0
    ? Math.min(100, Math.round((outstandingAmount / card.total_limit) * 100))
    : 0;

  return {
    totalLimit: card.total_limit,
    availableLimit,
    outstandingAmount,
    usagePercentage,
  };
}
