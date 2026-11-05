import { Borrower, LentLedgerRecord, BorrowerSummary, LentRunningBalanceEntry } from '../types';

/**
 * Calculates net due, total given, total collected, status, and last activity for a single borrower.
 * Supports bidirectional lending (netDue > 0: borrower owes user, netDue < 0: user owes borrower).
 */
export function calculateBorrowerSummary(
  borrower: Borrower,
  records: LentLedgerRecord[]
): BorrowerSummary {
  const bRecords = records.filter((r) => r.borrower_id === borrower.id);
  const totalGiven = bRecords
    .filter((r) => r.entry_type === 'given')
    .reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalCollected = bRecords
    .filter((r) => r.entry_type === 'collected')
    .reduce((s, r) => s + Number(r.amount || 0), 0);
  const netDue = totalGiven - totalCollected;

  const lastActivity = bRecords.reduce(
    (latest, r) => (r.updated_at && r.updated_at > latest ? r.updated_at : latest),
    borrower.created_at || ''
  );

  let status: 'owes_user' | 'user_owes' | 'settled' = 'settled';
  if (netDue > 0) status = 'owes_user';
  else if (netDue < 0) status = 'user_owes';

  return {
    ...borrower,
    netDue,
    totalGiven,
    totalCollected,
    lastActivity,
    status,
  };
}

/**
 * Computes summaries for a list of borrowers, sorted descending by lastActivity.
 */
export function computeBorrowerSummaries(
  borrowers: Borrower[],
  records: LentLedgerRecord[]
): BorrowerSummary[] {
  const summaries = borrowers.map((b) => calculateBorrowerSummary(b, records));
  return summaries.sort((a, b) => (b.lastActivity || '').localeCompare(a.lastActivity || ''));
}

/**
 * Calculates running balance chronologically (ascending by transaction_date, then created_at)
 * and returns entries with balanceAfter computed.
 */
export function calculateChronologicalRunningBalances(
  records: LentLedgerRecord[]
): LentRunningBalanceEntry[] {
  const chronological = [...records].sort((a, b) => {
    const d = (a.transaction_date || '').localeCompare(b.transaction_date || '');
    if (d !== 0) return d;
    return (a.created_at || '').localeCompare(b.created_at || '');
  });

  let running = 0;
  return chronological.map((e) => {
    running += e.entry_type === 'given' ? Number(e.amount || 0) : -Number(e.amount || 0);
    return { ...e, balanceAfter: running };
  });
}

/**
 * Calculates total receivable across all borrowers (ignoring negative dues where user owes).
 */
export function calculateTotalReceivable(summaries: BorrowerSummary[]): number {
  return summaries.reduce((acc, b) => acc + Math.max(0, b.netDue), 0);
}

/**
 * Recomputes billing cycle paydown status transition upon lent recovery.
 */
export function calculateBillPaydown(
  generatedAmount: number,
  currentPaidAmount: number,
  recoveryAmount: number
): { newPaidAmount: number; status: 'paid' | 'partially_paid' | 'unpaid' } {
  const newPaidAmount = currentPaidAmount + recoveryAmount;
  let status: 'paid' | 'partially_paid' | 'unpaid' = 'unpaid';
  if (newPaidAmount >= generatedAmount) {
    status = 'paid';
  } else if (newPaidAmount > 0) {
    status = 'partially_paid';
  }
  return { newPaidAmount, status };
}
