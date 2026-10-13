export type MedicineCandidate = {
  id: string;
  name: string;
  confidence: number;
  needsReview: boolean;
};

const excludedLine = /\b(patient|address|dob|date of birth|age|sex|phone|doctor|clinic|hospital|diagnosis|allerg|history|signature|pharmacy|refill|follow.?up|prescription|date)\b/i;
const dosageStart = /\b(?:\d+(?:[.,/]\d+)?\s*(?:mg|mcg|g|ml|mL|iu|units?|%|tablets?|capsules?)|take\s+\d|once\s+(?:daily|a day)|twice\s+(?:daily|a day)|every\s+\d|for\s+\d+\s+days?|as directed|daily|twice|once|morning|evening|before|after|with food|tablet|capsule|drops?|syrup|cream|injection|apply|use)\b/i;
const candidateCue = /^\s*(?:\d{1,2}[.)]|\d+[-:])|\b\d+(?:[.,/]\d+)?\s*(?:mg|mcg|g|ml|mL|iu|units?|%|tablets?|capsules?)\b|^\s*Rx(?:\.|:|\b)/i;
const nonMedicineOnly = /^(?:\d+|[a-z]{1,2}|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)$/i;

function cleanCandidate(line: string): string | null {
  if (!candidateCue.test(line)) return null;
  let text = line
    .replace(/^\s*(?:\d+|[•*–—-])[\s.)\-:]*/, '')
    .replace(/\b(?:Rx|Rx\.)\b/gi, '')
    .trim();

  if (!text || excludedLine.test(text) || /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(text)) return null;
  const doseAt = text.search(dosageStart);
  if (doseAt >= 0) text = text.slice(0, doseAt).trim();
  text = text.replace(/[,:;|()[\]{}]+$/g, '').replace(/\s+/g, ' ').trim();
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 4) text = words.slice(0, 4).join(' ');
  if (text.length < 3 || nonMedicineOnly.test(text) || !/[a-z]/i.test(text)) return null;
  if (/^(?:please|take|continue|stop|discontinue|start|increase|decrease|patient|doctor)\b/i.test(text)) return null;
  return text;
}

/** Conservative extraction from OCR line-level confidence; it is not a medication dictionary. */
export function extractMedicineCandidates(lines: Array<{ text: string; confidence: number }>): MedicineCandidate[] {
  const seen = new Set<string>();
  const output: MedicineCandidate[] = [];
  for (const [index, line] of lines.entries()) {
    const name = cleanCandidate(line.text);
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const confidence = Math.max(0, Math.min(100, Math.round(line.confidence || 0)));
    output.push({
      id: `${index}-${key.replace(/[^a-z0-9]+/g, '-')}`,
      name,
      confidence,
      needsReview: confidence < 78,
    });
  }
  return output;
}
