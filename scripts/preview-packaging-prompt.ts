// Render the actual packaging prompts with sample data.
// Run with: npx tsx scripts/preview-packaging-prompt.ts
//   --strategy=premium  to preview a different packaging strategy

import { getPackagingSystemPrompt, getPackagingUserPrompt } from '../src/lib/ai/prompts/packaging';
import { decideSloganTypeForKsp, formatSloganHint, DEFAULT_STRATEGY_KEY } from '../src/lib/constants/slogan-strategies';

const strategyArg = process.argv.find(a => a.startsWith('--strategy='));
const strategyKey = strategyArg ? strategyArg.split('=')[1] : DEFAULT_STRATEGY_KEY;
console.log(`Using strategy: ${strategyKey}\n`);

const systemPrompt = getPackagingSystemPrompt('zh', [
  '电池：青海湖电池',
]);

const rawItems = [
  { tier: 1, featureName: '电池', paramValue: '7000mAh' },
  { tier: 1, featureName: '芯片', paramValue: '天玑8400' },
  { tier: 2, featureName: '屏幕', paramValue: '6.78英寸 OLED 120Hz' },
  { tier: 3, featureName: '防护', paramValue: 'IP64' },
];
const kspItems = rawItems.map(it => ({
  ...it,
  sloganHint: formatSloganHint(decideSloganTypeForKsp(strategyKey, it.tier)),
}));

const userPrompt = getPackagingUserPrompt({
  kspItems,
  productName: 'Realme GT 7 Pro',
  segment: '2000-2500 元',
  positioning: {
    targetAudience: '年轻游戏玩家',
    productStyle: ['潮酷', '性能'],
    positioning: '档位内性能怪兽',
  },
  competitorContext: JSON.stringify({
    advantages: [
      { feature: '电池', assessment: '我们 7000mAh 大于红米 K80 的 6550mAh' },
      { feature: '芯片', assessment: '我们的天玑8400 跑分领先红米 K80 的骁龙7 Gen3' },
    ],
    disadvantages: [
      { feature: '影像', assessment: '我们 50MP 主摄不如红米 K80 的 50MP + 8MP 长焦' },
    ],
  }),
  knowledgeExamplesBlock: `<参考案例>\n## 参考案例（学习风格，不要照抄）：\n{\n  "featureName": "电池",\n  "l1Name": "5500mAh 长续航",\n  "l2Slogan": "全天满电不断电"\n}\n</参考案例>`,
  competitorReferencesBlock: `<竞品话术>\n## 竞品话术参考（注意差异化，不要雷同）：\n- 红米 · 电池: 旗舰续航马拉松，48 小时重度使用\n- iQOO · 芯片: 性能狂飙，游戏不掉帧\n</竞品话术>`,
  referenceStyleBlock: `<参考风格>\n## 上一代产品包装风格（请延续这个风格和调性，不要照抄）：\nGT 6 Pro 系列主打"档位性能王者"，文案直给、参数化、不绕弯\n</参考风格>`,
  researchContextBlock: `<调研发现>\n## 调研发现（用户选择的关键结论，包装时参考）：\n- 用户最关心：游戏帧率稳定性（提及率 68%）\n- 用户痛点：续航焦虑，希望"一天一充"\n</调研发现>`,
});

const sep = '═'.repeat(80);
console.log(sep);
console.log(`SYSTEM PROMPT (长度: ${systemPrompt.length} 字符)`);
console.log(sep);
console.log(systemPrompt);
console.log('\n' + sep);
console.log(`USER PROMPT (长度: ${userPrompt.length} 字符)`);
console.log(sep);
console.log(userPrompt);
