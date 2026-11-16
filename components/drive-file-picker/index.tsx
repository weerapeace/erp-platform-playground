"use client";
/**
 * DriveFilePicker — ของกลาง: หน้าต่าง "เลือกไฟล์จากโฟลเดอร์กลางใน Google Drive"
 *   เดินเข้า-ออกโฟลเดอร์ย่อย (breadcrumb) · ค้นชื่อไฟล์ · สลับแบรนด์ · ภาพตัวอย่างที่ Drive ทำไว้ (รูป · PDF · PSD · AI)
 *   ติ๊กได้หลายไฟล์ · กดไอคอนตา = ดูรูปใหญ่ก่อนเลือก
 *   โฟลเดอร์กลาง = <โฟลเดอร์แบรนด์>/ไฟล์กลาง (API /api/drive/browse สร้างให้เองถ้ายังไม่มี + กันเปิดโฟลเดอร์นอกนั้น)
 *
 * ใช้: <DriveFilePicker open brandId={…} onClose={…} onPick={(files, brandId) => …} confirmText="แนบที่เลือก" />
 *   onPick ได้ DriveFile[] + แบรนด์ที่เปิดดูอยู่ (ผู้เรียกเอาไปทำต่อ เช่น สร้างทางลัดในโฟลเดอร์สินค้า)
 * ใช้ที่: กล่องไฟล์แนบสินค้า (ProductDriveFiles) · doc: docs/product-drive-files.md
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { ImageLightbox } from "@/components/image-lightbox";
import { DriveThumb, driveThumbUrl, fmtDriveBytes, type DriveFile } from "@/components/drive-folder-files";
import { apiFetch } from "@/lib/api";

type Entry = DriveFile & { isFolder: boolean };
type Browse = { root: { id: string; name: string }; path: { id: string; name: string }[]; entries: Entry[]; brands: { id: string; name: string }[] };

export function DriveFilePicker({ open, onClose, onPick, brandId: initialBrand, confirmText = "แนบที่เลือก", title = "เลือกไฟล์จากโฟลเดอร์กลาง", busy = false }: {
  open: boolean;
  onClose: () => void;
  onPick: (files: DriveFile[], brandId: string | null) => void | Promise<void>;
  /** แบรนด์ที่เปิดให้ก่อน (ของสินค้า) · null = โฟลเดอร์กลางของบริษัท ("งาน ERP/ไฟล์กลาง") */
  brandId?: string | null;
  confirmText?: string;
  title?: string;
  /** กำลังแนบ (ปุ่มยืนยันหมุน) */
  busy?: boolean;
}) {
  const toast = useToast();
  const [brand, setBrand] = useState<string | null>(initialBrand ?? null);
  const [folder, setFolder] = useState<string>("");
  const [q, setQ] = useState("");
  const [qApplied, setQApplied] = useState("");
  const [data, setData] = useState<Browse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Map<string, DriveFile>>(new Map());
  const [lightbox, setLightbox] = useState(-1);

  useEffect(() => { if (open) { setBrand(initialBrand ?? null); setFolder(""); setQ(""); setQApplied(""); setPicked(new Map()); } }, [open, initialBrand]);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const sp = new URLSearchParams({ brand: brand ?? "", folder, q: qApplied });
      const r = await apiFetch(`/api/drive/browse?${sp}`);
      const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j.data as Browse);
    } catch (e) { setErr((e as Error).message); setData(null); }
    finally { setLoading(false); }
  }, [brand, folder, qApplied]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const folders = useMemo(() => (data?.entries ?? []).filter((e) => e.isFolder), [data]);
  const files = useMemo(() => (data?.entries ?? []).filter((e) => !e.isFolder), [data]);
  const previewable = useMemo(() => files.filter((f) => f.hasThumbnail !== false || f.shortcutTargetId), [files]);

  const toggle = (f: DriveFile) => setPicked((m) => { const n = new Map(m); if (n.has(f.id)) n.delete(f.id); else n.set(f.id, f); return n; });
  const go = (id: string) => { setFolder(id); setQ(""); setQApplied(""); };

  const confirm = async () => {
    if (!picked.size) { toast.info("ติ๊กเลือกไฟล์ก่อน"); return; }
    await onPick([...picked.values()], brand);
  };

  return (
    <ERPModal open={open} onClose={onClose} title={title} size="xl" storageKey="drive-file-picker"
      description="ไฟล์จริงอยู่ที่โฟลเดอร์กลางที่เดียว — แนบแล้วเป็นทางลัด แก้ไฟล์กลางทีเดียว ทุกที่เห็นตัวใหม่"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-xs text-slate-500">เลือกแล้ว {picked.size} ไฟล์</span>
          <button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button type="button" onClick={() => void confirm()} disabled={busy}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700 disabled:opacity-60">{busy ? "กำลังแนบ…" : `${confirmText}${picked.size ? ` (${picked.size})` : ""}`}</button>
        </div>
      }>
      <div className="flex flex-col gap-3">
        {/* แถบบน: แบรนด์ · ค้นหา */}
        <div className="flex flex-wrap items-center gap-2">
          <select value={brand ?? ""} onChange={(e) => { setBrand(e.target.value || null); setFolder(""); }}
            className="h-8 min-w-0 max-w-[12rem] rounded-md border border-slate-200 bg-white px-2 text-sm">
            <option value="">ไฟล์กลางของบริษัท</option>
            {(data?.brands ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <form className="flex min-w-[10rem] flex-1 items-center gap-1" onSubmit={(e) => { e.preventDefault(); setQApplied(q.trim()); }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นชื่อไฟล์ในโฟลเดอร์นี้"
              className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 px-2 text-sm" />
            <button type="submit" className="h-8 rounded-md border border-slate-200 px-2 text-slate-500 hover:bg-slate-50" aria-label="ค้นหา"><Icon name="search" /></button>
          </form>
        </div>

        {/* breadcrumb */}
        <div className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
          {(data?.path ?? []).map((p, i, arr) => (
            <span key={p.id} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-slate-300">›</span>}
              {i < arr.length - 1
                ? <button type="button" onClick={() => go(i === 0 ? "" : p.id)} className="hover:text-indigo-600 hover:underline">{p.name}</button>
                : <span className="font-medium text-slate-700">{p.name}</span>}
            </span>
          ))}
          {qApplied && <span className="ml-1 rounded bg-amber-50 px-1.5 text-amber-700">ค้น "{qApplied}"</span>}
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-slate-400">กำลังเปิดโฟลเดอร์…</p>
        ) : err ? (
          <div className="py-8 text-center text-sm text-amber-700">
            {err}
            <div><button type="button" onClick={() => void load()} className="mt-2 text-xs text-indigo-600 hover:underline">ลองใหม่</button></div>
          </div>
        ) : !folders.length && !files.length ? (
          <p className="py-10 text-center text-sm text-slate-400">
            {qApplied ? "ไม่เจอไฟล์ชื่อนี้ในโฟลเดอร์นี้" : "โฟลเดอร์นี้ยังว่าง — เอาไฟล์กลาง (โลโก้ ป้าย แพ็กเกจ ฯลฯ) ไปใส่ใน Google Drive โฟลเดอร์นี้ได้เลย"}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {folders.map((f) => (
              <button key={f.id} type="button" onClick={() => go(f.id)}
                className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-2 text-center hover:border-indigo-300 hover:bg-indigo-50/40">
                <span className="text-3xl text-amber-500"><Icon name="folder" /></span>
                <span className="w-full truncate text-xs text-slate-700" title={f.name}>{f.name}</span>
              </button>
            ))}
            {files.map((f) => {
              const on = picked.has(f.id);
              const pi = previewable.findIndex((x) => x.id === f.id);
              return (
                <div key={f.id} role="button" tabIndex={0} onClick={() => toggle(f)} onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggle(f); } }}
                  className={`relative min-w-0 cursor-pointer rounded-lg border bg-white p-1.5 ${on ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200 hover:border-indigo-300"}`}>
                  <DriveThumb file={f} fill />
                  <span className={`absolute left-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded border text-[11px] ${on ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white/90"}`}>{on ? "✓" : ""}</span>
                  {pi >= 0 && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setLightbox(pi); }} title="ดูรูปใหญ่" aria-label="ดูรูปใหญ่"
                      className="absolute right-2.5 top-2.5 rounded bg-white/90 px-1 text-slate-500 hover:text-indigo-600"><Icon name="view" /></button>
                  )}
                  <p className="mt-1 truncate text-[11px] text-slate-700" title={f.name}>{f.name}</p>
                  <p className="text-[10px] text-slate-400">{fmtDriveBytes(f.size) || " "}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ImageLightbox images={previewable.map((f) => ({ url: driveThumbUrl(f.id, 1600), label: f.name }))} index={lightbox}
        onClose={() => setLightbox(-1)} onIndex={setLightbox}
        footer={(i) => {
          const f = previewable[i]; if (!f) return null;
          const on = picked.has(f.id);
          return (
            <button type="button" onClick={() => toggle(f)} className={`rounded-md px-3 py-1.5 text-sm ${on ? "bg-white text-indigo-700" : "bg-indigo-600 text-white"}`}>
              {on ? "✓ เลือกแล้ว (กดเพื่อเอาออก)" : "เลือกไฟล์นี้"}
            </button>
          );
        }} />
    </ERPModal>
  );
}
