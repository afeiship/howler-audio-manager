# React Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `@jswork/howler-audio-manager` 添加一组 React hooks（Context Provider + hooks），并从主入口导出，方便 React 项目接入。

**Architecture:** 新建单文件 `src/react.tsx`，包含 `AudioManagerProvider`（Context）与 4 个 hooks（`useAudio` / `useAudioEvent` / `useGlobalVolume` / `usePreload`）；`src/index.ts` 重新导出。`AudioManager` 增加一个只读的 `getGlobalVolume()` 方法供 hooks 读取初始音量。react 作为 optional peerDependency，构建时 external。

**Tech Stack:** TypeScript 4.9 + tsup + bun test + @testing-library/react + happy-dom。

**已确认的用户决策：**
1. 接入方式 = Context Provider + hooks（可选传实例的独立 hooks 不做，`useAudioEvent`/`useGlobalVolume`/`usePreload` 均从 Context 取实例）
2. 导出方式 = 并入主入口（`import { useAudio } from '@jswork/howler-audio-manager'`）
   - ⚠️ 已知代价：非 React 项目在打包时解析 `react` 会失败，需要安装 react 或提示。README 中需说明。

---

## File Structure

| 文件 | 职责 |
| --- | --- |
| Create: `src/react.tsx` | Provider + 4 个 hooks，唯一的新源码文件 |
| Modify: `src/manager.ts` | 增加 `getGlobalVolume()` 只读方法（约 3 行） |
| Modify: `src/index.ts` | 重新导出 `./react` |
| Modify: `package.json` | react/react-dom/@types 为 devDeps；react 为 optional peerDep；`sideEffects` 无改动 |
| Modify: `tsconfig.json` | 增加 `"jsx": "react-jsx"` |
| Modify: `tsup.config.ts` | `external: ['react']` |
| Create: `bunfig.toml` | bun test 的 happy-dom 预加载 |
| Create: `__tests__/setup.ts` | 注册 happy-dom 全局 |
| Test: `__tests__/react.spec.tsx` | 所有 hooks 测试（一个文件） |
| Modify: `README.md` | 新增 React Hooks 章节 |

---

### Task 1: 工程基建（依赖、jsx、测试环境）

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Modify: `tsup.config.ts`
- Create: `bunfig.toml`
- Create: `__tests__/setup.ts`

- [ ] **Step 1: 修改 `package.json`**

在 `devDependencies` 中加入（版本以安装时解析结果为准，写 `latest` 语义即可，执行时用 `pnpm add -D` 落盘）：

```json
"devDependencies": {
  "@happy-dom/global-registrator": "^15.11.7",
  "@testing-library/react": "^16.1.0",
  "@types/react": "^18.3.12",
  "@types/react-dom": "^18.3.1",
  "react": "^18.3.1",
  "react-dom": "^18.3.1"
}
```

在 `peerDependencies` 中加入 react（optional）：

```json
"peerDependencies": {
  "howler": "^2.2.4",
  "react": ">=16.8.0"
},
"peerDependenciesMeta": {
  "howler": { "optional": false },
  "react": { "optional": true }
}
```

- [ ] **Step 2: 安装依赖**

Run: `pnpm add -D react@18 react-dom@18 @types/react@18 @types/react-dom@18 @testing-library/react @happy-dom/global-registrator`
Expected: 安装成功，无 peer 冲突报错。

- [ ] **Step 3: 修改 `tsconfig.json`**

在 `compilerOptions` 中加入一行（紧跟 `"esModuleInterop": true,` 之后）：

```json
"jsx": "react-jsx",
```

- [ ] **Step 4: 修改 `tsup.config.ts`**

把 `baseOptions` 中被注释的 external 打开（改这一行）：

```ts
  external: ['react'],
```

（UMD 构建不需要改，UMD 入口本来就不含 react 调用路径以外的内容；react 在 UMD 中会被 umdWrapper 的 global 处理，若 UMD 构建因 react 报错，再把同样的一行加进 `umdOptions`。）

- [ ] **Step 5: 创建 `bunfig.toml`**

```toml
[test]
preload = ["./__tests__/setup.ts"]
```

- [ ] **Step 6: 创建 `__tests__/setup.ts`**

```ts
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
```

- [ ] **Step 7: 跑现有测试确认没坏**

Run: `bun test`
Expected: 全部 PASS（现有 index.spec.ts 不受影响）。

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json tsup.config.ts bunfig.toml __tests__/setup.ts
git commit -m "chore: add react dev dependencies and happy-dom test environment"
```

---

### Task 2: `AudioManager.getGlobalVolume()`

**Files:**
- Modify: `src/manager.ts`（在 `setGlobalVolume` 前面加方法）
- Test: `__tests__/index.spec.ts`（新增一个 describe）

- [ ] **Step 1: 写失败测试**

在 `__tests__/index.spec.ts` 末尾追加：

```ts
describe('AudioManager - Global Volume', () => {
  test('getGlobalVolume should return current global volume', () => {
    MockHowler.reset();
    const manager = new AudioManager(
      { defaultVolume: 0.5 },
      { HowlClass: MockHowl as any, HowlerObj: MockHowler as any }
    );
    expect(manager.getGlobalVolume()).toBe(0.5);
    manager.setGlobalVolume(0.9);
    expect(manager.getGlobalVolume()).toBe(0.9);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test __tests__/index.spec.ts -t "getGlobalVolume"`
Expected: FAIL，`getGlobalVolume is not a function`。

- [ ] **Step 3: 实现**

在 `src/manager.ts` 中，`setGlobalVolume` 方法之前插入：

```ts
  getGlobalVolume(): number {
    return this.globalVolume;
  }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/manager.ts __tests__/index.spec.ts
git commit -m "feat: add getGlobalVolume accessor to AudioManager"
```

---

### Task 3: `AudioManagerProvider` + `useAudio` + `useAudioEvent`

**Files:**
- Create: `src/react.tsx`
- Test: `__tests__/react.spec.tsx`

- [ ] **Step 1: 写失败测试**

创建 `__tests__/react.spec.tsx`：

```tsx
import { describe, test, expect, beforeEach } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { AudioManager } from '../src';
import { AudioManagerProvider, useAudio, useAudioEvent } from '../src/react';
import { MockHowl, MockHowler } from './mock-howler';

describe('React hooks - Provider / useAudio / useAudioEvent', () => {
  let manager: AudioManager<string>;

  beforeEach(() => {
    MockHowler.reset();
    manager = new AudioManager(
      {},
      { HowlClass: MockHowl as any, HowlerObj: MockHowler as any }
    );
  });

  const wrapper = ({ children }: { children?: React.ReactNode }) => (
    <AudioManagerProvider manager={manager}>{children}</AudioManagerProvider>
  );

  test('useAudio should throw when used outside provider', () => {
    const spy = spyOn(console, 'error');
    expect(() => renderHook(() => useAudio())).toThrow(
      'useAudio must be used within an <AudioManagerProvider>'
    );
    spy.mockRestore();
  });

  test('useAudio should return the manager instance from provider', () => {
    const { result } = renderHook(() => useAudio(), { wrapper });
    expect(result.current).toBe(manager);
  });

  test('useAudioEvent should receive events and clean up on unmount', async () => {
    const received: string[] = [];
    const { unmount } = renderHook(
      () =>
        useAudioEvent('play', (payload) => {
          received.push(payload.type);
        }),
      { wrapper }
    );

    manager.loadEffect('click', 'https://example.com/click.mp3');
    manager.playEffect('click');
    await new Promise((r) => setTimeout(r, 10));
    expect(received).toEqual(['effect']);

    unmount();
    manager.playEffect('click');
    await new Promise((r) => setTimeout(r, 10));
    expect(received.length).toBe(1);
  });

  test('useAudioEvent should call the latest handler (no stale closure)', async () => {
    let count = 0;
    const { rerender } = renderHook(
      ({ n }) =>
        useAudioEvent('play', () => {
          count = n;
        }),
      { wrapper, initialProps: { n: 1 } }
    );

    rerender({ n: 2 });
    manager.loadEffect('click', 'https://example.com/click.mp3');
    manager.playEffect('click');
    await new Promise((r) => setTimeout(r, 10));
    expect(count).toBe(2);
  });
});
```

注意：测试文件顶部需要 `spyOn`，把第一行改成：

```ts
import { describe, test, expect, beforeEach, spyOn } from 'bun:test';
```

还需要 `React` 类型可用：在文件顶部加 `import type React from 'react';`（jsx 自动 runtime，无需 import React 值）。

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test __tests__/react.spec.tsx`
Expected: FAIL，`Cannot find module '../src/react'`。

- [ ] **Step 3: 实现 `src/react.tsx`（本任务范围内的部分）**

创建 `src/react.tsx`：

```tsx
import { createContext, useContext, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { AudioManager } from './manager';
import type { AudioEventType, AudioEventPayload } from './types';

const AudioManagerContext = createContext<AudioManager | null>(null);

export interface AudioManagerProviderProps<K extends string | number = string> {
  manager: AudioManager<K>;
  children?: ReactNode;
}

export function AudioManagerProvider<K extends string | number = string>({
  manager,
  children
}: AudioManagerProviderProps<K>) {
  return (
    <AudioManagerContext.Provider value={manager as AudioManager}>
      {children}
    </AudioManagerContext.Provider>
  );
}

export function useAudio<K extends string | number = string>(): AudioManager<K> {
  const manager = useContext(AudioManagerContext);
  if (!manager) {
    throw new Error('useAudio must be used within an <AudioManagerProvider>.');
  }
  return manager as AudioManager<K>;
}

export function useAudioEvent<K extends string | number = string>(
  event: AudioEventType,
  handler: (payload: AudioEventPayload<K>) => void
): void {
  const manager = useAudio<K>();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const subscription = manager.on(event, (payload) => handlerRef.current(payload));
    return () => subscription.destroy();
  }, [manager, event]);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test __tests__/react.spec.tsx`
Expected: 4 个测试全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/react.tsx __tests__/react.spec.tsx
git commit -m "feat: add AudioManagerProvider, useAudio and useAudioEvent hooks"
```

---

### Task 4: `useGlobalVolume`

**Files:**
- Modify: `src/react.tsx`
- Test: `__tests__/react.spec.tsx`

- [ ] **Step 1: 写失败测试**

在 `__tests__/react.spec.tsx` 末尾追加（复用同文件已有的 `manager`/`wrapper` 变量——它们在 describe 内部，因此把测试放进**同一个 describe**，或新建一个 describe 自建 wrapper，两种皆可。推荐新建 describe 保持独立）：

```tsx
describe('React hooks - useGlobalVolume', () => {
  let manager: AudioManager<string>;

  beforeEach(() => {
    MockHowler.reset();
    manager = new AudioManager(
      {},
      { HowlClass: MockHowl as any, HowlerObj: MockHowler as any }
    );
  });

  const wrapper = ({ children }: { children?: React.ReactNode }) => (
    <AudioManagerProvider manager={manager}>{children}</AudioManagerProvider>
  );

  test('should initialize from manager and update on set', () => {
    const { result } = renderHook(() => useGlobalVolume(), { wrapper });
    expect(result.current[0]).toBe(1);

    act(() => {
      result.current[1](0.4);
    });

    expect(result.current[0]).toBe(0.4);
    expect(manager.getGlobalVolume()).toBe(0.4);
    expect(MockHowler.volumeValue).toBe(0.4);
  });

  test('should reflect defaultVolume passed to constructor', () => {
    MockHowler.reset();
    const m = new AudioManager(
      { defaultVolume: 0.7 },
      { HowlClass: MockHowl as any, HowlerObj: MockHowler as any }
    );
    const w = ({ children }: { children?: React.ReactNode }) => (
      <AudioManagerProvider manager={m}>{children}</AudioManagerProvider>
    );
    const { result } = renderHook(() => useGlobalVolume(), { wrapper: w });
    expect(result.current[0]).toBe(0.7);
  });
});
```

并在现有 import 中补上 `useGlobalVolume`：

```ts
import { AudioManagerProvider, useAudio, useAudioEvent, useGlobalVolume } from '../src/react';
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test __tests__/react.spec.tsx -t "useGlobalVolume"`
Expected: FAIL，`useGlobalVolume is not a function`。

- [ ] **Step 3: 实现**

在 `src/react.tsx` 顶部 import 中补 `useCallback, useState`：

```tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
```

在文件末尾追加：

```tsx
export function useGlobalVolume(): [number, (volume: number) => void] {
  const manager = useAudio();
  const [volume, setVolumeState] = useState(() => manager.getGlobalVolume());

  const setVolume = useCallback(
    (next: number) => {
      manager.setGlobalVolume(next);
      setVolumeState(next);
    },
    [manager]
  );

  return [volume, setVolume];
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test __tests__/react.spec.tsx`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/react.tsx __tests__/react.spec.tsx
git commit -m "feat: add useGlobalVolume hook"
```

---

### Task 5: `usePreload`

**Files:**
- Modify: `src/react.tsx`
- Test: `__tests__/react.spec.tsx`

- [ ] **Step 1: 写失败测试**

在 `__tests__/react.spec.tsx` 末尾追加：

```tsx
describe('React hooks - usePreload', () => {
  let manager: AudioManager<string>;

  beforeEach(() => {
    MockHowler.reset();
    manager = new AudioManager(
      {},
      { HowlClass: MockHowl as any, HowlerObj: MockHowler as any }
    );
  });

  const wrapper = ({ children }: { children?: React.ReactNode }) => (
    <AudioManagerProvider manager={manager}>{children}</AudioManagerProvider>
  );

  test('should go loading -> loaded when urls resolve', async () => {
    const { result } = renderHook(
      () => usePreload(['https://example.com/a.mp3']),
      { wrapper }
    );
    expect(result.current.status).toBe('loading');
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.status).toBe('loaded');
    expect(result.current.error).toBeNull();
  });

  test('should go to error when a url fails to load', async () => {
    const { result } = renderHook(
      () => usePreload(['https://example.com/bad.mp3']),
      { wrapper }
    );
    // 模拟 loaderror：找到刚创建的 howl
    const howl = (MockHowler as any).__lastHowl;
    // fallback：从 createdHowls 取最后一个
    // （直接用 createdHowls 更稳）
    const { createdHowls } = require('./mock-howler') as typeof import('./mock-howler');
    act(() => {
      createdHowls[createdHowls.length - 1].simulateLoadError(new Error('boom'));
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.status).toBe('error');
    expect(result.current.error).not.toBeNull();
  });

  test('should stay idle for empty urls', () => {
    const { result } = renderHook(() => usePreload([]), { wrapper });
    expect(result.current.status).toBe('idle');
  });
});
```

**修正**：上面测试里 `require` 那两行不要写。改为在文件顶部 import 里直接加 `createdHowls`：

```ts
import { MockHowl, MockHowler, createdHowls } from './mock-howler';
```

`simulateLoadError` 是 `MockHowl` 实例方法，`createdHowls[last]` 类型就是 `MockHowl`，可直接调用。最终 error 用例代码：

```tsx
  test('should go to error when a url fails to load', async () => {
    const { result } = renderHook(
      () => usePreload(['https://example.com/bad.mp3']),
      { wrapper }
    );
    act(() => {
      createdHowls[createdHowls.length - 1].simulateLoadError(new Error('boom'));
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.status).toBe('error');
    expect(result.current.error).not.toBeNull();
  });
```

import 行改为：

```ts
import { AudioManagerProvider, useAudio, useAudioEvent, useGlobalVolume, usePreload } from '../src/react';
```

- [ ] **Step 2: 跑测试确认失败**

Run: `bun test __tests__/react.spec.tsx -t "usePreload"`
Expected: FAIL，`usePreload is not a function`。

- [ ] **Step 3: 实现**

在 `src/react.tsx` 末尾追加：

```tsx
export interface PreloadState {
  status: 'idle' | 'loading' | 'loaded' | 'error';
  error: unknown;
}

export function usePreload(urls: string[]): PreloadState {
  const manager = useAudio();
  const urlsKey = JSON.stringify(urls);
  const [state, setState] = useState<PreloadState>({ status: 'idle', error: null });

  useEffect(() => {
    const list: string[] = JSON.parse(urlsKey);
    if (list.length === 0) {
      setState({ status: 'idle', error: null });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading', error: null });

    manager.preloadUrls(list).then(
      () => {
        if (!cancelled) setState({ status: 'loaded', error: null });
      },
      (error) => {
        if (!cancelled) setState({ status: 'error', error });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [manager, urlsKey]);

  return state;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `bun test __tests__/react.spec.tsx`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/react.tsx __tests__/react.spec.tsx
git commit -m "feat: add usePreload hook"
```

---

### Task 6: 主入口导出 + 构建验证 + README

**Files:**
- Modify: `src/index.ts`
- Modify: `README.md`

- [ ] **Step 1: 主入口重新导出**

`src/index.ts` 改为：

```ts
export * from './types';
export { AudioManager } from './manager';
export { AudioManager as default } from './manager';
export * from './react';
```

- [ ] **Step 2: 全量测试**

Run: `bun test`
Expected: 所有测试（index.spec.ts + react.spec.tsx）全部 PASS。

- [ ] **Step 3: 构建验证**

Run: `pnpm build`
Expected: 构建成功；`dist/index.esm.js` / `dist/index.d.ts` 中可见 `useAudio`、`AudioManagerProvider` 等导出；`dist` 产物中 react 是 external（保留 `from "react"` 的 import）。

验证命令：

```bash
grep -o "useAudio\|AudioManagerProvider\|usePreload\|useGlobalVolume\|useAudioEvent" dist/index.d.ts | sort -u
```
Expected: 5 个名字都出现。

```bash
grep -c 'require("react")\|from "react"' dist/index.cjs.js dist/index.esm.js
```
Expected: 两个文件都 ≥1（react 为 external 而非被打包进来）。

- [ ] **Step 4: README 新增 React Hooks 章节**

在 README 的 `## API Reference` 之前（Quick Start 之后）插入：

````markdown
## React Hooks

在 React 项目中通过 Provider + hooks 接入（react 为可选 peer 依赖，非 React 项目无需安装时请参考下方说明）。

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

  // 2. 全局音量
  const [volume, setVolume] = useGlobalVolume();

  // 3. 订阅事件总线（自动随组件卸载退订）
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
| `AudioManagerProvider` | `({ manager, children }) => JSX` | Context Provider，向下传递 `AudioManager` 实例；实例生命周期由你管理（不随 Provider 卸载销毁）。 |
| `useAudio` | `<K>() => AudioManager<K>` | 取 Provider 传入的实例；不在 Provider 内调用会抛错。 |
| `useAudioEvent` | `<K>(event: AudioEventType, handler: (payload) => void) => void` | 订阅全局事件；handler 永远是最新的（无 stale closure），卸载自动 `destroy()`。 |
| `useGlobalVolume` | `() => [number, (v: number) => void]` | 读取/设置全局音量（初始值来自 manager 的 `defaultVolume`）。 |
| `usePreload` | `(urls: string[]) => { status: 'idle' \| 'loading' \| 'loaded' \| 'error'; error: unknown }` | 批量预加载 URL 音频，状态随加载结果更新；`urls` 内容变化会重新触发。 |

> **非 React 项目注意**：hooks 从主入口导出，`react` 为 optional peerDependency。若你的打包器因找不到 `react` 报错，安装 `react`（任意 `>=16.8` 版本，仅作为打包占位）即可，不会影响现有 `AudioManager` 用法。
````

- [ ] **Step 5: 跑一次全量测试 + 构建回归**

Run: `bun test && pnpm build`
Expected: 全 PASS、构建成功。

- [ ] **Step 6: Commit**

```bash
git add src/index.ts README.md
git commit -m "feat: export react hooks from main entry and document usage"
```

---

## 最终验收（final review 前自检）

- [ ] `bun test` 全部通过（现有 20+ 测试不回归 + 新增 hooks 测试）
- [ ] `pnpm build` 成功，`dist/index.d.ts` 含全部 5 个 hooks/组件导出
- [ ] README 有 React Hooks 使用章节
- [ ] `package.json`：react 是 optional peerDep，react/react-dom/@types 是 devDeps
- [ ] 无多余改动（只动本计划列出的文件）
