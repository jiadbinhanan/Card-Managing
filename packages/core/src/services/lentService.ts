import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Handles collecting lent money to pay down a credit card bill cycle.
 * 1. Checks current month's billing cycle.
 * 2. If cycle exists and paid_amount < generated_amount, pay down cycle.
 * 3. Inserts into card_transactions (type: 'bill_payment', payment_method: 'lent_recovery').
 * 4. Inserts into card_lent_ledger linking to borrower and card transaction.
 */
export async function recordLentCollectedCreditCardPaydown(
  supabase: SupabaseClient,
  params: {
    borrowerId: string;
    borrowerName: string;
    cardId: string;
    amount: number;
    txDate: string; // YYYY-MM-DD
    userId: string;
    createdAt?: string;
  }
): Promise<{ cycleId: string | null; cardTxId: string; lentLedgerId: string }> {
  const { borrowerId, borrowerName, cardId, amount, txDate, userId, createdAt } = params;

  const now = new Date(txDate);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  });
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Kolkata',
  });

  // 1. Check current month's cycle
  const { data: cycles } = await supabase
    .from('billing_cycles')
    .select('*')
    .eq('card_id', cardId)
    .gte('billing_month', startOfMonth)
    .lte('billing_month', endOfMonth);

  let activeCycleId: string | null = null;
  if (cycles && cycles.length > 0) {
    const cycle = cycles[0];
    const genAmt = Number(cycle.generated_amount || 0);
    const curPaid = Number(cycle.paid_amount || 0);
    if (curPaid < genAmt) {
      activeCycleId = cycle.id;
      const newPaid = curPaid + amount;
      const status = newPaid >= genAmt ? 'paid' : newPaid > 0 ? 'partially_paid' : cycle.status;
      await supabase
        .from('billing_cycles')
        .update({ paid_amount: newPaid, status })
        .eq('id', cycle.id);
    }
  }

  // 2. Insert into card_transactions
  const { data: txRow, error: txErr } = await supabase
    .from('card_transactions')
    .insert({
      card_id: cardId,
      amount,
      transaction_date: txDate,
      ...(createdAt ? { created_at: createdAt } : {}),
      type: 'bill_payment',
      status: 'settled',
      recorded_by: userId,
      payment_method: 'lent_recovery',
      remarks: `Collected lent from ${borrowerName}`,
      billing_cycle_id: activeCycleId,
    })
    .select('id')
    .single();

  if (txErr) {
    throw new Error(`Failed to insert card_transaction for lent collection: ${txErr.message}`);
  }

  // 3. Insert into card_lent_ledger
  const { data: lentRow, error: lentErr } = await supabase
    .from('card_lent_ledger')
    .insert({
      borrower_id: borrowerId,
      entry_type: 'collected',
      amount,
      transaction_date: txDate,
      ...(createdAt ? { created_at: createdAt } : {}),
      source_type: 'credit_card',
      card_id: cardId,
      linked_card_transaction_id: txRow?.id,
      linked_billing_cycle_id: activeCycleId,
      billing_cycle_delta_amount: activeCycleId ? amount : null,
      recorded_by: userId,
    })
    .select('id')
    .single();

  if (lentErr) {
    throw new Error(`Failed to insert card_lent_ledger row: ${lentErr.message}`);
  }

  return {
    cycleId: activeCycleId,
    cardTxId: txRow?.id,
    lentLedgerId: lentRow?.id,
  };
}
