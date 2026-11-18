import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = 'system' | ThemeMode;

export type Palette = {
  mode: ThemeMode;
  statusBar: 'light' | 'dark';
  bg: string;
  card: string;
  ink: string;
  onInk: string;
  muted: string;
  faint: string;
  line: string;
  blue: string;
  blueDeep: string;
  pale: string;
  paleBorder: string;
  red: string;
  green: string;
  greenText: string;
  greenBg: string;
  warn: string;
  warnBg: string;
  chip: string;
  shadow: string;
  track: string;
  toggleOff: string;
  knob: string;
  raised: string;
  stage: string;
  fill: string;
  overlay: string;
  overlayChip: string;
  dot: string;
  scrim: string;
  canvas: number;
  placeholder: string;
};

export const light: Palette = {
  mode: 'light',
  statusBar: 'dark',
  bg: '#F2F2F7',
  card: '#FFFFFF',
  ink: '#1C1C1E',
  onInk: '#FFFFFF',
  muted: '#8E8E93',
  faint: '#AEAEB2',
  line: '#E5E5EA',
  blue: '#007AFF',
  blueDeep: '#007AFF',
  pale: '#EAF3FF',
  paleBorder: '#D6E6FF',
  red: '#FF3B30',
  green: '#34C759',
  greenText: '#248A3D',
  greenBg: '#EAF9EF',
  warn: '#C93400',
  warnBg: '#FFF4E8',
  chip: '#E5E5EA',
  shadow: 'rgba(0, 0, 0, 0.06)',
  track: '#E5EBF2',
  toggleOff: '#E9E9EB',
  knob: '#FFFFFF',
  raised: '#FFFFFF',
  stage: '#ECECEF',
  fill: '#E9E9EE',
  overlay: 'rgba(255,255,255,0.94)',
  overlayChip: 'rgba(255,255,255,0.92)',
  dot: '#D1D1D6',
  scrim: 'rgba(0,0,0,0.35)',
  canvas: 0xf2f5fa,
  placeholder: '#9AA6B4',
};

export const dark: Palette = {
  mode: 'dark',
  statusBar: 'light',
  bg: '#000000',
  card: '#1C1C1E',
  ink: '#FFFFFF',
  onInk: '#000000',
  muted: '#8E8E93',
  faint: '#636366',
  line: '#38383A',
  blue: '#0A84FF',
  blueDeep: '#0A84FF',
  pale: '#0A2F5C',
  paleBorder: '#1F4E86',
  red: '#FF453A',
  green: '#30D158',
  greenText: '#30D158',
  greenBg: '#0C2E18',
  warn: '#FF9F0A',
  warnBg: '#3A2A10',
  chip: '#3A3A3C',
  shadow: 'rgba(0, 0, 0, 0.45)',
  track: '#3A3A3C',
  toggleOff: '#39393D',
  knob: '#FFFFFF',
  raised: '#636366',
  stage: '#1C1C1E',
  fill: '#2C2C2E',
  overlay: 'rgba(44,44,46,0.96)',
  overlayChip: 'rgba(44,44,46,0.92)',
  dot: '#48484A',
  scrim: 'rgba(0,0,0,0.62)',
  canvas: 0x1c1c1e,
  placeholder: '#636366',
};

export function tone(colors: Palette, lightValue: string, darkValue: string) {
  return colors.mode === 'dark' ? darkValue : lightValue;
}

type ThemeValue = {
  colors: Palette;
  preference: ThemePreference;
  cyclePreference: () => void;
};

const ThemeContext = createContext<ThemeValue>({
  colors: light,
  preference: 'system',
  cyclePreference: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [preference, setPreference] = useState<ThemePreference>('system');
  const cyclePreference = useCallback(() => {
    setPreference((current) => {
      const order: ThemePreference[] = ['system', 'dark', 'light'];
      return order[(order.indexOf(current) + 1) % order.length];
    });
  }, []);
  const colors = preference === 'system' ? (system === 'dark' ? dark : light) : preference === 'dark' ? dark : light;
  const value = useMemo(() => ({ colors, preference, cyclePreference }), [colors, preference, cyclePreference]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext).colors;
}

export function useThemePreference() {
  const value = useContext(ThemeContext);
  return { preference: value.preference, cyclePreference: value.cyclePreference };
}

export function useThemedStyles<T>(factory: (colors: Palette) => T): T {
  const colors = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}

export const MIN_TAP = 44;
