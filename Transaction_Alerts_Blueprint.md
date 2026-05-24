Credics Transaction Alerts & UI Upgrade BlueprintThis document outlines the required modifications for the Transactions page (page.tsx(transactions/)). Please read these instructions carefully and implement them.1. Multi-Card Selection in Header (UI & State Upgrade)Currently, the global header only allows selecting one card (or "all"). We need to upgrade this to support multiple card selections.Modifications in Global State (store/cardStore.ts if exists, or local state):Change globalSelectedCardId (string) to globalSelectedCardIds (array of strings).If globalSelectedCardIds includes 'all', it means all cards are active.Update the setter function: setGlobalSelectedCardIds.Modifications in Header UI (Wherever the card selector is implemented):Instead of a standard <select>, implement a custom dropdown (or use Radix UI / Shadcn Popover + Command) with checkboxes next to each card.Allow checking/unchecking multiple cards. Include a "Select All" option.The UI should display "N Cards Selected" or comma-separated names if space permits.Modifications in page.tsx(transactions/):Update how activeCardObj or activePrimaryId is derived.If multiple cards are selected, the transaction logic needs to handle which specific card is being used for the current transaction.Crucial Logic: For txType === 'bill' or txType === 'rotate', the user must select a single target card within the transaction form itself. The global multi-select filters the view, but a specific transaction applies to a single card.Ensure the activePrimaryId used in handleSave correctly points to the card selected for the transaction form, not just the global filter.2. WhatsApp Alert Implementation (handleSave function)We need to implement non-blocking (Fire & Forget) WhatsApp alerts immediately after the database save logic in handleSave.Rules:DO NOT add a toggle button for alerts. They must trigger automatically.Alert spamming is reduced: debit_transaction_alert is removed from the 'spend' category.Ensure the processBillPayment function returns { status: 'paid' | 'partially_paid', remainingDue: number, activeCycleId: string }.Implementation Block (Insert this towards the end of handleSave, right after Supabase inserts):// ==========================================
// WHATSAPP ALERTS (FIRE & FORGET)
// ==========================================

// Helper function for Fire & Forget fetch
const triggerAlert = (phone: string, template: string, vars: Record<string, string> | any[], isComponents = false) => {
  if (!phone || phone.length < 10) return;
  const payload: any = { phone, templateName: template };
  if (isComponents) payload.components = vars;
  else payload.variables = vars;

  fetch('/api/send-whatsapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(err => console.error(`Failed to send ${template}:`, err));
};

const sendAlerts = () => {
  const targetPhone = (profiles.find(p => p.id === finalActingUserId)?.phone || "").replace(/[^0-9]/g, '');
  if (!targetPhone || targetPhone.length < 10) return;

  const nowTimeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).replace(/[\u202F\u00A0]/g, ' ').toLowerCase();

  // 1. BILL PAY ALERTS
  if (txType === "bill" && billResult) {
    if (billResult.status === 'partially_paid') {
      triggerAlert(targetPhone, "partial_bill_pay_alert", {
        greeting_user: profileData.name,
        card_name: activeCardObj?.card_name || 'Card',
        last_4: activeCardObj?.last_4_digits || '0000',
        entry_user: currentUser?.name || '-',
        time: nowTimeStr,
        paid_amount: String(amtNum),
        due_date: "Updated Soon", // Can be fetched from DB if needed
        remaining_due: String(billResult.remainingDue)
      });
    } else if (billResult.status === 'paid') {
      triggerAlert(targetPhone, "full_billpay_complete", {
        greeting_user: profileData.name,
        card_name: activeCardObj?.card_name || 'Card',
        last_4: activeCardObj?.last_4_digits || '0000',
        entry_user: currentUser?.name || '-',
        time: nowTimeStr,
        available_limit: String(familyLimitsMap[activePrimaryId] + amtNum)
      });
    }

    triggerAlert(targetPhone, "credit_transaction_alert", {
      greeting_user: profileData.name,
      card_name: activeCardObj?.card_name || 'Card',
      last_4: activeCardObj?.last_4_digits || '0000',
      entry_user: currentUser?.name || '-',
      time: nowTimeStr,
      amount: String(amtNum),
      remarks: remarks || "Bill Pay",
      current_balance: String(familyLimitsMap[activePrimaryId] + amtNum)
    });
  }

  // 2. ROTATE LIMIT ALERTS
  else if (txType === "rotate") {
    const qrName = qrs.find(q => q.id === selectedQrId)?.merchant_name || 'QR';

    // Instant Withdraw Alert
    triggerAlert(targetPhone, "rotation_withdraw_alert", {
      greeting_user: profileData.name,
      card_name: activeCardObj?.card_name || 'Card',
      last_4: activeCardObj?.last_4_digits || '0000',
      mode: "QR",
      provider: qrName,
      entry_user: currentUser?.name || '-',
      time: nowTimeStr,
      amount: String(amtNum),
      current_balance: String(familyLimitsMap[activePrimaryId] - amtNum)
    });

    // Scheduled Cooling Alert (QStash via components)
    if (process.env.NEXT_PUBLIC_QSTASH_TOKEN) {
      const coolingEndTime = new Date(Date.now() + (24 * 60 * 60 * 1000) + (5 * 60 * 1000));
      const coolingTimeStr = coolingEndTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();

      const coolingComponents = [
        { type: "header", parameters: [{ type: "text", parameter_name: "cooling_user", text: currentUser?.name || '-' }] },
        { type: "body", parameters: [
            { type: "text", parameter_name: "greeting_user", text: profileData.name },
            { type: "text", parameter_name: "cooling_user", text: currentUser?.name || '-' },
            { type: "text", parameter_name: "card_name_with_last4", text: `${activeCardObj?.card_name} ${activeCardObj?.last_4_digits}` },
            { type: "text", parameter_name: "qr_name", text: qrName },
            { type: "text", parameter_name: "time", text: coolingTimeStr }
        ]}
      ];

      fetch('/api/send-whatsapp', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_QSTASH_TOKEN}`, 
          'Upstash-Delay': '24h5m' 
        },
        body: JSON.stringify({ phone: targetPhone, templateName: "qr_cooling_period_alert", components: coolingComponents })
      }).catch(console.error);
    }
  }

  // 3. ADD SPEND ALERTS
  else if (txType === "spend") {
    const sourceName = spendMethod === 'credit_card' ? `${activeCardObj?.card_name}` : 'Cash on Hand';
    const remainingBal = spendMethod === 'credit_card' ? String(familyLimitsMap[activePrimaryId] - amtNum) : String(userCashMap[finalActingUserId] - amtNum);

    // Only Personal Spend Alert (Debit alert removed to prevent spam)
    triggerAlert(targetPhone, "personal_spend_alert", {
      greeting_user: profileData.name,
      entry_user: currentUser?.name || '-',
      time: nowTimeStr,
      amount: String(amtNum),
      source_name: sourceName,
      remarks: remarks || "N/A",
      remaining_balance: remainingBal,
      entry_user_duplicate: currentUser?.name || '-',
      total_spend: "Updated Soon" // Placeholder for now
    });
  }
};

// Call the function asynchronously without awaiting (Fire & Forget)
sendAlerts();
