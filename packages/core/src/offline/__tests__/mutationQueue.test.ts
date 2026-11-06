import { describe, it, expect } from 'vitest';
import {
  createOfflineMutationItem,
  serializeOfflineQueue,
  deserializeOfflineQueue,
  sortQueueFIFO,
  filterSyncableMutations,
  recordMutationFailure,
  OfflineMutationItem,
} from '../mutationQueue';

describe('Pillar 4E: Offline Queue Persistence & Timestamp Preservation', () => {
  const customTimestamp = '2026-11-06T07:15:23.456Z';
  const customDate = '2026-11-06';
  const customTimeStr = '07:15 am';

  describe('1. Mutation Creation & Timestamp Preservation', () => {
    it('should strictly preserve original_created_at, transaction_date, and timeStr upon enqueue', () => {
      const item = createOfflineMutationItem({
        type: 'spend',
        payload: { amount: 5000, activeCardId: 'card-1', remarks: 'Groceries' },
        originalCreatedAt: customTimestamp,
        transactionDate: customDate,
        timeStr: customTimeStr,
      });

      expect(item.type).toBe('spend');
      expect(item.status).toBe('pending');
      expect(item.retryCount).toBe(0);
      expect(item.original_created_at).toBe(customTimestamp);
      expect(item.transaction_date).toBe(customDate);
      expect(item.timeStr).toBe(customTimeStr);
      expect(item.id).toMatch(/^client_\d+_[a-z0-9]+$/);
    });

    it('should generate valid ISO timestamps when timestamps are omitted', () => {
      const before = Date.now();
      const item = createOfflineMutationItem({
        type: 'rotate',
        payload: { numAmount: 10000, activeCardId: 'card-1' },
      });
      const after = Date.now();

      const itemTime = new Date(item.original_created_at).getTime();
      expect(itemTime).toBeGreaterThanOrEqual(before);
      expect(itemTime).toBeLessThanOrEqual(after);
      expect(item.transaction_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(item.status).toBe('pending');
    });
  });

  describe('2. Disk Serialization & Deserialization (MMKV Round-Trip)', () => {
    it('should serialize and deserialize queue without losing data or precision', () => {
      const queue: OfflineMutationItem[] = [
        createOfflineMutationItem({
          type: 'bill',
          payload: { numAmount: 40000, activeCardId: 'card-1' },
          originalCreatedAt: '2026-11-06T08:00:00.000Z',
        }),
        createOfflineMutationItem({
          type: 'settlement',
          payload: { transactionId: 'tx-1', amtToSettle: 20000 },
          originalCreatedAt: '2026-11-06T08:30:00.000Z',
        }),
      ];

      const json = serializeOfflineQueue(queue);
      expect(typeof json).toBe('string');

      const restored = deserializeOfflineQueue(json);
      expect(restored.length).toBe(2);
      expect(restored[0].id).toBe(queue[0].id);
      expect(restored[0].type).toBe('bill');
      expect(restored[0].original_created_at).toBe('2026-11-06T08:00:00.000Z');
      expect(restored[1].type).toBe('settlement');
      expect(restored[1].original_created_at).toBe('2026-11-06T08:30:00.000Z');
    });

    it('should safely handle corrupted or null disk state', () => {
      expect(deserializeOfflineQueue(null)).toEqual([]);
      expect(deserializeOfflineQueue('')).toEqual([]);
      expect(deserializeOfflineQueue('   ')).toEqual([]);
      expect(deserializeOfflineQueue('{ corrupted json }')).toEqual([]);
      expect(deserializeOfflineQueue('{"notAnArray": true}')).toEqual([]);
    });
  });

  describe('3. Strict FIFO Ordering for Race Condition Prevention', () => {
    it('should sort mutations chronologically by original_created_at ascending', () => {
      const itemEarly = createOfflineMutationItem({
        type: 'rotate',
        payload: { numAmount: 10000 },
        originalCreatedAt: '2026-11-06T06:00:00.000Z',
      });

      const itemMiddle = createOfflineMutationItem({
        type: 'spend',
        payload: { numAmount: 2000 },
        originalCreatedAt: '2026-11-06T07:00:00.000Z',
      });

      const itemLate = createOfflineMutationItem({
        type: 'bill',
        payload: { numAmount: 8000 },
        originalCreatedAt: '2026-11-06T08:00:00.000Z',
      });

      // Out of order array
      const unordered = [itemLate, itemEarly, itemMiddle];
      const sorted = sortQueueFIFO(unordered);

      expect(sorted[0].id).toBe(itemEarly.id);
      expect(sorted[1].id).toBe(itemMiddle.id);
      expect(sorted[2].id).toBe(itemLate.id);
    });
  });

  describe('4. Retry Management & Conflict Isolation', () => {
    it('should filter only syncable mutations and exclude exhausted retries and conflicts', () => {
      const items: OfflineMutationItem[] = [
        {
          id: 'item-1',
          type: 'spend',
          payload: {},
          original_created_at: customTimestamp,
          transaction_date: customDate,
          timeStr: customTimeStr,
          status: 'pending',
          retryCount: 0,
        },
        {
          id: 'item-2',
          type: 'rotate',
          payload: {},
          original_created_at: customTimestamp,
          transaction_date: customDate,
          timeStr: customTimeStr,
          status: 'failed',
          retryCount: 2, // Eligible (retryCount < 5)
        },
        {
          id: 'item-3',
          type: 'bill',
          payload: {},
          original_created_at: customTimestamp,
          transaction_date: customDate,
          timeStr: customTimeStr,
          status: 'failed',
          retryCount: 5, // Exhausted!
        },
        {
          id: 'item-4',
          type: 'settlement',
          payload: {},
          original_created_at: customTimestamp,
          transaction_date: customDate,
          timeStr: customTimeStr,
          status: 'conflict', // Conflict quarantined!
          retryCount: 1,
        },
      ];

      const syncable = filterSyncableMutations(items, 5);
      expect(syncable.map((i) => i.id)).toEqual(['item-1', 'item-2']);
    });

    it('should mark conflict when error involves credit limit or foreign key violation', () => {
      const item = createOfflineMutationItem({
        type: 'rotate',
        payload: { numAmount: 50000 },
      });

      const failure = recordMutationFailure(item, 'Exceeded card credit limit conflict');
      expect(failure.status).toBe('conflict');
      expect(failure.retryCount).toBe(1);
      expect(failure.conflictDetails).toContain('Exceeded card credit limit');
    });

    it('should mark failed and increment retryCount for temporary network errors', () => {
      const item = createOfflineMutationItem({
        type: 'spend',
        payload: { numAmount: 1000 },
      });

      const failure = recordMutationFailure(item, 'Network request timed out');
      expect(failure.status).toBe('failed');
      expect(failure.retryCount).toBe(1);
      expect(failure.lastError).toBe('Network request timed out');
    });
  });
});
