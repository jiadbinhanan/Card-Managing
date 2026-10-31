import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CedarColors } from '@credics/core';
import { HapticButton } from './HapticButton';
import { Delete } from 'lucide-react-native';

interface NumericKeypadProps {
  onKeyPress: (val: string) => void;
  onBackspace: () => void;
}

export function NumericKeypad({ onKeyPress, onBackspace }: NumericKeypadProps) {
  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', 'back'],
  ];

  return (
    <View style={styles.container}>
      {keys.map((row, rIdx) => (
        <View key={rIdx} style={styles.row}>
          {row.map((k) => {
            if (k === 'back') {
              return (
                <HapticButton
                  key={k}
                  style={styles.keyBtn}
                  onPress={onBackspace}
                  feedbackType="none"
                >
                  <Delete size={22} color={CedarColors.ink900} />
                </HapticButton>
              );
            }

            return (
              <HapticButton
                key={k}
                style={styles.keyBtn}
                onPress={() => onKeyPress(k)}
                feedbackType="none"
              >
                <Text style={styles.keyText}>{k}</Text>
              </HapticButton>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 6,
  },
  keyBtn: {
    width: 78,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
    backgroundColor: CedarColors.card,
    borderWidth: 1,
    borderColor: CedarColors.border,
    shadowColor: '#0F382A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  keyText: {
    color: CedarColors.ink900,
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'SpaceGrotesk-Bold',
  },
});
