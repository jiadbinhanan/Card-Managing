import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Inserts atomic debit records into cash_on_hand_ledger for multiple card sources.
 * Triggers database trigger `trg_sync_cash_on_hand` to automatically adjust balances.
 */
export async function deductCashFromSources(
  supabase: SupabaseClient,
  params: {
    userId: string;
    sources: Array<{ cardId: string; amount: number }>;
    note: string;
    linkedCardTxId?: string | null;
    txDate?: string;
    createdAt?: string;
  }
): Promise<void> {
  const { userId, sources, note, linkedCardTxId, txDate, createdAt } = params;

  for (const src of sources) {
    if (src.amount > 0 && src.cardId) {
      const { error } = await supabase.from('cash_on_hand_ledger').insert({
        card_id: src.cardId,
        user_id: userId,
        amount: src.amount,
        transaction_type: 'debit',
        remarks: note,
        transaction_date: txDate || new Date().toISOString(),
        ...(createdAt ? { created_at: createdAt } : {}),
        linked_card_transaction_id: linkedCardTxId || null,
      });

      if (error) {
        throw new Error(`Failed to deduct cash from card ${src.cardId}: ${error.message}`);
      }
    }
  }
}

/**
 * Inserts single credit or debit into cash_on_hand_ledger.
 */
export async function updateCashBalance(
  supabase: SupabaseClient,
  params: {
    userId: string;
    cardId: string;
    amount: number;
    type: 'credit' | 'debit';
    note: string;
    linkedCardTxId?: string | null;
    txDate?: string;
    createdAt?: string;
  }
): Promise<string> {
  const { userId, cardId, amount, type, note, linkedCardTxId, txDate, createdAt } = params;

  const { data, error } = await supabase
    .from('cash_on_hand_ledger')
    .insert({
      card_id: cardId,
      user_id: userId,
      amount,
      transaction_type: type,
      remarks: note,
      transaction_date: txDate || new Date().toISOString(),
      ...(createdAt ? { created_at: createdAt } : {}),
      linked_card_transaction_id: linkedCardTxId || null,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to update cash balance: ${error.message}`);
  }

  return data?.id;
}
