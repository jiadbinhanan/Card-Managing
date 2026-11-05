export interface SettlementHistoryEntry {
  settle_id: string;
  amount: number;
  settled_date: string; // YYYY-MM-DD
  settled_to_user: string;
  card_id: string;
  remarks?: string;
}

export interface SettlementDetails {
  total_settled: number;
  total_due: number;
  history: SettlementHistoryEntry[];
}

export interface SettlementTransitionResult {
  newStatus: 'settled' | 'partially_settled';
  amtToSettle: number;
  newSettled: number;
  newDue: number;
  updatedDetails: SettlementDetails;
  ledgerEntry: {
    user_id: string;
    card_id: string;
    amount: number;
    transaction_type: 'credit';
    remarks: string;
    transaction_date: string;
    linked_card_transaction_id: string;
  };
}
