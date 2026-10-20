import type React from 'react';
import { describe, test, expect, beforeEach, spyOn } from 'bun:test';
import { renderHook, act } from '@testing-library/react';
import { AudioManager } from '../src';
import { AudioManagerProvider, useAudio, useAudioEvent, useGlobalVolume } from '../src/react';
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
    const spy = spyOn(console, 'error').mockImplementation(() => {});
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

