"use client";

/**
 * 📚 Design Library — มุมเพิ่มของสูตร (รอบ 8 · เจ้าของเลือก 2026-11-15 "ปักจุดได้หลายมุม")
 * แท็บ: รูปหลัก (แม่แบบ) + มุมเพิ่ม (spec.views สูงสุด MAX_VIEWS) · จุด/ส่วนเสริมที่ปักในมุมไหน อยู่มุมนั้น (pin.view / pos.view)
 * เพิ่มมุม: เลือกรูปจาก รูปอ้างอิง / รูป GPT ของชุดสีที่ดู / อัปใหม่ (ลากวาง · Ctrl+V) + ตั้งชื่อมุม (ด้านหลัง / ด้านข้าง / ด้านใน …)
 * ใบสรุป + ใบสั่งทำตัวอย่าง วาดภาพเส้นชี้ของแต่ละมุมต่อท้าย (viewsCalloutHtml) · เลขจุดเท่าเดิมทั้งสูตร
 */
import { useState, type ClipboardEvent as RClipboardEvent } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { useFileDrop } from "@/components/file-drop";
import { uploadImagesWithDupCheck } from "@/components/duplicate-upload";
import { MAX_VIEWS, VIEW_LABELS, type ViewImage } from "@/lib/design-library";
import { img, loadSize } from "./shared";

export type ViewSource = { key: string; label: string; w: number | null; h: number | null };

export function ViewTabs({ views, active, counts, readOnly, sources, onActive, onAdd, onRemove }: {
  views: ViewImage[]; active: string; counts: Record<string, number>; readOnly: boolean;
  /** รูปที่เลือกเป็นมุมใหม่ได้ (รูปอ้างอิง + รูป GPT) */
  sources: ViewSource[];
  onActive: (id: string) => void; onAdd: (v: Omit<ViewImage, "id">) => void; onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState<ViewImage | null>(null);
  const tab = (id: string, label: string, n: number) => (
    <button key={id || "_main"} type="button" onClick={() => onActive(id)} aria-pressed={active === id}
      className={`h-8 px-3 text-[12.5px] rounded-full border inline-flex items-center gap-1 whitespace-nowrap ${active === id ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
      {label}{n > 0 && <span className={`text-[10.5px] px-1 rounded-full ${active === id ? "bg-indigo-100" : "bg-slate-100 text-slate-500"}`}>{n}</span>}
    </button>
  );
  if (!views.length && readOnly) return null;
  return (
    <div className="flex items-center gap-1 overflow-x-auto max-w-full">
      {tab("", "รูปหลัก", counts[""] ?? 0)}
      {views.map((v) => (
        <span key={v.id} className="relative inline-flex">
          {tab(v.id, v.label, counts[v.id] ?? 0)}
          {!readOnly && active === v.id && <button type="button" onClick={() => setDel(v)} title="ลบมุมนี้" aria-label={`ลบมุม ${v.label}`}
            className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-white border border-slate-300 text-rose-600 text-[9px] inline-flex items-center justify-center"><Icon value="i:x" /></button>}
        </span>
      ))}
      {!readOnly && views.length < MAX_VIEWS && (
        <button type="button" onClick={() => setAdding(true)} title="เพิ่มมุม (หลัง / ข้าง / ด้านใน) ให้ปักจุดได้หลายมุม"
          className="h-8 px-2.5 text-[12px] rounded-full border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50 inline-flex items-center gap-1 whitespace-nowrap"><Icon value="i:plus" />มุม</button>
      )}
      {adding && <ViewAddModal sources={sources} used={views.map((v) => v.label)} onClose={() => setAdding(false)} onAdd={(v) => { onAdd(v); setAdding(false); }} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={() => { if (del) onRemove(del.id); setDel(null); }} variant="danger" confirmText="ลบมุม"
        title={`ลบมุม “${del?.label ?? ""}”?`}
        message={del && (counts[del.id] ?? 0) > 0 ? `จุด ${counts[del.id]} จุดที่ปักบนมุมนี้จะถูกลบด้วย (ส่วนเสริมที่ปักไว้จะหลุดจากรูป) — กด Ctrl+Z ย้อนได้ก่อนบันทึก` : "มุมนี้ยังไม่มีจุด — ลบได้เลย"} />
    </div>
  );
}

function ViewAddModal({ sources, used, onClose, onAdd }: { sources: ViewSource[]; used: string[]; onClose: () => void; onAdd: (v: Omit<ViewImage, "id">) => void }) {
  const toast = useToast();
  const [pick, setPick] = useState<ViewSource | null>(null);
  const [label, setLabel] = useState(VIEW_LABELS.find((l) => !used.includes(l)) ?? "");
  const [uploaded, setUploaded] = useState<ViewSource[]>([]);
  const [busy, setBusy] = useState(false);
  const upload = async (files: File[]) => {
    const f = files.find((x) => x.type.startsWith("image/"));
    if (!f) return;
    setBusy(true);
    try {
      const up = await uploadImagesWithDupCheck([f], { folder: "design-library/views", max: 2400, onError: (_, e) => toast.error(e.message) });
      const key = up?.keys[0];
      if (!key) return;
      const d = await loadSize(img(key, 1400));
      const s = { key, label: "อัปใหม่", w: d.w, h: d.h };
      setUploaded((p) => [s, ...p]); setPick(s);
    } catch { toast.error("อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่"); }
    finally { setBusy(false); }
  };
  const drop = useFileDrop((files) => void upload(files), { accept: "image/", disabled: busy, onReject: () => toast.error("วางได้เฉพาะไฟล์รูป") });
  const onPaste = (e: RClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault(); void upload(files);
  };
  const add = async () => {
    if (!pick) { toast.error("เลือกรูปของมุมนี้ก่อน"); return; }
    if (!label.trim()) { toast.error("ตั้งชื่อมุมก่อน เช่น ด้านหลัง"); return; }
    const d = pick.w && pick.h ? { w: pick.w, h: pick.h } : await loadSize(img(pick.key, 1400));
    onAdd({ label: label.trim().slice(0, 40), image_key: pick.key, w: d.w, h: d.h });
  };
  const all = [...uploaded, ...sources];
  return (
    <ERPModal open onClose={onClose} title="เพิ่มมุม" size="lg" storageKey="design-library-view-add"
      description="เลือกรูปของมุมนี้ แล้วปักจุดบนรูปนั้นได้เลย — จุดในใบสรุปขึ้นแยกเป็นภาพของแต่ละมุม"
      footer={<div className="flex items-center gap-2">
        <button type="button" onClick={onClose} className="ml-auto h-9 px-4 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">ยกเลิก</button>
        <button type="button" disabled={!pick || busy} onClick={() => void add()} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">เพิ่มมุมนี้</button>
      </div>}>
      <div className="space-y-3" {...drop.guard}>
        <div>
          <div className="text-[12px] text-slate-500 mb-1">ชื่อมุม</div>
          <div className="flex flex-wrap gap-1 mb-1.5">
            {VIEW_LABELS.map((l) => (
              <button key={l} type="button" onClick={() => setLabel(l)} aria-pressed={label === l}
                className={`h-7 px-2.5 text-[12px] rounded-full border ${label === l ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
            ))}
          </div>
          <input value={label} onChange={(e) => setLabel(e.target.value.slice(0, 40))} placeholder="หรือพิมพ์เอง" className="w-full h-9 px-3 border border-slate-200 rounded-lg text-sm" />
        </div>
        <div>
          <div className="text-[12px] text-slate-500 mb-1">รูปของมุมนี้ — จากรูปอ้างอิง / รูป GPT หรืออัปใหม่</div>
          <div className="grid gap-2 grid-cols-3 sm:grid-cols-5">
            <label {...drop.zone("view")} onPaste={onPaste} tabIndex={0}
              className={`aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 text-[11px] text-center cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${drop.over === "view" ? "border-indigo-400 bg-indigo-50" : "border-slate-300 text-slate-500 hover:bg-slate-50"}`}>
              <Icon value={busy ? "i:hourglass" : "i:upload"} />{busy ? "กำลังอัป…" : <>อัปใหม่<br />ลากวาง / Ctrl+V</>}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { void upload(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
            </label>
            {all.map((s, i) => (
              <button key={`${s.key}-${i}`} type="button" onClick={() => setPick(s)} aria-pressed={pick?.key === s.key}
                className={`relative aspect-square rounded-lg border overflow-hidden bg-slate-50 ${pick?.key === s.key ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200 hover:border-slate-400"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img(s.key, 300)} alt="" className="w-full h-full object-contain" loading="lazy" />
                <span className="absolute bottom-0 inset-x-0 bg-black/45 text-white text-[10px] leading-4 truncate px-1">{s.label}</span>
              </button>
            ))}
          </div>
          {!sources.length && !uploaded.length && <p className="text-[11.5px] text-slate-400 mt-1">ยังไม่มีรูปอ้างอิง/รูป GPT ในสูตร — อัปรูปมุมนั้นใหม่ได้เลย</p>}
        </div>
      </div>
    </ERPModal>
  );
}
