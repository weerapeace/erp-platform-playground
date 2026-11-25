"use client";
/**
 * คำค้น (keyword) ของหน้า SAMPLE Images — เจ้าของเลือกแบบ C + ข้อ 2, 3, 4 (2026-11-25)
 *
 * - KeywordChips      → แถวชิปคำค้น (กดชิป = ค้นด้วยคำนั้น · กากบาท = ลบ) + ช่องเพิ่มคำ พร้อมคำที่เคยใช้ในแบรนด์ให้กด
 *                       ใช้กับ: คำค้นของอัลบั้ม (หัวอัลบั้ม) · ป๊อปคำค้นของรูป
 * - PhotoKeywordsDialog → ป๊อปเพิ่ม/ลบคำค้นให้ "รูปที่เลือก" ทีเดียว (ERPModal กลาง)
 *
 * ค้นทะเบียนของกลางแล้ว (2026-11-25): TagColumns/TagGroupFilter = แท็กสินค้าจากตารางแท็ก (เลือกจากชุดที่มี) ไม่ใช่คำพิมพ์อิสระ → ใช้ไม่ได้
 * ใช้เฉพาะหน้านี้ 2 จุด จึงอยู่ในโมดูล ไม่ลงทะเบียนของกลาง
 * ตรรกะ (ทำความสะอาด/เพิ่มลบ/คำแนะนำ) = lib/sample-images (เทสต์)
 */
import { useMemo, useState } from "react";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { cleanKeywords, keywordSuggestions } from "@/lib/sample-images";

export function KeywordChips({ value, onChange, onPick, canEdit, pool, busy, compact, placeholder }: {
  value: string[];
  /** บันทึกชุดใหม่ (ไม่ส่ง = ดูอย่างเดียว) */
  onChange?: (next: string[]) => void;
  /** กดชิป = ค้นด้วยคำนั้น (ข้อเสนอ 3) */
  onPick?: (k: string) => void;
  canEdit: boolean;
  /** รายการคำค้นที่เคยใช้ (อัลบั้ม/รูปในแบรนด์เดียวกัน) — เด้งให้กดตอนพิมพ์ (ข้อเสนอ 2) */
  pool: readonly (readonly string[] | undefined)[];
  busy?: boolean;
  compact?: boolean;
  placeholder?: string;
}) {
  const t = useT();
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const sugg = useMemo(() => (open ? keywordSuggestions(pool, typed, value) : []), [open, pool, typed, value]);
  const add = (raw: string) => {
    const next = cleanKeywords([...value, ...cleanKeywords(raw)]);
    setTyped("");
    if (onChange && next.length !== value.length) onChange(next);
  };
  const editable = canEdit && !!onChange;
  if (!editable && !value.length) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? "" : "text-[12px]"}`}>
      {!compact && <span className="inline-flex items-center gap-1 text-[12px] text-slate-500"><Icon value="i:tag" />{t("คำค้น", "Keywords")}</span>}
      {value.map((k) => (
        <span key={k} className="inline-flex h-7 max-w-[14rem] items-center gap-0.5 rounded-full bg-sky-50 pl-2.5 pr-1 text-[12px] text-sky-800 ring-1 ring-sky-100">
          <button type="button" onClick={() => onPick?.(k)} disabled={!onPick} title={onPick ? t(`ค้นด้วย "${k}"`, `Search "${k}"`) : undefined} className="truncate hover:underline disabled:no-underline">{k}</button>
          {editable && (
            <button type="button" disabled={busy} onClick={() => onChange!(value.filter((x) => x !== k))} title={t("ลบคำนี้", "Remove")} aria-label={t(`ลบ ${k}`, `Remove ${k}`)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-sky-500 hover:bg-sky-100 hover:text-rose-600 disabled:opacity-50"><Icon value="i:x" /></button>
          )}
        </span>
      ))}
      {editable && (
        <span className="relative">
          <input value={typed} disabled={busy}
            onChange={(e) => { setTyped(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === ",") && typed.trim()) { e.preventDefault(); add(typed); }
              else if (e.key === "Backspace" && !typed && value.length) onChange!(value.slice(0, -1));
              else if (e.key === "Escape") { setTyped(""); setOpen(false); }
            }}
            placeholder={placeholder ?? t("＋ เพิ่มคำค้น (Enter)", "＋ Add keyword (Enter)")}
            className="h-7 w-44 rounded-full border border-dashed border-slate-300 bg-white px-3 text-[12px] text-slate-700 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none" />
          {sugg.length > 0 && (
            <span className="absolute left-0 top-8 z-30 flex w-56 flex-col rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              <span className="px-2.5 pb-0.5 text-[11px] text-slate-400">{t("คำที่เคยใช้", "Used before")}</span>
              {sugg.map((k) => (
                <button key={k} type="button" onMouseDown={(e) => { e.preventDefault(); add(k); }} className="truncate px-2.5 py-1 text-left text-[12px] text-slate-700 hover:bg-sky-50">{k}</button>
              ))}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/** ป๊อปคำค้นของรูปที่เลือก: ชิป = คำที่มีในรูปที่เลือก (บอกว่ามีกี่รูป) · ลบ = ลบจากทุกรูปที่เลือก · เพิ่ม = เพิ่มให้ทุกรูปที่เลือก */
export function PhotoKeywordsDialog({ open, onClose, photos, pool, busy, onSave }: {
  open: boolean; onClose: () => void;
  photos: { id: string; keywords?: string[] }[];
  pool: readonly (readonly string[] | undefined)[];
  busy?: boolean;
  onSave: (edit: { add: string[]; remove: string[] }) => void;
}) {
  const t = useT();
  const counts = useMemo(() => {
    const m = new Map<string, { k: string; n: number }>();
    for (const p of photos) for (const k of p.keywords ?? []) { const key = k.toLowerCase(); const c = m.get(key); if (c) c.n++; else m.set(key, { k, n: 1 }); }
    return [...m.values()].sort((a, b) => b.n - a.n || a.k.localeCompare(b.k, "th"));
  }, [photos]);
  const [add, setAdd] = useState<string[]>([]);
  const [remove, setRemove] = useState<string[]>([]);
  const dirty = add.length > 0 || remove.length > 0;
  const close = () => { setAdd([]); setRemove([]); onClose(); };
  return (
    <ERPModal open={open} onClose={close} size="md" defaultExpanded={false} hasUnsavedChanges={dirty} storageKey="sample-photo-keywords"
      title={t(`คำค้นของ ${photos.length} รูปที่เลือก`, `Keywords of ${photos.length} selected photo(s)`)}
      description={t("เพิ่มคำ = ใส่ให้ทุกรูปที่เลือก · กดกากบาท = ลบคำนั้นจากทุกรูปที่เลือก · บันทึกแล้วกดย้อนกลับได้", "Add = all selected · × = remove from all selected · undo available")}
      footer={<div className="flex justify-end gap-2">
        <button type="button" onClick={close} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-700 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" disabled={!dirty || busy} onClick={() => { onSave({ add, remove }); setAdd([]); setRemove([]); }} className="h-9 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">{t("บันทึก", "Save")}</button>
      </div>}>
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-slate-600">{t("คำที่มีอยู่ในรูปที่เลือก", "Keywords already on these photos")}</div>
          {counts.length === 0 ? <p className="text-[12px] text-slate-400">{t("ยังไม่มีคำค้น", "No keywords yet")}</p> : (
            <div className="flex flex-wrap gap-1.5">
              {counts.map(({ k, n }) => {
                const off = remove.some((x) => x.toLowerCase() === k.toLowerCase());
                return (
                  <button key={k} type="button" onClick={() => setRemove((r) => (off ? r.filter((x) => x.toLowerCase() !== k.toLowerCase()) : [...r, k]))}
                    title={off ? t("กดอีกครั้ง = ไม่ลบ", "Click again to keep") : t("กด = ลบคำนี้จากทุกรูปที่เลือก", "Click to remove from all selected")}
                    className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12px] ring-1 ${off ? "bg-rose-50 text-rose-700 line-through ring-rose-200" : "bg-sky-50 text-sky-800 ring-sky-100"}`}>
                    {k}<span className="text-[11px] opacity-70">{n === photos.length ? t("ทุกรูป", "all") : `${n}/${photos.length}`}</span><Icon value={off ? "i:arrow-back-up" : "i:x"} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <div className="mb-1.5 text-[12px] font-medium text-slate-600">{t("เพิ่มคำให้ทุกรูปที่เลือก", "Add to all selected")}</div>
          <KeywordChips compact canEdit value={add} onChange={setAdd} pool={pool} placeholder={t("พิมพ์คำแล้วกด Enter", "Type and press Enter")} />
        </div>
      </div>
    </ERPModal>
  );
}
