export type LentEntryType = 'given' | 'collected';
export type LentSourceType = 'cash_on_hand' | 'credit_card' | 'pocket';
export type LentLedgerSource = 'card' | 'pocket';
export type LentMode = 'card' | 'pocket' | 'combined';

export interface Borrower {
  id: string;
  name: string;
  phone?: string | null;
  created_by?: string;
  created_at?: string;
}

export interface LentLedgerRecord {
  id: string;
  borrower_id: string;
  entry_type: LentEntryType;
  amount: number;
  transaction_date: string; // YYYY-MM-DD
  source_type?: LentSourceType | null;
  card_id?: string | null;
  remarks?: string | null;
  recorded_by?: string | null;
  created_at: string;
  updated_at?: string;
  linked_cash_ledger_id?: string | null;
  linked_card_transaction_id?: string | null;
  linked_spend_id?: string | null;
  linked_billing_cycle_id?: string | null;
  billing_cycle_delta_amount?: number | null;
  ledgerSource?: LentLedgerSource;
  [key: string]: any;
}

export interface BorrowerSummary extends Borrower {
  netDue: number;
  totalGiven: number;
  totalCollected: number;
  lastActivity: string;
  status: 'owes_user' | 'user_owes' | 'settled';
}

export interface LentRunningBalanceEntry extends LentLedgerRecord {
  balanceAfter: number;
}
