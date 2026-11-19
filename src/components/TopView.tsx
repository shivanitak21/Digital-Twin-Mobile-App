import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import type { DoorKey, StudioSnapshot } from '../sim/types';
import { criticalPressure, lowPressure } from '../sim/simulator';
import { paintById, shade, type PaintId } from '../three/paints';
import { useTheme } from '../theme';

const DOOR_ORIGIN: Record<DoorKey, { x: number; y: number; open: number }> = {
  fl: { x: 83, y: 212, open: 48 },
  fr: { x: 277, y: 212, open: -48 },
  rl: { x: 77, y: 448, open: -48 },
  rr: { x: 283, y: 448, open: 48 },
};

export function TopView({
  snap,
  paintId,
  onDoor,
  onTrunk,
  onTire,
}: {
  snap: StudioSnapshot;
  paintId: PaintId;
  onDoor: (door: DoorKey) => void;
  onTrunk: () => void;
  onTire: (tire: DoorKey) => void;
}) {
  const colors = useTheme();
  const paint = paintById(paintId);
  const highlight = shade(paint.swatch, 0.45);
  const mid = shade(paint.swatch, 0.12);
  const shadeTone = shade(paint.swatch, -0.28);
  const stroke = shade(paint.swatch, -0.45);
  const doorFill = shade(paint.swatch, 0.22);
  const { vehicle, lights, blink } = snap;
  const steering = vehicle.motion.steering;
  const showFan = vehicle.overlays.sensors && vehicle.adas.perception;
  const showTarget = showFan && vehicle.adas.object !== 'none';
  const showPath =
    vehicle.overlays.trajectory &&
    (vehicle.infotainment.destination !== 'None' || vehicle.adas.lka || Math.abs(steering) > 1);
  const headOn = lights.headlights;
  const tailOn = lights.taillights || lights.brake;
  const leftOn = blink && lights.left;
  const rightOn = blink && lights.right;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.fill }]}>
      <Svg viewBox="0 0 360 650" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <Defs>
          <LinearGradient id="bodyPaint" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={highlight} />
            <Stop offset="0.5" stopColor={mid} />
            <Stop offset="1" stopColor={shadeTone} />
          </LinearGradient>
          <LinearGradient id="windscreen" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#3e4c60" />
            <Stop offset="1" stopColor="#9aabba" />
          </LinearGradient>
        </Defs>
        {showFan ? <Path d="M180 73 L63 3 L297 3 Z" fill="#54bdd0" opacity={0.12} stroke="#64b3dc" strokeWidth={2} /> : null}
        {showPath ? (
          <Path
            d={`M180 72 Q${180 + steering * 1.2} 30 ${180 + steering * 2} 4`}
            stroke="#2c85d7"
            strokeWidth={3}
            strokeDasharray="7 4"
            fill="none"
          />
        ) : null}
        {showTarget ? (
          <G>
            <Circle cx={180} cy={24} r={10} fill="#497e9a" stroke="#fff" strokeWidth={3} />
            <SvgText x={180} y={10} textAnchor="middle" fill="#2c708a" fontSize={9} fontWeight="800">
              {`${vehicle.adas.object.toUpperCase()} · ${vehicle.adas.distance} m`}
            </SvgText>
          </G>
        ) : null}
        <Ellipse cx={180} cy={331} rx={116} ry={269} fill="#d7dde7" opacity={0.25} />
        <G>
          <Rect x={51} y={156} width={24} height={99} rx={8} fill="#344153" stroke="#1c293b" strokeWidth={2} />
          <Rect x={285} y={156} width={24} height={99} rx={8} fill="#344153" stroke="#1c293b" strokeWidth={2} />
          <Rect x={51} y={406} width={24} height={99} rx={8} fill="#344153" stroke="#1c293b" strokeWidth={2} />
          <Rect x={285} y={406} width={24} height={99} rx={8} fill="#344153" stroke="#1c293b" strokeWidth={2} />
        </G>
        <Path
          d="M115 64C138 48 222 48 245 64Q276 88 279 150L284 487Q281 543 262 576C244 604 116 604 98 576Q79 543 76 487L81 150Q84 88 115 64Z"
          fill="url(#bodyPaint)"
          stroke={stroke}
          strokeWidth={2.4}
        />
        <Path d="M84 187Q180 165 276 187M81 477Q180 492 279 477" fill="none" stroke="#a8b2c0" strokeWidth={2} />
        <Path d="M117 203Q180 194 243 203L256 431Q180 446 104 431Z" fill="#d8dfe7" stroke="#b2bdc9" strokeWidth={2} />
        <Path d="M113 197Q180 175 247 197L238 255Q180 268 122 255Z" fill="url(#windscreen)" stroke="#667789" strokeWidth={1.5} />
        <Path d="M107 429Q180 447 253 429L245 385Q180 396 115 385Z" fill="#718193" stroke="#667789" strokeWidth={1.5} />
        <Path d="M113 314H247M115 385H245" fill="none" stroke="#96a5b5" strokeWidth={2} />
        <Path d="M102 111Q180 89 258 111M102 551Q180 573 258 551" fill="none" stroke="#9aa8b8" strokeWidth={2} />
        <Door d="M83 212L110 218L106 320L77 320Z" id="fl" open={vehicle.doors.fl} fill={doorFill} onPress={onDoor} />
        <Door d="M277 212L250 218L254 320L283 320Z" id="fr" open={vehicle.doors.fr} fill={doorFill} onPress={onDoor} />
        <Door d="M77 330L106 330L104 429L81 448Z" id="rl" open={vehicle.doors.rl} fill={doorFill} onPress={onDoor} />
        <Door d="M283 330L254 330L256 429L279 448Z" id="rr" open={vehicle.doors.rr} fill={doorFill} onPress={onDoor} />
        <G onPress={onTrunk}>
          <Path
            d="M103 548Q180 569 257 548L259 582Q180 610 101 582Z"
            fill={vehicle.trunk ? '#abc6e8' : '#cbd4df'}
            stroke="#7a8a9f"
            strokeWidth={2}
            transform={vehicle.trunk ? 'translate(0 16)' : undefined}
          />
        </G>
        <G>
          <Rect x={100} y={86} width={49} height={10} rx={5} fill={headOn ? '#f4fbff' : '#c7d2dd'} />
          <Rect x={211} y={86} width={49} height={10} rx={5} fill={headOn ? '#f4fbff' : '#c7d2dd'} />
        </G>
        <G>
          <Rect x={100} y={569} width={55} height={11} rx={5} fill={lights.brake ? '#ff0f2f' : tailOn ? '#ff3549' : '#9a3c47'} opacity={tailOn || lights.brake ? 1 : 0.75} />
          <Rect x={205} y={569} width={55} height={11} rx={5} fill={lights.brake ? '#ff0f2f' : tailOn ? '#ff3549' : '#9a3c47'} opacity={tailOn || lights.brake ? 1 : 0.75} />
          <Rect x={154} y={565} width={52} height={5} rx={3} fill={lights.brake ? '#ff0f2f' : tailOn ? '#ff3549' : '#9a3c47'} opacity={tailOn || lights.brake ? 1 : 0.75} />
        </G>
        <G>
          <Rect x={114} y={583} width={19} height={5} rx={2} fill={lights.reverse ? '#ffffff' : '#d8dce2'} opacity={lights.reverse ? 1 : 0.4} />
          <Rect x={227} y={583} width={19} height={5} rx={2} fill={lights.reverse ? '#ffffff' : '#d8dce2'} opacity={lights.reverse ? 1 : 0.4} />
        </G>
        <Circle cx={96} cy={100} r={7} fill={leftOn ? '#ffb93a' : '#af9a7a'} opacity={leftOn ? 1 : 0.5} />
        <Circle cx={96} cy={562} r={7} fill={leftOn ? '#ffb93a' : '#af9a7a'} opacity={leftOn ? 1 : 0.5} />
        <Circle cx={264} cy={100} r={7} fill={rightOn ? '#ffb93a' : '#af9a7a'} opacity={rightOn ? 1 : 0.5} />
        <Circle cx={264} cy={562} r={7} fill={rightOn ? '#ffb93a' : '#af9a7a'} opacity={rightOn ? 1 : 0.5} />
        <Tire x={4} y={178} label="FL TIRE" id="fl" psi={vehicle.tpms.fl} onPress={onTire} />
        <Tire x={280} y={178} label="FR TIRE" id="fr" psi={vehicle.tpms.fr} onPress={onTire} />
        <Tire x={4} y={437} label="RL TIRE" id="rl" psi={vehicle.tpms.rl} onPress={onTire} />
        <Tire x={280} y={437} label="RR TIRE" id="rr" psi={vehicle.tpms.rr} onPress={onTire} />
      </Svg>
    </View>
  );
}

function Door({ d, id, open, fill, onPress }: { d: string; id: DoorKey; open: boolean; fill: string; onPress: (id: DoorKey) => void }) {
  const origin = DOOR_ORIGIN[id];
  return (
    <G onPress={() => onPress(id)} transform={open ? `rotate(${origin.open} ${origin.x} ${origin.y})` : undefined}>
      <Path d={d} fill={open ? '#bbd5fa' : fill} stroke="#6e8195" strokeWidth={2} />
    </G>
  );
}

function Tire({
  x,
  y,
  label,
  id,
  psi,
  onPress,
}: {
  x: number;
  y: number;
  label: string;
  id: DoorKey;
  psi: number;
  onPress: (id: DoorKey) => void;
}) {
  const colors = useTheme();
  const critical = criticalPressure(psi);
  const low = lowPressure(psi);
  const fill = critical ? (colors.mode === 'dark' ? '#3A1518' : '#fff0f1') : low ? (colors.mode === 'dark' ? '#3A2A10' : '#fff5e6') : colors.card;
  const stroke = critical ? (colors.mode === 'dark' ? '#7A3038' : '#e6acb3') : low ? (colors.mode === 'dark' ? '#7A5A22' : '#eac28a') : (colors.mode === 'dark' ? '#3A3A3C' : '#dfe6ef');
  const value = critical ? (colors.mode === 'dark' ? '#FF6961' : '#d44258') : low ? (colors.mode === 'dark' ? '#FF9F0A' : '#ca8d3c') : (colors.mode === 'dark' ? '#F2F2F7' : '#344c65');
  const caption = colors.mode === 'dark' ? '#8E8E93' : '#8c9cae';
  return (
    <G onPress={() => onPress(id)}>
      <Rect x={x} y={y} width={76} height={41} rx={12} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <SvgText x={x + 38} y={y + 16} textAnchor="middle" fill={caption} fontSize={10} fontWeight="800">
        {label}
      </SvgText>
      <SvgText x={x + 38} y={y + 33} textAnchor="middle" fill={value} fontSize={12} fontWeight="800">
        {`${psi} PSI`}
      </SvgText>
    </G>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingBottom: 78 },
});
