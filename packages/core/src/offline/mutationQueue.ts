export type OfflineMutationType =
  | 'rotate'
  | 'spend'
  | 'bill'
  | 'lent_give'
  | 'lent_collect'
  | 'settlement'
  | 'transfer';

export type OfflineMutationStatus = 'pending' | 'syncing' | 'failed' | 'conflict';

export interface OfflineMutationItem<T = any> {
  id: string; // Unique idempotency ID, e.g. client_tx_1730817300000_abc
  type: OfflineMutationType;
  payload: T;
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

/**
 * Creates an offline mutation item with guaranteed preservation of original submission timestamp.
 */
export function createOfflineMutationItem<T = any>(params: {
  type: OfflineMutationType;
  payload: T;
  originalCreatedAt?: string;
  transactionDate?: string;
  timeStr?: string;
  id?: string;
}): OfflineMutationItem<T> {
  const now = new Date();
  const original_created_at = params.originalCreatedAt || now.toISOString();
  const transaction_date = params.transactionDate || original_created_at.slice(0, 10);
  const timeStr =
    params.timeStr ||
    now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const id =
    params.id ||
    `client_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  return {
    id,
    type: params.type,
    payload: params.payload,
    original_created_at,
    transaction_date,
    timeStr,
    status: 'pending',
    retryCount: 0,
  };
}

/**
 * Serializes the offline mutation queue to JSON string for disk persistence (MMKV / localStorage).
 */
export function serializeOfflineQueue(queue: OfflineMutationItem[]): string {
  return JSON.stringify(queue);
}

/**
 * Deserializes JSON string from disk back to typed offline mutation queue.
 */
export function deserializeOfflineQueue(rawJson: string | null | undefined): OfflineMutationItem[] {
  if (!rawJson || !rawJson.trim()) return [];
  try {
    const parsed = JSON.parse(rawJson);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

/**
 * Orders queue items strictly in FIFO order by original_created_at to prevent execution race conditions.
 */
export function sortQueueFIFO(queue: OfflineMutationItem[]): OfflineMutationItem[] {
  return [...queue].sort((a, b) =>
    a.original_created_at.localeCompare(b.original_created_at)
  );
}

/**
 * Filters items that are eligible for synchronization (pending or failed with < maxRetries).
 */
export function filterSyncableMutations(
  queue: OfflineMutationItem[],
  maxRetries: number = 5
): OfflineMutationItem[] {
  return queue.filter(
    (item) => item.status === 'pending' || (item.status === 'failed' && item.retryCount < maxRetries)
  );
}

/**
 * Updates a mutation item after a sync failure, marking as conflict or incrementing retry count.
 */
export function recordMutationFailure(
  item: OfflineMutationItem,
  errorMessage: string
): OfflineMutationItem {
  const isConflict =
    errorMessage.toLowerCase().includes('conflict') ||
    errorMessage.toLowerCase().includes('limit') ||
    errorMessage.toLowerCase().includes('foreign key');

  return {
    ...item,
    status: isConflict ? 'conflict' : 'failed',
    retryCount: item.retryCount + 1,
    lastError: errorMessage,
    conflictDetails: isConflict ? errorMessage : undefined,
  };
}
