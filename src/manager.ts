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
  private preloadPromises = new Map<string, Promise<void>>();
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
      preload: true
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
    Object.keys(map).forEach((key) => {
      const typedKey = (isNaN(Number(key)) ? key : Number(key)) as K;
      this.loadEffect(typedKey, map[key as any]);
    });
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

    // Clear handlers from previous plays to avoid stale/duplicate callbacks.
    howl.off('play');
    howl.off('end');
    howl.off('stop');
    howl.off('playerror');

    howl.once('play', (soundId: number) => {
      options?.onStart?.(soundId);
      this.emit('play', { type: 'effect', key, soundId });
    });

    howl.once('end', (soundId: number) => {
      if (typeof options?.volume === 'number') {
        howl.volume(1);
      }
      options?.onEnd?.(soundId);
      this.emit('end', { type: 'effect', key, soundId });
    });

    howl.once('stop', (soundId: number) => {
      if (typeof options?.volume === 'number') {
        howl.volume(1);
      }
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

  preloadUrl(url: string): Promise<void> {
    const existing = this.urlAudioCache.get(url);
    if (existing && existing.state() === 'loaded') {
      return Promise.resolve();
    }

    const pending = this.preloadPromises.get(url);
    if (pending) {
      return pending;
    }

    // A howl in a terminal failed state (unloaded after error) must be replaced
    // so a fresh instance can retry the load.
    const howl = existing && existing.state() !== 'unloaded' ? existing : this.createUrlHowl(url);

    const promise = new Promise<void>((resolve, reject) => {
      howl.once('load', () => {
        resolve();
      });

      howl.once('loaderror', (_id: number, error: unknown) => {
        this.urlAudioCache.delete(url);
        reject(error);
      });
    });

    this.preloadPromises.set(url, promise);
    const settle = () => {
      if (this.preloadPromises.get(url) === promise) {
        this.preloadPromises.delete(url);
      }
    };
    promise.then(settle, settle);

    return promise;
  }

  preloadUrls(urls: string[]): Promise<void[]> {
    return Promise.all(urls.map((url) => this.preloadUrl(url)));
  }

  private createUrlHowl(url: string): Howl {
    const howl = new this.HowlConstructor({
      src: [url],
      preload: true
    });
    howl.on('load', () => {
      this.emit('load', { type: 'url', url });
    });
    howl.on('loaderror', (_id: number, error: unknown) => {
      this.urlAudioCache.delete(url);
      this.emit('error', { type: 'url', url, error });
    });
    this.urlAudioCache.set(url, howl);
    return howl;
  }

  playUrl(url: string, options?: PlayUrlOptions): number {
    const howl = this.urlAudioCache.get(url) || this.createUrlHowl(url);

    // Singleton mutex: stop currently active URL audio if singleton !== false
    const isSingleton = options?.singleton !== false;
    if (
      isSingleton &&
      this.activeUrlHowl &&
      this.activeUrlHowl !== howl &&
      this.activeUrlHowl.playing()
    ) {
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

    // Clear handlers from previous plays to avoid stale/duplicate callbacks.
    howl.off('play');
    howl.off('end');
    howl.off('stop');
    howl.off('playerror');

    howl.once('play', (soundId: number) => {
      options?.onStart?.(soundId);
      this.emit('play', { type: 'url', url, soundId });
    });

    howl.once('end', (soundId: number) => {
      if (typeof options?.volume === 'number') {
        howl.volume(1);
      }
      options?.onEnd?.(soundId);
      this.emit('end', { type: 'url', url, soundId });
      if (this.activeUrlHowl === howl && !howl.loop()) {
        this.activeUrlHowl = null;
      }
    });

    howl.once('stop', (soundId: number) => {
      if (typeof options?.volume === 'number') {
        howl.volume(1);
      }
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

  on(event: AudioEventType, handler: (payload: AudioEventPayload<K>) => void): EventSubscription {
    const set = this.listeners.get(event) ?? new Set<(payload: AudioEventPayload<K>) => void>();
    this.listeners.set(event, set);
    set.add(handler);
    return {
      destroy: () => {
        set.delete(handler);
      }
    };
  }

  protected emit(event: AudioEventType, payload: AudioEventPayload<K>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.forEach((handler) => {
        try {
          handler(payload);
        } catch (err) {
          console.error(`[AudioManager] Error in event listener for ${event}:`, err);
        }
      });
    }
  }

  getGlobalVolume(): number {
    return this.globalVolume;
  }

  setGlobalVolume(volume: number): void {
    this.globalVolume = volume;
    this.HowlerInstance.volume(volume);
    this.emit('volume', { type: 'manager', volume });
  }

  mute(muted: boolean): void {
    this.HowlerInstance.mute(muted);
  }

  stopAll(): void {
    this.HowlerInstance.stop();
    this.activeUrlHowl = null;
  }

  destroy(): void {
    this.effectCache.forEach((howl) => howl.unload());
    this.urlAudioCache.forEach((howl) => howl.unload());
    this.effectCache.clear();
    this.urlAudioCache.clear();
    this.preloadPromises.clear();
    this.listeners.clear();
    this.activeUrlHowl = null;
  }
}
