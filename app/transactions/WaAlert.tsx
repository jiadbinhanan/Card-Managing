export interface AlertParams {
  txType: "bill" | "rotate" | "spend";
  profiles: any[];
  entryUserName: string;
  amount: number;
  remarks: string;
  timeStr: string;
  cardNameSafe: string;
  cardLast4Safe: string;

  billStatus?: string | null;
  dueDate?: string;
  remainingDue?: number;
  availableLimitAfterBill?: string;

  qrName?: string;
  availableLimitAfterRotate?: string;

  sourceName?: string;
  remainingBalAfterSpend?: string;
  totalSpendAfterSpend?: string;
}

export const buildMetaComponents = (headerParam: { name: string, value: string } | null, bodyParams: Record<string, string>) => {
  const comps: any[] = [];
  if (headerParam) {
    comps.push({
      type: "header",
      parameters: [{ type: "text", parameter_name: headerParam.name, text: headerParam.value }]
    });
  }
  comps.push({
    type: "body",
    parameters: Object.entries(bodyParams).map(([k, v]) => ({
      type: "text", parameter_name: k, text: String(v)
    }))
  });
  return comps;
};

export const triggerAlert = (phone: string, template: string, components: any[]) => {
  if (!phone || phone.length < 10) return;
  fetch('/api/send-whatsapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, templateName: template, components })
  }).catch(err => console.error(`Failed to send ${template}:`, err));
};

export const sendTransactionAlerts = (params: AlertParams) => {
  const sanitize = (v: string) => (v || '').normalize('NFC').replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '').trim().substring(0, 60);

  // সবার কাছে মেসেজ পাঠানোর জন্য profiles এ লুপ চালানো হলো
  params.profiles.forEach(profile => {
    const rawPhone = profile.phone;
    const targetPhone = (rawPhone || "").replace(/[^0-9]/g, '');
    if (!targetPhone || targetPhone.length < 10) return;

    // যেই ইউজারের কাছে মেসেজ যাচ্ছে তার নাম (Greeting)
    const greetingUser = sanitize(profile.name); 

    if (params.txType === "bill" && params.billStatus) {
      if (params.billStatus === 'partially_paid') {
        const comps = buildMetaComponents(
          { name: "card_name", value: params.cardNameSafe },
          {
            greeting_user: greetingUser,
            card_name: params.cardNameSafe,
            last_4: params.cardLast4Safe,
            entry_user: params.entryUserName,
            time: params.timeStr,
            paid_amount: String(params.amount),
            due_date: params.dueDate || "Updated Soon",
            remaining_due: String(params.remainingDue)
          }
        );
        triggerAlert(targetPhone, "partial_bill_pay_alert", comps);

      } else if (params.billStatus === 'paid') {
        const comps = buildMetaComponents(
          { name: "card_name", value: params.cardNameSafe },
          {
            greeting_user: greetingUser,
            card_name: params.cardNameSafe,
            last_4: params.cardLast4Safe,
            entry_user: params.entryUserName,
            time: params.timeStr,
            available_limit: params.availableLimitAfterBill || "0"
          }
        );
        triggerAlert(targetPhone, "full_billpay_complete", comps);
      }

      const creditComps = buildMetaComponents(
        { name: "card_name", value: params.cardNameSafe },
        {
          greeting_user: greetingUser,
          card_name: params.cardNameSafe,
          last_4: params.cardLast4Safe,
          entry_user: params.entryUserName,
          time: params.timeStr,
          amount: String(params.amount),
          remarks: params.remarks,
          current_balance: params.availableLimitAfterBill || "0"
        }
      );
      triggerAlert(targetPhone, "credit_transaction_alert", creditComps);

    } else if (params.txType === "rotate") {
      const rotateComps = buildMetaComponents(
        null,
        {
          greeting_user: greetingUser,
          card_name: params.cardNameSafe,
          last_4: params.cardLast4Safe,
          mode: "QR",
          provider: params.qrName || "QR",
          entry_user: params.entryUserName,
          time: params.timeStr,
          amount: String(params.amount),
          current_balance: params.availableLimitAfterRotate || "0"
        }
      );
      triggerAlert(targetPhone, "rotation_withdraw_alert", rotateComps);

      if (process.env.NEXT_PUBLIC_QSTASH_TOKEN) {
        const coolingEndTime = new Date(Date.now() + (24 * 60 * 60 * 1000) + (5 * 60 * 1000));
        const coolingTimeStr = coolingEndTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();

        const coolingComps = buildMetaComponents(
          { name: "cooling_user", value: params.entryUserName },
          {
            greeting_user: greetingUser,
            cooling_user: params.entryUserName,
            card_name_with_last4: `${params.cardNameSafe} ${params.cardLast4Safe}`,
            qr_name: params.qrName || "QR",
            time: coolingTimeStr
          }
        );

        fetch('https://qstash-us-east-1.upstash.io/v2/publish/https://credics.vercel.app/api/send-whatsapp', {
          method: 'POST',
          headers: { 
              'Content-Type': 'application/json', 
              'Authorization': `Bearer ${process.env.NEXT_PUBLIC_QSTASH_TOKEN}`, 
              'Upstash-Delay': '24h5m' 
          },
          body: JSON.stringify({ phone: targetPhone, templateName: "qr_cooling_period_alert", components: coolingComps })
        }).catch(console.error);
      }
    } else if (params.txType === "spend") {
      const spendComps = buildMetaComponents(
        { name: "entry_user", value: params.entryUserName },
        {
          greeting_user: greetingUser,
          entry_user: params.entryUserName,
          time: params.timeStr,
          amount: String(params.amount),
          source_name: params.sourceName || "Card",
          remarks: params.remarks,
          remaining_balance: params.remainingBalAfterSpend || "0",
          entry_user_duplicate: params.entryUserName,
          total_spend: params.totalSpendAfterSpend || "0"
        }
      );
      triggerAlert(targetPhone, "personal_spend_alert", spendComps);
    }
  });
};