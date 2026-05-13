import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phone, templateName, variables } = body;

    const META_TOKEN = process.env.META_WA_TOKEN;
    const PHONE_ID = process.env.META_WA_PHONE_ID;

    // Meta-র রিকোয়ারমেন্ট অনুযায়ী ভেরিয়েবলগুলোকে অবজেক্ট অ্যারেতে কনভার্ট করা
    const parameters = variables.map((val: string) => ({
      type: "text",
      text: val.toString()
    }));

    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: templateName,
        language: {
          code: "bn" // যেহেতু টেমপ্লেটগুলো বাংলায়
        },
        components: [
          {
            type: "body",
            parameters: parameters
          }
        ]
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