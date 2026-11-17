export interface PointerSurface {
  element: {
    style: { touchAction?: string };
    readonly clientWidth: number;
    readonly clientHeight: number;
    addEventListener: (type: string, listener: (event: unknown) => void, options?: unknown) => void;
    removeEventListener: (type: string, listener: (event: unknown) => void) => void;
    setPointerCapture: (id: number) => void;
    releasePointerCapture: (id: number) => void;
    getBoundingClientRect: () => { left: number; top: number; width: number; height: number; right: number; bottom: number };
    getRootNode: () => { addEventListener: () => void; removeEventListener: () => void };
  };
  setSize: (width: number, height: number) => void;
  pointer: (type: 'pointerdown' | 'pointermove' | 'pointerup', id: number, x: number, y: number) => void;
}

/** DOM stand-in so three r164 OrbitControls can receive the same pointer stream as the browser viewer. */
export function createPointerSurface(): PointerSurface {
  let width = 300;
  let height = 400;
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const addEventListener = (type: string, listener: (event: unknown) => void) => {
    const set = listeners.get(type) ?? new Set<(event: unknown) => void>();
    set.add(listener);
    listeners.set(type, set);
  };
  const removeEventListener = (type: string, listener: (event: unknown) => void) => {
    listeners.get(type)?.delete(listener);
  };
  const emit = (type: string, init: Record<string, unknown>) => {
    const event = { ...init, preventDefault() {}, stopPropagation() {} };
    listeners.get(type)?.forEach((listener) => listener(event));
  };
  return {
    element: {
      style: {},
      get clientWidth() {
        return width;
      },
      get clientHeight() {
        return height;
      },
      addEventListener,
      removeEventListener,
      setPointerCapture() {},
      releasePointerCapture() {},
      getBoundingClientRect() {
        return { left: 0, top: 0, width, height, right: width, bottom: height };
      },
      getRootNode() {
        return { addEventListener() {}, removeEventListener() {} };
      },
    },
    setSize(nextWidth: number, nextHeight: number) {
      width = Math.max(1, nextWidth);
      height = Math.max(1, nextHeight);
    },
    pointer(type, id, x, y) {
      emit(type, { pointerId: id, pointerType: 'touch', pageX: x, pageY: y, clientX: x, clientY: y, button: 0 });
    },
  };
}
