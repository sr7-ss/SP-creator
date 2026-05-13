'use client';

import { useEffect, useState } from 'react';
import { Loader2, Users, Hash, Activity } from 'lucide-react';

const STEP_LABELS: Record<string, string> = {
  page_view: '页面访问',
  project_created: '创建项目',
  ai_packaging_started: '触发包装',
  ai_packaging_succeeded: '包装成功',
  export_completed: '导出完成',
};

interface EventsData {
  days: number;
  totals: { events: number; users: number; sessions: number };
  funnel: { step: string; sessions: number }[];
  byName: { name: string; count: number; users: number }[];
  daily: { date: string; dau: number }[];
  recent: {
    name: string;
    path: string | null;
    sessionId: string;
    props: unknown;
    createdAt: string;
  }[];
}

export default function AdminEventsPage() {
  const [data, setData] = useState<EventsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/events?days=${days}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        加载中...
      </div>
    );
  }

  if (!data) return <div className="text-slate-500">无数据</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">行为漏斗</h2>
          <p className="text-xs text-slate-500 mt-1">
            最近 {data.days} 天的客户端事件（仅包含 opt-in 用户，匿名聚合）
          </p>
        </div>
        <select
          value={days}
          onChange={e => setDays(parseInt(e.target.value))}
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
        >
          <option value="7">最近 7 天</option>
          <option value="30">最近 30 天</option>
          <option value="90">最近 90 天</option>
        </select>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-4">
        <KPI icon={Hash}     label="总事件"   value={data.totals.events.toLocaleString()} />
        <KPI icon={Users}    label="唯一用户" value={data.totals.users.toLocaleString()} />
        <KPI icon={Activity} label="独立会话" value={data.totals.sessions.toLocaleString()} />
      </div>

      {/* Funnel */}
      <Card title="核心漏斗（按 session 计）">
        <Funnel steps={data.funnel} />
      </Card>

      <div className="grid grid-cols-2 gap-6">
        {/* Top events */}
        <Card title="高频事件 Top 30">
          {data.byName.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">还没有事件，开启 Settings 里的"匿名使用统计"试一下</p>
          ) : (
            <BarList
              rows={data.byName.map(e => ({
                label: e.name,
                value: e.count,
                hint: `${e.users} 个用户`,
              }))}
            />
          )}
        </Card>

        {/* DAU trend */}
        <Card title="每日活跃">
          {data.daily.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">暂无数据</p>
          ) : (
            <DailyChart daily={data.daily} />
          )}
        </Card>
      </div>

      {/* Recent events stream */}
      <Card title="最近 50 条事件">
        {data.recent.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">暂无事件</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-slate-400">
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 font-medium">时间</th>
                <th className="text-left py-2 font-medium">事件</th>
                <th className="text-left py-2 font-medium">路径</th>
                <th className="text-left py-2 font-medium">Props</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((e, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="py-2 text-slate-400 font-space text-[10px]">
                    {new Date(e.createdAt).toLocaleString('zh-CN', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                  </td>
                  <td className="py-2 text-slate-700 font-medium">{e.name}</td>
                  <td className="py-2 text-slate-500 truncate max-w-[180px]">{e.path || '-'}</td>
                  <td className="py-2 text-slate-500 font-space text-[10px] truncate max-w-[260px]">
                    {e.props ? JSON.stringify(e.props) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function KPI({ icon: Icon, label, value }: { icon: typeof Hash; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 uppercase tracking-wider">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-2xl font-bold text-slate-900 mt-1.5">{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="text-sm font-semibold text-slate-800 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Funnel({ steps }: { steps: { step: string; sessions: number }[] }) {
  if (steps.length === 0 || steps[0].sessions === 0) {
    return <p className="text-xs text-slate-400 py-4 text-center">还没有 page_view 事件，开启 Settings 里的"匿名使用统计"后访问几次页面再来看</p>;
  }
  const top = steps[0].sessions;
  return (
    <div className="space-y-3">
      {steps.map((s, i) => {
        const pct = top > 0 ? (s.sessions / top) * 100 : 0;
        const dropPct = i === 0 ? null : steps[i - 1].sessions > 0 ? Math.round(100 - (s.sessions / steps[i - 1].sessions) * 100) : 0;
        return (
          <div key={s.step}>
            <div className="flex items-baseline justify-between text-xs mb-1">
              <span className="text-slate-700 font-medium">{STEP_LABELS[s.step] || s.step}</span>
              <div className="flex gap-3 items-baseline">
                <span className="text-slate-800 font-semibold">{s.sessions}</span>
                {dropPct !== null && dropPct > 0 && <span className="text-[10px] text-red-500">↓ {dropPct}%</span>}
              </div>
            </div>
            <div className="h-3 bg-slate-100 rounded overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-slate-700 to-slate-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BarList({ rows }: { rows: { label: string; value: number; hint?: string }[] }) {
  const max = Math.max(...rows.map(r => r.value), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={i}>
          <div className="flex items-baseline justify-between text-xs mb-1">
            <span className="text-slate-700 font-medium font-space text-[11px]">{r.label}</span>
            <span className="text-slate-500">{r.value.toLocaleString()}</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-slate-800 rounded-full" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          {r.hint && <div className="text-[10px] text-slate-400 mt-0.5">{r.hint}</div>}
        </div>
      ))}
    </div>
  );
}

function DailyChart({ daily }: { daily: { date: string; dau: number }[] }) {
  const max = Math.max(...daily.map(d => d.dau), 1);
  return (
    <div className="flex items-end gap-1 h-32">
      {daily.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end group relative">
          <div
            className="w-full bg-slate-700 hover:bg-slate-900 rounded-t transition-colors"
            style={{ height: `${(d.dau / max) * 100}%`, minHeight: 1 }}
            title={`${d.date}: ${d.dau} active`}
          />
          {i % Math.ceil(daily.length / 8) === 0 && (
            <span className="text-[9px] text-slate-400 mt-1 whitespace-nowrap">
              {d.date.slice(5)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
