import { describe, it, expect } from 'vitest';
import {
  getFamilyCardIds,
  calculateTotalLimit,
  calculateCardLimits,
  calculateCardAvailableMap,
  calculateCardLimitStats,
  calculatePersonalDue,
} from '../limits';
import { calculateNextBillCountdown, calculateDaysToBill } from '../billing';
import { CardData } from '../../types';

describe('Pillar 4A: Dashboard Limits & Card Family Utilization', () => {
  const mockCards: CardData[] = [
    {
      id: 'card-primary-1',
      card_name: 'HDFC Regalia',
      last_4_digits: '1234',
      total_limit: 200000,
      is_primary: true,
      bill_gen_day: 5,
      bill_due_day: 25,
    },
    {
      id: 'card-child-1',
      card_name: 'HDFC Add-On Brother',
      last_4_digits: '5678',
      total_limit: 200000, // shared limit with primary
      is_primary: false,
      parent_card_id: 'card-primary-1',
      bill_gen_day: 5,
      bill_due_day: 25,
    },
    {
      id: 'card-primary-2',
      card_name: 'SBI Cashback',
      last_4_digits: '9999',
      total_limit: 100000,
      is_primary: true,
      bill_gen_day: 12,
      bill_due_day: 2,
    },
  ];

  describe('1. Card Family Resolution & Total Limit', () => {
    it('should return all card IDs when selectedCardId is "all"', () => {
      const ids = getFamilyCardIds('all', mockCards);
      expect(ids).toEqual(['card-primary-1', 'card-child-1', 'card-primary-2']);
    });

    it('should return primary and child card IDs when primary card is selected', () => {
      const ids = getFamilyCardIds('card-primary-1', mockCards);
      expect(ids).toEqual(['card-primary-1', 'card-child-1']);
    });

    it('should return primary and sibling IDs when a child card is selected', () => {
      const ids = getFamilyCardIds('card-child-1', mockCards);
      expect(ids).toEqual(['card-primary-1', 'card-child-1']);
    });

    it('should sum only primary card limits when "all" is selected to avoid double counting shared limit', () => {
      const totalLimit = calculateTotalLimit('all', mockCards);
      // HDFC Primary (200k) + SBI Primary (100k) = 300k. Child (200k) MUST NOT be added!
      expect(totalLimit).toBe(300000);
    });

    it('should resolve to primary card limit when child card is selected', () => {
      const totalLimit = calculateTotalLimit('card-child-1', mockCards);
      expect(totalLimit).toBe(200000);
    });
  });

  describe('2. Available Limit & Deduction Logic', () => {
    it('should calculate available limit with withdrawals and credit card spends deducted', () => {
      const transactions = [
        {
          amount: 50000,
          type: 'withdrawal',
          status: 'pending_settlement',
          qr_id: 'qr-1',
        },
        {
          amount: 20000,
          type: 'withdrawal',
          status: 'partially_settled',
          settlement_details: { total_due: 10000 },
          qr_id: 'qr-2',
        },
      ];

      const spends = [
        { amount: 15000, payment_method: 'credit_card' },
        { amount: 5000, payment_method: 'cash_on_hand' }, // cash on hand spend does NOT touch CC limit
      ];

      const metrics = calculateCardLimits({
        totalLimit: 200000,
        transactions,
        spends,
      });

      // Total deductions = withdrawals (50k + 20k = 70k) + ccSpends (15k) = 85k
      // Available = 200k - 85k = 115k
      expect(metrics.availableLimit).toBe(115000);
      expect(metrics.utilizedLimit).toBe(85000);
      expect(metrics.availablePercentage).toBe(58); // 115k / 200k = 57.5% -> 58%
      expect(metrics.utilizationPercentage).toBe(42); // 100 - 58 = 42%

      // In transit amount = pending (50k) + partially settled remaining due (10k) = 60k
      expect(metrics.inTransitAmount).toBe(60000);
    });

    it('should deduct manual settled rotation withdrawals when settled_to_user is present', () => {
      const transactions = [
        {
          amount: 50000,
          type: 'withdrawal',
          status: 'settled',
          qr_id: null,
          settled_to_user: 'user-2',
          remarks: 'Cash handed over directly',
        },
      ];

      const metrics = calculateCardLimits({
        totalLimit: 100000,
        transactions,
        spends: [],
      });

      // 100k - 50k (settled rotation withdrawal with settled_to_user) = 50k
      expect(metrics.availableLimit).toBe(50000);
      expect(metrics.utilizedLimit).toBe(50000);
    });

    it('should deduct settled lent withdrawals from available limit without inflating inTransitAmount', () => {
      const transactions = [
        {
          amount: 40000,
          type: 'withdrawal',
          status: 'settled',
          remarks: 'Lent given to Rahim',
        },
      ];

      const spends: any[] = [];

      const metrics = calculateCardLimits({
        totalLimit: 100000,
        transactions,
        spends,
      });

      // Available = 100k - 40k = 60k
      expect(metrics.availableLimit).toBe(60000);
      expect(metrics.utilizedLimit).toBe(40000);
      // In-transit MUST be 0 because a loan is settled, not an in-transit rotation
      expect(metrics.inTransitAmount).toBe(0);
    });

    it('should add back bill payments when calculating available limit', () => {
      const transactions = [
        { amount: 50000, type: 'withdrawal', status: 'pending_settlement', qr_id: 'qr-1' },
        { amount: 30000, type: 'bill_payment', status: 'settled' },
      ];

      const spends = [{ amount: 20000, payment_method: 'credit_card' }];

      const metrics = calculateCardLimits({
        totalLimit: 100000,
        transactions,
        spends,
      });

      // Available = 100k - 50k (withdrawal) - 20k (spend) + 30k (bill payment) = 60k
      expect(metrics.availableLimit).toBe(60000);
      expect(metrics.utilizedLimit).toBe(40000);
      expect(metrics.availablePercentage).toBe(60);
      expect(metrics.utilizationPercentage).toBe(40);
    });

    it('should clamp available and utilization percentages between 0 and 100', () => {
      const transactions = [
        { amount: 300000, type: 'withdrawal', status: 'pending_settlement', qr_id: 'qr-1' },
      ];

      const metrics = calculateCardLimits({
        totalLimit: 100000,
        transactions,
        spends: [],
      });

      expect(metrics.availableLimit).toBe(0);
      expect(metrics.availablePercentage).toBe(0);
      expect(metrics.utilizationPercentage).toBe(100);
    });
  });

  describe('3. Card Available Map & Family Sharing', () => {
    it('should assign shared available limit to both primary and add-on child cards', () => {
      const allTxs = [
        {
          amount: 40000,
          type: 'withdrawal',
          card_id: 'card-primary-1',
          status: 'pending_settlement',
          qr_id: 'qr-1',
        },
        {
          amount: 10000,
          type: 'withdrawal',
          card_id: 'card-child-1',
          status: 'pending_settlement',
          qr_id: 'qr-2',
        },
      ];

      const allSpends = [
        { amount: 10000, payment_method: 'credit_card', card_id: 'card-primary-1' },
      ];

      const availableMap = calculateCardAvailableMap(mockCards, allTxs, allSpends);

      // Family HDFC total limit = 200k. Family deductions = 40k + 10k + 10k = 60k.
      // Shared available limit = 140k.
      expect(availableMap['card-primary-1']).toBe(140000);
      expect(availableMap['card-child-1']).toBe(140000);

      // SBI has 0 transactions, so full 100k available
      expect(availableMap['card-primary-2']).toBe(100000);
    });
  });

  describe('4. Card Limit Stats for Hero Chart & Feed', () => {
    it('should aggregate root primary cards and count sub-cards without duplicating roots', () => {
      const stats = calculateCardLimitStats({
        cards: mockCards,
        transactions: [],
        spends: [],
      });

      // Should return 2 stats (HDFC root and SBI root)
      expect(stats.length).toBe(2);

      const hdfcStat = stats.find((s) => s.id === 'card-primary-1');
      expect(hdfcStat).toBeDefined();
      expect(hdfcStat?.hasSubCards).toBe(true);
      expect(hdfcStat?.subCardsCount).toBe(1);
      expect(hdfcStat?.subCardsLast4).toEqual(['5678']);
      expect(hdfcStat?.totalLimit).toBe(200000);
      expect(hdfcStat?.availableLimit).toBe(200000);
      expect(hdfcStat?.utilizationRatio).toBe(0);

      const sbiStat = stats.find((s) => s.id === 'card-primary-2');
      expect(sbiStat).toBeDefined();
      expect(sbiStat?.hasSubCards).toBe(false);
      expect(sbiStat?.subCardsCount).toBe(0);
    });
  });

  describe('5. Personal Due Calculation', () => {
    it('should calculate personal due from personal spends and subtract own pocket repayments', () => {
      const allSpends = [
        { user_id: 'user-1', amount: 15000, payment_method: 'credit_card' },
        { user_id: 'user-1', amount: 5000, payment_method: 'from_card_limit' },
        { user_id: 'user-2', amount: 8000, payment_method: 'credit_card' },
      ];

      const allTxs = [
        {
          recorded_by: 'user-1',
          amount: 8000,
          type: 'bill_payment',
          payment_method: 'own_pocket',
        },
      ];

      // user-1 personal spends = 15k + 5k = 20k. Repayment from own pocket = 8k.
      // Net due = 12k.
      const user1Due = calculatePersonalDue('user-1', allSpends, allTxs);
      expect(user1Due).toBe(12000);

      const user2Due = calculatePersonalDue('user-2', allSpends, allTxs);
      expect(user2Due).toBe(8000);
    });
  });

  describe('6. Next Bill Date Countdown', () => {
    it('should calculate countdown to due date accurately with fixed reference date', () => {
      const refDate = new Date(2026, 10, 10); // 10 Nov 2026

      const countdown = calculateNextBillCountdown(mockCards, 'card-primary-1', refDate);
      // HDFC due day = 25. Target = 25 Nov 2026. Diff = 15 days.
      expect(countdown.daysToBill).toBe(15);
      expect(countdown.nextBillDate).toContain('25th');
    });

    it('should roll over to next month if reference date is past the due date in current month', () => {
      const refDate = new Date(2026, 10, 26); // 26 Nov 2026 (past 25th)

      const countdown = calculateNextBillCountdown(mockCards, 'card-primary-1', refDate);
      // Target rolls over to 25 Dec 2026.
      expect(countdown.daysToBill).toBe(29);
      expect(countdown.nextBillDate).toContain('25th');
      expect(countdown.nextBillDate).toContain('Dec');
    });
  });
});
