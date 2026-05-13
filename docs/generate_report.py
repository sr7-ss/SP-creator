#!/usr/bin/env python3
"""
KSP Assistant — 产品架构文档 PDF 生成器
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether, ListFlowable, ListItem,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os, datetime

# ── Font Registration ──
# Try to register Chinese-capable fonts
FONT_REGULAR = 'Helvetica'
FONT_BOLD = 'Helvetica-Bold'
FONT_CN = None

# Try macOS system fonts for Chinese
cn_font_paths = [
    ('/System/Library/Fonts/PingFang.ttc', 'PingFang', 0),
    ('/System/Library/Fonts/STHeiti Light.ttc', 'STHeiti', 0),
    ('/Library/Fonts/Arial Unicode.ttf', 'ArialUnicode', None),
]

for path, name, idx in cn_font_paths:
    if os.path.exists(path):
        try:
            if idx is not None:
                pdfmetrics.registerFont(TTFont(name, path, subfontIndex=idx))
            else:
                pdfmetrics.registerFont(TTFont(name, path))
            FONT_CN = name
            break
        except:
            continue

if not FONT_CN:
    FONT_CN = FONT_REGULAR  # fallback

# ── Colors ──
DARK = HexColor('#1e293b')
MID = HexColor('#475569')
LIGHT = HexColor('#94a3b8')
ACCENT = HexColor('#2563eb')
BG_LIGHT = HexColor('#f8fafc')
BG_BLUE = HexColor('#eff6ff')
BG_GREEN = HexColor('#f0fdf4')
BG_AMBER = HexColor('#fffbeb')
BG_PURPLE = HexColor('#faf5ff')
BORDER = HexColor('#e2e8f0')

# ── Styles ──
styles = getSampleStyleSheet()

def make_style(name, parent='Normal', **kw):
    base = styles[parent] if isinstance(parent, str) else parent
    return ParagraphStyle(name, parent=base, **kw)

title_style = make_style('DocTitle', fontName=FONT_CN, fontSize=22, leading=28, textColor=DARK, spaceAfter=6)
subtitle_style = make_style('DocSubtitle', fontName=FONT_CN, fontSize=11, textColor=LIGHT, spaceAfter=20)
h1_style = make_style('H1', fontName=FONT_CN, fontSize=16, leading=22, textColor=DARK, spaceBefore=20, spaceAfter=8, borderWidth=0)
h2_style = make_style('H2', fontName=FONT_CN, fontSize=13, leading=18, textColor=HexColor('#334155'), spaceBefore=14, spaceAfter=6)
h3_style = make_style('H3', fontName=FONT_CN, fontSize=11, leading=15, textColor=MID, spaceBefore=10, spaceAfter=4)
body_style = make_style('Body', fontName=FONT_CN, fontSize=9.5, leading=15, textColor=MID, alignment=TA_JUSTIFY, spaceAfter=4)
code_style = make_style('Code', fontName='Courier', fontSize=8, leading=12, textColor=HexColor('#334155'), backColor=BG_LIGHT, spaceAfter=4, leftIndent=8, rightIndent=8)
caption_style = make_style('Caption', fontName=FONT_CN, fontSize=8, textColor=LIGHT, alignment=TA_CENTER, spaceAfter=8)
label_style = make_style('Label', fontName=FONT_CN, fontSize=8, textColor=ACCENT, spaceAfter=2)

def hr():
    return HRFlowable(width='100%', thickness=0.5, color=BORDER, spaceAfter=10, spaceBefore=10)

def spacer(h=6):
    return Spacer(1, h)

def colored_table(data, col_widths=None, header_bg=DARK, header_text=white, body_bg=white):
    """Create a styled table."""
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), header_bg),
        ('TEXTCOLOR', (0, 0), (-1, 0), header_text),
        ('FONTNAME', (0, 0), (-1, 0), FONT_CN),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTNAME', (0, 1), (-1, -1), FONT_CN),
        ('FONTSIZE', (0, 1), (-1, -1), 8.5),
        ('TEXTCOLOR', (0, 1), (-1, -1), MID),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [body_bg, BG_LIGHT]),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle(style_cmds))
    return t

def info_box(text, bg=BG_BLUE, border_color=ACCENT):
    """Create an info box."""
    data = [[Paragraph(text, make_style('BoxText', fontName=FONT_CN, fontSize=9, leading=14, textColor=DARK))]]
    t = Table(data, colWidths=[160*mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg),
        ('BOX', (0, 0), (-1, -1), 1, border_color),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
    ]))
    return t


# ── Build Document ──
output_path = os.path.join(os.path.dirname(__file__), 'KSP_Assistant_Architecture_Report.pdf')

doc = SimpleDocTemplate(
    output_path,
    pagesize=A4,
    leftMargin=20*mm, rightMargin=20*mm,
    topMargin=25*mm, bottomMargin=20*mm,
)

story = []
W = 170*mm  # usable width

# ═══════════════════════════════════════════════════════════
# COVER
# ═══════════════════════════════════════════════════════════
story.append(Spacer(1, 60))
story.append(Paragraph('KSP Assistant', title_style))
story.append(Paragraph('Product Architecture & AI System Report', subtitle_style))
story.append(hr())
story.append(spacer(12))

meta_data = [
    ['Project', 'KSP Assistant (Key Selling Point)'],
    ['Version', '0.1.0'],
    ['Tech Stack', 'Next.js 16 + TypeScript + Tailwind v4 + Prisma + PostgreSQL'],
    ['AI SDK', 'Anthropic Claude SDK (@anthropic-ai/sdk)'],
    ['Date', datetime.date.today().strftime('%Y-%m-%d')],
]
story.append(colored_table(meta_data, col_widths=[35*mm, 135*mm], header_bg=HexColor('#334155')))
story.append(spacer(20))

story.append(info_box(
    '<b>Document Purpose</b><br/>'
    'This document describes the full architecture of KSP Assistant: '
    'user workflow, AI SDK integration, prompt engineering strategy, '
    'knowledge base design, and the three-tier content architecture '
    '(System Prompt > Series Style Presets > Knowledge Base).'
))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════
# TABLE OF CONTENTS
# ═══════════════════════════════════════════════════════════
story.append(Paragraph('Table of Contents', h1_style))
story.append(hr())
toc_items = [
    '1. User Workflow Overview',
    '2. System Architecture',
    '3. AI SDK Integration',
    '4. Prompt Engineering Architecture',
    '5. Three-Tier Content Architecture',
    '6. Knowledge Base Design',
    '7. Series Style Presets',
    '8. Packaging Refinement & Version Compare',
    '9. Agent System',
    '10. Data Model',
    '11. API Routes',
    '12. Next Steps & Roadmap',
]
for item in toc_items:
    story.append(Paragraph(item, make_style('TOC', fontName=FONT_CN, fontSize=10, leading=18, textColor=MID, leftIndent=10)))
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════
# 1. USER WORKFLOW
# ═══════════════════════════════════════════════════════════
story.append(Paragraph('1. User Workflow Overview', h1_style))
story.append(hr())

story.append(Paragraph(
    'KSP Assistant helps product marketing teams transform raw product specs '
    'into structured, tiered selling points with professional packaging copy. '
    'The workflow follows a 4-step pipeline:',
    body_style
))
story.append(spacer(8))

workflow_data = [
    ['Step', 'Tab', 'Action', 'Output'],
    ['1', 'Parameter Compare\n(Competitive Spec Compare)', 'Input own product specs + crawl/paste competitor specs.\nCompare side-by-side in equal-width columns.', 'Structured parameter table\n(own vs N competitors)'],
    ['2', 'KSP Tiering\n(KSP Grading)', 'AI analyzes parameter advantages/disadvantages.\nAssign T1 (core), T2 (important), T3 (basic).', 'Tiered KSP cards with\nfeature names + param values'],
    ['3', 'Selling Point Packaging\n(Copy Packaging)', 'AI generates 3-layer packaging:\nL1 Feature Name, L2 Slogan, L3 Sub-points.', 'Full packaging per KSP item\nwith alternative slogans'],
    ['4', 'Refinement\n(Iteration)', 'User reviews each card, provides refinement prompts.\nAI generates new version. Side-by-side compare.', 'Finalized packaging copy\nwith version history'],
]
story.append(colored_table(workflow_data, col_widths=[12*mm, 30*mm, 68*mm, 60*mm]))
story.append(spacer(12))

story.append(Paragraph('<b>Key UX Principles:</b>', body_style))
bullet_items = [
    'Human-in-the-loop at every step. AI generates, human decides.',
    'Each card is clickable to expand into full detail view for review + refinement.',
    'Version history preserved. User can compare and revert any version.',
    'Quick suggestion chips (preset refinement templates) + free-form input.',
]
for b in bullet_items:
    story.append(Paragraph(f'  \xe2\x80\xa2  {b}', body_style))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════
# 2. SYSTEM ARCHITECTURE
# ═══════════════════════════════════════════════════════════
story.append(Paragraph('2. System Architecture', h1_style))
story.append(hr())

arch_data = [
    ['Layer', 'Technology', 'Purpose'],
    ['Frontend', 'React 19 + Next.js 16 App Router', 'SSR/CSR hybrid, page routing, API routes'],
    ['UI', 'Tailwind CSS v4 + shadcn/ui + lucide-react', 'Component library, consistent design system'],
    ['Drag & Drop', '@dnd-kit/core + @dnd-kit/sortable', 'KSP tier card drag-and-drop reordering'],
    ['State', 'React useState + Zustand (store)', 'Client state, i18n, AI settings'],
    ['Database', 'PostgreSQL (Neon) + Prisma ORM', '12+ models: User, Project, Product, Analysis, KspResult...'],
    ['Auth', 'NextAuth v5 + bcryptjs', 'Email/password + OAuth, session management'],
    ['AI', 'Anthropic SDK + OpenAI-compatible adapter', 'Multi-provider: Claude, GPT-4o, Gemini, MiniMax, Zhipu'],
    ['Export', 'pptxgenjs + html2canvas + xlsx', 'PPT, image, Excel export'],
]
story.append(colored_table(arch_data, col_widths=[25*mm, 55*mm, 90*mm]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════
# 3. AI SDK INTEGRATION
# ═══════════════════════════════════════════════════════════
story.append(Paragraph('3. AI SDK Integration', h1_style))
story.append(hr())

story.append(Paragraph('<b>Multi-Provider Architecture</b>', h2_style))
story.append(Paragraph(
    'The system supports 5 AI providers through a unified adapter pattern. '
    'Claude uses the native Anthropic SDK; all others use the OpenAI-compatible protocol.',
    body_style
))

provider_data = [
    ['Provider', 'Default Model', 'Protocol', 'Use Case'],
    ['Claude (Anthropic)', 'claude-sonnet-4-20250514', 'Native Anthropic Messages API', 'Primary: analysis, packaging, agents'],
    ['OpenAI', 'gpt-4o', 'OpenAI Chat Completions', 'Alternative provider'],
    ['Google Gemini', 'gemini-2.5-flash', 'OpenAI-compatible', 'Alternative provider'],
    ['MiniMax', 'MiniMax-Text-01', 'OpenAI-compatible', 'Chinese market optimization'],
    ['Zhipu AI', 'glm-4-flash', 'OpenAI-compatible', 'Chinese market optimization'],
]
story.append(colored_table(provider_data, col_widths=[30*mm, 38*mm, 42*mm, 60*mm]))
story.append(spacer(10))

story.append(Paragraph('<b>Provider Abstraction (src/lib/ai/provider.ts)</b>', h3_style))
story.append(Paragraph(
    'Unified interface: chat(messages) and stream(messages) methods. '
    'ClaudeAdapter wraps @anthropic-ai/sdk directly. '
    'OpenAICompatibleAdapter handles all others via fetch to their OpenAI-compatible endpoints. '
    'API keys encrypted in DB (UserAIKey) or provided per-request.',
    body_style
))

story.append(spacer(10))
story.append(Paragraph('<b>Agent Loop (src/lib/ai/agent-runner.ts)</b>', h2_style))
story.append(Paragraph(
    'Generic agent orchestration engine using Anthropic Messages tool_use protocol. '
    'Reusable across all 3 agent types. Key interfaces:',
    body_style
))

agent_types = [
    ['Interface', 'Purpose'],
    ['AgentToolDef', 'Tool definition (name, description, input_schema) + async handler function'],
    ['AgentContext', 'Shared state: userId, projectId, locale, provider, apiKey, model, onProgress callback, mutable data store'],
    ['AgentRunnerConfig', 'systemPrompt, tools[], maxIterations (default 10)'],
    ['AgentResult', 'summary text + structured data from context.data'],
]
story.append(colored_table(agent_types, col_widths=[35*mm, 135*mm]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════
# 4. PROMPT ENGINEERING ARCHITECTURE
# ═══════════════════════════════════════════════════════════
story.append(Paragraph('4. Prompt Engineering Architecture', h1_style))
story.append(hr())

story.append(info_box(
    '<b>Core Principle:</b> Prompt engineering = fixed few-shot rules hardcoded in system prompts. '
    'This is the foundation layer that defines HOW the AI generates content. '
    'It does not change per user or per project.'
))
story.append(spacer(8))

story.append(Paragraph('<b>Current Prompt Structure (Packaging)</b>', h2_style))

prompt_arch = [
    ['Layer', 'Location', 'Content', 'Editable?'],
    ['1. Role Definition', 'System Prompt (hardcoded)', '"Senior product marketing expert specializing in consumer electronics"', 'No (code change)'],
    ['2. L1 Rules', 'System Prompt', 'High-awareness: param + marketing name. Low-awareness: user-friendly naming.', 'No (code change)'],
    ['3. L2 Slogan Rules', 'System Prompt\n(slogan-rules.ts)', '4-step process:\n1. Type selection (emotional/factual/functional)\n2. Packaging decision (related features)\n3. Extreme word rules\n4. Output requirements', 'No (code change)'],
    ['4. L3 Techniques', 'System Prompt\n(slogan-rules.ts)', '3 techniques: Concrete (scenario), Equivalent (comparison), Extreme (edge case)', 'No (code change)'],
    ['5. Brand Rules', 'System Prompt\n(from DB)', 'Brand naming conventions, e.g. "battery = Titan Battery".\nStored in KnowledgeEntry(entryType="rule").', 'Yes (DB/UI)'],
    ['6. Output Format', 'System Prompt', 'JSON schema: packagingResults[{l1Name, l2Slogan, l2SloganType, l2Alternatives, l3Details}]', 'No (code change)'],
    ['7. Product Context', 'User Prompt', 'Product name, segment, competitor advantages', 'Auto-generated'],
    ['8. KSP Data', 'User Prompt', 'Tier-grouped items: T1/T2/T3 with feature + param value', 'Auto-generated'],
    ['9. Knowledge Examples', 'User Prompt (appended)', 'Top 3 matching historical examples from Knowledge table. Few-shot reference.', 'Yes (DB/UI)'],
    ['10. Refinement', 'User Prompt (appended)', 'Current packaging JSON + user adjustment instruction', 'Yes (per request)'],
]
story.append(colored_table(prompt_arch, col_widths=[28*mm, 28*mm, 82*mm, 32*mm]))
story.append(spacer(10))

story.append(Paragraph('<b>Slogan Generation Rules Detail (slogan-rules.ts)</b>', h2_style))

slogan_rules = [
    ['Step', 'Rule', 'Example'],
    ['1. Type Selection', 'Has brand story/IP > Emotional\nBest-in-segment param > Factual\nNeeds translation to benefit > Functional', 'Emotional: "Dare to Leap"\nFactual: "Segment\'s largest 7000mAh"\nFunctional: "2 days, 1 charge"'],
    ['2. Can Package?', 'Related features + both T1 > bundle\nUnrelated > separate', 'Bundle: battery + charging\nSeparate: chipset + thermal'],
    ['3. Extreme Words', 'First in segment > "The first"\nBest/Largest > "Segment\'s best"\nOnly one > "Segment\'s only"', '"The first 7000mAh in sub-$200 segment"'],
    ['4. Output', 'Short, memorable, one sentence.\nUser remembers at first glance.', '"2-Day Titan Battery"'],
]
story.append(colored_table(slogan_rules, col_widths=[28*mm, 72*mm, 70*mm]))

story.append(spacer(10))
story.append(Paragraph('<b>L3 Packaging Techniques</b>', h2_style))

l3_tech = [
    ['Technique', 'Description', 'Example'],
    ['Concrete\n(Scenario-based)', 'Translate abstract params to user-perceivable scenarios', '7000mAh -> "12 hours of YouTube streaming"'],
    ['Equivalent\n(Comparison)', 'Compare to familiar objects users know', '"1 phone battery = 2 iPhone batteries"'],
    ['Extreme\n(Edge case)', 'Show performance under extreme conditions', '"1% battery can still make a 30-min call"'],
]
story.append(colored_table(l3_tech, col_widths=[30*mm, 60*mm, 80*mm]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════
# 5. THREE-TIER CONTENT ARCHITECTURE
# ═══════════════════════════════════════════════════════════
story.append(Paragraph('5. Three-Tier Content Architecture', h1_style))
story.append(hr())

story.append(Paragraph(
    'The system uses a three-tier architecture to balance consistency, '
    'flexibility, and personalization:',
    body_style
))
story.append(spacer(8))

tier_arch = [
    ['Tier', 'Name', 'Scope', 'Changes How Often', 'Who Edits'],
    ['Tier 1\n(Foundation)', 'Prompt Engineering\n(System Prompt)', 'Global. Same for all users, all products.\nDefines the "rules of the game".', 'Rarely.\nOnly when methodology evolves.', 'Developer\n(code change)'],
    ['Tier 2\n(Brand/Series)', 'Series Style Presets', 'Per product line. Brand tone, IP naming,\nuser persona, style preferences.', 'Per product launch cycle.\nSet once, reuse across SKUs.', 'Product Manager\n(UI form)'],
    ['Tier 3\n(Instance)', 'Knowledge Base\n(Dynamic Retrieval)', 'Per feature. Historical examples,\ncompetitor references, past successes.', 'Continuously.\nGrows with each project.', 'Anyone\n(save/upload)'],
]
story.append(colored_table(tier_arch, col_widths=[18*mm, 30*mm, 45*mm, 38*mm, 39*mm]))
story.append(spacer(12))

story.append(info_box(
    '<b>How they compose at generation time:</b><br/><br/>'
    'System Prompt = Tier 1 (fixed rules) + Tier 2 (series preset: tone, IP, constraints)<br/>'
    'User Prompt = Product context + KSP data + Tier 3 (matched knowledge examples)<br/>'
    'Refinement = User Prompt + current packaging + user instruction',
    bg=BG_GREEN, border_color=HexColor('#22c55e')
))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════
# 6. KNOWLEDGE BASE DESIGN
# ═══════════════════════════════════════════════════════════
story.append(Paragraph('6. Knowledge Base Design', h1_style))
story.append(hr())

story.append(Paragraph('<b>Current Implementation</b>', h2_style))

kb_data = [
    ['Category', 'DB Model', 'Entry Type', 'Content', 'How It Enters'],
    ['Packaging Examples', 'Knowledge', 'packaging', 'Historical L1/L2/L3 results.\nStructured JSON with param/sellingPoint/copy.', 'Click "Save to KB" on\nany packaging result'],
    ['Brand Naming Rules', 'KnowledgeEntry', 'rule', 'Constraints like "battery must be called\nTitan Battery" or "no superlatives".', 'Manual input in\nKnowledge management page'],
    ['Competitor References', 'KnowledgeEntry', 'competitor', 'Competitor packaging examples.\nScreenshot + structured analysis.', 'Manual upload\n(planned: image parsing)'],
]
story.append(colored_table(kb_data, col_widths=[28*mm, 25*mm, 22*mm, 52*mm, 43*mm]))
story.append(spacer(10))

story.append(Paragraph('<b>Retrieval Mechanism</b>', h2_style))
story.append(Paragraph(
    'Current: Keyword matching on featureName (e.g., input "battery" matches entries containing "battery"). '
    'Top 3 relevant examples are injected as few-shot references in User Prompt. '
    'Planned: Vector embedding search for semantic matching (e.g., "battery life" matches "charging speed" examples).',
    body_style
))
story.append(spacer(10))

story.append(Paragraph('<b>Knowledge Base Roadmap</b>', h2_style))
kb_roadmap = [
    ['Phase', 'Feature', 'Status'],
    ['Phase 1', 'Manual save packaging results to KB + Brand naming rules', 'Done'],
    ['Phase 2', 'Screenshot/image upload for competitor ad references', 'Planned'],
    ['Phase 3', 'User research report PDF upload + parsing', 'Planned'],
    ['Phase 4', 'Vector embedding search (semantic retrieval)', 'Planned'],
    ['Phase 5', 'Auto-archive: auto-save finalized packaging to KB', 'Planned'],
]
story.append(colored_table(kb_roadmap, col_widths=[25*mm, 100*mm, 45*mm]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════
# 7. SERIES STYLE PRESETS
# ═══════════════════════════════════════════════════════════
story.append(Paragraph('7. Series Style Presets (Tier 2)', h1_style))
story.append(hr())

story.append(Paragraph(
    'Series Style Presets sit between the fixed prompt rules (Tier 1) and the dynamic knowledge base (Tier 3). '
    'They capture the brand identity and product line personality that should be consistent across all SKUs in a series.',
    body_style
))
story.append(spacer(8))

preset_fields = [
    ['Field', 'Description', 'Example'],
    ['Product Line Name', 'The series this preset applies to', 'P Series / GT Series / C Series'],
    ['Brand Tone of Voice', 'Adjective keywords defining the brand personality', 'Young, Bold, Tech-for-all\n(or: Premium, Sophisticated, Innovative)'],
    ['Target User Persona', 'Who buys this product line', '18-25 college students / young professionals\n(or: 30-45 business users)'],
    ['Price Segment Range', 'Market positioning', '$100-$200 / $200-$400 / $400+'],
    ['IP Feature Mapping', 'Parameter to brand IP name mapping', 'Battery -> Titan Battery\nDisplay -> CrystalRes Display\nChipset -> Hyper Engine'],
    ['Copy Style Preference', 'Preferred packaging techniques, ranked', 'Scenario-based > Equivalence > Extreme\n(or: Data-driven > Extreme > Scenario)'],
    ['Forbidden Expressions', 'Words/phrases that must NOT appear', '"Unmatched", "Kills the competition"\n(or: market-specific legal constraints)'],
    ['Reference Tone Examples', 'Example slogans that match the desired style', '"2 Days, 1 Charge"\n"See Every Detail, Day or Night"'],
]
story.append(colored_table(preset_fields, col_widths=[30*mm, 55*mm, 85*mm]))
story.append(spacer(10))

story.append(info_box(
    '<b>Integration Point:</b> When generating packaging, the selected Series Preset '
    'is injected into the System Prompt as additional constraints between the fixed rules (Tier 1) '
    'and the output format. This ensures all generated copy aligns with the product line identity.',
    bg=BG_AMBER, border_color=HexColor('#f59e0b')
))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════
# 8. PACKAGING REFINEMENT & VERSION COMPARE
# ═══════════════════════════════════════════════════════════
story.append(Paragraph('8. Packaging Refinement & Version Compare', h1_style))
story.append(hr())

story.append(Paragraph('<b>Refinement Workflow</b>', h2_style))

refine_steps = [
    ['Step', 'UI Component', 'What Happens'],
    ['1. Review', 'PackagingDetailDialog\n(card zoom view)', 'User clicks card to expand. Sees full L1 + L2 + L3 + alternatives.\nDecides if refinement is needed.'],
    ['2. Instruct', 'Refinement Input Area\n(textarea + chips)', 'User selects preset chips ("Use scenario-based", "Remove superlatives")\nor types free-form instruction about their understanding of the feature.'],
    ['3. Generate', 'API: /api/ai/packaging\n(with refinementPrompt)', 'Current packaging + user instruction sent to AI.\nAI generates new version that differs meaningfully.'],
    ['4. Compare', 'VersionCompareDialog\n(side-by-side)', 'Old version (left) vs new version (right).\nUser clicks "Use this version" on preferred side.'],
    ['5. Iterate', 'Version History\n(V1/V2/V3...)', 'All versions preserved. User can browse history,\nrestore any previous version, or continue refining.'],
]
story.append(colored_table(refine_steps, col_widths=[15*mm, 38*mm, 117*mm]))
story.append(spacer(10))

story.append(Paragraph('<b>Preset Refinement Templates</b>', h2_style))

preset_templates = [
    ['Template (ZH)', 'Template (EN)', 'What It Does'],
    ['Switch to scenario-based', 'Use scenario-based expression', 'Change L2/L3 to user scenario framing'],
    ['Remove superlatives', 'Remove superlatives', 'Strip extreme/absolute claims'],
    ['More emotional', 'More emotional tone', 'Shift L2 type toward emotional'],
    ['More data-driven', 'More data-driven', 'Shift toward factual with numbers'],
    ['Add competitor comparison', 'Add competitor comparison', 'Reference competitor weaknesses'],
    ['Make it shorter', 'Make it shorter & punchier', 'Compress copy for impact'],
    ['Use equivalence', 'Use equivalence comparison', 'Apply equivalent technique to L3'],
    ['Emphasize user scenarios', 'Emphasize user scenarios', 'Focus L3 on daily use cases'],
]
story.append(colored_table(preset_templates, col_widths=[38*mm, 50*mm, 82*mm]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════
# 9. AGENT SYSTEM
# ═══════════════════════════════════════════════════════════
story.append(Paragraph('9. Agent System (Claude SDK tool_use)', h1_style))
story.append(hr())

story.append(Paragraph(
    'Three specialized agents handle tasks that benefit from multi-step, '
    'autonomous decision-making with tool use:',
    body_style
))
story.append(spacer(8))

agent_data = [
    ['Agent', 'Purpose', 'Tools', 'Max Iter'],
    ['Competitive\nDiscovery', 'Help users find competitor products\nin a given market/price segment.\nScrapes GSMArena, 91mobiles.', '1. search_products(query, market)\n2. scrape_specs(deviceName, market)\n3. recommend_competitors(category, price, market)', '15'],
    ['Review\nMining', 'Analyze product reviews,\nidentify themes, suggest\nKSP adjustments.', '1. analyze_reviews(reviews, productName)\n2. deep_dive_theme(theme, reviews)\n3. cross_reference_specs(theme, insight)\n4. suggest_ksp_adjustments(insights, items)', '15'],
    ['Creative\nExploration', 'Generate and evaluate multiple\nslogan variants with quality\nscoring.', '1. generate_variants(feature, param, tier)\n2. evaluate_variants(variants, brandRules)\n3. search_knowledge_base(feature)\n4. check_competitor_messaging(variants)', '8'],
]
story.append(colored_table(agent_data, col_widths=[22*mm, 42*mm, 70*mm, 16*mm]))
story.append(spacer(10))

story.append(Paragraph('<b>Agent Communication: SSE Streaming</b>', h2_style))
story.append(Paragraph(
    'All agents stream progress via Server-Sent Events through /api/ai/agent-stream. '
    'The useAgentStream React hook consumes these events, providing real-time step updates, '
    'progress bars, and abort capability to the UI.',
    body_style
))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════
# 10. DATA MODEL
# ═══════════════════════════════════════════════════════════
story.append(Paragraph('10. Data Model (Key Entities)', h1_style))
story.append(hr())

model_data = [
    ['Model', 'Key Fields', 'Purpose'],
    ['Project', 'name, market, segment, launchStatus', 'Workspace for one product comparison'],
    ['Product', 'name, isOwnProduct, params (JSON)', 'Own product + competitors within a project'],
    ['Analysis', 'advantages, disadvantages, neutral (JSON)', 'Competitive analysis results'],
    ['KspResult', 'featureName, tier, l1Name, l2Slogan,\nl2SloganType, l2Alternatives, l3Details', 'KSP tier assignment + packaging data'],
    ['Knowledge', 'category, brand, content, structured', 'Legacy KB: packaging examples (few-shot)'],
    ['KnowledgeEntry', 'feature, parentFeature, entryType,\ntitle, content, structured', 'Structured KB: packaging / competitor / rule'],
    ['UserAIKey', 'provider, encryptedKey', 'Per-provider encrypted API key storage'],
    ['UsageLog', 'action, provider, model, inputTokens,\noutputTokens, creditsUsed', 'AI usage tracking + billing'],
    ['ReviewBatch', 'totalCount, status, summary', 'Review analysis batch metadata'],
    ['ReviewItem', 'text, sentiment, score, dimensions,\nhighlights', 'Individual review analysis results'],
]
story.append(colored_table(model_data, col_widths=[28*mm, 62*mm, 80*mm]))
story.append(spacer(10))

story.append(Paragraph('<b>New Type: PackagingVersion (client-side)</b>', h3_style))
version_data = [
    ['Field', 'Type', 'Description'],
    ['version', 'number', 'Auto-incrementing version number'],
    ['l1Name', 'string', 'L1 feature name at this version'],
    ['l2Slogan', 'string', 'L2 slogan at this version'],
    ['l2SloganType', 'SloganType', 'factual / functional / emotional'],
    ['l2Alternatives', 'SloganAlternative[]?', 'Alternative slogans'],
    ['l3Details', 'L3SubPoint[]?', 'Sub-point details'],
    ['refinementPrompt', 'string?', 'User instruction that produced this version'],
    ['createdAt', 'string', 'ISO timestamp'],
]
story.append(colored_table(version_data, col_widths=[32*mm, 35*mm, 103*mm]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════
# 11. API ROUTES
# ═══════════════════════════════════════════════════════════
story.append(Paragraph('11. API Routes', h1_style))
story.append(hr())

api_data = [
    ['Route', 'Method', 'Purpose'],
    ['/api/ai/agent', 'POST', 'Full KSP pipeline (spec fetch > analysis > tiering > packaging)'],
    ['/api/ai/agent-stream', 'POST', 'SSE streaming for Discovery / Review Mining / Creative agents'],
    ['/api/ai/packaging', 'POST', 'Standalone packaging generation (supports refinementPrompt)'],
    ['/api/ai/analyze', 'POST', 'Competitive analysis only'],
    ['/api/ai/analyze-ksp-tier', 'POST', 'Analysis + KSP tiering pipeline'],
    ['/api/ai/ksp-tier', 'POST', 'Standalone KSP tiering'],
    ['/api/ai/reviews', 'POST', 'Review batch analysis'],
    ['/api/ai/parse-params', 'POST', 'Parameter extraction from images/text'],
    ['/api/projects/[id]', 'GET/PUT', 'Project CRUD'],
    ['/api/projects/[id]/products', 'POST/PUT/DELETE', 'Product management within project'],
    ['/api/projects/[id]/ksp-results', 'GET/POST', 'KSP result persistence'],
    ['/api/knowledge', 'GET/POST', 'Knowledge base CRUD'],
    ['/api/user/ai-keys', 'GET/POST', 'AI provider key management'],
    ['/api/competitor-specs', 'POST', 'Competitor spec scraping (GSMArena, 91mobiles)'],
]
story.append(colored_table(api_data, col_widths=[45*mm, 18*mm, 107*mm]))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════
# 12. ROADMAP
# ═══════════════════════════════════════════════════════════
story.append(Paragraph('12. Next Steps & Roadmap', h1_style))
story.append(hr())

roadmap_data = [
    ['Priority', 'Feature', 'Description', 'Status'],
    ['P0', 'Packaging Refinement + Version Compare', 'Per-item refinement input, preset templates, side-by-side compare, version history', 'Done'],
    ['P0', 'Prompt Architecture Preview', 'Developer panel showing actual prompt structure sent to AI', 'Done'],
    ['P0', 'Card Detail Dialog', 'Click-to-zoom card view with full L1/L2/L3 + inline refinement', 'Done'],
    ['P1', 'Series Style Presets', 'Brand tone, IP mapping, user persona, style preferences per product line', 'Designed, not built'],
    ['P1', 'Knowledge Base: Image Upload', 'Screenshot competitor ads, parse into structured examples', 'Planned'],
    ['P1', 'Knowledge Base: Brand Guideline PDF', 'Upload brand guideline PDF, extract rules + examples', 'Planned'],
    ['P2', 'Vector Embedding Search', 'Semantic KB retrieval (replace keyword matching)', 'Planned'],
    ['P2', 'User Research Import', 'Upload user research reports, extract insights for KSP refinement', 'Planned'],
    ['P2', 'Auto-Archive', 'Auto-save finalized packaging to KB as future few-shot examples', 'Planned'],
    ['P3', 'Multi-language Copy', 'Generate packaging in multiple languages from single source', 'Planned'],
]
story.append(colored_table(roadmap_data, col_widths=[14*mm, 40*mm, 82*mm, 34*mm]))

story.append(spacer(20))
story.append(hr())
story.append(Paragraph(
    f'Generated on {datetime.date.today().strftime("%Y-%m-%d")} | KSP Assistant v0.1.0',
    caption_style
))

# ── Build ──
doc.build(story)
print(f'\nPDF generated: {output_path}')
