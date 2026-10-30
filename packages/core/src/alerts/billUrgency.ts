import { CardData, BillingCycle, UrgentBillAlert } from '../types';

/**
 * Checks all active bills to determine if any card has an urgent bill due within 1 day.
 * Used for triggering the special 30-40% bottom-sheet modal and priority alerts.
 */
export function evaluateUrgentBills(
  cards: CardData[],
  activeBills: BillingCycle[]
): UrgentBillAlert[] {
  const alerts: UrgentBillAlert[] = [];
  const now = new Date();

  activeBills.forEach((bill) => {
    const card = cards.find((c) => c.id === bill.card_id);
    if (!card) return;

    const remainingAmount = bill.generated_amount - (bill.paid_amount || 0);
    if (remainingAmount <= 0) return; // Already paid

    const dueDay = card.bill_due_day || 20;
    const currentDay = now.getDate();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    let dueDate = new Date(currentYear, currentMonth, dueDay);
    if (currentDay > dueDay) {
      dueDate = new Date(currentYear, currentMonth + 1, dueDay);
    }

    const diffTime = dueDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (daysRemaining <= 1) {
      alerts.push({
        cardId: card.id,
        cardName: card.card_name,
        last4: card.last_4_digits,
        dueAmount: remainingAmount,
        dueDate: dueDate.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        }),
        daysRemaining,
        isEmergency: true,
      });
    }
  });

  return alerts;
}
