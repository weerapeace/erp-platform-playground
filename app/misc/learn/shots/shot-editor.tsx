"use client";

/**
 * 🎬 Video Shot — ป๊อปเพิ่ม/แก้ช็อต (ERPModal กลาง · เตือนก่อนปิดถ้ายังไม่บันทึก)
 *   วางลิงก์ → รู้แพลตฟอร์ม + ดึงชื่อคลิป/ภาพปก/เวลาที่ติดมากับลิงก์ให้เอง · ตั้งเริ่ม-จบ แล้วดูตัวอย่างช่วงก่อนบันทึก
 *   ป้าย: ขนาดภาพ · การเคลื่อนกล้อง · แท็ก · ชุดช็อต · โน้ต
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { VideoSegmentPlayer } from "@/components/video-segment";
import { formatTimeText, parseTimeText } from "@/lib/learn";
import { CAMERA_MOVES, parseShotLink, SEGMENT_LABEL, SHOT_PLATFORMS, SHOT_SIZES, type VideoShot, type VideoShotList } from "@/lib/video-shot";
import { fetchShotMeta, type ShotDraft } from "./use-shots";

const inp = "w-full h-9 px-3 text-[13px] border border-slate-200 rounded-lg bg-white";
const lbl = "mb-0.5 block text-[11px] text-slate-500";
const chip = (on: boolean) => `rounded-full border px-2.5 py-1 text-[12px] ${on ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;

function toForm(s: VideoShot | null, initialUrl?: string, listId?: string | null) {
  return {
    url: s?.url ?? initialUrl ?? "", title: s?.title ?? "", start: formatTimeText(s?.start_sec), end: formatTimeText(s?.end_sec),
    shot_size: s?.shot_size ?? "", camera_move: s?.camera_move ?? "", tags: (s?.tags ?? []).join(", "),
    list_id: s ? (s.list_id ?? "") : (listId ?? ""), note: s?.note ?? "", thumb_url: s?.thumb_url ?? "",
  };
}

export function ShotEditor({ shot, lists, initialUrl, defaultListId, onClose, onSave }: {
  shot: VideoShot | null;
  lists: VideoShotList[];
  initialUrl?: string;
  defaultListId?: string | null;
  onClose: () => void;
  onSave: (d: ShotDraft) => Promise<boolean>;
}) {
  const initial = useMemo(() => toForm(shot, initialUrl, defaultListId), [shot, initialUrl, defaultListId]);
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaErr, setMetaErr] = useState<string | null>(null);
  const asked = useRef<string>(shot?.url ?? "");
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const link = parseShotLink(f.url);
  const startSec = parseTimeText(f.start), endSec = parseTimeText(f.end);

  // วางลิงก์ใหม่ → ถามชื่อคลิป/ภาพปก/เวลาเริ่มจากลิงก์ (ไม่ทับช่องที่พิมพ์ไว้แล้ว)
  useEffect(() => {
    const u = f.url.trim();
    if (!u || u === asked.current || !parseShotLink(u)) return;
    const t = setTimeout(async () => {
      asked.current = u;
      setMetaBusy(true); setMetaErr(null);
      const r = await fetchShotMeta(u);
      setMetaBusy(false);
      if (r.error || !r.data) { setMetaErr(r.error ?? "อ่านลิงก์ไม่ได้"); return; }
      const m = r.data;
      setF((x) => ({
        ...x, url: m.url, thumb_url: m.thumb_url ?? "",
        title: x.title.trim() ? x.title : (m.title ?? ""),
        start: x.start.trim() ? x.start : formatTimeText(m.startHint),
      }));
      asked.current = m.url;
    }, 400);
    return () => clearTimeout(t);
  }, [f.url]);

  const save = async () => {
    if (!link) { setErr("วางลิงก์ YouTube / TikTok / Pinterest / Instagram ก่อน"); return; }
    if (f.start.trim() && startSec === null) { setErr("เวลาเริ่มต้องเป็นแบบ 1:20 หรือ 80"); return; }
    if (f.end.trim() && endSec === null) { setErr("เวลาจบต้องเป็นแบบ 1:20 หรือ 80"); return; }
    if (startSec !== null && endSec !== null && endSec <= startSec) { setErr("เวลาจบต้องมากกว่าเวลาเริ่ม"); return; }
    setErr(null); setBusy(true);
    const ok = await onSave({
      url: f.url.trim(), title: f.title.trim(), start_sec: startSec, end_sec: endSec,
      shot_size: f.shot_size || null, camera_move: f.camera_move || null, tags: f.tags,
      list_id: f.list_id || null, note: f.note.trim() || null, thumb_url: f.thumb_url || null,
    });
    setBusy(false);
    if (ok) onClose();
  };

  const meta = link ? SHOT_PLATFORMS[link.platform] : null;

  return (
    <ERPModal open onClose={onClose} size="lg" storageKey="learn-shot-editor" hasUnsavedChanges={dirty && !busy}
      title={shot ? `แก้ช็อต: ${shot.title}` : "เพิ่มช็อต"}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {err && <span className="mr-auto text-[12px] text-rose-600">{err}</span>}
          <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ยกเลิก</button>
          <button type="button" onClick={save} disabled={busy} className="inline-flex h-9 items-center gap-1 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            <Icon name="device-floppy" /> {busy ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      }>
      <div className="space-y-3">
        <div>
          <label className={lbl}>ลิงก์คลิป (copy link จาก YouTube / TikTok / Pinterest / Instagram) *</label>
          <input value={f.url} onChange={(e) => set("url", e.target.value)} placeholder="https://www.youtube.com/watch?v=…" className={inp} autoFocus={!shot} />
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
            {meta && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{meta.label}</span>}
            {meta && <span className={`rounded-full px-2 py-0.5 ${meta.segment === "full" ? "bg-emerald-50 text-emerald-700" : meta.segment === "seek" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800"}`}>{SEGMENT_LABEL[meta.segment]}</span>}
            {metaBusy && <span className="text-slate-400">กำลังอ่านลิงก์…</span>}
            {metaErr && <span className="text-rose-600">{metaErr}</span>}
            {!link && f.url.trim() && !metaBusy && <span className="text-rose-600">ยังไม่รองรับลิงก์นี้</span>}
          </div>
          {meta && <p className="mt-0.5 text-[11px] text-slate-400">{meta.note}</p>}
        </div>

        <div>
          <label className={lbl}>ชื่อช็อต (ว่าง = ใช้ชื่อคลิป)</label>
          <input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="เช่น แพนตามกระเป๋าบนโต๊ะ ไฟข้าง" className={inp} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={lbl}>เริ่มที่ (เช่น 1:02)</label>
            <input value={f.start} onChange={(e) => set("start", e.target.value)} placeholder="0:00" inputMode="numeric" className={inp} />
          </div>
          <div>
            <label className={lbl}>จบที่ (ว่าง = เล่นถึงจบคลิป)</label>
            <input value={f.end} onChange={(e) => set("end", e.target.value)} placeholder="1:08" inputMode="numeric" className={inp} />
          </div>
        </div>

        {link?.id && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-2">
            <p className="mb-1 text-[11px] font-medium text-slate-500">ดูตัวอย่างช่วงที่ตัด</p>
            <VideoSegmentPlayer key={`${f.url}|${startSec}|${endSec}`} url={f.url} start={startSec} end={endSec} thumb={f.thumb_url || null} title={f.title} />
          </div>
        )}

        <div>
          <label className={lbl}>ขนาดภาพ</label>
          <div className="flex flex-wrap gap-1.5">
            {SHOT_SIZES.map((s) => (
              <button key={s.key} type="button" onClick={() => set("shot_size", f.shot_size === s.key ? "" : s.key)} className={chip(f.shot_size === s.key)} title={s.en}>{s.label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className={lbl}>การเคลื่อนกล้อง</label>
          <div className="flex flex-wrap gap-1.5">
            {CAMERA_MOVES.map((s) => (
              <button key={s.key} type="button" onClick={() => set("camera_move", f.camera_move === s.key ? "" : s.key)} className={chip(f.camera_move === s.key)} title={s.en}>{s.label}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className={lbl}>แท็ก (คั่นด้วย ,)</label>
            <input value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="กระเป๋าหนัง, ไฟอุ่น, slow motion" className={inp} />
          </div>
          <div>
            <label className={lbl}>อยู่ในชุดช็อต</label>
            <select value={f.list_id} onChange={(e) => set("list_id", e.target.value)} className={inp}>
              <option value="">— ไม่อยู่ในชุด —</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className={lbl}>โน้ต (ทำไมช็อตนี้ดี · ตั้งกล้องยังไง)</label>
          <textarea value={f.note} onChange={(e) => set("note", e.target.value)} rows={3} placeholder="เช่น ไฟ key ด้านซ้าย 45° ซอฟต์บ็อกซ์ · เลนส์ 50mm · 60fps" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]" />
        </div>
      </div>
    </ERPModal>
  );
}

export function ShotListEditor({ list, onClose, onSave }: {
  list: VideoShotList | null;
  onClose: () => void;
  onSave: (name: string, description: string | null) => Promise<boolean>;
}) {
  const initial = { name: list?.name ?? "", description: list?.description ?? "" };
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = f.name !== initial.name || f.description !== initial.description;
  const save = async () => {
    if (!f.name.trim()) { setErr("ต้องตั้งชื่อชุดช็อต"); return; }
    setErr(null); setBusy(true);
    const ok = await onSave(f.name.trim(), f.description.trim() || null);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <ERPModal open onClose={onClose} size="sm" hasUnsavedChanges={dirty && !busy} title={list ? `แก้ชุดช็อต: ${list.name}` : "สร้างชุดช็อต (Shot list)"}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          {err && <span className="mr-auto text-[12px] text-rose-600">{err}</span>}
          <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ยกเลิก</button>
          <button type="button" onClick={save} disabled={busy} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
        </div>
      }>
      <div className="space-y-3">
        <div>
          <label className={lbl}>ชื่อชุด *</label>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="เช่น ถ่ายกระเป๋าหนังรอบหน้า" className={inp} autoFocus />
        </div>
        <div>
          <label className={lbl}>คำอธิบาย</label>
          <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} placeholder="ใช้ทำอะไร ถ่ายเมื่อไหร่" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]" />
        </div>
      </div>
    </ERPModal>
  );
}
