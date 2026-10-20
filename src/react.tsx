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
