import React, { useMemo } from 'react';
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
  Clock,
  ArrowRight,
  ShieldCheck,
  CreditCard,
  Layers,
  Pencil,
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
  onToggleStatus: (qrId: string, currentStatus: string) => void;
  onEditQr?: (qr: QRData) => void;
}

export function QRVaultTab({
  qrs,
  activeCooldowns,
  currentUserName,
  onSelectQr,
  onToggleStatus,
  onEditQr,
}: QRVaultTabProps) {
  const firstName = currentUserName.trim().split(/\s+/)[0].toLowerCase();

  // 1. Separate Static vs Operational QRs
  const staticQrs = useMemo(() => qrs.filter((q) => q.status === 'static'), [qrs]);
  const dynamicQrs = useMemo(() => qrs.filter((q) => q.status !== 'static'), [qrs]);

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
          (Date.now() - new Date(q.last_used_date).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 5) return false;
      }

      // 24-Hour Active Cooldown Check
      if (activeCooldowns.some((c) => c.qrId === q.id && c.expiresAt > Date.now())) {
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
  }, [dynamicQrs, activeCooldowns, firstName]);

  const formatCooldown = (expiresAt: number) => {
    const diffMs = expiresAt - Date.now();
    if (diffMs <= 0) return 'Ready';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
  };

  return (
    <View style={styles.container}>
      {/* Active Cooling Alert Banner */}
      {activeCooldowns.length > 0 && (
        <View style={styles.coolingBanner}>
          <Timer size={14} color="#D97706" />
          <Text style={styles.coolingBannerText}>
            {activeCooldowns.length} Merchant QR{activeCooldowns.length > 1 ? 's' : ''} in cooling
            safety cycle.
          </Text>
        </View>
      )}

      {/* ================= 1. RECOMMENDED 2x2 GRID ================= */}
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionTitleRow}>
          <Zap size={14} color="#10B981" />
          <Text style={styles.sectionTitle}>Recommended Rotation QRs</Text>
        </View>
        <View style={styles.recBadge}>
          <Text style={styles.recBadgeText}>Optimal 4</Text>
        </View>
      </View>

      {recommendedQrs.length === 0 ? (
        <View style={styles.emptyCardBox}>
          <Text style={styles.emptyCardText}>
            All active QRs are currently resting in cooling cycles. Check operational list below.
          </Text>
        </View>
      ) : (
        <View style={styles.recGrid}>
          {recommendedQrs.map((qr) => {
            const hasPhoto = Boolean((qr as any).qr_image_url);
            return (
              <TouchableOpacity
                key={qr.id}
                style={styles.recCard}
                onPress={() => onSelectQr(qr)}
                activeOpacity={0.85}
              >
                <View style={styles.recCardTop}>
                  <View style={styles.recIconCircle}>
                    {hasPhoto ? (
                      <Image source={{ uri: (qr as any).qr_image_url }} style={styles.recThumbnail} />
                    ) : (
                      <QrCode size={16} color="#0B3F28" strokeWidth={2.4} />
                    )}
                  </View>
                  <View style={styles.recTopActions}>
                    <View style={styles.readyBadge}>
                      <Text style={styles.readyBadgeText}>READY</Text>
                    </View>
                    {onEditQr && (
                      <TouchableOpacity
                        style={styles.cardEditPencil}
                        onPress={(e) => {
                          e.stopPropagation();
                          onEditQr(qr);
                        }}
                      >
                        <Pencil size={11} color="#658270" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                <Text style={styles.recMerchantName} numberOfLines={1}>
                  {qr.merchant_name}
                </Text>
                <Text style={styles.recPlatform}>{qr.platform || 'UPI QR'}</Text>

                <View style={styles.recCardDivider} />

                <View style={styles.recFooter}>
                  <Text style={styles.recSettlement}>{qr.settlement_time || 'T+0 Instant'}</Text>
                  <View style={styles.recActionArrow}>
                    <ArrowRight size={12} color="#0B3F28" />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* ================= 2. ALL DYNAMIC OPERATIONAL QRS ================= */}
      <View style={[styles.sectionHeaderRow, { marginTop: 22 }]}>
        <View style={styles.sectionTitleRow}>
          <Layers size={14} color="#0B3F28" />
          <Text style={styles.sectionTitle}>Dynamic Vault</Text>
        </View>
        <Text style={styles.countText}>{dynamicQrs.length} Operational</Text>
      </View>

      <View style={styles.listContainer}>
        {dynamicQrs.map((qr) => {
          const cooldown = activeCooldowns.find((c) => c.qrId === qr.id && c.expiresAt > Date.now());
          const isCooling = !!cooldown;
          const isActive = qr.status === 'active';
          const hasPhoto = Boolean((qr as any).qr_image_url);

          return (
            <TouchableOpacity
              key={qr.id}
              style={[styles.dynamicRow, isCooling && styles.dynamicRowCooling]}
              onPress={() => onSelectQr(qr)}
              activeOpacity={0.88}
            >
              <View style={styles.dynamicIconBox}>
                {hasPhoto ? (
                  <Image source={{ uri: (qr as any).qr_image_url }} style={styles.dynamicThumbnail} />
                ) : (
                  <QrCode size={18} color={isActive ? '#0B3F28' : '#8CA394'} />
                )}
              </View>

              <View style={styles.dynamicInfoCol}>
                <View style={styles.dynamicTitleRow}>
                  <Text style={styles.dynamicMerchant} numberOfLines={1}>
                    {qr.merchant_name}
                  </Text>
                  {isCooling && (
                    <View style={styles.coolingPill}>
                      <Timer size={10} color="#D97706" />
                      <Text style={styles.coolingPillText}>
                        {formatCooldown(cooldown.expiresAt)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.dynamicUpi} numberOfLines={1}>
                  {qr.upi_id || 'UPI Not Linked'} • {qr.platform || 'UPI'}
                </Text>
              </View>

              <View style={styles.rowRightActions}>
                {onEditQr && (
                  <TouchableOpacity
                    style={styles.rowEditBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                      onEditQr(qr);
                    }}
                  >
                    <Pencil size={12} color="#4A6B56" />
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

      {/* ================= 3. STATIC VAULT SECTION ================= */}
      {staticQrs.length > 0 && (
        <>
          <View style={[styles.sectionHeaderRow, { marginTop: 22 }]}>
            <View style={styles.sectionTitleRow}>
              <CreditCard size={14} color="#0B3F28" />
              <Text style={styles.sectionTitle}>Static Vault</Text>
            </View>
            <Text style={styles.countText}>{staticQrs.length} Static</Text>
          </View>

          <View style={styles.listContainer}>
            {staticQrs.map((qr) => {
              const hasPhoto = Boolean((qr as any).qr_image_url);
              return (
                <TouchableOpacity
                  key={qr.id}
                  style={styles.staticCard}
                  onPress={() => onSelectQr(qr)}
                  activeOpacity={0.88}
                >
                  <View style={styles.staticIconBox}>
                    {hasPhoto ? (
                      <Image source={{ uri: (qr as any).qr_image_url }} style={styles.dynamicThumbnail} />
                    ) : (
                      <ShieldCheck size={20} color="#0B3F28" />
                    )}
                  </View>
                  <View style={styles.staticInfoCol}>
                    <Text style={styles.staticTitle}>{qr.merchant_name}</Text>
                    <Text style={styles.staticSub}>Offline Merchant Standee • Direct Scan</Text>
                  </View>
                  <View style={styles.rowRightActions}>
                    {onEditQr && (
                      <TouchableOpacity
                        style={styles.rowEditBtn}
                        onPress={(e) => {
                          e.stopPropagation();
                          onEditQr(qr);
                        }}
                      >
                        <Pencil size={12} color="#4A6B56" />
                      </TouchableOpacity>
                    )}
                    <ArrowRight size={14} color="#0B3F28" />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 20,
  },
  coolingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 16,
  },
  coolingBannerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    flex: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#072C1C',
    letterSpacing: -0.2,
  },
  recBadge: {
    backgroundColor: '#E4ECE3',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  recBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0B3F28',
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4A6B56',
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
    fontSize: 12,
    color: '#4A6B56',
    textAlign: 'center',
    lineHeight: 18,
  },
  recGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  recCard: {
    width: '48.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#DFE8E0',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  recCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EFF3EE',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  recThumbnail: {
    width: '100%',
    height: '100%',
  },
  recTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardEditPencil: {
    padding: 4,
  },
  readyBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  readyBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#15803D',
  },
  recMerchantName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#072C1C',
    letterSpacing: -0.2,
  },
  recPlatform: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4A6B56',
    marginTop: 2,
  },
  recCardDivider: {
    height: 1,
    backgroundColor: '#DFE8E0',
    marginVertical: 10,
  },
  recFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recSettlement: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0B3F28',
  },
  recActionArrow: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EFF3EE',
    alignItems: 'center',
    justifyContent: 'center',
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
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    gap: 12,
  },
  dynamicRowCooling: {
    backgroundColor: '#FAFBF9',
    borderColor: '#FDE68A',
  },
  dynamicIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EFF3EE',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
    fontSize: 13,
    fontWeight: '800',
    color: '#072C1C',
    maxWidth: 160,
  },
  coolingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  coolingPillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D97706',
  },
  dynamicUpi: {
    fontSize: 10,
    fontWeight: '600',
    color: '#658270',
    marginTop: 2,
  },
  rowRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowEditBtn: {
    padding: 6,
    backgroundColor: '#EFF3EE',
    borderRadius: 8,
  },
  switchWrapper: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
  staticCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    gap: 12,
  },
  staticIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  staticInfoCol: {
    flex: 1,
  },
  staticTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#072C1C',
  },
  staticSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#658270',
    marginTop: 2,
  },
});
