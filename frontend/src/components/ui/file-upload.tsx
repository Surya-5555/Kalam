"use client";

import { useState, useCallback, useRef } from "react";
import { UploadCloud, FileType, CheckCircle, AlertCircle, X, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";

interface FileUploadProps {
  onUploadSuccess: (documentId: string, filename: string, qualityWarnings: string[]) => void;
  onUploadError: (error: string) => void;
}

export function FileUpload({ onUploadSuccess, onUploadError }: FileUploadProps) {
  const { accessToken } = useAuth();
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
    const validTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (!validTypes.includes(selectedFile.type)) {
      onUploadError("Invalid file type. Please upload a PDF, JPG, or PNG.");
      return false;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      onUploadError("File size exceeds the 10MB limit.");
      return false;
    }
    return true;
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (validateFile(droppedFile)) {
        setFile(droppedFile);
      }
    }
  }, [onUploadError]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (validateFile(selectedFile)) {
        setFile(selectedFile);
      }
    }
  };

  const removeFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const uploadFile = async () => {
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/invoice/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        let errMessage = "Upload failed";
        try {
          const errData = await response.json();
          // NestJS wraps nested exception bodies under the `message` key when
          // they are plain strings, but passes objects through directly.
          if (typeof errData.message === 'string') {
            errMessage = errData.message;
          } else if (Array.isArray(errData.message)) {
            errMessage = errData.message.join(' ');
          }
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(errMessage);
      }

      const data = await response.json();
      const qualityWarnings: string[] = data.inspectionResult?.qualityWarnings ?? [];
      onUploadSuccess(data.documentId, file.name, qualityWarnings);
      setFile(null);
    } catch (error: any) {
      onUploadError(error.message || "An unexpected error occurred during upload.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {!file ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors duration-200 group
            ${isDragging
              ? "border-black bg-slate-50"
              : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50"
            }
          `}
        >
          <input
            type="file"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".pdf, image/jpeg, image/png, image/jpg"
          />
          <div className="flex justify-center mb-6">
            <div className={`p-5 rounded-full transition-colors duration-200
              ${isDragging ? "bg-slate-200 text-black" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200 group-hover:text-slate-900"}
              `}>
               <UploadCloud className="w-10 h-10" />
            </div>
          </div>
          <h3 className="text-xl font-bold text-black mb-2">
            Click or drag and drop to upload
          </h3>
          <p className="text-sm text-slate-600 max-w-xs mx-auto mb-8 font-medium">
            Upload your supplier invoices. Supports PDF, JPG, and PNG up to 10MB.
          </p>
          <Button type="button" className="rounded-full bg-black hover:bg-slate-800 text-white border-0 px-8 font-semibold shadow-none pointer-events-none">
            Select File
          </Button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-100">
             <div className="flex items-center space-x-4 overflow-hidden">
               <div className="p-3 bg-slate-100 text-slate-900 rounded-xl flex-shrink-0">
                 <File className="w-6 h-6" />
               </div>
               <div className="overflow-hidden">
                 <h4 className="font-semibold text-black truncate pr-4" title={file.name}>{file.name}</h4>
                 <p className="text-sm font-medium text-slate-500 mt-0.5">{(file.size / (1024 * 1024)).toFixed(2)} MB • {file.type || 'Unknown Type'}</p>
               </div>
             </div>
             <button
                onClick={removeFile}
                disabled={isUploading}
                className="p-2 text-slate-500 hover:text-black hover:bg-slate-100 rounded-full transition-colors disabled:opacity-50"
             >
               <X className="w-5 h-5" />
             </button>
          </div>
          
          <div className="flex justify-end space-x-3">
             <Button type="button" variant="outline" className="rounded-full font-medium text-black bg-white border-slate-300 hover:bg-slate-50" onClick={removeFile} disabled={isUploading}>
               Cancel
             </Button>
             <Button type="button" className="rounded-full bg-black hover:bg-slate-800 text-white border-0 shadow-none font-semibold" onClick={uploadFile} disabled={isUploading}>
               {isUploading ? (
                 <>
                   <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                   Uploading...
                 </>
               ) : (
                 <>
                   Upload Invoice
                   <CheckCircle className="w-4 h-4 ml-2" />
                 </>
               )}
             </Button>
          </div>
        </div>
      )}
    </div>
  );
}
