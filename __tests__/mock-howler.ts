type Callback = (...args: any[]) => void;

let soundIdCounter = 1;

export class MockHowl {
  public options: any;
  public stateValue: 'loaded' | 'loading' | 'unloaded' = 'loaded';
  private eventHandlers: Map<string, Callback[]> = new Map();
  private isPlaying = false;
  private currentVolume = 1.0;
  private isLoop = false;

  constructor(options: any) {
    this.options = options;
    this.currentVolume = options.volume ?? 1.0;
    if (options.preload) {
      setTimeout(() => {
        this.emit('load');
      }, 0);
    }
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
      this.emit('play', soundId);
    }, 0);
    return soundId;
  }

  stop(): this {
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
    this.stateValue = 'unloaded';
    this.eventHandlers.clear();
    this.isPlaying = false;
  }
}

export const MockHowler = {
  volumeValue: 1.0,
  muted: false,
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
    // stop all sounds
  }
};
