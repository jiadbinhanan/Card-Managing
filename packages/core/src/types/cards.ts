export interface CardData {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit: number;
  is_primary: boolean;
  bill_gen_day: number;
  bill_due_day: number;
  parent_card_id?: string | null;
  bank_name?: string | null;
  card_type?: 'credit' | 'debit' | 'prepaid';
  holder_name?: string | null;
  network?: string | null;
  [key: string]: any;
}

export interface CardLimitSummary {
  totalLimit: number;
  availableLimit: number;
  utilizedLimit: number;
  availablePercentage: number;
  utilizationPercentage: number;
  inTransitAmount: number;
}

export interface CardLimitStat {
  id: string;
  name: string;
  last4: string;
  hasSubCards: boolean;
  subCardsCount: number;
  subCardsLast4: string[];
  totalLimit: number;
  usedLimit: number;
  availableLimit: number;
  utilizationRatio: number;
}
