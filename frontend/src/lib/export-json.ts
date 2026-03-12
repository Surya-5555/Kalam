import type {
  NormalizedInvoice,
  BusinessValidationResult,
} from "@/lib/api/invoice";

export interface NormalizedExportPayload {
  normalizedInvoice: NormalizedInvoice;
  businessValidation: BusinessValidationResult | null;
}

/** Builds a pretty-printed JSON string from the final normalized payload. */
export function buildExportJson(payload: NormalizedExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

/** Writes JSON to the user's clipboard. Throws if clipboard access is denied. */
export async function copyJsonToClipboard(json: string): Promise<void> {
  await navigator.clipboard.writeText(json);
}

/**
 * Triggers a browser download of the JSON string as a `.json` file.
 * Always disposes the object URL immediately after the click.
 */
export function downloadJsonFile(json: string, filename: string): void {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/** Derives a safe download filename from an original upload name. */
export function buildExportFilename(originalName: string): string {
  const base = originalName.replace(/\.[^/.]+$/, ""); // strip extension
  const safe = base.replace(/[^a-zA-Z0-9_\- ]/g, "_").trim();
  return `${safe}_normalized.json`;
}
