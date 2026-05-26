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
  /** brand_name entries: fixed marketing name, e.g. "青海湖电池" */
  marketingName: string | null;
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

class SpLocalDB extends Dexie {
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

let _db: SpLocalDB | null = null;

export function getLocalDB(): SpLocalDB {
  if (typeof window === 'undefined') {
    throw new Error('Local DB is only available in the browser');
  }
  if (!_db) _db = new SpLocalDB();
  return _db;
}

export function localId(): string {
  return `local_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
