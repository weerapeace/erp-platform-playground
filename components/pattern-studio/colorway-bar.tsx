"use client";
/**
 * 🎨 ColorwayBar — ชุดสีของแพทเทิร์น (Bag CAD รอบ G2 · ส่วนของสตูดิโอแพทเทิร์น)
 *   เลือกดูภาพ 3D ตามชุดสี (เช่น "ดำ-แทน" · "ครีม-น้ำตาล") โดยไม่เปลี่ยนค่าวัสดุ · "ตามวัสดุ" = สีที่ตั้งในค่าของวัสดุ
 *   เพิ่มชุดสี = คัดลอกสีที่เห็นอยู่ · แก้ชื่อ / แก้สีรายวัสดุ / ลบ ได้ในแผงเล็ก
 *   ข้อมูลเก็บใน template.colorways + template.colorway (ชุดที่เลือก) ผ่าน editor
 *
 *   <ColorwayBar mats={[{ id, name, color }]} list={colorways} active={id|null} onChange={(list, active) => …} />
 * ใช้ที่: components/pattern-studio · คู่มือ: docs/pattern-studio.md
 */
import { useState } from "react";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { ColorInput } from "@/components/color-picker";
import type { Colorway } from "@/lib/pattern-project";

export type ColorwayMat = { id: string; name: string; color: string };

export function ColorwayBar({ mats, list, active, onChange, readonly = false }: {
  mats: ColorwayMat[]; list: Colorway[]; active: string | null;
  onChange?: (list: Colorway[], active: string | null) => void; readonly?: boolean;
}) {
  const t = useT();
  const [edit, setEdit] = useState(false);
  const cur = list.find((c) => c.id === active) ?? null;
  const colorOf = (m: ColorwayMat) => cur?.colors[m.id] ?? m.color;
  const add = () => {
    if (!onChange) return;
    const id = `cw${Date.now().toString(36)}`, colors = Object.fromEntries(mats.map((m) => [m.id, colorOf(m)]));
    onChange([...list, { id, name: t(`ชุดสี ${list.length + 1}`, `Colorway ${list.length + 1}`), colors }], id);
    setEdit(true);
  };
  const patch = (f: (c: Colorway) => Colorway) => { if (cur && onChange) onChange(list.map((c) => (c.id === cur.id ? f(c) : c)), cur.id); };
  if (!mats.length) return null;
  return (
    <div className="relative inline-flex items-center gap-1 text-xs" data-colorway-bar>
      <Icon value="i:palette" className="text-sm text-slate-500" />
      <select value={active ?? ""} onChange={(e) => onChange?.(list, e.target.value || null)} disabled={!onChange} aria-label={t("ชุดสี", "Colorway")} data-colorway-select className="h-7 rounded-md border border-slate-200 bg-white px-1 text-xs">
        <option value="">{t("สีตามวัสดุ", "Material colours")}</option>
        {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {!readonly && onChange && <button type="button" data-colorway-add onClick={add} className="h-7 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50">{t("+ ชุดสี", "+ Colorway")}</button>}
      {!readonly && onChange && cur && <button type="button" data-colorway-edit onClick={() => setEdit(!edit)} aria-expanded={edit} className="h-7 rounded-md border border-slate-200 bg-white px-2 hover:bg-slate-50">{t("แก้สี", "Edit")}</button>}
      {edit && cur && (
        <div className="absolute left-0 top-8 z-20 w-64 space-y-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-lg" data-colorway-panel>
          <input type="text" value={cur.name} maxLength={40} onChange={(e) => patch((c) => ({ ...c, name: e.target.value || c.name }))} aria-label={t("ชื่อชุดสี", "Colorway name")} className="h-7 w-full rounded-md border border-slate-200 px-1.5" />
          {mats.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-slate-600">{m.name}</span>
              <ColorInput value={colorOf(m)} allowText={false} onChange={(col) => patch((c) => ({ ...c, colors: { ...c.colors, [m.id]: col } }))} /></div>
          ))}
          <div className="flex items-center justify-between pt-1 text-[11px]">
            <span className="text-slate-400">{t("สลับดูได้ ไม่เปลี่ยนค่าวัสดุ", "For viewing — material values stay")}</span>
            <button type="button" onClick={() => { onChange?.(list.filter((c) => c.id !== cur.id), null); setEdit(false); }} className="text-rose-600 hover:underline">{t("ลบชุดนี้", "Delete")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
