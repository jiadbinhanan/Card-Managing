const qrNameStr = sanitizeText(settleTx.qrs?.merchant_name || 'Manual Rotation Entry');

const settlementComponents = [
  {
    type: "header",
    parameters: [
      { type: "text", parameter_name: "qr_name", text: qrNameStr }
    ]
  },
  {
    type: "body",
    parameters: [
      { type: "text", parameter_name: "greeting_user", text: sanitizeText(profile.name) },
      { type: "text", parameter_name: "card_name", text: sanitizeText(targetCard?.card_name || 'Card') },
      { type: "text", parameter_name: "last_4", text: sanitizeText(targetCard?.last_4_digits || '0000') },
      { type: "text", parameter_name: "qr_name", text: qrNameStr },
      { type: "text", parameter_name: "entry_user", text: sanitizeText(currentUser?.name || '-') },
      { type: "text", parameter_name: "time", text: timeStr },
      { type: "text", parameter_name: "amount", text: String(amtToSettle) },
      { type: "text", parameter_name: "receiver_name", text: sanitizeText(receiverProfile?.name || 'User') },
      { type: "text", parameter_name: "total_cash", text: String(newBalance) }
    ]
  }
];

await fetch('/api/send-whatsapp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    phone: cleanPhone,
    templateName: "rotation_settlement_alert",
    components: settlementComponents
  })
});