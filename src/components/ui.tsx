import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { MIN_TAP, useTheme, useThemedStyles, type Palette } from '../theme';

function useStyles() {
  return useThemedStyles(createStyles);
}

export function SectionHead({ title, meta }: { title: string; meta: string }) {
  const styles = useStyles();
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
  const styles = useStyles();
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
  tint,
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
  const colors = useTheme();
  const styles = useStyles();
  const active = tint ?? colors.blue;
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
        minimumTrackTintColor={active}
        maximumTrackTintColor={colors.track}
        thumbTintColor={active}
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
  const styles = useStyles();
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
  const styles = useStyles();
  return (
    <View style={styles.metric}>
      <Text style={styles.metricCaption}>{caption}</Text>
      <Text style={[styles.metricValue, warn && styles.metricWarn]}>{value}</Text>
    </View>
  );
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
    sectionHead: { marginBottom: 10, gap: 2 },
    sectionTitle: { fontSize: 20, fontWeight: '700', color: colors.ink, letterSpacing: -0.3 },
    sectionMeta: { fontSize: 13, fontWeight: '500', color: colors.muted },
    toggleHit: { minWidth: MIN_TAP, minHeight: MIN_TAP, alignItems: 'center', justifyContent: 'center' },
    toggle: { width: 51, height: 31, borderRadius: 16, backgroundColor: colors.toggleOff, padding: 2 },
    toggleOn: { backgroundColor: colors.green },
    knob: { width: 27, height: 27, borderRadius: 14, backgroundColor: colors.knob, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    knobOn: { transform: [{ translateX: 20 }] },
    sliderBlock: { marginTop: 14 },
    sliderHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    sliderLabel: { fontSize: 16, fontWeight: '500', color: colors.ink },
    sliderValue: { fontSize: 16, fontWeight: '600', color: colors.blue },
    slider: { width: '100%', height: MIN_TAP },
    fieldLabel: { fontSize: 13, color: colors.muted, fontWeight: '600', marginTop: 16, marginBottom: 8 },
    select: {
      minHeight: MIN_TAP,
      borderRadius: 12,
      backgroundColor: colors.card,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    selectText: { fontSize: 16, color: colors.ink, fontWeight: '500', flex: 1 },
    chevron: { color: colors.faint, fontSize: 14, marginLeft: 8 },
    modalBackdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
    modalCard: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 12, paddingBottom: 28 },
    modalTitle: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 8, marginLeft: 8 },
    modalOption: { minHeight: MIN_TAP, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12, backgroundColor: colors.card, marginBottom: 6 },
    modalOptionOn: { backgroundColor: colors.card },
    modalOptionText: { fontSize: 17, color: colors.ink, fontWeight: '500' },
    modalOptionTextOn: { color: colors.blue, fontWeight: '600' },
    metric: { flex: 1, backgroundColor: colors.card, borderRadius: 14, padding: 14, minWidth: 0 },
    metricCaption: { fontSize: 12, fontWeight: '600', color: colors.muted },
    metricValue: { marginTop: 6, fontSize: 17, fontWeight: '600', color: colors.ink },
    metricWarn: { color: colors.red },
  });
}
