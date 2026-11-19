/** Factory exterior colours for the Polestar 3 MY27 model (`polestar_3_2027`). */
export const PAINTS = [
  { id: 'snow', label: 'Snow', swatch: '#F3F1EC', hex: 0xf3f1ec, metalness: 0.28, roughness: 0.38 },
  {
    id: 'magnesium',
    label: 'Magnesium',
    swatch: '#CFD1D2',
    linear: [0.617256, 0.62971, 0.640288] as const,
    metalness: 0.6,
    roughness: 0.5,
  },
  { id: 'storm', label: 'Storm', swatch: '#3E4650', hex: 0x3e4650, metalness: 0.72, roughness: 0.42 },
  { id: 'space', label: 'Space', swatch: '#1A1C1F', hex: 0x1a1c1f, metalness: 0.8, roughness: 0.38 },
  { id: 'midnight', label: 'Midnight', swatch: '#173E68', hex: 0x173e68, metalness: 0.68, roughness: 0.4 },
  { id: 'krypton', label: 'Krypton', swatch: '#6A7B5C', hex: 0x6a7b5c, metalness: 0.62, roughness: 0.45 },
] as const;

export type PaintId = (typeof PAINTS)[number]['id'];
export const DEFAULT_PAINT: PaintId = 'magnesium';

export function paintById(id: PaintId) {
  return PAINTS.find((paint) => paint.id === id) ?? PAINTS[1];
}

export function shade(hex: string, amount: number) {
  const value = Number.parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const current = (value >> shift) & 255;
    const next = amount >= 0 ? current + (255 - current) * amount : current * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(next)));
  };
  const red = channel(16);
  const green = channel(8);
  const blue = channel(0);
  return `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`;
}
