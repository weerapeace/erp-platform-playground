"use client";

/**
 * FileMultiInput — อัปโหลดไฟล์แนบหลายไฟล์ (ของกลาง) รองรับรูปภาพ + PDF
 * ค่า value = array ของ "ที่อยู่ไฟล์กลาง" (ref · lib/file-ref): R2 key เดิม หรือ "sb:erp-files/…" (Supabase ส่วนตัว)
 * - ส่ง category (หมวดในกฎที่เก็บไฟล์ เช่น "china_pay") → ระบบเลือกที่เก็บตามกฎ (lib/file-upload) · folder = โฟลเดอร์ R2 ถ้ากฎตั้งเป็น R2
 * - ไม่ส่ง category → ทางเดิม /api/admin/upload (R2 + ลงคลังไฟล์กลาง)
 * - รูป → โชว์ thumbnail · PDF → โชว์ไอคอน 📄 (ไฟล์ส่วนตัวขอลิงก์ชั่วคราวให้เอง — components/file-ref)
 * - กดเพิ่มได้หลายไฟล์ (เลือกทีละ/หลายไฟล์พร้อมกัน), ลบทีละไฟล์
 * - ★ 2026-11-16 เจ้าของขอ "ตรงแนบสลิปใช้ของกลาง (ลากได้)" — ทำแบบเดียวกับ FileInput:
 *     · ลากไฟล์มาวางทั้งกล่อง (ของกลาง useFileDrop) · Ctrl+V วางรูป (เมาส์ชี้กล่องนี้ หรือ pasteFromPage = ทั้งหน้า)
 *     · ระหว่างอัป → ของกลาง UploadProgress (ชื่อไฟล์ + แถบ % + "(2/3)" + ยกเลิก)
 * ใช้แนบเอกสาร เช่น ใบรับของ, บิล/ใบเสร็จ, สลิป WeChat, สัญญา ฯลฯ
 * ตัวเลือกเสริม (ไม่ใส่ = พฤติกรรมเดิม):
 * - removable={false} → ซ่อนปุ่ม ✕ (เพิ่มได้อย่างเดียว เช่น หน้าดูรายละเอียดที่บันทึกทันทีเมื่อแนบ — กันลบพลาด)
 * - onPreview={(key, url) => …} → กดรูปแล้วเรียกฟังก์ชันนี้ (เช่น เปิด lightbox ของหน้า) แทนเปิดแท็บใหม่ · url = ลิงก์เปิดดูที่ได้แล้ว
 * - pasteFromPage → Ctrl+V ได้ทั้งหน้าโดยไม่ต้องชี้กล่อง (เปิดเฉพาะกล่องหลักของหน้า)
 */
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useFileUploadAccess } from "@/components/upload-permission";
import { FileUploadError, uploadFileByRule, type FileUploadHandle } from "@/lib/file-upload";
import { useFileRefResolver } from "@/components/file-ref";
import { fileRefName, isPdfRef } from "@/lib/file-ref";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import { useFileDrop } from "@/components/file-drop";
import { filePasteOwner } from "@/components/file-input";

const ACCEPT_DROP = ["image/", "application/pdf"];
const accepted = (f: File) => ACCEPT_DROP.some((p) => (f.type || "").startsWith(p)) || /\.pdf$/i.test(f.name);

export function FileMultiInput({
  value, onChange, folder = "uploads", category, disabled, label, max = 20, removable = true, onPreview, pasteFromPage,
}: {
  value: string[];
  onChange: (keys: string[]) => void;
  folder?: string;
  /** หมวดในกฎที่เก็บไฟล์ (/master/storage-rules) — ส่ง = ทำตามกฎ */
  category?: string;
  disabled?: boolean;
  label?: string;
  max?: number;
  removable?: boolean;
  onPreview?: (key: string, url: string | undefined) => void;
  /** Ctrl+V วางรูปได้ทั้งหน้า (ไม่ต้องชี้ที่กล่อง) — เปิดเฉพาะกล่องหลักของหน้า */
  pasteFromPage?: boolean;
}) {
  const [up, setUp] = useState<UploadProgressState | null>(null);
  const uploading = up !== null;
  const abortRef = useRef<FileUploadHandle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const meRef = useRef<symbol>(Symbol("file-multi-input"));
  const keys = Array.isArray(value) ? value : [];
  const { uploadDisabled, uploadDeniedMessage } = useFileUploadAccess(disabled);
  const urlOf = useFileRefResolver();

  const uploadOne = async (file: File, pos?: string): Promise<string | null> => {
    setUp({ name: pos ? `${pos} ${file.name}` : file.name, size: file.size, pct: null });
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
      return json.r2_key ? String(json.r2_key) : null;
    } finally {
      abortRef.current = null;
    }
  };

  const handleFiles = async (list: File[]) => {
    if (uploadDisabled) { setErr(uploadDeniedMessage ?? "ไม่สามารถอัปโหลดไฟล์ได้"); return; }
    const files = list.filter(accepted);
    if (files.length === 0) { setErr("รับเฉพาะรูป (JPG/PNG/WebP) หรือ PDF"); return; }
    setErr(null);
    const added: string[] = [];
    const room = Math.max(0, max - keys.length);
    const todo = files.slice(0, room);
    if (files.length > room) setErr(`แนบได้สูงสุด ${max} ไฟล์`);
    try {
      for (const [i, file] of todo.entries()) {
        try {
          const ref = await uploadOne(file, todo.length > 1 ? `(${i + 1}/${todo.length})` : undefined);
          if (ref) added.push(ref);
        } catch (e) {
          if (e instanceof FileUploadError && e.aborted) break;   // กดยกเลิก = หยุดไฟล์ที่เหลือด้วย (ไม่ใช่ error)
          setErr(String((e as Error).message ?? e));
        }
      }
      if (added.length) onChange([...keys, ...added]);
    } finally {
      setUp(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const blocked = uploading || uploadDisabled || !!disabled || keys.length >= max;

  // ลากไฟล์มาวาง (ของกลาง) — กำลังอัป = ไม่รับ
  const drop = useFileDrop((files) => { void handleFiles(files); }, {
    accept: ACCEPT_DROP, disabled: blocked, paste: false,   // มีตัววางคลิปบอร์ดของตัวเอง (filePasteOwner) แล้ว
    onReject: () => setErr("รับเฉพาะรูป (JPG/PNG/WebP) หรือ PDF"),
    onBusy: () => setErr(uploading ? "กำลังอัปโหลดไฟล์ก่อนหน้า — รอสักครู่" : keys.length >= max ? `แนบได้สูงสุด ${max} ไฟล์` : uploadDeniedMessage ?? "ช่องนี้ยังแนบไฟล์ไม่ได้"),
  });

  // Ctrl+V วางรูป — กล่องที่เมาส์ชี้ได้ก่อน · ไม่ได้ชี้กล่องไหน = กล่องที่เปิด pasteFromPage (ใช้ตัวจดร่วมกับ FileInput)
  const handleFilesRef = useRef(handleFiles);
  handleFilesRef.current = handleFiles;
  useEffect(() => {
    if (blocked) return;
    const me = meRef.current;
    const onPaste = (e: ClipboardEvent) => {
      const mine = filePasteOwner.cur === me || (filePasteOwner.cur === null && pasteFromPage);
      if (!mine) return;
      const files = Array.from(e.clipboardData?.items ?? []).filter((it) => it.kind === "file").map((it) => it.getAsFile()).filter((f): f is File => !!f && accepted(f));
      if (!files.length) return;   // วางข้อความธรรมดา = ไม่ยุ่ง
      e.preventDefault();
      void handleFilesRef.current(files);
    };
    window.addEventListener("paste", onPaste);
    return () => { window.removeEventListener("paste", onPaste); if (filePasteOwner.cur === me) filePasteOwner.cur = null; };
  }, [blocked, pasteFromPage]);

  const removeAt = (i: number) => onChange(keys.filter((_, idx) => idx !== i));
  const over = drop.over === "m";

  return (
    <div>
      {label && <label className="text-xs font-medium text-slate-600">{label}</label>}
      <div {...drop.zone("m")}
        onPointerEnter={() => { filePasteOwner.cur = meRef.current; }}
        onPointerLeave={() => { if (filePasteOwner.cur === meRef.current) filePasteOwner.cur = null; }}
        className={`mt-0.5 rounded-lg transition-colors ${over ? "ring-2 ring-blue-400 bg-blue-50" : ""}`}>
        <div className="grid grid-cols-3 gap-2">
          {keys.map((k, i) => {
            const url = urlOf(k);
            return (
              <div key={k + i} className="relative rounded-md border border-slate-200 overflow-hidden bg-slate-50">
                {isPdfRef(k) ? (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="flex flex-col items-center justify-center h-24 text-slate-600 hover:text-blue-700">
                    <span className="text-3xl">📄</span>
                    <span className="text-[10px] truncate w-full px-1 text-center">{fileRefName(k)}</span>
                  </a>
                ) : !url ? (
                  <div className="h-24 flex items-center justify-center text-[10px] text-slate-400">กำลังโหลด…</div>
                ) : onPreview ? (
                  <button type="button" onClick={() => onPreview(k, url)} className="block w-full">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img loading="lazy" src={url} alt="" className="w-full h-24 object-cover" />
                  </button>
                ) : (
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-24 object-cover" />
                  </a>
                )}
                {!disabled && removable && !uploading && (
                  <button type="button" onClick={() => removeAt(i)}
                    className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center bg-white/90 border border-slate-200 text-red-600 rounded-full shadow text-xs">✕</button>
                )}
              </div>
            );
          })}
          {!disabled && keys.length < max && !uploading && (
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadDisabled}
              className={`h-24 flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-2 text-center disabled:opacity-50 ${over ? "border-blue-400 text-blue-700" : "border-slate-200 text-slate-500 hover:border-orange-300 hover:text-orange-600"} ${keys.length === 0 ? "col-span-3" : ""}`}>
              <span className="text-xl">{over ? "📥" : "📎"}</span>
              <span className="text-[11px] font-medium leading-tight">
                {over ? "ปล่อยเพื่อแนบไฟล์" : keys.length === 0 ? "ลากไฟล์มาวาง · Ctrl+V · หรือคลิกเพื่อแนบ" : "เพิ่มไฟล์ (ลากมาวางได้)"}
              </span>
            </button>
          )}
        </div>
        {up && <div className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2"><UploadProgress {...up} onCancel={() => abortRef.current?.abort()} /></div>}
      </div>
      <div className="mt-1 text-[10px] text-slate-400">{category ? "รูป (JPG/PNG/WebP) หรือ PDF — เก็บตามกฎที่เก็บไฟล์ · แนบได้หลายไฟล์" : "รูป (JPG/PNG/WebP) หรือ PDF — สูงสุด 10MB/ไฟล์ · แนบได้หลายไฟล์"}</div>
      <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
        disabled={uploadDisabled || uploading} className="hidden"
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void handleFiles(fs); }} />
      {err && <div className="mt-1 text-[11px] text-red-600">⚠ {err}</div>}
      {uploadDeniedMessage && <div className="mt-1 text-[11px] text-amber-700">{uploadDeniedMessage}</div>}
    </div>
  );
}
