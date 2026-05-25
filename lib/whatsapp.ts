export const sendWhatsAppAlert = async (
  phone: string,
  templateName: string,
  variablesOrComponents: Record<string, string> | any[]
) => {
  try {
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    // Array হলে components, object হলে variables হিসেবে পাঠাও
    const isComponents = Array.isArray(variablesOrComponents);

    const res = await fetch('/api/send-whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: cleanPhone,
        templateName,
        ...(isComponents
          ? { components: variablesOrComponents }
          : { variables: variablesOrComponents })
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