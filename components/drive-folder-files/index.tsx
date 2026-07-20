"use client";
/**
 * DriveFolderFiles — ของกลาง: โชว์ว่า "ในโฟลเดอร์ Drive นี้มีไฟล์อะไรบ้าง" + ปุ่มเปิดไฟล์ใน Google Drive
 *   ส่ง folder = ลิงก์โฟลเดอร์ (หรือ folder id) เข้ามา → โหลดอัตโนมัติแบบไม่บล็อก (ป๊อปอัปเปิดทันที รายการค่อยขึ้น)
 *   ใช้ซ้ำได้ทุกที่ที่มีโฟลเดอร์ Drive (คลัง Artwork / ใบงานออกแบบ / งาน Creative)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export type DriveFile = { id: string; name: string; mimeType: string; size?: number; webViewLink?: string; modifiedTime?: string };

const fmtBytes = (n?: number) => {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

// ไอคอนตามชนิดไฟล์ (ดูออกไวว่าเป็นไฟล์งานหรือรูป)
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

export function DriveFolderFiles({ folder, title = "ไฟล์ในโฟลเดอร์", reloadKey }: {
  /** ลิงก์โฟลเดอร์ Drive หรือ folder id — ว่าง = ไม่โชว์อะไร */
  folder?: string | null;
  title?: string;
  /** เปลี่ยนค่านี้ = สั่งโหลดใหม่ (เช่น หลังลากไฟล์ขึ้น Drive เสร็จ) */
  reloadKey?: number | string;
}) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const f = (folder ?? "").trim();
    if (!f) { setFiles([]); return; }
    setLoading(true); setErr(null);
    try {
      const j = await apiFetch(`/api/drive/folder-files?folder=${encodeURIComponent(f)}`).then((r) => r.json());
      if (j.error) setErr(String(j.error));
      setFiles((j.files ?? []) as DriveFile[]);
    } catch { setErr("อ่านรายการไฟล์ไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [folder]);

  useEffect(() => { void load(); }, [load, reloadKey]);

  if (!(folder ?? "").trim()) return null;

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] font-medium text-slate-500">
          📂 {title} {!loading && files.length > 0 && <span className="text-slate-400 font-normal">({files.length})</span>}
        </p>
        <button type="button" onClick={() => void load()} disabled={loading}
          className="text-[10px] text-slate-400 hover:text-indigo-600 disabled:opacity-50" title="โหลดรายการใหม่">🔄 รีเฟรช</button>
      </div>

      {loading ? (
        <p className="text-[11px] text-slate-400 py-1.5">กำลังอ่านรายการไฟล์…</p>
      ) : err ? (
        <p className="text-[11px] text-amber-600 py-1.5">อ่านไม่ได้: {err}</p>
      ) : files.length === 0 ? (
        <p className="text-[11px] text-slate-400 py-1.5">โฟลเดอร์นี้ยังไม่มีไฟล์</p>
      ) : (
        <div className="space-y-1">
          {files.map((f) => (
            <div key={f.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1">
              <span className="text-sm shrink-0">{iconOf(f)}</span>
              <span className="flex-1 min-w-0 text-[11px] text-slate-700 truncate" title={f.name}>{f.name}</span>
              <span className="text-[10px] text-slate-400 shrink-0">{fmtBytes(f.size)}</span>
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
