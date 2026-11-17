import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { command, criticalPressure, DOOR_KEYS, filterEvents, lowPressure, runScenario, SCENARIOS, toast } from '../sim/simulator';
import type { AttackType, DoorKey, Gear, LogFilter, ScenarioId, StudioSnapshot } from '../sim/types';
import { colors, MIN_TAP } from '../theme';
import { Metric, SectionHead, SelectField, SliderField, Toggle } from './ui';

export const SECTIONS = [
  { id: 'access', label: 'Access' },
  { id: 'lighting', label: 'Lights' },
  { id: 'drive', label: 'Drive' },
  { id: 'tpms', label: 'Tires' },
  { id: 'adas', label: 'ADAS' },
  { id: 'motion', label: 'Motion' },
  { id: 'ev', label: 'Energy' },
  { id: 'ivi', label: 'IVI' },
  { id: 'cyber', label: 'Cyber' },
  { id: 'scenarios', label: 'Tests' },
  { id: 'diagnostics', label: 'Diag' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

const FILTERS: { id: LogFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'CAN', label: 'CAN' },
  { id: 'SYS', label: 'System' },
  { id: 'WARN', label: 'Warnings' },
  { id: 'SEC', label: 'Security' },
];

export function ControlDeck({
  section,
  snap,
  highlightTire,
  onExportCsv,
  onExportJson,
  onExportTest,
}: {
  section: SectionId;
  snap: StudioSnapshot;
  highlightTire: DoorKey | null;
  onExportCsv: () => void;
  onExportJson: () => void;
  onExportTest: () => void;
}) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {section === 'access' ? <Access snap={snap} /> : null}
      {section === 'lighting' ? <Lighting snap={snap} /> : null}
      {section === 'drive' ? <Drive snap={snap} /> : null}
      {section === 'tpms' ? <Tires snap={snap} highlight={highlightTire} /> : null}
      {section === 'adas' ? <Adas snap={snap} /> : null}
      {section === 'motion' ? <Motion snap={snap} /> : null}
      {section === 'ev' ? <Energy snap={snap} /> : null}
      {section === 'ivi' ? <Ivi snap={snap} /> : null}
      {section === 'cyber' ? <Cyber snap={snap} /> : null}
      {section === 'scenarios' ? <Scenarios snap={snap} onExportTest={onExportTest} /> : null}
      {section === 'diagnostics' ? <Diagnostics snap={snap} onExportCsv={onExportCsv} onExportJson={onExportJson} /> : null}
    </ScrollView>
  );
}

function Access({ snap }: { snap: StudioSnapshot }) {
  const v = snap.vehicle;
  return (
    <View>
      <SectionHead title="Access control" meta="BCM · CENTRAL LOCKING" />
      <View style={styles.row}>
        <Choice label="Lock all" selected={v.locked} onPress={() => command('lock', { locked: true })} />
        <Choice label="Unlock all" selected={!v.locked} onPress={() => command('lock', { locked: false })} />
      </View>
      <View style={styles.miniRow}>
        <Text style={styles.mini}>DOOR ACTUATORS</Text>
        <Text style={styles.miniRight}>{snap.openDoors} / 4 OPEN</Text>
      </View>
      <View style={styles.grid}>
        {DOOR_KEYS.map((key) => (
          <Pressable key={key} style={[styles.door, v.doors[key] && styles.doorOpen]} onPress={() => command('door', { door: key, open: !v.doors[key] })}>
            <Text style={styles.doorName}>{labelDoor(key)}</Text>
            <Text style={[styles.doorState, v.doors[key] && styles.doorStateOpen]}>
              {v.doors[key] ? 'Open · ajar' : v.locked ? 'Locked' : 'Closed'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.trunk} onPress={() => command('trunk', { open: !v.trunk })}>
        <View style={{ flex: 1 }}>
          <Text style={styles.doorName}>Power tailgate</Text>
          <Text style={styles.doorState}>{v.trunk ? 'Open · unlatched' : v.locked ? 'Closed · locked' : 'Closed · latched'}</Text>
        </View>
        <Toggle on={v.trunk} label="Power tailgate" onPress={() => command('trunk', { open: !v.trunk })} />
      </Pressable>
      <View style={styles.rowSpread}>
        <TextButton label="Open all doors" onPress={() => command('doors', { open: true })} />
        <TextButton label="Close all doors" onPress={() => command('doors', { open: false })} />
      </View>
      <Text style={[styles.mini, { marginTop: 18 }]}>DIGITAL KEY & WINDOWS</Text>
      <Pressable style={styles.subtle} onPress={() => command('digitalKey', { authenticated: true })}>
        <Text style={styles.subtleText}>Authenticate digital key</Text>
        <Text style={styles.subtleText}>↗</Text>
      </Pressable>
      <View style={styles.grid}>
        {DOOR_KEYS.map((key) => (
          <Pressable
            key={key}
            style={styles.windowBtn}
            onPress={() => command('window', { window: key, percent: v.windows[key] > 0 ? 0 : 100 })}
          >
            <Text style={styles.windowLabel}>{shortDoor(key)}</Text>
            <Text style={styles.windowValue}>{v.windows[key]}%</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.row}>
        <Outline label="Windows down" onPress={() => DOOR_KEYS.forEach((key) => command('window', { window: key, percent: 0 }))} />
        <Outline label="Windows up" onPress={() => DOOR_KEYS.forEach((key) => command('window', { window: key, percent: 100 }))} />
      </View>
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.doorName}>Windshield wipers</Text>
          <Text style={styles.doorState}>Simulated wipe sweep</Text>
        </View>
        <Toggle on={v.wipers} label="Windshield wipers" onPress={() => command('wipers', { on: !v.wipers })} />
      </View>
    </View>
  );
}

function Lighting({ snap }: { snap: StudioSnapshot }) {
  const v = snap.vehicle;
  return (
    <View>
      <SectionHead title="Exterior lighting" meta="BCM · OUTPUT CONTROL" />
      <LightRow title="Headlights" subtitle="Low beam · front" on={v.headlights} label="Toggle headlights" onPress={() => command('light', { light: 'headlights', on: !v.headlights })} />
      <LightRow title="Taillights" subtitle="Rear running lamps" on={v.taillights} label="Toggle taillights" onPress={() => command('light', { light: 'taillights', on: !v.taillights })} />
      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.doorName}>Brake lamps</Text>
          <Text style={styles.doorState}>Linked to brake pedal</Text>
        </View>
        <Text style={[styles.inlineValue, snap.lights.brake && styles.inlineOn]}>{snap.lights.brake ? 'ON' : 'OFF'}</Text>
      </View>
      <LightRow title="Hazard lights" subtitle="All indicators · flash" on={v.hazards} label="Toggle hazard lights" onPress={() => command('light', { light: 'hazards', on: !v.hazards })} />
      <View style={styles.row}>
        <Choice label="←  LEFT" selected={v.leftSignal || v.hazards} onPress={() => command('light', { light: 'leftSignal', on: !v.leftSignal })} />
        <Choice label="RIGHT  →" selected={v.rightSignal || v.hazards} onPress={() => command('light', { light: 'rightSignal', on: !v.rightSignal })} />
      </View>
    </View>
  );
}

function Drive({ snap }: { snap: StudioSnapshot }) {
  const v = snap.vehicle;
  const gears: Gear[] = ['P', 'R', 'N', 'D'];
  return (
    <View>
      <SectionHead title="Driving inputs" meta="VCU · POWERTRAIN" />
      <View style={styles.gearRow}>
        {gears.map((gear) => (
          <Pressable key={gear} style={[styles.gear, v.gear === gear && styles.gearOn]} onPress={() => command('gear', { gear })}>
            <Text style={[styles.gearText, v.gear === gear && styles.gearTextOn]}>{gear}</Text>
          </Pressable>
        ))}
      </View>
      <SliderField
        label="Vehicle speed"
        valueText={`${formatSpeed(v.speed)} km/h`}
        value={v.speed}
        min={0}
        max={160}
        step={1}
        onChange={(value) => { if (Math.round(value) !== Math.round(v.speed)) command('speed', { kmh: value, log: false }); }}
        onComplete={() => command('speedCommit')}
      />
      <SliderField
        label="Brake pedal pressure"
        valueText={`${Math.round(v.brakePressure)}%`}
        value={v.brakePressure}
        min={0}
        max={100}
        step={1}
        tint={colors.red}
        onChange={(value) => { if (Math.round(value) !== Math.round(v.brakePressure)) command('brake', { pressure: value, log: false }); }}
        onComplete={() => command('brakeCommit')}
      />
      <Pressable style={[styles.pedal, snap.lights.brake && styles.pedalOn]} onPress={() => command('brakeToggle')}>
        <Text style={styles.pedalText}>{snap.lights.brake ? 'RELEASE BRAKES' : 'APPLY BRAKES'}</Text>
        <Text style={styles.pedalSub}>Tap to hold / release</Text>
      </Pressable>
    </View>
  );
}

function Tires({ snap, highlight }: { snap: StudioSnapshot; highlight: DoorKey | null }) {
  const names: Record<DoorKey, string> = { fl: 'Front left', fr: 'Front right', rl: 'Rear left', rr: 'Rear right' };
  return (
    <View>
      <SectionHead title="Tire monitoring" meta="TPMS · PSI" />
      <View style={styles.miniRow}>
        <Text style={styles.doorState}>Target: 35 PSI</Text>
        <Text style={styles.warnText}>Low warning &lt; 29</Text>
      </View>
      {DOOR_KEYS.map((key) => {
        const psi = snap.vehicle.tpms[key];
        const critical = criticalPressure(psi);
        const low = lowPressure(psi);
        return (
          <View key={key} style={[styles.tireCard, low && styles.tireLow, critical && styles.tireCritical, highlight === key && styles.tireHighlight]}>
            <View style={styles.miniRow}>
              <View>
                <Text style={styles.doorName}>{names[key]}</Text>
                <Text style={styles.mini}>{key.toUpperCase()} SENSOR</Text>
              </View>
              <Text style={[styles.psi, critical && styles.psiCritical, low && !critical && styles.psiLow]}>{psi} PSI</Text>
            </View>
            <SliderField
              label={`${names[key]} tire pressure`}
              valueText=""
              value={psi}
              min={18}
              max={52}
              step={1}
              onChange={(value) => { if (Math.round(value) !== psi) command('tpms', { tire: key, psi: value, log: false }); }}
              onComplete={() => command('tpmsCommit', { tire: key })}
            />
          </View>
        );
      })}
      <TextButton label="Restore nominal tire pressures" onPress={() => command('resetTpms')} />
    </View>
  );
}

function Adas({ snap }: { snap: StudioSnapshot }) {
  const a = snap.vehicle.adas;
  const alert =
    a.alert === 'AEB'
      ? 'AUTOMATIC EMERGENCY BRAKING'
      : a.alert === 'FCW'
        ? 'FORWARD COLLISION WARNING'
        : a.alert === 'LANE'
          ? 'LANE DEPARTURE WARNING'
          : a.perception
            ? 'ACTIVE PERCEPTION · NO ALERT'
            : 'PERCEPTION DISABLED';
  return (
    <View>
      <SectionHead title="ADAS & perception" meta="RADAR · CAMERA · AEB" />
      <Text style={[styles.domain, a.alert === 'AEB' && styles.domainAeb, (a.alert === 'FCW' || a.alert === 'LANE') && styles.domainWarn]}>{alert}</Text>
      <View style={styles.grid}>
        <Feature label="Perception" on={a.perception} onPress={() => command('adas', { feature: 'perception', on: !a.perception })} />
        <Feature label="Auto braking" on={a.aeb} onPress={() => command('adas', { feature: 'aeb', on: !a.aeb })} />
        <Feature label="ACC" on={a.acc} onPress={() => command('adas', { feature: 'acc', on: !a.acc })} />
        <Feature label="Lane assist" on={a.lka} onPress={() => command('adas', { feature: 'lka', on: !a.lka })} />
      </View>
      <SelectField
        label="Object ahead"
        value={a.object}
        options={[
          { value: 'none', label: 'No target' },
          { value: 'vehicle', label: 'Lead vehicle' },
          { value: 'pedestrian', label: 'Pedestrian' },
          { value: 'cyclist', label: 'Cyclist' },
        ]}
        onChange={(object) => command('object', { object })}
      />
      <SliderField label="Target distance" valueText={`${a.distance} m`} value={a.distance} min={5} max={100} step={1} onChange={(meters) => { if (Math.round(meters) !== a.distance) command('distance', { meters }); }} />
      <SliderField label="Target speed" valueText={`${a.leadSpeed} km/h`} value={a.leadSpeed} min={0} max={120} step={1} onChange={(kmh) => { if (Math.round(kmh) !== a.leadSpeed) command('leadSpeed', { kmh }); }} />
      <View style={styles.row}>
        <Metric caption="ADAS STATE" value={a.alert === 'CLEAR' ? 'Monitoring' : a.alert} warn={a.alert === 'AEB'} />
        <Metric caption="TIME TO COLLISION" value={a.ttc === null ? '—' : `${a.ttc.toFixed(1)} s`} />
      </View>
      <View style={[styles.row, { marginTop: 10 }]}>
        <Outline label="Block camera" onPress={() => command('fault', { sensor: 'camera' })} />
        <Outline label="Lose radar" onPress={() => command('fault', { sensor: 'radar' })} />
      </View>
      <TextButton label="Restore sensor health ↗" onPress={() => { command('adas', { feature: 'camera', on: true }); command('adas', { feature: 'radar', on: true }); }} />
    </View>
  );
}

function Motion({ snap }: { snap: StudioSnapshot }) {
  const m = snap.vehicle.motion;
  const lane = snap.vehicle.adas.laneOffset;
  return (
    <View>
      <SectionHead title="Motion & path" meta="EPS · ESC · ROAD MODEL" />
      <SliderField
        label="Steering angle"
        valueText={`${m.steering}°`}
        value={m.steering}
        min={-35}
        max={35}
        step={1}
        onChange={(degrees) => { if (Math.round(degrees) !== m.steering) command('steering', { degrees }); }}
      />
      <SliderField
        label="Lane offset"
        valueText={`${lane.toFixed(1)} m`}
        value={lane}
        min={-1.5}
        max={1.5}
        step={0.1}
        onChange={(meters) => {
          const next = Math.round(meters * 10) / 10;
          if (next !== Math.round(lane * 10) / 10) command('laneOffset', { meters: next });
        }}
      />
      <SelectField
        label="Road friction (illustrative)"
        value={m.road}
        options={[
          { value: 'dry', label: 'Dry asphalt' },
          { value: 'wet', label: 'Wet road / rain' },
          { value: 'ice', label: 'Icy low-grip surface' },
        ]}
        onChange={(surface) => command('road', { surface })}
      />
      <View style={[styles.row, { marginTop: 12 }]}>
        <Metric caption="SURFACE" value={m.road.toUpperCase()} />
        <Metric caption="ABS" value={m.abs ? 'ACTIVE' : 'STANDBY'} warn={m.abs} />
        <Metric caption="ESC" value={m.esc ? 'ACTIVE' : 'STANDBY'} warn={m.esc} />
      </View>
    </View>
  );
}

function Energy({ snap }: { snap: StudioSnapshot }) {
  const ev = snap.vehicle.ev;
  const chargeLabel = ev.charging ? 'CHARGING · 11 kW' : ev.plugged ? 'CONNECTED' : 'DISCONNECTED';
  return (
    <View>
      <SectionHead title="EV & thermal" meta="BMS · OBC · HVAC" />
      <SliderField
        label="Battery state of charge"
        valueText={`${Math.round(ev.soc)}%`}
        value={ev.soc}
        min={2}
        max={100}
        step={1}
        onChange={(percent) => { if (Math.round(percent) !== Math.round(ev.soc)) command('soc', { percent }); }}
      />
      <View style={styles.meter}><View style={[styles.meterFill, { width: `${Math.max(0, Math.min(100, ev.soc))}%` }]} /></View>
      <Pressable style={[styles.subtle, ev.charging && styles.chargeOn]} onPress={() => command('charge', { on: !ev.charging })}>
        <Text style={[styles.subtleText, ev.charging && styles.chargeText]}>{ev.charging ? 'Stop charging' : 'Connect & charge'}</Text>
      </Pressable>
      <Text style={styles.caption}>{chargeLabel}</Text>
      <View style={styles.switchRow}>
        <Text style={[styles.doorName, { flex: 1 }]}>Cabin climate control</Text>
        <Toggle on={ev.hvac} label="Cabin climate control" onPress={() => command('hvac', { on: !ev.hvac })} />
      </View>
      <SliderField
        label="Cabin target"
        valueText={`${ev.cabinTemp}°C`}
        value={ev.cabinTemp}
        min={16}
        max={30}
        step={1}
        onChange={(celsius) => { if (Math.round(celsius) !== ev.cabinTemp) command('cabinTemp', { celsius }); }}
      />
    </View>
  );
}

function Ivi({ snap }: { snap: StudioSnapshot }) {
  const info = snap.vehicle.infotainment;
  const [text, setText] = useState('');
  const send = (phrase: string) => {
    command('voice', { text: phrase });
    setText('');
  };
  return (
    <View>
      <SectionHead title="Infotainment" meta="IVI · NAVIGATION · VOICE" />
      <SelectField
        label="Route / destination"
        value={info.destination}
        options={[
          { value: 'None', label: 'No navigation' },
          { value: 'Engineering campus', label: 'Engineering campus' },
          { value: 'Airport', label: 'Airport' },
          { value: 'Charging station', label: 'Charging station' },
        ]}
        onChange={(destination) => command('navigation', { destination })}
      />
      <Text style={styles.caption}>NAVIGATION · {info.destination}</Text>
      <View style={styles.switchRow}>
        <Text style={[styles.doorName, { flex: 1 }]}>Media playback</Text>
        <Toggle on={info.media} label="Media playback" onPress={() => command('media', { on: !info.media })} />
      </View>
      <Text style={styles.fieldLabel}>Simulated in-car voice assistant</Text>
      <View style={styles.voiceRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="e.g. Turn on headlights"
          placeholderTextColor="#9aa6b4"
          style={styles.input}
          onSubmitEditing={() => send(text)}
          returnKeyType="send"
        />
        <Pressable style={styles.send} onPress={() => send(text)}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
      <View style={styles.wrap}>
        <Outline label="Airport route" onPress={() => command('voice', { text: 'Navigate to airport' })} />
        <Outline label="Start climate" onPress={() => command('voice', { text: 'Turn on climate' })} />
        <Outline label="Play music" onPress={() => command('voice', { text: 'Play music' })} />
      </View>
      <Text style={styles.voiceOut}>{info.voiceResult}</Text>
    </View>
  );
}

function Cyber({ snap }: { snap: StudioSnapshot }) {
  const sec = snap.vehicle.security;
  const attacks: { id: AttackType; label: string }[] = [
    { id: 'remote', label: 'Invalid remote unlock' },
    { id: 'replay', label: 'CAN replay' },
    { id: 'flood', label: 'CAN bus flood' },
    { id: 'ota', label: 'Unsigned OTA' },
    { id: 'diagnostic', label: 'UDS access denied' },
  ];
  return (
    <View>
      <SectionHead title="Cybersecurity lab" meta="GATEWAY · IDS · SECURE OTA" />
      <View style={styles.row}>
        <Metric caption="SECURITY POSTURE" value={sec.status} />
        <Metric caption="EVENTS BLOCKED" value={String(sec.blocked)} warn={sec.blocked > 0} />
      </View>
      <View style={styles.switchRow}>
        <Text style={[styles.doorName, { flex: 1 }]}>IDS monitoring</Text>
        <Toggle on={sec.ids} label="IDS monitoring" onPress={() => command('ids', { on: !sec.ids })} />
      </View>
      <Text style={[styles.mini, { marginTop: 8 }]}>SAFE FAULT / ATTACK INJECTION</Text>
      <View style={styles.grid}>
        {attacks.map((attack) => (
          <Pressable key={attack.id} style={[styles.attack, attack.id === 'diagnostic' && styles.attackWide]} onPress={() => command('attack', { type: attack.id })}>
            <Text style={styles.attackText}>{attack.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.lastEvent}>
        <Text style={styles.mini}>LAST EVENT</Text>
        <Text style={styles.doorName}>{sec.lastThreat}</Text>
        <Text style={styles.doorState}>{sec.lastAction}</Text>
      </View>
      <Text style={styles.note}>Simulated and blocked locally. No attack traffic is generated or sent to vehicle hardware.</Text>
    </View>
  );
}

function Scenarios({ snap, onExportTest }: { snap: StudioSnapshot; onExportTest: () => void }) {
  const [selected, setSelected] = useState<ScenarioId>('approach');
  const ui = snap.scenario;
  return (
    <View>
      <SectionHead title="Test scenarios" meta="PREPROGRAMMED EVENTS" />
      <SelectField label="Choose test scenario" value={selected} options={SCENARIOS.map((item) => ({ value: item.id, label: item.label }))} onChange={setSelected} />
      <View style={[styles.row, { marginTop: 10 }]}>
        <Pressable style={[styles.run, ui.running && styles.runDisabled]} disabled={ui.running} onPress={() => void runScenario(selected)}>
          <Text style={styles.runText}>{ui.running ? 'Scenario running…' : 'Run scenario'}</Text>
        </Pressable>
        <Pressable style={styles.reset} onPress={() => { command('reset'); toast('Simulator reset to nominal state'); }}>
          <Text style={styles.resetText}>Reset</Text>
        </Pressable>
      </View>
      <Text style={[styles.verdict, ui.kind === 'running' && styles.verdictRun, ui.kind === 'pass' && styles.verdictPass, ui.kind === 'fail' && styles.verdictFail]}>{ui.verdict}</Text>
      <TextButton label="Export latest test report · JSON" onPress={onExportTest} />
    </View>
  );
}

function Diagnostics({
  snap,
  onExportCsv,
  onExportJson,
}: {
  snap: StudioSnapshot;
  onExportCsv: () => void;
  onExportJson: () => void;
}) {
  const [filter, setFilter] = useState<LogFilter>('all');
  const rows = filterEvents(snap.events, filter);
  return (
    <View>
      <SectionHead title="Network diagnostics" meta="SIMULATED CAN · ILLUSTRATIVE FRAME IDs" />
      <Text style={styles.caption}>{snap.eventCount} {snap.eventCount === 1 ? 'frame' : 'frames'}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {FILTERS.map((item) => (
          <Pressable key={item.id} style={[styles.chip, filter === item.id && styles.chipOn]} onPress={() => setFilter(item.id)}>
            <Text style={[styles.chipText, filter === item.id && styles.chipTextOn]}>{item.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.row}>
        <Outline label="Export CSV" onPress={onExportCsv} />
        <Outline label="JSON" onPress={onExportJson} />
        <Outline label="Clear" onPress={() => command('clearLog')} />
      </View>
      {rows.length === 0 ? (
        <Text style={styles.empty}>No events in this filter. Operate a vehicle control to generate simulated frames.</Text>
      ) : (
        rows.map((event, index) => (
          <View key={`${event.timestamp}-${event.signal}-${index}`} style={styles.logRow}>
            <View style={styles.logTop}>
              <Text style={styles.logTime}>{event.time}</Text>
              <Text style={[styles.bus, busStyle(event.bus)]}>{event.bus}</Text>
              <Text style={styles.logFrame}>{event.frame}</Text>
              <Text style={[styles.status, event.status === 'REJECTED' && styles.statusBad, event.status === 'WARNING' && styles.statusWarn]}>{event.status}</Text>
            </View>
            <Text style={styles.logSignal}>{event.signal}</Text>
            <Text style={styles.logValue}>{event.value}</Text>
          </View>
        ))
      )}
      <Text style={styles.note}>Virtual ECU connected · Illustrative ECU behavior · No physical CAN interface</Text>
    </View>
  );
}

function labelDoor(key: DoorKey) {
  return { fl: 'Front left', fr: 'Front right', rl: 'Rear left', rr: 'Rear right' }[key];
}
function shortDoor(key: DoorKey) {
  return { fl: 'Front L', fr: 'Front R', rl: 'Rear L', rr: 'Rear R' }[key];
}
function formatSpeed(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
function busStyle(bus: string) {
  if (bus === 'SYS') return styles.busSys;
  if (bus === 'WARN') return styles.busWarn;
  if (bus === 'SEC') return styles.busSec;
  return styles.busCan;
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.choice, selected && styles.choiceOn]} onPress={onPress}>
      <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>{label}</Text>
    </Pressable>
  );
}
function Outline({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.outline} onPress={onPress}>
      <Text style={styles.outlineText}>{label}</Text>
    </Pressable>
  );
}
function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.textBtn} onPress={onPress}>
      <Text style={styles.textBtnLabel}>{label}</Text>
    </Pressable>
  );
}
function LightRow({ title, subtitle, on, label, onPress }: { title: string; subtitle: string; on: boolean; label: string; onPress: () => void }) {
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.doorName}>{title}</Text>
        <Text style={styles.doorState}>{subtitle}</Text>
      </View>
      <Toggle on={on} label={label} onPress={onPress} />
    </View>
  );
}
function Feature({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <View style={styles.feature}>
      <Text style={styles.featureText}>{label}</Text>
      <Toggle on={on} label={label} onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 36 },
  row: { flexDirection: 'row', gap: 8 },
  rowSpread: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  choice: { flex: 1, minHeight: MIN_TAP, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  choiceOn: { backgroundColor: colors.ink },
  choiceText: { fontSize: 15, fontWeight: '600', color: colors.ink },
  choiceTextOn: { color: '#fff' },
  miniRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 8 },
  mini: { fontSize: 13, fontWeight: '600', color: colors.muted },
  miniRight: { fontSize: 13, fontWeight: '600', color: colors.faint },
  door: { width: '48%', flexGrow: 1, minHeight: 76, borderRadius: 16, padding: 14, backgroundColor: '#fff' },
  doorOpen: { backgroundColor: colors.pale },
  doorName: { fontSize: 16, fontWeight: '600', color: colors.ink },
  doorState: { marginTop: 4, fontSize: 13, color: colors.muted },
  doorStateOpen: { color: colors.blue, fontWeight: '600' },
  trunk: { marginTop: 10, minHeight: 64, borderRadius: 16, paddingLeft: 14, paddingRight: 4, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff' },
  subtle: { marginTop: 10, minHeight: MIN_TAP, borderRadius: 14, backgroundColor: '#fff', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subtleText: { color: colors.blue, fontWeight: '600', fontSize: 16 },
  windowBtn: { width: '48%', flexGrow: 1, minHeight: MIN_TAP, borderRadius: 14, backgroundColor: '#fff', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  windowLabel: { color: colors.ink, fontWeight: '500', fontSize: 15 },
  windowValue: { color: colors.blue, fontWeight: '600', fontSize: 15 },
  switchRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8 },
  inlineValue: { fontSize: 11, fontWeight: '800', color: '#9ea9b5', backgroundColor: '#f4f6f9', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 4 },
  inlineOn: { backgroundColor: '#ffebed', color: '#d94d58' },
  gearRow: { flexDirection: 'row', backgroundColor: '#E5E5EA', borderRadius: 14, padding: 3, gap: 2 },
  gear: { flex: 1, minHeight: MIN_TAP, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  gearOn: { backgroundColor: '#fff' },
  gearText: { fontWeight: '600', color: colors.muted, fontSize: 17 },
  gearTextOn: { color: colors.ink },
  pedal: { marginTop: 8, minHeight: 52, borderRadius: 10, backgroundColor: '#223247', alignItems: 'center', justifyContent: 'center' },
  pedalOn: { backgroundColor: '#d94755' },
  pedalText: { color: '#fff', fontWeight: '800', letterSpacing: 0.8, fontSize: 13 },
  pedalSub: { color: '#aab8c9', fontSize: 11, marginTop: 2 },
  tireCard: { borderWidth: 1, borderColor: '#edf1f4', backgroundColor: '#fafbfd', borderRadius: 10, padding: 10, marginBottom: 8 },
  tireLow: { borderColor: '#f3d5ba', backgroundColor: '#fff9f2' },
  tireCritical: { borderColor: '#f0bbc0', backgroundColor: '#fff4f4' },
  tireHighlight: { borderColor: '#7daeea', borderWidth: 2 },
  psi: { fontSize: 20, fontWeight: '800', color: colors.ink },
  psiLow: { color: '#d28a26' },
  psiCritical: { color: '#d83b50' },
  warnText: { color: '#d28b4b', fontSize: 12, fontWeight: '700' },
  domain: { padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#d9ede8', backgroundColor: '#effaf6', color: '#258e76', fontWeight: '800', letterSpacing: 0.4, fontSize: 12, marginBottom: 10 },
  domainAeb: { borderColor: '#f4b2b8', backgroundColor: '#fff1f2', color: '#c53444' },
  domainWarn: { borderColor: '#f2dcb7', backgroundColor: '#fff8e9', color: '#ac7619' },
  feature: { width: '48%', flexGrow: 1, minHeight: 56, backgroundColor: '#f9fbfd', borderWidth: 1, borderColor: '#e8edf3', borderRadius: 10, paddingLeft: 12, paddingRight: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  featureText: { fontSize: 13, fontWeight: '800', color: '#516378', flex: 1 },
  meter: { height: 8, backgroundColor: '#eaf0f6', borderRadius: 99, marginTop: 8, overflow: 'hidden' },
  meterFill: { height: '100%', backgroundColor: '#38b89c' },
  chargeOn: { backgroundColor: '#e8faf2', borderColor: '#bceada' },
  chargeText: { color: '#238c72' },
  caption: { marginTop: 8, fontSize: 11, fontWeight: '700', color: '#7e8c9d', letterSpacing: 0.3 },
  fieldLabel: { fontSize: 12, color: '#718297', fontWeight: '700', marginTop: 12, marginBottom: 6 },
  voiceRow: { flexDirection: 'row', gap: 6 },
  input: { flex: 1, minHeight: MIN_TAP, borderWidth: 1, borderColor: '#e1e8f1', borderRadius: 10, paddingHorizontal: 12, color: '#38536b', backgroundColor: '#fff' },
  send: { minHeight: MIN_TAP, minWidth: 64, borderRadius: 10, backgroundColor: '#2d6ac6', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  sendText: { color: '#fff', fontWeight: '800' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  voiceOut: { marginTop: 10, backgroundColor: '#f4f8fd', color: '#48627d', padding: 12, borderRadius: 10, fontSize: 13 },
  attack: { width: '48%', flexGrow: 1, minHeight: 52, borderWidth: 1, borderColor: '#e8e3e4', backgroundColor: '#fffafb', borderRadius: 10, padding: 10, justifyContent: 'center' },
  attackWide: { width: '100%' },
  attackText: { color: '#8b5362', fontWeight: '700', fontSize: 13 },
  lastEvent: { marginTop: 12, borderWidth: 1, borderColor: '#eaeef3', borderRadius: 10, backgroundColor: '#fafbfd', padding: 12, gap: 4 },
  note: { marginTop: 12, fontSize: 12, color: '#96a3b1', lineHeight: 18 },
  run: { flex: 1.4, minHeight: MIN_TAP, borderRadius: 10, backgroundColor: '#276bd2', alignItems: 'center', justifyContent: 'center' },
  runDisabled: { opacity: 0.55 },
  runText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  reset: { flex: 1, minHeight: MIN_TAP, borderRadius: 10, borderWidth: 1, borderColor: '#dfe6ef', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  resetText: { color: '#5f7081', fontWeight: '800' },
  verdict: { marginTop: 10, backgroundColor: '#f4f7fa', color: '#71859b', borderRadius: 10, padding: 12, fontSize: 12, lineHeight: 18 },
  verdictRun: { backgroundColor: '#eff6ff', color: '#3675bc' },
  verdictPass: { backgroundColor: '#eaf9f1', color: '#258c72' },
  verdictFail: { backgroundColor: '#fff1f2', color: '#b24b55' },
  chips: { gap: 8, paddingVertical: 8 },
  chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: '#e3e9f1', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: '#ecf4ff', borderColor: '#c9def7' },
  chipText: { fontSize: 12, fontWeight: '800', color: '#9aa9b9' },
  chipTextOn: { color: '#3377c6' },
  outline: { flexGrow: 1, minHeight: MIN_TAP, borderRadius: 10, borderWidth: 1, borderColor: '#e4ebf3', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  outlineText: { color: '#688096', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  textBtn: { minHeight: MIN_TAP, justifyContent: 'center' },
  textBtnLabel: { color: '#4777af', fontWeight: '800', fontSize: 13 },
  empty: { padding: 20, textAlign: 'center', color: '#abb5c2' },
  logRow: { borderTopWidth: 1, borderTopColor: '#f0f2f6', paddingVertical: 10 },
  logTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logTime: { fontVariant: ['tabular-nums'], color: '#77869a', fontSize: 11 },
  logFrame: { color: '#77869a', fontSize: 11, fontVariant: ['tabular-nums'] },
  logSignal: { marginTop: 4, color: '#35485d', fontWeight: '700', fontSize: 13 },
  logValue: { color: '#52667c', fontWeight: '700', fontSize: 12, marginTop: 2 },
  bus: { fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, overflow: 'hidden' },
  busCan: { backgroundColor: '#eef4fc', color: '#5c82b2' },
  busSys: { backgroundColor: '#f0f2f5', color: '#8795a5' },
  busWarn: { backgroundColor: '#fff1e5', color: '#c28c41' },
  busSec: { backgroundColor: '#f8eef4', color: '#ac5d88' },
  status: { marginLeft: 'auto', fontSize: 10, fontWeight: '800', backgroundColor: '#eff9f4', color: '#32a27c', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, overflow: 'hidden' },
  statusBad: { backgroundColor: '#fff1f0', color: '#d75961' },
  statusWarn: { backgroundColor: '#fff6e7', color: '#ce9446' },
});
