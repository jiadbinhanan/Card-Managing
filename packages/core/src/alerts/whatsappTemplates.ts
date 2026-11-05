import { MetaComponent } from '../types';
import { sanitizeMetaString, buildMetaComponents } from './sanitizers';

// 1. Bill Entry Alert
export function buildBillEntryAlert(params: {
  greetingUser: string;
  cardName: string;
  last4: string;
  billMonth: string;
  timeStr: string;
  billAmount: number;
  dueDate: string;
}): { templateName: string; components: MetaComponent[] } {
  const cardSafe = sanitizeMetaString(params.cardName);
  const components = buildMetaComponents(
    { name: 'card_name', value: cardSafe },
    {
      greeting_user: sanitizeMetaString(params.greetingUser),
      bill_month: sanitizeMetaString(params.billMonth),
      card_name: cardSafe,
      last_4: sanitizeMetaString(params.last4),
      time: sanitizeMetaString(params.timeStr),
      bill_amount: String(params.billAmount),
      due_date: sanitizeMetaString(params.dueDate),
    }
  );
  return { templateName: 'bill_entry_alert', components };
}

// 2. Partial Bill Pay Alert
export function buildPartialBillPayAlert(params: {
  greetingUser: string;
  cardName: string;
  last4: string;
  entryUserName: string;
  timeStr: string;
  paidAmount: number;
  dueDate: string;
  remainingDue: number;
}): { templateName: string; components: MetaComponent[] } {
  const cardSafe = sanitizeMetaString(params.cardName);
  const components = buildMetaComponents(
    { name: 'card_name', value: cardSafe },
    {
      greeting_user: sanitizeMetaString(params.greetingUser),
      card_name: cardSafe,
      last_4: sanitizeMetaString(params.last4),
      entry_user: sanitizeMetaString(params.entryUserName),
      time: sanitizeMetaString(params.timeStr),
      paid_amount: String(params.paidAmount),
      due_date: sanitizeMetaString(params.dueDate),
      remaining_due: String(params.remainingDue),
    }
  );
  return { templateName: 'partial_bill_pay_alert', components };
}

// 3. Full Bill Pay Complete
export function buildFullBillPayAlert(params: {
  greetingUser: string;
  cardName: string;
  last4: string;
  entryUserName: string;
  timeStr: string;
  availableLimit: string | number;
}): { templateName: string; components: MetaComponent[] } {
  const cardSafe = sanitizeMetaString(params.cardName);
  const components = buildMetaComponents(
    { name: 'card_name', value: cardSafe },
    {
      greeting_user: sanitizeMetaString(params.greetingUser),
      card_name: cardSafe,
      last_4: sanitizeMetaString(params.last4),
      entry_user: sanitizeMetaString(params.entryUserName),
      time: sanitizeMetaString(params.timeStr),
      available_limit: sanitizeMetaString(params.availableLimit),
    }
  );
  return { templateName: 'full_billpay_complete', components };
}

// 4. Credit Transaction Alert
export function buildCreditTransactionAlert(params: {
  greetingUser: string;
  cardName: string;
  last4: string;
  entryUserName: string;
  timeStr: string;
  amount: number;
  remarks: string;
  currentBalance?: string | number;
}): { templateName: string; components: MetaComponent[] } {
  const cardSafe = sanitizeMetaString(params.cardName);
  const components = buildMetaComponents(
    { name: 'card_name', value: cardSafe },
    {
      greeting_user: sanitizeMetaString(params.greetingUser),
      card_name: cardSafe,
      last_4: sanitizeMetaString(params.last4),
      entry_user: sanitizeMetaString(params.entryUserName),
      time: sanitizeMetaString(params.timeStr),
      amount: String(params.amount),
      remarks: sanitizeMetaString(params.remarks),
      current_balance: sanitizeMetaString(params.currentBalance || '0'),
    }
  );
  return { templateName: 'credit_transaction_alert', components };
}

// 5. Rotation Withdraw Alert
export function buildRotationWithdrawAlert(params: {
  greetingUser: string;
  cardName: string;
  last4: string;
  mode?: string;
  provider?: string;
  entryUserName: string;
  timeStr: string;
  amount: number;
  currentBalance?: string | number;
}): { templateName: string; components: MetaComponent[] } {
  const components = buildMetaComponents(null, {
    greeting_user: sanitizeMetaString(params.greetingUser),
    card_name: sanitizeMetaString(params.cardName),
    last_4: sanitizeMetaString(params.last4),
    mode: sanitizeMetaString(params.mode || 'Rotation'),
    provider: sanitizeMetaString(params.provider || 'Credics'),
    entry_user: sanitizeMetaString(params.entryUserName),
    time: sanitizeMetaString(params.timeStr),
    amount: String(params.amount),
    current_balance: sanitizeMetaString(params.currentBalance || '0'),
  });
  return { templateName: 'rotation_withdraw_alert', components };
}

// 6. QR Cooling Period Alert
export function buildQrCoolingAlert(params: {
  greetingUser: string;
  coolingUser: string;
  cardNameWithLast4: string;
  qrName: string;
  timeStr: string;
}): { templateName: string; components: MetaComponent[] } {
  const components = buildMetaComponents(
    { name: 'cooling_user', value: sanitizeMetaString(params.coolingUser) },
    {
      greeting_user: sanitizeMetaString(params.greetingUser),
      cooling_user: sanitizeMetaString(params.coolingUser),
      card_name_with_last4: sanitizeMetaString(params.cardNameWithLast4),
      qr_name: sanitizeMetaString(params.qrName),
      time: sanitizeMetaString(params.timeStr),
    }
  );
  return { templateName: 'qr_cooling_period_alert', components };
}

// 7. Personal Spend Alert
export function buildPersonalSpendAlert(params: {
  greetingUser: string;
  entryUserName: string;
  timeStr: string;
  amount: number;
  sourceName: string;
  remarks: string;
  remainingBalance?: string | number;
  totalSpend?: string | number;
}): { templateName: string; components: MetaComponent[] } {
  const entryUserSafe = sanitizeMetaString(params.entryUserName);
  const components = buildMetaComponents(
    { name: 'entry_user', value: entryUserSafe },
    {
      greeting_user: sanitizeMetaString(params.greetingUser),
      entry_user: entryUserSafe,
      time: sanitizeMetaString(params.timeStr),
      amount: String(params.amount),
      source_name: sanitizeMetaString(params.sourceName),
      remarks: sanitizeMetaString(params.remarks),
      remaining_balance: sanitizeMetaString(params.remainingBalance || '0'),
      entry_user_duplicate: entryUserSafe,
      total_spend: sanitizeMetaString(params.totalSpend || '0'),
    }
  );
  return { templateName: 'personal_spend_alert', components };
}

// 8. Lent Issue Alert
export function buildLentIssueAlert(params: {
  greetingUser: string;
  borrowerName: string;
  sourceName: string;
  entryUserName: string;
  timeStr: string;
  amount: number;
  dueDate?: string;
  remarks: string;
  remainingBalance?: string | number;
  totalDueLent?: string | number;
}): { templateName: string; components: MetaComponent[] } {
  const borrowerSafe = sanitizeMetaString(params.borrowerName);
  const components = buildMetaComponents(
    { name: 'borrower_name', value: borrowerSafe },
    {
      greeting_user: sanitizeMetaString(params.greetingUser),
      borrower_name: borrowerSafe,
      source_name: sanitizeMetaString(params.sourceName),
      entry_user: sanitizeMetaString(params.entryUserName),
      time: sanitizeMetaString(params.timeStr),
      amount: String(params.amount),
      due_date: sanitizeMetaString(params.dueDate || '-'),
      remarks: sanitizeMetaString(params.remarks),
      remaining_balance: sanitizeMetaString(params.remainingBalance || '0'),
      total_due_lent: sanitizeMetaString(params.totalDueLent || '0'),
    }
  );
  return { templateName: 'lent_issue_alert', components };
}

// 9. Lent Recovery Alert (Note spelling full_ammount per registered Meta template)
export function buildLentRecoveryAlert(params: {
  greetingUser: string;
  borrowerName: string;
  fullOrPartial: string;
  entryUserName: string;
  timeStr: string;
  amount: number;
  fullAmount: string | number;
  remarks: string;
  receivedOn: string;
  currentBal?: string | number;
  remainingDue?: string | number;
}): { templateName: string; components: MetaComponent[] } {
  const borrowerSafe = sanitizeMetaString(params.borrowerName);
  const components = buildMetaComponents(
    { name: 'borrower_name', value: borrowerSafe },
    {
      greeting_user: sanitizeMetaString(params.greetingUser),
      borrower_name: borrowerSafe,
      full_or_partial: sanitizeMetaString(params.fullOrPartial),
      entry_user: sanitizeMetaString(params.entryUserName),
      time: sanitizeMetaString(params.timeStr),
      amount: String(params.amount),
      full_ammount: sanitizeMetaString(params.fullAmount), // Key has double 'm' per Meta template
      remarks: sanitizeMetaString(params.remarks),
      received_on: sanitizeMetaString(params.receivedOn),
      current_bal: sanitizeMetaString(params.currentBal || '0'),
      remaining_due: sanitizeMetaString(params.remainingDue || '0'),
    }
  );
  return { templateName: 'lent_recovery_alert', components };
}

// 10. Rotation Settlement Alert
export function buildRotationSettlementAlert(params: {
  greetingUser: string;
  cardName: string;
  last4: string;
  qrName: string;
  entryUserName: string;
  timeStr: string;
  amount: number;
  receiverName: string;
  totalCash?: string | number;
}): { templateName: string; components: MetaComponent[] } {
  const qrSafe = sanitizeMetaString(params.qrName);
  const components = buildMetaComponents(
    { name: 'qr_name', value: qrSafe },
    {
      greeting_user: sanitizeMetaString(params.greetingUser),
      card_name: sanitizeMetaString(params.cardName),
      last_4: sanitizeMetaString(params.last4),
      qr_name: qrSafe,
      entry_user: sanitizeMetaString(params.entryUserName),
      time: sanitizeMetaString(params.timeStr),
      amount: String(params.amount),
      receiver_name: sanitizeMetaString(params.receiverName),
      total_cash: sanitizeMetaString(params.totalCash || '0'),
    }
  );
  return { templateName: 'rotation_settlement_alert', components };
}
