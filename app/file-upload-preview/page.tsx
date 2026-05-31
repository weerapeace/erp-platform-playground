"use client";

import { useState, useRef, useCallback } from "react";
import { PlaygroundShell } from "@/components/playground-shell";

// ---- File utils ----

type UploadedFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string; // object URL for image preview
  status: "ready" | "uploading" | "done" | "error";
  progress: number;
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string): string {
  if (type.startsWith("image/")) return "🖼️";
  if (type === "application/pdf") return "📄";
  if (type.includes("word") || type.includes("document")) return "📝";
  if (type.includes("sheet") || type.includes("excel")) return "📊";
  if (type.includes("zip") || type.includes("rar")) return "🗜️";
  return "📁";
}

function isImage(type: string): boolean {
  return type.startsWith("image/");
}

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
const MAX_SIZE_MB = 10;

export default function FileUploadPreviewPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [tab, setTab] = useState<"upload" | "images">("upload");
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(incoming)) {
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        alert(`ไฟล์ "${file.name}" ใหญ่เกิน ${MAX_SIZE_MB}MB`);
        continue;
      }
      const id = Math.random().toString(36).slice(2, 9);
      const url = isImage(file.type) ? URL.createObjectURL(file) : undefined;
      newFiles.push({ id, name: file.name, size: file.size, type: file.type, url, status: "ready", progress: 0 });
    }
    setFiles((prev) => [...prev, ...newFiles]);

    // Simulate upload progress
    newFiles.forEach((f) => {
      setFiles((prev) => prev.map((p) => p.id === f.id ? { ...p, status: "uploading" } : p));
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 25 + 10;
        if (progress >= 100) {
          clearInterval(interval);
          setFiles((prev) => prev.map((p) => p.id === f.id ? { ...p, status: "done", progress: 100 } : p));
        } else {
          setFiles((prev) => prev.map((p) => p.id === f.id ? { ...p, progress } : p));
        }
      }, 200);
    });
  }, []);

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const f = prev.find((p) => p.id === id);
      if (f?.url) URL.revokeObjectURL(f.url);
      return prev.filter((p) => p.id !== id);
    });
  };

  const imageFiles = files.filter((f) => isImage(f.type) && f.status === "done");

  return (
    <PlaygroundShell>
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6">
        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-medium mb-3">
          ✅ Phase 8 — File Upload
        </div>
        <h1 className="text-2xl font-bold text-slate-900">📁 File Upload Preview</h1>
        <p className="text-slate-500 mt-1">ระบบแนบไฟล์กลาง — ใช้กับทุกโมดูล</p>
      </div>

      <div className="px-8 py-6 space-y-8">

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-blue-900 mb-1">💡 ลองใช้งานจริงได้เลย!</h2>
          <p className="text-sm text-blue-700">
            ลาก & วางไฟล์ลงในกล่องด้านล่าง หรือกดเพื่อเลือกไฟล์จากเครื่อง — รองรับ JPG, PNG, PDF, Word (ไม่เกิน 10MB)
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {(["upload", "images"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`h-8 px-4 text-sm font-medium rounded-lg border transition-colors ${
                tab === t ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              {t === "upload" ? `📁 ไฟล์ทั้งหมด (${files.length})` : `🖼️ Image Manager (${imageFiles.length})`}
            </button>
          ))}
        </div>

        {tab === "upload" && (
          <>
            {/* Drop zone */}
            <div
              onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                dragging
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-300 hover:border-blue-400 hover:bg-slate-50 bg-white"
              }`}
            >
              <div className="flex flex-col items-center gap-3">
                <span className="text-4xl">{dragging ? "📂" : "📁"}</span>
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {dragging ? "วางไฟล์ที่นี่..." : "คลิกหรือลากไฟล์มาวาง"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">รองรับ JPG, PNG, WebP, PDF, Word — สูงสุด 10MB ต่อไฟล์</p>
                </div>
              </div>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </div>

            {/* File list */}
            {files.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">{files.length} ไฟล์</span>
                  <button
                    onClick={() => { files.forEach((f) => f.url && URL.revokeObjectURL(f.url)); setFiles([]); }}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    ลบทั้งหมด
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {files.map((f) => (
                    <div key={f.id} className="px-5 py-3 flex items-center gap-4">
                      {/* Thumbnail or icon */}
                      {f.url ? (
                        <img src={f.url} alt={f.name} className="w-10 h-10 object-cover rounded-lg border border-slate-200 flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-xl flex-shrink-0">
                          {getFileIcon(f.type)}
                        </div>
                      )}
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{f.name}</p>
                        <p className="text-xs text-slate-400">{formatSize(f.size)}</p>
                        {/* Progress bar */}
                        {f.status === "uploading" && (
                          <div className="mt-1 w-full bg-slate-100 rounded-full h-1.5">
                            <div
                              className="bg-blue-500 h-1.5 rounded-full transition-all"
                              style={{ width: `${f.progress}%` }}
                            />
                          </div>
                        )}
                      </div>
                      {/* Status */}
                      <div className="flex-shrink-0 flex items-center gap-2">
                        {f.status === "uploading" && (
                          <span className="text-xs text-blue-600 font-medium">{Math.round(f.progress)}%</span>
                        )}
                        {f.status === "done" && (
                          <span className="text-xs text-emerald-600 font-medium">✅ เสร็จ</span>
                        )}
                        {f.status === "ready" && (
                          <span className="text-xs text-slate-400">รอ...</span>
                        )}
                        <button
                          onClick={() => removeFile(f.id)}
                          className="p-1 text-slate-300 hover:text-red-500 transition-colors rounded"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {files.length === 0 && (
              <p className="text-center text-xs text-slate-400">← ลองลากไฟล์รูปภาพหรือ PDF มาวางดู</p>
            )}
          </>
        )}

        {/* Image Manager tab */}
        {tab === "images" && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800 text-sm">🖼️ Image Manager</h3>
              <p className="text-xs text-slate-500 mt-0.5">อัปโหลดรูปภาพจาก Tab ไฟล์ทั้งหมด แล้วจัดการรูปที่นี่</p>
            </div>
            {imageFiles.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-3xl mb-3">🖼️</p>
                <p className="text-sm text-slate-500">ยังไม่มีรูปภาพ</p>
                <p className="text-xs text-slate-400 mt-1">ไปที่ Tab &ldquo;ไฟล์ทั้งหมด&rdquo; แล้วอัปโหลดรูปก่อน</p>
                <button
                  onClick={() => setTab("upload")}
                  className="mt-3 h-8 px-3 text-xs text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50"
                >
                  ไปอัปโหลดรูป →
                </button>
              </div>
            ) : (
              <div className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {imageFiles.map((f, idx) => (
                    <div key={f.id} className="group relative">
                      <div className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                        idx === 0 ? "border-blue-500 ring-2 ring-blue-200" : "border-slate-200 hover:border-blue-300"
                      }`}>
                        <img src={f.url} alt={f.name} className="w-full h-full object-cover" />
                      </div>
                      {idx === 0 && (
                        <span className="absolute top-1.5 left-1.5 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded font-medium">
                          หลัก
                        </span>
                      )}
                      <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <button
                          onClick={() => removeFile(f.id)}
                          className="w-6 h-6 rounded bg-red-500 text-white text-xs flex items-center justify-center"
                        >
                          ×
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 truncate px-0.5">{f.name}</p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-4">
                  💡 รูปแรกในลำดับถูกกำหนดเป็น &ldquo;รูปหลัก&rdquo; โดยอัตโนมัติ
                </p>
              </div>
            )}
          </div>
        )}

        {/* Feature checklist */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Feature Checklist</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { done: true,  label: "Drag & drop upload" },
              { done: true,  label: "Click to select files" },
              { done: true,  label: "Multiple files" },
              { done: true,  label: "File size validation (10MB)" },
              { done: true,  label: "Image thumbnail preview" },
              { done: true,  label: "Upload progress simulation" },
              { done: true,  label: "Remove file" },
              { done: true,  label: "Image Manager tab" },
              { done: true,  label: "Primary image concept" },
              { done: false, label: "Upload to Supabase Storage" },
              { done: false, label: "Crop & resize image" },
              { done: false, label: "Download file" },
              { done: false, label: "Attach to module record" },
              { done: false, label: "Audit log" },
            ].map((item) => (
              <div key={item.label} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                item.done ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-400"
              }`}>
                <span>{item.done ? "✅" : "⬜"}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>

      </div>
    </PlaygroundShell>
  );
}
