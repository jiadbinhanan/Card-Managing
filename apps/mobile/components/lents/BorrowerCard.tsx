import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { User, ChevronRight } from 'lucide-react-native';

export interface BorrowerSummary {
  id: string;
  name: string;
  phone?: string | null;
  netDue: number;
  totalGiven: number;
  lastActivity: string;
  rawActivity?: string;
}

interface BorrowerCardProps {
  borrower: BorrowerSummary;
  onPress: () => void;
}

export const BorrowerCard = React.memo(function BorrowerCard({
  borrower,
  onPress,
}: BorrowerCardProps) {
  const hasDue = borrower.netDue > 0;
  const isOwed = borrower.netDue < 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.mainRow}>
        {/* Avatar Circle */}
        <View
          style={[
            styles.avatarBox,
            hasDue
              ? styles.avatarDue
              : isOwed
              ? styles.avatarOwed
              : styles.avatarSettled,
          ]}
        >
          <User
            size={18}
            color={hasDue ? '#E05D52' : isOwed ? '#38BDF8' : '#10B981'}
            strokeWidth={2.4}
          />
        </View>

        {/* Info Column */}
        <View style={styles.infoCol}>
          <Text style={styles.name} numberOfLines={1}>
            {borrower.name}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.phoneText} numberOfLines={1}>
              {borrower.phone || 'No phone'}
            </Text>
            <Text style={styles.dot}>•</Text>
            <Text style={styles.activityText}>Active {borrower.lastActivity}</Text>
          </View>
        </View>

        {/* Amount Column */}
        <View style={styles.amountCol}>
          <Text
            style={[
              styles.amountText,
              hasDue
                ? styles.amountDue
                : isOwed
                ? styles.amountOwed
                : styles.amountSettled,
            ]}
          >
            {hasDue
              ? `₹${borrower.netDue.toLocaleString('en-IN')}`
              : isOwed
              ? `+₹${Math.abs(borrower.netDue).toLocaleString('en-IN')}`
              : 'Settled'}
          </Text>
          <Text style={styles.givenSubText}>
            Total: ₹{borrower.totalGiven.toLocaleString('en-IN')}
          </Text>
        </View>

        <ChevronRight size={15} color="#8CA394" style={{ marginLeft: 6 }} />
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.2,
    borderColor: '#DFE8E0',
    shadowColor: '#072C1C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
    marginBottom: 8,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarDue: {
    backgroundColor: '#FCEBEA',
    borderWidth: 1,
    borderColor: '#F8D7DA',
  },
  avatarOwed: {
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  avatarSettled: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  infoCol: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: '800',
    color: '#072C1C',
    letterSpacing: -0.2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  phoneText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4A6B56',
    maxWidth: 90,
  },
  dot: {
    fontSize: 10,
    color: '#CAD6C9',
  },
  activityText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8CA394',
  },
  amountCol: {
    alignItems: 'flex-end',
  },
  amountText: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  amountDue: {
    color: '#E05D52',
  },
  amountOwed: {
    color: '#0284C7',
  },
  amountSettled: {
    color: '#10B981',
  },
  givenSubText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8CA394',
    marginTop: 2,
  },
});
