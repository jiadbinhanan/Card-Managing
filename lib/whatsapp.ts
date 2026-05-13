export const sendWhatsAppAlert = async (
  phone: string, 
  templateName: string, 
  variables: Record<string, string> // Array-এর বদলে Object করা হলো
) => {
  try {
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    const res = await fetch('/api/send-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: cleanPhone,
        templateName,
        variables
      })
    });

    const result = await res.json();
    if (!result.success) {
      console.error("WhatsApp Alert Failed:", result.error);
      return false;
    }

    console.log(`WhatsApp message sent successfully to ${cleanPhone}!`);
    return true;

  } catch (error) {
    console.error("Error sending alert:", error);
    return false;
  }
};