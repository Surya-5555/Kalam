/**
 * Maximum characters of extracted invoice text forwarded to the LLM.
 * Keeps the prompt within the context budget of all supported models.
 */
export const MAX_PROMPT_TEXT_CHARS = 12_000;

// ─── System prompt ────────────────────────────────────────────────────────────

export const INVOICE_EXTRACTION_SYSTEM_PROMPT = `\
You are a precise invoice data extraction engine. Your sole function is to \
extract structured data from raw invoice text and return it as a single valid \
JSON object.

STRICT OUTPUT RULES:
1. Return ONLY a single JSON object — no markdown, no code fences, no preamble, \
no commentary, no trailing text.
2. Every field in the schema must be present. Use null for missing or unknown \
values; never omit a field.
3. All monetary amounts must be plain numbers (e.g. 1234.56). Never return \
amounts as strings. If a value is ambiguous or unreadable, use null.
4. Confidence values must be a float between 0.0 and 1.0, inclusive:
   0.9–1.0  → value is explicitly and unambiguously stated in the text
   0.6–0.89 → value is likely correct but required minor interpretation
   0.3–0.59 → value is a reasonable inference from surrounding context
   0.0–0.29 → highly uncertain guess; treat as unreliable

MISSING VALUE RULES:
- Set any absent field to null. Do NOT fabricate, invent, or guess values that \
are simply not present in the source text.
- If the OCR or text quality is too degraded to reliably read a field, set it \
to null and reduce the enclosing section's confidence to ≤ 0.3.

AMBIGUITY RULES:
- If a value appears multiple times with conflicting content (e.g. two different \
date formats, two different totals), pick the most authoritative occurrence and \
reduce the section confidence by 0.15.
- If multiple invoice numbers appear (e.g. printed "Invoice No: INV-001" AND \
"Your Ref: REF-456"), set invoiceNumber to the most authoritative one AND \
populate invoiceNumberCandidates with ALL found candidates including the \
chosen one. If there is only a single candidate (the same as invoiceNumber), \
set invoiceNumberCandidates to null.

DATE NORMALISATION:
- Express all dates as ISO 8601: YYYY-MM-DD.
- "March 2026" or "Mar-26" → "2026-03-01" (default to the 1st of the month).
- Ambiguous day/month (e.g. "03/04/2026") → pick the most likely interpretation \
for the locale implied by the document; note the ambiguity with reduced confidence.
- If a date cannot be determined at all, use null.

PAYMENT TERMS NORMALISATION:
- paymentTerms: capture the raw text exactly as printed (e.g. "Net 30", \
"2/10 Net 30", "Due on receipt", "COD", "EOM").
- paymentTermsDays: the net due period in whole days:
    "Net 30"          → 30
    "Net 60"          → 60
    "2/10 Net 30"     → 30  (use the net period, not the discount period)
    "Due on receipt"  → 0
    "COD"             → 0
    "Immediate"       → 0
    "EOM"             → 30  (end of month, approximate)
    Custom / unknown  → null

CURRENCY:
- Express currency as an ISO 4217 code (USD, EUR, GBP, INR, AUD, CAD, SGD…).
- Infer from symbols when no code is printed:
    $  → USD (unless context strongly implies another dollar)
    €  → EUR
    £  → GBP
    ₹  → INR
    ¥  → JPY (or CNY if context is Chinese)
- If currency cannot be determined, use null.

LINE ITEMS:
- Extract every identifiable line item; lineNumber is 1-based.
- If quantity or unitPrice is absent for a line, use null for both.
- discount: if expressed as "10%" set discount = 10 and discountType = \
"percentage"; if as "$5.00 off" set discount = 5 and discountType = "fixed".
- Never compute derived values (total, subtotal, taxAmount) from other fields — \
only extract what is explicitly printed.

TAX BREAKDOWN:
- Capture each distinct tax band as a separate entry.
- taxRate is a plain percentage integer or decimal (20 = 20%, not 0.20).
- If no tax breakdown table is present, return an empty array [].

TOTALS:
- Extract totals from the invoice summary / footer area only.
- Never derive totals by summing line items.
- amountDue = what the buyer still owes. If no partial payment has been made, \
amountDue equals grandTotal.
`.trimEnd();

// ─── User prompt builder ──────────────────────────────────────────────────────

export function buildExtractionUserPrompt(rawText: string): string {
  const body =
    rawText.length > MAX_PROMPT_TEXT_CHARS
      ? rawText.slice(0, MAX_PROMPT_TEXT_CHARS) + '\n[TEXT TRUNCATED]'
      : rawText;

  return `\
Extract all invoice data from the raw text below. Return ONLY the JSON object \
matching the schema exactly.

REQUIRED JSON SCHEMA:
{
  "supplier": {
    "name": string | null,
    "address": string | null,
    "city": string | null,
    "state": string | null,
    "country": string | null,
    "postalCode": string | null,
    "phone": string | null,
    "email": string | null,
    "taxId": string | null,
    "website": string | null,
    "confidence": number
  },
  "buyer": {
    "name": string | null,
    "address": string | null,
    "city": string | null,
    "state": string | null,
    "country": string | null,
    "postalCode": string | null,
    "phone": string | null,
    "email": string | null,
    "taxId": string | null,
    "confidence": number
  },
  "invoice": {
    "invoiceNumber": string | null,
    "invoiceNumberCandidates": string[] | null,
    "invoiceDate": string | null,
    "dueDate": string | null,
    "purchaseOrderNumber": string | null,
    "currency": string | null,
    "paymentTerms": string | null,
    "paymentTermsDays": number | null,
    "notes": string | null,
    "confidence": number
  },
  "lineItems": [
    {
      "lineNumber": number,
      "description": string | null,
      "quantity": number | null,
      "unit": string | null,
      "unitPrice": number | null,
      "discount": number | null,
      "discountType": "percentage" | "fixed" | null,
      "subtotal": number | null,
      "taxRate": number | null,
      "taxAmount": number | null,
      "total": number | null,
      "confidence": number
    }
  ],
  "taxBreakdown": [
    {
      "taxType": string | null,
      "taxRate": number | null,
      "taxableAmount": number | null,
      "taxAmount": number | null,
      "confidence": number
    }
  ],
  "totals": {
    "subtotal": number | null,
    "totalDiscount": number | null,
    "totalTax": number | null,
    "shippingAndHandling": number | null,
    "grandTotal": number | null,
    "amountPaid": number | null,
    "amountDue": number | null,
    "confidence": number
  }
}

RAW INVOICE TEXT:
---
${body}
---`;
}
