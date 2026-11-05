import { SupabaseClient } from '@supabase/supabase-js';
import { BillingCycle, BillCycleStatus } from '../types';

export interface ProcessBillPaymentResult {
  cycleId: string | null;
  status: BillCycleStatus | null;
  remainingDue: number;
}

/**
 * Executes FIFO bill payment distribution across billing cycles in Supabase.
 * 1. Finds the oldest unpaid/partially paid cycle by billing_month ASC.
 * 2. If all are paid, falls back to latest billing cycle (advance payment).
 * 3. Updates billing_cycles table with new paid_amount and updated status.
 * 4. Returns cycleId, updated status, and remainingDue.
 */
export async function processBillPaymentFIFO(
  supabase: SupabaseClient,
  cardId: string,
  amount: number
): Promise<ProcessBillPaymentResult> {
  const result: ProcessBillPaymentResult = { cycleId: null, status: null, remainingDue: 0 };

  // 1. First search for oldest unpaid or partially_paid cycle (FIFO)
  const { data: dueCycles } = await supabase
    .from('billing_cycles')
    .select('*')
    .eq('card_id', cardId)
    .in('status', ['unpaid', 'partially_paid'])
    .order('billing_month', { ascending: true });

  let targetCycle: BillingCycle | null = dueCycles && dueCycles.length > 0 ? dueCycles[0] : null;

  // 2. If no unpaid cycle exists, fallback to latest cycle (advance payment)
  if (!targetCycle) {
    const { data: latestCycles } = await supabase
      .from('billing_cycles')
      .select('*')
      .eq('card_id', cardId)
      .order('billing_month', { ascending: false })
      .limit(1);

    if (latestCycles && latestCycles.length > 0) {
      targetCycle = latestCycles[0];
    }
  }

  if (targetCycle) {
    const generatedAmt = Number(targetCycle.generated_amount || 0);
    const paidAmt = Number(targetCycle.paid_amount || 0);
    const newPaidAmt = paidAmt + amount;
    let cycleStatus: BillCycleStatus = targetCycle.status;

    if (newPaidAmt >= generatedAmt) {
      cycleStatus = 'paid';
      result.remainingDue = 0;
    } else if (newPaidAmt > 0) {
      cycleStatus = 'partially_paid';
      result.remainingDue = generatedAmt - newPaidAmt;
    } else {
      cycleStatus = 'unpaid';
      result.remainingDue = generatedAmt;
    }

    await supabase
      .from('billing_cycles')
      .update({ paid_amount: newPaidAmt, status: cycleStatus })
      .eq('id', targetCycle.id);

    result.cycleId = targetCycle.id;
    result.status = cycleStatus;
  }

  return result;
}
