'use client';

import { useState, useEffect, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { AppContext } from '@/lib/store';
import { Locale } from '@/types';
import { trackPageView } from '@/lib/analytics/track';

export default function AppProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');
  const [headerLeft, setHeaderLeft] = useState<ReactNode>(null);
  const pathname = usePathname();

  useEffect(() => {
    const saved = localStorage.getItem('sp-locale') as Locale | null;
    if (saved) setLocale(saved);
  }, []);

  // Fire page_view on every route change (no-op when analyticsOptIn is off).
  useEffect(() => {
    if (pathname) trackPageView(pathname);
  }, [pathname]);

  const handleSetLocale = (newLocale: Locale) => {
    setLocale(newLocale);
    localStorage.setItem('sp-locale', newLocale);
  };

  return (
    <AppContext.Provider value={{ locale, setLocale: handleSetLocale, headerLeft, setHeaderLeft }}>
      {children}
    </AppContext.Provider>
  );
}
