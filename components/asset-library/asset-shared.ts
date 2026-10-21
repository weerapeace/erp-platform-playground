// คลังไฟล์: ชนิด/ค่าคงที่/ตัวช่วยที่ใช้ร่วม (ขนาดรูปจาก DPI · อัปรูปขึ้น Drive · กฎ path โฟลเดอร์) — แยกจาก index.tsx (Y1)
import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { type AssetType } from "@/lib/assets";
import { downscaleImageWidth } from "@/lib/image-resize";
import { type AssetSize } from "@/app/api/assets/shared";

export const TYPE_ICON: Record<AssetType, string> = { image: "🖼️", design: "🎨", document: "📄", video: "🎬", other: "📦" };

export type LookupItem = { id: string; name: string };   // ชนิด artwork จาก lookup กลาง (erp_lookups type=artwork_type)

export const isImage = (a: { asset_type: AssetType }) => a.asset_type === "image";

// ── แกะขนาดจริง (cm) จากรูป: px ÷ DPI × 2.54 ──
export const DEFAULT_DPI = 300;   // ค่ามาตรฐานเมื่อรูปไม่ได้ฝัง DPI ไว้ (งานเรา export ขนาดจริง 300 DPI)

// อ่าน DPI ที่ฝังในไฟล์รูป (JPEG JFIF/APP0 · PNG pHYs) — ไม่มี = null
export async function readImageDpi(file: File): Promise<number | null> {
  try {
    const buf = new Uint8Array(await file.slice(0, 65536).arrayBuffer());   // อ่านหัวไฟล์พอ (metadata อยู่ต้นไฟล์)
    // PNG: signature 89 50 4E 47
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
      let p = 8;
      while (p + 12 <= buf.length) {
        const len = (buf[p] << 24) | (buf[p + 1] << 16) | (buf[p + 2] << 8) | buf[p + 3];
        const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
        if (type === "pHYs") {
          const ppuX = (buf[p + 8] << 24) | (buf[p + 9] << 16) | (buf[p + 10] << 8) | buf[p + 11];
          const unit = buf[p + 16];
          return unit === 1 && ppuX > 0 ? Math.round(ppuX * 0.0254) : null;   // per meter → per inch
        }
        if (type === "IDAT" || type === "IEND") break;
        p += 12 + len;
      }
      return null;
    }
    // JPEG: FF D8 → หา APP0 (JFIF) เอา density
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let p = 2;
      while (p + 4 < buf.length) {
        if (buf[p] !== 0xff) { p++; continue; }
        const marker = buf[p + 1];
        if (marker === 0xda) break;   // start of scan → หมด metadata
        const len = (buf[p + 2] << 8) | buf[p + 3];
        if (marker === 0xe0) {   // APP0
          const s = p + 4;
          if (buf[s] === 0x4a && buf[s + 1] === 0x46 && buf[s + 2] === 0x49 && buf[s + 3] === 0x46) {   // "JFIF"
            const units = buf[s + 7];
            const xden = (buf[s + 8] << 8) | buf[s + 9];
            if (units === 1 && xden > 0) return xden;                         // dots/inch
            if (units === 2 && xden > 0) return Math.round(xden * 2.54);      // dots/cm → inch
          }
        }
        p += 2 + len;
      }
      return null;
    }
  } catch { /* ignore */ }
  return null;
}

// ประเมินขนาดจริง (cm) จากรูป — เชื่อ DPI จากรูปเฉพาะที่ดูเป็นงานพิมพ์ (≥150) ไม่งั้นใช้ค่ามาตรฐาน
export async function estimateSizeCm(file: File): Promise<{ w: number; h: number; px: { w: number; h: number }; dpi: number; fromImage: boolean } | null> {
  if (!file.type.startsWith("image/")) return null;
  const dims = await new Promise<{ w: number; h: number } | null>((res) => {
    const img = new Image(); const u = URL.createObjectURL(file);
    img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(u); };
    img.onerror = () => { res(null); URL.revokeObjectURL(u); };
    img.src = u;
  });
  if (!dims || !dims.w || !dims.h) return null;
  const dpiRaw = await readImageDpi(file);
  const fromImage = !!dpiRaw && dpiRaw >= 150;
  const dpi = fromImage ? (dpiRaw as number) : DEFAULT_DPI;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { w: r2(dims.w / dpi * 2.54), h: r2(dims.h / dpi * 2.54), px: dims, dpi, fromImage };
}

// ชื่อโฟลเดอร์ Drive ของรูป = ชั้นสุดท้ายของ master_path (ตามโครง …\<ชื่อโฟลเดอร์>) · ไม่มี = ชื่อรูป
export const driveFolderNameOf = (a: { master_path?: string | null; title?: string | null; file_name?: string }) =>
  (a.master_path || "").split(/[\\/]+/).filter(Boolean).pop() || a.title || a.file_name || "โฟลเดอร์";

// หาคำร่วมนำหน้าของชื่อรูปที่เลือก (เช่น "Cherry Rose Pattern 2/3" → "Cherry Rose Pattern") ใช้เป็นคำค้นเริ่มต้น
export function commonNameSeed(titles: string[]): string {
  const clean = titles.map((t) => (t || "").trim()).filter(Boolean);
  if (!clean.length) return "";
  const wordsOf = (s: string) => s.split(/[\s_]+/).filter(Boolean);
  let common = wordsOf(clean[0]);
  for (const t of clean.slice(1)) {
    const w = wordsOf(t);
    let i = 0;
    while (i < common.length && i < w.length && common[i].toLowerCase() === w[i].toLowerCase()) i++;
    common = common.slice(0, i);
    if (!common.length) break;
  }
  if (!common.length) return wordsOf(clean[0])[0] ?? "";   // ไม่มีคำร่วม → คำแรกของตัวแรก
  while (common.length > 1 && /^\d+$/.test(common[common.length - 1])) common.pop();   // ตัดเลขล้วนท้าย
  return common.join(" ");
}

// ── ของกลาง: อัปไฟล์ต้นฉบับ + ก็อปรูป preview ขึ้น Google Drive (ใช้ทั้งตอนสร้างใหม่ + หน้ารายละเอียด) ──
// สร้างโฟลเดอร์ตามชื่องาน (ใต้แบรนด์/ชนิด) → ตั้งชื่อไฟล์ตามชื่องาน → ก็อปรูปตัวอย่างเข้าโฟลเดอร์ด้วย (เปิดดูลายจาก Drive ได้เลย)
export const DRIVE_MAX_PROXY = 4 * 1024 * 1024;   // ไฟล์ ≤4MB อัปผ่านแอป · ใหญ่กว่า = อัปเอง (ลิมิต body Vercel)

export const drivePreviewExt = (f: File) => f.type === "image/jpeg" ? ".jpg" : f.type === "image/webp" ? ".webp" : (f.name.match(/\.[^.]+$/)?.[0] || ".png");

// รูป preview สำหรับก็อปลง Drive: เต็มขนาดถ้า ≤4MB · เกินก็ย่อลงให้พอดี 4MB (คลัง R2 ยังย่อ 1200 แยกต่างหาก)
export async function previewForDrive(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size <= DRIVE_MAX_PROXY) return file;   // เต็มขนาด
  for (const w of [3000, 2200, 1600]) { const d = await downscaleImageWidth(file, w); if (d.size <= DRIVE_MAX_PROXY) return d; }
  return await downscaleImageWidth(file, 1600);
}

export async function uploadArtworkToDrive(opts: {
  name: string; artworkType?: string; brandId?: string;
  srcFiles: File[]; previewFile?: File | null;
  folderId?: string;   // ส่งมา = อัปเข้าโฟลเดอร์นี้เลย (ไม่สร้างใหม่) — ใช้ตอน "หลายรูป โฟลเดอร์เดียว"
  folderName?: string; // ตั้งชื่อโฟลเดอร์แยกจากชื่อไฟล์ (โหมดโฟลเดอร์รวม — ไฟล์ยังชื่อตามรูปแต่ละใบ)
  subpath?: string;    // path ซ้อนชั้นเอง (เช่น "Printed/DTF" ของงานพิมพ์) แทนการแม็ปตามชนิด
  rootFolderId?: string;   // โฟลเดอร์แม่เฉพาะ (งานพิมพ์ไปโฟลเดอร์เดียวไม่สนแบรนด์)
  flat?: boolean;      // ไม่สร้างโฟลเดอร์ชื่องาน → ไฟล์ลงในซับตรง ๆ (งานพิมพ์)
  onProgress?: (done: number, total: number) => void;
}): Promise<{ folderId: string; folderLink: string; largeCount: number }> {
  const nm = opts.name.trim() || "artwork";
  const folderNm = opts.folderName?.trim() || nm;   // ชื่อโฟลเดอร์ (ตั้งแยกได้) · ไม่ตั้ง = ชื่อไฟล์
  const named = opts.srcFiles.map((f, i) => ({ file: f, filename: `${nm}${i > 0 ? `_${i + 1}` : ""}${f.name.match(/\.[^.]+$/)?.[0] ?? ""}` }));
  const small = named.filter((x) => x.file.size <= DRIVE_MAX_PROXY);
  const large = named.filter((x) => x.file.size > DRIVE_MAX_PROXY);

  let folderId = opts.folderId ?? "", folderLink = "";
  const doUpload = async (x: { file: File; filename: string } | null) => {
    const fd = new FormData();
    fd.append("name", folderNm);
    if (opts.artworkType) fd.append("artworkType", opts.artworkType);
    if (opts.subpath) fd.append("subpath", opts.subpath);
    if (opts.rootFolderId) fd.append("root_folder_id", opts.rootFolderId);
    if (opts.flat) fd.append("flat", "1");
    if (opts.brandId) fd.append("brand_id", opts.brandId);
    if (folderId) fd.append("folderId", folderId);
    if (x) { fd.append("filename", x.filename); fd.append("file", x.file); }
    const res = await apiFetch("/api/drive/upload", { method: "POST", body: fd });
    const j = await res.json(); if (!res.ok || j.error) throw new Error(j.error || "อัป Drive ไม่สำเร็จ");
    folderId = j.folderId; folderLink = j.folderLink;
  };

  opts.onProgress?.(0, small.length);
  for (let i = 0; i < small.length; i++) { await doUpload(small[i]); opts.onProgress?.(i + 1, small.length); }
  if (!folderId && (large.length || opts.previewFile)) await doUpload(null);   // ยังไม่มีโฟลเดอร์ → สร้างก่อน
  // ก็อปรูป preview เข้าโฟลเดอร์เดียวกัน (best-effort — พังไม่ทำให้ทั้งงานพัง · ชื่อ = <ชื่องาน>.png)
  if (opts.previewFile && folderId) {
    try { await doUpload({ file: opts.previewFile, filename: `${nm}${drivePreviewExt(opts.previewFile)}` }); } catch { /* ปล่อยผ่าน */ }
  }
  opts.onProgress?.(0, 0);
  return { folderId, folderLink, largeCount: large.length };
}

// ── รายการ Artwork ในแผ่นงานพิมพ์ + ไซส์ + จำนวน (เลือกหลายรายการผ่าน AssetPicker ของกลาง) ──
//    ไซส์ = "SKU" ของ artwork (1 ลายมีหลายไซส์) → ลายเดียวกันคนละไซส์ = คนละแถวได้ (ปุ่ม ⧉)
export const sizeText = (s: AssetSize | null | undefined) => (s ? `${s.label ? `${s.label} · ` : ""}${s.w ?? "?"}×${s.h ?? "?"} ${s.unit}` : "");

// ── ตัวแก้ "หลายไซส์" (กว้าง×สูง + ชื่อกำกับ + หน่วยต่อไซส์) ──
export const SIZE_UNITS: { v: AssetSize["unit"]; label: string; en: string }[] = [
  { v: "cm", label: "ซม.", en: "cm" }, { v: "mm", label: "มม.", en: "mm" }, { v: "in", label: "นิ้ว", en: "in" }, { v: "px", label: "px", en: "px" },
];

// ── กฎ "โฟลเดอร์มาตรฐาน" (global) — เก็บใน ui_config key=artwork_path_rule ──
export type PathRule = { base_paths: string[] };

export function useArtworkPathRule(): [PathRule, boolean, () => void] {
  const [rule, setRule] = useState<PathRule>({ base_paths: [] });
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(() => {
    apiFetch("/api/ui-config?key=artwork_path_rule").then((r) => r.json())
      .then((j) => { const v = (j.value ?? {}) as { base_paths?: unknown }; setRule({ base_paths: Array.isArray(v.base_paths) ? v.base_paths.map(String) : [] }); })
      .catch(() => {}).finally(() => setLoaded(true));
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return [rule, loaded, reload];
}

export function pathMatchesRule(path: string, basePaths: string[]): boolean {
  if (!path.trim() || basePaths.length === 0) return true;   // ไม่ได้ตั้งกฎ / ยังไม่กรอก = ไม่เตือน
  const norm = (s: string) => s.replace(/\\/g, "/").toLowerCase().trim().replace(/\/+$/, "");
  const p = norm(path);
  return basePaths.some((b) => b.trim() && p.startsWith(norm(b)));
}

// ต่อ path แบบ Windows: base คงรูป (drive letter / UNC) + ต่อชั้นถัด ๆ ด้วย "\" ข้ามชั้นที่ว่าง
export function winJoin(base: string, ...rest: string[]): string {
  const b = base.trim().replace(/[\\/]+$/, "");
  const tail = rest.map((p) => p.trim().replace(/^[\\/]+|[\\/]+$/g, "")).filter(Boolean);
  return [b, ...tail].filter(Boolean).join("\\");
}

// แม็ป แบรนด์ → path ในเครื่อง (ฐาน) + ชนิด → ชื่อซับโฟลเดอร์ (ใช้ auto-fill master_path ให้ตรงโครง Drive)
export function useDriveFolderMaps(): { brandBase: Record<string, string>; typeSub: Record<string, string> } {
  const [brandBase, setBrandBase] = useState<Record<string, string>>({});
  const [typeSub, setTypeSub] = useState<Record<string, string>>({});
  useEffect(() => {
    apiFetch("/api/drive/brand-folders").then((r) => r.json()).then((j) => {
      const m: Record<string, string> = {};
      for (const r of (j.data ?? []) as { brand_id: string; local_base_path?: string | null }[]) if (r.local_base_path) m[r.brand_id] = r.local_base_path;
      setBrandBase(m);
    }).catch(() => {});
    apiFetch("/api/drive/folders").then((r) => r.json()).then((j) => {
      const m: Record<string, string> = {};
      for (const r of (j.data ?? []) as { artwork_type: string; subfolder_name?: string | null }[]) if (r.subfolder_name) m[r.artwork_type] = r.subfolder_name;
      setTypeSub(m);
    }).catch(() => {});
  }, []);
  return { brandBase, typeSub };
}

// สร้าง path โฟลเดอร์ต้นฉบับตามแบรนด์: <ฐานในเครื่อง> \ <ซับตามชนิด> \ <ชื่องาน> (จบที่โฟลเดอร์ — ไม่ใส่นามสกุล)
// ไม่มีฐานของแบรนด์ = คืน "" (ให้ผู้เรียก fallback ไปกฎเดิม)
export function brandFolderPath(name: string, brandId: string, firstType: string | undefined, brandBase: Record<string, string>, typeSub: Record<string, string>): string {
  const nm = name.trim(); if (!nm) return "";
  const base = brandId ? brandBase[brandId] : ""; if (!base) return "";
  const sub = firstType ? (typeSub[firstType] || firstType) : "";
  return winJoin(base, sub, nm);
}
