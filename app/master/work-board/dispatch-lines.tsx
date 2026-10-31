"use client";

/**
 * 🚚 แถวจ่ายงานของ "ใบเดียว" — เลือกจำนวนเอง / แบ่งจ่ายหลายคน (เจ้าของขอ 2026-10-31: "บางทีจ่ายไม่หมด หรือ จ่ายหลายคน")
 *   1 แถว = 1 ใบจ่าย (นับงาน/ค่าแรงแยกคน) · เลือกหลายคนในแถวเดียว = ทำด้วยกัน 1 ใบ (CrewPick เดิม)
 *   จ่ายไม่ครบ = ที่เหลือค้างรอจ่าย (บอกชัด) · เกินที่เหลือ = ห้ามบันทึก · งานเหมาต้องเลือกคน
 *   ใช้ในป๊อปจ่ายงานของตาราง (ปุ่ม "จ่ายงานใบนี้" / ติ๊กใบเดียวแล้วกดจ่ายงาน) — ตัวบันทึกอยู่ที่ page.tsx dispatchLines
 */
import { Icon } from "@/components/icon";
import { isHireDesk } from "@/lib/work-entry-rules";
import { CrewPick, lastCrewIds, type CrewPerson } from "./crew-pick";
import { type DispDesk, type DispLine, type DispLinesCheck } from "./dispatch-lines-rules";

export { dispLinesCheck, type DispLine, type DispLinesCheck } from "./dispatch-lines-rules";

type Desk = DispDesk;
type Person = CrewPerson & { department_id?: string | null };
type CrewWO = Parameters<typeof lastCrewIds>[0][number];
const EPS = 0.0001;
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const r2 = (n: number) => Math.round(n * 100) / 100;

export function DispatchLines({ lines, onChange, remaining, desks, deskLabel, craftsmen, workOrders, defaultRate, check }: {
  lines: DispLine[]; onChange: (lines: DispLine[]) => void;
  /** ที่เหลือให้จ่ายของใบนี้ */
  remaining: number;
  /** โต๊ะที่จ่ายได้ (ไม่รวมโต๊ะตัด/โต๊ะที่ซ่อน) */
  desks: Desk[]; deskLabel?: (d: Desk) => string;
  craftsmen: Person[]; workOrders: CrewWO[];
  /** ค่าแรง/ชิ้นตั้งต้นของแถวใหม่ (ตามสูตรของสินค้า) */
  defaultRate: string;
  check: DispLinesCheck;
}) {
  const set = (key: string, p: Partial<DispLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const poolOf = (d: Desk | undefined) => (!d ? [] : isHireDesk(d.name) ? craftsmen : craftsmen.filter((c) => c.department_id === d.id));
  const add = () => {
    const last = lines[lines.length - 1];
    onChange([...lines, { key: `l${Date.now()}${lines.length}`, deptId: last?.deptId ?? "", crewIds: [], qty: check.left, rate: last?.rate || defaultRate }]);
  };
  const quick = (n: number) => onChange([{ ...(lines[0] ?? { key: "l1", deptId: "", crewIds: [], rate: defaultRate }), qty: r2(n) }]);
  const over = check.total > remaining + EPS;
  const pay = lines.reduce((a, l) => a + (l.qty > 0 ? (Number(l.rate) || 0) * l.qty : 0), 0);
  const inp = "h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-slate-600">เหลือให้จ่าย <b className="text-slate-800">{fmt(remaining)}</b> ชิ้น</span>
        <span className="text-slate-400">· 1 แถว = 1 ใบจ่าย · หลายคนในแถวเดียว = ทำด้วยกัน</span>
        <span className="flex-1" />
        <button type="button" onClick={() => quick(remaining)} className="h-7 rounded-md border border-slate-200 bg-white px-2 text-slate-600 hover:bg-slate-50">จ่ายทั้งหมด {fmt(remaining)}</button>
        {remaining >= 2 && <button type="button" onClick={() => quick(Math.floor(remaining / 2))} className="h-7 rounded-md border border-slate-200 bg-white px-2 text-slate-600 hover:bg-slate-50">ครึ่งหนึ่ง</button>}
      </div>

      {lines.map((l, i) => {
        const d = desks.find((x) => x.id === l.deptId), hire = isHireDesk(d?.name), pool = poolOf(d), err = check.lineErr[l.key];
        const rate = Number(l.rate) || 0;
        return (
          <div key={l.key} className={`space-y-2 rounded-lg border p-2.5 ${err ? "border-rose-200 bg-rose-50/30" : "border-slate-200 bg-white"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-5 text-center text-[12px] font-medium text-slate-400">{i + 1}</span>
              <select value={l.deptId} onChange={(e) => set(l.key, { deptId: e.target.value, crewIds: [] })} className={`${inp} min-w-0 flex-1`}>
                <option value="">— เลือกโต๊ะ —</option>
                {desks.map((o) => <option key={o.id} value={o.id}>{deskLabel ? deskLabel(o) : o.name}</option>)}
              </select>
              <label className="flex items-center gap-1 text-[12px] text-slate-500">
                <input type="number" min={0} step="any" value={l.qty || ""} placeholder="0" onChange={(e) => set(l.key, { qty: Math.max(0, Number(e.target.value) || 0) })}
                  className={`${inp} w-20 text-right${over ? " !border-rose-400" : ""}`} />
                ชิ้น
              </label>
              <label className="flex items-center gap-1 text-[12px] text-slate-500" title="ค่าแรง/ชิ้น (เว้นว่าง = ระบบเติมจากสูตรตอนบันทึก)">
                ฿<input type="number" min={0} step="any" value={l.rate} placeholder="—" onChange={(e) => set(l.key, { rate: e.target.value })} className={`${inp} w-20 text-right`} />
                /ชิ้น
              </label>
              <span className="w-20 text-right text-[12px] tabular-nums text-slate-600">{rate > 0 && l.qty > 0 ? `฿${fmt(rate * l.qty)}` : "—"}</span>
              {lines.length > 1 && (
                <button type="button" title="ลบแถวนี้" onClick={() => onChange(lines.filter((x) => x.key !== l.key))}
                  className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-rose-300 hover:text-rose-600"><Icon name="cancel" /></button>
              )}
            </div>
            {d && (
              <div className="pl-7">
                <div className="mb-1 text-[11px] text-slate-500">{hire ? "คนรับงาน (งานเหมา — ต้องเลือก)" : `คนรับงานใน ${d.name} — ไม่เลือก = ทั้งโต๊ะ · กดได้หลายคน`}</div>
                <CrewPick people={pool} everyone={craftsmen} desks={desks} value={l.crewIds} onChange={(ids) => set(l.key, { crewIds: ids })} required={hire} recent={lastCrewIds(workOrders, d.id, pool)} />
              </div>
            )}
            {err && <div className="pl-7 text-[11px] text-rose-600">{err}</div>}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={add} disabled={check.left <= EPS && !over}
          title={check.left <= EPS ? "จ่ายครบแล้ว — ลดจำนวนแถวบนก่อนถ้าจะแบ่ง" : "แบ่งที่เหลือให้อีกโต๊ะ/อีกคน (คนละใบจ่าย)"}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-indigo-300 px-3 text-[12px] text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">
          <Icon name="add" /> แบ่งจ่ายอีกคน
        </button>
        <span className="flex-1" />
        <span className="text-[12px] text-slate-600">จ่าย <b className="text-slate-800">{fmt(check.total)}</b>/{fmt(remaining)}{pay > 0 ? ` · ฿${fmt(pay)}` : ""}</span>
        {over ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">เกิน {fmt(check.total - remaining)} ชิ้น</span>
          : check.left > EPS ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">อีก {fmt(check.left)} ชิ้นค้างรอจ่าย</span>
          : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">จ่ายครบ</span>}
      </div>
    </div>
  );
}
