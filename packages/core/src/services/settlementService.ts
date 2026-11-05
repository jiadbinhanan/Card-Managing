import { SupabaseClient } from '@supabase/supabase-js';
import { SettlementTransitionResult } from '../types';

/**
 * Commits a full or partial settlement transaction to Supabase:
 * 1. Updates card_transactions status and settlement_details.
 * 2. Inserts credit into cash_on_hand_ledger for the cash receiver.
 */
export async function executeSettlementTransaction(
  supabase: SupabaseClient,
  params: {
    transactionId: string;
    settleTargetCardId: string;
    cashReceiverId: string;
    settlementResult: SettlementTransitionResult;
    todayDateStr: string;
  }
): Promise<void> {
  const { transactionId, settleTargetCardId, cashReceiverId, settlementResult, todayDateStr } = params;

  // 1. Update transaction in card_transactions
  const updatePayload: Record<string, any> = {
    status: settlementResult.newStatus,
    settlement_details: settlementResult.updatedDetails,
  };

  if (settlementResult.newStatus === 'settled') {
    updatePayload.settled_date = todayDateStr;
    updatePayload.settled_to_user = cashReceiverId;
    updatePayload.card_id = settleTargetCardId;
  }

  const { error: txError } = await supabase
    .from('card_transactions')
    .update(updatePayload)
    .eq('id', transactionId);

  if (txError) {
    throw new Error(`Failed to update card_transactions for settlement: ${txError.message}`);
  }

  // 2. Insert cash_on_hand_ledger credit entry
  const { error: ledgerError } = await supabase
    .from('cash_on_hand_ledger')
    .insert(settlementResult.ledgerEntry);

  if (ledgerError) {
    throw new Error(`Failed to insert cash_on_hand_ledger entry for settlement: ${ledgerError.message}`);
  }
}
