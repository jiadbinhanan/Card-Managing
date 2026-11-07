import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Image,
} from 'react-native';
import {
  QrCode,
  Zap,
  Timer,
  LayoutGrid,
  ShieldCheck,
  CreditCard,
  Pencil,
  Plus,
  AlertTriangle,
} from 'lucide-react-native';
import { QRData } from './QRPaymentModal';

export interface ActiveCooldown {
  qrId: string;
  merchantName: string;
  expiresAt: number;
  isBharatPe: boolean;
}

interface QRVaultTabProps {
  qrs: QRData[];
  activeCooldowns: ActiveCooldown[];
  currentUserName: string;
  onSelectQr: (qr: QRData) => void;
  onSelectStaticQr?: (qr: QRData) => void;
  onToggleStatus: (qrId: string, currentStatus: string) => void;
  onEditQr?: (qr: QRData) => void;
  onAddStatic?: () => void;
}

export function QRVaultTab({
  qrs,
  activeCooldowns,
  currentUserName,
  onSelectQr,
  onSelectStaticQr,
  onToggleStatus,
  onEditQr,
  onAddStatic,
}: QRVaultTabProps) {
  const firstName = (currentUserName || '').trim().split(/\s+/)[0].toLowerCase();

  // 1-Second Heartbeat for Live Cooling Countdown
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 1. Separate Static vs Operational QRs (Operational sorted by last_used_date ascending)
  const staticQrs = useMemo(() => qrs.filter((q) => q.status === 'static'), [qrs]);
  const dynamicQrs = useMemo(() => {
    return qrs
      .filter((q) => q.status !== 'static')
      .sort((a, b) => {
        const timeA = a.last_used_date ? new Date(a.last_used_date).getTime() : 0;
        const timeB = b.last_used_date ? new Date(b.last_used_date).getTime() : 0;
        return timeA - timeB;
      });
  }, [qrs]);

  // Active Cooldowns list based on current timestamp
  const currentCooldowns = useMemo(() => {
    return activeCooldowns.filter((c) => c.expiresAt > now);
  }, [activeCooldowns, now]);

  // 2. Recommendation Engine for Top 4 Rotation QRs
  const recommendedQrs = useMemo(() => {
    const activeOperational = dynamicQrs.filter((q) => {
      // Must be active
      if (q.status !== 'active') return false;

      // Exclude self-named QRs
      const merchantFirstWord = (q.merchant_name || '').toLowerCase().trim().split(/\s+/)[0];
      if (firstName && merchantFirstWord === firstName) return false;

      // BharatPe 5-Day Cooling Check
      const isBharatPe =
        (q.merchant_name || '').toLowerCase().includes('bharatpe') ||
        (q.platform || '').toLowerCase().includes('bharatpe');
      if (isBharatPe && q.last_used_date) {
        const daysSince =
          (now - new Date(q.last_used_date).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 5) return false;
      }

      // 24-Hour Active Cooldown Check
      if (activeCooldowns.some((c) => c.qrId === q.id && c.expiresAt > now)) {
        return false;
      }

      return true;
    });

    // Sort by last_used_date ascending (least recently used / never used first)
    activeOperational.sort((a, b) => {
      const timeA = a.last_used_date ? new Date(a.last_used_date).getTime() : 0;
      const timeB = b.last_used_date ? new Date(b.last_used_date).getTime() : 0;
      return timeA - timeB;
    });

    return activeOperational.slice(0, 4);
  }, [dynamicQrs, activeCooldowns, firstName, now]);

  const formatLastPaid = (isoString?: string | null) => {
    if (!isoString) return 'Not Used';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return 'Not Used';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  const formatCooldown = (expiresAt: number) => {
    const diffMs = expiresAt - Date.now();
    if (diffMs <= 0) return 'Ready';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
  };

  return (
    <View style={styles.container}>
      {/* ================= ACTIVE COOLING COUNTDOWN CARDS ================= */}
      {currentCooldowns.length > 0 && (
        <View style={styles.coolingContainer}>
          <View style={styles.coolingHeaderRow}>
            <View style={styles.coolingHeaderBadge}>
              <Timer size={14} color="#D97706" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.coolingHeaderTitle}>Cooling Period Active</Text>
              <Text style={styles.coolingHeaderSub}>
                Personal 24-hour cooling timers for recently rotated QRs.
              </Text>
            </View>
          </View>

          <View style={styles.coolingCardsList}>
            {currentCooldowns.map((c) => {
              const timeLeft = Math.max(0, c.expiresAt - now);
              const hours = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
              const minutes = Math.floor((timeLeft / 1000 / 60) % 60);
              const seconds = Math.floor((timeLeft / 1000) % 60);
              const timeString = `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s remaining`;

              return (
                <View key={c.qrId} style={styles.cooldownItemCard}>
                  <Text style={styles.cooldownMerchantText} numberOfLines={1}>
                    {c.merchantName}
                  </Text>
                  <View style={styles.cooldownBadge}>
                    <Text style={styles.cooldownBadgeText}>{timeString}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* ================= 1. RECOMMENDED 2-COLUMN GRID ================= */}
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionTitleRow}>
          <Zap size={14} color="#10B981" />
          <Text style={styles.sectionTitle}>Recommended Today</Text>
        </View>
        <View style={styles.recBadge}>
          <Text style={styles.recBadgeText}>Optimal Pick</Text>
        </View>
      </View>

      {recommendedQrs.length === 0 ? (
        <View style={styles.emptyCardBox}>
          <Text style={styles.emptyCardText}>
            All active QRs are currently resting in cooling cycles. Check operational list below.
          </Text>
        </View>
      ) : (
        <View style={styles.gridContainer}>
          {recommendedQrs.map((qr) => {
            const hasPhoto = Boolean((qr as any).qr_image_url);
            return (
              <TouchableOpacity
                key={`rec-${qr.id}`}
                style={styles.gridCard}
                onPress={() => onSelectQr(qr)}
                activeOpacity={0.85}
              >
                {/* Large 96px QR Image Banner */}
                <View style={styles.gridImageBanner}>
                  {hasPhoto ? (
                    <Image
                      source={{ uri: (qr as any).qr_image_url }}
                      style={styles.gridBannerImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.gridImagePlaceholder}>
                      <QrCode size={28} color="#4A6B56" />
                    </View>
                  )}
                  {/* Best Pick Badge */}
                  <View style={styles.bestPickBadge}>
                    <Text style={styles.bestPickBadgeText}>Best Pick</Text>
                  </View>
                  {/* Floating Edit Button */}
                  {onEditQr && (
                    <TouchableOpacity
                      style={styles.floatingEditBtn}
                      onPress={(e) => {
                        e.stopPropagation();
                        onEditQr(qr);
                      }}
                      hitSlop={8}
                    >
                      <Pencil size={11} color="#FFFFFF" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Card Details Below Image */}
                <View style={styles.gridCardContent}>
                  <Text style={styles.gridMerchantName} numberOfLines={1}>
                    {qr.merchant_name}
                  </Text>
                  <Text style={styles.gridPlatformText} numberOfLines={1}>
                    {qr.platform || 'UPI'} • {qr.settlement_time || 'T+0'}
                  </Text>
                  <View style={styles.lastPaidPill}>
                    <Text style={styles.lastPaidPillText}>
                      Last Paid: {formatLastPaid(qr.last_used_date)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ================= 2. DYNAMIC VAULT (COMPLETE LIST) ================= */}
      <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
        <View style={styles.sectionTitleRow}>
          <QrCode size={14} color="#0EA5E9" />
          <Text style={styles.sectionTitle}>Dynamic Vault</Text>
        </View>
        <Text style={styles.countText}>{dynamicQrs.length} Available</Text>
      </View>

      <View style={styles.listContainer}>
        {dynamicQrs.map((qr) => {
          const cooldown = activeCooldowns.find(
            (c) => c.qrId === qr.id && c.expiresAt > Date.now()
          );
          const isCooling = !!cooldown;
          const isActive = qr.status === 'active';
          const hasPhoto = Boolean((qr as any).qr_image_url);

          // Anti-Fraud Self-Name Warning
          const firstWord = (qr.merchant_name || '').toLowerCase().trim().split(/\s+/)[0];
          const isDanger = Boolean(firstName && firstWord === firstName);

          return (
            <TouchableOpacity
              key={qr.id}
              style={[
                styles.dynamicRow,
                isDanger && styles.dynamicRowDanger,
                isCooling && styles.dynamicRowCooling,
                !isActive && styles.dynamicRowInactive,
              ]}
              onPress={() => onSelectQr(qr)}
              activeOpacity={0.88}
            >
              {/* 48x48px Thumbnail */}
              <View
                style={[
                  styles.dynamicThumbnailBox,
                  isDanger && styles.dynamicThumbnailBoxDanger,
                ]}
              >
                {hasPhoto ? (
                  <Image
                    source={{ uri: (qr as any).qr_image_url }}
                    style={styles.dynamicThumbnail}
                    resizeMode="cover"
                  />
                ) : (
                  <QrCode size={20} color={isDanger ? '#EF4444' : isActive ? '#0B3F28' : '#8CA394'} />
                )}
              </View>

              {/* Info Column */}
              <View style={styles.dynamicInfoCol}>
                <View style={styles.dynamicTitleRow}>
                  <Text
                    style={[styles.dynamicMerchant, isDanger && styles.dynamicMerchantDanger]}
                    numberOfLines={1}
                  >
                    {qr.merchant_name}
                  </Text>
                  {isDanger && (
                    <View style={styles.dangerPill}>
                      <AlertTriangle size={9} color="#EF4444" />
                      <Text style={styles.dangerPillText}>Self Risk</Text>
                    </View>
                  )}
                  {isCooling && (
                    <View style={styles.coolingPill}>
                      <Timer size={10} color="#D97706" />
                      <Text style={styles.coolingPillText}>
                        {formatCooldown(cooldown.expiresAt)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.dynamicSub} numberOfLines={1}>
                  {qr.platform || 'UPI'} • Last: {formatLastPaid(qr.last_used_date)}
                </Text>
              </View>

              {/* Actions Right */}
              <View style={styles.rowRightActions}>
                {onEditQr && (
                  <TouchableOpacity
                    style={styles.rowEditBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      onEditQr(qr);
                    }}
                    hitSlop={8}
                  >
                    <Pencil size={13} color="#4A6B56" />
                  </TouchableOpacity>
                )}
                <View style={styles.switchWrapper}>
                  <Switch
                    value={isActive}
                    onValueChange={() => onToggleStatus(qr.id, qr.status || 'active')}
                    trackColor={{ false: '#DFE8E0', true: '#10B981' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ================= 3. STATIC VAULT (2-COLUMN SQUARE GRID) ================= */}
      <View style={[styles.sectionHeaderRow, { marginTop: 26 }]}>
        <View style={styles.sectionTitleRow}>
          <LayoutGrid size={14} color="#0B3F28" />
          <Text style={styles.sectionTitle}>Static Vault</Text>
        </View>
        {onAddStatic && (
          <TouchableOpacity
            style={styles.addStaticHeaderBtn}
            onPress={onAddStatic}
            activeOpacity={0.8}
          >
            <Plus size={12} color="#10B981" />
            <Text style={styles.addStaticHeaderBtnText}>Add Static</Text>
          </TouchableOpacity>
        )}
      </View>

      {staticQrs.length === 0 ? (
        <View style={styles.emptyCardBox}>
          <Text style={styles.emptyCardText}>
            No offline standee QRs saved yet. Tap &apos;+ Add Static&apos; to upload standee photos.
          </Text>
        </View>
      ) : (
        <View style={styles.gridContainer}>
          {staticQrs.map((qr) => {
            const hasPhoto = Boolean((qr as any).qr_image_url);
            return (
              <TouchableOpacity
                key={`static-${qr.id}`}
                style={styles.staticGridCard}
                onPress={() => (onSelectStaticQr ? onSelectStaticQr(qr) : onSelectQr(qr))}
                activeOpacity={0.85}
              >
                {/* Floating Edit Button */}
                {onEditQr && (
                  <TouchableOpacity
                    style={styles.staticFloatingEditBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      onEditQr(qr);
                    }}
                    hitSlop={8}
                  >
                    <Pencil size={12} color="#FFFFFF" />
                  </TouchableOpacity>
                )}

                {/* 1:1 Square Aspect Ratio Standee Container */}
                <View style={styles.staticSquareImageContainer}>
                  {hasPhoto ? (
                    <Image
                      source={{ uri: (qr as any).qr_image_url }}
                      style={styles.staticSquareImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.staticSquarePlaceholder}>
                      <ShieldCheck size={36} color="#4A6B56" />
                    </View>
                  )}
                </View>

                {/* Standee Info */}
                <View style={styles.staticGridContent}>
                  <Text style={styles.staticMerchantName} numberOfLines={1}>
                    {qr.merchant_name}
                  </Text>
                  <View style={styles.staticQrBadge}>
                    <Text style={styles.staticQrBadgeText}>STATIC QR</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },
  coolingContainer: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.2,
    borderColor: '#FDE68A',
    marginBottom: 16,
    gap: 10,
  },
  coolingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  coolingHeaderBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  coolingHeaderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: -0.2,
  },
  coolingHeaderSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#B45309',
    marginTop: 1,
  },
  coolingCardsList: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
    paddingTop: 8,
  },
  cooldownItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  cooldownMerchantText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#78350F',
    flex: 1,
    marginRight: 8,
  },
  cooldownBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  cooldownBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#B45309',
    fontVariant: ['tabular-nums'],
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#072C1C',
    letterSpacing: -0.2,
  },
  recBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  recBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#10B981',
    textTransform: 'uppercase',
  },
  countText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#658270',
  },
  addStaticHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  addStaticHeaderBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
    textTransform: 'uppercase',
  },
  emptyCardBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#DFE8E0',
    alignItems: 'center',
  },
  emptyCardText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#658270',
    textAlign: 'center',
    lineHeight: 16,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridCard: {
    width: '48.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.2,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  gridImageBanner: {
    width: '100%',
    height: 96,
    backgroundColor: '#03140C',
    position: 'relative',
    overflow: 'hidden',
  },
  gridBannerImage: {
    width: '100%',
    height: '100%',
    opacity: 0.85,
  },
  gridImagePlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#052215',
  },
  bestPickBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#10B981',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
  },
  bestPickBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#03180F',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  floatingEditBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  gridCardContent: {
    padding: 10,
  },
  gridMerchantName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#072C1C',
  },
  gridPlatformText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#658270',
    marginTop: 2,
  },
  lastPaidPill: {
    marginTop: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  lastPaidPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
  },
  listContainer: {
    gap: 8,
  },
  dynamicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DFE8E0',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  dynamicRowDanger: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: '#FEF2F2',
  },
  dynamicRowCooling: {
    borderColor: 'rgba(217, 119, 6, 0.3)',
    backgroundColor: '#FFFBEB',
  },
  dynamicRowInactive: {
    opacity: 0.6,
  },
  dynamicThumbnailBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EFF3EE',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#DFE8E0',
  },
  dynamicThumbnailBoxDanger: {
    borderColor: 'rgba(239, 68, 68, 0.35)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  dynamicThumbnail: {
    width: '100%',
    height: '100%',
  },
  dynamicInfoCol: {
    flex: 1,
  },
  dynamicTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dynamicMerchant: {
    fontSize: 14,
    fontWeight: '800',
    color: '#072C1C',
    flexShrink: 1,
  },
  dynamicMerchantDanger: {
    color: '#DC2626',
  },
  dangerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
  },
  dangerPillText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#EF4444',
    textTransform: 'uppercase',
  },
  coolingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  coolingPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D97706',
  },
  dynamicSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4A6B56',
    marginTop: 2,
  },
  rowRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  rowEditBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#EFF3EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchWrapper: {
    transform: [{ scale: 0.85 }],
  },
  staticGridCard: {
    width: '48.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 10,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    position: 'relative',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  staticFloatingEditBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  staticSquareImageContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#030E09',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DFE8E0',
    marginBottom: 8,
  },
  staticSquareImage: {
    width: '100%',
    height: '100%',
  },
  staticSquarePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  staticGridContent: {
    gap: 4,
  },
  staticMerchantName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#072C1C',
  },
  staticQrBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  staticQrBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.5,
  },
});
