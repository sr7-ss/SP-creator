/**
 * Seed script for knowledge base: adds the realme P4r battery template
 * and example knowledge entries based on user's real PPT data.
 *
 * Run with: npx tsx prisma/seed-knowledge.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find the first user (dev environment)
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log('No user found. Please sign in first.');
    return;
  }
  const userId = user.id;

  // ─── 1. Template: 电池 + 快充 ────────────────────────────────

  const existing = await prisma.sellingPointTemplate.findFirst({
    where: { userId },
  });

  if (!existing) {
    await prisma.sellingPointTemplate.create({
      data: {
        userId,
        matchFeatures: ['电池', '快充', 'battery', 'charging', 'fast charge'],
        parentName: '8000mAh Titan Battery + 45W Fast Charge',
        parentSlogan: "Segment's Biggest Capacity, realme Flagship Titan Battery Longevity",
        subFeatures: [
          { name: '续航', fromFeature: '电池' },
          { name: '长寿', fromFeature: '电池' },
          { name: '使用安全', fromFeature: '电池' },
          { name: '轻薄', fromFeature: '电池' },
          { name: '快充速度', fromFeature: '快充' },
          { name: '反向充电', fromFeature: '快充' },
          { name: '旁路充电', fromFeature: '快充' },
          { name: '一键降温', fromFeature: '快充' },
        ],
      },
    });
    console.log('Created template: 电池+快充');
  }

  // ─── 2. Knowledge entries: realme P4r battery packaging ──────

  const entries = [
    {
      feature: '续航',
      parentFeature: '电池',
      entryType: 'packaging' as const,
      title: 'realme P4r 续航包装',
      brand: 'realme',
      content: `L1: 8000mAh Titan Battery
L2: 价位段最大电池，正常使用一天还剩一半电
L3 利益点:
- 电池量=2台iPhone17
- BGMI连续游戏x小时
- YouTube连续看x小时
- 1%电量支持x待机x小时
- 充电宝级别的电量，日常生活充一次可用两天`,
    },
    {
      feature: '长寿',
      parentFeature: '电池',
      entryType: 'packaging' as const,
      title: 'realme P4r 电池长寿包装',
      brand: 'realme',
      content: `L1: realme旗舰泰坦电池AI长寿算法
L2: 6年超长寿，价位段领先
L3 利益点:
- 6年保持8x%电池健康
- 电池循环达x转
- realme优化了泰坦电池的长寿算法，能智能识别出电池需要，能做到电池长寿并在充电温控上也有最新突破`,
    },
    {
      feature: '使用安全',
      parentFeature: '电池',
      entryType: 'packaging' as const,
      title: 'realme P4r 电池安全包装',
      brand: 'realme',
      content: `L1: realme旗舰安全电池
L2: 高温低温都安全
L3 利益点:
- 30°C~56°C安全使用
- 电池通过10项严密测试
- 由realme自研行业领先的安全标准，支持过流、过压、欠压、浪涌、静电、阻燃防火、防水、过温、防腐蚀、过应力等全方位防护
- 久充保护：长时间充电也能保障电池安全
- 高温保护：炎热的夏天也能保障电池安全
- 智能配速：根据用户使用习惯，调节充电速度`,
    },
    {
      feature: '轻薄',
      parentFeature: '电池',
      entryType: 'packaging' as const,
      title: 'realme P4r 轻薄包装',
      brand: 'realme',
      content: `L1: realme旗舰级轻薄
L2: 大容量，依旧轻薄
L3 利益点:
- 208g, 8.6mm厚
- 由realme自研行业领先的优化堆叠设计，成功优化35%手机堆叠空间，将8000mAh大电池装入208g的轻薄机身中
- *本产品在轻薄方面并无领先优势（备注）`,
    },
    {
      feature: '快充速度',
      parentFeature: '快充',
      entryType: 'packaging' as const,
      title: 'realme P4r 快充包装',
      brand: 'realme',
      content: `L1: 45W Fast Charge
L2: The Fastest and Coolest Charge in Segment
L3 利益点:
- 普通模式：x分钟从0-100%
- 一键boost模式：x分钟从20%-100%
- x分钟从0-100%充x分钟可打x小时BGMI`,
    },
    {
      feature: '反向充电',
      parentFeature: '快充',
      entryType: 'packaging' as const,
      title: 'realme P4r 反向充电包装',
      brand: 'realme',
      content: `L1: Reverse Charging
L2: The Only Reverse Charging in Segment
L3 利益点:
- 满电能充1.7台iPhone17
- 出游伙伴手机亏电全靠你`,
    },
    {
      feature: '旁路充电',
      parentFeature: '快充',
      entryType: 'packaging' as const,
      title: 'realme P4r 旁路充电包装',
      brand: 'realme',
      content: `L1: All Condition Bypass Charging
L2: realme自研全场景旁路充电，降温x度，边游戏边充电
L3 利益点:
- Max 1x+ APPs alive
- 能存储200-500k张照片
- 在连接外部充电器时，可直接给手机系统供电，减少发热有利于电池健康，全场景皆可使用`,
    },
    {
      feature: '一键降温',
      parentFeature: '快充',
      entryType: 'packaging' as const,
      title: 'realme P4r 一键降温包装',
      brand: 'realme',
      content: `L1: 一键降温
L2: 极速降温，2分钟降温3.3度
L3 利益点:
- 用户可以在设置-电池里开启一键降温
- 系统通过降屏幕亮度、杀后台、降cpu和gpu频点的方式做到手机短时间极速降温`,
    },
    // Charging Protection (from PPT image 1)
    {
      feature: '快充速度',
      parentFeature: '快充',
      entryType: 'packaging' as const,
      title: 'realme P4r 充电保护包装',
      brand: 'realme',
      content: `L1: Charging Protection
L2: Free Use from Day, Protection from Night / 睡觉时候不过充
L3 利益点:
- 泰坦AI长寿算法学习用户充电习惯
- 在夜间长时间充电场景下将电量长期控制在安全的80%左右
- 直到接近日间再快速充满
- 有效保障充电安全与电池长寿`,
    },
  ];

  // Check if entries already exist
  const existingEntries = await prisma.knowledgeEntry.count({ where: { userId } });
  if (existingEntries === 0) {
    for (const entry of entries) {
      await prisma.knowledgeEntry.create({
        data: { userId, ...entry },
      });
    }
    console.log(`Created ${entries.length} knowledge entries`);
  } else {
    console.log(`Skipped: ${existingEntries} entries already exist`);
  }

  console.log('Done!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
