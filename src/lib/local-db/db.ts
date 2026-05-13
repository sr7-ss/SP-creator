import Dexie, { type Table } from 'dexie';

export interface LocalKnowledgeEntry {
  id: string;
  feature: string;
  parentFeature: string | null;
  entryType: string;
  title: string;
  content: string;
  brand: string | null;
  sourceUrl: string | null;
  structured: unknown;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalTemplate {
  id: string;
  matchFeatures: string[];
  parentName: string;
  parentSlogan: string | null;
  subFeatures: { name: string; fromFeature?: string }[];
  createdAt: string;
  updatedAt: string;
}

class KspLocalDB extends Dexie {
  knowledgeEntries!: Table<LocalKnowledgeEntry, string>;
  templates!: Table<LocalTemplate, string>;

  constructor() {
    super('ksp-assistant-local');
    this.version(1).stores({
      knowledgeEntries: 'id, feature, parentFeature, entryType, brand, updatedAt',
      templates: 'id, createdAt',
    });
  }
}

let _db: KspLocalDB | null = null;

export function getLocalDB(): KspLocalDB {
  if (typeof window === 'undefined') {
    throw new Error('Local DB is only available in the browser');
  }
  if (!_db) _db = new KspLocalDB();
  return _db;
}

export function localId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
