import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
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
  settled_to_name?: string;
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

export function SettledHistoryTab({
  transactions,
  loadingMore,
  hasMore,
  onLoadMore,
  refreshing,
  onRefresh,
}: SettledHistoryTabProps) {
  const renderItem = ({ item }: { item: SettledTransaction }) => (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.iconCircle}>
          <CheckCircle2 size={16} color="#10B981" strokeWidth={2.4} />
        </View>

        <View style={styles.infoCol}>
          <Text style={styles.merchantTitle} numberOfLines={1}>
            {item.merchant_name || 'Settled Rotation'}
          </Text>
          <Text style={styles.subText} numberOfLines={1}>
            Settled to {item.settled_to_name || 'User'} • {item.card_name || 'Card'} (**
            {item.last_4_digits || '0000'})
          </Text>
        </View>

        <View style={styles.amountCol}>
          <Text style={styles.amountText}>+₹{Number(item.amount).toLocaleString('en-IN')}</Text>
          <Text style={styles.dateText}>
            {item.settled_date || item.transaction_date}
          </Text>
        </View>
      </View>

      {item.remarks ? (
        <Text style={styles.remarksText} numberOfLines={2}>
          &quot;{item.remarks}&quot;
        </Text>
      ) : null}
    </View>
  );

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
        Completed settlements will appear here chronologically as you settle pending rotations.
      </Text>
    </View>
  );

  return (
    <FlatList
      data={transactions}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      initialNumToRender={10}
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
    gap: 8,
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
  subText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4A6B56',
    marginTop: 2,
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
  remarksText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#4A6B56',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EFF3EE',
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
