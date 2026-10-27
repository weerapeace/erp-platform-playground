"use client";

/**
 * ตัวตั้งค่ามุมมองด่วน (อยู่ในแผง 🎛 หน้าตา) — ปรับแล้วตารางเปลี่ยนตามทันที
 * ค่าเก็บใน DisplayCfg.views ผ่าน d.set() → แอดมินที่กำลัง "แก้ชุดกลาง" = แก้ให้ทุกคน · คนอื่น = เป็น "กำหนดเอง" ของตัวเอง
 * กติกากรอง/เรียง = ./quick-views
 */
import { useEffect, useState } from "react";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import {
  QV_CONDS, QV_SORTS, QV_GROUPS, QV_CARD_FIELDS, QV_ICONS, qvNew, qvSummary,
  type QuickView, type QvCond, type QvSort, type QvDir, type QvGroup,
} from "./quick-views";

export type QvBrand = { name: string; color: string | null; oem: boolean; n: number };

const btn = (on: boolean) => `h-7 px-2.5 text-xs rounded-md border ${on ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`;
const label = "mb-1 text-[11px] font-medium text-slate-500";

export function QuickViewsEditor({ views, onChange, isAdmin, brands, colOptions, focusId, factory }: {
  views: QuickView[];
  onChange: (next: QuickView[]) => void;
  isAdmin: boolean;
  brands: QvBrand[];
  colOptions: [string, string][];   // คอลัมน์ตารางรอจ่าย [key, ชื่อ]
  focusId?: string | null;
  factory: QuickView[];             // ค่าตั้งต้นของชุดนี้ (ปุ่มคืนค่า)
}) {
  const [selId, setSelId] = useState<string>(focusId ?? views[0]?.id ?? "");
  const [iconOpen, setIconOpen] = useState(false);
  useEffect(() => { if (focusId) setSelId(focusId); }, [focusId]);
  const sel = views.find((v) => v.id === selId) ?? views[0];
  const update = (patch: Partial<QuickView>) => { if (sel) onChange(views.map((v) => (v.id === sel.id ? { ...v, ...patch } : v))); };
  const drag = useDragReorder((from, to) => onChange(moveItem(views, from, to)), { group: "qv-list" });
  const toggleIn = <T,>(arr: T[], x: T) => (arr.includes(x) ? arr.filter((a) => a !== x) : [...arr, x]);
  const add = () => { const v = qvNew(); onChange([...views, v]); setSelId(v.id); };
  const dup = () => { if (!sel) return; const v = { ...sel, ...qvNew(), name: `${sel.name} (สำเนา)`, icon: sel.icon, brands: [...sel.brands], conds: [...sel.conds], cardFields: [...sel.cardFields], cols: sel.cols ? [...sel.cols] : null, layout: sel.layout, size: sel.size, own: sel.own, mode: sel.mode, sort1: sel.sort1, dir1: sel.dir1, sort2: sel.sort2, dir2: sel.dir2, group: sel.group }; onChange([...views, v]); setSelId(v.id); };
  const del = () => { if (!sel || views.length <= 1) return; const rest = views.filter((v) => v.id !== sel.id); onChange(rest); setSelId(rest[0].id); };
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
  if (!sel) return null;

  return (
    <div className="grid gap-3 md:grid-cols-[14rem_minmax(0,1fr)]">
      {/* รายการมุมมอง: ลากเรียง · ติ๊ก = โชว์บนแถบ */}
      <div>
        <div className={label}>ลาก ⠿ เรียงลำดับปุ่ม · ติ๊ก = โชว์บนแถบ</div>
        <div className="space-y-1">
          {views.map((v, i) => (
            <div key={v.id} {...drag.rowProps(i)} onClick={() => setSelId(v.id)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[13px] ${v.id === sel.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"} ${drag.rowCls(i)}`}>
              <DragHandle {...drag.handleProps(i)} />
              <input type="checkbox" checked={v.show} onClick={(e) => e.stopPropagation()} onChange={(e) => onChange(views.map((x) => (x.id === v.id ? { ...x, show: e.target.checked } : x)))}
                className="h-4 w-4 shrink-0 accent-blue-600" title="โชว์บนแถบ" />
              <span className="shrink-0">{v.icon}</span>
              <span className={`min-w-0 flex-1 truncate ${v.show ? "text-slate-800" : "text-slate-400"}`}>{v.name}</span>
              <span className="shrink-0 text-[10px] text-slate-400">{v.layout === "cards" ? "การ์ด" : "ตาราง"}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" onClick={add} className={btn(false)}>＋ เพิ่มมุมมอง</button>
          <button type="button" onClick={() => { onChange(factory); setSelId(factory[0]?.id ?? ""); }} className={btn(false)} title="คืนมุมมองตั้งต้นของชุดนี้ทั้งหมด">คืนค่าตั้งต้น</button>
        </div>
      </div>

      {/* ตั้งค่ามุมมองที่เลือก */}
      <div className="min-w-0 space-y-3 rounded-lg border border-slate-100 p-3">
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
          <button type="button" onClick={dup} className={btn(false)}>ทำสำเนา</button>
          <button type="button" onClick={del} disabled={views.length <= 1} className="h-7 rounded-md border border-rose-200 bg-white px-2.5 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-40">ลบ</button>
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
            <div className="mt-2">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className={label + " mb-0"}>คอลัมน์</span>
                <button type="button" onClick={() => update({ cols: null })} className={btn(sel.cols === null)}>ใช้คอลัมน์ปกติ</button>
                <button type="button" onClick={() => update({ cols: sel.cols ?? colOptions.slice(0, 6).map(([k]) => k) })} className={btn(sel.cols !== null)}>กำหนดเฉพาะมุมมองนี้</button>
              </div>
              {sel.cols && (
                <div className="flex flex-wrap gap-x-3">
                  {colOptions.map(([k, l]) => (
                    <label key={k} className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[13px] text-slate-700">
                      <input type="checkbox" checked={sel.cols!.includes(k)} disabled={k === "prod"}
                        onChange={() => update({ cols: colOptions.map(([x]) => x).filter((x) => (x === k ? !sel.cols!.includes(k) : sel.cols!.includes(x))) })}
                        className="h-4 w-4 accent-blue-600" />{l}
                    </label>
                  ))}
                </div>
              )}
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
      </div>
    </div>
  );
}
