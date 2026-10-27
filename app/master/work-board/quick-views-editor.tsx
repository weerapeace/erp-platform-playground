"use client";

/**
 * ฟอร์มตั้งค่ามุมมองด่วน 1 มุมมอง (ใช้ในป๊อป ⚙️ จัดการมุมมอง — ./quick-views-manager)
 * กรอง (แบรนด์ · OEM/แบรนด์เรา · เงื่อนไข) · แสดงเป็น (ตาราง/การ์ด · คอลัมน์ · พอดีเนื้อหา · ความกว้าง) · เรียง · จัดกลุ่ม
 * readOnly = ดูได้อย่างเดียว (มุมมองของทีม สำหรับคนที่ไม่ใช่แอดมิน)
 */
import { useState } from "react";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import {
  QV_CONDS, QV_SORTS, QV_GROUPS, QV_CARD_FIELDS, QV_ICONS, qvSummary,
  type QuickView, type QvCond, type QvSort, type QvDir, type QvGroup,
} from "./quick-views";

export type QvBrand = { name: string; color: string | null; oem: boolean; n: number };

const btn = (on: boolean) => `h-7 px-2.5 text-xs rounded-md border ${on ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"} disabled:opacity-60`;
const label = "mb-1 text-[11px] font-medium text-slate-500";

export function QuickViewForm({ view: sel, onChange, isAdmin, brands, colOptions, defaultCols, readOnly = false }: {
  view: QuickView;
  onChange: (patch: Partial<QuickView>) => void;
  isAdmin: boolean;
  brands: QvBrand[];
  colOptions: [string, string][];   // คอลัมน์ตารางรอจ่าย [key, ชื่อ]
  defaultCols?: string[];           // คอลัมน์ที่ตารางปกติโชว์อยู่ตอนนี้ (ตั้งต้นตอนกด "กำหนดเฉพาะมุมมองนี้")
  readOnly?: boolean;
}) {
  const [iconOpen, setIconOpen] = useState(false);
  const update = onChange;
  // ลำดับคอลัมน์ของมุมมอง (ซ้าย → ขวา ตามที่ตารางวาด) — ลาก ⠿ หรือกด ‹ ›
  const dragCols = useDragReorder((from, to) => { if (sel.cols) update({ cols: moveItem(sel.cols, from, to) }); }, { group: "qv-cols" });
  const colLabel = (k: string) => colOptions.find(([x]) => x === k)?.[1] ?? k;
  const startCols = () => {
    const known = new Set(colOptions.map(([k]) => k));
    const base = (defaultCols ?? []).filter((k) => known.has(k));
    return base.length ? base : colOptions.slice(0, 6).map(([k]) => k);
  };
  const toggleIn = <T,>(arr: T[], x: T) => (arr.includes(x) ? arr.filter((a) => a !== x) : [...arr, x]);
  const sortSel = (k: "sort1" | "sort2", d: "dir1" | "dir2") => (
    <div className="flex flex-wrap items-center gap-1.5">
      <select value={sel[k]} onChange={(e) => { const s = e.target.value as QvSort; update({ [k]: s, [d]: QV_SORTS.find(([x]) => x === s)?.[2] ?? "desc" } as Partial<QuickView>); }}
        className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-[13px]">
        {QV_SORTS.filter(([s]) => (k === "sort2" || s !== "none") && (isAdmin || s !== "value")).map(([s, l]) => <option key={s} value={s}>{l}</option>)}
      </select>
      {sel[k] !== "none" && (["desc", "asc"] as QvDir[]).map((dv) => (
        <button key={dv} type="button" onClick={() => update({ [d]: dv } as Partial<QuickView>)} className={btn(sel[d] === dv)}>{dv === "desc" ? "มาก→น้อย" : "น้อย→มาก"}</button>
      ))}
    </div>
  );
  const widthN = Object.keys(sel.widths).length;

  return (
    // fieldset disabled = ล็อกทุกช่องในฟอร์ม (ดูได้อย่างเดียว)
    <fieldset disabled={readOnly} className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative">
          <button type="button" onClick={() => setIconOpen((o) => !o)} className="h-8 w-10 rounded-md border border-slate-200 bg-white text-base" title="เลือกไอคอน">{sel.icon}</button>
          {iconOpen && (
            <div className="absolute left-0 top-9 z-20 grid w-48 grid-cols-7 gap-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
              {QV_ICONS.map((ic) => <button key={ic} type="button" onClick={() => { update({ icon: ic }); setIconOpen(false); }} className="h-6 rounded hover:bg-slate-100">{ic}</button>)}
            </div>
          )}
        </div>
        <input value={sel.name} onChange={(e) => update({ name: e.target.value.slice(0, 40) })} placeholder="ชื่อปุ่ม" className="h-8 min-w-[10rem] flex-1 rounded-md border border-slate-200 px-2 text-sm" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <div className={label}>แบรนด์ (เลือกได้หลายอัน · ไม่เลือก = ทุกแบรนด์)</div>
          <div className="flex flex-wrap gap-1">
            {brands.map((b) => {
              const key = b.name || "__none__";
              const on = sel.brands.includes(key);
              return (
                <button key={key} type="button" onClick={() => update({ brands: toggleIn(sel.brands, key) })}
                  className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs ${on ? "border-blue-400 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color || "#94a3b8" }} />
                  {b.name || "ไม่ระบุแบรนด์"}{b.oem && <span className="rounded bg-amber-50 px-1 text-[9px] text-amber-700">OEM</span>}
                  <span className="text-slate-400">{b.n}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {([["all", "ทั้งหมด"], ["oem", "งานลูกค้า OEM"], ["own", "แบรนด์เรา"]] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => update({ own: k })} className={btn(sel.own === k)}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <div className={label}>เงื่อนไข</div>
          <div className="mb-1 flex gap-1">
            <button type="button" onClick={() => update({ mode: "any" })} className={btn(sel.mode === "any")}>ตรงข้อใดข้อหนึ่ง</button>
            <button type="button" onClick={() => update({ mode: "all" })} className={btn(sel.mode === "all")}>ตรงทุกข้อ</button>
          </div>
          <div className="grid grid-cols-2 gap-x-3">
            {QV_CONDS.filter(([c]) => isAdmin || c !== "noprice").map(([c, l]) => (
              <label key={c} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[13px] text-slate-700">
                <input type="checkbox" checked={sel.conds.includes(c)} onChange={() => update({ conds: toggleIn<QvCond>(sel.conds, c) })} className="h-4 w-4 accent-blue-600" />{l}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className={label}>แสดงเป็น</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => update({ layout: "table" })} className={btn(sel.layout === "table")}>▦ ตาราง</button>
          <button type="button" onClick={() => update({ layout: "cards" })} className={btn(sel.layout === "cards")}>🃏 การ์ด</button>
          {sel.layout === "cards" && <>
            <span className="ml-2 text-[11px] text-slate-400">ขนาด</span>
            {([["s", "เล็ก"], ["m", "กลาง"], ["l", "ใหญ่"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => update({ size: k })} className={btn(sel.size === k)}>{l}</button>)}
          </>}
        </div>
        {sel.layout === "cards" ? (
          <div className="mt-2">
            <div className={label}>ช่องบนการ์ด</div>
            <div className="flex flex-wrap gap-x-3">
              {QV_CARD_FIELDS.filter(([k]) => isAdmin || k !== "value").map(([k, l]) => (
                <label key={k} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[13px] text-slate-700">
                  <input type="checkbox" checked={sel.cardFields.includes(k)} disabled={k === "prod"}
                    onChange={() => update({ cardFields: QV_CARD_FIELDS.map(([x]) => x).filter((x) => (x === k ? !sel.cardFields.includes(k) : sel.cardFields.includes(x))) })}
                    className="h-4 w-4 accent-blue-600" />{l}
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={label + " mb-0"}>คอลัมน์</span>
              <button type="button" onClick={() => update({ cols: null })} className={btn(sel.cols === null)}>ใช้คอลัมน์ปกติ</button>
              <button type="button" onClick={() => update({ cols: sel.cols ?? startCols() })} className={btn(sel.cols !== null)}>กำหนดเฉพาะมุมมองนี้</button>
            </div>
            {sel.cols && (() => {
              const cols = sel.cols;
              const rest = colOptions.filter(([k]) => !cols.includes(k));
              const arrow = "h-6 w-5 rounded text-xs hover:bg-blue-100 disabled:opacity-30";
              return (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
                  <div className="text-[11px] text-slate-500">ลำดับในตาราง (ซ้าย → ขวา) — ลาก ⠿ หรือกด ‹ › เพื่อสลับตำแหน่ง · ✕ = เอาออก</div>
                  <div className="flex flex-wrap gap-1.5">
                    {cols.map((k, i) => (
                      <span key={k} {...dragCols.rowProps(i)}
                        className={`inline-flex h-8 items-center gap-0.5 rounded-lg border border-blue-200 bg-white pl-1 pr-1 text-[13px] text-slate-800 ${dragCols.rowCls(i)}`}>
                        {!readOnly && <DragHandle {...dragCols.handleProps(i)} />}
                        <span className="mr-0.5 text-[10px] text-blue-400">{i + 1}</span>
                        <span className="mr-0.5 whitespace-nowrap">{colLabel(k)}</span>
                        <button type="button" onClick={() => update({ cols: moveItem(cols, i, i - 1) })} disabled={i === 0} className={arrow} title="ย้ายไปซ้าย">‹</button>
                        <button type="button" onClick={() => update({ cols: moveItem(cols, i, i + 1) })} disabled={i === cols.length - 1} className={arrow} title="ย้ายไปขวา">›</button>
                        {k !== "prod" && (
                          <button type="button" onClick={() => update({ cols: cols.filter((x) => x !== k) })} title="เอาคอลัมน์นี้ออก"
                            className="h-6 w-5 rounded text-xs text-slate-400 hover:bg-rose-50 hover:text-rose-600">✕</button>
                        )}
                      </span>
                    ))}
                  </div>
                  {rest.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="mr-1 text-[11px] text-slate-500">เพิ่ม (ต่อท้าย):</span>
                      {rest.map(([k, l]) => (
                        <button key={k} type="button" onClick={() => update({ cols: [...cols, k] })}
                          className="h-7 rounded-full border border-dashed border-slate-300 bg-white px-2.5 text-xs text-slate-600 hover:bg-slate-50">＋ {l}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={label + " mb-0"}>ความกว้าง</span>
              <button type="button" onClick={() => update({ fit: false })} className={btn(!sel.fit)}>ยืดเต็มจอ</button>
              <button type="button" onClick={() => update({ fit: true })} className={btn(sel.fit)}>พอดีเนื้อหา</button>
              <span className="text-[11px] text-slate-400">
                {widthN ? <>ลากปรับไว้ {widthN} คอลัมน์ · <button type="button" onClick={() => update({ widths: {} })} className="text-blue-600 underline">ล้าง</button></> : "ลากเส้นที่หัวคอลัมน์ในตารางเพื่อปรับ แล้วกดบันทึก"}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div><div className={label}>เรียงหลัก</div>{sortSel("sort1", "dir1")}</div>
        <div><div className={label}>ถ้าเท่ากัน เรียงต่อด้วย</div>{sortSel("sort2", "dir2")}</div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={label + " mb-0"}>จัดกลุ่ม</span>
        {QV_GROUPS.map(([g, l]) => <button key={g} type="button" onClick={() => update({ group: g as QvGroup })} className={btn(sel.group === g)}>{l}</button>)}
      </div>
      <p className="rounded-md bg-slate-50 px-2 py-1.5 text-[12px] text-slate-600">{qvSummary(sel)}</p>
    </fieldset>
  );
}
