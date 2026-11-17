import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { subscribe } from '../sim/simulator';
import type { ToastKind } from '../sim/types';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    let nextId = 1;
    return subscribe((notice) => {
      if (notice.type !== 'toast') return;
      const id = nextId++;
      const item = { id, message: notice.message, kind: notice.kind };
      setItems((current) => [...current.slice(-2), item]);
      setTimeout(() => {
        setItems((current) => current.filter((entry) => entry.id !== id));
      }, 3400);
    });
  }, []);
  return (
    <>
      {items.map((item, index) => (
        <Text key={item.id} style={[styles.toast, styles[item.kind], { bottom: 24 + index * 58 }]}>
          {item.message}
        </Text>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    color: '#fff',
    backgroundColor: '#233248',
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 10,
    overflow: 'hidden',
    fontSize: 13,
    fontWeight: '600',
    zIndex: 30,
  },
  info: { backgroundColor: '#233248' },
  warning: { backgroundColor: '#a7472c' },
  success: { backgroundColor: '#24775d' },
});
