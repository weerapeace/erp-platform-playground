"use client";
/**
 * 🎨 ป๊อป "ตั้งค่าการ์ด" บนกระดาน (เจ้าของเลือกจาก widget 2026-11-22 · ข้อเสนอ 1-6)
 *   แท็บชนิดการ์ด · แบบสำเร็จรูป + บันทึกแบบของตัวเอง (แก้ชื่อ/ลบได้) · ต่อบรรทัด: โชว์/เรียง/ฟอนต์/ขนาด/สี
 *   จัดชิด · ระยะบรรทัด · จุดนำหน้า · ความกว้าง · สีการ์ด (ตามสถานะ/เรียบ) · ของฉัน หรือ ค่าของกระดานนี้ (ทีม) · ตัวอย่างสด
 * กติกา/ที่เก็บ = ./card-style · ป๊อป = ERPModal กลาง
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useT } from "@/components/i18n";
import { Icon } from "@/components/icon";
import { CARD_COLORS, CARD_FIELDS, CARD_FONTS, CARD_PRESETS, CARD_SIZES, STYLED_TYPES, defaultCardStyle, styledTexts, type CardSize, type CardStyle, type CardStyleMap, type CardValues, type StyledCardType } from "./card-style";

export type SavedCardPreset = { id: string; name: string; type: StyledCardType; style: CardStyle };

const SAMPLE: Record<StyledCardType, CardValues> = {
  content: { title: "LY22 Video", no: "CN-202611-0012 · draft", sched: "🗓 23 พ.ย. 14:00", plat: "Instagram · Facebook", brief: "ถ่ายนางแบบถือ ฉากขาว\nโชว์ซิปด้านใน", ref: "🔗 Ref 2", cap: "ลุคหวานพร้อมออกเดต…" },
  task: { title: "ถ่ายรูป LY22", no: "T-202611-0031", count: "งานย่อย (3)", subs: "☑ เตรียมสินค้า\n☐ ถ่ายรูป\n☐ รีทัช" },
  sku: { code: "LY22-01", name: "กระเป๋าถือ Fleur", color: "ดำ", price: "฿890" },
  parent_sku: { code: "LY22", name: "Louis Montini กระเป๋าถือ LY22" },
  trend: { title: "Coquette pastel", heat: "🔥 hot" },
  design_sheet: { code: "DS-0142", name: "กระเป๋าถือ Fleur v2", brand: "Louis Montini", status: "กำลังออกแบบ" },
};

export function CardStyleModal({ open, onClose, mine, team, canTeam, presets, onSave, onSavePresets }: {
  open: boolean;
  onClose: () => void;
  mine: CardStyleMap;
  team: CardStyleMap;
  /** แก้ค่าของกระดาน (ทีม) ได้ไหม · ไม่มีกระดานให้ผูก = false */
  canTeam: boolean;
  presets: SavedCardPreset[];
  /** scope=mine/team · map = ค่าทั้งก้อนหลังแก้ */
  onSave: (scope: "mine" | "team", map: CardStyleMap) => Promise<void>;
  onSavePresets: (list: SavedCardPreset[]) => Promise<void>;
}) {
  const t = useT();
  const [type, setType] = useState<StyledCardType>("content");
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const [draft, setDraft] = useState<CardStyleMap>({});
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  useEffect(() => { if (open) setDraft(scope === "team" ? { ...team } : { ...mine }); }, [open, scope, mine, team]);
  const style: CardStyle = draft[type] ?? (scope === "mine" ? team[type] : undefined) ?? defaultCardStyle(type);
  const set = (s: CardStyle) => setDraft((d) => ({ ...d, [type]: s }));
  const setField = (i: number, p: Partial<CardStyle["fields"][number]>) => set({ ...style, fields: style.fields.map((f, k) => (k === i ? { ...f, ...p } : f)) });
  const move = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= style.fields.length) return; const fs = [...style.fields]; [fs[i], fs[j]] = [fs[j], fs[i]]; set({ ...style, fields: fs }); };
  const labelOf = (k: string) => { const f = CARD_FIELDS[type].find((x) => x.key === k); return f ? t(f.th, f.en) : k; };
  const preview = useMemo(() => styledTexts(style, SAMPLE[type]), [style, type]);
  const fontCss = (id: number) => CARD_FONTS.find((f) => f.id === id)?.css ?? "Nunito";
  const myPresets = presets.filter((p) => p.type === type);
  const pill = (on: boolean) => `h-7 px-2.5 rounded-full border text-[11px] ${on ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`;

  const save = async () => { setBusy(true); try { await onSave(scope, draft); onClose(); } finally { setBusy(false); } };
  const resetType = () => setDraft((d) => { const n = { ...d }; delete n[type]; return n; });

  return (
    <ERPModal open={open} onClose={busy ? () => {} : onClose} size="xl" storageKey="board-card-style" title={t("ตั้งค่าการ์ด", "Card settings")}
      description={t("เลือกว่าการ์ดแต่ละชนิดโชว์อะไร หน้าตาแบบไหน · กระดานไม่มีตัวหนา/เอียง — ใช้ฟอนต์ “หัวหนา” แทน", "Choose what each card shows and how · no bold/italic on the board — use the “Bold heading” font")}
      footer={<div className="flex flex-wrap items-center gap-2 w-full">
        <button type="button" onClick={resetType} className="h-9 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("รีเซ็ตชนิดนี้", "Reset this type")}</button>
        <span className="flex-1" />
        <button type="button" onClick={onClose} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
        <button type="button" onClick={() => void save()} disabled={busy} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{busy ? t("กำลังบันทึก…", "Saving…") : t("บันทึก + อัปเดตการ์ดบนกระดาน", "Save + update cards")}</button>
      </div>}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-1.5">{STYLED_TYPES.map((x) => <button key={x.type} type="button" onClick={() => setType(x.type)} className={pill(type === x.type)}>{t(x.th, x.en)}{draft[x.type] ? " •" : ""}</button>)}</div>
          {canTeam && (
            <div className="flex items-center gap-3 text-[12px] text-slate-600">
              <label className="flex items-center gap-1"><input type="radio" checked={scope === "mine"} onChange={() => setScope("mine")} /> {t("ของฉัน", "Mine")}</label>
              <label className="flex items-center gap-1"><input type="radio" checked={scope === "team"} onChange={() => setScope("team")} /> {t("ค่าของกระดานนี้ (ทีม)", "This board (team)")}</label>
              <span className="text-[11px] text-slate-400">{scope === "team" ? t("ทุกคนเห็นแบบนี้ เว้นคนที่ตั้งของตัวเอง", "Everyone sees this unless they set their own") : t("เห็นแค่คุณ", "Only you")}</span>
            </div>
          )}
          <div>
            <div className="mb-1 text-[11px] text-slate-500">{t("แบบสำเร็จรูป", "Presets")}</div>
            <div className="flex flex-wrap gap-1.5">
              {CARD_PRESETS.map((p) => <button key={p.key} type="button" onClick={() => set(p.apply(style, type))} className={pill(false)}>{t(p.th, p.en)}</button>)}
              {myPresets.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white pl-2.5 pr-1 h-7 text-[11px] text-violet-800">
                  <button type="button" onClick={() => set(p.style)}>{p.name}</button>
                  <button type="button" onClick={() => setNaming(p.id)} aria-label={t("แก้ชื่อ", "Rename")} className="text-slate-400 hover:text-violet-700"><Icon name="edit" size={12} /></button>
                  <button type="button" onClick={() => void onSavePresets(presets.filter((x) => x.id !== p.id))} aria-label={t("ลบ", "Delete")} className="text-slate-400 hover:text-rose-600"><Icon name="cancel" size={12} /></button>
                </span>
              ))}
              <button type="button" onClick={() => setNaming("new")} className={`${pill(false)} border-dashed`}>+ {t("บันทึกแบบนี้", "Save as preset")}</button>
            </div>
            {naming && (
              <form className="mt-1.5 flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); const name = String(new FormData(e.currentTarget).get("n") ?? "").trim(); if (!name) return;
                const list = naming === "new" ? [...presets, { id: `p${Date.now().toString(36)}`, name, type, style }] : presets.map((x) => (x.id === naming ? { ...x, name } : x));
                void onSavePresets(list); setNaming(null); }}>
                <input name="n" autoFocus defaultValue={naming === "new" ? "" : presets.find((x) => x.id === naming)?.name ?? ""} placeholder={t("ชื่อแบบ เช่น การ์ดประชุม", "Preset name")} className="h-8 flex-1 rounded-md border border-slate-200 px-2 text-[12px]" />
                <button type="submit" className="h-8 px-3 rounded-md bg-violet-600 text-[12px] text-white">{t("บันทึก", "Save")}</button>
                <button type="button" onClick={() => setNaming(null)} className="h-8 px-2 text-[12px] text-slate-500">{t("ยกเลิก", "Cancel")}</button>
              </form>
            )}
          </div>
          <div>
            <div className="mb-1 text-[11px] text-slate-500">{t("บรรทัดบนการ์ด (ติ๊ก = โชว์ · ลูกศร = เรียง · ฟอนต์ · ขนาด · สี)", "Lines (tick = show · arrows = order · font · size · color)")}</div>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {style.fields.map((f, i) => (
                <div key={f.key} className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 text-[12px]">
                  <input type="checkbox" checked={f.on} onChange={(e) => setField(i, { on: e.target.checked })} className="h-3.5 w-3.5 accent-violet-600" />
                  <span className="flex flex-col leading-none text-slate-400">
                    <button type="button" onClick={() => move(i, -1)} aria-label={t("ขึ้น", "Up")} className="hover:text-violet-700">▴</button>
                    <button type="button" onClick={() => move(i, 1)} aria-label={t("ลง", "Down")} className="hover:text-violet-700">▾</button>
                  </span>
                  <span className={`min-w-0 flex-1 truncate ${f.on ? "text-slate-700" : "text-slate-400"}`}>{labelOf(f.key)}</span>
                  <select value={f.font} onChange={(e) => setField(i, { font: Number(e.target.value) })} className="h-7 rounded-md border border-slate-200 bg-white px-1 text-[11px]">
                    {CARD_FONTS.map((x) => <option key={x.id} value={x.id}>{t(x.th, x.en)}</option>)}
                  </select>
                  <select value={f.size} onChange={(e) => setField(i, { size: e.target.value as CardSize })} className="h-7 rounded-md border border-slate-200 bg-white px-1 text-[11px]">
                    {(Object.keys(CARD_SIZES) as CardSize[]).map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <span className="flex gap-0.5">{CARD_COLORS.map((c) => <button key={c} type="button" onClick={() => setField(i, { color: c })} aria-label={c} className={`h-4 w-4 rounded-full border ${f.color === c ? "ring-2 ring-violet-400 ring-offset-1" : "border-slate-200"}`} style={{ backgroundColor: c }} />)}</span>
                  {f.maxLines != null && <label className="flex items-center gap-1 text-[11px] text-slate-500">{t("สูงสุด", "max")}<input type="number" min={1} max={20} value={f.maxLines} onChange={(e) => setField(i, { maxLines: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} className="h-7 w-12 rounded-md border border-slate-200 px-1" />{t("บรรทัด", "lines")}</label>}
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
            <span className="text-[11px] text-slate-500">{t("จัดชิด", "Align")}</span>
            {(["left", "center", "right"] as const).map((a) => <button key={a} type="button" onClick={() => set({ ...style, align: a })} className={pill(style.align === a)}><Icon value={`i:align-${a}`} /></button>)}
            <span className="ml-2 text-[11px] text-slate-500">{t("ระยะบรรทัด", "Spacing")}</span>
            <input type="range" min={0} max={16} step={1} value={style.gap} onChange={(e) => set({ ...style, gap: Number(e.target.value) })} className="w-24" /><span>{style.gap}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
            <span className="text-[11px] text-slate-500">{t("นำหน้าบรรทัด", "Bullets")}</span>
            <button type="button" onClick={() => set({ ...style, lead: "none" })} className={pill(style.lead === "none")}>{t("ไม่มี", "None")}</button>
            <button type="button" onClick={() => set({ ...style, lead: "dot" })} className={pill(style.lead === "dot")}>{t("จุด •", "Dot •")}</button>
            <span className="ml-2 text-[11px] text-slate-500">{t("ความกว้าง", "Width")}</span>
            <input type="range" min={180} max={400} step={10} value={style.width} onChange={(e) => set({ ...style, width: Number(e.target.value) })} className="w-24" /><span>{style.width}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-[11px] text-slate-500">{t("สีการ์ด", "Card color")}</span>
            <button type="button" onClick={() => set({ ...style, bg: "status" })} className={pill(style.bg === "status")}>{t("ตามสถานะ (สีเดิม)", "By status (default)")}</button>
            <button type="button" onClick={() => set({ ...style, bg: "plain" })} className={pill(style.bg === "plain")}>{t("ขาวเรียบ", "Plain white")}</button>
          </div>
        </div>
        {/* ตัวอย่างการ์ด (ฟอนต์ชื่อเดียวกับกระดาน → ฟอนต์ไทยตัวเดียวกัน) */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-[11px] text-slate-500">{t("ตัวอย่างการ์ด", "Preview")}</div>
          <div style={{ width: Math.min(style.width, 340), textAlign: style.align }}
            className={`rounded-xl border-2 p-3 ${style.bg === "plain" ? "border-slate-300 bg-white" : "border-amber-400 bg-amber-50"}`}>
            {preview.map((p, i) => <div key={p.key} style={{ fontFamily: `"${fontCss(p.fontFamily)}", sans-serif`, fontSize: p.fontSize, color: p.strokeColor, marginTop: i ? style.gap : 0, whiteSpace: "pre-line", lineHeight: 1.3 }}>{p.text}</div>)}
          </div>
        </div>
      </div>
    </ERPModal>
  );
}
