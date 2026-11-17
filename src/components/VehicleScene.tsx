import { memo, useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as THREE from 'three';
import type { DoorKey, StudioSnapshot } from '../sim/types';
import { createVehicleViewer, type CameraName, type ViewerHandle } from '../three/createViewer';
import { createPointerSurface } from '../three/pointerSurface';

interface Handlers {
  onDoor: (door: DoorKey) => void;
  onTrunk: () => void;
  onTire: (tire: DoorKey) => void;
  onProgress: (label: string) => void;
  onFailed: (message: string) => void;
  onReady: () => void;
}

export const VehicleStage = memo(function VehicleStage({
  simRef,
  cameraRequest,
  phone,
  active,
  handlersRef,
}: {
  simRef: MutableRefObject<StudioSnapshot>;
  cameraRequest: MutableRefObject<{ name: CameraName; token: number }>;
  phone: boolean;
  active: boolean;
  handlersRef: MutableRefObject<Handlers>;
}) {
  const surface = useMemo(() => createPointerSurface(), []);
  const viewerRef = useRef<ViewerHandle | null>(null);
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .maxPointers(1)
      .runOnJS(true)
      .onBegin((event) => surface.pointer('pointerdown', 1, event.x, event.y))
      .onUpdate((event) => surface.pointer('pointermove', 1, event.x, event.y))
      .onFinalize((event) => {
        surface.pointer('pointerup', 1, event.x, event.y);
        if (Math.hypot(event.translationX, event.translationY) <= 6) viewerRef.current?.tap(event.x, event.y);
      });
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onBegin((event) => {
        surface.pointer('pointerdown', 11, event.focalX - 40, event.focalY);
        surface.pointer('pointerdown', 12, event.focalX + 40, event.focalY);
      })
      .onUpdate((event) => {
        const span = 40 * event.scale;
        surface.pointer('pointermove', 11, event.focalX - span, event.focalY);
        surface.pointer('pointermove', 12, event.focalX + span, event.focalY);
      })
      .onFinalize((event) => {
        const span = 40 * event.scale;
        surface.pointer('pointerup', 12, event.focalX + span, event.focalY);
        surface.pointer('pointerup', 11, event.focalX - span, event.focalY);
      });
    return Gesture.Exclusive(pinch, pan);
  }, [surface]);

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.fill} collapsable={false}>
        <Canvas
          style={styles.fill}
          frameloop={active ? 'always' : 'never'}
          gl={{ antialias: !phone, alpha: true, powerPreference: 'high-performance' }}
          camera={{ fov: 39, near: 0.05, far: 120, position: [6.1, 3.9, -7.2] }}
          onCreated={({ gl }) => {
            keepSupportedPixelStore(gl);
            syncExpoPixelRatio(gl);
            gl.outputColorSpace = THREE.SRGBColorSpace;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.52;
            gl.shadowMap.enabled = !phone;
            gl.shadowMap.type = THREE.PCFSoftShadowMap;
            gl.setClearColor(0xf2f5fa, 1);
          }}
        >
          <SceneBridge
            surface={surface}
            simRef={simRef}
            cameraRequest={cameraRequest}
            viewerRef={viewerRef}
            phone={phone}
            handlersRef={handlersRef}
          />
        </Canvas>
      </View>
    </GestureDetector>
  );
});

function SceneBridge({
  surface,
  simRef,
  cameraRequest,
  viewerRef,
  phone,
  handlersRef,
}: {
  surface: ReturnType<typeof createPointerSurface>;
  simRef: MutableRefObject<StudioSnapshot>;
  cameraRequest: MutableRefObject<{ name: CameraName; token: number }>;
  viewerRef: MutableRefObject<ViewerHandle | null>;
  phone: boolean;
  handlersRef: MutableRefObject<Handlers>;
}) {
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const seenToken = useRef(0);
  const handleRef = useRef<ViewerHandle | null>(null);
  const failedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled && !handleRef.current) handlersRef.current.onFailed('3D model load timed out');
    }, 90000);
    const perspective = camera as THREE.PerspectiveCamera;
    createVehicleViewer({
      scene,
      camera: perspective,
      surface,
      phone,
      onProgress: (fraction) => handlersRef.current.onProgress(`Loading vehicle model · ${Math.round(fraction * 100)}%`),
      onDoor: (door) => handlersRef.current.onDoor(door),
      onTrunk: () => handlersRef.current.onTrunk(),
      onTire: (tire) => handlersRef.current.onTire(tire),
    })
      .then((handle) => {
        if (cancelled) {
          handle.dispose();
          return;
        }
        handleRef.current = handle;
        viewerRef.current = handle;
        handle.resize(sizeRef.current.width, sizeRef.current.height);
        clearTimeout(timeout);
        handlersRef.current.onReady();
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        clearTimeout(timeout);
        handlersRef.current.onFailed(error instanceof Error ? error.message : '3D engine could not load');
      });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      handleRef.current?.dispose();
      handleRef.current = null;
      viewerRef.current = null;
    };
  }, [camera, handlersRef, phone, scene, surface, viewerRef]);

  useEffect(() => {
    handleRef.current?.resize(size.width, size.height);
    syncExpoPixelRatio(gl);
  }, [gl, size.width, size.height]);

  useFrame((_, dt) => {
    const handle = handleRef.current;
    if (!handle || failedRef.current) return;
    try {
      if (seenToken.current !== cameraRequest.current.token) {
        seenToken.current = cameraRequest.current.token;
        handle.setCamera(cameraRequest.current.name);
      }
      handle.frame(Math.min(dt, 0.1), simRef.current);
    } catch (error) {
      failedRef.current = true;
      handlersRef.current.onFailed(error instanceof Error ? error.message : '3D renderer stopped');
    }
  });
  return null;
}

const UNPACK_ALIGNMENT = 3317;
const UNPACK_FLIP_Y_WEBGL = 37440;

function syncExpoPixelRatio(gl: THREE.WebGLRenderer) {
  const context = gl.getContext();
  const size = new THREE.Vector2();
  gl.getSize(size);
  if (size.x <= 0 || context.drawingBufferWidth <= 0) return;
  const ratio = context.drawingBufferWidth / size.x;
  if (Math.abs(gl.getPixelRatio() - ratio) > 0.01) gl.setPixelRatio(ratio);
}

function keepSupportedPixelStore(gl: THREE.WebGLRenderer) {
  const context = gl.getContext() as WebGLRenderingContext & {
    pixelStorei: (pname: number, param: number) => void;
  };
  const pixelStorei = context.pixelStorei.bind(context);
  context.pixelStorei = (pname, param) => {
    if (pname === UNPACK_FLIP_Y_WEBGL || pname === UNPACK_ALIGNMENT) pixelStorei(pname, param);
  };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
