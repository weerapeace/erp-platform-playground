"use client";

/**
 * 📚 Design Library — ชุดสี (สูตรเดียวหลายสี)
 * ColorwayBar   = ปุ่มสลับ "กำลังดู/แก้ ชุดสีไหน" (สีหลัก · สี 2 · …) + เพิ่ม / ตั้งชื่อ / ลบ ชุดสี
 * ColorwayTable = ตาราง แถว = จุด · คอลัมน์ = ชุดสี · กดช่อง = สลับไปชุดสีนั้นแล้วเปิดแผงเลือกของจุดนั้น
 * กฎ: lib/design-library (applyColorway / setColorwayPick) · ชุดสีอื่นเก็บเฉพาะจุดที่ต่างจากสีหลัก
 * (ColorwayBar ของสตูดิโอแพทเทิร์นเก็บสี hex ต่อวัสดุ — ข้อมูลคนละแบบ ใช้ร่วมไม่ได้)
 */
import { useState } from "react";
import { ConfirmDialog } from "@/components/modal";
import { Icon } from "@/components/icon";
import { applyColorway, categoryOf, MAIN_COLORWAY_LABEL, MAX_COLORWAYS, pickInfo, bodyPickOf, setColorwayPick, type Choice, type Spec } from "@/lib/design-library";
import { PickThumb } from "./pick-panel";
import { newId } from "./shared";

const chip = (on: boolean) => `h-8 px-3 text-[13px] rounded-full border inline-flex items-center gap-1.5 ${on ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"}`;

export function ColorwayBar({ spec, active, readOnly, renderCount, onActive, onChange }: {
  spec: Spec; active: string | null; readOnly: boolean;
  /** จำนวนรูป GPT ต่อชุดสี (เตือนตอนลบ) */
  renderCount: (colorwayId: string | null) => number;
  onActive: (id: string | null) => void; onChange: (colorways: Spec["colorways"]) => void;
}) {
  const [del, setDel] = useState<string | null>(null);
  const cur = spec.colorways.find((c) => c.id === active) ?? null;
  const add = () => {
    const id = newId();
    onChange([...spec.colorways, { id, name: `สี ${spec.colorways.length + 2}`, hw_color: null, picks: {} }]);
    onActive(id);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[12.5px] text-slate-500 mr-1">ชุดสี</span>
      <button type="button" onClick={() => onActive(null)} className={chip(active === null)}>{MAIN_COLORWAY_LABEL}</button>
      {spec.colorways.map((c) => (
        <button key={c.id} type="button" onClick={() => onActive(c.id)} className={chip(active === c.id)}>
          {c.name}<span className={active === c.id ? "text-indigo-100" : "text-slate-400"}>{Object.keys(c.picks).length + (c.hw_color ? 1 : 0)}</span>
        </button>
      ))}
      {!readOnly && spec.colorways.length < MAX_COLORWAYS && (
        <button type="button" onClick={add} className="h-8 px-3 text-[13px] rounded-full border border-dashed border-indigo-300 text-indigo-700 hover:bg-indigo-50 inline-flex items-center gap-1"><Icon value="i:plus" />เพิ่มชุดสี</button>
      )}
      {cur && !readOnly && (
        <span className="inline-flex items-center gap-1 ml-1">
          <input value={cur.name} maxLength={60} onChange={(e) => onChange(spec.colorways.map((c) => (c.id === cur.id ? { ...c, name: e.target.value } : c)))}
            aria-label="ชื่อชุดสี" className="h-8 w-32 px-2 border border-slate-200 rounded-md text-[13px]" />
          <button type="button" onClick={() => setDel(cur.id)} className="h-8 w-8 rounded-md border border-slate-200 text-rose-600 hover:bg-rose-50" aria-label="ลบชุดสีนี้"><Icon value="i:trash" /></button>
        </span>
      )}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} variant="danger" confirmText="ลบชุดสี"
        title={`ลบชุดสี “${spec.colorways.find((c) => c.id === del)?.name ?? ""}”?`}
        message={`ของที่เลือกไว้ของชุดสีนี้จะหายไป${del && renderCount(del) ? ` · รูปจาก GPT ของชุดสีนี้ ${renderCount(del)} รูปจะไม่โชว์ในสูตรแล้ว` : ""} (มีผลเมื่อกดบันทึก)`}
        onConfirm={() => { if (!del) return; onChange(spec.colorways.filter((c) => c.id !== del)); if (active === del) onActive(null); setDel(null); }} />
    </div>
  );
}

export function ColorwayTable({ spec, choices, active, readOnly, onOpen, onChange }: {
  spec: Spec; choices: Choice[]; active: string | null; readOnly: boolean;
  /** กดช่อง → สลับไปชุดสีนั้น + เลือกจุดนั้น */
  onOpen: (colorwayId: string | null, pinIndex: number) => void;
  onChange: (spec: Spec) => void;
}) {
  if (!spec.colorways.length) return null;
  const cols = [{ id: null as string | null, name: MAIN_COLORWAY_LABEL }, ...spec.colorways.map((c) => ({ id: c.id as string | null, name: c.name }))];
  const views = cols.map((c) => applyColorway(spec, c.id));
  const hwName = (code: string | null) => choices.find((c) => c.list_key === "hw_color" && c.code === code)?.name ?? "—";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr className="text-slate-500 text-left">
            <th className="py-1.5 pr-2 font-normal w-40">จุด</th>
            {cols.map((c) => <th key={c.id ?? "main"} className={`py-1.5 px-2 font-normal min-w-36 ${c.id === active ? "text-indigo-700" : ""}`}>{c.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {spec.pins.map((p, i) => (
            <tr key={p.id} className="border-t border-slate-100">
              <td className="py-1.5 pr-2 text-slate-600"><span className="inline-flex w-5 h-5 rounded-full bg-amber-400 text-amber-950 text-[11px] font-semibold items-center justify-center mr-1.5">{i + 1}</span>{categoryOf(choices, p.cat)?.name ?? "ยังไม่เลือกหมวด"}</td>
              {cols.map((c, k) => {
                const v = views[k]; const pk = v.pins[i].pick; const info = pickInfo(pk, { bodyPick: bodyPickOf(v) });
                const own = c.id !== null && p.id in (spec.colorways.find((x) => x.id === c.id)?.picks ?? {});
                return (
                  <td key={c.id ?? "main"} className={`py-1 px-1 align-top ${c.id === active ? "bg-indigo-50/50" : ""}`}>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => onOpen(c.id, i)} title={readOnly ? "" : "กดเพื่อเลือกของของจุดนี้ในชุดสีนี้"}
                        className={`flex-1 min-w-0 flex items-center gap-1.5 rounded-md border p-1 text-left ${own ? "border-indigo-300 bg-white" : "border-transparent hover:border-slate-200"}`}>
                        <PickThumb pick={pk} spec={v} choices={choices} cat={p.cat} size={32} />
                        <span className={`min-w-0 truncate ${c.id !== null && !own ? "text-slate-400" : "text-slate-700"}`}>{info.code || info.name || "—"}{c.id !== null && !own ? " (เหมือนสีหลัก)" : ""}</span>
                      </button>
                      {own && !readOnly && (
                        <button type="button" onClick={() => onChange(setColorwayPick(spec, c.id, p.id, undefined))} className="h-6 w-6 shrink-0 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="กลับไปเหมือนสีหลัก" title="กลับไปเหมือนสีหลัก"><Icon value="i:arrow-back-up" /></button>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="border-t border-slate-100">
            <td className="py-1.5 pr-2 text-slate-600">สีอะไหล่ทั้งใบ</td>
            {cols.map((c, k) => {
              const cw = spec.colorways.find((x) => x.id === c.id);
              return (
                <td key={c.id ?? "main"} className={`py-1.5 px-2 ${c.id === active ? "bg-indigo-50/50" : ""}`}>
                  {c.id === null || readOnly ? <span className={c.id !== null && !cw?.hw_color ? "text-slate-400" : "text-slate-700"}>{hwName(views[k].hw_color)}{c.id !== null && !cw?.hw_color ? " (เหมือนสีหลัก)" : ""}</span> : (
                    <select value={cw?.hw_color ?? ""} onChange={(e) => onChange({ ...spec, colorways: spec.colorways.map((x) => (x.id === c.id ? { ...x, hw_color: e.target.value || null } : x)) })}
                      className="h-7 px-1.5 border border-slate-200 rounded-md text-[12.5px] bg-white max-w-full">
                      <option value="">เหมือนสีหลัก ({hwName(spec.hw_color)})</option>
                      {choices.filter((x) => x.list_key === "hw_color" && x.is_active).map((x) => <option key={x.id} value={x.code}>{x.name}</option>)}
                    </select>
                  )}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
