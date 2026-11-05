import { SettlementDetails, SettlementHistoryEntry, SettlementTransitionResult } from '../types';

/**
 * Calculates in-transit rotation total accounting for partial settlement total_due.
 */
export function calculateInTransitTotal(
  transactions: Array<{
    amount: number;
    type: string;
    status: string;
    qr_id?: string | null;
    remarks?: string | null;
    settlement_details?: SettlementDetails | null;
  }>
): number {
  return transactions
    .filter((t) => {
      if (t.type !== 'withdrawal') return false;
      const isRotation = t.qr_id || (t.remarks || '').toLowerCase().includes('rotation');
      return isRotation && t.status !== 'settled';
    })
    .reduce((sum, t) => {
      const due =
        t.status === 'partially_settled' && t.settlement_details?.total_due !== undefined
          ? Number(t.settlement_details.total_due)
          : Number(t.amount || 0);
      return sum + due;
    }, 0);
}

/**
 * Pure state machine transition for full and partial rotation settlement.
 */
export function computeSettlementTransition(params: {
  transaction: {
    id: string;
    amount: number;
    settlement_details?: SettlementDetails | null;
    qrMerchantName?: string;
    remarks?: string;
  };
  settlementType: 'full' | 'partial';
  partialAmount?: number;
  cashReceiverId: string;
  targetCardId: string;
  customRemarks?: string;
  todayDateStr: string; // YYYY-MM-DD
  nowIsoString: string;
}): SettlementTransitionResult {
  const {
    transaction,
    settlementType,
    partialAmount,
    cashReceiverId,
    targetCardId,
    customRemarks,
    todayDateStr,
    nowIsoString,
  } = params;

  const currentDue =
    transaction.settlement_details?.total_due !== undefined
      ? Number(transaction.settlement_details.total_due)
      : Number(transaction.amount || 0);

  let amtToSettle = currentDue;
  if (settlementType === 'partial' && partialAmount && partialAmount > 0 && partialAmount < currentDue) {
    amtToSettle = partialAmount;
  }

  const prevSettled = Number(transaction.settlement_details?.total_settled || 0);
  const newSettled = prevSettled + amtToSettle;
  const newDue = Math.max(0, Number(transaction.amount || 0) - newSettled);
  const newStatus = newDue <= 0 ? 'settled' : 'partially_settled';

  const newHistoryEntry: SettlementHistoryEntry = {
    settle_id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    amount: amtToSettle,
    settled_date: todayDateStr,
    settled_to_user: cashReceiverId,
    card_id: targetCardId,
    remarks: customRemarks || undefined,
  };

  const updatedDetails: SettlementDetails = {
    total_settled: newSettled,
    total_due: newDue,
    history: [...(transaction.settlement_details?.history || []), newHistoryEntry],
  };

  const qrOrRemarks = transaction.qrMerchantName || transaction.remarks || 'Rotation';
  const ledgerRemarks = customRemarks
    ? `Settlement received from ${qrOrRemarks} - ${customRemarks}`
    : `Settlement received from ${qrOrRemarks}`;

  const ledgerEntry = {
    user_id: cashReceiverId,
    card_id: targetCardId,
    amount: amtToSettle,
    transaction_type: 'credit' as const,
    remarks: ledgerRemarks,
    transaction_date: nowIsoString,
    created_at: nowIsoString,
    linked_card_transaction_id: transaction.id,
  };

  return {
    newStatus,
    amtToSettle,
    newSettled,
    newDue,
    updatedDetails,
    ledgerEntry,
  };
}
