"use client";

/**
 * 📅 DocCalendar — ปฏิทินเอกสารกลาง (ของกลาง)
 *
 * เอาเอกสารอะไรก็ได้ที่มี "วันที่" มาวางบนปฏิทินรายเดือน — ใบสั่งขาย / ใบขาย / ใบสั่งผลิต /
 * ใบวางบิล ฯลฯ ใช้ตัวเดียวกันหมด แก้หน้าตาที่นี่ที่เดียว ทุกหน้าเปลี่ยนตาม
 *
 * ใช้:
 *   <DocCalendar docs={docs} cursor={cursor} onCursor={setCursor} onPick={(id) => ...} />
 *   • doc.href  → กดแล้วลิงก์ไปหน้าอื่น (ใช้ openLink ของกลางได้)
 *   • onPick    → กดแล้วเปิดป๊อปในหน้าเดียวกัน
 *   • doc.approx = true → ติด "~" บอกว่าเป็นวันโดยประมาณ (เช่น ยังไม่ใส่กำหนดส่ง เลยวางตามวันที่สั่ง)
 *
 * ห้ามเขียนตารางปฏิทินเองในหน้าโมดูล — ใช้ตัวนี้
 */
import { useMemo } from "react";

export type CalDoc = {
  id: string;
  /** เลขที่เอกสาร (บรรทัดบน) */
  no: string | null;
  /** บรรทัดล่าง เช่น ชื่อลูกค้า */
  sub?: string | null;
  /** วันที่ที่ใช้วาง (YYYY-MM-DD) */
  date: string;
  amount?: number;
  /** สีจุดสถานะ */
  color?: string;
  /** วันโดยประมาณ (ติดเครื่องหมาย ~) */
  approx?: boolean;
  /** ถ้าใส่ = กดแล้วไปลิงก์นี้ (ไม่ใส่ = เรียก onPick) */
  href?: string;
  /** ข้อความตอนชี้ค้าง */
  title?: string;
};

const money = (n: number) => "฿" + (Math.round(n) || 0).toLocaleString("th-TH");
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function DocCalendar({
  docs, cursor, onCursor, onPick, hint, unit = "ใบ",
}: {
  docs: CalDoc[];
  cursor: Date;
  onCursor: (d: Date) => void;
  onPick?: (id: string) => void;
  hint?: string;
  unit?: string;
}) {
  const byDay = useMemo(() => {
    const m = new Map<string, CalDoc[]>();
    for (const o of docs) {
      const k = (o.date ?? "").slice(0, 10);
      if (!k) continue;
      (m.get(k) ?? m.set(k, []).get(k)!).push(o);
    }
    return m;
  }, [docs]);

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const today = ymd(new Date());
  const monthDocs = cells.filter((d) => d.getMonth() === cursor.getMonth()).flatMap((d) => byDay.get(ymd(d)) ?? []);
  const monthTotal = monthDocs.reduce((n, o) => n + (Number(o.amount) || 0), 0);

  return (
    <div className="border border-slate-200 rounded-xl bg-white p-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <button onClick={() => onCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="h-8 w-8 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">‹</button>
        <span className="min-w-[150px] text-center text-sm font-semibold text-slate-700">{cursor.toLocaleDateString("th-TH", { month: "long", year: "numeric" })}</span>
        <button onClick={() => onCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="h-8 w-8 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">›</button>
        <button onClick={() => { const d = new Date(); onCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }} className="h-8 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">วันนี้</button>
        <span className="ml-auto text-[12px] text-slate-500">เดือนนี้ <b className="text-slate-700">{monthDocs.length}</b> {unit}{monthTotal ? ` · ${money(monthTotal)}` : ""}</span>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] text-slate-400 border-b border-slate-100 pb-1">
        {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 border-l border-t border-slate-100">
        {cells.map((d) => {
          const k = ymd(d);
          const list = byDay.get(k) ?? [];
          const inMonth = d.getMonth() === cursor.getMonth();
          const sum = list.reduce((n, o) => n + (Number(o.amount) || 0), 0);
          return (
            <div key={k} className={`min-h-[104px] border-b border-r border-slate-100 p-1 ${inMonth ? "bg-white" : "bg-slate-50/60"} ${k === today ? "ring-2 ring-inset ring-indigo-400" : ""}`}>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold ${k === today ? "text-indigo-700" : inMonth ? "text-slate-600" : "text-slate-300"}`}>{d.getDate()}</span>
                {list.length > 0 && <span className="text-[9px] px-1 rounded bg-indigo-50 text-indigo-700">{list.length}{sum ? ` · ${money(sum)}` : ""}</span>}
              </div>
              <div className="space-y-0.5 mt-0.5 max-h-[86px] overflow-y-auto scrollbar-hide">
                {list.map((o) => {
                  const inner = (
                    <>
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: o.color ?? "#94a3b8" }} />
                        <span className="min-w-0 flex-1 text-[10px] font-semibold text-slate-700 truncate">{o.no ?? "—"}</span>
                        {o.approx && <span className="text-[9px] text-amber-500 shrink-0" title="วันโดยประมาณ">~</span>}
                      </div>
                      {o.sub && <div className="text-[9px] text-slate-400 truncate">{o.sub}</div>}
                    </>
                  );
                  const cls = "block w-full text-left rounded border border-slate-200 bg-white px-1 py-0.5 hover:border-indigo-300";
                  const tip = o.title ?? `${o.no ?? ""}${o.sub ? ` · ${o.sub}` : ""}${o.amount ? `\n${money(o.amount)}` : ""}`;
                  return o.href
                    ? <a key={o.id} href={o.href} title={tip} className={cls}>{inner}</a>
                    : <button key={o.id} type="button" onClick={() => onPick?.(o.id)} title={tip} className={cls}>{inner}</button>;
                })}
              </div>
            </div>
          );
        })}
      </div>
      {hint && <p className="text-[11px] text-slate-400 mt-2">{hint}</p>}
    </div>
  );
}
