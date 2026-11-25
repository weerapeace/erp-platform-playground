"use client";

/**
 * MaterialQuickPick — เลือกวัสดุแบบย่อ (ของกลาง): ที่เลือกแล้ว (ชิป ✕ · เลขลำดับ) + แนะนำจากข้อมูลฝ่ายผลิต + ค้นหา + ใช้บ่อย + ดูทั้งหมด
 *   แยกมาจากป๊อป "แทรกรายละเอียด" (components/detail-insert · ขั้นวัสดุ) — เจ้าของขอ 2026-11-25 ให้ป๊อป "ให้ AI คิดรายละเอียด" เลือกวัสดุแบบเดียวกัน
 *   ใช้ที่: detail-insert (ขั้นวัสดุแบบย่อ) · ai-product-detail (ขั้นประเภท & จุดเด่น)
 *   รายการวัสดุ = ตาราง product_materials (ผู้เรียกโหลดเอง) · ไม่บันทึกเอง — คืน id ที่เลือกผ่าน onChange (เรียงตามลำดับที่กด)
 *   ห้ามใช้: รายการเต็มแบบลากจัดลำดับ/แก้วัสดุ (อยู่ใน detail-insert โหมด "ดูทั้งหมด")
 */
import { useState, type ReactNode } from "react";
import { Icon } from "@/components/icon";
import { suggestMaterials, type MaterialRow } from "@/lib/product-materials";

export function MaterialQuickPick({ items, value, onChange, lang = "th", hint, onSeeAll, footer, oftenCount = 6 }: {
  /** วัสดุที่เลือกได้ (เรียงตามรายการกลาง = ใช้บ่อยก่อน) */
  items: MaterialRow[];
  value: string[];
  onChange: (ids: string[]) => void;
  lang?: "th" | "en";
  /** ข้อความวัสดุจากฝ่ายผลิต (parent.materials) → แนะนำให้กดเลือก */
  hint?: string | null;
  /** ปุ่ม "ดูทั้งหมด" (ไม่ส่ง = ไม่มีปุ่ม) */
  onSeeAll?: () => void;
  /** ต่อท้าย เช่น ปุ่มเพิ่มวัสดุใหม่ */
  footer?: ReactNode;
  oftenCount?: number;
}) {
  const isEn = lang === "en";
  const t = (th: string, en: string) => (isEn ? en : th);
  const nm = (x: { name: string; name_en?: string | null }) => (isEn && x.name_en?.trim() ? x.name_en : x.name);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const match = (x: { name: string; name_en?: string | null; aliases?: string | null }) => !needle || `${x.name} ${x.name_en ?? ""} ${x.aliases ?? ""}`.toLowerCase().includes(needle);
  const picked = value.flatMap((id) => items.filter((x) => x.id === id));
  const suggest = hint ? suggestMaterials(hint, items).filter((m) => !value.includes(m.id)) : [];
  const add = (id: string) => { if (!value.includes(id)) onChange([...value, id]); };

  return (
    <div className="space-y-2.5" data-insert-mat-compact>
      {/* ที่เลือกแล้ว (กด ✕ เอาออก · เลขลำดับ = ลำดับในบรรทัด) */}
      <div className="flex flex-wrap items-center gap-1.5" data-mat-picked>
        {picked.map((m, i) => (
          <span key={m.id} className="inline-flex items-center gap-1 rounded-full border border-orange-300 bg-orange-50 px-2.5 py-1 text-[12.5px] font-medium text-orange-800" data-mat-chip={m.id}>
            {value.length > 1 && <span className="text-[10.5px] text-orange-500">{i + 1}.</span>}
            {nm(m)}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== m.id))} aria-label={`${t("เอาออก", "Remove")} ${nm(m)}`} className="ml-0.5 text-orange-400 hover:text-rose-600">
              <Icon name="cancel" />
            </button>
          </span>
        ))}
        {!value.length && <span className="text-[12px] text-slate-400">{t("ยังไม่ได้เลือกวัสดุ", "No material picked yet")}</span>}
      </div>
      {/* แนะนำจากข้อมูลวัสดุของฝ่ายผลิต — คนกดเลือกเอง */}
      {hint && (
        <div className="rounded-lg bg-slate-50 px-2.5 py-2 text-[12px] text-slate-600" data-mat-suggest>
          <div className="flex flex-wrap items-center gap-1">
            <Icon name="factory" />
            <span>{t("ข้อมูลวัสดุจากฝ่ายผลิต:", "Production material note:")}</span>
            <span className="font-medium text-slate-700">“{hint.slice(0, 120)}”</span>
          </div>
          {suggest.length ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11.5px] text-slate-500">{t("แนะนำ:", "Suggested:")}</span>
              {suggest.map((m) => (
                <button key={m.id} type="button" onClick={() => add(m.id)} data-mat-suggest-pick={m.id}
                  className="rounded-full border border-orange-300 bg-white px-2.5 py-0.5 text-[12px] text-orange-700 hover:bg-orange-50">＋ {nm(m)}</button>
              ))}
              {suggest.length > 1 && (
                <button type="button" onClick={() => onChange([...value, ...suggest.map((m) => m.id).filter((id) => !value.includes(id))])} className="text-[11.5px] text-orange-600 hover:underline">
                  {t("เลือกทั้งหมด", "Pick all")}
                </button>
              )}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-slate-400">{t("ไม่ตรงกับวัสดุในคลัง — ค้นหาด้านล่าง หรือเพิ่มวัสดุใหม่", "No match in the material list — search below or add a new one")}</p>
          )}
        </div>
      )}
      {/* ค้นหา → รายการสั้น ๆ (ไม่เกิน 6) */}
      <div className="space-y-1">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ค้นหาวัสดุ เช่น หนัง, ไนล่อน, canvas", "Search material, e.g. leather, nylon")} aria-label={t("ค้นหาวัสดุ", "Search material")} data-mat-search
          className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-400" />
        {needle && (
          <div className="overflow-hidden rounded-lg border border-slate-200" data-mat-results>
            {items.filter((m) => match(m) && !value.includes(m.id)).slice(0, 6).map((m) => (
              <button key={m.id} type="button" onClick={() => { add(m.id); setQ(""); }} data-mat-result={m.id}
                className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-2.5 py-1.5 text-left text-[13px] last:border-b-0 hover:bg-orange-50">
                <span className="text-slate-800">{nm(m)}</span>
                <span className="truncate text-[11px] text-slate-400">{isEn ? m.name : m.name_en}</span>
              </button>
            ))}
            {!items.some((m) => match(m) && !value.includes(m.id)) && <p className="px-2.5 py-2 text-[12px] text-slate-400">{t("ไม่พบวัสดุ", "No material found")}</p>}
          </div>
        )}
      </div>
      {/* ใช้บ่อย (ลำดับตามรายการกลาง) */}
      <div className="flex flex-wrap items-center gap-1.5" data-mat-often>
        <span className="text-[11.5px] text-slate-500">{t("ใช้บ่อย:", "Common:")}</span>
        {items.filter((m) => !value.includes(m.id) && !suggest.some((x) => x.id === m.id)).slice(0, oftenCount).map((m) => (
          <button key={m.id} type="button" onClick={() => add(m.id)} data-mat-often-pick={m.id}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[12px] text-slate-700 hover:border-orange-300 hover:bg-orange-50">＋ {nm(m)}</button>
        ))}
        {onSeeAll && (
          <button type="button" onClick={onSeeAll} data-mat-all className="text-[11.5px] text-orange-600 hover:underline">
            {t(`ดูทั้งหมด (${items.length})`, `See all (${items.length})`)}
          </button>
        )}
      </div>
      {footer}
    </div>
  );
}
