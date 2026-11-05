export type BillCycleStatus = 'paid' | 'partially_paid' | 'unpaid' | 'overdue';

export interface BillingCycle {
  id: string;
  card_id: string;
  billing_month: string; // YYYY-MM-DD
  generated_amount: number;
  paid_amount: number;
  status: BillCycleStatus;
  bill_gen_day?: number;
  bill_due_day?: number;
  cards?: {
    card_name: string;
    last_4_digits: string;
    bill_gen_day?: number;
    bill_due_day?: number;
  };
  [key: string]: any;
}

export interface BillSchedule {
  genDate: Date;
  dueDate: Date;
  daysRemaining: number;
  dueAmount: number;
  isPaid: boolean;
  statusText: string;
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
