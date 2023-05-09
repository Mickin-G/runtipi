import { createTranslator } from 'next-intl';
import { create } from 'zustand';
import englishMessages from '../messages/en.json';

const defaultTranslator = createTranslator({ locale: 'en', messages: englishMessages });

type UIStore = {
  menuItem: string;
  darkMode: boolean;
  translator: typeof defaultTranslator;
  setMenuItem: (menuItem: string) => void;
  setDarkMode: (darkMode: boolean) => void;
};

export const useUIStore = create<UIStore>((set) => ({
  menuItem: 'dashboard',
  darkMode: false,
  translator: defaultTranslator,
  setDarkMode: (darkMode: boolean) => {
    if (darkMode) {
      localStorage.setItem('darkMode', darkMode.toString());
      document.body.classList.add('theme-dark');
    }
    if (!darkMode) {
      localStorage.setItem('darkMode', darkMode.toString());
      document.body.classList.remove('theme-dark');
    }
    set({ darkMode });
  },
  setMenuItem: (menuItem: string) => {
    set({ menuItem });
  },
}));
