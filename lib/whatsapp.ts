export const sendWhatsAppAlert = async (
  phone: string, 
  templateName: string, 
  variables: string[]
) => {
  try {
    // নম্বর থেকে + বা স্পেস বাদ দিয়ে ক্লিন করে নেওয়া
    const cleanPhone = phone.replace(/[^0-9]/g, '');

    // আমাদের তৈরি করা Next.js Backend API Route-এ রিকোয়েস্ট পাঠানো
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
    
    console.log("WhatsApp message sent successfully!");
    return true;
    
  } catch (error) {
    console.error("Error sending alert:", error);
    return false;
  }
};