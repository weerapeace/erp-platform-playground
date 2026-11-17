"use client";

/**
 * 🎞 คลิปแพ็คที่เก็บในเครื่องนี้ (ช่วงทดลอง) — ค้น / เปิดดู / ดาวน์โหลด / ลบ
 * ดาวน์โหลด = ไฟล์ไว้อัปขึ้นหน้าข้อพิพาทของร้านค้า · เชื่อม NAS แล้วหน้านี้จะกลายเป็นหน้าค้นหลักฐานกลาง
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { clipFileName, deleteClip, getClip, listClips, storageInfo, type LocalClipInfo } from "./clip-store";

const mb = (n: number): string => `${(n / 1048576).toFixed(n > 10485760 ? 0 : 1)} MB`;
const when = (iso: string): string => new Date(iso).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function LocalClipsPanel({ keepDays }: { keepDays: number }) {
  const toast = useToast();
  const [clips, setClips] = useState<LocalClipInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [space, setSpace] = useState<{ used: number; quota: number } | null>(null);
  const [view, setView] = useState<{ info: LocalClipInfo; video: string; snap: string | null } | null>(null);
  const [del, setDel] = useState<LocalClipInfo | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try { setClips(await listClips()); setSpace(await storageInfo()); }
    catch (e) { setError((e as Error).message || "เปิดที่เก็บคลิปไม่สำเร็จ"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (clips ?? []).filter((c) => !s || `${c.order_no ?? ""} ${c.tracking_no ?? ""} ${c.packer ?? ""}`.toLowerCase().includes(s));
  }, [clips, q]);

  const open = async (c: LocalClipInfo) => {
    const full = await getClip(c.id).catch(() => undefined);
    if (!full) { toast.error("ไม่พบคลิปนี้ในเครื่องแล้ว"); return; }
    setView({ info: c, video: URL.createObjectURL(full.video), snap: full.snapshot ? URL.createObjectURL(full.snapshot) : null });
  };
  const closeView = () => {
    if (view) { URL.revokeObjectURL(view.video); if (view.snap) URL.revokeObjectURL(view.snap); }
    setView(null);
  };
  const save = async (c: LocalClipInfo) => {
    const full = await getClip(c.id).catch(() => undefined);
    if (!full) { toast.error("ไม่พบคลิปนี้ในเครื่องแล้ว"); return; }
    download(full.video, clipFileName(c));
  };

  if (error) return <ErrorState title="เปิดคลิปในเครื่องไม่ได้" hint={error} onRetry={() => void load()} />;
  if (!clips) return <LoadingState label="กำลังโหลดคลิปในเครื่อง…" />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นเลขออเดอร์ / เลขพัสดุ / คนแพ็ค" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <span className="text-xs text-slate-500">
          {clips.length} คลิป · {mb(clips.reduce((s, c) => s + c.size, 0))}{space ? ` · ที่ว่างเครื่องนี้ ${mb(Math.max(0, space.quota - space.used))}` : ""} · เก็บ {keepDays} วัน
        </span>
      </div>
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
        ช่วงทดลอง: คลิปอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น — ล้างประวัติเบราว์เซอร์ = คลิปหาย · ออเดอร์ที่มีเคลมให้กด "ดาวน์โหลด" เก็บไว้
      </p>
      {shown.length === 0 ? (
        <EmptyState icon="🎞️" title={clips.length ? "ไม่พบคลิปตามคำค้น" : "ยังไม่มีคลิปในเครื่องนี้"} hint={clips.length ? "ลองเปลี่ยนคำค้น" : "แพ็คออเดอร์ที่แท็บสถานีแพ็ค คลิปจะมาอยู่ที่นี่"} />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {shown.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{c.order_no ?? "-"} {c.status === "problem" && <span className="ml-1 rounded bg-red-100 px-1.5 text-xs text-red-700">มีปัญหา</span>}</p>
                <p className="truncate text-xs text-slate-500">{when(c.created_at)} · {c.packer ?? "-"}{c.station ? ` · ${c.station}` : ""} · {Math.round(c.duration_sec)} วิ · {mb(c.size)}</p>
              </div>
              <button type="button" onClick={() => void open(c)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"><Icon name="play" /> ดู</button>
              <button type="button" onClick={() => void save(c)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"><Icon name="download" /> ดาวน์โหลด</button>
              <button type="button" onClick={() => setDel(c)} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600"><Icon name="delete" /> ลบ</button>
            </li>
          ))}
        </ul>
      )}

      <ERPModal open={!!view} onClose={closeView} title={`คลิปแพ็ค ${view?.info.order_no ?? ""}`} description={view ? `${when(view.info.created_at)} · ${view.info.packer ?? ""}` : undefined} size="lg"
        footer={view ? <button type="button" onClick={() => void save(view.info)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">ดาวน์โหลด</button> : null}>
        {view && (
          <div className="grid gap-3">
            <video src={view.video} controls autoPlay playsInline className="w-full rounded-lg bg-black" />
            {view.snap && (<div><p className="mb-1 text-xs text-slate-500">ภาพนิ่งก่อนปิดกล่อง</p><img src={view.snap} alt="ภาพนิ่งก่อนปิดกล่อง" className="w-full max-w-md rounded-lg" /></div>)}
            {view.info.sha256 && <p className="break-all text-[11px] text-slate-400">ลายนิ้วมือไฟล์ (SHA-256): {view.info.sha256}</p>}
          </div>
        )}
      </ERPModal>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} variant="danger" title="ลบคลิปนี้?" confirmText="ลบคลิป"
        message={`คลิปออเดอร์ ${del?.order_no ?? ""} จะหายจากเครื่องนี้ถาวร (บันทึกการแพ็คในระบบยังอยู่)`}
        onConfirm={async () => { if (del) { await deleteClip(del.id).catch(() => {}); setDel(null); void load(); toast.success("ลบคลิปแล้ว"); } }} />
    </div>
  );
}
