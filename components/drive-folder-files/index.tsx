"use client";
/**
 * DriveFolderFiles — ของกลาง: โชว์ว่า "ในโฟลเดอร์ Drive นี้มีไฟล์อะไรบ้าง" + ปุ่มเปิดไฟล์ใน Google Drive
 *   ส่ง folder = ลิงก์โฟลเดอร์ (หรือ folder id) เข้ามา → โหลดอัตโนมัติแบบไม่บล็อก (ป๊อปอัปเปิดทันที รายการค่อยขึ้น)
 *   ใช้ซ้ำได้ทุกที่ที่มีโฟลเดอร์ Drive (คลัง Artwork / ใบงานออกแบบ / งาน Creative / ไฟล์แนบสินค้า)
 *
 * เสริม (ไม่บังคับ — ไม่ส่ง = หน้าตาเดิมทุกอย่าง):
 *   files      = ส่งรายการมาเอง (ไม่โหลดจาก folder) — เช่น API ของโมดูลอ่านโฟลเดอร์ให้แล้ว
 *   thumbs     = โชว์ภาพตัวอย่างที่ Drive ทำไว้ (รูป · PDF · PSD · AI) แทนไอคอน · ไม่มีภาพ = ไอคอนชนิดไฟล์ (FileTypeIcon)
 *   badge(f)   = ป้ายท้ายชื่อไฟล์ (เช่น "ลิงก์จากโฟลเดอร์กลาง")
 *   onPreview  = กดภาพตัวอย่างแล้วทำอะไร (เช่น เปิดรูปใหญ่)
 *   onRemove   = มีปุ่มเอาออกต่อไฟล์ (ผู้เรียกถามยืนยัน + ลบเอง)
 * ส่งออกเพิ่ม: DriveThumb (ภาพตัวอย่าง 1 ไฟล์) · driveThumbUrl(id, w) — ใช้ในหน้าต่างเลือกไฟล์ DriveFilePicker
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { FileTypeIcon } from "@/components/file-type-icon";
import { Icon } from "@/components/icon";

export type DriveFile = {
  id: string; name: string; mimeType: string; size?: number; webViewLink?: string; modifiedTime?: string;
  /** Drive ทำภาพตัวอย่างให้ไหม (ส่งมาเมื่อรู้ · ไม่รู้ = ลองโหลดดู) */
  hasThumbnail?: boolean;
  /** ทางลัด → ไฟล์จริงตัวไหน */
  shortcutTargetId?: string;
};

/** ลิงก์ภาพตัวอย่างไฟล์ใน Drive (ภาพที่ Drive ทำไว้ ไม่โหลดไฟล์ทั้งก้อน) */
export const driveThumbUrl = (fileId: string, w = 200) => `/api/drive/thumb?id=${encodeURIComponent(fileId)}&t=1&w=${w}`;

export const fmtDriveBytes = (n?: number) => {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

// ไอคอนตามชนิดไฟล์ (ดูออกไวว่าเป็นไฟล์งานหรือรูป) — หน้าตาเดิมของรายการแบบย่อ
const iconOf = (f: DriveFile): string => {
  const ct = (f.mimeType ?? "").toLowerCase();
  const ext = (f.name.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase();
  if (ext === "ai" || ext === "eps") return "🎨";
  if (ext === "psd" || ext === "psb") return "🖌";
  if (ct.includes("pdf") || ext === "pdf") return "📕";
  if (ct.startsWith("image/")) return "🖼";
  if (ct.startsWith("video/")) return "🎬";
  if (["zip", "rar", "7z"].includes(ext)) return "🗜";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv"].includes(ext)) return "📝";
  return "📎";
};

/** ภาพตัวอย่าง 1 ไฟล์: ภาพจาก Drive → ไม่มีภาพ/โหลดไม่ได้ = ไอคอนชนิดไฟล์ */
export function DriveThumb({ file, size = 44, fill = false, onClick }: { file: DriveFile; size?: number; fill?: boolean; onClick?: () => void }) {
  const [failed, setFailed] = useState(file.hasThumbnail === false && !file.shortcutTargetId);
  const box = fill ? { width: "100%", aspectRatio: "1 / 1" } : { width: size, height: size };
  if (failed) {
    return (
      <span style={box} className="shrink-0 flex items-center justify-center rounded-md bg-slate-50">
        <FileTypeIcon ext={file.name} size={fill ? 40 : Math.round(size * 0.8)} />
      </span>
    );
  }
  return (
    <span role={onClick ? "button" : undefined} onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined} style={box}
      className={`shrink-0 block overflow-hidden rounded-md border border-slate-200 bg-slate-50 ${onClick ? "cursor-zoom-in hover:border-indigo-300" : ""}`}
      title={onClick ? "ดูรูปใหญ่" : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={driveThumbUrl(file.id, fill ? 320 : size * 3)} alt="" loading="lazy" className="h-full w-full object-contain" onError={() => setFailed(true)} />
    </span>
  );
}

export function DriveFolderFiles({ folder, title = "ไฟล์ในโฟลเดอร์", reloadKey, files: given, loading: givenLoading, thumbs = false, badge, onPreview, onRemove, emptyText }: {
  /** ลิงก์โฟลเดอร์ Drive หรือ folder id — ว่าง = ไม่โชว์อะไร (ยกเว้นส่ง files มาเอง) */
  folder?: string | null;
  title?: string;
  /** เปลี่ยนค่านี้ = สั่งโหลดใหม่ (เช่น หลังลากไฟล์ขึ้น Drive เสร็จ) */
  reloadKey?: number | string;
  files?: DriveFile[];
  loading?: boolean;
  thumbs?: boolean;
  badge?: (f: DriveFile) => ReactNode;
  onPreview?: (f: DriveFile) => void;
  onRemove?: (f: DriveFile) => void;
  emptyText?: string;
}) {
  const external = given !== undefined;
  const [loaded, setLoaded] = useState<DriveFile[]>([]);
  const [loadingSelf, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (external) return;
    const f = (folder ?? "").trim();
    if (!f) { setLoaded([]); return; }
    setLoading(true); setErr(null);
    try {
      const j = await apiFetch(`/api/drive/folder-files?folder=${encodeURIComponent(f)}`).then((r) => r.json());
      if (j.error) setErr(String(j.error));
      setLoaded((j.files ?? []) as DriveFile[]);
    } catch { setErr("อ่านรายการไฟล์ไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [folder, external]);

  useEffect(() => { void load(); }, [load, reloadKey]);

  const files = external ? (given ?? []) : loaded;
  const loading = external ? !!givenLoading : loadingSelf;
  if (!external && !(folder ?? "").trim()) return null;

  return (
    <div className={thumbs ? "" : "mt-2"}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-medium text-slate-500">
          {thumbs ? <Icon name="folder" /> : "📂"} {title} {!loading && files.length > 0 && <span className="text-slate-400 font-normal">({files.length})</span>}
        </p>
        {!external && (
          <button type="button" onClick={() => void load()} disabled={loading}
            className="text-[10px] text-slate-400 hover:text-indigo-600 disabled:opacity-50" title="โหลดรายการใหม่">🔄 รีเฟรช</button>
        )}
      </div>

      {loading ? (
        <p className="text-[11px] text-slate-400 py-1.5">กำลังอ่านรายการไฟล์…</p>
      ) : err ? (
        <p className="text-[11px] text-amber-600 py-1.5">อ่านไม่ได้: {err}</p>
      ) : files.length === 0 ? (
        <p className="text-[11px] text-slate-400 py-1.5">{emptyText ?? "โฟลเดอร์นี้ยังไม่มีไฟล์"}</p>
      ) : thumbs ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
              <DriveThumb file={f} onClick={onPreview ? () => onPreview(f) : undefined} />
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-slate-700 truncate" title={f.name}>{f.name}</p>
                <div className="flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
                  {fmtDriveBytes(f.size) && <span>{fmtDriveBytes(f.size)}</span>}
                  {badge?.(f)}
                </div>
              </div>
              {f.webViewLink && (
                <a href={f.webViewLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                  className="shrink-0 text-[11px] text-emerald-600 hover:underline" title="เปิดไฟล์นี้ใน Google Drive">เปิด ↗</a>
              )}
              {onRemove && (
                <button type="button" onClick={() => onRemove(f)} className="shrink-0 p-1 text-slate-400 hover:text-red-500" title="เอาออก" aria-label="เอาออก">
                  <Icon name="delete" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1">
              <span className="text-sm shrink-0">{iconOf(f)}</span>
              <span className="flex-1 min-w-0 text-[11px] text-slate-700 truncate" title={f.name}>{f.name}</span>
              <span className="text-[10px] text-slate-400 shrink-0">{fmtDriveBytes(f.size)}</span>
              {f.webViewLink && (
                <a href={f.webViewLink} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                  className="text-[10px] text-emerald-600 hover:underline shrink-0" title="เปิดไฟล์นี้ใน Google Drive">↗ เปิด</a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
