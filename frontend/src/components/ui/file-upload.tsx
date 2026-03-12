"use client";

import { useState, useCallback, useRef } from "react";
import { UploadCloud, FileText, X, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onUploadSuccess: (documentId: string, filename: string) => void;
  onUploadError: (error: string) => void;
}

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
const FORMAT_LABELS = ["PDF", "JPG", "PNG"];

export function FileUpload({ onUploadSuccess, onUploadError }: FileUploadProps) {
  useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const validateFile = (selectedFile: File) => {
    if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
      onUploadError("Invalid file type. Please upload a PDF, JPG, or PNG.");
      return false;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      onUploadError("File size exceeds the 10 MB limit.");
      return false;
    }
    return true;
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && validateFile(dropped)) setFile(dropped);
  }, [onUploadError]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && validateFile(selected)) setFile(selected);
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadFile = async () => {
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await apiFetch("/invoice/upload", { method: "POST", body: formData });

      if (!response || !response.ok) {
        let errMessage = "Upload failed";
        try {
          const errData = await response?.json();
          if (typeof errData.message === "string") errMessage = errData.message;
          else if (Array.isArray(errData.message)) errMessage = errData.message.join(" ");
        } catch { /* ignore */ }
        throw new Error(errMessage);
      }

      const data = await response.json();
      onUploadSuccess(data.documentId as string, file.name);
      setFile(null);
    } catch (error: unknown) {
      onUploadError(error instanceof Error ? error.message : "An unexpected error occurred.");
    } finally {
      setIsUploading(false);
    }
  };

  if (!file) {
    return (
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "relative w-full cursor-pointer rounded-2xl border-2 border-dashed px-8 py-14 text-center transition-all duration-200 select-none",
          isDragging
            ? "border-slate-900 bg-slate-50"
            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60",
        )}
      >
        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".pdf,image/jpeg,image/png,image/jpg"
        />

        {/* Icon */}
        <div className="mx-auto mb-5 flex w-fit items-center justify-center rounded-xl bg-slate-100 p-4 transition-colors duration-200">
          <UploadCloud
            className={cn(
              "h-7 w-7 transition-colors duration-200",
              isDragging ? "text-slate-900" : "text-slate-400",
            )}
          />
        </div>

        {/* Copy */}
        <p className="mb-1 text-base font-semibold text-slate-900">
          {isDragging ? "Release to upload" : "Drop your invoice here"}
        </p>
        <p className="text-sm text-slate-500">
          or{" "}
          <span className="font-medium text-slate-900 underline underline-offset-2">
            click to browse
          </span>
        </p>

        {/* Format pills */}
        <div className="mt-6 flex items-center justify-center gap-2">
          {FORMAT_LABELS.map((fmt) => (
            <span
              key={fmt}
              className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500"
            >
              {fmt}
            </span>
          ))}
          <span className="text-xs text-slate-400">· max 10 MB</span>
        </div>
      </div>
    );
  }

  // File selected state
  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
  const fileType = file.type || "Unknown";

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* File row */}
      <div className="flex items-center gap-4 border-b border-slate-100 px-5 py-4">
        <div className="shrink-0 rounded-xl bg-slate-100 p-3">
          <FileText className="h-5 w-5 text-slate-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-semibold text-slate-900"
            title={file.name}
          >
            {file.name}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {fileSizeMB} MB &middot; {fileType}
          </p>
        </div>
        <button
          type="button"
          onClick={removeFile}
          disabled={isUploading}
          className="shrink-0 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-40"
          aria-label="Remove file"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 bg-slate-50/60 px-5 py-3.5">
        <Button
          type="button"
          variant="ghost"
          className="h-9 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          onClick={removeFile}
          disabled={isUploading}
        >
          Cancel
        </Button>
        <Button
          type="button"
          className="h-9 gap-2 rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white shadow-none hover:bg-slate-800 disabled:opacity-60"
          onClick={uploadFile}
          disabled={isUploading}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              Upload Invoice
              <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
