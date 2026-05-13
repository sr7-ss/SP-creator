'use client';

import { Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/lib/store';

export default function Header() {
  const { locale, setLocale, headerLeft } = useAppContext();

  return (
    <header className="sticky top-0 z-30 flex h-8 items-center justify-between px-6">
      <div>{headerLeft}</div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
        className="gap-2 text-slate-500 hover:text-slate-700"
      >
        <Globe className="h-4 w-4" />
        {locale === 'en' ? '中文' : 'EN'}
      </Button>
    </header>
  );
}
