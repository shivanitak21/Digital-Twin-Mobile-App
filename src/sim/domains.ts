import type {
  AdasFeature,
  AttackType,
  BodyState,
  DomainState,
  DoorKey,
  ObjectKind,
  RoadSurface,
  ToastKind,
} from './types';

const clamp = (x: number, min: number, max: number) => Math.max(min, Math.min(max, Number(x) || 0));

export const DOMAIN_DEFAULTS = (): DomainState => ({
  windows: { fl: 100, fr: 100, rl: 100, rr: 100 },
  wipers: false,
  digitalKey: false,
  adas: {
    perception: true,
    aeb: true,
    acc: false,
    lka: false,
    object: 'none',
    distance: 30,
    leadSpeed: 20,
    laneOffset: 0,
    camera: true,
    radar: true,
    alert: 'CLEAR',
    ttc: null,
  },
  motion: { steering: 0, road: 'dry', abs: false, esc: false, trajectory: true },
  ev: { soc: 74, plugged: false, charging: false, cabinTemp: 22, hvac: false },
  infotainment: { destination: 'None', voiceResult: 'Ready', media: false },
  security: { ids: true, blocked: 0, lastThreat: 'No threats', lastAction: 'Monitoring', status: 'PROTECTED' },
  overlays: { sensors: true, trajectory: true, labels: true },
});

export interface DomainApi {
  getBase: () => BodyState;
  publish: (bus: string, frame: string, signal: string, value: string, status?: string) => void;
  notify: () => void;
  toast: (message: string, kind?: ToastKind) => void;
  setLocked: (locked: boolean) => boolean;
  setLight: (which: string, on: boolean) => boolean;
  setSpeed: (value: number, log?: boolean) => boolean;
  setBrake: (pressure: number, log?: boolean) => boolean;
  setGear: (gear: string) => boolean;
}

const deepCopy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function createDomains(api: DomainApi) {
  let state = DOMAIN_DEFAULTS();
  let previousAlert = 'CLEAR';
  let chargeElapsed = 0;
  let energyElapsed = 0;

  const emit = (signal: string, value: string, status = 'OK', frame = '0x460', bus = 'CAN') =>
    api.publish(bus, frame, signal, value, status);
  const notify = () => api.notify();

  function getState(): DomainState {
    return deepCopy(state);
  }

  function warningList() {
    const out: string[] = [];
    const a = state.adas;
    if (a.alert === 'AEB') out.push('AEB emergency intervention');
    else if (a.alert === 'FCW') out.push('Forward collision warning');
    else if (a.alert === 'LANE') out.push('Lane departure detected');
    if (!a.camera) out.push('ADAS front camera unavailable');
    if (!a.radar) out.push('ADAS radar unavailable');
    if (state.ev.soc <= 15) out.push(`Battery low · ${Math.round(state.ev.soc)}%`);
    if (state.motion.esc) out.push('ESC stability intervention');
    if (state.security.blocked) out.push(`${state.security.blocked} security event(s) blocked`);
    return out;
  }

  function updateADAS() {
    const a = state.adas;
    const b = api.getBase();
    let alert = 'CLEAR';
    let ttc: number | null = null;
    const seen = a.perception && (a.camera || a.radar) && a.object !== 'none';
    if (seen) {
      const closing = Math.max(0, (b.speed - a.leadSpeed) / 3.6);
      ttc = closing > 0.15 ? a.distance / closing : null;
      if (ttc !== null && ttc < 2.3 && a.aeb && a.camera && a.radar && b.speed > 12) alert = 'AEB';
      else if (ttc !== null && ttc < 4.5) alert = 'FCW';
    }
    if (alert === 'CLEAR' && Math.abs(a.laneOffset) >= 0.75 && b.speed > 25) alert = 'LANE';
    a.alert = alert as DomainState['adas']['alert'];
    a.ttc = ttc === null ? null : Math.round(ttc * 10) / 10;
    if (alert !== previousAlert) {
      if (alert !== 'CLEAR') emit('ADAS.Alert', `${alert}${ttc !== null ? ` / TTC ${ttc.toFixed(1)}s` : ''}`, 'WARNING', '0x425');
      else if (previousAlert !== 'CLEAR') emit('ADAS.Alert', 'CLEARED', 'OK', '0x425');
      if (alert === 'AEB') {
        api.setBrake(90);
        api.setLight('hazards', true);
        emit('ADAS.AEB', 'AUTOMATIC BRAKE REQUEST', 'WARNING', '0x426');
      }
      if (alert === 'LANE' && a.lka && a.camera) {
        state.motion.steering = Math.round(clamp(-a.laneOffset * 13, -25, 25));
        emit('ADAS.LaneAssist', `${state.motion.steering} deg`, 'OK', '0x427');
      }
      previousAlert = alert;
    }
  }

  function command(action: string, p: Record<string, unknown> = {}): boolean | string | null {
    const base = api.getBase();
    switch (action) {
      case 'digitalKey': {
        if (p.authenticated === false) {
          emit('ACCESS.DigitalKey', 'INVALID CREDENTIAL', 'REJECTED', '0x510', 'SEC');
          state.security.blocked++;
          state.security.lastThreat = 'Invalid digital key';
          state.security.lastAction = 'Credential rejected';
          state.security.status = 'THREAT BLOCKED';
          notify();
          return false;
        }
        state.digitalKey = true;
        emit('ACCESS.DigitalKey', 'AUTHENTICATED', 'OK', '0x510');
        api.setLocked(false);
        api.setLight('taillights', true);
        notify();
        return true;
      }
      case 'window': {
        const windowKey = p.window;
        if (windowKey !== 'fl' && windowKey !== 'fr' && windowKey !== 'rl' && windowKey !== 'rr') return false;
        state.windows[windowKey] = Math.round(clamp(Number(p.percent), 0, 100));
        emit(`BCM.Window.${windowKey.toUpperCase()}`, `${state.windows[windowKey]}%`, 'OK', '0x312');
        notify();
        return true;
      }
      case 'wipers':
        state.wipers = !!p.on;
        emit('BCM.Wipers', state.wipers ? 'ON' : 'OFF', 'OK', '0x322');
        notify();
        return true;
      case 'adas': {
        const feature = p.feature;
        if (
          feature !== 'perception' &&
          feature !== 'aeb' &&
          feature !== 'acc' &&
          feature !== 'lka' &&
          feature !== 'camera' &&
          feature !== 'radar'
        ) {
          return false;
        }
        state.adas[feature as AdasFeature] = !!p.on;
        emit(`ADAS.${feature}`, state.adas[feature as AdasFeature] ? 'ON' : 'OFF', 'OK', '0x420');
        updateADAS();
        notify();
        return true;
      }
      case 'object': {
        const object = p.object;
        if (object !== 'none' && object !== 'vehicle' && object !== 'pedestrian' && object !== 'cyclist') return false;
        state.adas.object = object as ObjectKind;
        state.adas.distance = Math.round(clamp(p.distance === undefined ? state.adas.distance : Number(p.distance), 5, 100));
        state.adas.leadSpeed = Math.round(clamp(p.leadSpeed === undefined ? state.adas.leadSpeed : Number(p.leadSpeed), 0, 120));
        previousAlert = 'CLEAR';
        emit('PERCEPTION.Target', `${object} / ${state.adas.distance}m`, 'OK', '0x421');
        updateADAS();
        notify();
        return true;
      }
      case 'distance':
        state.adas.distance = Math.round(clamp(Number(p.meters), 5, 100));
        updateADAS();
        notify();
        return true;
      case 'leadSpeed':
        state.adas.leadSpeed = Math.round(clamp(Number(p.kmh), 0, 120));
        updateADAS();
        notify();
        return true;
      case 'laneOffset':
        state.adas.laneOffset = clamp(Number(p.meters), -1.5, 1.5);
        updateADAS();
        emit('ADAS.LaneOffset', `${state.adas.laneOffset.toFixed(1)} m`, 'OK', '0x422');
        notify();
        return true;
      case 'steering':
        state.motion.steering = Math.round(clamp(Number(p.degrees), -35, 35));
        emit('EPS.SteeringAngle', `${state.motion.steering} deg`, 'OK', '0x190');
        notify();
        return true;
      case 'road': {
        const surface = p.surface;
        if (surface !== 'dry' && surface !== 'wet' && surface !== 'ice') return false;
        state.motion.road = surface as RoadSurface;
        emit('ESP.RoadFriction', surface.toUpperCase(), 'OK', '0x191');
        if (surface === 'wet') {
          state.wipers = true;
          api.setLight('headlights', true);
        }
        notify();
        return true;
      }
      case 'soc':
        state.ev.soc = Math.round(clamp(Number(p.percent), 2, 100));
        emit('BMS.SoC', `${state.ev.soc}%`, 'OK', '0x550');
        notify();
        return true;
      case 'charge': {
        const on = !!p.on;
        if (on && (base.speed > 0 || base.gear !== 'P')) {
          emit('OBC.ChargeRequest', 'PARK VEHICLE FIRST', 'REJECTED', '0x552', 'WARN');
          api.toast('Charging requires Park and zero speed', 'warning');
          return false;
        }
        if (on && state.ev.soc >= 100) {
          emit('OBC.ChargeRequest', 'BATTERY FULL', 'REJECTED', '0x552');
          return false;
        }
        state.ev.plugged = on;
        state.ev.charging = on;
        chargeElapsed = 0;
        emit('OBC.ChargeState', on ? 'CHARGING / 11 kW (SIM)' : 'DISCONNECTED', 'OK', '0x552');
        notify();
        return true;
      }
      case 'hvac':
        state.ev.hvac = !!p.on;
        emit('HVAC.Auto', state.ev.hvac ? 'ON' : 'OFF', 'OK', '0x560');
        notify();
        return true;
      case 'cabinTemp':
        state.ev.cabinTemp = Math.round(clamp(Number(p.celsius), 16, 30));
        emit('HVAC.TargetTemp', `${state.ev.cabinTemp} C`, 'OK', '0x561');
        notify();
        return true;
      case 'navigation': {
        const allowed = ['None', 'Engineering campus', 'Airport', 'Charging station'];
        if (typeof p.destination !== 'string' || !allowed.includes(p.destination)) return false;
        state.infotainment.destination = p.destination;
        state.infotainment.voiceResult = p.destination === 'None' ? 'Route canceled' : `Routing to ${p.destination}`;
        emit('IVI.Navigation', state.infotainment.voiceResult, 'OK', '0x610', 'SYS');
        notify();
        return true;
      }
      case 'media':
        state.infotainment.media = !!p.on;
        emit('IVI.Media', state.infotainment.media ? 'PLAY' : 'PAUSE', 'OK', '0x611', 'SYS');
        notify();
        return true;
      case 'voice': {
        const phrase = String(p.text || '').toLowerCase().trim();
        if (!phrase) return false;
        let reply = 'Command not recognized in this demo';
        if (/headlight|lights on/.test(phrase)) {
          api.setLight('headlights', true);
          reply = 'Headlights switched on';
        } else if (/lights off/.test(phrase)) {
          api.setLight('headlights', false);
          reply = 'Headlights switched off';
        } else if (/unlock/.test(phrase)) {
          api.setLocked(false);
          reply = 'Vehicle unlocked';
        } else if (/lock/.test(phrase)) {
          reply = api.setLocked(true) ? 'Vehicle locked' : 'Lock request rejected';
        } else if (/climate|air conditioning|a\/c/.test(phrase)) {
          state.ev.hvac = true;
          reply = 'Climate control enabled';
        } else if (/airport/.test(phrase)) {
          state.infotainment.destination = 'Airport';
          reply = 'Routing to Airport';
        } else if (/charging station/.test(phrase)) {
          state.infotainment.destination = 'Charging station';
          reply = 'Routing to charging station';
        } else if (/music|radio/.test(phrase)) {
          state.infotainment.media = true;
          reply = 'Media playback enabled';
        }
        state.infotainment.voiceResult = reply;
        emit('IVI.VoiceCommand', `${phrase} → ${reply}`, 'OK', '0x612', 'SYS');
        notify();
        return reply;
      }
      case 'attack': {
        const names: Record<AttackType, string> = {
          remote: 'Remote unlock with invalid token',
          replay: 'Replayed lock control frame',
          flood: 'Synthetic CAN traffic flood',
          ota: 'Unsigned OTA image',
          diagnostic: 'Unauthorized diagnostic session',
        };
        if (typeof p.type !== 'string' || !Object.hasOwn(names, p.type)) return false;
        const type = p.type as AttackType;
        const name = names[type];
        state.security.lastThreat = name;
        state.security.blocked++;
        state.security.lastAction = state.security.ids
          ? 'IDS alert · gateway dropped request'
          : 'Gateway policy rejected request';
        state.security.status = 'THREAT BLOCKED';
        emit(`SECURITY.${type.toUpperCase()}`, `${name} | BLOCKED`, 'REJECTED', '0x6E0', 'SEC');
        emit('SECURITY.GatewayPolicy', 'DENY / NO STATE CHANGE', 'OK', '0x6E1', 'SEC');
        api.toast(`${name} — blocked (simulation)`, 'warning');
        notify();
        return true;
      }
      case 'ids':
        state.security.ids = !!p.on;
        state.security.lastAction = state.security.ids
          ? 'Intrusion monitoring enabled'
          : 'IDS sensor disabled (gateway policy remains active)';
        emit('SECURITY.IDS', state.security.ids ? 'ON' : 'OFF', 'WARNING', '0x6E2', 'SEC');
        notify();
        return true;
      case 'overlay': {
        if (p.feature !== 'sensors' && p.feature !== 'trajectory' && p.feature !== 'labels') return false;
        state.overlays[p.feature] = !!p.on;
        notify();
        return true;
      }
      case 'fault': {
        const sensor = p.sensor;
        if (sensor !== 'camera' && sensor !== 'radar') return false;
        state.adas[sensor] = false;
        emit(`SENSOR.${sensor.toUpperCase()}`, 'SIGNAL LOST', 'WARNING', '0x430', 'WARN');
        updateADAS();
        notify();
        return true;
      }
      default:
        return null;
    }
  }

  function tick(dt: number) {
    const base = api.getBase();
    updateADAS();
    const moving = base.speed > 0 && base.gear === 'D';
    state.motion.abs = base.brakePressure > 65 && base.speed > 5 && state.motion.road !== 'dry';
    state.motion.esc = Math.abs(state.motion.steering) > 23 && base.speed > 45 && state.motion.road !== 'dry';
    if (
      state.adas.acc &&
      state.adas.perception &&
      state.adas.radar &&
      base.gear === 'D' &&
      base.speed > 0 &&
      state.adas.object !== 'none' &&
      state.adas.distance < 25
    ) {
      api.setSpeed(Math.max(0, base.speed - 0.7), false);
    }
    if (state.ev.charging) {
      chargeElapsed += dt;
      if (chargeElapsed > 1) {
        chargeElapsed = 0;
        state.ev.soc = Math.min(100, Math.round((state.ev.soc + 0.35) * 100) / 100);
        if (state.ev.soc >= 100) {
          state.ev.charging = false;
          emit('OBC.ChargeState', 'FULL / CHARGING COMPLETE', 'OK', '0x552');
        }
        notify();
      }
    } else if (moving) {
      energyElapsed += dt;
      if (energyElapsed > 4) {
        energyElapsed = 0;
        state.ev.soc = Math.max(2, Math.round((state.ev.soc - 0.01) * 100) / 100);
      }
    }
    if (state.ev.plugged && moving) {
      state.ev.plugged = false;
      state.ev.charging = false;
      emit('OBC.Interlock', 'CHARGING DISCONNECTED', 'WARNING', '0x552');
      notify();
    }
  }

  function reset() {
    state = DOMAIN_DEFAULTS();
    previousAlert = 'CLEAR';
    chargeElapsed = 0;
    energyElapsed = 0;
  }

  return { getState, warningList, command, tick, reset };
}
