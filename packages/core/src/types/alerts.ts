export interface MetaComponentParameter {
  type: 'text';
  parameter_name: string;
  text: string;
}

export interface MetaComponent {
  type: 'header' | 'body';
  parameters: MetaComponentParameter[];
}

export interface PushAlertPayload {
  title: string;
  body: string;
  inAppTitle?: string;
  inAppBody?: string;
  url?: string;
  type?: 'bill_entry' | 'lent_issue' | 'lent_recovery' | 'rotation_withdraw' | 'qr_cooling' | 'general' | string;
  userIds?: string[];
  data?: Record<string, any>;
}

export interface BillAlertParams {
  cardName: string;
  last4: string;
  entryUserName: string;
  amount: number;
  timeStr: string;
  billStatus: 'paid' | 'partially_paid' | string;
  dueDate?: string;
  remainingDue?: number;
  availableLimit?: string | number;
}

export interface RotationAlertParams {
  cardName: string;
  last4: string;
  entryUserName: string;
  amount: number;
  timeStr: string;
  provider?: string;
  mode?: string;
  currentBalance?: string | number;
}

export interface LentAlertParams {
  borrowerName: string;
  entryUserName: string;
  amount: number;
  timeStr: string;
  sourceName?: string;
  dueDate?: string;
  remarks?: string;
  remainingBalance?: string | number;
  totalDueLent?: string | number;
  fullOrPartial?: string;
  fullAmount?: string | number;
  receivedOn?: string;
}

export interface SettlementAlertParams {
  cardName: string;
  last4: string;
  qrName: string;
  entryUserName: string;
  receiverName: string;
  amount: number;
  timeStr: string;
  totalCash?: string | number;
}
