import { PushAlertPayload } from '../types';

/**
 * Builds standard push notification payload for Firebase Cloud Messaging (FCM) & local alerts.
 */
export function buildPushAlertPayload(params: {
  title: string;
  body: string;
  inAppTitle?: string;
  inAppBody?: string;
  url?: string;
  type?: 'bill_entry' | 'lent_issue' | 'lent_recovery' | 'rotation_withdraw' | 'qr_cooling' | 'general' | string;
  userIds?: string[];
  data?: Record<string, any>;
}): PushAlertPayload {
  return {
    title: params.title,
    body: params.body,
    inAppTitle: params.inAppTitle || params.title,
    inAppBody: params.inAppBody || params.body,
    url: params.url || '/',
    type: params.type || 'general',
    userIds: params.userIds,
    data: {
      ...params.data,
      timestamp: new Date().toISOString(),
    },
  };
}
