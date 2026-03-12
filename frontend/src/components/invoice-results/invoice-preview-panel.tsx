"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { ChevronLeft, ChevronRight, FileX, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

// Configure PDF.js worker from CDN — must be set once at module scope before
// any Document is rendered.
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface InvoicePreviewPanelProps {
  documentId: string;
  mimeType: string;
}

export function InvoicePreviewPanel({
  documentId,
  mimeType,
}: InvoicePreviewPanelProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // PDF-specific state
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfError, setPdfError] = useState(false);

  // Container width used to scale the PDF page to fit
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(320);

  const isPDF = mimeType === "application/pdf";
  const isImage =
    mimeType === "image/jpeg" ||
    mimeType === "image/jpg" ||
    mimeType === "image/png";

  // Measure container inner width so the PDF page fills it exactly
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    setContainerWidth(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, []);

  // Fetch the invoice file as a blob via the authenticated API, then turn it
  // into a local blob URL that react-pdf / <img> can consume.
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    setIsLoading(true);
    setError(null);
    setBlobUrl(null);
    setCurrentPage(1);
    setNumPages(0);
    setPdfError(false);

    (async () => {
      try {
        const response = await apiFetch(`/invoice/${documentId}/file`);
        if (!response?.ok) {
          throw new Error(
            `Could not load file (${response?.status ?? "network error"})`,
          );
        }
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load preview",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [documentId]);

  const prevPage = useCallback(
    () => setCurrentPage((p) => Math.max(1, p - 1)),
    [],
  );
  const nextPage = useCallback(
    () => setCurrentPage((p) => Math.min(numPages, p + 1)),
    [numPages],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") prevPage();
      else if (e.key === "ArrowRight") nextPage();
    },
    [prevPage, nextPage],
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Document Preview
        </p>
        {isPDF && numPages > 0 && (
          <span className="font-mono text-xs tabular-nums text-slate-400">
            {currentPage}&thinsp;/&thinsp;{numPages}
          </span>
        )}
      </div>

      {/* Viewer area */}
      <div
        ref={containerRef}
        className={cn(
          "relative flex min-h-48 items-center justify-center overflow-hidden bg-slate-100",
          isPDF && "min-h-72",
        )}
        // Allow keyboard navigation when focused
        tabIndex={isPDF && numPages > 1 ? 0 : undefined}
        onKeyDown={isPDF && numPages > 1 ? handleKeyDown : undefined}
      >
        {/* Loading spinner */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
            <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
          </div>
        )}

        {/* Error state */}
        {(error || pdfError) && !isLoading && (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
            <FileX className="h-8 w-8 text-slate-300" />
            <p className="text-xs font-medium text-slate-500">
              Preview unavailable
            </p>
            {error && (
              <p className="text-[10px] text-slate-400">{error}</p>
            )}
          </div>
        )}

        {/* Image preview */}
        {blobUrl && !isLoading && isImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={blobUrl}
            alt="Invoice preview"
            className="block h-auto w-full object-contain"
            draggable={false}
          />
        )}

        {/* PDF preview */}
        {blobUrl && !isLoading && isPDF && !pdfError && (
          <Document
            file={blobUrl}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            onLoadError={() => setPdfError(true)}
            loading={null}
            noData={null}
          >
            <Page
              pageNumber={currentPage}
              width={containerWidth}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              loading={null}
            />
          </Document>
        )}
      </div>

      {/* PDF page navigation — only shown when there are multiple pages */}
      {isPDF && numPages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2.5">
          <button
            type="button"
            onClick={prevPage}
            disabled={currentPage <= 1}
            aria-label="Previous page"
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="text-xs font-medium tabular-nums text-slate-600">
            Page {currentPage} of {numPages}
          </span>

          <button
            type="button"
            onClick={nextPage}
            disabled={currentPage >= numPages}
            aria-label="Next page"
            className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
