/** Shared simulation types. Frame IDs elsewhere are demonstration values, not OEM DBC data. */

export type DoorKey = 'fl' | 'fr' | 'rl' | 'rr';
export type Gear = 'P' | 'R' | 'N' | 'D';
export type LightKey = 'headlights' | 'taillights' | 'hazards' | 'leftSignal' | 'rightSignal';
export type ObjectKind = 'none' | 'vehicle' | 'pedestrian' | 'cyclist';
export type RoadSurface = 'dry' | 'wet' | 'ice';
export type AdasAlert = 'CLEAR' | 'FCW' | 'AEB' | 'LANE';
export type AdasFeature = 'perception' | 'aeb' | 'acc' | 'lka' | 'camera' | 'radar';
export type AttackType = 'remote' | 'replay' | 'flood' | 'ota' | 'diagnostic';
export type OverlayKey = 'sensors' | 'trajectory' | 'labels';
export type ToastKind = 'info' | 'warning' | 'success';
export type LogFilter = 'all' | 'CAN' | 'SYS' | 'WARN' | 'SEC';
export type ScenarioId =
  | 'approach'
  | 'drive'
  | 'tpms'
  | 'emergency'
  | 'park'
  | 'aeb'
  | 'lane'
  | 'acc'
  | 'wet'
  | 'charge'
  | 'security'
  | 'sensorfault'
  | 'voice'
  | 'digital'
  | 'integrated';

export interface BodyState {
  locked: boolean;
  doors: Record<DoorKey, boolean>;
  trunk: boolean;
  headlights: boolean;
  taillights: boolean;
  brakePressure: number;
  leftSignal: boolean;
  rightSignal: boolean;
  hazards: boolean;
  gear: Gear;
  speed: number;
  tpms: Record<DoorKey, number>;
}

export interface AdasState {
  perception: boolean;
  aeb: boolean;
  acc: boolean;
  lka: boolean;
  object: ObjectKind;
  distance: number;
  leadSpeed: number;
  laneOffset: number;
  camera: boolean;
  radar: boolean;
  alert: AdasAlert;
  ttc: number | null;
}

export interface DomainState {
  windows: Record<DoorKey, number>;
  wipers: boolean;
  digitalKey: boolean;
  adas: AdasState;
  motion: { steering: number; road: RoadSurface; abs: boolean; esc: boolean; trajectory: boolean };
  ev: { soc: number; plugged: boolean; charging: boolean; cabinTemp: number; hvac: boolean };
  infotainment: { destination: string; voiceResult: string; media: boolean };
  security: { ids: boolean; blocked: number; lastThreat: string; lastAction: string; status: string };
  overlays: Record<OverlayKey, boolean>;
}

export interface EffectiveLights {
  headlights: boolean;
  taillights: boolean;
  brake: boolean;
  reverse: boolean;
  left: boolean;
  right: boolean;
}

export interface SimEvent {
  time: string;
  timestamp: string;
  bus: string;
  frame: string;
  signal: string;
  value: string;
  status: string;
  data: string;
}

export interface VehicleSnapshot extends BodyState, DomainState {}

export interface TestResult {
  scenario: string;
  startedAt: string;
  endedAt: string;
  steps: number;
  status: 'PASS' | 'FAIL';
  criterion: string;
  state: VehicleSnapshot;
  warningList: string[];
  events: SimEvent[];
}

export interface ScenarioUi {
  running: boolean;
  verdict: string;
  kind: 'idle' | 'running' | 'pass' | 'fail';
}

export type SimNotice =
  | { type: 'state'; state: VehicleSnapshot }
  | { type: 'event'; event: SimEvent; state: VehicleSnapshot }
  | { type: 'toast'; message: string; kind: ToastKind };

export interface StudioSnapshot {
  vehicle: VehicleSnapshot;
  lights: EffectiveLights;
  warnings: string[];
  events: SimEvent[];
  eventCount: number;
  blink: boolean;
  scenario: ScenarioUi;
  healthLabel: string;
  bodyStatus: string;
  openDoors: number;
}
