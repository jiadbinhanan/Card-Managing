import { supabase } from './supabase';
import {
  MetaComponent,
  buildBillEntryAlert,
  buildPartialBillPayAlert,
  buildFullBillPayAlert,
  buildCreditTransactionAlert,
  buildRotationWithdrawAlert,
  buildRotationSettlementAlert,
  buildQrCoolingAlert,
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

/**
 * Broadcasts Rotation Withdrawal alert to family profiles via WhatsApp, Push, and schedules QStash cooling alert
 */
export async function broadcastRotationWithdrawAlert(params: {
  cardName: string;
  last4: string;
  qrName: string;
  entryUserName: string;
  amount: number;
  currentBalance?: string | number;
  profiles: Array<{ id?: string; name?: string; phone?: string }>;
}) {
  const timeStr = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase();

  const waPromises = params.profiles.map(async (profile) => {
    if (!profile.phone) return;
    const alert = buildRotationWithdrawAlert({
      greetingUser: profile.name || 'Member',
      cardName: params.cardName,
      last4: params.last4,
      mode: 'QR',
      provider: params.qrName,
      entryUserName: params.entryUserName,
      timeStr,
      amount: params.amount,
      currentBalance: params.currentBalance,
    });

    await sendWhatsAppAlert(profile.phone, alert.templateName, alert.components);
  });

  await Promise.allSettled(waPromises);

  // Push Notification Dispatch (Rule 4: clean title, zero emojis)
  await sendPushAlert({
    title: `QR Withdrawal: ₹${params.amount.toLocaleString('en-IN')}`,
    body: `₹${params.amount.toLocaleString('en-IN')} withdrawn from ${params.cardName} (${params.last4}) by ${params.entryUserName}. Remaining: ₹${params.currentBalance || '0'}.`,
    inAppTitle: `QR Withdrawal (${params.qrName})`,
    inAppBody: `${params.entryUserName} recorded ₹${params.amount.toLocaleString('en-IN')} withdrawal.`,
    type: 'rotation_withdraw',
    url: '/(tabs)/settlements',
    data: {
      qrName: params.qrName,
      amount: params.amount,
      cardName: params.cardName,
      last4: params.last4,
      entryUserName: params.entryUserName,
    },
  });

  // Schedule QStash Cooling Period Alert (24h 5m later)
  try {
    const coolingEndTime = new Date(Date.now() + 24 * 60 * 60 * 1000 + 5 * 60 * 1000);
    const coolingTimeStr = coolingEndTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).toLowerCase();

    for (const profile of params.profiles) {
      const cleanPhone = (profile.phone || '').replace(/[^0-9]/g, '');
      if (cleanPhone.length >= 10) {
        const coolingAlert = buildQrCoolingAlert({
          greetingUser: profile.name || 'Member',
          coolingUser: params.entryUserName,
          cardNameWithLast4: `${params.cardName} ${params.last4}`,
          qrName: params.qrName,
          timeStr: coolingTimeStr,
        });

        fetch(`${API_BASE_URL}/api/schedule-cooling-alert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: cleanPhone,
            templateName: coolingAlert.templateName,
            components: coolingAlert.components,
            delay: '24h5m',
          }),
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Cooling alert schedule notice:', err);
  }
}

/**
 * Broadcasts Rotation Settlement alert to family profiles via WhatsApp & Push
 */
export async function broadcastRotationSettlementAlert(params: {
  cardName: string;
  last4: string;
  qrName: string;
  entryUserName: string;
  amount: number;
  receiverName: string;
  totalCash?: string | number;
  profiles: Array<{ id?: string; name?: string; phone?: string }>;
}) {
  const timeStr = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase();

  const waPromises = params.profiles.map(async (profile) => {
    if (!profile.phone) return;
    const alert = buildRotationSettlementAlert({
      greetingUser: profile.name || 'Member',
      cardName: params.cardName,
      last4: params.last4,
      qrName: params.qrName,
      entryUserName: params.entryUserName,
      timeStr,
      amount: params.amount,
      receiverName: params.receiverName,
      totalCash: params.totalCash,
    });

    await sendWhatsAppAlert(profile.phone, alert.templateName, alert.components);
  });

  await Promise.allSettled(waPromises);

  // Push Notification Dispatch (Rule 4: clean title, zero emojis)
  await sendPushAlert({
    title: `Rotation Settled: ₹${params.amount.toLocaleString('en-IN')}`,
    body: `₹${params.amount.toLocaleString('en-IN')} settled to ${params.receiverName} by ${params.entryUserName} for ${params.cardName}.`,
    inAppTitle: `Settlement Received (${params.qrName})`,
    inAppBody: `${params.entryUserName} confirmed ₹${params.amount.toLocaleString('en-IN')} cash received by ${params.receiverName}.`,
    type: 'rotation_settlement',
    url: '/(tabs)/settlements',
    data: {
      qrName: params.qrName,
      amount: params.amount,
      cardName: params.cardName,
      receiverName: params.receiverName,
      entryUserName: params.entryUserName,
    },
  });
}

/**
 * Broadcasts Personal Spend alert to family profiles via WhatsApp & Push
 */
export async function broadcastPersonalSpendAlert(params: {
  cardName: string;
  entryUserName: string;
  amount: number;
  paymentMethod: 'credit_card' | 'cash_on_hand';
  remarks?: string;
  remainingBalance?: string | number;
  totalSpend?: string | number;
  profiles: Array<{ id?: string; name?: string; phone?: string }>;
}) {
  const timeStr = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase();

  const sourceName = params.paymentMethod === 'credit_card' ? params.cardName : 'Cash on Hand';

  const waPromises = params.profiles.map(async (profile) => {
    if (!profile.phone) return;
    const alert = buildPersonalSpendAlert({
      greetingUser: profile.name || 'Member',
      entryUserName: params.entryUserName,
      timeStr,
      amount: params.amount,
      sourceName,
      remarks: params.remarks || 'Personal spend',
      remainingBalance: params.remainingBalance,
      totalSpend: params.totalSpend,
    });

    await sendWhatsAppAlert(profile.phone, alert.templateName, alert.components);
  });

  await Promise.allSettled(waPromises);

  // Push Notification Dispatch (Rule 4: clean title, zero emojis)
  await sendPushAlert({
    title: `Personal Spend: ₹${params.amount.toLocaleString('en-IN')}`,
    body: `₹${params.amount.toLocaleString('en-IN')} spent by ${params.entryUserName} via ${sourceName}. ${params.remarks ? `"${params.remarks}"` : ''}`,
    inAppTitle: `Spend Recorded (${sourceName})`,
    inAppBody: `${params.entryUserName} recorded ₹${params.amount.toLocaleString('en-IN')} spend.`,
    type: 'personal_spend',
    url: '/(tabs)/transactions',
    data: {
      sourceName,
      amount: params.amount,
      entryUserName: params.entryUserName,
      remarks: params.remarks,
    },
  });
}


