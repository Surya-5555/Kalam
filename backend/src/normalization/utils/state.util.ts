/**
 * Indian state / place-of-supply normalization utility.
 *
 * Maps a raw state name or abbreviation to the canonical full name,
 * the ISO 3166-2:IN two-letter code, and the GST 2-digit state code
 * used on Indian tax invoices.
 *
 * Sources:
 *  – GST state codes (GSTIN prefix): 01–37
 *  – ISO 3166-2:IN codes (e.g. "IN-MH")
 *
 * Non-Indian strings are returned as-is with null codes.
 */

export interface NormalizedState {
  /** Original string as extracted. */
  raw: string | null;
  /** Full canonical state / UT name. null when input couldn't be matched. */
  normalized: string | null;
  /** ISO 3166-2 sub-code (2 letters), e.g. "MH". null for non-Indian or unknown. */
  isoCode: string | null;
  /**
   * GST 2-digit state code (zero-padded string), e.g. "27".
   * null for non-Indian or unknown.
   */
  gstCode: string | null;
  /** 0–1 confidence in the match. */
  confidence: number;
}

interface StateEntry {
  /** Canonical full name. */
  name: string;
  /** ISO 3166-2 sub-code (without "IN-" prefix). */
  isoCode: string;
  /** GST 2-digit code as string. */
  gstCode: string;
  /** Additional lowercase aliases for matching. */
  aliases: string[];
}

const STATES: StateEntry[] = [
  { name: 'Jammu & Kashmir',          isoCode: 'JK', gstCode: '01', aliases: ['jammu and kashmir', 'j&k', 'jk', 'j & k', 'jammu kashmir'] },
  { name: 'Himachal Pradesh',         isoCode: 'HP', gstCode: '02', aliases: ['himachal', 'hp'] },
  { name: 'Punjab',                   isoCode: 'PB', gstCode: '03', aliases: ['pb'] },
  { name: 'Chandigarh',               isoCode: 'CH', gstCode: '04', aliases: ['ch'] },
  { name: 'Uttarakhand',              isoCode: 'UT', gstCode: '05', aliases: ['uttaranchal', 'uk', 'uttrakhand'] },
  { name: 'Haryana',                  isoCode: 'HR', gstCode: '06', aliases: ['hr'] },
  { name: 'Delhi',                    isoCode: 'DL', gstCode: '07', aliases: ['dl', 'new delhi', 'nct of delhi', 'nct delhi'] },
  { name: 'Rajasthan',                isoCode: 'RJ', gstCode: '08', aliases: ['rj', 'rajastahan'] },
  { name: 'Uttar Pradesh',            isoCode: 'UP', gstCode: '09', aliases: ['up', 'u.p.'] },
  { name: 'Bihar',                    isoCode: 'BR', gstCode: '10', aliases: ['br'] },
  { name: 'Sikkim',                   isoCode: 'SK', gstCode: '11', aliases: ['sk'] },
  { name: 'Arunachal Pradesh',        isoCode: 'AR', gstCode: '12', aliases: ['ar', 'arunachal'] },
  { name: 'Nagaland',                 isoCode: 'NL', gstCode: '13', aliases: ['nl'] },
  { name: 'Manipur',                  isoCode: 'MN', gstCode: '14', aliases: ['mn'] },
  { name: 'Mizoram',                  isoCode: 'MZ', gstCode: '15', aliases: ['mz'] },
  { name: 'Tripura',                  isoCode: 'TR', gstCode: '16', aliases: ['tr'] },
  { name: 'Meghalaya',                isoCode: 'ML', gstCode: '17', aliases: ['ml'] },
  { name: 'Assam',                    isoCode: 'AS', gstCode: '18', aliases: ['as'] },
  { name: 'West Bengal',              isoCode: 'WB', gstCode: '19', aliases: ['wb', 'bengal', 'w.b.'] },
  { name: 'Jharkhand',                isoCode: 'JH', gstCode: '20', aliases: ['jh', 'jharkand'] },
  { name: 'Odisha',                   isoCode: 'OD', gstCode: '21', aliases: ['od', 'orissa', 'or'] },
  { name: 'Chhattisgarh',             isoCode: 'CT', gstCode: '22', aliases: ['ct', 'chattisgarh', 'chhatisgarh', 'cg'] },
  { name: 'Madhya Pradesh',           isoCode: 'MP', gstCode: '23', aliases: ['mp', 'm.p.', 'madhyapradesh'] },
  { name: 'Gujarat',                  isoCode: 'GJ', gstCode: '24', aliases: ['gj', 'gujrat', 'gujrat'] },
  { name: 'Dadra & Nagar Haveli and Daman & Diu', isoCode: 'DH', gstCode: '26', aliases: ['daman', 'diu', 'dadra nagar haveli', 'daman and diu', 'dnhdd', 'dd', 'dnh'] },
  { name: 'Maharashtra',              isoCode: 'MH', gstCode: '27', aliases: ['mh', 'maharastra', 'maharashtra'] },
  { name: 'Andhra Pradesh',           isoCode: 'AP', gstCode: '28', aliases: ['ap', 'a.p.', 'andhra'] },
  { name: 'Karnataka',                isoCode: 'KA', gstCode: '29', aliases: ['ka', 'karnataka', 'karnatak'] },
  { name: 'Goa',                      isoCode: 'GA', gstCode: '30', aliases: ['ga'] },
  { name: 'Lakshadweep',              isoCode: 'LD', gstCode: '31', aliases: ['ld', 'lakshadweep islands'] },
  { name: 'Kerala',                   isoCode: 'KL', gstCode: '32', aliases: ['kl', 'kerela'] },
  { name: 'Tamil Nadu',               isoCode: 'TN', gstCode: '33', aliases: ['tn', 'tamilnadu', 'tamil nad'] },
  { name: 'Puducherry',               isoCode: 'PY', gstCode: '34', aliases: ['py', 'pondicherry', 'pondicheri', 'pondy'] },
  { name: 'Andaman & Nicobar Islands', isoCode: 'AN', gstCode: '35', aliases: ['an', 'andaman nicobar', 'andaman and nicobar'] },
  { name: 'Telangana',                isoCode: 'TS', gstCode: '36', aliases: ['ts', 'telangana', 'telegana'] },
  { name: 'Ladakh',                   isoCode: 'LA', gstCode: '37', aliases: ['la'] },
];

// Build lookup maps at module load time for O(1) matching
const BY_CANONICAL_NAME = new Map<string, StateEntry>();
const BY_ISO_CODE       = new Map<string, StateEntry>();
const BY_GST_CODE       = new Map<string, StateEntry>();
const BY_ALIAS          = new Map<string, StateEntry>();

for (const entry of STATES) {
  BY_CANONICAL_NAME.set(entry.name.toLowerCase(), entry);
  BY_ISO_CODE.set(entry.isoCode.toLowerCase(), entry);
  BY_GST_CODE.set(entry.gstCode, entry);
  for (const alias of entry.aliases) {
    BY_ALIAS.set(alias.toLowerCase(), entry);
  }
}

export function normalizeState(raw: string | null | undefined): NormalizedState {
  if (raw == null || raw.trim() === '') {
    return { raw: raw ?? null, normalized: null, isoCode: null, gstCode: null, confidence: 0 };
  }

  const input = raw.trim();
  const key = input.toLowerCase().replace(/[.\-,]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Exact canonical name match
  let entry = BY_CANONICAL_NAME.get(key);
  if (entry) {
    return { raw: input, normalized: entry.name, isoCode: entry.isoCode, gstCode: entry.gstCode, confidence: 1.0 };
  }

  // ISO code match (2 chars)
  entry = BY_ISO_CODE.get(key);
  if (entry) {
    return { raw: input, normalized: entry.name, isoCode: entry.isoCode, gstCode: entry.gstCode, confidence: 0.95 };
  }

  // GST numeric code match
  const numericKey = input.replace(/\D/g, '').padStart(2, '0');
  if (numericKey.length === 2) {
    entry = BY_GST_CODE.get(numericKey);
    if (entry) {
      return { raw: input, normalized: entry.name, isoCode: entry.isoCode, gstCode: entry.gstCode, confidence: 0.9 };
    }
  }

  // Alias table match
  entry = BY_ALIAS.get(key);
  if (entry) {
    return { raw: input, normalized: entry.name, isoCode: entry.isoCode, gstCode: entry.gstCode, confidence: 0.9 };
  }

  // Partial / substring match (fallback — lower confidence)
  for (const [alias, e] of BY_ALIAS) {
    if (key.includes(alias) || alias.includes(key)) {
      return { raw: input, normalized: e.name, isoCode: e.isoCode, gstCode: e.gstCode, confidence: 0.6 };
    }
  }

  // Not an Indian state; pass through
  return { raw: input, normalized: input, isoCode: null, gstCode: null, confidence: 0.4 };
}
