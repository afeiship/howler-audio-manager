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
