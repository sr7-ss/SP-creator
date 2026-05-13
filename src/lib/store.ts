'use client';

import { createContext, useContext } from 'react';
import { Locale } from '@/types';

interface AppContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  headerLeft: React.ReactNode;
  setHeaderLeft: (node: React.ReactNode) => void;
}

export const AppContext = createContext<AppContextType>({
  locale: 'en',
  setLocale: () => {},
  headerLeft: null,
  setHeaderLeft: () => {},
});

export function useAppContext() {
  return useContext(AppContext);
}

export function useTranslation() {
  const { locale } = useAppContext();

  const t = (key: string): string => {
    const { translations } = require('@/lib/constants/i18n');
    return translations[locale]?.[key] || key;
  };

  return { t, locale };
}
