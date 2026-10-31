import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CedarColors, CedarTypography } from '@credics/core';
import { HapticButton } from './HapticButton';
import { Plus, ArrowUpRight, ArrowDownLeft, QrCode } from 'lucide-react-native';

interface QuickActionsProps {
  onAddLend?: () => void;
  onSendMoney?: () => void;
  onSendSettle?: () => void;
  onTopUp?: () => void;
  onReceiveTransact?: () => void;
  onScanQR?: () => void;
}

export function QuickActions({
  onAddLend,
  onSendMoney,
  onSendSettle,
  onTopUp,
  onReceiveTransact,
  onScanQR,
}: QuickActionsProps) {
  const handleSend = onSendMoney || onSendSettle;
  const handleReceive = onTopUp || onReceiveTransact;

  return (
    <View style={styles.container}>
      {/* 1. Add / Lend (Mint Green Circle) */}
      <View style={styles.actionItem}>
        <HapticButton
          style={[styles.circleBtn, styles.mintBtn]}
          onPress={onAddLend}
          feedbackType="rigid"
        >
          <Plus size={20} color="#F6F9F5" strokeWidth={2.5} />
        </HapticButton>
        <Text style={styles.actionText}>Add / Lend</Text>
      </View>

      {/* 2. Send / Settle */}
      <View style={styles.actionItem}>
        <HapticButton
          style={[styles.circleBtn, styles.frostedBtn]}
          onPress={handleSend}
          feedbackType="rigid"
        >
          <ArrowUpRight size={20} color="#F6F9F5" strokeWidth={2.2} />
        </HapticButton>
        <Text style={styles.actionText}>Transact</Text>
      </View>

      {/* 3. Settle / Clearance */}
      <View style={styles.actionItem}>
        <HapticButton
          style={[styles.circleBtn, styles.frostedBtn]}
          onPress={handleReceive}
          feedbackType="rigid"
        >
          <ArrowDownLeft size={20} color="#F6F9F5" strokeWidth={2.2} />
        </HapticButton>
        <Text style={styles.actionText}>Settle</Text>
      </View>

      {/* 4. Scan / QR */}
      <View style={styles.actionItem}>
        <HapticButton
          style={[styles.circleBtn, styles.frostedBtn]}
          onPress={onScanQR}
          feedbackType="rigid"
        >
          <QrCode size={20} color="#F6F9F5" strokeWidth={2.2} />
        </HapticButton>
        <Text style={styles.actionText}>Scan QR</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginTop: 20,
    width: '100%',
  },
  actionItem: {
    alignItems: 'center',
    flex: 1,
  },
  circleBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mintBtn: {
    backgroundColor: '#2E944B',
    shadowColor: '#2E944B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  frostedBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  actionText: {
    color: '#CAD6C9',
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    fontWeight: '600',
    marginTop: 6,
    letterSpacing: 0.2,
  },
});
