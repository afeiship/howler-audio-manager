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

