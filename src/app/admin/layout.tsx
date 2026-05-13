import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/config';
import { isAdminEmail } from '@/lib/auth/admin-flag';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Activity } from 'lucide-react';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    redirect('/');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-6">
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            返回首页
          </Link>
          <span className="text-slate-200">|</span>
          <h1 className="text-sm font-semibold text-slate-800">管理后台</h1>
          <nav className="ml-auto flex items-center gap-1 text-xs">
            <AdminNavLink href="/admin/usage" icon={BarChart3}>Token 用量</AdminNavLink>
            <AdminNavLink href="/admin/events" icon={Activity}>行为漏斗</AdminNavLink>
          </nav>
          <span className="text-[10px] text-slate-400">{session.user.email}</span>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  );
}

function AdminNavLink({ href, icon: Icon, children }: { href: string; icon: typeof BarChart3; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-2.5 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 inline-flex items-center gap-1.5 transition-colors"
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </Link>
  );
}
