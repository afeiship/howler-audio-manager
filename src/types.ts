export interface AudioManagerOptions {
  /** Default global volume (0.0 to 1.0), defaults to 1.0 */
  defaultVolume?: number;
}

export interface PlayOptions {
  /** Play volume override (0.0 to 1.0) */
  volume?: number;
  /** Callback triggered when playback starts */
  onStart?: (soundId: number) => void;
  /** Callback triggered when playback ends */
  onEnd?: (soundId: number) => void;
  /** Callback triggered when playback encounters an error */
  onError?: (soundId: number, error: unknown) => void;
  /** Callback triggered when playback is manually stopped */
  onStop?: (soundId: number) => void;
}

export interface PlayUrlOptions extends PlayOptions {
  /** Whether to loop the audio, defaults to false */
  loop?: boolean;
  /** Whether to stop currently playing URL audio, defaults to true */
  singleton?: boolean;
}

export type AudioEventType = 'play' | 'end' | 'stop' | 'pause' | 'error' | 'load' | 'volume';

export interface AudioEventPayload<K = string> {
  type: 'effect' | 'url' | 'manager';
  key?: K;
  url?: string;
  soundId?: number;
  volume?: number;
  error?: unknown;
}

export interface EventSubscription {
  destroy: () => void;
}

export type SoundResourceMap<K extends string | number> = Record<K, string>;
