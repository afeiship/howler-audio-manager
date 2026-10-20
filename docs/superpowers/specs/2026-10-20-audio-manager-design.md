# AudioManager 设计文档 (Design Spec)

基于 `howler.js` 封装的通用 H5/Web 音频管理工具类，面向教育、游戏、互动营销等各类 Web 场景，提供枚举驱动的预设音效与动态 URL 音频双缓存管理。

---

## 1. 架构目标与设计原则

- **业务解耦**：底层不硬编码任何具体业务音频资源，通过泛型约束 `AudioManager<K>` 提供高类型安全。
- **极致精简**：采用集中式单类驱动（Single Class Driver），无冗余抽象层，易读易测。
- **双缓存隔离**：预设音效池（`effectCache`）与动态 URL 音频池（`urlAudioCache`）物理隔离，独立控制生命周期。
- **防重叠与互斥保护**：
  - 同一音频连续播放前，先停止上一次播放，避免声音重叠混音。
  - 动态音频默认单通道互斥（单例播放），播放新音频自动停止旧音频。
- **资源安全与无泄漏**：提供统一的 `destroy()` 与资源 `unload()`，保证在 SPA/微前端页面销毁时无音频句柄或监听器残留。

---

## 2. 依赖规范

- **`peerDependencies`**：声明 `"howler": "^2.2.4"`。
- **`devDependencies`**：安装 `howler` 与 `@types/howler` 供本地构建与测试。

---

## 3. 文件与模块组织

```text
src/
├── index.ts        # 统一入口，导出 AudioManager 类及所有公共类型
├── types.ts        # TypeScript 接口与类型声明
└── manager.ts      # AudioManager 核心实现类
```

---

## 4. 类型定义设计 (`src/types.ts`)

```typescript
export interface AudioManagerOptions {
  /** 默认全局音量 (0.0 ~ 1.0)，默认 1.0 */
  defaultVolume?: number;
}

export interface PlayOptions {
  /** 播放音量覆盖 (0.0 ~ 1.0) */
  volume?: number;
  /** 开始播放回调 */
  onStart?: (soundId: number) => void;
  /** 播放完成回调 */
  onEnd?: (soundId: number) => void;
  /** 播放错误回调 */
  onError?: (soundId: number, error: unknown) => void;
  /** 播放停止回调 */
  onStop?: (soundId: number) => void;
}

export interface PlayUrlOptions extends PlayOptions {
  /** 是否循环播放，默认 false */
  loop?: boolean;
  /** 是否互斥停止前一个播放中的 URL 音频，默认 true */
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

---

## 5. 核心类 API 设计 (`src/manager.ts`)

```typescript
export class AudioManager<K extends string | number = string> {
  constructor(options?: AudioManagerOptions);

  // --- 预设音效 (Effect) ---
  loadEffect(key: K, url: string): void;
  loadEffects(map: SoundResourceMap<K>): void;
  playEffect(key: K, options?: PlayOptions): number | undefined;
  stopEffect(key: K): void;
  removeEffect(key: K): void;

  // --- 动态 URL 音频 ---
  preloadUrl(url: string): Promise<void>;
  preloadUrls(urls: string[]): Promise<void[]>;
  playUrl(url: string, options?: PlayUrlOptions): number;
  stopUrl(url: string): void;

  // --- 全局事件订阅 ---
  on(event: AudioEventType, handler: (payload: AudioEventPayload<K>) => void): EventSubscription;

  // --- 全局控制与生命周期 ---
  setGlobalVolume(volume: number): void;
  mute(muted: boolean): void;
  stopAll(): void;
  destroy(): void;
}
```

---

## 6. 核心行为与关键算法细节

1. **预设音效加载与未注册提示**：
   - `loadEffect(key, url)` 内部以 `{ src: [url], preload: true, volume: this.globalVolume }` 创建 `Howl` 实例。
   - `playEffect(key)` 若在 `effectCache` 中未找到，触发 `console.warn(`[AudioManager] Effect not found for key: ${String(key)}.`)`，返回 `undefined`。
2. **防重叠与互斥停播**：
   - 播放相同 key 或相同 url 前，调用当前 Howl 实例的 `stop()`。
   - 播放动态 URL 时，若 `singleton !== false` 且存在当前活跃的 `activeUrlHowl`，调用 `activeUrlHowl.stop()`。
3. **全局事件与局部回调同步**：
   - 针对单次播放绑定 `once('play')`、`once('end')`、`once('stop')`、`once('playerror')`。
   - 分别调用传入的局部回调（如 `options.onStart`）以及触发 `this.emit(...)` 派发全局事件。
4. **事件订阅与销毁**：
   - `on(event, handler)` 返回带有 `destroy()` 方法的对象，可在组件卸载时直接调用销毁。
   - `destroy()` 遍历调用所有已缓存 Howl 实例的 `unload()`，清空 Map 引用与事件监听器。

---

## 7. 测试与验证策略

- **单元测试框架**：`bun test`。
- **Mock 机制**：建立完整的 `howler` Mock，模拟声音播放的生命周期与事件触发。
- **测试覆盖点**：
  1. 预设音效批量/按需加载，未注册提示拦截。
  2. 动态 URL 音频按需播放与预热加载（成功/失败）。
  3. 防重叠播放及单通道互斥策略。
  4. 局部回调与全局事件订阅（包含 `{ destroy }` 解绑）。
  5. 全局音量控制、静音与整体 `destroy()` 资源清理。
- **构建产物验证**：执行 `pnpm run build` 确保 ESM/CJS/DTS 正常产出。
