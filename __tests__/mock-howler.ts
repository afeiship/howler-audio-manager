type Callback = (...args: any[]) => void;

let soundIdCounter = 1;

export const createdHowls: MockHowl[] = [];

export class MockHowl {
  public options: any;
  public stateValue: 'loaded' | 'loading' | 'unloaded' = 'loaded';
  public unloadCalls = 0;
  public stopCalls = 0;
  public hasLoadFailed = false;
  public lastLoadError: unknown = null;
  private eventHandlers: Map<string, Callback[]> = new Map();
  private isPlaying = false;
  private currentVolume = 1.0;
  private isLoop = false;

  constructor(options: any) {
    this.options = options;
    this.currentVolume = options.volume ?? 1.0;
    createdHowls.push(this);
    if (options.preload) {
      setTimeout(() => {
        if (!this.hasLoadFailed) {
          this.emit('load');
        }
      }, 0);
    }
  }

  simulateLoadError(error?: unknown): void {
    this.hasLoadFailed = true;
    this.lastLoadError = error ?? new Error('load failed');
    this.stateValue = 'unloaded';
    this.emit('loaderror', 0, this.lastLoadError);
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
      if (!this.hasLoadFailed) {
        this.emit('play', soundId);
      } else {
        this.emit('playerror', soundId, this.lastLoadError);
      }
    }, 0);
    return soundId;
  }

  stop(): this {
    this.stopCalls++;
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
    this.unloadCalls++;
    this.stateValue = 'unloaded';
    this.eventHandlers.clear();
    this.isPlaying = false;
  }
}

export const MockHowler = {
  volumeValue: 1.0,
  muted: false,
  stopCalls: 0,
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
    this.stopCalls++;
  },
  reset() {
    this.volumeValue = 1.0;
    this.muted = false;
    this.stopCalls = 0;
    createdHowls.length = 0;
  }
};
