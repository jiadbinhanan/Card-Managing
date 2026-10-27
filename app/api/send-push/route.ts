import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getMessaging, MulticastMessage } from "firebase-admin/messaging";

// Initialize Firebase Admin lazily if credentials exist
function getFirebaseAdminApp() {
  const apps = getApps();
  if (apps.length > 0) {
    return apps[0];
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  // Handle both newline escaped and raw private keys
  if (privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title,
      body: messageBody,
      inAppTitle,
      inAppBody,
      url = "/dashboard",
      type = "general",
      userIds,
      data: extraData = {},
    } = body;

    if (!title || !messageBody) {
      return NextResponse.json(
        { success: false, error: "Title and body are required." },
        { status: 400 }
      );
    }

    const app = getFirebaseAdminApp();
    if (!app) {
      console.warn(
        "Firebase credentials not found in environment. Push notification skipped."
      );
      return NextResponse.json({
        success: false,
        warning: "FIREBASE_CREDENTIALS_MISSING",
        message: "Firebase credentials not yet configured in .env",
      });
    }

    // Connect to Supabase using service role to fetch active tokens
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let query = supabase
      .from("user_push_tokens")
      .select("fcm_token, user_id")
      .eq("is_active", true);

    if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      query = query.in("user_id", userIds);
    }

    const { data: tokenRecords, error: dbError } = await query;

    if (dbError) {
      console.error("Error fetching FCM tokens from Supabase:", dbError);
      return NextResponse.json(
        { success: false, error: dbError.message },
        { status: 500 }
      );
    }

    if (!tokenRecords || tokenRecords.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active push tokens found for recipient(s).",
        sentCount: 0,
      });
    }

    const fcmTokens = Array.from(new Set(tokenRecords.map((r) => r.fcm_token)));

    // Prepare Multicast Payload
    // 1. Android Lockscreen / Background Notification Payload
    // 2. Data Payload for Foreground In-App Alert
    const multicastMessage: MulticastMessage = {
      tokens: fcmTokens,
      android: {
        priority: "high",
        notification: {
          title: title, // Lock screen / System tray title
          body: messageBody, // Lock screen / System tray body
          sound: "default",
          channelId: "credics_alerts_channel",
          visibility: "public",
        },
      },
      data: {
        title: inAppTitle || title,
        body: inAppBody || messageBody,
        lockscreenTitle: title,
        lockscreenBody: messageBody,
        url: String(url),
        type: String(type),
        timestamp: new Date().toISOString(),
        ...(extraData ? { extra: JSON.stringify(extraData) } : {}),
      },
    };

    const messaging = getMessaging(app);
    const response = await messaging.sendEachForMulticast(multicastMessage);

    // Clean up stale or invalid tokens
    const staleTokens: string[] = [];
    response.responses.forEach((res, index) => {
      if (!res.success && res.error) {
        const errCode = res.error.code;
        if (
          errCode === "messaging/registration-token-not-registered" ||
          errCode === "messaging/invalid-registration-token"
        ) {
          staleTokens.push(fcmTokens[index]);
        }
      }
    });

    if (staleTokens.length > 0) {
      await supabase
        .from("user_push_tokens")
        .update({ is_active: false })
        .in("fcm_token", staleTokens);
    }

    return NextResponse.json({
      success: true,
      sentCount: response.successCount,
      failedCount: response.failureCount,
    });
  } catch (error: any) {
    console.error("Error in /api/send-push:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
