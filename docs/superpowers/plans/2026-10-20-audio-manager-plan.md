# AudioManager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a robust, enum-driven `AudioManager` library based on `howler.js` with dual caching, overlap prevention, singleton URL playback, and zero-leak lifecycle management.

**Architecture:** Single class driver pattern (`AudioManager<K>`) with strict TypeScript types, separated into types definition (`src/types.ts`), core implementation (`src/manager.ts`), and unified exports (`src/index.ts`). Tested via `bun test` using a dedicated Howler test mock.

**Tech Stack:** TypeScript, Howler.js, Bun (test runner), Tsup (bundler), pnpm.

---

### Task 1: Project Setup & Howler Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update package.json to declare howler peerDependencies and devDependencies**

Update `package.json` to configure `howler` as a `peerDependency` and install `howler` + `@types/howler` under `devDependencies`. Also fix package keywords and description.

```json
{
  "name": "@jswork/howler-audio-manager",
  "version": "1.0.0",
  "description": "Howler.js audio manager, enum-driven sounds for H5.",
  "npmClient": "pnpm",
  "main": "dist/index.cjs.js",
  "module": "dist/index.esm.js",
  "types": "dist/index.d.ts",
  "files": [
    "src",
    "dist"
  ],
  "prettier": "@jswork/style-guide/prettier",
  "scripts": {
    "build": "tsup",
    "test": "bun test",
    "release": "release-it"
  },
  "license": "MIT",
  "peerDependencies": {
    "howler": "^2.2.4"
  },
  "peerDependenciesMeta": {
    "howler": {
      "optional": false
    }
  },
  "devDependencies": {
    "@jswork/style-guide": "^1.0.3",
    "@jswork/tsup-banner": "^1.0.4",
    "@swc/core": "^1.5.5",
    "@types/howler": "^2.2.12",
    "@types/node": "^20.12.11",
    "esbuild-plugin-replace": "^1.4.0",
    "esbuild-plugin-umd-wrapper": "^3.0.0",
    "howler": "^2.2.4",
    "prettier": "^3.3.3",
    "tsup": "^8.2.4",
    "typescript": "^4.9.5"
  },
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org"
  },
  "homepage": "https://js.work",
  "keywords": [
    "howler",
    "audio-manager",
    "h5-audio",
    "sound-effects"
  ]
}
```

- [ ] **Step 2: Install dependencies using pnpm**

Run: `pnpm install`
Expected: Packages installed successfully, `node_modules/howler` and `node_modules/@types/howler` exist.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add howler peer and dev dependencies"
```

---

### Task 2: TypeScript Types Definition

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write types file**

Create `src/types.ts` with all types outlined in the design spec:

```typescript
export interface AudioManagerOptions {
  /** Default global volume (0.0 to 1.0), defaults to 1.0 */
  defaultVolume?: number;
}

export interface PlayOptions {
  /** Play volume override (0.0 to 1.0) */
  volume?: number;
  /** Callback triggered when playback starts */
  onStart?: (soundId: number) => void;
  /** Callback triggered when playback ends */
  onEnd?: (soundId: number) => void;
  /** Callback triggered when playback encounters an error */
  onError?: (soundId: number, error: unknown) => void;
  /** Callback triggered when playback is manually stopped */
  onStop?: (soundId: number) => void;
}

export interface PlayUrlOptions extends PlayOptions {
  /** Whether to loop the audio, defaults to false */
  loop?: boolean;
  /** Whether to stop currently playing URL audio, defaults to true */
  singleton?: boolean;
}

export type AudioEventType = 'play' | 'end' | 'stop' | 'pause' | 'error' | 'load';

export interface AudioEventPayload<K = string> {
  type: 'effect' | 'url';
  key?: K;
  url?: string;
  soundId?: number;
  error?: unknown;
}

export interface EventSubscription {
  destroy: () => void;
}

export type SoundResourceMap<K extends string | number> = Record<K, string>;
```

- [ ] **Step 2: Verify type check passes**

Run: `pnpm exec tsc --noEmit`
Expected: PASS with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): define audio manager contracts and types"
```

---

### Task 3: Test Mock Infrastructure for Howler

**Files:**
- Create: `__tests__/mock-howler.ts`

- [ ] **Step 1: Write Howler mock module**

Since `bun test` runs outside browser DOM/AudioContext, provide a lightweight, deterministic mock for `howler` to simulate audio state and lifecycle callbacks.

```typescript
type Callback = (...args: any[]) => void;

let soundIdCounter = 1;

export class MockHowl {
  public options: any;
  public stateValue: 'loaded' | 'loading' | 'unloaded' = 'loaded';
  private eventHandlers: Map<string, Callback[]> = new Map();
  private isPlaying = false;
  private currentVolume = 1.0;
  private isLoop = false;

  constructor(options: any) {
    this.options = options;
    this.currentVolume = options.volume ?? 1.0;
    if (options.preload) {
      setTimeout(() => {
        this.emit('load');
      }, 0);
    }
  }

  on(event: string, fn: Callback): this {
    const list = this.eventHandlers.get(event) || [];
    list.push(fn);
    this.eventHandlers.set(event, list);
    return this;
  }

  once(event: string, fn: Callback): this {
    const wrapper = (...args: any[]) => {
      this.off(event, wrapper);
      fn(...args);
    };
    return this.on(event, wrapper);
  }

  off(event: string, fn?: Callback): this {
    if (!fn) {
      this.eventHandlers.delete(event);
    } else {
      const list = this.eventHandlers.get(event) || [];
      this.eventHandlers.set(
        event,
        list.filter((cb) => cb !== fn)
      );
    }
    return this;
  }

  emit(event: string, ...args: any[]): void {
    const list = [...(this.eventHandlers.get(event) || [])];
    for (const fn of list) {
      fn(...args);
    }
  }

  play(): number {
    this.isPlaying = true;
    const soundId = soundIdCounter++;
    setTimeout(() => {
      this.emit('play', soundId);
    }, 0);
    return soundId;
  }

  stop(): this {
    if (this.isPlaying) {
      this.isPlaying = false;
      this.emit('stop');
    }
    return this;
  }

  pause(): this {
    if (this.isPlaying) {
      this.isPlaying = false;
      this.emit('pause');
    }
    return this;
  }

  playing(): boolean {
    return this.isPlaying;
  }

  state(): 'loaded' | 'loading' | 'unloaded' {
    return this.stateValue;
  }

  volume(vol?: number): number | this {
    if (vol !== undefined) {
      this.currentVolume = vol;
      return this;
    }
    return this.currentVolume;
  }

  loop(loop?: boolean): boolean | this {
    if (loop !== undefined) {
      this.isLoop = loop;
      return this;
    }
    return this.isLoop;
  }

  unload(): void {
    this.stateValue = 'unloaded';
    this.eventHandlers.clear();
    this.isPlaying = false;
  }
}

export const MockHowler = {
  volumeValue: 1.0,
  muted: false,
  volume(vol?: number) {
    if (vol !== undefined) {
      this.volumeValue = vol;
    }
    return this.volumeValue;
  },
  mute(muted: boolean) {
    this.muted = muted;
  },
  stop() {
    // stop all sounds
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add __tests__/mock-howler.ts
git commit -m "test: add mock infrastructure for howler"
```

---

### Task 4: Core Implementation - Preset Effects (TDD)

**Files:**
- Create: `src/manager.ts`
- Modify: `src/index.ts`
- Modify: `__tests__/index.spec.ts`

- [ ] **Step 1: Write failing tests for preset sound effects**

Replace `__tests__/index.spec.ts` with tests covering `loadEffect`, `loadEffects`, `playEffect`, `stopEffect`, `removeEffect`, and missing key warnings:

```typescript
import { describe, test, expect, spyOn, beforeEach } from 'bun:test';
import { AudioManager } from '../src';
import { MockHowl, MockHowler } from './mock-howler';

describe('AudioManager - Preset Effects', () => {
  let manager: AudioManager<string>;

  beforeEach(() => {
    manager = new AudioManager({ defaultVolume: 0.8 }, { HowlClass: MockHowl as any, HowlerObj: MockHowler as any });
  });

  test('loadEffect and loadEffects should store howl instance in cache', () => {
    manager.loadEffect('click', 'https://example.com/click.mp3');
    expect(manager.hasEffect('click')).toBe(true);

    manager.loadEffects({
      success: 'https://example.com/success.mp3',
      fail: 'https://example.com/fail.mp3',
    });
    expect(manager.hasEffect('success')).toBe(true);
    expect(manager.hasEffect('fail')).toBe(true);
  });

  test('playEffect should return soundId when key exists', async () => {
    manager.loadEffect('click', 'https://example.com/click.mp3');
    let started = false;
    const soundId = manager.playEffect('click', {
      onStart: (id) => {
        started = true;
        expect(id).toBe(soundId);
      },
    });
    expect(soundId).toBeDefined();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(started).toBe(true);
  });

  test('playEffect should warn and return undefined when key does not exist', () => {
    const warnSpy = spyOn(console, 'warn');
    const result = manager.playEffect('not_found');
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('playEffect should stop previous play before re-playing same key (overlap prevention)', async () => {
    manager.loadEffect('click', 'https://example.com/click.mp3');
    manager.playEffect('click');
    const soundId2 = manager.playEffect('click');
    expect(soundId2).toBeDefined();
  });

  test('removeEffect should unload and remove from cache', () => {
    manager.loadEffect('click', 'https://example.com/click.mp3');
    expect(manager.hasEffect('click')).toBe(true);
    manager.removeEffect('click');
    expect(manager.hasEffect('click')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test`
Expected: FAIL (AudioManager constructor / methods not implemented).

- [ ] **Step 3: Implement preset effects in `src/manager.ts` and export from `src/index.ts`**

Create `src/manager.ts`:

```typescript
import { Howl, Howler } from 'howler';
import type {
  AudioManagerOptions,
  PlayOptions,
  PlayUrlOptions,
  AudioEventType,
  AudioEventPayload,
  EventSubscription,
  SoundResourceMap
} from './types';

export class AudioManager<K extends string | number = string> {
  private effectCache = new Map<K, Howl>();
  private urlAudioCache = new Map<string, Howl>();
  private activeUrlHowl: Howl | null = null;
  private globalVolume = 1.0;
  private listeners = new Map<AudioEventType, Set<(payload: AudioEventPayload<K>) => void>>();

  private HowlConstructor: typeof Howl;
  private HowlerInstance: typeof Howler;

  constructor(
    options?: AudioManagerOptions,
    inject?: { HowlClass?: typeof Howl; HowlerObj?: typeof Howler }
  ) {
    this.HowlConstructor = inject?.HowlClass ?? Howl;
    this.HowlerInstance = inject?.HowlerObj ?? Howler;
    if (typeof options?.defaultVolume === 'number') {
      this.setGlobalVolume(options.defaultVolume);
    }
  }

  hasEffect(key: K): boolean {
    return this.effectCache.has(key);
  }

  loadEffect(key: K, url: string): void {
    if (this.effectCache.has(key)) {
      this.effectCache.get(key)!.unload();
    }
    const howl = new this.HowlConstructor({
      src: [url],
      preload: true,
      volume: this.globalVolume
    });
    howl.on('load', () => {
      this.emit('load', { type: 'effect', key, url });
    });
    howl.on('loaderror', (_id: number, error: unknown) => {
      this.emit('error', { type: 'effect', key, url, error });
    });
    this.effectCache.set(key, howl);
  }

  loadEffects(map: SoundResourceMap<K>): void {
    const keys = Object.keys(map) as K[];
    for (const key of keys) {
      this.loadEffect(key, map[key]);
    }
  }

  playEffect(key: K, options?: PlayOptions): number | undefined {
    const howl = this.effectCache.get(key);
    if (!howl) {
      console.warn(`[AudioManager] Effect not found for key: ${String(key)}.`);
      return undefined;
    }

    if (howl.playing()) {
      howl.stop();
    }

    if (typeof options?.volume === 'number') {
      howl.volume(options.volume);
    }

    howl.once('play', (soundId: number) => {
      options?.onStart?.(soundId);
      this.emit('play', { type: 'effect', key, soundId });
    });

    howl.once('end', (soundId: number) => {
      options?.onEnd?.(soundId);
      this.emit('end', { type: 'effect', key, soundId });
    });

    howl.once('stop', (soundId: number) => {
      options?.onStop?.(soundId);
      this.emit('stop', { type: 'effect', key, soundId });
    });

    howl.once('playerror', (soundId: number, error: unknown) => {
      options?.onError?.(soundId, error);
      this.emit('error', { type: 'effect', key, soundId, error });
    });

    return howl.play();
  }

  stopEffect(key: K): void {
    const howl = this.effectCache.get(key);
    if (howl) {
      howl.stop();
    }
  }

  removeEffect(key: K): void {
    const howl = this.effectCache.get(key);
    if (howl) {
      howl.unload();
      this.effectCache.delete(key);
    }
  }

  on(event: AudioEventType, handler: (payload: AudioEventPayload<K>) => void): EventSubscription {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return {
      destroy: () => {
        set?.delete(handler);
      }
    };
  }

  protected emit(event: AudioEventType, payload: AudioEventPayload<K>): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const handler of set) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[AudioManager] Error in event listener for ${event}:`, err);
        }
      }
    }
  }

  setGlobalVolume(volume: number): void {
    this.globalVolume = volume;
    this.HowlerInstance.volume(volume);
  }

  mute(muted: boolean): void {
    this.HowlerInstance.mute(muted);
  }

  stopAll(): void {
    this.HowlerInstance.stop();
    this.activeUrlHowl = null;
  }

  destroy(): void {
    for (const howl of this.effectCache.values()) {
      howl.unload();
    }
    for (const howl of this.urlAudioCache.values()) {
      howl.unload();
    }
    this.effectCache.clear();
    this.urlAudioCache.clear();
    this.listeners.clear();
    this.activeUrlHowl = null;
  }
}
```

Update `src/index.ts`:

```typescript
export * from './types';
export { AudioManager } from './manager';
export { AudioManager as default } from './manager';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test`
Expected: PASS (all preset effect tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/manager.ts src/index.ts __tests__/index.spec.ts
git commit -m "feat: implement preset sound effects management"
```

---

### Task 5: Dynamic URL Audio & Preload Support (TDD)

**Files:**
- Modify: `src/manager.ts`
- Modify: `__tests__/index.spec.ts`

- [ ] **Step 1: Write failing tests for dynamic URL audio and preload**

Add test cases in `__tests__/index.spec.ts`:

```typescript
describe('AudioManager - Dynamic URL Audio', () => {
  let manager: AudioManager<string>;

  beforeEach(() => {
    manager = new AudioManager({ defaultVolume: 1.0 }, { HowlClass: MockHowl as any, HowlerObj: MockHowler as any });
  });

  test('playUrl should create and cache Howl instance, and invoke callbacks', async () => {
    let started = false;
    const url = 'https://example.com/voice.mp3';
    const soundId = manager.playUrl(url, {
      onStart: () => {
        started = true;
      },
    });
    expect(soundId).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(started).toBe(true);
  });

  test('playUrl should stop previous URL audio by default (singleton mutex)', async () => {
    const url1 = 'https://example.com/voice1.mp3';
    const url2 = 'https://example.com/voice2.mp3';

    let url1Stopped = false;
    manager.playUrl(url1, {
      onStop: () => {
        url1Stopped = true;
      },
    });

    manager.playUrl(url2);
    expect(url1Stopped).toBe(true);
  });

  test('playUrl with singleton: false should not stop previous audio', async () => {
    const url1 = 'https://example.com/voice1.mp3';
    const url2 = 'https://example.com/voice2.mp3';

    let url1Stopped = false;
    manager.playUrl(url1, {
      singleton: false,
      onStop: () => {
        url1Stopped = true;
      },
    });

    manager.playUrl(url2, { singleton: false });
    expect(url1Stopped).toBe(false);
  });

  test('preloadUrl and preloadUrls should resolve when audio loads', async () => {
    const url = 'https://example.com/preload.mp3';
    await expect(manager.preloadUrl(url)).resolves.toBeUndefined();

    const urls = ['https://example.com/1.mp3', 'https://example.com/2.mp3'];
    await expect(manager.preloadUrls(urls)).resolves.toHaveLength(2);
  });

  test('stopUrl should stop target url audio', () => {
    const url = 'https://example.com/voice.mp3';
    let stopped = false;
    manager.playUrl(url, {
      onStop: () => {
        stopped = true;
      },
    });
    manager.stopUrl(url);
    expect(stopped).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test`
Expected: FAIL (`playUrl`, `preloadUrl`, etc. are not implemented yet).

- [ ] **Step 3: Implement dynamic URL audio methods in `src/manager.ts`**

Add the following methods to `AudioManager` in `src/manager.ts`:

```typescript
  preloadUrl(url: string): Promise<void> {
    const existing = this.urlAudioCache.get(url);
    if (existing) {
      if (existing.state() === 'loaded') {
        return Promise.resolve();
      }
    }

    return new Promise<void>((resolve, reject) => {
      const howl = existing || new this.HowlConstructor({
        src: [url],
        preload: true,
        volume: this.globalVolume,
      });

      if (!existing) {
        this.urlAudioCache.set(url, howl);
      }

      howl.once('load', () => {
        this.emit('load', { type: 'url', url });
        resolve();
      });

      howl.once('loaderror', (_id: number, error: unknown) => {
        this.emit('error', { type: 'url', url, error });
        reject(error);
      });
    });
  }

  preloadUrls(urls: string[]): Promise<void[]> {
    return Promise.all(urls.map((url) => this.preloadUrl(url)));
  }

  playUrl(url: string, options?: PlayUrlOptions): number {
    let howl = this.urlAudioCache.get(url);
    if (!howl) {
      howl = new this.HowlConstructor({
        src: [url],
        preload: true,
        volume: this.globalVolume,
      });
      this.urlAudioCache.set(url, howl);
    }

    // Singleton mutex: stop currently active URL audio if singleton !== false
    const isSingleton = options?.singleton !== false;
    if (isSingleton && this.activeUrlHowl && this.activeUrlHowl !== howl && this.activeUrlHowl.playing()) {
      this.activeUrlHowl.stop();
    }

    // Overlap prevention on the same audio instance
    if (howl.playing()) {
      howl.stop();
    }

    if (options?.loop !== undefined) {
      howl.loop(options.loop);
    }

    if (typeof options?.volume === 'number') {
      howl.volume(options.volume);
    }

    if (isSingleton) {
      this.activeUrlHowl = howl;
    }

    howl.once('play', (soundId: number) => {
      options?.onStart?.(soundId);
      this.emit('play', { type: 'url', url, soundId });
    });

    howl.once('end', (soundId: number) => {
      options?.onEnd?.(soundId);
      this.emit('end', { type: 'url', url, soundId });
      if (this.activeUrlHowl === howl && !howl.loop()) {
        this.activeUrlHowl = null;
      }
    });

    howl.once('stop', (soundId: number) => {
      options?.onStop?.(soundId);
      this.emit('stop', { type: 'url', url, soundId });
      if (this.activeUrlHowl === howl) {
        this.activeUrlHowl = null;
      }
    });

    howl.once('playerror', (soundId: number, error: unknown) => {
      options?.onError?.(soundId, error);
      this.emit('error', { type: 'url', url, soundId, error });
      if (this.activeUrlHowl === howl) {
        this.activeUrlHowl = null;
      }
    });

    return howl.play();
  }

  stopUrl(url: string): void {
    const howl = this.urlAudioCache.get(url);
    if (howl) {
      howl.stop();
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test`
Expected: PASS (all URL audio tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/manager.ts __tests__/index.spec.ts
git commit -m "feat: implement dynamic url audio playback and preloading"
```

---

### Task 6: Event Subscription & Lifecycle Management (TDD)

**Files:**
- Modify: `src/manager.ts`
- Modify: `__tests__/index.spec.ts`

- [ ] **Step 1: Write failing tests for global event subscription and destroy lifecycle**

Add test suite in `__tests__/index.spec.ts`:

```typescript
describe('AudioManager - Events & Lifecycle', () => {
  let manager: AudioManager<string>;

  beforeEach(() => {
    manager = new AudioManager({ defaultVolume: 1.0 }, { HowlClass: MockHowl as any, HowlerObj: MockHowler as any });
  });

  test('on() should receive global events and destroy() should unsubscribe', async () => {
    let playCount = 0;
    const sub = manager.on('play', (payload) => {
      if (payload.type === 'effect' && payload.key === 'beep') {
        playCount++;
      }
    });

    manager.loadEffect('beep', 'https://example.com/beep.mp3');
    manager.playEffect('beep');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(playCount).toBe(1);

    sub.destroy();
    manager.playEffect('beep');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(playCount).toBe(1); // not incremented after unsubscribe
  });

  test('global control methods (setGlobalVolume, mute, stopAll)', () => {
    manager.setGlobalVolume(0.5);
    expect(MockHowler.volume()).toBe(0.5);

    manager.mute(true);
    expect(MockHowler.muted).toBe(true);

    manager.stopAll();
  });

  test('destroy() should unload all howl instances and clear maps', () => {
    manager.loadEffect('beep', 'https://example.com/beep.mp3');
    manager.playUrl('https://example.com/voice.mp3');
    manager.destroy();

    expect(manager.hasEffect('beep')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add __tests__/index.spec.ts
git commit -m "test: add comprehensive lifecycle and event subscription tests"
```

---

### Task 7: Build & Package Verification

**Files:**
- Modify: `README.md`
- Inspect: `dist/index.esm.js`, `dist/index.cjs.js`, `dist/index.d.ts`

- [ ] **Step 1: Run build**

Run: `pnpm run build`
Expected: `tsup` generates `dist/index.esm.js`, `dist/index.cjs.js`, and `dist/index.d.ts` without errors.

- [ ] **Step 2: Update README.md with comprehensive documentation and usage examples**

Update `README.md` to reflect the exact API, installation instructions, and TypeScript usage examples from PRD and Design Spec.

- [ ] **Step 3: Run all tests and build to ensure clean green state**

Run: `pnpm run test && pnpm run build`
Expected: All tests pass and build succeeds.

- [ ] **Step 4: Commit**

```bash
git add README.md dist
git commit -m "docs: update README with usage guide and api references"
```
