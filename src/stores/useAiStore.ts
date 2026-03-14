import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AiStore {
  openaiApiKey: string;
  setOpenaiApiKey: (key: string) => void;
}

export const useAiStore = create<AiStore>()(
  persist(
    (set) => ({
      openaiApiKey: '',
      setOpenaiApiKey: (openaiApiKey) => set({ openaiApiKey }),
    }),
    {
      name: 'pneumoscan-ai',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
