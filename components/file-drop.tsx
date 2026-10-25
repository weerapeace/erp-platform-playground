"use client";

/**
 * 📥 useFileDrop — ลากไฟล์จากเครื่องมาวางเพื่ออัปโหลด (ของกลาง)
 *
 * ใช้เมื่อ: มีปุ่ม "⬆ อัปโหลด" อยู่แล้ว และอยากให้ลากไฟล์มาวางที่ช่อง/แถวนั้นได้ด้วย
 *   const drop = useFileDrop((files, key) => upload(key, files), { accept: "image/", onReject: () => toast.error("ลากได้เฉพาะรูป") });
 *   <div {...drop.guard}>                       ← กรอบนอก: วางพลาดช่อง = ไม่มีอะไรเกิด (กันเบราว์เซอร์เปิดไฟล์ทับหน้า ของที่ยังไม่บันทึกหาย)
 *     <div {...drop.zone("sku-1")} className={drop.over === "sku-1" ? "ring-2 ring-blue-400" : ""}>…</div>
 *   </div>
 * - สนใจเฉพาะการลาก "ไฟล์จากเครื่อง" — ลากแถว/การ์ด/ข้อความภายในหน้า ไม่โดน
 * - หลายช่องในหน้าเดียวใช้ hook ตัวเดียว · over = key ของช่องที่ลากอยู่เหนือ (ไว้ไฮไลต์)
 * - accept = ขึ้นต้นชนิดไฟล์ (เช่น "image/" หรือ ["image/", "video/"]) · ไม่มีไฟล์ที่รับได้เลย = เรียก onReject
 * - ช่องซ้อนกัน (เช่น ช่อง Hero อยู่ในแถวสีที่ลากวางได้) = ช่องในสุดรับไป ช่องนอกไม่รับซ้ำ (ดู defaultPrevented)
 * - disabled = ไม่รับ (เช่น กำลังอัปโหลดอยู่) — ไม่ไฮไลต์ · วางแล้วเรียก onBusy ถ้ามี (ไว้บอก "รอสักครู่")
 * - folders = ลากทั้งโฟลเดอร์ได้ (ไล่ไฟล์ทุกชั้น) · path "โฟลเดอร์/ชื่อไฟล์" อ่านด้วย filePathOf(file) — ใช้ที่ 📸 ลงรูปเว็บทีละมาก
 * ไม่ทำ: อัปโหลดเอง (ส่งไฟล์ให้ callback ของหน้า — หน้าใช้ uploadResizedImage/ช่องทางเดิมของมัน)
 */
import { useRef, useState, type DragEvent } from "react";
import { typeFromName } from "@/lib/media-upload-limits";

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

// 📁 ลากทั้งโฟลเดอร์ (opts.folders) — เบราว์เซอร์ไม่ใส่ path ให้ไฟล์ที่ได้จากการลากโฟลเดอร์ → จดไว้เอง
const dropPaths = new WeakMap<File, string>();
/** path ของไฟล์ "โฟลเดอร์/…/ชื่อไฟล์" (ลากโฟลเดอร์ หรือ input webkitdirectory) · ไฟล์เดี่ยว = ชื่อไฟล์ */
export const filePathOf = (f: File): string => dropPaths.get(f) || f.webkitRelativePath || f.name;

type FsEntry = { isFile: boolean; isDirectory: boolean; name: string; fullPath: string };
type FsFileEntry = FsEntry & { file: (ok: (f: File) => void, err: (e: unknown) => void) => void };
type FsDirEntry = FsEntry & { createReader: () => { readEntries: (ok: (es: FsEntry[]) => void, err: (e: unknown) => void) => void } };

/** อ่านไฟล์ทั้งหมดใต้รายการที่ลากมา (ไล่โฟลเดอร์ย่อย · readEntries ได้ทีละ ≤100 ต้องวนจนหมด) — ข้ามไฟล์ซ่อน (.DS_Store ฯลฯ) */
async function readEntries(entries: FsEntry[], limit = 2000): Promise<File[]> {
  const out: File[] = [];
  const walk = async (e: FsEntry): Promise<void> => {
    if (out.length >= limit || e.name.startsWith(".")) return;
    if (e.isFile) {
      const f = await new Promise<File | null>((ok) => (e as FsFileEntry).file(ok, () => ok(null)));
      if (f) {
        dropPaths.set(f, e.fullPath.replace(/^\/+/, ""));
        out.push(f);
      }
    } else if (e.isDirectory) {
      const reader = (e as FsDirEntry).createReader();
      for (;;) {
        const batch = await new Promise<FsEntry[]>((ok) => reader.readEntries(ok, () => ok([])));
        if (!batch.length) break;
        for (const c of batch) await walk(c);
      }
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

export function useFileDrop(
  onFiles: (files: File[], key: string) => void,
  /** folders = ลากทั้งโฟลเดอร์ได้ (ไล่ไฟล์ข้างในทุกชั้น · path อ่านด้วย filePathOf) */
  opts: { accept?: string | string[]; disabled?: boolean; onReject?: () => void; onBusy?: () => void; folders?: boolean } = {}
) {
  const [over, setOver] = useState<string | null>(null);
  const overRef = useRef<string | null>(null);
  const setOverKey = (k: string | null) => {
    overRef.current = k;
    setOver(k);
  };

  const accepts = (f: File) => {
    const a = opts.accept;
    if (!a) return true;
    // บางเครื่องไม่บอกชนิดไฟล์ (type ว่าง เช่น MP4) → เดาจากนามสกุล
    const t = f.type && f.type !== "application/octet-stream" ? f.type : typeFromName(f.name);
    return (Array.isArray(a) ? a : [a]).some((p) => t.startsWith(p));
  };

  const zone = (key: string) => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!hasFiles(e)) return;
      // ช่องข้างใน (อีกตัวรับลากวาง) รับไปแล้ว = ช่องนี้ไม่ไฮไลต์/ไม่รับซ้ำ
      if (e.defaultPrevented) {
        if (overRef.current === key) setOverKey(null);
        return;
      }
      e.preventDefault();
      // disabled ยังให้วางได้ (ไม่ไฮไลต์) — วางแล้วบอกเหตุผลผ่าน onBusy ดีกว่าเคอร์เซอร์ห้ามเฉย ๆ
      e.dataTransfer.dropEffect = "copy";
      if (!opts.disabled && overRef.current !== key) setOverKey(key);
    },
    onDragLeave: (e: DragEvent<HTMLElement>) => {
      // ยังอยู่ในช่องเดิม (แค่ผ่านลูกข้างใน) = ไม่นับว่าออก
      const to = e.relatedTarget as Node | null;
      if (to && e.currentTarget.contains(to)) return;
      if (overRef.current === key) setOverKey(null);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (!hasFiles(e)) return;
      if (e.defaultPrevented) {
        if (overRef.current === key) setOverKey(null);
        return;
      }
      e.preventDefault();
      setOverKey(null);
      if (opts.disabled) {
        opts.onBusy?.();
        return;
      }
      // รายการต้องหยิบตอนนี้เลย (หลังจบ event เบราว์เซอร์ล้างทิ้ง) แล้วค่อยไล่อ่านโฟลเดอร์
      const entries = opts.folders
        ? Array.from(e.dataTransfer.items ?? [])
            .map((it) => (it.kind === "file" ? (it.webkitGetAsEntry?.() as FsEntry | null) : null))
            .filter((x): x is FsEntry => !!x)
        : [];
      if (entries.some((x) => x.isDirectory)) {
        void readEntries(entries).then((all) => {
          const files = all.filter(accepts);
          if (files.length) onFiles(files, key);
          else opts.onReject?.();
        });
        return;
      }
      const files = Array.from(e.dataTransfer.files).filter(accepts);
      if (files.length) onFiles(files, key);
      else opts.onReject?.();
    },
  });

  // กรอบนอก — ช่องข้างในรับไปแล้ว (defaultPrevented) = ไม่ยุ่ง · นอกช่อง = บอกเบราว์เซอร์ว่า "วางไม่ได้"
  const guard = {
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "none";
      if (overRef.current) setOverKey(null);
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      setOverKey(null);
    },
  };

  return { over, zone, guard };
}

/** ป้ายลอยกลางช่องตอนลากไฟล์อยู่เหนือ (ใส่ใน element ที่เป็น relative) */
export function FileDropHint({ show, label }: { show: boolean; label: string }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-blue-400 bg-blue-50/80">
      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-blue-700 shadow-sm">📥 {label}</span>
    </div>
  );
}
