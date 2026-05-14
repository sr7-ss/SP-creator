'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  FolderOpen,
  BookOpen,
  MessageSquare,
  Settings,
  Search,
  Shield,
  BarChart3,
  Activity,
} from 'lucide-react';
import { useTranslation } from '@/lib/store';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/regions', icon: FolderOpen, labelKey: 'nav.projects' },
  { href: '/research', icon: Search, labelKey: 'nav.research' },
  { href: '/knowledge', icon: BookOpen, labelKey: 'nav.knowledge' },
  { href: '/reviews', icon: MessageSquare, labelKey: 'nav.reviews' },
  { href: '/settings', icon: Settings, labelKey: 'nav.settings' },
];

const adminItems = [
  { href: '/admin/usage',  icon: BarChart3, zh: 'Token 用量', en: 'Token Usage' },
  { href: '/admin/events', icon: Activity,  zh: '行为漏斗',   en: 'User Events' },
];

export default function Sidebar({ width }: { width?: number }) {
  const pathname = usePathname();
  const { t, locale } = useTranslation();
  const { data: session } = useSession();
  const isAdmin = !!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;
  const zh = locale === 'zh';

  return (
    <aside
      className="fixed left-0 top-0 z-40 h-screen border-r border-[#e8e8e8] bg-white flex flex-col"
      style={{ width: width ?? 240 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1e2a3a]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div className="flex flex-col">
          <span className="text-[15px] font-bold text-[#1e2a3a] tracking-[0.3px]">SP Creator</span>
          <span className="font-space text-[9px] text-[#99a5b4] tracking-[1.5px] uppercase">Selling Point Tool</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 mt-2">
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : item.href === '/regions'
              ? pathname.startsWith('/regions') || pathname.startsWith('/projects')
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-6 py-3 text-sm transition-all duration-200 border-l-[3px]',
                isActive
                  ? 'text-[#1e2a3a] bg-[#1e2a3a]/5 border-l-[#1e2a3a] font-semibold'
                  : 'text-[#8a95a5] border-l-transparent hover:text-[#1e2a3a] hover:bg-[#1e2a3a]/3'
              )}
            >
              <item.icon className="h-[18px] w-[18px] flex-shrink-0" />
              {t(item.labelKey)}
            </Link>
          );
        })}

        {/* Admin section — visible only to ADMIN_EMAILS users */}
        {isAdmin && (
          <>
            <div className="mt-4 mx-6 mb-1 pt-3 border-t border-[#e8e8e8] flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-[#b0b8c4]" />
              <span className="font-space text-[9px] text-[#b0b8c4] tracking-[1.5px] uppercase">
                {zh ? '管理后台' : 'Admin'}
              </span>
            </div>
            {adminItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-6 py-3 text-sm transition-all duration-200 border-l-[3px]',
                    isActive
                      ? 'text-[#1e2a3a] bg-[#1e2a3a]/5 border-l-[#1e2a3a] font-semibold'
                      : 'text-[#8a95a5] border-l-transparent hover:text-[#1e2a3a] hover:bg-[#1e2a3a]/3'
                  )}
                >
                  <item.icon className="h-[18px] w-[18px] flex-shrink-0" />
                  {zh ? item.zh : item.en}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-5 py-5 border-t border-[#e8e8e8] flex items-center gap-2.5">
        <div className="w-8 h-8 bg-[#1e2a3a] rounded-full flex items-center justify-center text-[13px] font-bold text-white">
          N
        </div>
        <span className="font-space text-[11px] text-[#b0b8c4]">MVP v0.1</span>
      </div>
    </aside>
  );
}
