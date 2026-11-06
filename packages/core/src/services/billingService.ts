import { SupabaseClient } from '@supabase/supabase-js';
import { BillingCycle, BillCycleStatus } from '../types';

export interface ProcessBillPaymentResult {
  cycleId: string | null;
  status: BillCycleStatus | null;
  remainingDue: number;
}

export interface BillPaymentCycleUpdate {
  cycleId: string;
  previousPaidAmount: number;
  newPaidAmount: number;
  allocatedAmount: number;
  status: BillCycleStatus;
  remainingCycleDue: number;
}

export interface BillPaymentDistributionResult {
  targetCycleId: string | null;
  targetCycleStatus: BillCycleStatus | null;
  remainingDue: number;
  allocatedCycles: BillPaymentCycleUpdate[];
  excessAdvanceAmount: number;
}

/**
 * Pure mathematical calculation of FIFO bill payment distribution across multiple billing cycles.
 * 1. Sorts unpaid / partially paid cycles chronologically (billing_month ASC).
 * 2. Allocates payment in FIFO order.
 * 3. If excess payment exists, allocates remainder to latest cycle as advance.
 */
export function computeBillPaymentDistribution(
  cycles: BillingCycle[],
  amount: number
): BillPaymentDistributionResult {
  const result: BillPaymentDistributionResult = {
    targetCycleId: null,
    targetCycleStatus: null,
    remainingDue: 0,
    allocatedCycles: [],
    excessAdvanceAmount: 0,
  };

  if (!cycles || cycles.length === 0 || amount <= 0) {
    return result;
  }

  // 1. Separate unpaid or partially_paid cycles (FIFO: oldest first)
  const dueCycles = cycles
    .filter((c) => c.status === 'unpaid' || c.status === 'partially_paid')
    .sort((a, b) => a.billing_month.localeCompare(b.billing_month));

  let remainingPayment = amount;

  if (dueCycles.length > 0) {
    for (const cycle of dueCycles) {
      if (remainingPayment <= 0) break;

      const genAmt = Number(cycle.generated_amount || 0);
      const prevPaid = Number(cycle.paid_amount || 0);
      const cycleDue = Math.max(0, genAmt - prevPaid);

      const allocation = Math.min(remainingPayment, cycleDue);
      const newPaid = prevPaid + allocation;
      remainingPayment -= allocation;

      let cycleStatus: BillCycleStatus = 'unpaid';
      if (newPaid >= genAmt) {
        cycleStatus = 'paid';
      } else if (newPaid > 0) {
        cycleStatus = 'partially_paid';
      }

      result.allocatedCycles.push({
        cycleId: cycle.id,
        previousPaidAmount: prevPaid,
        newPaidAmount: newPaid,
        allocatedAmount: allocation,
        status: cycleStatus,
        remainingCycleDue: Math.max(0, genAmt - newPaid),
      });

      if (!result.targetCycleId) {
        result.targetCycleId = cycle.id;
        result.targetCycleStatus = cycleStatus;
      }
    }
  }

  // 2. If excess payment remains after clearing all due cycles (or if no due cycles existed),
  // allocate excess to the latest cycle as advance payment
  if (remainingPayment > 0) {
    const latestCycle = [...cycles].sort((a, b) =>
      b.billing_month.localeCompare(a.billing_month)
    )[0];

    if (latestCycle) {
      const existingAllocIndex = result.allocatedCycles.findIndex(
        (a) => a.cycleId === latestCycle.id
      );

      if (existingAllocIndex >= 0) {
        const existing = result.allocatedCycles[existingAllocIndex];
        const newPaidWithAdvance = existing.newPaidAmount + remainingPayment;
        result.allocatedCycles[existingAllocIndex] = {
          ...existing,
          newPaidAmount: newPaidWithAdvance,
          allocatedAmount: existing.allocatedAmount + remainingPayment,
          status: 'paid',
        };
      } else {
        const prevPaid = Number(latestCycle.paid_amount || 0);
        result.allocatedCycles.push({
          cycleId: latestCycle.id,
          previousPaidAmount: prevPaid,
          newPaidAmount: prevPaid + remainingPayment,
          allocatedAmount: remainingPayment,
          status: 'paid',
          remainingCycleDue: 0,
        });

        if (!result.targetCycleId) {
          result.targetCycleId = latestCycle.id;
          result.targetCycleStatus = 'paid';
        }
      }

      result.excessAdvanceAmount = remainingPayment;
      remainingPayment = 0;
    }
  }

  // 3. Compute remaining total due across all cycles
  const updatedCycleMap = new Map<string, number>();
  result.allocatedCycles.forEach((a) => updatedCycleMap.set(a.cycleId, a.newPaidAmount));

  result.remainingDue = cycles.reduce((sum, c) => {
    const paid = updatedCycleMap.has(c.id)
      ? updatedCycleMap.get(c.id)!
      : Number(c.paid_amount || 0);
    const gen = Number(c.generated_amount || 0);
    return sum + Math.max(0, gen - paid);
  }, 0);

  return result;
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
