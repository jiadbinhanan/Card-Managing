import { appStorage } from './storage';
import { supabase } from './supabase';
import {
  processBillPaymentFIFO,
  deductCashFromSources,
  executeSettlementTransaction,
  recordLentCollectedCreditCardPaydown,
} from '@credics/core';
import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';

export type OfflineMutationType =
  | 'rotate'
  | 'spend'
  | 'bill'
  | 'lent_give'
  | 'lent_collect'
  | 'settlement';

export type OfflineMutationStatus = 'pending' | 'syncing' | 'failed' | 'conflict';

export interface OfflineMutationItem {
  id: string; // Unique idempotency ID, e.g. client_tx_1730817300000_abc
  type: OfflineMutationType;
  payload: any;
  /**
   * EXACT time when the user submitted the entry on device.
   * This timestamp is strictly preserved and written to Supabase (never replaced by sync time).
   */
  original_created_at: string; // ISO 8601 string
  transaction_date: string; // YYYY-MM-DD
  timeStr: string; // e.g. "08:05 pm"
  status: OfflineMutationStatus;
  retryCount: number;
  lastError?: string;
  conflictDetails?: string;
}

const STORAGE_QUEUE_KEY = 'CREDICS_OFFLINE_MUTATION_QUEUE';

// In-memory queue state backed by persistent storage
function loadQueueFromDisk(): OfflineMutationItem[] {
  try {
    const raw = appStorage.getString(STORAGE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueueToDisk(queue: OfflineMutationItem[]) {
  try {
    appStorage.set(STORAGE_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error('Failed to save offline mutation queue to disk:', err);
  }
}

interface OfflineQueueStore {
  queue: OfflineMutationItem[];
  isSyncing: boolean;
  enqueueMutation: (item: Omit<OfflineMutationItem, 'id' | 'status' | 'retryCount'>) => string;
  removeMutation: (id: string) => void;
  syncQueue: () => Promise<void>;
  clearResolved: () => void;
}

export const useOfflineQueueStore = create<OfflineQueueStore>((set, get) => ({
  queue: loadQueueFromDisk(),
  isSyncing: false,

  enqueueMutation: (item) => {
    const id = `client_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullItem: OfflineMutationItem = {
      ...item,
      id,
      status: 'pending',
      retryCount: 0,
    };

    const newQueue = [...get().queue, fullItem];
    saveQueueToDisk(newQueue);
    set({ queue: newQueue });

    // Attempt background sync if online
    get().syncQueue();
    return id;
  },

  removeMutation: (id) => {
    const newQueue = get().queue.filter((q) => q.id !== id);
    saveQueueToDisk(newQueue);
    set({ queue: newQueue });
  },

  clearResolved: () => {
    const newQueue = get().queue.filter((q) => q.status !== 'pending' && q.status !== 'syncing');
    saveQueueToDisk(newQueue);
    set({ queue: newQueue });
  },

  syncQueue: async () => {
    if (get().isSyncing) return;

    // Check online status before processing
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return;

    const pendingItems = get().queue.filter((i) => i.status === 'pending' || (i.status === 'failed' && i.retryCount < 5));
    if (pendingItems.length === 0) return;

    set({ isSyncing: true });

    try {
      for (const item of pendingItems) {
        // Mark syncing
        set((state) => ({
          queue: state.queue.map((q) => (q.id === item.id ? { ...q, status: 'syncing' } : q)),
        }));

        try {
          await executeSingleMutation(item);

          // Success: remove from queue
          const updated = get().queue.filter((q) => q.id !== item.id);
          saveQueueToDisk(updated);
          set({ queue: updated });
        } catch (err: any) {
          console.error(`Offline sync failed for item ${item.id}:`, err);
          const isConflict = (err.message || '').toLowerCase().includes('conflict') || (err.message || '').toLowerCase().includes('limit');

          const updated = get().queue.map((q) =>
            q.id === item.id
              ? {
                  ...q,
                  status: isConflict ? ('conflict' as const) : ('failed' as const),
                  retryCount: q.retryCount + 1,
                  lastError: err.message,
                  conflictDetails: isConflict ? err.message : undefined,
                }
              : q
          );
          saveQueueToDisk(updated);
          set({ queue: updated });
        }
      }
    } finally {
      set({ isSyncing: false });
    }
  },
}));

/**
 * Executes a single queued mutation using its ORIGINAL entry timestamp.
 */
async function executeSingleMutation(item: OfflineMutationItem) {
  const { type, payload, original_created_at, transaction_date } = item;

  switch (type) {
    case 'rotate': {
      // 1. Pre-flight check: verify card limit conflict
      const { activeCardId, numAmount, selectedQrId, remarks, actingUserId } = payload;

      const { data: cardRow } = await supabase.from('cards').select('*').eq('id', activeCardId).single();
      if (!cardRow) throw new Error('Card not found during sync');

      // 2. Insert with EXACT ORIGINAL creation timestamp
      const { error } = await supabase.from('card_transactions').insert({
        card_id: activeCardId,
        type: 'withdrawal',
        amount: numAmount,
        qr_id: selectedQrId || null,
        remarks: remarks || 'Rotation Withdrawal',
        status: 'pending_settlement',
        transaction_date,
        created_at: original_created_at, // Preserves exact original user entry time!
        recorded_by: actingUserId || null,
      });

      if (error) throw error;

      if (selectedQrId) {
        await supabase.from('qrs').update({ last_used_date: original_created_at }).eq('id', selectedQrId);
      }
      break;
    }

    case 'spend': {
      const { actingUserId, numAmount, spendMethod, remarks, activeCardId, breakdownForInsert, validCashSources } =
        payload;

      // 1. Insert into spends preserving original timestamp
      const { error: spendErr } = await supabase.from('spends').insert({
        user_id: actingUserId,
        amount: numAmount,
        spend_type: 'personal',
        payment_method: spendMethod,
        remarks: remarks || 'Personal Spend',
        spend_date: transaction_date,
        created_at: original_created_at, // Preserves exact original user entry time!
        card_id: activeCardId || null,
        cash_source_breakdown: breakdownForInsert,
      });

      if (spendErr) throw spendErr;

      // 2. Deduct multi-source cash if cash_on_hand
      if (spendMethod === 'cash_on_hand' && validCashSources && validCashSources.length > 0) {
        await deductCashFromSources(supabase, {
          userId: actingUserId,
          sources: validCashSources,
          note: `Personal spend ${remarks ? '- ' + remarks : ''}`,
          txDate: transaction_date,
          createdAt: original_created_at,
        });
      }
      break;
    }

    case 'bill': {
      const {
        activeCardId,
        numAmount,
        billMethod,
        remarks,
        actingUserId,
        isDebtRepayment,
        breakdownForInsert,
        validCashSources,
      } = payload;

      // 1. FIFO bill payment state machine
      const billResult = await processBillPaymentFIFO(supabase, activeCardId, numAmount);
      const activeCycleId = billResult.cycleId;

      // 2. Insert into card_transactions preserving original timestamp
      const { data: billTx, error: txErr } = await supabase
        .from('card_transactions')
        .insert({
          card_id: activeCardId,
          amount: numAmount,
          type: 'bill_payment',
          status: 'settled',
          transaction_date,
          created_at: original_created_at, // Preserves exact original user entry time!
          recorded_by: actingUserId,
          payment_method: billMethod,
          remarks: remarks || 'Card Bill Payment',
          billing_cycle_id: activeCycleId,
          cash_source_breakdown: billMethod === 'cash_on_hand' ? breakdownForInsert : null,
        })
        .select('id')
        .single();

      if (txErr) throw txErr;

      // 3. Fund source adjustment
      if (billMethod === 'cash_on_hand' && validCashSources && validCashSources.length > 0) {
        await deductCashFromSources(supabase, {
          userId: actingUserId,
          sources: validCashSources,
          note: `Bill payment ${remarks ? '- ' + remarks : ''}`,
          linkedCardTxId: billTx?.id || null,
          txDate: transaction_date,
          createdAt: original_created_at,
        });
      } else if (billMethod === 'own_pocket') {
        await supabase.from('pocket_advances_ledger').insert({
          user_id: actingUserId,
          card_id: activeCardId,
          amount: -numAmount,
          entry_type: 'advance',
          transaction_date,
          created_at: original_created_at,
          linked_card_transaction_id: billTx?.id || null,
          remarks: `Card bill payment advanced from pocket ${remarks ? '- ' + remarks : ''}`,
        });

        const { data: curAdv } = await supabase
          .from('pocket_advances')
          .select('current_balance')
          .eq('user_id', actingUserId)
          .eq('card_id', activeCardId)
          .maybeSingle();

        const nextAdv = (Number(curAdv?.current_balance) || 0) - numAmount;
        await supabase
          .from('pocket_advances')
          .upsert({ user_id: actingUserId, card_id: activeCardId, current_balance: nextAdv });
      }

      if (isDebtRepayment) {
        await supabase.from('spends').insert({
          user_id: actingUserId,
          amount: -numAmount,
          spend_type: 'repayment',
          payment_method: billMethod,
          remarks: 'Debt Cleared' + (remarks ? `: ${remarks}` : ''),
          spend_date: transaction_date,
          created_at: original_created_at,
          card_id: activeCardId,
          linked_card_transaction_id: billTx?.id || null,
        });
      }
      break;
    }

    case 'settlement': {
      const { transactionId, settleTargetCardId, cashReceiverId, settlementResult, todayDateStr } = payload;
      await executeSettlementTransaction(supabase, {
        transactionId,
        settleTargetCardId,
        cashReceiverId,
        settlementResult,
        todayDateStr,
      });
      break;
    }

    case 'lent_give': {
      const { borrowerId, amount, sourceType, cardId, remarks, userId } = payload;
      const isPocket = sourceType === 'pocket';
      const tableName = isPocket ? 'pocket_lent_ledger' : 'card_lent_ledger';

      let linkedCashLedgerId: string | null = null;
      let linkedCardTransactionId: string | null = null;

      if (!isPocket && cardId) {
        if (sourceType === 'cash_on_hand') {
          const { data: cohRow } = await supabase
            .from('cash_on_hand_ledger')
            .insert({
              user_id: userId,
              card_id: cardId,
              amount,
              transaction_type: 'debit',
              remarks: `Lent given ${remarks ? '- ' + remarks : ''}`,
              transaction_date,
              created_at: original_created_at,
            })
            .select('id')
            .single();
          linkedCashLedgerId = cohRow?.id || null;
        } else if (sourceType === 'credit_card') {
          const { data: txRow } = await supabase
            .from('card_transactions')
            .insert({
              card_id: cardId,
              amount,
              type: 'withdrawal',
              status: 'pending_settlement',
              transaction_date,
              created_at: original_created_at,
              recorded_by: userId,
              remarks: `Lent given ${remarks ? '- ' + remarks : ''}`,
            })
            .select('id')
            .single();
          linkedCardTransactionId = txRow?.id || null;
        }
      }

      const { error } = await supabase.from(tableName).insert({
        borrower_id: borrowerId,
        entry_type: 'given',
        amount,
        transaction_date,
        created_at: original_created_at,
        ...(!isPocket
          ? {
              source_type: sourceType,
              card_id: cardId || null,
              linked_cash_ledger_id: linkedCashLedgerId,
              linked_card_transaction_id: linkedCardTransactionId,
            }
          : {}),
        remarks: remarks || null,
        recorded_by: userId,
      });
      if (error) throw error;
      break;
    }

    case 'lent_collect': {
      const { borrowerId, borrowerName, cardId, amount, userId, sourceType, remarks } = payload;
      const isPocket = sourceType === 'pocket';
      const tableName = isPocket ? 'pocket_lent_ledger' : 'card_lent_ledger';

      if (sourceType === 'credit_card' && cardId) {
        await recordLentCollectedCreditCardPaydown(supabase, {
          borrowerId,
          borrowerName: borrowerName || 'Borrower',
          cardId,
          amount,
          txDate: transaction_date,
          userId,
          createdAt: original_created_at,
        });
      } else {
        let linkedCashLedgerId: string | null = null;
        if (!isPocket && cardId && sourceType === 'cash_on_hand') {
          const { data: cohRow } = await supabase
            .from('cash_on_hand_ledger')
            .insert({
              user_id: userId,
              card_id: cardId,
              amount,
              transaction_type: 'credit',
              remarks: `Collected lent from ${borrowerName || 'Borrower'}`,
              transaction_date,
              created_at: original_created_at,
            })
            .select('id')
            .single();
          linkedCashLedgerId = cohRow?.id || null;
        }

        const { error } = await supabase.from(tableName).insert({
          borrower_id: borrowerId,
          entry_type: 'collected',
          amount,
          transaction_date,
          created_at: original_created_at,
          ...(!isPocket
            ? {
                source_type: sourceType || 'cash_on_hand',
                card_id: cardId || null,
                linked_cash_ledger_id: linkedCashLedgerId,
              }
            : {}),
          remarks: remarks || null,
          recorded_by: userId,
        });
        if (error) throw error;
      }
      break;
    }
  }
}

// Global auto-sync on network reconnection
NetInfo.addEventListener((state) => {
  if (state.isConnected) {
    useOfflineQueueStore.getState().syncQueue();
  }
});
