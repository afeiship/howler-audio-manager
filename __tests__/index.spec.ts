import { describe, test, expect, spyOn, beforeEach } from 'bun:test';
import { AudioManager } from '../src';
import { MockHowl, MockHowler, createdHowls } from './mock-howler';

describe('AudioManager - Preset Effects', () => {
  let manager: AudioManager<string>;

  beforeEach(() => {
    MockHowler.reset();
    manager = new AudioManager(
      { defaultVolume: 0.8 },
      { HowlClass: MockHowl as any, HowlerObj: MockHowler as any }
    );
  });

  test('loadEffect and loadEffects should store howl instance in cache', () => {
    manager.loadEffect('click', 'https://example.com/click.mp3');
    expect(manager.hasEffect('click')).toBe(true);

    manager.loadEffects({
      success: 'https://example.com/success.mp3',
      fail: 'https://example.com/fail.mp3'
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
      }
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
    MockHowler.reset();
    manager = new AudioManager(
      { defaultVolume: 1.0 },
      { HowlClass: MockHowl as any, HowlerObj: MockHowler as any }
    );
  });

  test('playUrl should create and cache Howl instance, and invoke callbacks', async () => {
    let started = false;
    const url = 'https://example.com/voice.mp3';
    const soundId = manager.playUrl(url, {
      onStart: () => {
        started = true;
      }
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
      }
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
      }
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
      }
    });
    manager.stopUrl(url);
    expect(stopped).toBe(true);
  });
});

describe('AudioManager - Events & Lifecycle', () => {
  let manager: AudioManager<string>;

  beforeEach(() => {
    MockHowler.reset();
    manager = new AudioManager(
      { defaultVolume: 1.0 },
      { HowlClass: MockHowl as any, HowlerObj: MockHowler as any }
    );
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

describe('AudioManager - Bugfix Coverage', () => {
  let manager: AudioManager<string>;

  beforeEach(() => {
    MockHowler.reset();
    manager = new AudioManager(
      { defaultVolume: 1.0 },
      { HowlClass: MockHowl as any, HowlerObj: MockHowler as any }
    );
  });

  test('preloadUrl should reject on load error and retry with a fresh howl instance', async () => {
    const url = 'https://example.com/retry.mp3';

    const first = manager.preloadUrl(url);
    const firstHowl = createdHowls[createdHowls.length - 1] as MockHowl;
    firstHowl.simulateLoadError(new Error('boom'));
    await expect(first).rejects.toThrow('boom');

    const countBeforeRetry = createdHowls.length;
    const second = manager.preloadUrl(url);
    expect(createdHowls.length).toBe(countBeforeRetry + 1);
    await expect(second).resolves.toBeUndefined();
  });

  test('playUrl created howl failure should be recoverable via preloadUrl', async () => {
    const url = 'https://example.com/retry-play.mp3';
    manager.playUrl(url);
    const failedHowl = createdHowls[createdHowls.length - 1] as MockHowl;

    let globalErrors = 0;
    manager.on('error', () => {
      globalErrors++;
    });

    failedHowl.simulateLoadError();
    expect(globalErrors).toBe(1);

    const countBeforeRetry = createdHowls.length;
    await expect(manager.preloadUrl(url)).resolves.toBeUndefined();
    expect(createdHowls.length).toBe(countBeforeRetry + 1);
  });

  test('loadEffects should support numeric keys', async () => {
    manager.loadEffects({
      1: 'https://example.com/u1.mp3',
      2: 'https://example.com/u2.mp3'
    } as any);
    expect(manager.hasEffect(1)).toBe(true);
    expect(manager.hasEffect(2)).toBe(true);

    let started = false;
    const soundId = manager.playEffect(1, {
      onStart: () => {
        started = true;
      }
    });
    expect(soundId).toBeGreaterThan(0);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(started).toBe(true);
  });

  test('global volume should not be baked into howl instances (no volume squaring)', () => {
    const localManager = new AudioManager(
      { defaultVolume: 0.8 },
      { HowlClass: MockHowl as any, HowlerObj: MockHowler as any }
    );

    localManager.loadEffect('click', 'https://example.com/click.mp3');
    const effectHowl = createdHowls[createdHowls.length - 1] as MockHowl;
    expect(effectHowl.options.volume).toBeUndefined();
    expect(effectHowl.volume()).toBe(1);

    localManager.playUrl('https://example.com/voice.mp3');
    const urlHowl = createdHowls[createdHowls.length - 1] as MockHowl;
    expect(urlHowl.options.volume).toBeUndefined();
    expect(urlHowl.volume()).toBe(1);

    expect(MockHowler.volume()).toBe(0.8);
  });

  test('per-play volume override should be restored after end', () => {
    manager.loadEffect('click', 'https://example.com/click.mp3');
    const howl = createdHowls[createdHowls.length - 1] as MockHowl;

    manager.playEffect('click', { volume: 0.5 });
    expect(howl.volume()).toBe(0.5);

    howl.emit('end', 1);
    expect(howl.volume()).toBe(1);
  });

  test('rapid replays should not double-dispatch play callbacks', async () => {
    manager.loadEffect('click', 'https://example.com/click.mp3');

    let playCount = 0;
    manager.on('play', (payload) => {
      if (payload.type === 'effect') {
        playCount++;
      }
    });

    let firstStarted = false;
    let secondStarted = false;
    manager.playEffect('click', {
      onStart: () => {
        firstStarted = true;
      }
    });
    manager.playEffect('click', {
      onStart: () => {
        secondStarted = true;
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(playCount).toBe(1);
    expect(firstStarted).toBe(false);
    expect(secondStarted).toBe(true);
  });

  test('concurrent preloadUrl on the same URL should emit global load once', async () => {
    const url = 'https://example.com/concurrent.mp3';

    let loadCount = 0;
    manager.on('load', (payload) => {
      if (payload.type === 'url') {
        loadCount++;
      }
    });

    const first = manager.preloadUrl(url);
    const howl = createdHowls[createdHowls.length - 1] as MockHowl;
    howl.stateValue = 'loading'; // simulate an in-flight load (mock defaults to 'loaded')
    const second = manager.preloadUrl(url);
    expect(second).toBe(first);

    await Promise.all([first, second]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(loadCount).toBe(1);
  });

  test('onEnd callback should fire when playback ends', () => {
    manager.loadEffect('click', 'https://example.com/click.mp3');
    const howl = createdHowls[createdHowls.length - 1] as MockHowl;

    let endedId: number | undefined;
    manager.playEffect('click', {
      onEnd: (id) => {
        endedId = id;
      }
    });

    howl.emit('end', 42);
    expect(endedId).toBe(42);
  });

  test('onStop callback should fire when stopUrl is called', () => {
    const url = 'https://example.com/stop-me.mp3';

    let stopped = false;
    manager.playUrl(url, {
      onStop: () => {
        stopped = true;
      }
    });

    manager.stopUrl(url);
    expect(stopped).toBe(true);
  });

  test('onError callback should fire when a playing url fails to load', async () => {
    const url = 'https://example.com/play-fail.mp3';

    let callbackError: unknown = null;
    manager.playUrl(url, {
      onError: (_id, error) => {
        callbackError = error;
      }
    });
    const howl = createdHowls[createdHowls.length - 1] as MockHowl;

    const failure = new Error('network down');
    howl.simulateLoadError(failure);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(callbackError).toBe(failure);
  });

  test('overlap prevention should stop the previous playback of the same effect', () => {
    manager.loadEffect('click', 'https://example.com/click.mp3');
    const howl = createdHowls[createdHowls.length - 1] as MockHowl;

    manager.playEffect('click');
    expect(howl.stopCalls).toBe(0);

    manager.playEffect('click');
    expect(howl.stopCalls).toBe(1);
    expect((howl as MockHowl).playing()).toBe(true);
  });

  test('stopAll should delegate to Howler global stop', () => {
    MockHowler.reset();
    manager.stopAll();
    expect(MockHowler.stopCalls).toBeGreaterThanOrEqual(1);
  });

  test('destroy should unload every instance, clear caches and stop delivering events', async () => {
    let listenerFired = false;
    manager.on('play', () => {
      listenerFired = true;
    });

    manager.loadEffect('beep', 'https://example.com/beep.mp3');
    manager.playUrl('https://example.com/voice.mp3');
    expect(createdHowls.length).toBe(2);

    manager.destroy();

    createdHowls.forEach((howl) => {
      expect((howl as MockHowl).unloadCalls).toBeGreaterThanOrEqual(1);
    });
    expect(manager.hasEffect('beep')).toBe(false);

    const warnSpy = spyOn(console, 'warn');
    const result = manager.playEffect('beep');
    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(listenerFired).toBe(false);
  });
});

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

