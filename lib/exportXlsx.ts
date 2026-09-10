export type XlsxSheet = { name: string; rows: Record<string, unknown>[] };

// A cell starting with one of these characters can be interpreted as a formula
// by Excel/Sheets when the file is opened (CSV/formula injection). Values here
// come from free-text user input (issue titles, modules, assignees, ...), so
// every string cell is defused with a leading apostrophe — Excel's own
// force-text marker — before it ever reaches the workbook.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function sanitizeCell(value: unknown): unknown {
  return typeof value === 'string' && FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, sanitizeCell(value)]));
}

// Dynamically imported — xlsx is a large library that only needs to load
// when someone actually clicks an export button, not on every page visit.
export async function downloadWorkbook(sheets: XlsxSheet[], filename: string) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.rows.map(sanitizeRow));
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}
