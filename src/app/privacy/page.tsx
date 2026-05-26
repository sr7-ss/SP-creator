'use client';

import Link from 'next/link';
import { ArrowLeft, Shield, HardDrive, Cloud, CloudOff, ExternalLink } from 'lucide-react';
import { useTranslation } from '@/lib/store';

type Destination = 'local' | 'server' | 'provider' | 'public';

interface DataRow {
  label: { zh: string; en: string };
  destination: Destination;
  note: { zh: string; en: string };
}

const DATA_ROWS: DataRow[] = [
  {
    label: { zh: '上传的 PDF / 文件', en: 'Uploaded PDFs / files' },
    destination: 'local',
    note: {
      zh: '文件字节仅存在你的浏览器中。关闭标签页后，除非你主动导出，否则不会留存。',
      en: 'Bytes live only in your browser. Unless you explicitly export, they are not persisted after the tab closes.',
    },
  },
  {
    label: { zh: '知识库条目 / SP 结果 / 包装文案', en: 'Knowledge entries / SP / packaging copy' },
    destination: 'local',
    note: {
      zh: '存于浏览器 IndexedDB（由浏览器做同源隔离，其他网站无法读取）。',
      en: 'Stored in your browser’s IndexedDB (origin-isolated — no other site can read it).',
    },
  },
  {
    label: { zh: '竞品参数 / 项目元数据', en: 'Competitor specs / project metadata' },
    destination: 'local',
    note: {
      zh: '开启隐私模式后全部本地存储；关闭时同步到服务器用于跨设备访问。',
      en: 'Fully local in privacy mode; synced to server otherwise for cross-device access.',
    },
  },
  {
    label: { zh: 'AI 调用（参数、文案、分析）', en: 'AI calls (params, copy, analysis)' },
    destination: 'provider',
    note: {
      zh: '请求由你的浏览器直接发给你指定的模型供应商（Claude / OpenAI / 智谱等），我们的服务器不在路径上。',
      en: 'Your browser calls the model provider (Claude / OpenAI / Zhipu, etc.) directly. Our server is not in the request path.',
    },
  },
  {
    label: { zh: 'API Key', en: 'API keys' },
    destination: 'local',
    note: {
      zh: '用你本地密码派生的密钥加密后存储。解密始终在浏览器内完成，明文永不离开。',
      en: 'Encrypted with a key derived from your local passphrase. Decryption happens entirely in-browser; plaintext never leaves.',
    },
  },
  {
    label: { zh: '公网搜索（Serper / Brave）', en: 'Public web search (Serper / Brave)' },
    destination: 'public',
    note: {
      zh: '发送的是公开互联网的搜索关键词，不包含你的项目内容。',
      en: 'Only public-internet keywords are sent; never your project content.',
    },
  },
  {
    label: { zh: '登录态 (JWT)', en: 'Auth session (JWT)' },
    destination: 'server',
    note: {
      zh: '仅用户标识，不含任何业务内容。免注册试用模式下无此项。',
      en: 'Identity only; no business content. Not present in guest mode.',
    },
  },
  {
    label: { zh: '匿名使用统计（可关）', en: 'Anonymous usage counts (opt-out)' },
    destination: 'server',
    note: {
      zh: '每日一次聚合计数（页面访问、功能触发次数），不含内容也不含可识别信息。默认关闭。',
      en: 'Daily aggregated counts only (page views, feature triggers). No content, no identifiers. Off by default.',
    },
  },
];

const DEST_META: Record<Destination, {
  icon: typeof HardDrive;
  labelZh: string;
  labelEn: string;
  color: string;
}> = {
  local:    { icon: HardDrive, labelZh: '你的浏览器',   labelEn: 'Your browser',       color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  provider: { icon: CloudOff,  labelZh: '模型供应商',   labelEn: 'Model provider',     color: 'bg-blue-100 text-blue-700 border-blue-200' },
  public:   { icon: ExternalLink, labelZh: '公共互联网', labelEn: 'Public internet',    color: 'bg-slate-100 text-slate-600 border-slate-200' },
  server:   { icon: Cloud,     labelZh: '我们的服务器', labelEn: 'Our server',         color: 'bg-amber-100 text-amber-700 border-amber-200' },
};

export default function PrivacyPage() {
  const { locale } = useTranslation();
  const zh = locale === 'zh';

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {zh ? '返回首页' : 'Back home'}
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {zh ? '你的数据，你做主' : 'Your data, your control'}
          </h1>
        </div>
        <p className="text-sm text-slate-500 ml-13 mb-10">
          {zh
            ? '这一页告诉你：我们"技术上做不到"看到你的机密——不是"承诺不看"。'
            : 'This page tells you what we technically cannot see — not what we promise not to see.'}
        </p>

        {/* Core promise */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 mb-8">
          <h2 className="text-base font-semibold text-slate-900 mb-3">
            {zh ? '三条原则' : 'Three principles'}
          </h2>
          <ol className="space-y-3 text-sm text-slate-600">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">1</span>
              <span>
                <strong className="text-slate-900">
                  {zh ? '敏感内容不过服务器。' : 'Sensitive content never passes our server.'}
                </strong>{' '}
                {zh
                  ? '你上传的 PDF、编辑的 SP 文案、生成的包装结果，开启隐私模式后全部存在你的浏览器内。'
                  : 'Uploaded PDFs, edited SP copy, and generated packaging stay in your browser when privacy mode is on.'}
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">2</span>
              <span>
                <strong className="text-slate-900">
                  {zh ? 'AI 调用走直连。' : 'AI calls go direct.'}
                </strong>{' '}
                {zh
                  ? '你的浏览器用你自己的 API Key 直接请求模型供应商，我们的服务器不在中间。我们在技术上就看不到。'
                  : 'Your browser uses your own API key to call the model provider directly. We are not in the path — we technically cannot see.'}
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center mt-0.5">3</span>
              <span>
                <strong className="text-slate-900">
                  {zh ? '离开靠导出，不靠上传。' : 'Leaving is by export, not upload.'}
                </strong>{' '}
                {zh
                  ? '数据要离开你的设备，必须你主动按"导出"。清理浏览器会清空数据——请善用导出。'
                  : 'For data to leave your device, you must press Export. Clearing the browser wipes data — use Export.'}
              </span>
            </li>
          </ol>
        </div>

        {/* Data-flow table */}
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {zh ? '每一类数据去了哪里' : 'Where each data type lives'}
        </h2>
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden mb-8">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">{zh ? '数据' : 'Data'}</th>
                <th className="px-4 py-3 font-medium">{zh ? '去向' : 'Destination'}</th>
                <th className="px-4 py-3 font-medium">{zh ? '说明' : 'Note'}</th>
              </tr>
            </thead>
            <tbody>
              {DATA_ROWS.map((row, i) => {
                const meta = DEST_META[row.destination];
                const Icon = meta.icon;
                return (
                  <tr key={i} className={i < DATA_ROWS.length - 1 ? 'border-b border-slate-100' : ''}>
                    <td className="px-4 py-3 text-slate-800 align-top">
                      {zh ? row.label.zh : row.label.en}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[11px] font-medium ${meta.color}`}>
                        <Icon className="h-3 w-3" />
                        {zh ? meta.labelZh : meta.labelEn}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 leading-relaxed align-top">
                      {zh ? row.note.zh : row.note.en}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* FAQ */}
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {zh ? '常见疑问' : 'FAQ'}
        </h2>
        <div className="space-y-4 text-sm">
          <details className="rounded-xl border border-slate-200 bg-white p-4">
            <summary className="font-medium text-slate-800 cursor-pointer">
              {zh
                ? '我删了浏览器缓存，数据还在吗？'
                : 'If I clear my browser, is the data gone?'}
            </summary>
            <p className="mt-3 text-slate-600 leading-relaxed">
              {zh
                ? '是的，本地存储就是本地存储。这是隐私承诺的代价。所以每个项目完成后建议使用"导出"下载 Excel/PPT/JSON 备份。'
                : 'Yes — local means local. That is the cost of the privacy guarantee. After finishing a project, use Export to download Excel/PPT/JSON backups.'}
            </p>
          </details>
          <details className="rounded-xl border border-slate-200 bg-white p-4">
            <summary className="font-medium text-slate-800 cursor-pointer">
              {zh
                ? 'AI 模型厂商会不会拿我的数据训练？'
                : 'Will the AI provider use my data for training?'}
            </summary>
            <p className="mt-3 text-slate-600 leading-relaxed">
              {zh
                ? '由你选择的供应商决定。Anthropic / OpenAI 企业 API 默认不用于训练；部分国内模型供应商条款不同——请在设置里选择符合你公司合规要求的供应商。我们不代你决定，这是 BYOK（自带 Key）模式的一部分。'
                : 'Depends on the provider you choose. Anthropic / OpenAI enterprise APIs are not used for training by default. Some other providers differ — check their terms. This is part of the BYOK (bring-your-own-key) model; we do not decide for you.'}
            </p>
          </details>
          <details className="rounded-xl border border-slate-200 bg-white p-4">
            <summary className="font-medium text-slate-800 cursor-pointer">
              {zh
                ? '团队协作怎么办？'
                : 'What about team collaboration?'}
            </summary>
            <p className="mt-3 text-slate-600 leading-relaxed">
              {zh
                ? '隐私模式下需要显式的"导出 → 分享"。未来的云同步会采用端到端加密：同步过程中服务器拿到的只是密文。'
                : 'In privacy mode, sharing requires explicit Export → Share. Future cloud sync will be end-to-end encrypted — the server only sees ciphertext.'}
            </p>
          </details>
          <details className="rounded-xl border border-slate-200 bg-white p-4">
            <summary className="font-medium text-slate-800 cursor-pointer">
              {zh
                ? '我公司禁止访问 Anthropic / OpenAI 怎么办？'
                : 'What if my company blocks Anthropic / OpenAI?'}
            </summary>
            <p className="mt-3 text-slate-600 leading-relaxed">
              {zh
                ? '你可以在设置里配置 Azure OpenAI、智谱、Minimax、Kimi 等国内供应商，或走公司自己的代理。BYOK 模式下路由由你掌握。'
                : 'Configure Azure OpenAI, Zhipu, Minimax, Kimi, or route through your company proxy in Settings. BYOK means routing is yours to control.'}
            </p>
          </details>
        </div>

        <p className="text-xs text-slate-400 mt-10 text-center">
          {zh
            ? '有问题或发现和此页不一致的情况？'
            : 'Questions, or something on this page does not match reality?'}{' '}
          <a href="mailto:privacy@sp-creator.app" className="underline hover:text-slate-700">
            privacy@sp-creator.app
          </a>
        </p>
      </div>
    </div>
  );
}
