export interface CashSourceBreakdownEntry {
  card_id: string;
  amount: number;
}

export interface CashSourceRow {
  uid: string;
  cardId: string;
  amount: string; // raw input digits
}

export interface CardTransaction {
  id: string;
  type: 'withdrawal' | 'bill_payment';
  amount: number;
  transaction_date: string; // YYYY-MM-DD
  status: 'pending_settlement' | 'partially_settled' | 'settled';
  recorded_by: string; // user uuid
  qr_id?: string | null;
  payment_method?: 'cash_on_hand' | 'own_pocket' | 'credit_card' | 'lent_recovery' | string | null;
  settled_to_user?: string | null;
  card_id?: string | null;
  remarks?: string | null;
  billing_cycle_id?: string | null;
  cash_source_breakdown?: CashSourceBreakdownEntry[] | null;
  settlement_details?: any | null;
  created_at?: string;
  qrs?: { merchant_name: string };
  profiles?: { name: string; avatar_url?: string };
  cards?: { card_name: string; last_4_digits: string };
  settled_to_profile?: { name: string };
  [key: string]: any;
}

export interface Spend {
  id: string;
  user_id: string;
  amount: number; // positive for personal spend, negative for repayment
  spend_type: 'personal' | 'repayment' | string;
  payment_method: 'credit_card' | 'cash_on_hand' | 'from_card_limit' | 'lent_recovery' | string;
  remarks: string | null;
  spend_date: string; // YYYY-MM-DD
  card_id?: string | null;
  linked_card_transaction_id?: string | null;
  cash_source_breakdown?: CashSourceBreakdownEntry[] | null;
  created_at?: string;
  profiles?: { name: string; avatar_url?: string };
  cards?: { card_name: string; last_4_digits: string };
  [key: string]: any;
}

export interface CashOnHandRow {
  id: string;
  user_id: string;
  card_id: string;
  current_balance: number;
  userName?: string;
  cardName?: string;
  [key: string]: any;
}

export interface CashOnHandLedgerRow {
  id: string;
  card_id: string;
  user_id: string;
  amount: number;
  transaction_type: 'credit' | 'debit';
  remarks: string | null;
  transaction_date: string; // ISO or YYYY-MM-DD
  linked_card_transaction_id?: string | null;
  created_at?: string;
  [key: string]: any;
}

export interface PocketAdvanceRow {
  id: string;
  user_id: string;
  card_id: string;
  current_balance: number; // negative represents deficit, 0 is settled
  updated_at?: string;
  [key: string]: any;
}

export interface PocketAdvanceLedgerRow {
  id: string;
  user_id: string;
  card_id: string;
  amount: number; // negative for advance, positive for recovery
  entry_type: 'advance' | 'recovery' | string;
  remarks: string | null;
  transaction_date: string;
  linked_card_transaction_id?: string | null;
  cash_source_breakdown?: CashSourceBreakdownEntry[] | null;
  created_at?: string;
  cards?: { card_name: string; last_4_digits: string };
  [key: string]: any;
}

export interface RecentTx {
  id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
  isCredit: boolean;
  recordedByName?: string;
  recordedByAvatar?: string | null;
  cardName?: string;
  cardLast4?: string;
}
