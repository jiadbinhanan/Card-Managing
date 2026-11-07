import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { CheckCircle2, Clock } from 'lucide-react-native';

export interface SettledTransaction {
  id: string;
  amount: number;
  transaction_date: string;
  settled_date?: string;
  merchant_name?: string;
  card_name?: string;
  last_4_digits?: string;
  rotated_by_name?: string;
  rotated_by_avatar?: string;
  settled_to_user?: string;
  settled_to_name?: string;
  settled_to_avatar?: string;
  remarks?: string;
}

interface SettledHistoryTabProps {
  transactions: SettledTransaction[];
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  refreshing: boolean;
  onRefresh: () => void;
}

interface HistorySection {
  title: string;
  data: SettledTransaction[];
}

export function SettledHistoryTab({
  transactions,
  loadingMore,
  hasMore,
  onLoadMore,
  refreshing,
  onRefresh,
}: SettledHistoryTabProps) {
  // Group transactions by calendar day (matching Web en-GB format)
  const sections: HistorySection[] = useMemo(() => {
    const groups: Record<string, SettledTransaction[]> = {};
    const order: string[] = [];

    transactions.forEach((tx) => {
      const rawDate = tx.settled_date || tx.transaction_date;
      const dateObj = new Date(rawDate);
      const dateStr = !isNaN(dateObj.getTime())
        ? dateObj.toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : 'Unknown Date';

      if (!groups[dateStr]) {
        groups[dateStr] = [];
        order.push(dateStr);
      }
      groups[dateStr].push(tx);
    });

    return order.map((title) => ({
      title,
      data: groups[title],
    }));
  }, [transactions]);

  const renderSectionHeader = ({ section: { title } }: { section: HistorySection }) => (
    <View style={styles.sectionHeaderContainer}>
      <View style={styles.datePill}>
        <Text style={styles.datePillText}>{title}</Text>
      </View>
      <View style={styles.headerLine} />
    </View>
  );

  const renderItem = ({ item }: { item: SettledTransaction }) => {
    const receiverName = item.settled_to_name || 'User';
    const receiverInitial = receiverName.charAt(0).toUpperCase();
    const rotatedByName = item.rotated_by_name || 'User';
    const rotatedInitial = rotatedByName.charAt(0).toUpperCase();

    return (
      <View style={styles.card}>
        <View style={styles.topRow}>
          <View style={styles.iconCircle}>
            <CheckCircle2 size={16} color="#10B981" strokeWidth={2.4} />
          </View>

          <View style={styles.infoCol}>
            <Text style={styles.merchantTitle} numberOfLines={1}>
              {item.merchant_name || 'Settled Rotation'}
            </Text>
            <Text style={styles.cardMetaText} numberOfLines={1}>
              {item.card_name || 'Vault Card'} (••{item.last_4_digits || '0000'})
            </Text>
          </View>

          <View style={styles.amountCol}>
            <Text style={styles.amountText}>+₹{Number(item.amount).toLocaleString('en-IN')}</Text>
            <Text style={styles.dateText}>
              {item.settled_date || item.transaction_date}
            </Text>
          </View>
        </View>

        {/* Dual Actor Tags: Rotated By & Settled To */}
        <View style={styles.actorsContainer}>
          {/* Rotated By Actor */}
          <View style={styles.actorChip}>
            <Text style={styles.actorPrefix}>Rotated by</Text>
            {item.rotated_by_avatar ? (
              <Image source={{ uri: item.rotated_by_avatar }} style={styles.receiverAvatar} />
            ) : (
              <View style={[styles.receiverInitialsBox, { backgroundColor: '#1A3828' }]}>
                <Text style={styles.receiverInitialsText}>{rotatedInitial}</Text>
              </View>
            )}
            <Text style={styles.actorName} numberOfLines={1}>
              {rotatedByName}
            </Text>
          </View>

          {/* Settled / Received By Actor */}
          <View style={styles.actorChip}>
            <Text style={styles.actorPrefix}>Settled to</Text>
            {item.settled_to_avatar ? (
              <Image source={{ uri: item.settled_to_avatar }} style={styles.receiverAvatar} />
            ) : (
              <View style={styles.receiverInitialsBox}>
                <Text style={styles.receiverInitialsText}>{receiverInitial}</Text>
              </View>
            )}
            <Text style={styles.actorName} numberOfLines={1}>
              {receiverName}
            </Text>
          </View>
        </View>

        {item.remarks ? (
          <View style={styles.remarksBubble}>
            <Text style={styles.remarksText} numberOfLines={2}>
              &quot;{item.remarks}&quot;
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color="#0B3F28" />
          <Text style={styles.footerLoaderText}>Loading more records...</Text>
        </View>
      );
    }
    if (!hasMore && transactions.length > 0) {
      return (
        <View style={styles.footerEnd}>
          <Text style={styles.footerEndText}>• End of Settled History •</Text>
        </View>
      );
    }
    return null;
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconCircle}>
        <Clock size={36} color="#4A6B56" />
      </View>
      <Text style={styles.emptyTitle}>No Settled Records Found</Text>
      <Text style={styles.emptySub}>
        Completed settlements will appear here chronologically grouped by date as you settle pending rotations.
      </Text>
    </View>
  );

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      windowSize={7}
      removeClippedSubviews
      onEndReached={onLoadMore}
      onEndReachedThreshold={0.4}
      ListFooterComponent={renderFooter}
      ListEmptyComponent={renderEmpty}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#0B3F28']}
          tintColor="#0B3F28"
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 40,
  },
  sectionHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    gap: 8,
  },
  datePill: {
    backgroundColor: '#072C1C',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  datePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#DFE8E0',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1,
    marginBottom: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EFF3EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCol: {
    flex: 1,
  },
  merchantTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#072C1C',
  },
  cardMetaText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4A6B56',
    marginTop: 2,
  },
  actorsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EFF3EE',
    flexWrap: 'wrap',
  },
  actorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F7FAF7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2EBE2',
    flexShrink: 1,
  },
  actorPrefix: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#718E7B',
    textTransform: 'uppercase',
  },
  actorName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#072C1C',
    maxWidth: 90,
  },
  receiverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  receiverAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  receiverInitialsBox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#0C2B20',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  receiverInitialsText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#10B981',
  },
  subText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4A6B56',
  },
  amountCol: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#10B981',
  },
  dateText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8CA394',
    marginTop: 2,
  },
  remarksBubble: {
    backgroundColor: '#F4F7F4',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E2EBE2',
  },
  remarksText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#4A6B56',
  },
  footerLoader: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  footerLoaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4A6B56',
  },
  footerEnd: {
    paddingVertical: 22,
    alignItems: 'center',
  },
  footerEndText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8CA394',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#E4ECE3',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#072C1C',
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4A6B56',
    textAlign: 'center',
    lineHeight: 18,
  },
});
