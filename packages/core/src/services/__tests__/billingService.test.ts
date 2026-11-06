import { describe, it, expect } from 'vitest';
import { computeBillPaymentDistribution } from '../billingService';
import { BillingCycle } from '../../types';

describe('Pillar 4B: FIFO Bill Payment Distribution & Allocation', () => {
  const mockCycles: BillingCycle[] = [
    {
      id: 'cycle-nov',
      card_id: 'card-1',
      billing_month: '2026-11-01',
      generated_amount: 40000,
      paid_amount: 0,
      status: 'unpaid',
    },
    {
      id: 'cycle-sept',
      card_id: 'card-1',
      billing_month: '2026-09-01',
      generated_amount: 30000,
      paid_amount: 10000, // 20k remaining due
      status: 'partially_paid',
    },
    {
      id: 'cycle-oct',
      card_id: 'card-1',
      billing_month: '2026-10-01',
      generated_amount: 50000,
      paid_amount: 0,
      status: 'unpaid',
    },
  ];

  it('1. should allocate payment in strict chronological FIFO order (oldest cycle first)', () => {
    // Total due: Sept (20k) + Oct (50k) + Nov (40k) = 110,000.
    // User pays 35,000:
    // - Sept receives 20,000 (completes 30k total -> paid)
    // - Oct receives 15,000 (leaves 35k due -> partially_paid)
    // - Nov receives 0 (remains 40k due -> unpaid)
    const result = computeBillPaymentDistribution(mockCycles, 35000);

    expect(result.allocatedCycles.length).toBe(2);

    // Oldest cycle: Sept
    const septUpdate = result.allocatedCycles.find((a) => a.cycleId === 'cycle-sept');
    expect(septUpdate).toBeDefined();
    expect(septUpdate?.allocatedAmount).toBe(20000);
    expect(septUpdate?.previousPaidAmount).toBe(10000);
    expect(septUpdate?.newPaidAmount).toBe(30000);
    expect(septUpdate?.status).toBe('paid');
    expect(septUpdate?.remainingCycleDue).toBe(0);

    // Second oldest cycle: Oct
    const octUpdate = result.allocatedCycles.find((a) => a.cycleId === 'cycle-oct');
    expect(octUpdate).toBeDefined();
    expect(octUpdate?.allocatedAmount).toBe(15000);
    expect(octUpdate?.newPaidAmount).toBe(15000);
    expect(octUpdate?.status).toBe('partially_paid');
    expect(octUpdate?.remainingCycleDue).toBe(35000);

    // Remaining total due across all cycles = 0 (Sept) + 35k (Oct) + 40k (Nov) = 75k
    expect(result.remainingDue).toBe(75000);
    expect(result.excessAdvanceAmount).toBe(0);
    expect(result.targetCycleId).toBe('cycle-sept');
    expect(result.targetCycleStatus).toBe('paid');
  });

  it('2. should mark all cycles paid when paying exact total due amount', () => {
    // Total due = 20k + 50k + 40k = 110,000
    const result = computeBillPaymentDistribution(mockCycles, 110000);

    expect(result.allocatedCycles.length).toBe(3);
    expect(result.allocatedCycles.every((a) => a.status === 'paid')).toBe(true);
    expect(result.remainingDue).toBe(0);
    expect(result.excessAdvanceAmount).toBe(0);
  });

  it('3. should handle excess payment by allocating remainder to latest cycle as advance without negative dues', () => {
    // Total due = 110,000. User pays 130,000 (20k excess advance)
    const result = computeBillPaymentDistribution(mockCycles, 130000);

    expect(result.remainingDue).toBe(0);
    expect(result.excessAdvanceAmount).toBe(20000);

    // Latest cycle is Nov (2026-11-01)
    const novUpdate = result.allocatedCycles.find((a) => a.cycleId === 'cycle-nov');
    expect(novUpdate).toBeDefined();
    // Nov had 40k due. Receives 40k + 20k excess = 60k paid amount.
    expect(novUpdate?.newPaidAmount).toBe(60000);
    expect(novUpdate?.status).toBe('paid');
    expect(novUpdate?.remainingCycleDue).toBe(0);
  });

  it('4. should allocate directly to latest cycle when all cycles are already paid (pure advance payment)', () => {
    const allPaidCycles: BillingCycle[] = [
      {
        id: 'cycle-1',
        card_id: 'card-1',
        billing_month: '2026-09-01',
        generated_amount: 30000,
        paid_amount: 30000,
        status: 'paid',
      },
      {
        id: 'cycle-2',
        card_id: 'card-1',
        billing_month: '2026-10-01',
        generated_amount: 50000,
        paid_amount: 50000,
        status: 'paid',
      },
    ];

    const result = computeBillPaymentDistribution(allPaidCycles, 25000);

    expect(result.allocatedCycles.length).toBe(1);
    const latestUpdate = result.allocatedCycles[0];
    expect(latestUpdate.cycleId).toBe('cycle-2');
    expect(latestUpdate.newPaidAmount).toBe(75000);
    expect(latestUpdate.status).toBe('paid');
    expect(result.excessAdvanceAmount).toBe(25000);
    expect(result.remainingDue).toBe(0);
  });

  it('5. should handle edge cases with 0 or negative payment amounts', () => {
    const result = computeBillPaymentDistribution(mockCycles, 0);
    expect(result.allocatedCycles.length).toBe(0);
    expect(result.targetCycleId).toBeNull();
  });
});
