import { describe, it, expect } from 'vitest';
import {
  extractActiveCooldowns,
  filterSuggestedQRs,
  generateAntiFraudAmounts,
  buildUpiPaymentLink,
} from '../qrs';
import { QRItem } from '../../types';

describe('Pillar 4D: Smart QR Cooldowns, Fraud Splits & Recommendation Engine', () => {
  const mockQrs: QRItem[] = [
    {
      id: 'qr-john-personal',
      merchant_name: 'John Doe Store',
      upi_id: 'john@upi',
      platform: 'PhonePe',
      status: 'active',
      last_used_date: '2026-11-01T10:00:00Z',
    },
    {
      id: 'qr-bharatpe-1',
      merchant_name: 'BharatPe Merchant A',
      upi_id: 'bharatpe1@upi',
      platform: 'BharatPe',
      status: 'active',
      last_used_date: '2026-11-04T10:00:00Z', // 2 days ago
    },
    {
      id: 'qr-bharatpe-2',
      merchant_name: 'BharatPe Old Merchant',
      upi_id: 'bharatpe2@upi',
      platform: 'BharatPe',
      status: 'active',
      last_used_date: '2026-10-25T10:00:00Z', // 12 days ago
    },
    {
      id: 'qr-cold-1',
      merchant_name: 'Fresh Grocery',
      upi_id: 'fresh@upi',
      platform: 'GooglePay',
      status: 'active',
      last_used_date: null, // never used!
    },
    {
      id: 'qr-inactive',
      merchant_name: 'Old Shop Closed',
      upi_id: 'old@upi',
      platform: 'Paytm',
      status: 'on_hold',
      last_used_date: null,
    },
    {
      id: 'qr-regular',
      merchant_name: 'Corner Bakery',
      upi_id: 'bakery@upi',
      platform: 'PhonePe',
      status: 'active',
      last_used_date: '2026-11-02T10:00:00Z',
    },
  ];

  const fixedNow = new Date('2026-11-06T12:00:00Z').getTime();

  describe('1. Active Cooldown Extraction (24-Hour Cooling)', () => {
    it('should identify active cooldowns within 24h and exclude transactions older than 24h', () => {
      const recentTxs = [
        {
          qr_id: 'qr-regular',
          created_at: new Date(fixedNow - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
        },
        {
          qr_id: 'qr-bharatpe-2',
          created_at: new Date(fixedNow - 30 * 60 * 60 * 1000).toISOString(), // 30 hours ago (expired!)
        },
      ];

      const cooldowns = extractActiveCooldowns(recentTxs, mockQrs, fixedNow);

      expect(cooldowns.length).toBe(1);
      expect(cooldowns[0].qrId).toBe('qr-regular');
      expect(cooldowns[0].merchantName).toBe('Corner Bakery');
      expect(cooldowns[0].expiresAt).toBeGreaterThan(fixedNow);
    });
  });

  describe('2. Smart QR Recommendation & Filtering Pipeline', () => {
    it('should filter out self-named QRs, BharatPe within 5 days, and 24h cooling QRs', () => {
      const activeCooldowns = [
        {
          qrId: 'qr-regular',
          merchantName: 'Corner Bakery',
          expiresAt: fixedNow + 10000,
        },
      ];

      // User first name = "John".
      // Expected exclusions:
      // - qr-inactive (status: on_hold)
      // - qr-john-personal (self-name match)
      // - qr-bharatpe-1 (used 2 days ago, BharatPe cooldown is 5 days!)
      // - qr-regular (active in activeCooldowns)
      // Expected remaining: qr-cold-1 (never used) and qr-bharatpe-2 (used 12 days ago)
      const suggested = filterSuggestedQRs({
        qrs: mockQrs,
        activeCooldowns,
        userFirstName: 'John',
        nowMs: fixedNow,
      });

      const suggestedIds = suggested.map((q) => q.id);
      expect(suggestedIds).not.toContain('qr-inactive');
      expect(suggestedIds).not.toContain('qr-john-personal');
      expect(suggestedIds).not.toContain('qr-bharatpe-1');
      expect(suggestedIds).not.toContain('qr-regular');

      expect(suggestedIds).toContain('qr-cold-1');
      expect(suggestedIds).toContain('qr-bharatpe-2');

      // Oldest / never used (qr-cold-1 with null last_used_date) must be first!
      expect(suggested[0].id).toBe('qr-cold-1');
    });
  });

  describe('3. Anti-Fraud Amount Generator', () => {
    it('should generate single swipe amount under ₹2,000 threshold', () => {
      for (let i = 0; i < 20; i++) {
        const amounts = generateAntiFraudAmounts('once');
        expect(amounts.length).toBe(1);
        expect(amounts[0]).toBeGreaterThanOrEqual(1850);
        expect(amounts[0]).toBeLessThan(2000);
      }
    });

    it('should generate 2-split amounts summing to under ₹2,000 threshold with valid non-zero parts', () => {
      for (let i = 0; i < 20; i++) {
        const amounts = generateAntiFraudAmounts('multiple', 2);
        expect(amounts.length).toBe(2);
        expect(amounts[0]).toBeGreaterThanOrEqual(500);
        expect(amounts[1]).toBeGreaterThanOrEqual(500);
        const sum = amounts[0] + amounts[1];
        expect(sum).toBeGreaterThanOrEqual(1900);
        expect(sum).toBeLessThan(2000);
      }
    });

    it('should generate 3-split amounts with 3 distinct sub-₹2,000 amounts', () => {
      const amounts = generateAntiFraudAmounts('multiple', 3);
      expect(amounts.length).toBe(3);
      amounts.forEach((amt) => {
        expect(amt).toBeGreaterThanOrEqual(1800);
        expect(amt).toBeLessThan(2000);
      });
    });
  });

  describe('4. Dynamic UPI Intent Link Builder', () => {
    it('should generate standard UPI URL with encoded merchant name and INR currency', () => {
      const link = buildUpiPaymentLink(mockQrs[0], 1950);
      expect(link).toContain('upi://pay?pa=john@upi');
      expect(link).toContain('pn=John%20Doe%20Store');
      expect(link).toContain('&am=1950&cu=INR');
    });

    it('should preserve base_payment_link query parameters and append am parameter correctly', () => {
      const customQr: QRItem = {
        id: 'qr-custom',
        merchant_name: 'Portal Merchant',
        upi_id: 'portal@upi',
        platform: 'Static',
        status: 'active',
        last_used_date: null,
        base_payment_link: 'https://pay.example.com/checkout?mid=123&token=abc',
      };

      const link = buildUpiPaymentLink(customQr, 1890);
      expect(link).toBe('https://pay.example.com/checkout?mid=123&token=abc&am=1890');
    });
  });
});
