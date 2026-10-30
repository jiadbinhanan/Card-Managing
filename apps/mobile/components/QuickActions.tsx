import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CedarColors } from '@credics/core';
import { HapticButton } from './HapticButton';
import { Plus, Send, Repeat, MoreHorizontal } from 'lucide-react-native';

interface QuickActionsProps {
  onAddCard?: () => void;
  onSendLent?: () => void;
  onRotateSettle?: () => void;
  onMore?: () => void;
}

export function QuickActions({
  onAddCard,
  onSendLent,
  onRotateSettle,
  onMore,
}: QuickActionsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.actionItem}>
        <HapticButton
          style={[styles.circleBtn, { backgroundColor: CedarColors.paper }]}
          onPress={onAddCard}
          feedbackType="medium"
        >
          <Plus size={22} color={CedarColors.ink900} />
        </HapticButton>
        <Text style={styles.actionText}>Add Card</Text>
      </View>

      <View style={styles.actionItem}>
        <HapticButton
          style={[styles.circleBtn, { backgroundColor: CedarColors.paper }]}
          onPress={onSendLent}
          feedbackType="medium"
        >
          <Send size={20} color={CedarColors.ink900} />
        </HapticButton>
        <Text style={styles.actionText}>Lend</Text>
      </View>

      <View style={styles.actionItem}>
        <HapticButton
          style={[styles.circleBtn, { backgroundColor: CedarColors.gold500 }]}
          onPress={onRotateSettle}
          feedbackType="heavy"
        >
          <Repeat size={20} color={CedarColors.pine900} />
        </HapticButton>
        <Text style={styles.actionText}>Rotate</Text>
      </View>

      <View style={styles.actionItem}>
        <HapticButton
          style={[styles.circleBtn, { backgroundColor: CedarColors.paper }]}
          onPress={onMore}
          feedbackType="light"
        >
          <MoreHorizontal size={22} color={CedarColors.ink900} />
        </HapticButton>
        <Text style={styles.actionText}>More</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginVertical: 18,
  },
  actionItem: {
    alignItems: 'center',
    flex: 1,
  },
  circleBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  actionText: {
    color: CedarColors.bone,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
});
