import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { G, Circle } from 'react-native-svg';
import { CedarColors, CedarTypography } from '@credics/core';

export interface CategorySlice {
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
  slices = [],
}: DonutChartProps) {
  const size = 190;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercentage = 0;

  const validSlices = slices.filter((s) => s.percentage > 0);

  return (
    <View style={styles.container}>
      {/* Donut Chart SVG */}
      <View style={styles.chartWrapper}>
        <Svg width={size} height={size}>
          <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
            {/* Background Track */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={CedarColors.cardAlt}
              strokeWidth={strokeWidth}
              fill="none"
            />

            {validSlices.map((slice, index) => {
              const strokeDashoffset =
                circumference - (circumference * slice.percentage) / 100;
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
          <Text style={styles.centerAmount}>₹{Math.round(totalAmount).toLocaleString('en-IN')}</Text>
          <Text style={styles.centerLabel}>Total Spent</Text>
        </View>
      </View>

      {/* 2-Column Legend Grid */}
      <View style={styles.legendContainer}>
        {validSlices.map((slice, index) => (
          <View key={index} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: slice.color }]} />
            <Text style={styles.legendLabel} numberOfLines={1}>
              {slice.label}
            </Text>
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
    width: '100%',
  },
  chartWrapper: {
    width: 190,
    height: 190,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 8,
  },
  centerTextContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerAmount: {
    fontSize: 20,
    fontFamily: CedarTypography.display,
    fontWeight: '800',
    color: CedarColors.ink900,
  },
  centerLabel: {
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink500,
    marginTop: 2,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 14,
    paddingHorizontal: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    marginBottom: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendLabel: {
    flex: 1,
    fontSize: 11,
    fontFamily: CedarTypography.body,
    color: CedarColors.ink700,
  },
  legendValue: {
    fontSize: 11,
    fontFamily: CedarTypography.bodySemiBold,
    color: CedarColors.ink900,
    fontWeight: '700',
    marginLeft: 4,
  },
});
