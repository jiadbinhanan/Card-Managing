export interface QRItem {
  id: string;
  merchant_name: string;
  platform: string;
  settlement_time?: string;
  qr_image_url?: string;
  last_used_date: string | null;
  upi_id?: string;
  base_payment_link?: string | null;
  assigned_card_id?: string | null;
  daily_limit?: number;
  status: 'active' | 'on_hold' | 'static' | string;
  target_user_id?: string;
  card_id?: string;
}

export interface ActiveCooldown {
  qrId: string;
  merchantName: string;
  expiresAt: number;
  isBharatPe?: boolean;
}
