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
import { colors, MIN_TAP } from '../theme';

const CAMERAS: { id: CameraName; label: string }[] = [
  { id: 'iso', label: 'Perspective' },
  { id: 'front', label: 'Front' },
  { id: 'rear', label: 'Rear' },
  { id: 'side', label: 'Side' },
  { id: 'top', label: 'Top' },
  { id: 'adas', label: 'ADAS' },
];

export function StudioScreen() {
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
  const [loading, setLoading] = useState('Initializing 3D viewer…');
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
    toast(`${message}. Interactive top view is available.`, 'warning');
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

  const stageHeight = isTablet ? undefined : Math.max(250, Math.min(isLandscape ? height * 0.62 : height * 0.4, 520));
  const chooseCamera = (name: CameraName) => {
    cameraRequest.current = { name, token: cameraRequest.current.token + 1 };
    setCameraLabel(name);
    if (webglOk) setMode('3d');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: isTablet ? insets.bottom : 0 }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>GAUSS MOTO  /  ENGINEERING TOOLS</Text>
          <Text style={styles.title}>Vehicle digital twin</Text>
        </View>
        <View style={styles.simPill}><View style={styles.simDot} /><Text style={styles.simText}>SIMULATION</Text></View>
      </View>
      <View style={[styles.body, isTablet && styles.bodyTablet]}>
        <View style={[styles.stage, isTablet ? styles.stageTablet : { height: stageHeight }]}>
          <View style={styles.stageTop}>
            <View style={styles.identity}>
              <View style={styles.badge}><Text style={styles.badgeText}>P3</Text></View>
              <View>
                <Text style={styles.vehicleName}>Polestar 3</Text>
                <Text style={styles.vehicleSub}>Integrated vehicle systems simulator</Text>
              </View>
            </View>
            <View style={[styles.health, snap.warnings.length > 0 && styles.healthWarn]}>
              <View style={[styles.healthDot, snap.warnings.length > 0 && styles.healthDotWarn]} />
              <Text style={[styles.healthText, snap.warnings.length > 0 && styles.healthTextWarn]} numberOfLines={2}>{snap.healthLabel}</Text>
            </View>
          </View>
          <View style={styles.viewport}>
            {webglOk ? (
              <VehicleStage simRef={simRef} cameraRequest={cameraRequest} phone={phone} active={mode === '3d'} handlersRef={handlersRef} />
            ) : null}
            {mode === '2d' || !webglOk ? (
              <View style={styles.topLayer} pointerEvents="auto">
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
                <Text style={styles.loadingSub}>Offline top-view mode remains available</Text>
              </View>
            ) : null}
            <View style={styles.hud} pointerEvents="none">
              <View style={styles.hudCol}>
                <Text style={[styles.hudPill, adasTone(snap)]}>{adasLabel(snap)}</Text>
                <Text style={styles.hudPill}>{`BATTERY ${Math.round(snap.vehicle.ev.soc)}%`}</Text>
                <Text style={[styles.hudPill, snap.vehicle.security.blocked > 0 && styles.hudWarn]}>
                  {snap.vehicle.security.blocked ? `${snap.vehicle.security.blocked} THREATS BLOCKED` : 'SECURITY · PROTECTED'}
                </Text>
              </View>
              <View style={styles.hudColRight}>
                <Text style={styles.hudPill}>{snap.vehicle.adas.object === 'none' ? 'NO OBJECT' : `${snap.vehicle.adas.object.toUpperCase()} · ${snap.vehicle.adas.distance} m`}</Text>
                <Text style={styles.hudStrong}>{snap.vehicle.adas.ttc === null ? 'TTC —' : `TTC ${snap.vehicle.adas.ttc.toFixed(1)} s`}</Text>
              </View>
            </View>
            {mode === '3d' && webglOk ? (
              <View style={styles.cameraWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cameraBar}>
                  {CAMERAS.map((camera) => (
                    <Pressable key={camera.id} style={[styles.cameraBtn, cameraLabel === camera.id && styles.cameraBtnOn]} onPress={() => chooseCamera(camera.id)}>
                      <Text style={[styles.cameraText, cameraLabel === camera.id && styles.cameraTextOn]}>{camera.label}</Text>
                    </Pressable>
                  ))}
                  <Pressable style={styles.cameraBtn} onPress={() => chooseCamera('iso')} accessibilityLabel="Reset camera">
                    <Text style={styles.cameraText}>Reset</Text>
                  </Pressable>
                </ScrollView>
              </View>
            ) : null}
          </View>
          <View style={styles.layers}>
            <LayerChip label="Radar & targets" selected={snap.vehicle.overlays.sensors} onPress={() => toggleOverlay('sensors', !snap.vehicle.overlays.sensors)} />
            <LayerChip label="Trajectory" selected={snap.vehicle.overlays.trajectory} onPress={() => toggleOverlay('trajectory', !snap.vehicle.overlays.trajectory)} />
            <LayerChip label="Labels" selected={snap.vehicle.overlays.labels} onPress={() => toggleOverlay('labels', !snap.vehicle.overlays.labels)} />
          </View>
          <View style={styles.readouts}>
            <Readout caption="SPEED" value={formatSpeed(snap.vehicle.speed)} unit="km/h" />
            <Readout caption="GEAR" value={snap.vehicle.gear} />
            <Readout caption="BODY" value={snap.bodyStatus} warn={snap.bodyStatus === 'DOOR AJAR'} />
            <Readout caption="WARNINGS" value={String(snap.warnings.length).padStart(2, '0')} warn={snap.warnings.length > 0} />
          </View>
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeBtn, mode === '3d' && styles.modeBtnOn]}
              onPress={() => {
                if (!webglOk) {
                  toast('3D model unavailable. Top view is fully functional.', 'warning');
                  return;
                }
                setMode('3d');
              }}
            >
              <Text style={[styles.modeText, mode === '3d' && styles.modeTextOn]}>3D MODEL</Text>
            </Pressable>
            <Pressable style={[styles.modeBtn, mode === '2d' && styles.modeBtnOn]} onPress={() => setMode('2d')}>
              <Text style={[styles.modeText, mode === '2d' && styles.modeTextOn]}>TOP VIEW</Text>
            </Pressable>
            <Text style={styles.hint} numberOfLines={1}>{mode === '3d' ? 'Drag to rotate · Pinch to zoom' : 'Tap doors or tire readings'}</Text>
          </View>
        </View>
        <View style={[styles.controls, isTablet && styles.controlsTablet, { paddingBottom: isTablet ? 0 : insets.bottom }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sectionBar}>
            {SECTIONS.map((item) => (
              <Pressable key={item.id} style={[styles.sectionChip, section === item.id && styles.sectionChipOn]} onPress={() => setSection(item.id)}>
                <Text style={[styles.sectionChipText, section === item.id && styles.sectionChipTextOn]}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <ControlDeck
            section={section}
            snap={snap}
            highlightTire={highlightTire}
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

function adasLabel(snap: StudioSnapshot) {
  const adas = snap.vehicle.adas;
  if (adas.alert === 'CLEAR') return adas.perception ? 'ADAS · MONITORING' : 'ADAS · OFFLINE';
  return `ADAS · ${adas.alert}`;
}
function adasTone(snap: StudioSnapshot) {
  if (snap.vehicle.adas.alert === 'AEB') return styles.hudDanger;
  if (snap.vehicle.adas.alert === 'FCW' || snap.vehicle.adas.alert === 'LANE') return styles.hudWarn;
  return styles.hudOk;
}
function formatSpeed(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function LayerChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.layerChip, selected && styles.layerChipOn]} onPress={onPress} accessibilityState={{ selected }}>
      <Text style={[styles.layerText, selected && styles.layerTextOn]}>{label}</Text>
    </Pressable>
  );
}
function Readout({ caption, value, unit, warn = false }: { caption: string; value: string; unit?: string; warn?: boolean }) {
  return (
    <View style={styles.readout}>
      <Text style={styles.readoutCaption}>{caption}</Text>
      <Text style={[styles.readoutValue, warn && styles.readoutWarn]}>{value}{unit ? <Text style={styles.unit}> {unit}</Text> : null}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 10 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, color: '#8d9aa8' },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink, letterSpacing: -0.4 },
  simPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#d8eee5', backgroundColor: '#f5fcf9', borderRadius: 8, paddingHorizontal: 10, minHeight: 36 },
  simDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#20bf8e' },
  simText: { color: '#249573', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  body: { flex: 1 },
  bodyTablet: { flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingBottom: 12 },
  stage: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 16, overflow: 'hidden', marginHorizontal: 10 },
  stageTablet: { flex: 1.15, marginHorizontal: 0 },
  stageTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingTop: 12 },
  identity: { flexDirection: 'row', gap: 10, alignItems: 'center', flex: 1 },
  badge: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#151e2c', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontWeight: '800' },
  vehicleName: { fontSize: 16, fontWeight: '800', color: colors.ink },
  vehicleSub: { fontSize: 11, color: '#93a0ad' },
  health: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.greenBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, maxWidth: '46%' },
  healthWarn: { backgroundColor: colors.warnBg },
  healthDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#29b789' },
  healthDotWarn: { backgroundColor: '#e8a42e' },
  healthText: { color: '#28a184', fontSize: 10, fontWeight: '800', flexShrink: 1 },
  healthTextWarn: { color: colors.warn },
  viewport: { flex: 1, minHeight: 180, backgroundColor: '#f3f6fb', marginTop: 8 },
  topLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#f4f7fb' },
  loading: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245,248,252,0.92)', gap: 6 },
  loadingText: { color: '#5f6d7b', fontSize: 13, fontWeight: '700' },
  loadingSub: { color: '#9dabba', fontSize: 11 },
  hud: { position: 'absolute', top: 8, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between' },
  hudCol: { gap: 4, maxWidth: '58%' },
  hudColRight: { alignItems: 'flex-end', gap: 4 },
  hudPill: { backgroundColor: 'rgba(255,255,255,0.92)', borderWidth: 1, borderColor: 'rgba(220,230,240,0.9)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, overflow: 'hidden', fontSize: 10, fontWeight: '800', color: '#607587', letterSpacing: 0.4 },
  hudOk: { color: '#237d7a' },
  hudDanger: { color: '#db4352', backgroundColor: '#fff3f4' },
  hudWarn: { color: '#b57b28', backgroundColor: '#fff9e8' },
  hudStrong: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5, overflow: 'hidden', fontSize: 12, fontWeight: '800', color: '#273c54' },
  cameraWrap: { position: 'absolute', left: 8, right: 8, bottom: 8 },
  cameraBar: { gap: 4, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 12, padding: 4, alignItems: 'center' },
  cameraBtn: { minHeight: MIN_TAP, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cameraBtnOn: { backgroundColor: '#eef4ff' },
  cameraText: { color: '#8a96a6', fontSize: 12, fontWeight: '700' },
  cameraTextOn: { color: '#2769cf', fontWeight: '800' },
  layers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#eaf0f5' },
  layerChip: { minHeight: 36, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e3e9f1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  layerChipOn: { backgroundColor: '#ecf4ff', borderColor: '#c9def7' },
  layerText: { fontSize: 11, fontWeight: '800', color: '#9aa9b9' },
  layerTextOn: { color: '#3377c6' },
  readouts: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#ecf0f4', paddingVertical: 8 },
  readout: { flex: 1, paddingHorizontal: 8 },
  readoutCaption: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, color: '#a0abb6' },
  readoutValue: { marginTop: 2, fontSize: 16, fontWeight: '800', color: colors.ink },
  readoutWarn: { color: '#b27b24' },
  unit: { fontSize: 11, color: '#9aa8b6', fontWeight: '700' },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingBottom: 10 },
  modeBtn: { minHeight: 36, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#f1f4f8', alignItems: 'center', justifyContent: 'center' },
  modeBtnOn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e6ebf1' },
  modeText: { fontSize: 11, fontWeight: '800', color: '#98a5b4', letterSpacing: 0.4 },
  modeTextOn: { color: '#273544' },
  hint: { flex: 1, textAlign: 'right', color: '#9ca9b6', fontSize: 11 },
  controls: { flex: 1, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line },
  controlsTablet: { flex: 0.9, borderWidth: 1, borderColor: colors.line, borderRadius: 16, overflow: 'hidden', borderTopWidth: 1 },
  sectionBar: { gap: 8, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  sectionChip: { minHeight: MIN_TAP, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#f3f6fa', alignItems: 'center', justifyContent: 'center' },
  sectionChipOn: { backgroundColor: '#ebf3ff' },
  sectionChipText: { fontSize: 13, fontWeight: '800', color: '#8d99a8' },
  sectionChipTextOn: { color: '#216ad8' },
});
