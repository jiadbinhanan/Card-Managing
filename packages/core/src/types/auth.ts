export interface UserProfile {
  id: string;
  name: string;
  phone?: string | null;
  avatar_url?: string | null;
}

export interface AccessibleCard {
  id: string;
  card_name: string;
  last_4_digits: string;
  total_limit: number;
  is_primary: boolean;
  parent_card_id?: string | null;
  bill_gen_day?: number;
  bill_due_day?: number;
  holder_name?: string | null;
  network?: string | null;
  [key: string]: any;
}

export interface CardAccess {
  card_id: string;
  user_id: string;
  role: string;
}

export interface UserStat {
  id: string;
  name: string;
  cash: number;
  due: number;
  pocket?: number;
  avatar_url?: string | null;
  cardBreakdown?: Array<{ cardId: string; cardName: string; cardLast4: string; balance: number }>;
}
