import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { G, Circle } from 'react-native-svg';
import { CedarColors } from '@credics/core';

interface CategorySlice {
  label: string;
  percentage: number;
  amount: number;
  color: string;
}

interface DonutChartProps {
  totalAmount: number;
  slices?: CategorySlice[];
}

export function DonutChart({
  totalAmount,
  slices = [
    { label: 'Bills & Dues', percentage: 45, amount: 4500, color: CedarColors.positive },
    { label: 'Shopping', percentage: 25, amount: 2500, color: CedarColors.gold500 },
    { label: 'Lent Given', percentage: 18, amount: 1800, color: CedarColors.clay },
    { label: 'Others', percentage: 12, amount: 1200, color: CedarColors.pine300 },
  ],
}: DonutChartProps) {
  const size = 180;
  const strokeWidth = 24;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercentage = 0;

  return (
    <View style={styles.container}>
      {/* Donut Chart SVG */}
      <View style={styles.chartWrapper}>
        <Svg width={size} height={size}>
          <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
            {slices.map((slice, index) => {
              const strokeDashoffset = circumference - (circumference * slice.percentage) / 100;
              const rotationAngle = (accumulatedPercentage / 100) * 360;
              accumulatedPercentage += slice.percentage;

              return (
                <Circle
                  key={index}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={slice.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="none"
                  transform={`rotate(${rotationAngle} ${size / 2} ${size / 2})`}
                />
              );
            })}
          </G>
        </Svg>

        {/* Center Total Text */}
        <View style={styles.centerTextContainer}>
          <Text style={styles.centerAmount}>₹{totalAmount.toLocaleString()}</Text>
          <Text style={styles.centerLabel}>Total Spent</Text>
        </View>
      </View>

      {/* Legend Grid */}
      <View style={styles.legendContainer}>
        {slices.map((slice, index) => (
          <View key={index} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
            <Text style={styles.legendLabel}>{slice.label}</Text>
            <Text style={styles.legendValue}>{slice.percentage}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 16,
  },
  chartWrapper: {
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerTextContainer: {
    position: 'absolute',
    alignItems: 'center',
  },
  centerAmount: {
    color: CedarColors.bone,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'SpaceGrotesk-Bold',
  },
  centerLabel: {
    color: CedarColors.pine300,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 24,
    marginTop: 24,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    marginBottom: 12,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendLabel: {
    color: CedarColors.bone,
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  legendValue: {
    color: CedarColors.pine300,
    fontSize: 13,
    fontWeight: '700',
  },
});
