import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    // রিকোয়েস্ট থেকে components এবং variables দুটোই এক্সট্র্যাক্ট করা হলো
    const { phone, templateName, variables, components } = body;

    const META_TOKEN = process.env.META_WA_TOKEN;
    const PHONE_ID = process.env.META_WA_PHONE_ID;

    let finalComponents: any[] = [];

    // কন্ডিশন ১: যদি রিকোয়েস্টে সরাসরি components অ্যারে থাকে (যেমন: QStash থেকে আসা রিকোয়েস্ট)
    if (components && Array.isArray(components)) {
      finalComponents = components;
    } 
    // কন্ডিশন ২: যদি রিকোয়েস্টে variables অবজেক্ট থাকে (তোমার পুরনো sendWhatsAppAlert এর জন্য)
    else if (variables && typeof variables === 'object') {
      const parameters = Object.entries(variables).map(([key, value]) => ({
        type: "text",
        parameter_name: key,
        // invisible spaces এবং newlines রিমুভ করে সেফটি দেওয়া হলো
        text: String(value).replace(/[\u202F\u00A0]/g, ' ').replace(/[\r\n\t]+/g, ' ').trim() || "-"
      }));

      finalComponents = [
        {
          type: "body",
          parameters: parameters
        }
      ];
    } else {
        // যদি কোনো ভ্যারিয়েবল বা কম্পোনেন্ট না থাকে তবে ফাঁকা অ্যারে যাবে (যেমন শুধু টেক্সট টেমপ্লেটের ক্ষেত্রে)
        finalComponents = [];
    }

    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: "bn"
        },
        components: finalComponents // ডায়নামিক কম্পোনেন্ট পাস করা হলো
      }
    };

    const response = await fetch(`https://graph.facebook.com/v18.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${META_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Failed to send message');
    }

    return NextResponse.json({ success: true, data });

  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}