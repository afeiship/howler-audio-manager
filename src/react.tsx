import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
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


