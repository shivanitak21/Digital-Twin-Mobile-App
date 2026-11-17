import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { colors, MIN_TAP } from '../theme';

export function SectionHead({ title, meta }: { title: string; meta: string }) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionMeta}>{meta}</Text>
    </View>
  );
}

export function Toggle({
  on,
  label,
  onPress,
}: {
  on: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      hitSlop={8}
      style={styles.toggleHit}
    >
      <View style={[styles.toggle, on && styles.toggleOn]}>
        <View style={[styles.knob, on && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

export function SliderField({
  label,
  valueText,
  value,
  min,
  max,
  step,
  tint = colors.blue,
  onChange,
  onComplete,
}: {
  label: string;
  valueText: string;
  value: number;
  min: number;
  max: number;
  step: number;
  tint?: string;
  onChange: (value: number) => void;
  onComplete?: (value: number) => void;
}) {
  return (
    <View style={styles.sliderBlock}>
      <View style={styles.sliderHead}>
        <Text style={styles.sliderLabel}>{label}</Text>
        <Text style={styles.sliderValue}>{valueText}</Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        minimumTrackTintColor={tint}
        maximumTrackTintColor="#e5ebf2"
        thumbTintColor={tint}
        onValueChange={onChange}
        onSlidingComplete={onComplete}
      />
    </View>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value)?.label ?? value;
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setOpen(true)} style={styles.select}>
        <Text style={styles.selectText}>{current}</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{label}</Text>
            {options.map((option) => (
              <Pressable
                key={option.value}
                style={[styles.modalOption, option.value === value && styles.modalOptionOn]}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <Text style={[styles.modalOptionText, option.value === value && styles.modalOptionTextOn]}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export function Metric({ caption, value, warn = false }: { caption: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricCaption}>{caption}</Text>
      <Text style={[styles.metricValue, warn && styles.metricWarn]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.ink, letterSpacing: -0.2 },
  sectionMeta: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, color: '#a6b0be', flexShrink: 1, textAlign: 'right' },
  toggleHit: { minWidth: MIN_TAP, minHeight: MIN_TAP, alignItems: 'center', justifyContent: 'center' },
  toggle: { width: 44, height: 26, borderRadius: 13, backgroundColor: '#dfe5ed', padding: 3 },
  toggleOn: { backgroundColor: '#3276da' },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
  knobOn: { transform: [{ translateX: 18 }] },
  sliderBlock: { marginTop: 8 },
  sliderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  sliderLabel: { fontSize: 13, fontWeight: '700', color: '#546273' },
  sliderValue: { fontSize: 13, fontWeight: '800', color: '#24364b' },
  slider: { width: '100%', height: MIN_TAP },
  fieldLabel: { fontSize: 12, color: '#718297', fontWeight: '700', marginTop: 12, marginBottom: 6 },
  select: {
    minHeight: MIN_TAP,
    borderWidth: 1,
    borderColor: '#e5ebf2',
    borderRadius: 10,
    backgroundColor: '#fafbfd',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectText: { fontSize: 14, color: '#4e6278', fontWeight: '600', flex: 1 },
  chevron: { color: '#919eaf', fontSize: 14, marginLeft: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(23,32,44,0.35)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 28 },
  modalTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: colors.muted, marginBottom: 8 },
  modalOption: { minHeight: MIN_TAP, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10 },
  modalOptionOn: { backgroundColor: colors.pale },
  modalOptionText: { fontSize: 16, color: colors.ink, fontWeight: '600' },
  modalOptionTextOn: { color: colors.blue, fontWeight: '800' },
  metric: { flex: 1, backgroundColor: '#f7f9fc', borderWidth: 1, borderColor: '#eaf0f6', borderRadius: 10, padding: 10, minWidth: 0 },
  metricCaption: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6, color: '#90a0b0' },
  metricValue: { marginTop: 6, fontSize: 14, fontWeight: '800', color: '#30455e' },
  metricWarn: { color: colors.red },
});
