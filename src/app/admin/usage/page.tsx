'use client';

import { useEffect, useState } from 'react';
import { Loader2, Coins, Hash, Zap, TrendingUp } from 'lucide-react';

const ACTION_LABELS: Record<string, string> = {
  ai_parse_params: '参数识别（文本）',
  ai_parse_params_image: '参数识别（图片）',
  ai_analyze: '竞品分析',
  ai_ksp_tier: '卖点分级',
  ai_ksp_tier_retry: '卖点分级（重试）',
  ai_ksp_review: '卖点 Review',
  ai_packaging: '卖点包装',
  ai_packaging_retry_missing: '包装（补漏）',
  ai_packaging_retry_originality: '包装（原创性重试）',
  ai_chat: '对话',
  ai_review_analysis: '评论分析',
  ai_agent_orchestration: 'Agent 编排',
  ai_agent_packaging: 'Agent 包装',
  ai_agent_research: 'Deep Research',
  ai_agent_discovery: 'Discovery Agent',
  ai_agent_reviews: 'Reviews Agent',
  ai_agent_creative: 'Creative Agent',
  ai_agent_iter: 'Agent 迭代',
};

interface UsageData {
  days: number;
  totals: { calls: number; successCalls: number; failureCalls: number; inputTokens: number; outputTokens: number; credits: number };
  byAction: { action: string; calls: number; input: number; output: number; total: number; avgDurationMs: number | null; failures: number }[];
  byProvider: { key: string; calls: number; tokens: number; failureRate: number; avgDurationMs: number | null }[];
  topUsers: { email: string; calls: number; tokens: number; credits: number }[];
  daily: { date: string; calls: number; tokens: number }[];
  editRate: { samples: number; l1: number; l2: number; l3: number };
}

export default function AdminUsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/usage?days=${days}`)
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

  const tokensTotal = data.totals.inputTokens + data.totals.outputTokens;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Token 用量</h2>
          <p className="text-xs text-slate-500 mt-1">最近 {data.days} 天的 AI 调用聚合数据</p>
        </div>
        <select
          value={days}
          onChange={e => setDays(parseInt(e.target.value))}
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white"
        >
          <option value="7">最近 7 天</option>
          <option value="30">最近 30 天</option>
          <option value="90">最近 90 天</option>
          <option value="180">最近 180 天</option>
        </select>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4">
        <KPI icon={Hash}      label="总调用"   value={data.totals.calls.toLocaleString()} />
        <KPI icon={Zap}       label="总 Token" value={tokensTotal.toLocaleString()} />
        <KPI icon={TrendingUp} label="日均 Token" value={data.daily.length ? Math.round(tokensTotal / data.daily.length).toLocaleString() : '0'} />
        <KPI
          icon={Coins}
          label="失败率"
          value={data.totals.calls
            ? `${Math.round((data.totals.failureCalls / data.totals.calls) * 100)}%`
            : '0%'}
        />
      </div>

      {/* Daily trend */}
      <Card title="每日 Token 趋势">
        <DailyChart daily={data.daily} />
      </Card>

      {/* By action — full table for prompt-tuning comparison */}
      <Card title="按步骤拆分（含 token / 时延 / 失败）">
        {data.byAction.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">暂无数据</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-slate-400">
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 font-medium">步骤</th>
                <th className="text-right py-2 font-medium">调用</th>
                <th className="text-right py-2 font-medium">In</th>
                <th className="text-right py-2 font-medium">Out</th>
                <th className="text-right py-2 font-medium">总 Token</th>
                <th className="text-right py-2 font-medium">均时</th>
                <th className="text-right py-2 font-medium">失败</th>
              </tr>
            </thead>
            <tbody>
              {data.byAction.map(a => (
                <tr key={a.action} className="border-b border-slate-50">
                  <td className="py-2 text-slate-700 font-medium">{ACTION_LABELS[a.action] || a.action}</td>
                  <td className="py-2 text-right text-slate-600">{a.calls.toLocaleString()}</td>
                  <td className="py-2 text-right text-slate-500">{a.input.toLocaleString()}</td>
                  <td className="py-2 text-right text-slate-500">{a.output.toLocaleString()}</td>
                  <td className="py-2 text-right text-slate-800 font-medium">{a.total.toLocaleString()}</td>
                  <td className="py-2 text-right text-slate-500">{a.avgDurationMs != null ? `${a.avgDurationMs}ms` : '—'}</td>
                  <td className={`py-2 text-right ${a.failures > 0 ? 'text-red-500' : 'text-slate-300'}`}>
                    {a.failures > 0 ? a.failures : '0'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* By provider/model */}
      <Card title="按供应商 / 模型">
        {data.byProvider.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">暂无数据</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-slate-400">
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 font-medium">供应商 / 模型</th>
                <th className="text-right py-2 font-medium">调用</th>
                <th className="text-right py-2 font-medium">Token</th>
                <th className="text-right py-2 font-medium">均时</th>
                <th className="text-right py-2 font-medium">失败率</th>
              </tr>
            </thead>
            <tbody>
              {data.byProvider.map(p => (
                <tr key={p.key} className="border-b border-slate-50">
                  <td className="py-2 text-slate-700 font-space text-[11px]">{p.key}</td>
                  <td className="py-2 text-right text-slate-600">{p.calls.toLocaleString()}</td>
                  <td className="py-2 text-right text-slate-800 font-medium">{p.tokens.toLocaleString()}</td>
                  <td className="py-2 text-right text-slate-500">{p.avgDurationMs != null ? `${p.avgDurationMs}ms` : '—'}</td>
                  <td className={`py-2 text-right ${p.failureRate > 10 ? 'text-red-500 font-semibold' : p.failureRate > 0 ? 'text-amber-600' : 'text-slate-300'}`}>
                    {p.failureRate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* AI quality: edit-rate */}
      <Card title="AI 生成后编辑率（数值越高 = 用户改得越多 = prompt 越烂）">
        {data.editRate.samples === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">
            还没有样本。生成一次包装并改两笔，开启 Settings 里的"匿名使用统计"就能看到。
          </p>
        ) : (
          <div>
            <div className="grid grid-cols-3 gap-3">
              <EditRateCell label="L1 名称" value={data.editRate.l1} />
              <EditRateCell label="L2 Slogan" value={data.editRate.l2} />
              <EditRateCell label="L3 详情" value={data.editRate.l3} />
            </div>
            <p className="text-[10px] text-slate-400 mt-3">
              基于 {data.editRate.samples} 条 AI 生成结果。&lt;15% 健康；15-40% 可优化；&gt;40% prompt 该返工。
            </p>
          </div>
        )}
      </Card>

      {/* Top users */}
      <Card title="Top 20 重度用户">
        {data.topUsers.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">暂无数据</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-slate-400">
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 font-medium">用户</th>
                <th className="text-right py-2 font-medium">调用</th>
                <th className="text-right py-2 font-medium">Token</th>
                <th className="text-right py-2 font-medium">积分</th>
              </tr>
            </thead>
            <tbody>
              {data.topUsers.map((u, i) => (
                <tr key={i} className="border-b border-slate-50">
                  <td className="py-2 text-slate-700 truncate max-w-[280px]">{u.email}</td>
                  <td className="py-2 text-right text-slate-600">{u.calls.toLocaleString()}</td>
                  <td className="py-2 text-right text-slate-800 font-medium">{u.tokens.toLocaleString()}</td>
                  <td className="py-2 text-right text-slate-500">{u.credits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function EditRateCell({ label, value }: { label: string; value: number }) {
  const color = value < 15 ? 'text-emerald-600' : value < 40 ? 'text-amber-600' : 'text-red-600';
  return (
    <div className="rounded-lg border border-slate-100 p-3 text-center">
      <div className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}%</div>
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

function DailyChart({ daily }: { daily: { date: string; calls: number; tokens: number }[] }) {
  if (daily.length === 0) return <p className="text-xs text-slate-400 py-4 text-center">暂无数据</p>;
  const max = Math.max(...daily.map(d => d.tokens), 1);
  return (
    <div className="flex items-end gap-1 h-32">
      {daily.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end group relative">
          <div
            className="w-full bg-slate-700 hover:bg-slate-900 rounded-t transition-colors"
            style={{ height: `${(d.tokens / max) * 100}%`, minHeight: 1 }}
            title={`${d.date}: ${d.tokens.toLocaleString()} tokens, ${d.calls} calls`}
          />
          {i % Math.ceil(daily.length / 8) === 0 && (
            <span className="text-[9px] text-slate-400 mt-1 rotate-0 whitespace-nowrap">
              {d.date.slice(5)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
