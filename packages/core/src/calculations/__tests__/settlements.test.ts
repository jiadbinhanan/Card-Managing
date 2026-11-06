import { describe, it, expect } from 'vitest';
import {
  calculateInTransitTotal,
  computeSettlementTransition,
} from '../settlements';

describe('Pillar 4D: In-Transit Liquidity & Settlement State Transitions', () => {
  describe('1. In-Transit Liquidity Total Calculation', () => {
    it('should sum pending and partially settled amounts, ignoring fully settled transactions', () => {
      const transactions = [
        {
          amount: 50000,
          type: 'withdrawal',
          status: 'pending_settlement',
          qr_id: 'qr-1',
        },
        {
          amount: 30000,
          type: 'withdrawal',
          status: 'partially_settled',
          qr_id: 'qr-2',
          settlement_details: {
            total_settled: 12000,
            total_due: 18000,
            history: [],
          },
        },
        {
          amount: 40000,
          type: 'withdrawal',
          status: 'settled', // fully settled -> excluded
          qr_id: 'qr-3',
        },
      ];

      // Total in-transit = 50,000 (pending) + 18,000 (partially settled due) = 68,000
      const total = calculateInTransitTotal(transactions);
      expect(total).toBe(68000);
    });
  });

  describe('2. Settlement State Transition (Full Settlement)', () => {
    it('should transition status to settled, set total_due to 0, append milestone history, and create cash credit ledger entry', () => {
      const tx = {
        id: 'tx-100',
        amount: 25000,
        qrMerchantName: 'Apex Electronics',
        remarks: 'Card swipe rotation',
        settlement_details: null,
      };

      const result = computeSettlementTransition({
        transaction: tx,
        settlementType: 'full',
        cashReceiverId: 'user-receiver-1',
        targetCardId: 'card-1',
        customRemarks: 'Instant UPI settlement',
        todayDateStr: '2026-11-06',
        nowIsoString: '2026-11-06T14:30:00Z',
      });

      expect(result.amtToSettle).toBe(25000);
      expect(result.newStatus).toBe('settled');
      expect(result.updatedDetails.total_settled).toBe(25000);
      expect(result.updatedDetails.total_due).toBe(0);
      expect(result.updatedDetails.history.length).toBe(1);

      const milestone = result.updatedDetails.history[0];
      expect(milestone.amount).toBe(25000);
      expect(milestone.settled_date).toBe('2026-11-06');
      expect(milestone.settled_to_user).toBe('user-receiver-1');
      expect(milestone.card_id).toBe('card-1');

      // Cash on hand credit ledger entry
      expect(result.ledgerEntry.amount).toBe(25000);
      expect(result.ledgerEntry.transaction_type).toBe('credit');
      expect(result.ledgerEntry.user_id).toBe('user-receiver-1');
      expect(result.ledgerEntry.card_id).toBe('card-1');
      expect(result.ledgerEntry.remarks).toContain('Settlement received from Apex Electronics');
    });
  });

  describe('3. Settlement State Transition (Partial Settlement)', () => {
    it('should transition status to partially_settled, adjust total_due, and append milestone history', () => {
      // Existing transaction with 50,000 total and previous 10,000 settled (40k remaining due)
      const tx = {
        id: 'tx-200',
        amount: 50000,
        qrMerchantName: 'Quick Mart',
        settlement_details: {
          total_settled: 10000,
          total_due: 40000,
          history: [
            {
              settle_id: 'past-1',
              amount: 10000,
              settled_date: '2026-11-01',
              settled_to_user: 'user-receiver-1',
              card_id: 'card-1',
            },
          ],
        },
      };

      // User settles 15,000 partially
      const result = computeSettlementTransition({
        transaction: tx,
        settlementType: 'partial',
        partialAmount: 15000,
        cashReceiverId: 'user-receiver-1',
        targetCardId: 'card-1',
        todayDateStr: '2026-11-06',
        nowIsoString: '2026-11-06T15:00:00Z',
      });

      expect(result.amtToSettle).toBe(15000);
      expect(result.newStatus).toBe('partially_settled');
      // Total settled = 10k + 15k = 25k
      expect(result.updatedDetails.total_settled).toBe(25000);
      // Remaining due = 50k - 25k = 25k
      expect(result.updatedDetails.total_due).toBe(25000);
      expect(result.updatedDetails.history.length).toBe(2);

      // Ledger credit matches partial amount
      expect(result.ledgerEntry.amount).toBe(15000);
      expect(result.ledgerEntry.transaction_type).toBe('credit');
    });
  });
});
