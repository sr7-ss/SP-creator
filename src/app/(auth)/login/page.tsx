'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        rememberMe: rememberMe ? 'true' : 'false',
        redirect: false,
      });

      if (result?.error) {
        setError('邮箱或密码错误');
      } else {
        setShowSuccess(true);
        setTimeout(() => {
          window.location.href = '/regions';
        }, 800);
      }
    } catch {
      setError('登录失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-slate-900 rounded-xl mb-3">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-white fill-current">
              <polygon points="12,2 22,20 2,20" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">KSP Assistant</h1>
          <p className="text-xs text-slate-500 mt-1">产品卖点包装助手</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400"
              required
            />
          </div>

          {/* Remember me checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-slate-800 focus:ring-slate-400"
            />
            <span className="text-xs text-slate-500">在本机保持登录（30天）</span>
          </label>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {showSuccess && (
            <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 rounded-lg px-3 py-2.5 animate-in fade-in slide-in-from-top-1 duration-300">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              登录成功，正在跳转...
            </div>
          )}

          <button
            type="submit"
            disabled={loading || showSuccess}
            className="w-full py-2.5 text-sm font-medium text-white bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '登录中...' : showSuccess ? '已登录' : '登录'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-6">
          还没有账号？{' '}
          <Link href="/register" className="text-slate-800 font-medium hover:underline">
            注册
          </Link>
        </p>
      </div>

      <p className="text-center text-[11px] text-slate-400 mt-5">
        <Link href="/privacy" className="hover:text-slate-700 hover:underline">
          你的数据如何被处理 →
        </Link>
      </p>
    </div>
  );
}
