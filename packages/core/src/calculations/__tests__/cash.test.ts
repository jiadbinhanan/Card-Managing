import { describe, it, expect } from 'vitest';
import {
  validateCashAllocation,
  calculateMaxAllowedSourceAmount,
  buildCashTransferLedgerEntries,
  resolveCashShortageWithPocketAdvance,
} from '../cash';

describe('Pillar 4C: Multi-Source Cash Splitting & Validation', () => {
  const cardBalances: Record<string, number> = {
    'card-1': 20000,
    'card-2': 15000,
    'card-3': 5000,
  };

  describe('1. Cash Allocation Validation', () => {
    it('should validate successfully when sum equals target and all sources have sufficient balance', () => {
      const sources = [
        { cardId: 'card-1', amount: 12000 },
        { cardId: 'card-2', amount: 8000 },
      ];
      const isValid = validateCashAllocation(sources, 20000, cardBalances);
      expect(isValid).toBe(true);
    });

    it('should reject allocation when sum does not equal target amount', () => {
      const sources = [
        { cardId: 'card-1', amount: 10000 },
        { cardId: 'card-2', amount: 5000 },
      ];
      // Sum is 15k, but target is 20k -> should fail
      const isValid = validateCashAllocation(sources, 20000, cardBalances);
      expect(isValid).toBe(false);
    });

    it('should reject allocation when an individual source exceeds available card balance', () => {
      const sources = [
        { cardId: 'card-1', amount: 25000 }, // Card-1 only has 20,000!
      ];
      const isValid = validateCashAllocation(sources, 25000, cardBalances);
      expect(isValid).toBe(false);
    });

    it('should reject allocation when target amount is zero or negative', () => {
      const sources = [{ cardId: 'card-1', amount: 0 }];
      expect(validateCashAllocation(sources, 0, cardBalances)).toBe(false);
    });
  });

  describe('2. MAX Button Auto-Fill Calculation', () => {
    it('should calculate MAX allowed amount capped by remaining needed amount', () => {
      const sources = [
        { cardId: 'card-1', amount: 10000 },
        { cardId: 'card-2', amount: 0 },
      ];
      // Target = 15,000. Card-1 already has 10,000.
      // Remaining needed = 5,000. Card-2 balance = 15,000.
      // MAX for Card-2 should be min(15000, 5000) = 5,000.
      const maxAllowed = calculateMaxAllowedSourceAmount(1, sources, 15000, cardBalances['card-2']);
      expect(maxAllowed).toBe(5000);
    });

    it('should cap MAX to card balance when remaining needed exceeds card balance', () => {
      const sources = [
        { cardId: 'card-3', amount: 0 },
      ];
      // Target = 30,000. Card-3 balance = 5,000.
      // MAX should be 5,000 (cannot exceed available balance).
      const maxAllowed = calculateMaxAllowedSourceAmount(0, sources, 30000, cardBalances['card-3']);
      expect(maxAllowed).toBe(5000);
    });

    it('should return 0 when card balance is 0', () => {
      const maxAllowed = calculateMaxAllowedSourceAmount(0, [], 10000, 0);
      expect(maxAllowed).toBe(0);
    });
  });

  describe('3. P2P Cash Transfer Double-Entry Ledger Rows', () => {
    it('should generate matching debit and credit entries with exact amount and timestamps', () => {
      const nowIso = new Date().toISOString();
      const { senderEntry, receiverEntry } = buildCashTransferLedgerEntries({
        senderId: 'user-alice',
        senderCardId: 'card-1',
        senderName: 'Alice',
        receiverId: 'user-bob',
        receiverCardId: 'card-2',
        receiverName: 'Bob',
        amount: 8000,
        remarks: 'Dinner split',
        nowIso,
      });

      expect(senderEntry.user_id).toBe('user-alice');
      expect(senderEntry.card_id).toBe('card-1');
      expect(senderEntry.amount).toBe(8000);
      expect(senderEntry.transaction_type).toBe('debit');
      expect(senderEntry.remarks).toContain('Transfer to Bob');
      expect(senderEntry.transaction_date).toBe(nowIso);

      expect(receiverEntry.user_id).toBe('user-bob');
      expect(receiverEntry.card_id).toBe('card-2');
      expect(receiverEntry.amount).toBe(8000);
      expect(receiverEntry.transaction_type).toBe('credit');
      expect(receiverEntry.remarks).toContain('Received from Alice');
      expect(receiverEntry.transaction_date).toBe(nowIso);
    });
  });

  describe('4. Cash Shortage Resolution & Pocket Advance Deficit', () => {
    it('should compute cash paid and pocket advance deficit when total cash is insufficient', () => {
      // Total available cash = 20k + 15k + 5k = 40,000.
      // Bill target amount = 55,000.
      const resolution = resolveCashShortageWithPocketAdvance(55000, cardBalances);

      expect(resolution.isShortage).toBe(true);
      expect(resolution.totalAvailableCash).toBe(40000);
      expect(resolution.cashPaid).toBe(40000);
      expect(resolution.pocketAdvanceDeficit).toBe(15000); // 55k - 40k = 15k pocket advance
      expect(resolution.allocations.length).toBe(3);
    });

    it('should indicate zero deficit when available cash is sufficient', () => {
      // Bill target amount = 25,000. Total available cash = 40,000.
      const resolution = resolveCashShortageWithPocketAdvance(25000, cardBalances);

      expect(resolution.isShortage).toBe(false);
      expect(resolution.cashPaid).toBe(25000);
      expect(resolution.pocketAdvanceDeficit).toBe(0);
    });
  });
});
