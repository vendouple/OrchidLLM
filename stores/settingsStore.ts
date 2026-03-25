import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Settings } from '@/lib/types';

interface SettingsState extends Settings {
  // API Mode
  apiMode: 'demo' | 'bpolly';
  bpollyKey: string;

  // Selected models
  selectedModel: string;
  selectedImageModel: string;
  selectedVideoModel: string;
  selectedAudioModel: string;

  // Session
  sessionId: string;
  demoRequestsLeft: number;

  // Actions
  setTheme: (theme: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setSystemPrompt: (prompt: string) => void;
  setApiMode: (mode: 'demo' | 'bpolly') => void;
  setBpollyKey: (key: string) => void;
  setSelectedModel: (model: string) => void;
  setSelectedImageModel: (model: string) => void;
  setSelectedVideoModel: (model: string) => void;
  setSelectedAudioModel: (model: string) => void;
  setDemoRequestsLeft: (count: number) => void;
  decrementDemoRequests: () => void;
  resetSettings: () => void;
}

const generateSessionId = () => {
  return 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
};

const defaultSettings: Omit<SettingsState,
  'setTheme' | 'toggleTheme' | 'setSystemPrompt' | 'setApiMode' | 'setBpollyKey' |
  'setSelectedModel' | 'setSelectedImageModel' | 'setSelectedVideoModel' | 'setSelectedAudioModel' |
  'setDemoRequestsLeft' | 'decrementDemoRequests' | 'resetSettings'
> = {
  theme: 'light',
  systemPrompt: 'You are a helpful AI assistant.',
  enhanceModel: 'openai',
  quickMode: 'text',
  activeToolCat: 'image',
  textTools: {
    image: false,
    video: false,
    audio: false,
    web: false,
  },
  textToolModels: {
    image: 'flux',
    video: 'video',
    audio: 'tts',
  },
  toolsModel: 'openai',
  apiMode: 'demo',
  bpollyKey: '',
  selectedModel: 'openai',
  selectedImageModel: 'flux',
  selectedVideoModel: 'video',
  selectedAudioModel: 'tts',
  sessionId: generateSessionId(),
  demoRequestsLeft: 20,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,

      setTheme: (theme) => {
        set({ theme });
        // Update HTML data-theme attribute
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', theme);
        }
      },

      toggleTheme: () => {
        const newTheme = get().theme === 'light' ? 'dark' : 'light';
        set({ theme: newTheme });
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', newTheme);
        }
      },

      setSystemPrompt: (systemPrompt) => set({ systemPrompt }),

      setApiMode: (apiMode) => set({ apiMode }),

      setBpollyKey: (bpollyKey) => set({ bpollyKey }),

      setSelectedModel: (selectedModel) => set({ selectedModel }),

      setSelectedImageModel: (selectedImageModel) => set({ selectedImageModel }),

      setSelectedVideoModel: (selectedVideoModel) => set({ selectedVideoModel }),

      setSelectedAudioModel: (selectedAudioModel) => set({ selectedAudioModel }),

      setDemoRequestsLeft: (demoRequestsLeft) => set({ demoRequestsLeft }),

      decrementDemoRequests: () => {
        set((state) => ({
          demoRequestsLeft: Math.max(0, state.demoRequestsLeft - 1),
        }));
      },

      resetSettings: () => {
        set({
          ...defaultSettings,
          sessionId: get().sessionId, // Keep same session
        });
      },
    }),
    {
      name: 'onellm_settings',
      onRehydrateStorage: () => (state) => {
        // Apply theme on rehydrate
        if (state && typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', state.theme);
        }
      },
    }
  )
);
