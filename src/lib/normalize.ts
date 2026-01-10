export function normalizeFacilityId(token: string): string {
  let cleaned = token.trim().toUpperCase();
  cleaned = cleaned.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "");
  if (!cleaned) return "";
  if (/^K[A-Z0-9]{3,4}$/.test(cleaned)) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
}

export function isCoordinateToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) return false;
  if (trimmed.includes("\u00B0")) return true;
  if (/[NS]\d/.test(trimmed) || /\d[NS]/.test(trimmed)) return true;
  if (/[EW]\d/.test(trimmed) || /\d[EW]/.test(trimmed)) return true;
  if (/^[-+]?\d{1,3}\.\d+[NS]?$/.test(trimmed)) return true;
  if (/^[-+]?\d{1,3}\.\d+[,/][-+]?\d{1,3}\.\d+$/.test(trimmed)) return true;
  if (/^[NS]\d{1,2}\.\d+[/,][EW]\d{1,3}\.\d+$/i.test(trimmed)) return true;
  return false;
}

export function tokenizeText(text: string): string[] {
  return text
    .split(/[\s,;()\[\]{}<>\/\\|]+|--?|_/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}
