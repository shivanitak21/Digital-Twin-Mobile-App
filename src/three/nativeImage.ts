import { File, Paths } from 'expo-file-system';
import { Image } from 'react-native';

/**
 * GLTFLoader turns embedded images into blobs, then loads them through a DOM image.
 * React Native's Blob refuses ArrayBuffer parts and has no arrayBuffer(), so the loader
 * reports "Couldn't load texture blob:…". This keeps the bytes in memory, writes a
 * file:// image, and gives expo-gl the localUri it can upload.
 */
type Listener = (event?: unknown) => void;

interface BlobUrl {
  createObjectURL?: (blob: unknown) => string;
  revokeObjectURL?: (url: string) => void;
}

class MemoryBlob {
  readonly bytes: Uint8Array;
  readonly size: number;
  readonly type: string;

  constructor(parts: unknown[] = [], options?: { type?: string }) {
    const chunks: Uint8Array[] = [];
    for (const part of parts) {
      if (part instanceof ArrayBuffer) chunks.push(new Uint8Array(part));
      else if (ArrayBuffer.isView(part)) chunks.push(new Uint8Array(part.buffer, part.byteOffset, part.byteLength));
      else if (part instanceof MemoryBlob) chunks.push(part.bytes);
    }
    const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.bytes = bytes;
    this.size = size;
    this.type = options?.type ?? '';
  }

  arrayBuffer() {
    return Promise.resolve(this.bytes.buffer.slice(this.bytes.byteOffset, this.bytes.byteOffset + this.bytes.byteLength));
  }
}

const textures = new Map<string, Uint8Array>();
let sequence = 0;
let installed = false;

export function installNativeImageShim() {
  if (installed) return;
  installed = true;
  const scope = globalThis as unknown as {
    self?: object;
    document?: object;
    URL?: BlobUrl;
  };
  if (!scope.self) scope.self = scope;
  ensureUserAgent();
  const urlApi: BlobUrl = scope.URL ?? {};
  scope.URL = urlApi;
  const previousRevoke = urlApi.revokeObjectURL?.bind(urlApi);
  urlApi.createObjectURL = (blob: unknown) => {
    const id = `gm-${++sequence}`;
    if (!(blob instanceof MemoryBlob) || blob.bytes.byteLength === 0) {
      throw new Error('Texture bytes were not available');
    }
    textures.set(id, blob.bytes);
    return `blob:gaussmoto/${id}`;
  };
  urlApi.revokeObjectURL = (url: string) => {
    const id = url.split('/').pop();
    if (id) textures.delete(id);
    previousRevoke?.(url);
  };
  scope.document = {
    createElement: (name: string) => createElement(name),
    createElementNS: (_namespace: string, name: string) => createElement(name),
  };
}

/** GLTFLoader must construct blobs while this replacement is in place. */
export async function withEmbeddedTextures<T>(work: () => Promise<T>): Promise<T> {
  installNativeImageShim();
  const host = globalThis as { Blob?: unknown };
  const previous = host.Blob;
  host.Blob = MemoryBlob;
  try {
    return await work();
  } finally {
    host.Blob = previous;
  }
}

function ensureUserAgent() {
  const host = globalThis as { navigator?: { userAgent?: string; product?: string } };
  const current = host.navigator;
  if (typeof current?.userAgent === 'string' && current.userAgent.length > 0) return;
  try {
    if (current) {
      Object.defineProperty(current, 'userAgent', { value: 'ReactNative', configurable: true });
      if (typeof current.userAgent === 'string') return;
    }
  } catch {
    // Native navigator objects sometimes reject new fields.
  }
  try {
    Object.defineProperty(host, 'navigator', {
      value: { ...(current ?? {}), userAgent: 'ReactNative', product: current?.product ?? 'ReactNative' },
      configurable: true,
    });
  } catch {
    // GLTFLoader only needs a string here.
  }
}

function createElement(name: string) {
  if (name === 'img') return createImage();
  if (name === 'canvas') return createCanvas();
  return { style: {} };
}

function createImage() {
  const listeners: Record<string, Listener[]> = {};
  const image = {
    width: 4,
    height: 4,
    naturalWidth: 4,
    naturalHeight: 4,
    complete: false,
    crossOrigin: null as string | null,
    localUri: '',
    style: {} as Record<string, string>,
    addEventListener(type: string, listener: Listener) {
      (listeners[type] ??= []).push(listener);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners[type] = (listeners[type] ?? []).filter((item) => item !== listener);
    },
    set src(value: string) {
      let bytes: Uint8Array;
      try {
        bytes = takeBytes(value);
      } catch (error) {
        listeners.error?.forEach((listener) => listener.call(image, error));
        return;
      }
      void writeTexture(bytes)
        .then((file) => {
          image.localUri = file.uri;
          image.width = file.width;
          image.height = file.height;
          image.naturalWidth = file.width;
          image.naturalHeight = file.height;
          image.complete = true;
          listeners.load?.forEach((listener) => listener.call(image));
        })
        .catch((error: unknown) => {
          console.warn('Texture file write failed', error);
          listeners.error?.forEach((listener) => listener.call(image, error));
        });
    },
    get src() {
      return image.localUri;
    },
  };
  return image;
}

function createCanvas() {
  return {
    width: 1,
    height: 1,
    style: {},
    getContext() {
      return { drawImage() {}, clearRect() {} };
    },
  };
}

function takeBytes(uri: string) {
  const id = uri.startsWith('blob:gaussmoto/') ? uri.slice('blob:gaussmoto/'.length) : '';
  const bytes = id ? textures.get(id) : undefined;
  if (!bytes) throw new Error(`Texture image was not found for ${uri}`);
  return bytes;
}

async function writeTexture(bytes: Uint8Array) {
  const file = new File(Paths.cache, `gm-tex-${++sequence}.${sniff(bytes)}`);
  if (file.exists) file.delete();
  file.create();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  await file.write(copy);
  const size = await measure(file.uri);
  return { uri: file.uri, width: size.width, height: size.height };
}

function sniff(bytes: Uint8Array) {
  if (bytes.length > 3 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  if (bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  return 'png';
}

function measure(uri: string) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width: Math.max(1, width), height: Math.max(1, height) }),
      () => resolve({ width: 1024, height: 1024 }),
    );
  });
}
