import { createDomains, type DomainApi } from './domains';
import type {
  BodyState,
  DoorKey,
  EffectiveLights,
  Gear,
  LogFilter,
  ScenarioId,
  ScenarioUi,
  SimEvent,
  SimNotice,
  StudioSnapshot,
  TestResult,
  ToastKind,
  VehicleSnapshot,
} from './types';

export const DOORS: Record<DoorKey, string> = {
  fl: 'Front left',
  fr: 'Front right',
  rl: 'Rear left',
  rr: 'Rear right',
};
export const DOOR_KEYS: DoorKey[] = ['fl', 'fr', 'rl', 'rr'];
export const NOMINAL_TPMS: Record<DoorKey, number> = { fl: 35, fr: 36, rl: 35, rr: 36 };

export const SCENARIOS: { id: ScenarioId; label: string }[] = [
  { id: 'approach', label: 'Approach, unlock & entry' },
  { id: 'drive', label: 'Drive & braking cycle' },
  { id: 'tpms', label: 'Low tire pressure fault' },
  { id: 'emergency', label: 'Emergency stop & hazards' },
  { id: 'park', label: 'Park, exit & lock' },
  { id: 'aeb', label: 'ADAS — emergency braking' },
  { id: 'lane', label: 'ADAS — lane departure & assist' },
  { id: 'acc', label: 'Adaptive cruise — slow lead vehicle' },
  { id: 'wet', label: 'Wet road — braking / ABS' },
  { id: 'charge', label: 'EV — charging session' },
  { id: 'security', label: 'Cyber — attack detection / blocking' },
  { id: 'sensorfault', label: 'ADAS — camera fault fallback' },
  { id: 'voice', label: 'IVI — voice and navigation' },
  { id: 'digital', label: 'Digital key, window & entry' },
  { id: 'integrated', label: 'Full vehicle integrated demo' },
];

const MAX_EVENTS = 600;
const deepCopy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const initialState = (): BodyState => ({
  locked: false,
  doors: { fl: false, fr: false, rl: false, rr: false },
  trunk: false,
  headlights: false,
  taillights: false,
  brakePressure: 0,
  leftSignal: false,
  rightSignal: false,
  hazards: false,
  gear: 'P',
  speed: 0,
  tpms: { ...NOMINAL_TPMS },
});

export const lowPressure = (p: number) => p < 29 || p > 45;
export const criticalPressure = (p: number) => p < 24 || p > 49;

let state = initialState();
let blinkPhase = true;
let scenarioToken = 0;
let scenarioRunning = false;
let lastTestResult: TestResult | null = null;
let scenarioUi: ScenarioUi = {
  running: false,
  verdict: 'Select a scenario to run an automated sequence.',
  kind: 'idle',
};
const events: SimEvent[] = [];
const subscribers = new Set<(notice: SimNotice) => void>();
let lastSpeedLog = 0;

type TimerGlobal = { __gmSimBooted?: boolean; __gmLoops?: ReturnType<typeof setInterval>[] };
const timerGlobal = globalThis as TimerGlobal;

function merged(): VehicleSnapshot {
  return { ...deepCopy(state), ...domains.getState() };
}

function notifySubscribers(notice: SimNotice) {
  for (const fn of subscribers) {
    try {
      fn(notice);
    } catch (error) {
      console.warn(error);
    }
  }
}

function showToast(message: string, kind: ToastKind = 'info') {
  notifySubscribers({ type: 'toast', message, kind });
}

export function effectiveLights(): EffectiveLights {
  return {
    headlights: state.headlights,
    taillights: state.taillights || state.headlights,
    brake: state.brakePressure > 5,
    reverse: state.gear === 'R',
    left: state.hazards || state.leftSignal,
    right: state.hazards || state.rightSignal,
  };
}

function warningList() {
  const warnings: string[] = [];
  DOOR_KEYS.forEach((k) => {
    if (state.doors[k]) warnings.push(`${DOORS[k]} door ajar`);
  });
  if (state.trunk) warnings.push('Power tailgate open');
  DOOR_KEYS.forEach((k) => {
    if (lowPressure(state.tpms[k])) warnings.push(`${k.toUpperCase()} tire ${state.tpms[k]} PSI`);
  });
  if (state.locked && (Object.values(state.doors).some(Boolean) || state.trunk)) warnings.push('Central locking incomplete');
  warnings.push(...domains.warningList());
  return warnings;
}

function frameBytes(frame: string) {
  const doorBits = DOOR_KEYS.reduce((b, k, i) => b | (state.doors[k] ? 1 << i : 0), state.trunk ? 16 : 0);
  const l = effectiveLights();
  const lighting = [l.headlights, l.taillights, l.brake, l.reverse, l.left, l.right, state.hazards].reduce(
    (a, x, i) => a | (x ? 1 << i : 0),
    0,
  );
  const tire = DOOR_KEYS.map((k) => Math.round(state.tpms[k]));
  const d = domains.getState();
  const frames: Record<string, number[]> = {
    '0x310': [doorBits, 0, 0, 0, 0, 0, 0, 0],
    '0x311': [state.locked ? 1 : 0, doorBits, 0, 0, 0, 0, 0, 0],
    '0x320': [lighting, 0, 0, 0, 0, 0, 0, 0],
    '0x180': [Math.round(state.brakePressure), Math.round(state.speed), 0, 0, 0, 0, 0, 0],
    '0x101': [Math.round(state.speed), Math.round(state.speed * 10) % 256, 0, 0, 0, 0, 0, 0],
    '0x100': [['P', 'R', 'N', 'D'].indexOf(state.gear), 0, 0, 0, 0, 0, 0, 0],
    '0x350': [...tire, 0, 0, 0, 0],
    '0x312': [...Object.values(d.windows), 0, 0, 0, 0],
    '0x420': [d.adas.perception ? 1 : 0, d.adas.aeb ? 1 : 0, d.adas.acc ? 1 : 0, d.adas.lka ? 1 : 0, d.adas.camera ? 1 : 0, d.adas.radar ? 1 : 0, 0, 0],
    '0x421': [['none', 'vehicle', 'pedestrian', 'cyclist'].indexOf(d.adas.object), d.adas.distance, d.adas.leadSpeed, 0, 0, 0, 0, 0],
    '0x425': [['CLEAR', 'FCW', 'AEB', 'LANE'].indexOf(d.adas.alert), Math.max(0, Math.round((d.adas.ttc || 0) * 10)), 0, 0, 0, 0, 0, 0],
    '0x190': [Math.round((d.motion.steering || 0) + 35), 0, 0, 0, 0, 0, 0, 0],
    '0x550': [Math.round(d.ev.soc || 0), 0, 0, 0, 0, 0, 0, 0],
    '0x552': [d.ev.plugged ? 1 : 0, d.ev.charging ? 1 : 0, 0, 0, 0, 0, 0, 0],
    '0x560': [d.ev.hvac ? 1 : 0, d.ev.cabinTemp || 22, 0, 0, 0, 0, 0, 0],
    '0x6E0': [d.security.blocked || 0, d.security.ids ? 1 : 0, 0, 0, 0, 0, 0, 0],
  };
  return (frames[frame] || [0, 0, 0, 0, 0, 0, 0, 0]).map((n) => n.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function publish(bus: string, frame: string, signal: string, value: string | number, status = 'OK', quiet = false) {
  const event: SimEvent = {
    time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    timestamp: new Date().toISOString(),
    bus,
    frame: frame || '—',
    signal,
    value: String(value),
    status,
    data: frame && frame !== '—' ? frameBytes(frame) : '—',
  };
  events.unshift(event);
  if (events.length > MAX_EVENTS) events.pop();
  if (!quiet) notifySubscribers({ type: 'event', event: deepCopy(event), state: merged() });
}

function rejected(signal: string, message: string, frame = '0x310') {
  publish('WARN', frame, signal, message, 'REJECTED');
  showToast(message, 'warning');
  return false;
}

function notifyState() {
  notifySubscribers({ type: 'state', state: merged() });
}

function setLocked(locked: boolean) {
  locked = !!locked;
  if (locked === state.locked) return true;
  if (locked && (Object.values(state.doors).some(Boolean) || state.trunk)) {
    return rejected('BCM.CentralLock', 'Close all doors and tailgate before locking.', '0x311');
  }
  state.locked = locked;
  publish('CAN', '0x311', 'BCM.CentralLock', locked ? 'LOCKED' : 'UNLOCKED');
  notifyState();
  return true;
}

function setDoor(key: string, open: boolean) {
  if (!(key in DOORS)) return false;
  const door = key as DoorKey;
  open = !!open;
  if (state.doors[door] === open) return true;
  if (open && state.locked) return rejected(`BCM.Door.${door.toUpperCase()}`, 'Unlock the vehicle before opening a door.');
  if (open && (state.speed > 2 || !['P', 'N'].includes(state.gear))) {
    return rejected(`BCM.Door.${door.toUpperCase()}`, 'Door opening inhibited while the vehicle is in motion or in drive.');
  }
  state.doors[door] = open;
  publish('CAN', '0x310', `BCM.Door.${door.toUpperCase()}`, open ? 'OPEN' : 'CLOSED');
  notifyState();
  return true;
}

function setTrunk(open: boolean) {
  open = !!open;
  if (state.trunk === open) return true;
  if (open && state.locked) return rejected('BCM.Tailgate', 'Unlock the vehicle before opening the tailgate.');
  if (open && (state.speed > 2 || !['P', 'N'].includes(state.gear))) {
    return rejected('BCM.Tailgate', 'Tailgate opening inhibited in drive or while moving.');
  }
  state.trunk = open;
  publish('CAN', '0x310', 'BCM.Tailgate', open ? 'OPEN' : 'CLOSED');
  notifyState();
  return true;
}

function setLight(which: string, on: boolean) {
  on = !!on;
  if (which === 'hazards') {
    state.hazards = on;
    if (on) {
      state.leftSignal = false;
      state.rightSignal = false;
    }
    publish('CAN', '0x320', 'BCM.HazardWarning', on ? 'ON' : 'OFF');
  } else if (which === 'headlights' || which === 'taillights') {
    state[which] = on;
    publish('CAN', '0x320', `BCM.${which}`, on ? 'ON' : 'OFF');
  } else if (which === 'leftSignal' || which === 'rightSignal') {
    state.hazards = false;
    state[which] = on;
    if (on) state[which === 'leftSignal' ? 'rightSignal' : 'leftSignal'] = false;
    publish('CAN', '0x320', `BCM.${which}`, on ? 'ON' : 'OFF');
  } else return false;
  notifyState();
  return true;
}

function setGear(gear: string) {
  if (gear !== 'P' && gear !== 'R' && gear !== 'N' && gear !== 'D') return false;
  if (gear === state.gear) return true;
  if (state.speed > 5) return rejected('VCU.GearSelector', 'Shift rejected — reduce speed below 5 km/h.', '0x100');
  if (['D', 'R'].includes(gear) && (Object.values(state.doors).some(Boolean) || state.trunk)) {
    return rejected('VCU.GearSelector', 'Close all doors and tailgate before selecting drive or reverse.', '0x100');
  }
  if (['D', 'R'].includes(gear) && domains.getState().ev.plugged) {
    return rejected('VCU.GearSelector', 'Disconnect charging before selecting drive.', '0x100');
  }
  state.gear = gear as Gear;
  if (gear === 'P') state.speed = 0;
  publish('CAN', '0x100', 'VCU.GearPosition', gear);
  notifyState();
  return true;
}

function setSpeed(value: number, log = true) {
  value = Math.max(0, Math.min(160, Math.round(Number(value) || 0)));
  if (value > 0 && (Object.values(state.doors).some(Boolean) || state.trunk)) {
    return rejected('VCU.Speed', 'Close open doors and tailgate before driving.', '0x101');
  }
  if (value > 0 && domains.getState().ev.plugged) {
    return rejected('VCU.Speed', 'Cannot drive while charging cable is connected.', '0x101');
  }
  if (value > 0 && state.gear === 'P') {
    state.gear = 'D';
    publish('CAN', '0x100', 'VCU.GearPosition', 'D (auto-selected)');
  }
  if (value > 40 && state.gear === 'R') return rejected('VCU.Speed', 'Reverse simulation capped at 40 km/h.', '0x101');
  if (value === state.speed) {
    notifyState();
    return true;
  }
  state.speed = value;
  if (log) publish('CAN', '0x101', 'VCU.VehicleSpeed', `${value} km/h`);
  notifyState();
  return true;
}

function setBrake(pressure: number, log = true) {
  pressure = Math.max(0, Math.min(100, Math.round(Number(pressure) || 0)));
  const old = state.brakePressure;
  state.brakePressure = pressure;
  if (log && old !== pressure) publish('CAN', '0x180', 'ESP.BrakePedal', `${pressure}%`);
  notifyState();
  return true;
}

function setTirePressure(key: string, pressure: number, log = true) {
  if (!(key in DOORS)) return false;
  const tire = key as DoorKey;
  pressure = Math.max(18, Math.min(52, Math.round(Number(pressure) || 0)));
  if (state.tpms[tire] === pressure) {
    notifyState();
    return true;
  }
  state.tpms[tire] = pressure;
  if (log) {
    publish('CAN', '0x350', `TPMS.${tire.toUpperCase()}.Pressure`, `${pressure} PSI`, lowPressure(pressure) ? 'WARNING' : 'OK');
    if (lowPressure(pressure)) {
      publish('WARN', '0x350', `TPMS.${tire.toUpperCase()}.Alert`, criticalPressure(pressure) ? 'CRITICAL' : 'LOW / HIGH', 'WARNING');
      showToast(`${DOORS[tire]} tire pressure out of range: ${pressure} PSI`, 'warning');
    }
  }
  notifyState();
  return true;
}

function setAllDoors(open: boolean) {
  if (open && (state.locked || state.speed > 2 || !['P', 'N'].includes(state.gear))) {
    return rejected('BCM.DoorGroup', 'Cannot open doors: unlock and park the vehicle first.');
  }
  let changed = false;
  for (const k of DOOR_KEYS) {
    if (state.doors[k] !== !!open) {
      state.doors[k] = !!open;
      changed = true;
    }
  }
  if (changed) {
    publish('CAN', '0x310', 'BCM.AllDoors', open ? 'OPEN' : 'CLOSED');
    notifyState();
  }
  return true;
}

function stopScenario() {
  scenarioToken++;
  scenarioRunning = false;
  scenarioUi = { ...scenarioUi, running: false };
}

function resetAll(log = true) {
  stopScenario();
  state = initialState();
  domains.reset();
  if (log) publish('SYS', '—', 'SIM.Reset', 'Vehicle state restored to defaults');
  notifyState();
  return true;
}

function sleep(ms: number, token: number) {
  return new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(token === scenarioToken), ms);
  });
}

function setVerdict(verdict: string, kind: ScenarioUi['kind'], running = scenarioRunning) {
  scenarioUi = { running, verdict, kind };
  notifyState();
}

async function runScenario(requestedName?: string, options?: { delayScale?: number }) {
  if (scenarioRunning) return;
  stopScenario();
  scenarioRunning = true;
  const token = scenarioToken;
  const delayScale = options?.delayScale ?? 1;
  const name = requestedName || 'approach';
  const startedAt = new Date().toISOString();
  lastTestResult = null;
  setVerdict('Executing scenario sequence…', 'running', true);
  state = initialState();
  domains.reset();
  notifyState();
  publish('SYS', '—', 'TEST.StartScenario', name.toUpperCase());

  const steps: Record<string, [() => void, number][]> = {
    approach: [
      [() => { setGear('P'); setSpeed(0); setAllDoors(false); setTrunk(false); setLocked(false); }, 600],
      [() => setLight('taillights', true), 700],
      [() => setDoor('fl', true), 1100],
      [() => setDoor('fl', false), 900],
      [() => { setLight('taillights', false); setLocked(true); }, 300],
    ],
    drive: [
      [() => { setLocked(false); setAllDoors(false); setTrunk(false); setGear('D'); }, 650],
      [() => { setLight('headlights', true); setSpeed(36); }, 1100],
      [() => setSpeed(72), 850],
      [() => setBrake(65), 1500],
      [() => setBrake(0), 550],
      [() => { setSpeed(0); setGear('P'); setLight('headlights', false); }, 350],
    ],
    tpms: [
      [() => setTirePressure('rl', 33), 700],
      [() => setTirePressure('rl', 27), 850],
      [() => setTirePressure('rl', 22), 1400],
    ],
    emergency: [
      [() => { setLocked(false); setAllDoors(false); setTrunk(false); setGear('D'); setSpeed(90); }, 800],
      [() => { setLight('hazards', true); setBrake(100); }, 1400],
      [() => { setSpeed(0); setGear('P'); }, 900],
      [() => setBrake(0), 300],
    ],
    park: [
      [() => { setBrake(0); setSpeed(0); setGear('P'); setLocked(false); }, 650],
      [() => setDoor('fl', true), 1100],
      [() => setTrunk(true), 900],
      [() => setTrunk(false), 700],
      [() => setDoor('fl', false), 850],
      [() => { setLight('headlights', false); setLight('taillights', false); setLocked(true); }, 300],
    ],
    aeb: [
      [() => { setGear('D'); setSpeed(95); domains.command('object', { object: 'vehicle', distance: 55, leadSpeed: 12 }); }, 850],
      [() => domains.command('distance', { meters: 36 }), 650],
      [() => domains.command('distance', { meters: 19 }), 1400],
      [() => { setSpeed(0); setGear('P'); setBrake(0); }, 700],
    ],
    lane: [
      [() => { setGear('D'); setSpeed(70); domains.command('adas', { feature: 'lka', on: true }); }, 650],
      [() => domains.command('laneOffset', { meters: 1.0 }), 1400],
      [() => domains.command('laneOffset', { meters: 0 }), 750],
      [() => { domains.command('steering', { degrees: 0 }); setSpeed(0); setGear('P'); }, 500],
    ],
    acc: [
      [() => { setGear('D'); setSpeed(82); domains.command('adas', { feature: 'acc', on: true }); }, 450],
      [() => domains.command('object', { object: 'vehicle', distance: 21, leadSpeed: 38 }), 1900],
      [() => { domains.command('object', { object: 'none' }); setSpeed(0); setGear('P'); }, 600],
    ],
    wet: [
      [() => { domains.command('road', { surface: 'wet' }); setGear('D'); setSpeed(72); }, 800],
      [() => { domains.command('steering', { degrees: 25 }); setBrake(85); }, 1650],
      [() => { setSpeed(0); setGear('P'); setBrake(0); domains.command('steering', { degrees: 0 }); }, 500],
    ],
    charge: [
      [() => domains.command('soc', { percent: 24 }), 500],
      [() => domains.command('charge', { on: true }), 2500],
      [() => domains.command('charge', { on: false }), 500],
    ],
    security: [
      [() => domains.command('attack', { type: 'remote' }), 650],
      [() => domains.command('attack', { type: 'replay' }), 650],
      [() => domains.command('attack', { type: 'ota' }), 900],
      [() => domains.command('attack', { type: 'diagnostic' }), 500],
    ],
    sensorfault: [
      [() => { setGear('D'); setSpeed(70); domains.command('object', { object: 'vehicle', distance: 42, leadSpeed: 30 }); }, 700],
      [() => domains.command('fault', { sensor: 'camera' }), 1200],
      [() => domains.command('fault', { sensor: 'radar' }), 950],
      [() => { domains.command('adas', { feature: 'camera', on: true }); domains.command('adas', { feature: 'radar', on: true }); setSpeed(0); setGear('P'); }, 650],
    ],
    voice: [
      [() => domains.command('voice', { text: 'Navigate to airport' }), 750],
      [() => domains.command('voice', { text: 'Turn on headlights' }), 750],
      [() => domains.command('voice', { text: 'Turn on climate' }), 750],
      [() => domains.command('voice', { text: 'Play music' }), 750],
    ],
    digital: [
      [() => { setLocked(true); }, 600],
      [() => domains.command('digitalKey', { authenticated: true }), 800],
      [() => { setDoor('fl', true); domains.command('window', { window: 'fl', percent: 0 }); }, 1200],
      [() => { domains.command('window', { window: 'fl', percent: 100 }); setDoor('fl', false); }, 800],
      [() => { setLocked(true); setLight('taillights', false); }, 500],
    ],
    integrated: [
      [() => domains.command('digitalKey', { authenticated: true }), 650],
      [() => { setDoor('fl', true); domains.command('window', { window: 'fl', percent: 0 }); }, 1000],
      [() => { domains.command('window', { window: 'fl', percent: 100 }); setDoor('fl', false); domains.command('voice', { text: 'Navigate to charging station' }); }, 800],
      [() => { setGear('D'); setSpeed(80); domains.command('object', { object: 'vehicle', distance: 42, leadSpeed: 5 }); }, 750],
      [() => { domains.command('distance', { meters: 20 }); }, 1250],
      [() => { setSpeed(0); setGear('P'); setBrake(0); domains.command('object', { object: 'none' }); }, 500],
      [() => domains.command('attack', { type: 'remote' }), 600],
      [() => { domains.command('soc', { percent: 26 }); domains.command('charge', { on: true }); }, 1800],
      [() => domains.command('charge', { on: false }), 600],
    ],
  };

  const script = steps[name];
  if (!script) {
    stopScenario();
    setVerdict('Unknown scenario ID', 'fail', false);
    return false;
  }
  let stepIndex = 0;
  for (const [fn, delay] of script) {
    if (token !== scenarioToken) return;
    fn();
    stepIndex++;
    setVerdict(`Running step ${stepIndex} of ${script.length}…`, 'running', true);
    if (!(await sleep(Math.round(delay * delayScale), token))) return false;
  }
  if (token === scenarioToken) {
    const hasSignal = (signal: string) => events.some((e) => e.signal === signal && e.timestamp >= startedAt);
    const ext = domains.getState();
    const expectations: Record<string, () => boolean> = {
      approach: () => state.locked && !Object.values(state.doors).some(Boolean),
      drive: () => state.speed === 0 && state.gear === 'P',
      tpms: () => state.tpms.rl < 24,
      emergency: () => state.gear === 'P' && state.hazards,
      park: () => state.locked && !Object.values(state.doors).some(Boolean),
      aeb: () => hasSignal('ADAS.AEB') && state.gear === 'P',
      lane: () => hasSignal('ADAS.LaneAssist') && state.gear === 'P',
      acc: () => ext.adas.acc && hasSignal('PERCEPTION.Target') && state.gear === 'P',
      wet: () => ext.motion.road === 'wet' && ext.wipers,
      charge: () => hasSignal('OBC.ChargeState') && !ext.ev.charging,
      security: () => ext.security.blocked === 4 && hasSignal('SECURITY.GatewayPolicy'),
      sensorfault: () => hasSignal('SENSOR.CAMERA') && ext.adas.camera && ext.adas.radar,
      voice: () => ext.infotainment.destination === 'Airport' && ext.ev.hvac && ext.infotainment.media,
      digital: () => state.locked && ext.windows.fl === 100,
      integrated: () => ext.security.blocked === 1 && !ext.ev.charging && hasSignal('ADAS.AEB'),
    };
    const passed = !!expectations[name]?.();
    const endedAt = new Date().toISOString();
    lastTestResult = {
      scenario: name,
      startedAt,
      endedAt,
      steps: script.length,
      status: passed ? 'PASS' : 'FAIL',
      criterion: 'Scenario-specific synthetic state/event assertions',
      state: deepCopy({ ...state, ...ext }),
      warningList: warningList(),
      events: events.filter((e) => e.timestamp >= startedAt).slice().reverse(),
    };
    stopScenario();
    publish('SYS', '—', 'TEST.Completed', `${name.toUpperCase()} / ${passed ? 'PASS' : 'FAIL'}`, passed ? 'OK' : 'WARNING');
    setVerdict(
      `${passed ? 'PASS' : 'FAIL'} · ${script.length} steps · ${name.toUpperCase()} · Synthetic state/event assertions`,
      passed ? 'pass' : 'fail',
      false,
    );
    showToast(`Scenario ${passed ? 'passed' : 'failed'} — ${name}`, passed ? 'success' : 'warning');
    return passed;
  }
  return false;
}

function executeCommand(action: string, payload: Record<string, unknown> = {}) {
  switch (action) {
    case 'lock':
      return setLocked(!!payload.locked);
    case 'door':
      return setDoor(String(payload.door), !!payload.open);
    case 'trunk':
      return setTrunk(!!payload.open);
    case 'light':
      return setLight(String(payload.light), !!payload.on);
    case 'gear':
      return setGear(String(payload.gear));
    case 'speed':
      return setSpeed(Number(payload.kmh), payload.log !== false);
    case 'brake':
      return setBrake(Number(payload.pressure), payload.log !== false);
    case 'tpms':
      return setTirePressure(String(payload.tire), Number(payload.psi), payload.log !== false);
    case 'doors':
      return setAllDoors(!!payload.open);
    case 'resetTpms': {
      for (const [key, psi] of Object.entries(NOMINAL_TPMS) as [DoorKey, number][]) state.tpms[key] = psi;
      publish('CAN', '0x350', 'TPMS.AllSensors', 'NOMINAL');
      notifyState();
      return true;
    }
    case 'speedCommit':
      publish('CAN', '0x101', 'VCU.VehicleSpeed', `${state.speed} km/h`);
      return true;
    case 'brakeCommit':
      publish('CAN', '0x180', 'ESP.BrakePedal', `${state.brakePressure}%`);
      return true;
    case 'tpmsCommit': {
      const k = String(payload.tire) as DoorKey;
      if (!(k in DOORS)) return false;
      const p = state.tpms[k];
      publish('CAN', '0x350', `TPMS.${k.toUpperCase()}.Pressure`, `${p} PSI`, lowPressure(p) ? 'WARNING' : 'OK');
      if (lowPressure(p)) {
        publish('WARN', '0x350', `TPMS.${k.toUpperCase()}.Alert`, criticalPressure(p) ? 'CRITICAL' : 'OUT OF RANGE', 'WARNING');
        showToast(`${DOORS[k]} tire warning: ${p} PSI`, 'warning');
      }
      return true;
    }
    case 'brakeToggle':
      return setBrake(state.brakePressure > 5 ? 0 : 70);
    case 'clearLog':
      events.length = 0;
      notifyState();
      return true;
    case 'reset':
      return resetAll();
    default:
      return domains.command(action, payload) ?? false;
  }
}

export function filterEvents(source: SimEvent[], filter: LogFilter) {
  return source
    .filter(
      (e) =>
        filter === 'all' ||
        e.bus === filter ||
        (filter === 'WARN' && (e.status === 'WARNING' || e.status === 'REJECTED' || e.bus === 'WARN')),
    )
    .slice(0, 100);
}

export function eventsToCsv(source: SimEvent[] = events) {
  const columns = ['time', 'timestamp', 'bus', 'frame', 'signal', 'value', 'status', 'data'] as const;
  return [
    columns.join(','),
    ...source
      .slice()
      .reverse()
      .map((e) => columns.map((k) => `"${String(e[k] ?? '').replaceAll('"', '""')}"`).join(',')),
  ].join('\r\n');
}

export function stateExportJson() {
  return JSON.stringify(
    {
      device: 'Polestar 3 (2027) simulated digital twin',
      mode: 'simulation',
      capturedAt: new Date().toISOString(),
      state,
      alerts: warningList(),
      frames: events.slice(0, 200),
    },
    null,
    2,
  );
}

export function getSnapshot(): StudioSnapshot {
  const vehicle = merged();
  const warnings = warningList();
  const unsecured = Object.values(state.doors).some(Boolean) || state.trunk;
  return {
    vehicle,
    lights: effectiveLights(),
    warnings,
    events: events.slice(),
    eventCount: events.length,
    blink: blinkPhase,
    scenario: scenarioUi,
    healthLabel: warnings.length
      ? `${warnings.length} active ${warnings.length === 1 ? 'warning' : 'warnings'}`
      : 'All systems nominal',
    bodyStatus: unsecured ? 'DOOR AJAR' : state.locked ? 'LOCKED' : 'READY',
    openDoors: Object.values(state.doors).filter(Boolean).length,
  };
}

function startLoops() {
  timerGlobal.__gmLoops?.forEach(clearInterval);
  timerGlobal.__gmLoops = [
    setInterval(() => {
      blinkPhase = !blinkPhase;
      notifySubscribers({ type: 'state', state: merged() });
    }, 490),
    setInterval(() => {
      if (state.brakePressure > 5 && state.speed > 0) {
        const next = Math.max(0, state.speed - (state.brakePressure / 100) * 1.7);
        state.speed = Math.max(0, Math.round(next * 10) / 10);
        if (state.speed < 0.5) state.speed = 0;
        notifyState();
        if (Date.now() - lastSpeedLog > 980) {
          lastSpeedLog = Date.now();
          publish('CAN', '0x101', 'VCU.VehicleSpeed', `${Math.round(state.speed)} km/h`);
        }
      }
    }, 100),
    setInterval(() => domains.tick(0.1), 100),
  ];
}

export function setLoopsEnabled(on: boolean) {
  if (!on) {
    timerGlobal.__gmLoops?.forEach(clearInterval);
    timerGlobal.__gmLoops = [];
    return;
  }
  startLoops();
}

const domainApi: DomainApi = {
  getBase: () => state,
  publish: (bus, frame, signal, value, status = 'OK') => publish(bus, frame, signal, value, status),
  notify: () => notifyState(),
  toast: showToast,
  setLocked,
  setLight,
  setSpeed,
  setBrake,
  setGear,
};

const domains = createDomains(domainApi);

function boot() {
  publish('SYS', '—', 'SIM.Boot', 'Virtual body-control module ready');
  publish('CAN', '0x311', 'BCM.CentralLock', 'UNLOCKED');
  publish('CAN', '0x350', 'TPMS.AllSensors', 'NOMINAL');
  startLoops();
}

if (!timerGlobal.__gmSimBooted) {
  timerGlobal.__gmSimBooted = true;
  boot();
} else {
  startLoops();
}

export function toast(message: string, kind: ToastKind = 'info') {
  showToast(message, kind);
}

export function subscribe(callback: (notice: SimNotice) => void) {
  if (typeof callback !== 'function') throw new TypeError('A callback function is required');
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

export function command(action: string, payload: Record<string, unknown> = {}) {
  return executeCommand(action, payload);
}

export function getState() {
  return merged();
}
export function getWarnings() {
  return warningList();
}
export function getFrames() {
  return deepCopy(events);
}
export function getLastTestResult() {
  return lastTestResult ? deepCopy(lastTestResult) : null;
}
export function reset() {
  return resetAll();
}
export function listScenarios() {
  return SCENARIOS.map((item) => ({ ...item }));
}

export const VehicleSimulator = Object.freeze({
  getState,
  getWarnings,
  getFrames,
  command,
  subscribe,
  runScenario,
  getLastTestResult,
  reset,
  listScenarios,
  getSnapshot,
});

export { runScenario };
