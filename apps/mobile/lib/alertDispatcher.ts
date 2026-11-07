import { supabase } from './supabase';
import {
  MetaComponent,
  buildBillEntryAlert,
  buildPartialBillPayAlert,
  buildFullBillPayAlert,
  buildCreditTransactionAlert,
  buildRotationWithdrawAlert,
  buildRotationSettlementAlert,
  buildLentIssueAlert,
  buildLentRecoveryAlert,
  buildPersonalSpendAlert,
  buildPushAlertPayload,
} from '@credics/core';

const API_BASE_URL = 'https://credics.vercel.app';

/**
 * Dispatches WhatsApp message via Meta Cloud API backend endpoint
 */
export async function sendWhatsAppAlert(
  phone: string,
  templateName: string,
  variablesOrComponents: Record<string, string> | MetaComponent[]
): Promise<boolean> {
  try {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 10) return false;

    const isComponents = Array.isArray(variablesOrComponents);

    const res = await fetch(`${API_BASE_URL}/api/send-whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: cleanPhone,
        templateName,
        ...(isComponents
          ? { components: variablesOrComponents }
          : { variables: variablesOrComponents }),
      }),
    });

    const result = await res.json();
    return !!result?.success;
  } catch (error) {
    console.error('Error sending WhatsApp alert:', error);
    return false;
  }
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  inAppTitle?: string;
  inAppBody?: string;
  url?: string;
  type?: 'bill_entry' | 'lent_issue' | 'lent_recovery' | 'rotation_withdraw' | 'qr_cooling' | 'general' | string;
  userIds?: string[];
  data?: Record<string, any>;
}

/**
 * Dispatches Push Notification via backend FCM endpoint and logs to Supabase notifications table
 */
export async function sendPushAlert(payload: PushNotificationPayload): Promise<boolean> {
  const normalizedPayload = buildPushAlertPayload(payload);

  try {
    const res = await fetch(`${API_BASE_URL}/api/send-push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizedPayload),
    });

    const result = await res.json();
    if (result?.success) return true;
  } catch {
    // API call error, proceed to direct DB notification fallback
  }

  // Fallback: write directly to notifications table so users see it in NotificationSidePanel
  try {
    await supabase.from('notifications').insert({
      title: normalizedPayload.title,
      body: normalizedPayload.body,
      category: normalizedPayload.type || 'general',
      payload: {
        url: normalizedPayload.url,
        inAppTitle: normalizedPayload.inAppTitle,
        inAppBody: normalizedPayload.inAppBody,
        ...normalizedPayload.data,
      },
      is_read: false,
    });
    return true;
  } catch (dbErr) {
    console.error('Failed to log notification to database:', dbErr);
    return false;
  }
}

/**
 * Broadcasts Bill Entry alert to all family profiles via WhatsApp & Push
 */
export async function broadcastBillEntryAlert(params: {
  cardName: string;
  last4Digits: string;
  billMonth: string; // YYYY-MM
  billAmount: number;
  dueDay: number;
  profiles: Array<{ id?: string; name?: string; phone?: string }>;
}) {
  const billDate = new Date(`${params.billMonth}-01`);
  const billMonthName = billDate.toLocaleString('en-US', { month: 'long' });
  const genTime = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase();

  // 1. WhatsApp Broadcast
  const waPromises = params.profiles.map(async (profile) => {
    if (!profile.phone) return;
    const alert = buildBillEntryAlert({
      greetingUser: profile.name || 'Member',
      cardName: params.cardName,
      last4: params.last4Digits,
      billMonth: billMonthName,
      timeStr: genTime,
      billAmount: params.billAmount,
      dueDate: `${params.dueDay}`,
    });

    await sendWhatsAppAlert(profile.phone, alert.templateName, alert.components);
  });

  await Promise.allSettled(waPromises);

  // 2. Push Notification Dispatch
  await sendPushAlert({
    title: `New Bill Statement: ₹${params.billAmount.toLocaleString('en-IN')}`,
    body: `${params.cardName} (**${params.last4Digits}) statement for ${billMonthName} generated. Due date: ${params.dueDay}.`,
    inAppTitle: `Card Bill Alert (${params.cardName})`,
    inAppBody: `${billMonthName} bill of ₹${params.billAmount.toLocaleString('en-IN')} generated. Due date: ${params.dueDay}.`,
    url: '/(tabs)/index',
    type: 'bill_entry',
    data: {
      cardName: params.cardName,
      billAmount: params.billAmount,
      dueDate: params.dueDay,
      month: billMonthName,
    },
  });
}

/**
 * Dispatches Bill Repayment Alert (Partial or Full)
 */
export async function broadcastBillPayAlert(params: {
  cardName: string;
  last4Digits: string;
  entryUserName: string;
  paidAmount: number;
  dueDate: string;
  remainingDue: number;
  availableLimit?: number | string;
  isFull: boolean;
  profiles: Array<{ id?: string; name?: string; phone?: string }>;
}) {
  const timeStr = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase();

  const waPromises = params.profiles.map(async (profile) => {
    if (!profile.phone) return;

    if (params.isFull) {
      const alert = buildFullBillPayAlert({
        greetingUser: profile.name || 'Member',
        cardName: params.cardName,
        last4: params.last4Digits,
        entryUserName: params.entryUserName,
        timeStr,
        availableLimit: params.availableLimit || 'Restored',
      });
      await sendWhatsAppAlert(profile.phone, alert.templateName, alert.components);
    } else {
      const alert = buildPartialBillPayAlert({
        greetingUser: profile.name || 'Member',
        cardName: params.cardName,
        last4: params.last4Digits,
        entryUserName: params.entryUserName,
        timeStr,
        paidAmount: params.paidAmount,
        dueDate: params.dueDate,
        remainingDue: params.remainingDue,
      });
      await sendWhatsAppAlert(profile.phone, alert.templateName, alert.components);
    }
  });

  await Promise.allSettled(waPromises);

  // Push notification
  await sendPushAlert({
    title: params.isFull
      ? `Bill Paid in Full: ₹${params.paidAmount.toLocaleString('en-IN')}`
      : `Partial Bill Payment: ₹${params.paidAmount.toLocaleString('en-IN')}`,
    body: params.isFull
      ? `${params.cardName} (**${params.last4Digits}) is fully paid by ${params.entryUserName}.`
      : `${params.cardName} (**${params.last4Digits}) paid ₹${params.paidAmount.toLocaleString('en-IN')} by ${params.entryUserName}. Remaining: ₹${params.remainingDue.toLocaleString('en-IN')}.`,
    type: 'bill_payment',
    url: '/(tabs)/transactions',
    data: {
      cardName: params.cardName,
      paidAmount: params.paidAmount,
      remainingDue: params.remainingDue,
    },
  });
}

/**
 * Broadcasts Lent Issue (Give Loan) alert to family profiles via WhatsApp & Push
 */
export async function broadcastLentIssueAlert(params: {
  borrowerName: string;
  sourceName: string;
  entryUserName: string;
  amount: number;
  remarks?: string;
  dueDate?: string;
  remainingBalance?: string | number;
  totalDueLent?: string | number;
  profiles: Array<{ id?: string; name?: string; phone?: string }>;
}) {
  const timeStr = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase();

  const waPromises = params.profiles.map(async (profile) => {
    if (!profile.phone) return;
    const alert = buildLentIssueAlert({
      greetingUser: profile.name || 'Member',
      borrowerName: params.borrowerName,
      sourceName: params.sourceName,
      entryUserName: params.entryUserName,
      timeStr,
      amount: params.amount,
      dueDate: params.dueDate || '-',
      remarks: params.remarks || 'Loan issued',
      remainingBalance: params.remainingBalance,
      totalDueLent: params.totalDueLent,
    });

    await sendWhatsAppAlert(profile.phone, alert.templateName, alert.components);
  });

  await Promise.allSettled(waPromises);

  // Push Notification Dispatch
  await sendPushAlert({
    title: `Loan Issued: ₹${params.amount.toLocaleString('en-IN')}`,
    body: `₹${params.amount.toLocaleString('en-IN')} lent to ${params.borrowerName} by ${params.entryUserName} from ${params.sourceName}.`,
    inAppTitle: `Loan Given (${params.borrowerName})`,
    inAppBody: `₹${params.amount.toLocaleString('en-IN')} issued by ${params.entryUserName} via ${params.sourceName}.`,
    type: 'lent_issue',
    url: '/(tabs)/lents',
    data: {
      borrowerName: params.borrowerName,
      amount: params.amount,
      sourceName: params.sourceName,
      entryUserName: params.entryUserName,
    },
  });
}

/**
 * Broadcasts Lent Recovery (Collect Loan) alert to family profiles via WhatsApp & Push
 */
export async function broadcastLentRecoveryAlert(params: {
  borrowerName: string;
  entryUserName: string;
  amount: number;
  fullAmount?: string | number;
  remainingDue?: string | number;
  receivedOn: string;
  isFull: boolean;
  remarks?: string;
  currentBal?: string | number;
  profiles: Array<{ id?: string; name?: string; phone?: string }>;
}) {
  const timeStr = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase();

  const waPromises = params.profiles.map(async (profile) => {
    if (!profile.phone) return;
    const alert = buildLentRecoveryAlert({
      greetingUser: profile.name || 'Member',
      borrowerName: params.borrowerName,
      fullOrPartial: params.isFull ? 'Full' : 'Partial',
      entryUserName: params.entryUserName,
      timeStr,
      amount: params.amount,
      fullAmount: params.fullAmount || params.amount,
      remarks: params.remarks || 'Loan recovery',
      receivedOn: params.receivedOn,
      currentBal: params.currentBal,
      remainingDue: params.remainingDue,
    });

    await sendWhatsAppAlert(profile.phone, alert.templateName, alert.components);
  });

  await Promise.allSettled(waPromises);

  // Push Notification Dispatch
  await sendPushAlert({
    title: `Loan Collected: ₹${params.amount.toLocaleString('en-IN')}`,
    body: `₹${params.amount.toLocaleString('en-IN')} collected from ${params.borrowerName} by ${params.entryUserName}. ${params.isFull ? 'Settled in full.' : `Remaining: ₹${params.remainingDue || '0'}`}`,
    inAppTitle: `Loan Repayment (${params.borrowerName})`,
    inAppBody: `₹${params.amount.toLocaleString('en-IN')} received on ${params.receivedOn}.`,
    type: 'lent_recovery',
    url: '/(tabs)/lents',
    data: {
      borrowerName: params.borrowerName,
      amount: params.amount,
      entryUserName: params.entryUserName,
      receivedOn: params.receivedOn,
    },
  });
}

