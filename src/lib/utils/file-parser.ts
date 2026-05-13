import * as XLSX from 'xlsx';

export interface ParsedFile {
  columns: string[];
  rows: string[][];
  sheetName: string;
}

/**
 * Parse an uploaded CSV/XLS/XLSX file on the client side.
 * Returns column headers and row data.
 */
export async function parseUploadedFile(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
  if (raw.length === 0) {
    throw new Error('File is empty');
  }

  const columns = (raw[0] || []).map(String);
  const rows = raw.slice(1).map(row =>
    Array.isArray(row) ? row.map(cell => String(cell ?? '')) : []
  ).filter(row => row.some(cell => cell.trim()));

  return { columns, rows, sheetName };
}
