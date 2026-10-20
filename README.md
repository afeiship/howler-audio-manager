# howler-audio-manager

> H5/Web audio management powered by howler.js — enum-driven preset sounds, dual caching (effect cache + URL audio cache), singleton dynamic URL playback, and zero memory leak on destroy.

[![version][version-image]][version-url]
[![license][license-image]][license-url]
[![download][download-image]][download-url]

## Features

- **Enum-driven**: TypeScript generic `AudioManager<K>` accepts your own sound enum / union type — no hardcoded business keys.
- **Dual caching**: independent `effectCache` (keyed by enum) and `urlAudioCache` (keyed by full url).
- **Singleton URL audio**: dynamic audio (voice/TTS/BGM) keeps a single active channel by default; new playback stops the previous one (opt out with `singleton: false`).
- **Overlap prevention**: replaying the same key/url always stops the previous play first.
- **Preload strategy**: effects preload eagerly (`preload: true`) for zero-latency feedback; URLs preload on demand or via `preloadUrl(s)`.
- **Zero memory leak**: `destroy()` unloads every `Howl`, clears both caches and all event listeners — safe for SPA route unmounts.
- **Dual-layer events**: per-call callbacks (`onStart`/`onEnd`/`onError`/`onStop`) plus a global event bus whose subscription returns `{ destroy }` — no `off()` needed.

## Installation

```shell
pnpm add @jswork/howler-audio-manager howler
```

`howler` is a peer dependency.

## Quick Start

```typescript
import { AudioManager } from '@jswork/howler-audio-manager';

// 1. Business-side sound enum
export enum SoundEffect {
  Click = 'CLICK',
  Success = 'SUCCESS',
  Fail = 'FAIL',
  Reward = 'REWARD'
}

// 2. Resource map
const SOUND_CONFIG: Record<SoundEffect, string> = {
  [SoundEffect.Click]: 'https://cdn.example.com/audio/click.mp3',
  [SoundEffect.Success]: 'https://cdn.example.com/audio/success.mp3',
  [SoundEffect.Fail]: 'https://cdn.example.com/audio/fail.mp3',
  [SoundEffect.Reward]: 'https://cdn.example.com/audio/reward.mp3'
};

// 3. Instantiate with full type constraints
const audioManager = new AudioManager<SoundEffect>();
audioManager.loadEffects(SOUND_CONFIG);

// 4. Play a preset effect
audioManager.playEffect(SoundEffect.Success);

// 5. Play dynamic URL audio (voice / lesson reading / TTS)
audioManager.playUrl('https://cdn.example.com/voice/lesson-01.mp3', {
  onStart: () => console.log('playback started'),
  onEnd: () => console.log('playback finished'),
  onError: (_, err) => console.error('playback failed', err)
});

// 6. Clean up on page/component unmount
audioManager.destroy();
```

## React Hooks

在 React 项目中通过 Provider + hooks 接入（`react` 为可选 peer 依赖，非 React 项目使用说明见文末）。

```shell
pnpm add @jswork/howler-audio-manager howler react
```

```tsx
import { AudioManagerProvider, useAudio, useAudioEvent, useGlobalVolume, usePreload } from '@jswork/howler-audio-manager';

const manager = new AudioManager<SoundEffect>();
manager.loadEffects(SOUND_CONFIG);

export function App() {
  return (
    <AudioManagerProvider manager={manager}>
      <PlayButton />
    </AudioManagerProvider>
  );
}

function PlayButton() {
  // 1. 获取 manager 实例
  const audio = useAudio<SoundEffect>();

  // 2. 全局音量（双向绑定）
  const [volume, setVolume] = useGlobalVolume();

  // 3. 订阅事件总线（自动随组件卸载退订，无闭包陷阱）
  useAudioEvent('end', (payload) => {
    console.log('playback ended', payload);
  });

  // 4. 预加载 URL 音频
  const preload = usePreload(['https://cdn.example.com/voice/lesson-01.mp3']);

  return (
    <div>
      <button onClick={() => audio.playEffect(SoundEffect.Click)}>click</button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => setVolume(Number(e.target.value))}
      />
      <p>preload: {preload.status}</p>
    </div>
  );
}
```

| API | 签名 | 说明 |
| --- | --- | --- |
| `AudioManagerProvider` | `({ manager, children }) => JSX` | Context Provider，向下传递 `AudioManager` 实例；实例生命周期由调用方管理（不随 Provider 卸载销毁）。 |
| `useAudio` | `<K>() => AudioManager<K>` | 取 Provider 传入的实例；不在 Provider 内调用会抛出明确异常。 |
| `useAudioEvent` | `<K>(event: AudioEventType, handler: (payload) => void) => void` | 订阅全局事件；handler 永远是最新的（无 stale closure），卸载自动调用 `destroy()`。 |
| `useGlobalVolume` | `() => [number, (v: number) => void]` | 读取/设置全局音量（初始值来自 manager 的 `defaultVolume`）。 |
| `usePreload` | `(urls: string[]) => { status: 'idle' \| 'loading' \| 'loaded' \| 'error'; error: unknown }` | 批量预加载 URL 音频，状态随加载结果更新；`urls` 内容变化会重新触发。 |

> **非 React 项目注意**：hooks 从主入口导出，`react` 为 optional peerDependency。若你的打包器因找不到 `react` 报错，安装 `react`（任意 `>=16.8` 版本，仅作为打包占位）即可，不会影响现有 `AudioManager` 用法。

## API Reference

### Constructor

```typescript
new AudioManager<K extends string | number = string>(
  options?: { defaultVolume?: number },       // defaults to 1.0
  inject?: { HowlClass?: typeof Howl; HowlerObj?: typeof Howler }  // test/DI hooks
);
```

### Preset Effects

| Method | Signature | Description |
| --- | --- | --- |
| `loadEffect` | `(key: K, url: string) => void` | Load (or reload) one effect. Replaces an existing instance after `unload()`. Internally `preload: true`. |
| `loadEffects` | `(map: SoundResourceMap<K>) => void` | Batch load from a `Record<SoundEffect, url>` map. |
| `hasEffect` | `(key: K) => boolean` | Whether the key is cached. |
| `playEffect` | `(key: K, options?: PlayOptions) => number \| undefined` | Play a cached effect; stops a previous play of the same key first. Warns via `console.warn` and returns `undefined` when the key is not loaded. |
| `stopEffect` | `(key: K) => void` | Stop a playing effect. |
| `removeEffect` | `(key: K) => void` | `unload()` the effect and drop it from the cache. |

```typescript
audioManager.loadEffect(SoundEffect.Click, clickUrl);
audioManager.playEffect(SoundEffect.Click, {
  volume: 0.8,
  onStart: (id) => console.log('started', id),
  onEnd: (id) => console.log('ended', id)
});
audioManager.removeEffect(SoundEffect.Click);
```

### Dynamic URL Audio

| Method | Signature | Description |
| --- | --- | --- |
| `preloadUrl` | `(url: string) => Promise<void>` | Warm up one url in the background; resolves on `load`, rejects on `loaderror`. |
| `preloadUrls` | `(urls: string[]) => Promise<void[]>` | Parallel warm-up for a batch of urls. |
| `playUrl` | `(url: string, options?: PlayUrlOptions) => number` | Play on demand (created and cached if missing). |
| `stopUrl` | `(url: string) => void` | Stop a playing url audio. |

`PlayUrlOptions` extends `PlayOptions` with:

- `loop?: boolean` — loop playback.
- `singleton?: boolean` (default `true`) — keep a single active URL channel; set `false` to allow concurrent plays.

```typescript
// Preload next lesson while the user is on the current one
await audioManager.preloadUrls([nextUrl1, nextUrl2]);

// Singleton voice channel (default)
audioManager.playUrl(voiceUrl, { loop: false });

// Allow concurrent BGM + voice
audioManager.playUrl(bgmUrl, { loop: true, singleton: false });
```

> Mobile autoplay policy: iOS / WeChat webviews require a user gesture for the first sound output. Preloading only caches network resources and decodes instances — it never bypasses the browser policy.

### Event System

```typescript
type AudioEventType = 'play' | 'end' | 'stop' | 'pause' | 'error' | 'load';

interface AudioEventPayload<K = string> {
  type: 'effect' | 'url';
  key?: K;
  url?: string;
  soundId?: number;
  error?: unknown;
}
```

```typescript
const subscription = audioManager.on('end', (payload) => {
  if (payload.type === 'url') console.log('url finished', payload.url);
  else console.log('effect finished', payload.key);
});

// One-line teardown — no off(event, fn)
subscription.destroy();
```

All global listeners are cleared automatically when `destroy()` is called. Listener exceptions are caught and logged, so one bad handler never breaks playback.

### Global Controls

| Method | Signature | Description |
| --- | --- | --- |
| `setGlobalVolume` | `(volume: number) => void` | Set global volume (0.0 – 1.0); applied to `Howler` and to future loads. |
| `mute` | `(muted: boolean) => void` | Globally mute / unmute. |
| `stopAll` | `() => void` | Stop every playing sound and reset the active URL channel. |

### Lifecycle & Cleanup

| Method | Signature | Description |
| --- | --- | --- |
| `removeEffect` | `(key: K) => void` | Dispose a single effect instance. |
| `destroy` | `() => void` | `unload()` every cached `Howl`, clear both caches, drop all listeners, reset the singleton channel — no leaked instances. |

```typescript
// React
useEffect(() => {
  const manager = new AudioManager<SoundEffect>();
  manager.loadEffects(SOUND_CONFIG);
  return () => manager.destroy();
}, []);
```

## Development

```shell
pnpm install
pnpm run build   # tsup -> dist/index.cjs.js, dist/index.esm.js, dist/index.umd.js, dist/index.d.ts
bun test         # unit tests
```

## License

Code released under [the MIT license](https://github.com/afeiship/howler-audio-manager/blob/main/LICENSE.txt).

[version-image]: https://img.shields.io/npm/v/@jswork/howler-audio-manager
[version-url]: https://npmjs.org/package/@jswork/howler-audio-manager

[license-image]: https://img.shields.io/npm/l/@jswork/howler-audio-manager
[license-url]: https://github.com/afeiship/howler-audio-manager/blob/main/LICENSE.txt

[download-image]: https://img.shields.io/npm/dm/@jswork/howler-audio-manager
[download-url]: https://www.npmjs.com/package/@jswork/howler-audio-manager
