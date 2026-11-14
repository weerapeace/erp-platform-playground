"use client";

/**
 * FileInput — อัปโหลดไฟล์แนบกลาง (ของกลาง) รองรับทั้งรูปภาพและ PDF
 * ค่า value = ที่อยู่ไฟล์กลาง (ref · lib/file-ref): R2 key เดิม หรือ "sb:erp-files/…" (Supabase ส่วนตัว)
 * - ส่ง category (หมวดในกฎที่เก็บไฟล์ เช่น "supplier_bills") → ระบบเลือกที่เก็บตามกฎ (lib/file-upload) · folder = โฟลเดอร์ R2 ถ้ากฎตั้งเป็น R2
 * - ไม่ส่ง category → ทางเดิม /api/admin/upload (R2)
 * - รูป → โชว์ thumbnail · PDF → โชว์ไอคอน 📄 + ปุ่มเปิดดู (ไฟล์ส่วนตัวขอลิงก์ชั่วคราวให้เอง — components/file-ref)
 * - ระหว่างอัป → ของกลาง UploadProgress (ชื่อไฟล์ + แถบ % + ยกเลิก) ทั้งตอนแนบใหม่และตอนกด "เปลี่ยน" (คลุมรูปเดิม)
 * - ★ 2026-11-14 เจ้าของขอ "ลากรูป, PDF มาใส่ได้เลย ไม่ต้องกด Upload":
 *     · ลากไฟล์มาวางที่กล่อง (ของกลาง useFileDrop) · มีไฟล์อยู่แล้ว = วางทับ = เปลี่ยนไฟล์
 *     · Ctrl+V วางรูปจากคลิปบอร์ด — เมาส์อยู่เหนือกล่องนี้ หรือ pasteFromPage (ทั้งหน้า ถ้าไม่ได้ชี้กล่องอื่นอยู่)
 *     · multiple = รับหลายไฟล์ (เลือก/ลาก/วาง) อัปทีละไฟล์ เรียก onChange ทีละไฟล์ (หน้าเว็บเอาไปทำต่อทีละไฟล์ เช่น อ่านบิล)
 * ใช้แนบเอกสาร เช่น ใบรับของ, บิล/ใบเสร็จ, สัญญา ฯลฯ
 */
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useFileUploadAccess } from "@/components/upload-permission";
import { FileUploadError, uploadFileByRule, type FileUploadHandle } from "@/lib/file-upload";
import { useFileRefUrl } from "@/components/file-ref";
import { fileRefName, isPdfRef } from "@/lib/file-ref";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import { useFileDrop } from "@/components/file-drop";

const ACCEPT_INPUT = "image/jpeg,image/png,image/webp,image/gif,application/pdf";
const ACCEPT_DROP = ["image/", "application/pdf"];
const accepted = (f: File) => ACCEPT_DROP.some((p) => (f.type || "").startsWith(p)) || /\.pdf$/i.test(f.name);

// กล่องที่เมาส์ชี้อยู่ (Ctrl+V ไปลงกล่องนั้นก่อน) — หลายกล่องในหน้าเดียวจะได้ไม่อัปซ้ำ
let hoverOwner: symbol | null = null;

export function FileInput({
  value, onChange, folder = "uploads", category, required, disabled, hasError, label, multiple, pasteFromPage, hint,
}: {
  value: string | null;
  onChange: (ref: string | null) => void;
  folder?: string;
  /** หมวดในกฎที่เก็บไฟล์ (/master/storage-rules) — ส่ง = ทำตามกฎ */
  category?: string;
  required?: boolean;
  disabled?: boolean;
  hasError?: boolean;
  label?: string;
  /** รับหลายไฟล์ — อัปทีละไฟล์ แล้วเรียก onChange ทีละไฟล์ตามลำดับ */
  multiple?: boolean;
  /** Ctrl+V วางรูปได้ทั้งหน้า (ไม่ต้องชี้ที่กล่อง) — เปิดเฉพาะกล่องหลักของหน้า */
  pasteFromPage?: boolean;
  /** ข้อความใต้ "ลากไฟล์มาวาง…" ในกล่องว่าง */
  hint?: string;
}) {
  const [up, setUp] = useState<UploadProgressState | null>(null);
  const uploading = up !== null;
  const abortRef = useRef<FileUploadHandle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const meRef = useRef<symbol>(Symbol("file-input"));
  const { uploadDisabled, uploadDeniedMessage } = useFileUploadAccess(disabled);
  const viewUrl = useFileRefUrl(value);

  /** อัป 1 ไฟล์ → ref (ยกเลิก/พลาด = null) */
  const uploadOne = async (file: File, pos?: string): Promise<string | null> => {
    setErr(null); setUp({ name: pos ? `${pos} ${file.name}` : file.name, size: file.size, pct: null });
    try {
      if (category) {
        return await uploadFileByRule({
          category, file, r2Folder: folder,
          onProgress: (pct) => setUp((u) => u && { ...u, pct }),
          onStart: (h) => { abortRef.current = h; },
        });
      }
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", folder);
      const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
      const json = await res.json();
      if (json.error) { setErr(json.error); return null; }
      return json.r2_key as string;
    } catch (e) {
      if (!(e instanceof FileUploadError && e.aborted)) setErr(String((e as Error).message ?? e));
      return null;
    } finally {
      setUp(null); abortRef.current = null;
    }
  };

  const handleFiles = async (list: File[]) => {
    if (uploadDisabled) { setErr(uploadDeniedMessage ?? "ไม่สามารถอัปโหลดไฟล์ได้"); return; }
    const files = list.filter(accepted);
    if (files.length === 0) { setErr("รับเฉพาะรูป (JPG/PNG/WebP) หรือ PDF"); return; }
    const todo = multiple ? files : files.slice(0, 1);
    try {
      for (const [i, f] of todo.entries()) {
        const ref = await uploadOne(f, todo.length > 1 ? `(${i + 1}/${todo.length})` : undefined);
        if (ref) onChange(ref);
      }
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ลากไฟล์มาวาง (ของกลาง) — กำลังอัป = ไม่รับ
  const drop = useFileDrop((files) => { void handleFiles(files); }, {
    accept: ACCEPT_DROP, disabled: uploading || uploadDisabled || !!disabled,
    onReject: () => setErr("รับเฉพาะรูป (JPG/PNG/WebP) หรือ PDF"),
    onBusy: () => setErr(uploading ? "กำลังอัปโหลดไฟล์ก่อนหน้า — รอสักครู่" : uploadDeniedMessage ?? "ช่องนี้ยังแนบไฟล์ไม่ได้"),
  });

  // Ctrl+V วางรูป — กล่องที่เมาส์ชี้ได้ก่อน · ไม่ได้ชี้กล่องไหน = กล่องที่เปิด pasteFromPage
  const handleFilesRef = useRef(handleFiles);
  handleFilesRef.current = handleFiles;
  const blocked = uploading || uploadDisabled || !!disabled;
  useEffect(() => {
    if (blocked) return;
    const me = meRef.current;
    const onPaste = (e: ClipboardEvent) => {
      const mine = hoverOwner === me || (hoverOwner === null && pasteFromPage);
      if (!mine) return;
      const files = Array.from(e.clipboardData?.items ?? []).filter((it) => it.kind === "file").map((it) => it.getAsFile()).filter((f): f is File => !!f && accepted(f));
      if (!files.length) return;   // วางข้อความธรรมดา = ไม่ยุ่ง
      e.preventDefault();
      void handleFilesRef.current(files);
    };
    window.addEventListener("paste", onPaste);
    return () => { window.removeEventListener("paste", onPaste); if (hoverOwner === me) hoverOwner = null; };
  }, [blocked, pasteFromPage]);
  const hoverProps = {
    onPointerEnter: () => { hoverOwner = meRef.current; },
    onPointerLeave: () => { if (hoverOwner === meRef.current) hoverOwner = null; },
  };

  const progress = up && <UploadProgress {...up} onCancel={() => abortRef.current?.abort()} />;
  const pdf = isPdfRef(value);
  const over = drop.over === "f";

  return (
    <div>
      {label && <label className="text-xs font-medium text-slate-600">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
      <div {...drop.zone("f")} {...hoverProps}
        className={`mt-0.5 rounded-md border-2 border-dashed transition-colors ${over ? "border-blue-400 bg-blue-50" : hasError ? "border-red-300" : "border-slate-200 hover:border-orange-300"} ${uploadDisabled ? "opacity-50" : ""}`}>
        {value ? (
          <div className="relative p-2">
            {viewUrl === undefined ? (
              <div className="h-20 flex items-center justify-center text-xs text-slate-400">กำลังโหลดไฟล์…</div>
            ) : viewUrl === null ? (
              <div className="h-20 flex items-center justify-center text-xs text-slate-500">แนบไฟล์แล้ว · เปิดดูไม่ได้ (ไม่มีสิทธิ์ดูไฟล์นี้)</div>
            ) : pdf ? (
              <a href={viewUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-2 py-3 text-sm text-slate-700 hover:text-blue-700">
                <span className="text-2xl">📄</span>
                <span className="flex-1 truncate">{fileRefName(value)}</span>
                <span className="text-xs text-blue-600">เปิดดู →</span>
              </a>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={viewUrl} alt="preview" className="w-full max-h-44 object-contain rounded bg-slate-50" />
            )}
            {progress && <div className="absolute inset-0 z-10 flex items-center px-3 rounded bg-white/90">{progress}</div>}
            {over && !progress && <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-blue-50/90 text-sm font-medium text-blue-700">วางเพื่อเปลี่ยนไฟล์</div>}
            {!disabled && !uploading && (
              <div className="absolute top-1 right-1 flex gap-1">
                <button type="button" onClick={() => { if (!uploadDisabled) fileRef.current?.click(); }} disabled={uploading || uploadDisabled}
                  className="px-2 py-1 text-xs bg-white border border-slate-200 rounded shadow hover:bg-slate-50 disabled:opacity-50">เปลี่ยน</button>
                <button type="button" onClick={() => onChange(null)} disabled={uploading}
                  className="px-2 py-1 text-xs bg-white border border-slate-200 text-red-600 rounded shadow hover:bg-red-50 disabled:opacity-50">✕ ลบ</button>
              </div>
            )}
          </div>
        ) : progress ? (
          <div className="h-20 flex items-center px-3">{progress}</div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadDisabled}
            className={`w-full h-20 flex flex-col items-center justify-center gap-1 ${over ? "text-blue-700" : "text-slate-500 hover:text-orange-600"}`}>
            <span className="text-xl">{over ? "📥" : "📎"}</span>
            <span className="text-xs font-medium">{over ? "ปล่อยเพื่อแนบไฟล์" : `ลากไฟล์มาวาง · Ctrl+V · หรือคลิกเพื่อแนบ${multiple ? " (หลายไฟล์ได้)" : ""}`}</span>
            <span className="text-[10px] text-slate-400">{hint ?? (category ? "รูป (JPG/PNG/WebP) หรือ PDF — เก็บตามกฎที่เก็บไฟล์" : "รูป (JPG/PNG/WebP) หรือ PDF — สูงสุด 10MB")}</span>
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept={ACCEPT_INPUT} multiple={!!multiple}
        disabled={uploadDisabled || uploading} className="hidden"
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void handleFiles(fs); }} />
      {err && <div className="mt-1 text-[11px] text-red-600">⚠ {err}</div>}
      {uploadDeniedMessage && <div className="mt-1 text-[11px] text-amber-700">{uploadDeniedMessage}</div>}
    </div>
  );
}
