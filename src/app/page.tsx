'use client';

import Link from 'next/link';
import { Search, BarChart3, Pencil, MessageSquare, ArrowRight } from 'lucide-react';
import { useTranslation } from '@/lib/store';
import { useSession } from 'next-auth/react';

const modules = [
  {
    icon: Search,
    titleZh: '竞品数据采集',
    titleEn: 'Competitor Data',
    descZh: '自动抓取竞品参数与定价数据',
    descEn: 'Auto-fetch competitor specs and pricing',
    tag: { zh: '数据', en: 'DATA' },
    gradient: 'from-[#1e2a3a] to-[#3a4f66]',
    iconBg: 'bg-[#1e2a3a]/8',
    iconColor: 'text-[#1e2a3a]',
    tagBg: 'bg-[#1e2a3a]/8',
    tagColor: 'text-[#1e2a3a]',
  },
  {
    icon: BarChart3,
    titleZh: 'KSP 卖点分级',
    titleEn: 'KSP Grading',
    descZh: 'AI驱动的卖点分类与优先级排序',
    descEn: 'AI-powered selling point classification',
    tag: { zh: '分析', en: 'ANALYSIS' },
    gradient: 'from-[#3a5068] to-[#8a9baf]',
    iconBg: 'bg-[#3a5068]/8',
    iconColor: 'text-[#3a5068]',
    tagBg: 'bg-[#3a5068]/8',
    tagColor: 'text-[#3a5068]',
  },
  {
    icon: Pencil,
    titleZh: '卖点包装生成',
    titleEn: 'Packaging Gen',
    descZh: '针对目标用户生成卖点文案',
    descEn: 'Generate selling point copy for target users',
    tag: { zh: '创意', en: 'CREATIVE' },
    gradient: 'from-[#6b7a8a] to-[#1e2a3a]',
    iconBg: 'bg-[#6b7a8a]/8',
    iconColor: 'text-[#6b7a8a]',
    tagBg: 'bg-[#6b7a8a]/8',
    tagColor: 'text-[#6b7a8a]',
  },
  {
    icon: MessageSquare,
    titleZh: '用户评论分析',
    titleEn: 'Review Analysis',
    descZh: '批量分析评论情感与卖点维度',
    descEn: 'Batch analyze review sentiment and dimensions',
    tag: { zh: '新功能', en: 'NEW' },
    gradient: 'from-[#1e2a3a] to-[#4a5d72]',
    iconBg: 'bg-[#1e2a3a]/8',
    iconColor: 'text-[#1e2a3a]',
    tagBg: 'bg-[#1e2a3a]/8',
    tagColor: 'text-[#1e2a3a]',
  },
];

export default function HomePage() {
  const { locale } = useTranslation();
  const { status } = useSession();
  const zh = locale === 'zh';
  const isLoggedIn = status === 'authenticated';

  return (
    <div className="min-h-screen flex justify-center items-start pt-[12vh] p-8 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #f8f8f8 0%, #f2f2f2 30%, #ededed 60%, #e8e8e8 100%)' }}>

      {/* Mesh overlay */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 15% 0%, rgba(30,42,58,0.06) 0%, transparent 50%), radial-gradient(ellipse at 85% 100%, rgba(30,42,58,0.04) 0%, transparent 50%)',
        }}
      />

      {/* Floating decorations */}
      <div className="absolute rounded-full border border-[#1e2a3a]/4 pointer-events-none w-[200px] h-[200px] top-[10%] right-[-60px]"
        style={{ animation: 'float-orbit 20s infinite linear' }} />
      <div className="absolute rounded-full border border-[#1e2a3a]/4 pointer-events-none w-[120px] h-[120px] bottom-[15%] left-[-40px]"
        style={{ animation: 'float-orbit 15s infinite linear reverse' }} />

      {/* Content */}
      <div className="max-w-[1020px] w-full relative z-10">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-1.5 bg-[#1e2a3a]/5 border border-[#1e2a3a]/10 rounded-full px-[18px] py-1.5 mb-5">
            <div className="w-[5px] h-[5px] rounded-full bg-[#1e2a3a]"
              style={{ animation: 'pulse-dot 1.5s infinite' }} />
            <span className="font-space text-[11px] text-[#1e2a3a]/45 tracking-[1px] uppercase">
              {zh ? 'AI 驱动工具' : 'AI-POWERED TOOL'}
            </span>
          </div>
          <h1 className="font-syne text-[52px] font-[800] leading-[1.05] text-[#1e2a3a] mb-3">
            KSP Assistant
          </h1>
          <p className="text-sm text-[#1e2a3a]/40">
            {zh ? 'AI驱动的产品卖点策划引擎' : 'AI-powered selling point planning engine'}
          </p>
        </div>

        {/* Module grid */}
        <div className="grid grid-cols-4 gap-5 mb-14">
          {modules.map((mod, i) => (
            <div
              key={i}
              className="bg-white/60 border border-[#1e2a3a]/8 rounded-2xl px-8 py-6 cursor-pointer transition-all duration-300 relative overflow-hidden hover:-translate-y-1 hover:border-[#1e2a3a]/20 hover:bg-white/85 group"
            >
              {/* Bottom gradient accent */}
              <div className={`absolute bottom-0 left-0 right-0 h-[3px] bg-gradient-to-r ${mod.gradient}`} />

              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-5 ${mod.iconBg}`}>
                <mod.icon className={`h-5 w-5 ${mod.iconColor}`} />
              </div>
              <div className="text-[17px] font-bold text-[#1e2a3a] mb-2 text-left">
                {zh ? mod.titleZh : mod.titleEn}
              </div>
              <div className="text-[13px] text-[#1e2a3a]/40 leading-[1.6] mb-4 text-left">
                {zh ? mod.descZh : mod.descEn}
              </div>
              <span className={`inline-block font-space text-[10px] px-3 py-1 rounded-full tracking-[1px] uppercase ${mod.tagBg} ${mod.tagColor}`}>
                {zh ? mod.tag.zh : mod.tag.en}
              </span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center">
          <div className="relative inline-block rounded-[60px] p-[2px] group">
            {/* Glow effect */}
            <div className="absolute inset-[-6px] rounded-[66px] bg-[#1e2a3a] blur-[20px] opacity-0 group-hover:opacity-40 transition-opacity duration-400 z-0" />
            <Link
              href={isLoggedIn ? '/regions' : '/login'}
              className="relative z-10 inline-flex items-center gap-3 bg-[#1e2a3a] text-white font-syne text-[15px] font-bold px-12 py-[18px] rounded-[60px] border-[1.5px] border-transparent cursor-pointer transition-all duration-400 overflow-hidden hover:-translate-y-[3px] hover:scale-[1.03] hover:border-[#5a8ab5]/50"
            >
              {/* Shimmer */}
              <span className="absolute top-0 h-full w-[60%] bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-[20deg]"
                style={{ animation: 'shimmer 3s infinite 1s', left: '-100%' }} />
              <span className="relative z-10">
                {isLoggedIn
                  ? (zh ? '进入工作台' : 'Enter Workspace')
                  : (zh ? '立即开始' : 'Get Started')}
              </span>
              <span className="relative z-10 inline-flex text-lg transition-transform duration-300 group-hover:translate-x-1.5 group-hover:animate-[arrow-bounce_0.6s_ease_infinite]">
                <ArrowRight className="h-[18px] w-[18px]" />
              </span>
            </Link>
          </div>
          <p className="font-space text-[11px] text-[#1e2a3a]/25 mt-4">
            {zh ? '上传产品参数或用户评论即可开始' : 'Upload product specs or user reviews to start'}
          </p>
        </div>
      </div>
    </div>
  );
}
