/**
 * Validates that:
 * 1. At least one source has an allocated amount > 0.
 * 2. Total allocated exactly equals targetAmount.
 * 3. Every individual source amount does not exceed the user's available cash balance on that card.
 */
export function validateCashAllocation(
  sources: Array<{ cardId: string; amount: number }>,
  targetAmount: number,
  cardBalances: Record<string, number>
): boolean {
  if (targetAmount <= 0) return false;

  const validSources = sources.filter((s) => s.cardId && s.amount > 0);
  if (validSources.length === 0) return false;

  const totalAllocated = validSources.reduce((sum, s) => sum + s.amount, 0);
  if (totalAllocated !== targetAmount) return false;

  return validSources.every((s) => s.amount <= (cardBalances[s.cardId] || 0));
}

/**
 * Calculates the maximum allowed amount an input can take for a specific card source row,
 * preventing allocation from exceeding remaining needed amount or the card's available cash balance.
 */
export function calculateMaxAllowedSourceAmount(
  sourceIndex: number,
  sources: Array<{ cardId: string; amount: number }>,
  targetAmount: number,
  cardBalance: number
): number {
  if (cardBalance <= 0) return 0;
  if (targetAmount <= 0) return cardBalance;

  const otherAllocated = sources
    .filter((_, idx) => idx !== sourceIndex)
    .reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

  const remainingNeeded = Math.max(0, targetAmount - otherAllocated);
  const targetCap = remainingNeeded > 0 ? remainingNeeded : targetAmount;

  return Math.min(cardBalance, targetCap);
}

/**
 * Builds double-entry ledger rows for an inter-user cash transfer.
 */
export function buildCashTransferLedgerEntries(params: {
  senderId: string;
  senderCardId: string;
  senderName: string;
  receiverId: string;
  receiverCardId: string;
  receiverName: string;
  amount: number;
  remarks?: string;
  nowIso: string;
}) {
  const {
    senderId,
    senderCardId,
    senderName,
    receiverId,
    receiverCardId,
    receiverName,
    amount,
    remarks,
    nowIso,
  } = params;

  const noteSuffix = remarks ? ` — ${remarks}` : '';

  const senderEntry = {
    user_id: senderId,
    card_id: senderCardId,
    amount,
    transaction_type: 'debit' as const,
    transaction_date: nowIso,
    remarks: `Transfer to ${receiverName}${noteSuffix}`,
  };

  const receiverEntry = {
    user_id: receiverId,
    card_id: receiverCardId,
    amount,
    transaction_type: 'credit' as const,
    transaction_date: nowIso,
    remarks: `Received from ${senderName}${noteSuffix}`,
  };

  return { senderEntry, receiverEntry };
}
