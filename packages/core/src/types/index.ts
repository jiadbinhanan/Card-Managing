export interface UserStat {
  id: string;
  name: string;
  cash: number;
  due: number;
  avatar_url?: string;
}

export interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit: number;
  is_primary: boolean;
  bill_gen_day: number;
  bill_due_day: number;
  parent_card_id?: string;
  bank_name?: string;
  card_type?: 'credit' | 'debit' | 'prepaid';
}

export interface BillingCycle {
  id: string;
  card_id: string;
  billing_month: string;
  generated_amount: number;
  paid_amount: number;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE';
  bill_gen_day?: number;
  bill_due_day?: number;
  remaining_amount?: number;
}

export interface Transaction {
  id: string;
  card_id?: string;
  amount: number;
  type: 'EXPENSE' | 'INCOME' | 'SETTLEMENT' | 'WITHDRAWAL' | 'ROTATION';
  description?: string;
  category?: string;
  created_at: string;
  merchant_name?: string;
  status: 'AUTHORIZED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
}

export interface LentEntry {
  id: string;
  borrower_name: string;
  amount: number;
  lent_date: string;
  due_date?: string;
  paid_amount: number;
  status: 'ACTIVE' | 'SETTLED' | 'OVERDUE';
  notes?: string;
}

export interface UrgentBillAlert {
  cardId: string;
  cardName: string;
  last4: string;
  dueAmount: number;
  dueDate: string;
  daysRemaining: number;
  isEmergency: boolean; // true if daysRemaining <= 1
}
