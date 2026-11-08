"use client";

// ============================================================
// FileTypeIcon — ไอคอนประเภทไฟล์กลาง (JPG · CR2 · PSD · AI · PDF ...) + ป๊อปเลือกประเภทไฟล์
//
// ใช้:      <FileTypeIcon ext="psd" size={32} />   หรือ  <FileTypeIcon ext="รูป.CR2" />  (ใส่ชื่อไฟล์ก็ได้)
// ป๊อป:     <FileTypePickerModal open onClose={...} initial={{ exts: ["jpg"], label: "รูปสินค้า" }} onDone={(exts, label) => ...} />
// ใช้เมื่อ:  ต้องการบอก "ไฟล์ชนิดไหน" ด้วยภาพ (กล่องไฟล์ในกระดาน flowchart · รายการไฟล์แนบ · คลังไฟล์)
// ห้ามใช้:   ไอคอนเมนู/ปุ่มทั่วไป → ใช้ <Icon> กลาง · รูปตัวอย่างของไฟล์จริง → ใช้ภาพ thumbnail
// รายชื่อนามสกุล/สี/กลุ่ม + ตัววาด SVG: lib/file-types.ts (ที่เดียว — บนจอกับรูปที่บันทึกหน้าตาเหมือนกัน)
// doc: docs/file-type-icon.md
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { ERPInput } from "@/components/form";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import {
  FILE_GROUP_META, FILE_TYPES, FILE_TYPE_GROUPS, cleanExtList, fileTypeOf, fileTypeSvg, normalizeExt, suggestFileLabel,
} from "@/lib/file-types";

export function FileTypeIcon({ ext, size = 32, title, className = "" }: { ext: string; size?: number; title?: string; className?: string }) {
  const t = useT();
  const svg = useMemo(() => fileTypeSvg(ext, size), [ext, size]);
  const d = fileTypeOf(ext);
  return (
    <span className={`inline-block shrink-0 leading-[0] ${className}`} style={{ width: size, height: Math.round(size * 1.2) }}
      title={title ?? `${(d.ext || "?").toUpperCase()} · ${t(d.th, d.en)}`}
      // SVG สร้างจากค่าคงที่ของเราเอง + นามสกุลที่กรองเหลือ a-z0-9 แล้ว (lib/file-types normalizeExt)
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

const MAX_PICK = 12;

/** ป๊อปเลือกประเภทไฟล์ (เลือกได้หลายชนิด · ค้นหาได้ · พิมพ์นามสกุลที่ไม่มีในรายการเองได้) */
export function FileTypePickerModal({ open, onClose, onDone, initial, confirmText }: {
  open: boolean;
  onClose: () => void;
  onDone: (exts: string[], label: string) => void;
  initial?: { exts?: string[]; label?: string };
  confirmText?: string;
}) {
  const t = useT();
  const [sel, setSel] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [custom, setCustom] = useState("");
  const [label, setLabel] = useState("");
  const [labelTouched, setLabelTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSel(cleanExtList(initial?.exts ?? [], MAX_PICK));
    setQ(""); setCustom("");
    setLabel(initial?.label ?? "");
    setLabelTouched(!!initial?.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const autoLabel = suggestFileLabel(sel, t);
  const finalLabel = labelTouched ? label : autoLabel;
  const toggle = (ext: string) => setSel((s) => (s.includes(ext) ? s.filter((x) => x !== ext) : s.length >= MAX_PICK ? s : [...s, ext]));
  const addCustom = () => {
    const e = normalizeExt(custom);
    if (!e) return;
    setSel((s) => (s.includes(e) || s.length >= MAX_PICK ? s : [...s, e]));
    setCustom("");
  };

  const qq = q.trim().toLowerCase().replace(/^\./, "");
  const shown = FILE_TYPES.filter((d) => !qq || d.ext.includes(qq) || d.th.toLowerCase().includes(qq) || d.en.toLowerCase().includes(qq)
    || FILE_GROUP_META[d.group].th.includes(qq) || FILE_GROUP_META[d.group].en.toLowerCase().includes(qq));

  return (
    <ERPModal open={open} onClose={onClose} title={t("เลือกประเภทไฟล์", "Choose file types")} size="lg"
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-slate-500">{t(`เลือกแล้ว ${sel.length} ชนิด (สูงสุด ${MAX_PICK})`, `${sel.length} selected (max ${MAX_PICK})`)}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-700">{t("ยกเลิก", "Cancel")}</button>
            <button type="button" disabled={!sel.length} onClick={() => onDone(sel, finalLabel.trim() || autoLabel)}
              className="h-9 rounded-lg bg-violet-600 px-4 text-sm text-white hover:bg-violet-700 disabled:opacity-50">
              {confirmText ?? t("วางลงกระดาน", "Place on board")}
            </button>
          </div>
        </div>
      }>
      <div className="space-y-3">
        {/* ที่เลือกไว้ (เรียงตามลำดับที่กด · กด x เอาออก) */}
        <div className="flex min-h-[56px] flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
          {sel.length === 0 && <span className="px-1 text-[12px] text-slate-400">{t("ยังไม่ได้เลือก — กดไอคอนด้านล่าง (เลือกได้หลายชนิด)", "Nothing yet — tap icons below (pick several)")}</span>}
          {sel.map((e) => (
            <button key={e} type="button" onClick={() => toggle(e)} title={t("กดเพื่อเอาออก", "Click to remove")}
              className="group relative flex items-center gap-1 rounded-md border border-slate-200 bg-white py-0.5 pl-1 pr-1.5 hover:border-rose-300">
              <FileTypeIcon ext={e} size={22} />
              <span className="text-[11px] font-semibold text-slate-700">{e.toUpperCase()}</span>
              <span className="text-slate-400 group-hover:text-rose-500"><Icon value="i:x" /></span>
            </button>
          ))}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12px] text-slate-500">{t("ชื่อกล่อง", "Box name")}</span>
            <ERPInput value={finalLabel} onChange={(e) => { setLabel(e.target.value); setLabelTouched(true); }}
              placeholder={t("เช่น รูปจากกล้อง · ไฟล์งานออกแบบ", "e.g. Camera photos · Design files")} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-slate-500">{t("นามสกุลที่ไม่มีในรายการ", "Other extension")}</span>
            <div className="flex gap-1.5">
              <ERPInput value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
                placeholder={t("เช่น heif · ai · .sew", "e.g. heif · .sew")} />
              <button type="button" onClick={addCustom} disabled={!normalizeExt(custom)}
                className="h-9 shrink-0 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">{t("เพิ่ม", "Add")}</button>
            </div>
          </label>
        </div>

        <ERPInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นหา เช่น psd · กล้อง · วิดีโอ · ปัก", "Search e.g. psd · camera · video")} leftIcon={<Icon value="i:search" />} />

        <div className="max-h-[46vh] space-y-3 overflow-y-auto pr-1">
          {FILE_TYPE_GROUPS.filter((g) => g !== "other").map((g) => {
            const items = shown.filter((d) => d.group === g);
            if (!items.length) return null;
            const meta = FILE_GROUP_META[g];
            const allOn = items.every((d) => sel.includes(d.ext));
            return (
              <section key={g}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                  <span className="text-[12px] font-semibold text-slate-700">{t(meta.th, meta.en)}</span>
                  <button type="button" className="text-[11px] text-violet-600 hover:underline"
                    onClick={() => setSel((s) => allOn ? s.filter((x) => !items.some((d) => d.ext === x)) : [...s, ...items.map((d) => d.ext).filter((x) => !s.includes(x))].slice(0, MAX_PICK))}>
                    {allOn ? t("เอาออกทั้งกลุ่ม", "Clear group") : t("เลือกทั้งกลุ่ม", "Select group")}
                  </button>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-1.5">
                  {items.map((d) => {
                    const on = sel.includes(d.ext);
                    return (
                      <button key={d.ext} type="button" onClick={() => toggle(d.ext)} title={t(d.th, d.en)}
                        className={`relative flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-center transition ${on ? "border-violet-500 bg-violet-50 ring-1 ring-violet-300" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}>
                        {on && <span className="absolute right-1 top-1 text-[11px] text-violet-600"><Icon value="i:check" /></span>}
                        <FileTypeIcon ext={d.ext} size={30} title="" />
                        <span className="text-[11px] font-semibold text-slate-700">{d.ext.toUpperCase()}</span>
                        <span className="line-clamp-2 text-[10px] leading-tight text-slate-500">{t(d.th, d.en)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {!shown.length && <p className="py-4 text-center text-[12px] text-slate-400">{t("ไม่พบ — พิมพ์นามสกุลในช่อง \"นามสกุลที่ไม่มีในรายการ\" ได้", "Not found — type it in \"Other extension\"")}</p>}
        </div>
      </div>
    </ERPModal>
  );
}
