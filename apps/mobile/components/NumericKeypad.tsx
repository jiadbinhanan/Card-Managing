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
                  feedbackType="medium"
                >
                  <Delete size={24} color={CedarColors.bone} />
                </HapticButton>
              );
            }

            return (
              <HapticButton
                key={k}
                style={styles.keyBtn}
                onPress={() => onKeyPress(k)}
                feedbackType="light"
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
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 10,
  },
  keyBtn: {
    width: 75,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
  },
  keyText: {
    color: CedarColors.bone,
    fontSize: 26,
    fontWeight: '700',
    fontFamily: 'SpaceGrotesk-Bold',
  },
});
