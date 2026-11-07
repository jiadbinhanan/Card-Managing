import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  TouchableOpacity,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  LinearTransition,
  FadeInUp,
  FadeOutUp,
} from 'react-native-reanimated';
import { CedarTypography } from '@credics/core';
import {
  ArrowDownLeft,
  CheckCircle2,
  Wallet,
  Receipt,
  ChevronDown,
  ArrowLeftRight,
  Trash2,
  Handshake,
} from 'lucide-react-native';

export interface CashSourceBreakdownItem {
  cardLabel: string;
  amount: number;
}

export interface UnifiedTransactionItem {
  id: string;
  rawId: string;
  type: 'withdrawal' | 'bill_payment' | 'spend';
  amount: number;
  displayDate: string;
  sortDate: number;
  status: string;
  title: string;
  subtitle: string;
  iconName: 'withdrawal' | 'bill_payment' | 'spend' | 'repayment' | 'lent';
  color: string;
  bgColor: string;
  remarks?: string;
  cardId?: string;
  cardDetails: string;
  paymentMethod: string;
  recordedBy: string;
  userId: string;
  avatarUrl?: string;
  isRepaymentFlag?: boolean;
  cashSourceBreakdown?: CashSourceBreakdownItem[];
  isCrossCardCash?: boolean;
}

interface TransactionItemCardProps {
  item: UnifiedTransactionItem;
  isExpanded: boolean;
  onToggle: () => void;
  onTrace?: () => void;
  onDelete?: () => void;
}

export const TransactionItemCard = React.memo(function TransactionItemCard({
  item,
  isExpanded,
  onToggle,
  onTrace,
  onDelete,
}: TransactionItemCardProps) {
  const isNegative =
    item.type === 'withdrawal' || (item.type === 'spend' && !item.isRepaymentFlag);

  const formattedDate = item.displayDate
    ? item.displayDate.split('-').reverse().join('/')
    : '';

  const chevronAnimStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: withSpring(isExpanded ? '180deg' : '0deg', {
          damping: 30,
          stiffness: 240,
        }),
      },
    ],
  }));

  return (
    <Animated.View layout={LinearTransition.springify().damping(28).stiffness(240)}>
      <Pressable
        style={({ pressed }) => [
          styles.txCard,
          isExpanded && styles.txCardExpanded,
          pressed && styles.txCardPressed,
        ]}
        onPress={onToggle}
      >
        <View style={styles.txMainRow}>
          {/* Type Icon Badge */}
          <View style={[styles.txIconBox, { backgroundColor: item.bgColor }]}>
            {item.iconName === 'withdrawal' && (
              <ArrowDownLeft size={16} color={item.color} strokeWidth={2.4} />
            )}
            {item.iconName === 'bill_payment' && (
              <CheckCircle2 size={16} color={item.color} strokeWidth={2.4} />
            )}
            {item.iconName === 'repayment' && (
              <Wallet size={16} color={item.color} strokeWidth={2.4} />
            )}
            {item.iconName === 'spend' && (
              <Receipt size={16} color={item.color} strokeWidth={2.4} />
            )}
            {item.iconName === 'lent' && (
              <Handshake size={16} color={item.color} strokeWidth={2.4} />
            )}
          </View>

          {/* Center Details */}
          <View style={styles.txInfoCol}>
            <View style={styles.txTitleRow}>
              <Text style={styles.txTitle} numberOfLines={1}>
                {item.title}
              </Text>
              {item.isCrossCardCash && (
                <View style={styles.crossCardBadge}>
                  <Text style={styles.crossCardBadgeText}>Cross-Card</Text>
                </View>
              )}
            </View>

            {/* Truncated remarks when collapsed */}
            {item.remarks ? (
              <Text style={styles.txRemarks} numberOfLines={1}>
                &quot;{item.remarks}&quot;
              </Text>
            ) : null}

            {/* Subtitle with User DP / Initials */}
            <View style={styles.userSubtitleRow}>
              {item.avatarUrl ? (
                <Image source={{ uri: item.avatarUrl }} style={styles.userAvatarMini} />
              ) : (
                <View style={styles.userInitialMini}>
                  <Text style={styles.userInitialMiniText}>
                    {item.recordedBy.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text style={styles.txSubtitle} numberOfLines={1}>
                {item.subtitle}
              </Text>
            </View>
          </View>

          {/* Right Amount & Date */}
          <View style={styles.txAmountCol}>
            <Text style={[styles.txAmountText, { color: item.color }]}>
              {isNegative ? '-' : '+'}₹{item.amount.toLocaleString('en-IN')}
            </Text>
            <View style={styles.chevronRow}>
              <Text style={styles.txCardPillText}>
                {item.cardDetails ? item.cardDetails.split(' ')[0] : 'Card'}
              </Text>
              <Animated.View style={chevronAnimStyle}>
                <ChevronDown size={12} color="#4A6B56" />
              </Animated.View>
            </View>
          </View>
        </View>

        {/* Responsive 120Hz Expanded Deep Breakdown */}
        {isExpanded && (
          <Animated.View
            entering={FadeInUp.duration(180)}
            exiting={FadeOutUp.duration(140)}
            style={styles.expandedContent}
          >
          <View style={styles.expandedDivider} />

          <View style={styles.expandedGrid}>
            <View style={styles.expandedGridItem}>
              <Text style={styles.expandedFieldLabel}>Card Used</Text>
              <Text style={styles.expandedFieldValue}>{item.cardDetails}</Text>
            </View>

            <View style={styles.expandedGridItem}>
              <Text style={styles.expandedFieldLabel}>Fund Source</Text>
              <Text style={styles.expandedFieldValue}>{item.paymentMethod}</Text>
            </View>

            <View style={styles.expandedGridItem}>
              <Text style={styles.expandedFieldLabel}>Date</Text>
              <Text style={styles.expandedFieldValue}>{formattedDate}</Text>
            </View>

            <View style={styles.expandedGridItem}>
              <Text style={styles.expandedFieldLabel}>Recorded By</Text>
              <View style={styles.expandedUserRow}>
                {item.avatarUrl ? (
                  <Image source={{ uri: item.avatarUrl }} style={styles.userAvatarSmall} />
                ) : (
                  <View style={styles.userInitialSmall}>
                    <Text style={styles.userInitialSmallText}>
                      {item.recordedBy.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.expandedFieldValue}>{item.recordedBy}</Text>
              </View>
            </View>
          </View>

          {/* Multi-Source Cash Allocation Breakdown */}
          {item.cashSourceBreakdown && item.cashSourceBreakdown.length > 0 && (
            <View style={styles.breakdownBox}>
              <Text style={styles.breakdownTitle}>Cash Source Breakdown</Text>
              {item.cashSourceBreakdown.map((b, bIdx) => (
                <View key={bIdx} style={styles.breakdownRow}>
                  <Text style={styles.breakdownCard} numberOfLines={1}>
                    {b.cardLabel}
                  </Text>
                  <Text style={styles.breakdownAmount}>
                    ₹{b.amount.toLocaleString('en-IN')}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Full Remarks Container */}
          {item.remarks ? (
            <View style={styles.remarksBox}>
              <Text style={styles.expandedFieldLabel}>Remarks & Notes</Text>
              <Text style={styles.remarksText}>{item.remarks}</Text>
            </View>
          ) : null}

          {/* Actions Row: Trace & Optional Delete */}
          <View style={styles.actionRow}>
            {onTrace && (
              <TouchableOpacity
                style={styles.traceBtn}
                onPress={onTrace}
                activeOpacity={0.8}
              >
                <ArrowLeftRight size={13} color="#2D7A5D" strokeWidth={2.4} />
                <Text style={styles.traceBtnText}>View DB Trace Flow</Text>
              </TouchableOpacity>
            )}

            {onDelete && (
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={onDelete}
                activeOpacity={0.8}
              >
                <Trash2 size={13} color="#E05D52" strokeWidth={2.2} />
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            )}
          </View>
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  traceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(45, 122, 93, 0.1)',
    borderRadius: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(45, 122, 93, 0.25)',
  },
  traceBtnText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#2D7A5D',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'rgba(224, 93, 82, 0.1)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(224, 93, 82, 0.25)',
  },
  deleteBtnText: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '700',
    color: '#E05D52',
  },
  txCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  txCardExpanded: {
    borderColor: '#34D399',
    backgroundColor: '#FBFCFA',
    shadowOpacity: 0.08,
    elevation: 4,
  },
  txCardPressed: {
    opacity: 0.92,
  },
  txMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  txIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  txInfoCol: {
    flex: 1,
    marginRight: 8,
  },
  txTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  txTitle: {
    fontSize: 13,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#072C1C',
    flexShrink: 1,
  },
  crossCardBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
  },
  crossCardBadgeText: {
    fontSize: 8,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#D97706',
    textTransform: 'uppercase',
  },
  txRemarks: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: '#4A6B56',
    fontStyle: 'italic',
    marginTop: 1,
  },
  userSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  userAvatarMini: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  userInitialMini: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#072C1C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInitialMiniText: {
    fontSize: 8,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  txSubtitle: {
    fontSize: 10,
    fontFamily: CedarTypography.body,
    color: '#6B8272',
  },
  txAmountCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  txAmountText: {
    fontSize: 14,
    fontFamily: CedarTypography.display,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  chevronRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  txCardPillText: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#4A6B56',
  },
  // Expanded Content
  expandedContent: {
    marginTop: 10,
  },
  expandedDivider: {
    height: 1,
    backgroundColor: 'rgba(7, 44, 28, 0.08)',
    marginBottom: 10,
  },
  expandedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  expandedGridItem: {
    width: '48%',
    backgroundColor: '#F3F7F4',
    padding: 8,
    borderRadius: 10,
  },
  expandedFieldLabel: {
    fontSize: 9,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#4A6B56',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  expandedFieldValue: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '800',
    color: '#072C1C',
    marginTop: 2,
  },
  expandedUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  userAvatarSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  userInitialSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#072C1C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInitialSmallText: {
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  breakdownBox: {
    marginTop: 8,
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.22)',
    borderRadius: 12,
    padding: 10,
  },
  breakdownTitle: {
    fontSize: 10,
    fontFamily: CedarTypography.bodySemiBold,
    color: '#D97706',
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  breakdownCard: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: '#072C1C',
    flex: 1,
  },
  breakdownAmount: {
    fontSize: 11,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: '#D97706',
  },
  remarksBox: {
    marginTop: 8,
    backgroundColor: '#F3F7F4',
    borderRadius: 12,
    padding: 10,
  },
  remarksText: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: '#072C1C',
    marginTop: 3,
    lineHeight: 16,
  },
});
