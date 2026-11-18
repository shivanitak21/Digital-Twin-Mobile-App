import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ControlDeck, SECTIONS, type SectionId } from '../components/controls';
import { TopView } from '../components/TopView';
import { VehicleStage } from '../components/VehicleScene';
import { command, eventsToCsv, getLastTestResult, getSnapshot, stateExportJson, subscribe, toast } from '../sim/simulator';
import type { CameraName } from '../three/createViewer';
import type { DoorKey, StudioSnapshot } from '../sim/types';
import { shareTextFile } from '../shareFile';
import { useThemePreference, useThemedStyles, type Palette } from '../theme';

const CAMERAS: { id: CameraName; label: string }[] = [
  { id: 'iso', label: 'Perspective' },
  { id: 'front', label: 'Front' },
  { id: 'rear', label: 'Rear' },
  { id: 'side', label: 'Side' },
  { id: 'top', label: 'Top' },
  { id: 'adas', label: 'ADAS' },
];

export function StudioScreen() {
  const styles = useStyles();
  const { preference, cyclePreference } = useThemePreference();
  const appearanceLabel = preference === 'system' ? 'Auto' : preference === 'dark' ? 'Dark' : 'Light';
  const snap = useStudio();
  const simRef = useRef(snap);
  simRef.current = snap;
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 600;
  const isLandscape = width > height;
  const phone = width < 768;
  const [mode, setMode] = useState<'3d' | '2d'>('3d');
  const [webglOk, setWebglOk] = useState(true);
  const [loading, setLoading] = useState('Preparing the model');
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<SectionId>('access');
  const [cameraLabel, setCameraLabel] = useState<CameraName>('iso');
  const [highlightTire, setHighlightTire] = useState<DoorKey | null>(null);
  const cameraRequest = useRef<{ name: CameraName; token: number }>({ name: 'iso', token: 0 });
  const handlersRef = useRef({
    onDoor: (_door: DoorKey) => {},
    onTrunk: () => {},
    onTire: (_tire: DoorKey) => {},
    onProgress: (_label: string) => {},
    onFailed: (_message: string) => {},
    onReady: () => {},
  });
  handlersRef.current.onDoor = (door) => {
    command('door', { door, open: !simRef.current.vehicle.doors[door] });
  };
  handlersRef.current.onTrunk = () => {
    command('trunk', { open: !simRef.current.vehicle.trunk });
  };
  handlersRef.current.onTire = (tire) => {
    setMode('2d');
    setSection('tpms');
    setHighlightTire(tire);
  };
  handlersRef.current.onProgress = setLoading;
  handlersRef.current.onFailed = (message) => {
    setWebglOk(false);
    setReady(true);
    setMode('2d');
    setLoading(message);
    toast(`${message}. Top view is still available.`, 'warning');
  };
  handlersRef.current.onReady = () => {
    setReady(true);
    setWebglOk(true);
  };

  useEffect(() => {
    if (!highlightTire) return;
    const id = setTimeout(() => setHighlightTire(null), 1600);
    return () => clearTimeout(id);
  }, [highlightTire]);

  const stageStyle = isTablet ? styles.stageTablet : isLandscape ? styles.stageLandscape : styles.stagePhone;
  const chooseCamera = (name: CameraName) => {
    cameraRequest.current = { name, token: cameraRequest.current.token + 1 };
    setCameraLabel(name);
    if (webglOk) setMode('3d');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Polestar 3</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{snap.healthLabel}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Appearance, ${appearanceLabel}`}
          hitSlop={8}
          onPress={cyclePreference}
          style={styles.themeBtn}
        >
          <Text style={styles.themeText}>{appearanceLabel}</Text>
        </Pressable>
        <View style={styles.live}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>Live</Text>
        </View>
      </View>

      <View style={[styles.body, isTablet && styles.bodyTablet]}>
        <View style={[styles.stage, stageStyle]}>
          <View style={styles.viewport}>
            {webglOk ? (
              <VehicleStage simRef={simRef} cameraRequest={cameraRequest} phone={phone} active={mode === '3d'} handlersRef={handlersRef} />
            ) : null}
            {mode === '2d' || !webglOk ? (
              <View style={styles.topLayer}>
                <TopView
                  snap={snap}
                  onDoor={(door) => handlersRef.current.onDoor(door)}
                  onTrunk={() => handlersRef.current.onTrunk()}
                  onTire={(tire) => handlersRef.current.onTire(tire)}
                />
              </View>
            ) : null}
            {mode === '3d' && !ready ? (
              <View style={styles.loading} pointerEvents="none">
                <Text style={styles.loadingText}>{loading}</Text>
              </View>
            ) : null}
            <View style={styles.layerOverlay}>
              <LayerChip label="Radar" selected={snap.vehicle.overlays.sensors} onPress={() => toggleOverlay('sensors', !snap.vehicle.overlays.sensors)} />
              <LayerChip label="Path" selected={snap.vehicle.overlays.trajectory} onPress={() => toggleOverlay('trajectory', !snap.vehicle.overlays.trajectory)} />
              <LayerChip label="Labels" selected={snap.vehicle.overlays.labels} onPress={() => toggleOverlay('labels', !snap.vehicle.overlays.labels)} />
            </View>
            <View style={styles.instrument} pointerEvents="none">
              <Instrument label="Speed" value={formatSpeed(snap.vehicle.speed)} unit="km/h" />
              <Instrument label="Gear" value={snap.vehicle.gear} />
              <Instrument label="Battery" value={`${Math.round(snap.vehicle.ev.soc)}%`} />
              <Instrument label="Status" value={statusValue(snap)} warn={snap.warnings.length > 0 || snap.vehicle.adas.alert !== 'CLEAR'} />
            </View>
          </View>

          <View style={styles.toolbar}>
            <View style={styles.segment}>
              <Pressable
                style={[styles.segmentItem, mode === '3d' && styles.segmentOn]}
                onPress={() => {
                  if (!webglOk) {
                    setLoading('Preparing the model');
                    setReady(false);
                    setWebglOk(true);
                  }
                  setMode('3d');
                }}
              >
                <Text style={[styles.segmentText, mode === '3d' && styles.segmentTextOn]}>3D</Text>
              </Pressable>
              <Pressable style={[styles.segmentItem, mode === '2d' && styles.segmentOn]} onPress={() => setMode('2d')}>
                <Text style={[styles.segmentText, mode === '2d' && styles.segmentTextOn]}>Top</Text>
              </Pressable>
            </View>
            {mode === '3d' && webglOk ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cameraBar}>
                {CAMERAS.map((camera) => (
                  <Pressable key={camera.id} hitSlop={6} style={styles.cameraBtn} onPress={() => chooseCamera(camera.id)}>
                    <Text style={[styles.cameraText, cameraLabel === camera.id && styles.cameraTextOn]}>{camera.label}</Text>
                  </Pressable>
                ))}
                <Pressable hitSlop={6} style={styles.cameraBtn} onPress={() => chooseCamera('iso')} accessibilityLabel="Reset camera">
                  <Text style={styles.cameraText}>Reset</Text>
                </Pressable>
              </ScrollView>
            ) : (
              <Text style={styles.hint}>Tap a door or a tire</Text>
            )}
          </View>
        </View>

        <View style={[styles.controls, isTablet && styles.controlsTablet, { paddingBottom: insets.bottom }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sectionScroll} contentContainerStyle={styles.sectionBar}>
            {SECTIONS.map((item) => (
              <Pressable key={item.id} hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }} style={[styles.sectionChip, section === item.id && styles.sectionChipOn]} onPress={() => setSection(item.id)}>
                <Text style={[styles.sectionChipText, section === item.id && styles.sectionChipTextOn]}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <ControlDeck
            section={section}
            snap={snap}
            highlightTire={highlightTire}
            bottomInset={insets.bottom}
            onExportCsv={() => void shareExport('gaussmoto_vehicle_bus_log.csv', eventsToCsv(), 'text/csv', 'Export CSV')}
            onExportJson={() => void shareExport('gaussmoto_vehicle_state.json', stateExportJson(), 'application/json', 'Export JSON')}
            onExportTest={() => {
              const report = getLastTestResult();
              if (!report) {
                toast('Run a scenario before exporting a test report', 'warning');
                return;
              }
              void shareExport(`gaussmoto_${report.scenario}_report.json`, JSON.stringify(report, null, 2), 'application/json', 'Export test report');
            }}
          />
        </View>
      </View>
    </View>
  );
}

function useStudio() {
  const [snap, setSnap] = useState<StudioSnapshot>(() => getSnapshot());
  useEffect(() => subscribe(() => setSnap(getSnapshot())), []);
  return snap;
}

async function shareExport(name: string, content: string, mime: string, title: string) {
  try {
    await shareTextFile(name, content, mime, title);
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Could not open the share sheet', 'warning');
  }
}

function toggleOverlay(feature: 'sensors' | 'trajectory' | 'labels', on: boolean) {
  command('overlay', { feature, on });
}

function statusValue(snap: StudioSnapshot) {
  if (snap.vehicle.adas.alert !== 'CLEAR') return snap.vehicle.adas.alert;
  if (snap.warnings.length > 0) return String(snap.warnings.length);
  if (snap.bodyStatus === 'DOOR AJAR') return 'Ajar';
  return 'OK';
}

function formatSpeed(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function Instrument({ label, value, unit, warn = false }: { label: string; value: string; unit?: string; warn?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.instrumentCell}>
      <Text style={styles.instrumentLabel}>{label}</Text>
      <Text style={[styles.instrumentValue, warn && styles.instrumentWarn]} numberOfLines={1}>
        {value}
        {unit ? <Text style={styles.instrumentUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

function LayerChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable hitSlop={8} style={styles.layerChip} onPress={onPress} accessibilityState={{ selected }}>
      <View style={[styles.layerDot, selected && styles.layerDotOn]} />
      <Text style={[styles.layerText, selected && styles.layerTextOn]}>{label}</Text>
    </Pressable>
  );
}

function useStyles() {
  return useThemedStyles(createStyles);
}

function createStyles(colors: Palette) {
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 },
  headerCopy: { flex: 1 },
  title: { fontSize: 28, fontWeight: '700', color: colors.ink, letterSpacing: -0.6 },
  subtitle: { marginTop: 2, fontSize: 14, color: colors.muted, fontWeight: '500' },
  themeBtn: { minHeight: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  themeText: { fontSize: 13, fontWeight: '600', color: colors.ink },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.greenBg, borderRadius: 999, paddingHorizontal: 10, minHeight: 32 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  liveText: { color: colors.greenText, fontSize: 13, fontWeight: '600' },
  body: { flex: 1 },
  bodyTablet: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingBottom: 16 },
  stage: { marginHorizontal: 16, backgroundColor: colors.card, borderRadius: 24, overflow: 'hidden' },
  stagePhone: { flex: 1.45 },
  stageLandscape: { flex: 1.15 },
  stageTablet: { flex: 1.15, marginHorizontal: 0 },
  viewport: { flex: 1, backgroundColor: colors.stage },
  topLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.fill },
  loading: { position: 'absolute', top: 0, right: 0, bottom: 72, left: 0, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  layerOverlay: {
    position: 'absolute',
    top: 10,
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
  },
  instrument: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: 'row',
    backgroundColor: colors.overlay,
    borderRadius: 18,
    paddingVertical: 8,
  },
  instrumentCell: { flex: 1, paddingHorizontal: 8 },
  instrumentLabel: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  instrumentValue: { marginTop: 2, fontSize: 17, fontWeight: '600', color: colors.ink, letterSpacing: -0.3 },
  instrumentWarn: { color: colors.warn },
  instrumentUnit: { fontSize: 11, fontWeight: '600', color: colors.muted },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  segment: { flexDirection: 'row', backgroundColor: colors.fill, borderRadius: 12, padding: 3 },
  segmentItem: { minWidth: 52, minHeight: 36, paddingHorizontal: 12, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentOn: { backgroundColor: colors.raised },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.muted },
  segmentTextOn: { color: colors.ink },
  cameraBar: { alignItems: 'center', gap: 2, paddingRight: 8 },
  cameraBtn: { minHeight: 36, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  cameraText: { fontSize: 14, fontWeight: '500', color: colors.muted },
  cameraTextOn: { color: colors.blue, fontWeight: '600' },
  hint: { flex: 1, textAlign: 'right', color: colors.muted, fontSize: 13 },
  layerChip: { minHeight: 32, paddingHorizontal: 8, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.overlayChip },
  layerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.dot },
  layerDotOn: { backgroundColor: colors.blue },
  layerText: { fontSize: 13, fontWeight: '500', color: colors.muted },
  layerTextOn: { color: colors.ink, fontWeight: '600' },
  controls: { flex: 1, marginTop: 8, backgroundColor: colors.bg },
  controlsTablet: { flex: 0.95, marginTop: 0, borderRadius: 24, overflow: 'hidden' },
  sectionScroll: { flexGrow: 0 },
  sectionBar: { gap: 6, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  sectionChip: { minHeight: 34, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  sectionChipOn: { backgroundColor: colors.ink },
  sectionChipText: { fontSize: 15, fontWeight: '500', color: colors.muted },
  sectionChipTextOn: { color: colors.onInk, fontWeight: '600' },
  });
}
