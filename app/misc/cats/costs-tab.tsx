"use client";

/**
 * 🐾 แท็บค่าใช้จ่าย — สรุปรายเดือน แยกตามหมวด และแยกตามแมว + กราฟย้อนหลัง 6 เดือน + รายการทั้งหมดของเดือน
 *   รวมจาก ซื้อเข้า · วัคซีน · ยา · หาหมอ · ค่าใช้จ่ายอื่น (lib/cats-costs) · เพิ่ม/แก้/ลบได้เฉพาะ "ค่าใช้จ่ายอื่น" ที่นี่
 *   (รายการจากที่อื่น แก้ที่ต้นทาง: หน้าแมว / แท็บอาหาร)
 */
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { MonthNav } from "@/components/month-nav";
import { SimpleBarChart } from "@/components/bar-chart";
import { EmptyState } from "@/components/state-views";
import { formatDate, todayBangkok } from "@/lib/date";
import { COST_CATEGORY_LABEL, costEntries, monthlyTotals, monthSummary, shortMonthTh } from "@/lib/cats-costs";
import type { CatsData } from "@/lib/cats";
import { fmtMoney } from "./use-cats";
import type { FormTarget } from "./cat-forms";

const SOURCE_LABEL = { purchases: "ซื้อเข้า", vaccinations: "วัคซีน", treatments: "ยา", vet_visits: "หาหมอ", expenses: "จดเอง" } as const;

export function CostsTab({ data, canEdit, onForm, onDeleteExpense, onOpenCat }: {
  data: CatsData;
  canEdit: boolean;
  onForm: (t: FormTarget) => void;
  onDeleteExpense: (id: string, label: string) => void;
  onOpenCat: (id: string) => void;
}) {
  const [ym, setYm] = useState(() => todayBangkok().slice(0, 7));
  const all = useMemo(() => costEntries(data), [data]);
  const activeIds = useMemo(() => data.cats.filter((c) => c.is_active).map((c) => c.id), [data.cats]);
  const sum = useMemo(() => monthSummary(all, ym, activeIds), [all, ym, activeIds]);
  const trend = useMemo(() => monthlyTotals(all, ym, 6), [all, ym]);
  const catName = (id: string | null) => (id ? data.cats.find((c) => c.id === id)?.name ?? "—" : "แมวที่ลบไปแล้ว");
  const maxCat = Math.max(1, ...sum.byCategory.map((c) => c.amount));
  const maxPer = Math.max(1, ...sum.byCat.map((c) => c.amount));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthNav value={ym} onChange={setYm} />
        {canEdit && <button type="button" onClick={() => onForm({ kind: "expenses" })} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"><Icon name="plus" /> จดค่าใช้จ่าย</button>}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">รวม {shortMonthTh(ym)}</div>
          <div className="text-3xl font-bold text-slate-800">{fmtMoney(sum.total) || "฿0"}</div>
          <div className="text-xs text-slate-400">{sum.entries.length} รายการ</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2">
          <div className="mb-1 text-xs text-slate-500">ย้อนหลัง 6 เดือน</div>
          <SimpleBarChart height={140} ariaLabel="ค่าใช้จ่ายย้อนหลัง 6 เดือน" format={(v) => `฿${Math.round(v).toLocaleString("th-TH")}`}
            data={trend.map((t) => ({ key: t.ym, label: shortMonthTh(t.ym), value: t.total }))} barColor="#fdba74" barHoverColor="#f97316" />
        </div>
      </div>

      {sum.entries.length === 0 ? (
        <EmptyState icon={<Icon name="receipt" />} title={`ยังไม่มีค่าใช้จ่ายเดือน ${shortMonthTh(ym)}`} hint="ค่าใช้จ่ายมาจาก ซื้อเข้า · วัคซีน · ยา · หาหมอ อัตโนมัติ หรือกด “จดค่าใช้จ่าย” สำหรับขนม ของเล่น อาบน้ำตัดขน" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 font-semibold text-slate-700">แยกตามหมวด</h3>
            {sum.byCategory.map((c) => (
              <div key={c.category} className="my-1.5 flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 text-slate-600">{COST_CATEGORY_LABEL[c.category]}</span>
                <div className="h-2.5 flex-1 rounded bg-slate-100"><div className="h-2.5 rounded bg-orange-400" style={{ width: `${Math.round((c.amount / maxCat) * 100)}%` }} /></div>
                <span className="w-20 shrink-0 text-right font-medium text-slate-700">{fmtMoney(c.amount)}</span>
              </div>
            ))}
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 font-semibold text-slate-700">แยกตามแมว</h3>
            {sum.byCat.map((c) => (
              <div key={c.catId ?? "x"} className="my-1.5 flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 truncate text-slate-600">{catName(c.catId)}</span>
                <div className="h-2.5 flex-1 rounded bg-slate-100"><div className="h-2.5 rounded bg-sky-400" style={{ width: `${Math.round((c.amount / maxPer) * 100)}%` }} /></div>
                <span className="w-20 shrink-0 text-right font-medium text-slate-700">{fmtMoney(Math.round(c.amount))}</span>
              </div>
            ))}
            <p className="mt-2 text-[11px] text-slate-400">ของใช้ร่วม/ส่วนกลาง แบ่งเท่ากันตามแมวที่ใช้ (ไม่ระบุ = ทุกตัว)</p>
          </section>
        </div>
      )}

      {sum.entries.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold text-slate-700">รายการเดือนนี้</h3>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {sum.entries.map((e) => {
              const exp = e.source.kind === "expenses" ? data.expenses.find((x) => x.id === e.source.id) : null;
              const oneCat = e.catIds && e.catIds.length === 1 ? e.catIds[0] : null;
              return (
                <div key={e.key} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                  <span className="w-20 shrink-0 text-slate-500">{formatDate(e.date)}</span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{COST_CATEGORY_LABEL[e.category]}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-800">
                    {oneCat ? <button type="button" onClick={() => onOpenCat(oneCat)} className="mr-1 font-medium text-sky-700 hover:underline">{catName(oneCat)}</button> : <span className="mr-1 text-slate-400">{e.catIds ? `${e.catIds.length} ตัว` : "ส่วนกลาง"}</span>}
                    {e.label} <span className="text-xs text-slate-400">· {SOURCE_LABEL[e.source.kind]}</span>
                  </span>
                  <span className="shrink-0 font-medium text-slate-700">{fmtMoney(e.amount)}</span>
                  {canEdit && exp && <span className="flex shrink-0 gap-0.5">
                    <button type="button" aria-label="แก้ไข" onClick={() => onForm({ kind: "expenses", row: exp })} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon name="edit" /></button>
                    <button type="button" aria-label="ลบ" onClick={() => onDeleteExpense(exp.id, e.label)} className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="trash" /></button>
                  </span>}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
