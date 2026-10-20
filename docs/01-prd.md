# 音频管理类 (AudioManager) PRD

基于 `howler.js` 封装的通用 H5/Web 音频管理工具类，面向教育、游戏、互动营销等各类 Web 场景，提供枚举驱动的预设音效与动态 URL 音频双缓存管理。

---

## 1. 核心场景定位

在常规 H5/Web 互动应用中，音频通常划分为两类：

1. **预设短提示音效**：
   - 常见如：点击反馈、操作成功、答错提示、倒计时、奖励结算等。
   - 特点：业务端音效枚举固定或会随版本扩充，需提前加载或按需预加载，高频触发，低延迟要求。
2. **动态 URL 音频**：
   - 常见如：语音朗读、课文播报、TTS 合成音频、背景配乐（BGM）、动态题目音频等。
   - 特点：音频地址由后端接口或运行时业务动态给出，支持生命周期事件监听（开始、结束、失败）及循环播放。

---

## 2. 核心架构与需求约束

### 2.1 业务解耦（重点）
- **完全解耦**：底层 `AudioManager` 不硬编码任何业务音效 key 或 url，不内置任何具体业务逻辑。
- **类型安全**：TypeScript 泛型约束，支持业务层传入自定义的 `SoundKey` 枚举或联合类型。

### 2.2 双套缓存机制
- **预设音效缓存 (Effect Cache)**：
  - Key：业务侧传入的枚举或联合类型值（如 `SoundEnum`）。
  - Value：`Howl` 实例。
- **动态 URL 缓存 (URL Audio Cache)**：
  - Key：音频的完整 `url` 字符串。
  - Value：`Howl` 实例。

### 2.3 防重叠与互斥策略
- **相同音频播放前防重**：相同 key 或 url 再次播放前，自动停止上一次播放，避免声音重叠混音。
- **动态音频单例播放**：默认情况下动态音频（如人声/朗读）保持单一活跃通道，播放新音频前可停止前一个正在播放的 URL 音频（亦支持并发配置）。

### 2.4 资源加载与预加载策略
- **预设短音效（低延迟强诉求）**：
  - 支持批量加载配置：`loadEffects(map)`。
  - 支持单项按需加载：`loadEffect(key, url)`。
  - 内部固定开启 `preload: true`，构建时即完成音频网络拉取与解码准备，保证高频交互（点击、答题反馈）0 延迟。
  - **友好警告**：若调用 `playEffect` 播放一个尚未加载的音效 key，打印 `console.warn` 友好提示，避免静默失败。
- **动态 URL 音频（按需与可控预热）**：
  - 默认行为：`playUrl(url, ...)` 采用边下边播/按需加载，避免无脑全量下载大文件消耗带宽。
  - 主动预热能力：提供 `preloadUrl(url)` / `preloadUrls(urls)`，返回 `Promise<void>`。允许业务在明确知道下一题/下一段朗读内容时，在后台静默预热，提前缓存解码。
- **移动端自动播放兼容说明**：
  - iOS / 微信等移动端 Webview 遵循严格的 Autoplay Policy，首次声音输出必须依赖用户交互（touchstart/click）。预热仅完成网络资源与实例池缓存，不破坏浏览器播放策略。

### 2.5 播放控制、回调与事件通知
- **双层事件机制**：
  1. **局部精准回调**：`playEffect` 与 `playUrl` 均支持传参回调（`onStart`、`onEnd`、`onError`、`onStop`），适用于单次调用的就近响应。
  2. **全局事件监听 (`on`)**：
     - 支持监听音频生命周期：`'play'`（开始）、`'end'`（完成）、`'stop'`（停止）、`'pause'`（暂停）、`'error'`（错误）、`'load'`（预热/加载完成）。
     - **取消订阅极简设计**：无需繁琐的 `off(event, fn)`，`audioManager.on(...)` 直接返回一个带有 `destroy()` 的订阅对象 `{ destroy: () => void }`。在 React `useEffect` 或 Vue `onUnmounted` 中一行即可销毁。
     - 实例执行 `audioManager.destroy()` 时会自动清理所有全局事件监听器。

### 2.6 全局控制与生命周期管理
- **全局控制**：
  - 全局音量调节：`setGlobalVolume(volume)`。
  - 全局静音/取消静音：`mute(muted)`。
  - 停止所有播放：`stopAll()`。
- **资源清理与销毁**：
  - 移除单个音效缓存：`removeEffect(key)`。
  - 完整销毁：`destroy()`，调用所有已缓存 Howl 实例的 `unload()`，清空内部所有 Map，防止内存泄漏（适用于 SPA/页面卸载）。

---

## 3. API 规划（TypeScript 设计）

### 3.1 类型定义示意

```typescript
export interface PlayOptions {
  volume?: number;
  onStart?: (soundId: number) => void;
  onEnd?: (soundId: number) => void;
  onError?: (soundId: number, error: unknown) => void;
  onStop?: (soundId: number) => void;
}

export interface PlayUrlOptions extends PlayOptions {
  loop?: boolean;
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

### 3.2 核心方法概览

```typescript
export class AudioManager<K extends string | number = string> {
  constructor(options?: { defaultVolume?: number });

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

  // --- 事件订阅（返回包含 destroy 的句柄，无需手动 off） ---
  on(event: AudioEventType, handler: (payload: AudioEventPayload<K>) => void): EventSubscription;

  // --- 全局控制与生命周期 ---
  setGlobalVolume(volume: number): void;
  mute(muted: boolean): void;
  stopAll(): void;
  destroy(): void;
}
```

---

## 4. 业务侧使用示例（TypeScript）

```typescript
import { AudioManager } from '@jswork/howler-audio-manager';

// 1. 业务端自定义音效枚举
export enum SoundEffect {
  Click = 'CLICK',
  Success = 'SUCCESS',
  Fail = 'FAIL',
  Reward = 'REWARD',
}

// 2. 业务端定义资源配置映射表
const SOUND_CONFIG: Record<SoundEffect, string> = {
  [SoundEffect.Click]: 'https://cdn.example.com/audio/click.mp3',
  [SoundEffect.Success]: 'https://cdn.example.com/audio/success.mp3',
  [SoundEffect.Fail]: 'https://cdn.example.com/audio/fail.mp3',
  [SoundEffect.Reward]: 'https://cdn.example.com/audio/reward.mp3',
};

// 3. 实例化并享有类型约束
const audioManager = new AudioManager<SoundEffect>();
audioManager.loadEffects(SOUND_CONFIG);

// 4. 播放预设音效
audioManager.playEffect(SoundEffect.Success);

// 5. 播放动态 URL 音频（如语音朗读/课文/TTS）
audioManager.playUrl('https://cdn.example.com/voice/lesson-01.mp3', {
  onStart: () => console.log('开始播放课文朗读'),
  onEnd: () => console.log('课文朗读结束'),
  onError: (_, err) => console.error('播放出错', err),
});

// 6. 页面/组件卸载清理
audioManager.destroy();
```

---

## 5. 项目工程与交付规范

1. **统一语言**：全库使用 TypeScript 编写，输出完整的 `.d.ts` 类型声明文件。
2. **构建与分发**：使用 `tsup` 统一构建，同时支持 ESM、CommonJS 和 UMD 格式。
3. **代码与文档规范**：
   - 所有公开 API 必须包含清晰的 JSDoc 注释。
   - 保持架构极致精简，不加入非必要的依赖或业务抽象。
   - 单元测试（使用 bun/jest）覆盖初始化、双缓存隔离、重复播放防重、卸载销毁等关键路径。
