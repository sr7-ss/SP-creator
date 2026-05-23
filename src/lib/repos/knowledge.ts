/**
 * Knowledge & template repository.
 *
 * Dispatches to IndexedDB when privacy mode is on, otherwise to server APIs.
 * The caller does not need to know which backend served the data.
 */

import { loadSettings } from '@/lib/settings';
import { getLocalDB, localId, type LocalKnowledgeEntry, type LocalTemplate } from '@/lib/local-db/db';

export type KnowledgeEntry = LocalKnowledgeEntry;
export type Template = LocalTemplate;

export interface KnowledgeEntryInput {
  id?: string;
  feature: string;
  parentFeature?: string | null;
  entryType: string;
  title: string;
  content: string;
  brand?: string | null;
  sourceUrl?: string | null;
  /** brand_name entries only: the fixed marketing name (e.g. "青海湖电池") */
  marketingName?: string | null;
  structured?: unknown;
  tags?: string[] | null;
}

export interface TemplateInput {
  id?: string;
  matchFeatures: string[];
  parentName: string;
  parentSlogan?: string | null;
  subFeatures: { name: string; fromFeature?: string }[];
}

function isPrivacyMode(): boolean {
  if (typeof window === 'undefined') return false;
  return !!loadSettings().privacyMode;
}

// ─── Knowledge Entries ──────────────────────────────────────────

export async function listEntries(): Promise<KnowledgeEntry[]> {
  if (isPrivacyMode()) {
    const rows = await getLocalDB().knowledgeEntries.toArray();
    return rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }
  const res = await fetch('/api/knowledge');
  if (!res.ok) throw new Error('Failed to fetch knowledge');
  return res.json();
}

export async function saveEntry(input: KnowledgeEntryInput): Promise<KnowledgeEntry> {
  if (isPrivacyMode()) {
    const db = getLocalDB();
    const now = new Date().toISOString();
    if (input.id) {
      const existing = await db.knowledgeEntries.get(input.id);
      const merged: LocalKnowledgeEntry = {
        id: input.id,
        feature: input.feature,
        parentFeature: input.parentFeature ?? null,
        entryType: input.entryType,
        title: input.title,
        content: input.content,
        brand: input.brand ?? null,
        sourceUrl: input.sourceUrl ?? null,
        marketingName: input.marketingName ?? null,
        structured: input.structured ?? null,
        tags: input.tags ?? null,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await db.knowledgeEntries.put(merged);
      return merged;
    }
    const record: LocalKnowledgeEntry = {
      id: localId(),
      feature: input.feature,
      parentFeature: input.parentFeature ?? null,
      entryType: input.entryType,
      title: input.title,
      content: input.content,
      brand: input.brand ?? null,
      sourceUrl: input.sourceUrl ?? null,
      marketingName: input.marketingName ?? null,
      structured: input.structured ?? null,
      tags: input.tags ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await db.knowledgeEntries.add(record);
    return record;
  }

  const method = input.id ? 'PUT' : 'POST';
  const res = await fetch('/api/knowledge', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to save knowledge');
  return res.json();
}

export async function deleteEntry(id: string): Promise<void> {
  if (isPrivacyMode()) {
    await getLocalDB().knowledgeEntries.delete(id);
    return;
  }
  const res = await fetch(`/api/knowledge?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete knowledge');
}

// ─── Templates ──────────────────────────────────────────────────

export async function listTemplates(): Promise<Template[]> {
  if (isPrivacyMode()) {
    const rows = await getLocalDB().templates.toArray();
    return rows.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  }
  const res = await fetch('/api/templates');
  if (!res.ok) throw new Error('Failed to fetch templates');
  return res.json();
}

export async function saveTemplate(input: TemplateInput): Promise<Template> {
  if (isPrivacyMode()) {
    const db = getLocalDB();
    const now = new Date().toISOString();
    if (input.id) {
      const existing = await db.templates.get(input.id);
      const merged: LocalTemplate = {
        id: input.id,
        matchFeatures: input.matchFeatures,
        parentName: input.parentName,
        parentSlogan: input.parentSlogan ?? null,
        subFeatures: input.subFeatures,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      await db.templates.put(merged);
      return merged;
    }
    const record: LocalTemplate = {
      id: localId(),
      matchFeatures: input.matchFeatures,
      parentName: input.parentName,
      parentSlogan: input.parentSlogan ?? null,
      subFeatures: input.subFeatures,
      createdAt: now,
      updatedAt: now,
    };
    await db.templates.add(record);
    return record;
  }

  const method = input.id ? 'PUT' : 'POST';
  const res = await fetch('/api/templates', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to save template');
  return res.json();
}

export async function deleteTemplate(id: string): Promise<void> {
  if (isPrivacyMode()) {
    await getLocalDB().templates.delete(id);
    return;
  }
  const res = await fetch(`/api/templates?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete template');
}
