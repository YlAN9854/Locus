import React from 'react';
import {Pressable, ScrollView, StyleSheet, Text} from 'react-native';
import {Colors} from '@/constants/colors';

export type TimePreset = 'today' | 'week' | 'month' | 'all';

const CHIPS: {key: TimePreset; label: string}[] = [
  {key: 'today', label: '今天'},
  {key: 'week', label: '本周'},
  {key: 'month', label: '本月'},
  {key: 'all', label: '全部'},
];

interface Props {
  active: TimePreset;
  onChange: (preset: TimePreset) => void;
}

export default function TimeChips({active, onChange}: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {CHIPS.map(c => (
        <Pressable
          key={c.key}
          style={({pressed}) => [
            styles.chip,
            active === c.key && styles.chipActive,
            pressed && {opacity: 0.7},
          ]}
          onPress={() => onChange(c.key)}>
          <Text style={[styles.label, active === c.key && styles.labelActive]}>
            {c.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 14,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  chipActive: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  label: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  labelActive: {
    color: Colors.textPrimary,
    fontWeight: '600',
  },
});
