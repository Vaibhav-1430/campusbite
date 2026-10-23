/**
 * RFC 4180 Compliant CSV Generation Utilities
 */

export function escapeCsvField(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  // If the string contains comma, double quote, or newlines, wrap in quotes and escape internal quotes
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

export function generateCsv(headers: string[], rows: any[][]): string {
  const headerLine = headers.map(escapeCsvField).join(',');
  const rowLines = rows.map((row) => row.map(escapeCsvField).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}
