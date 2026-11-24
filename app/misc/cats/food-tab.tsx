"use client";

/**
 * 🐾 แท็บอาหาร / ทราย — สต็อกเกรวี่-เจลลี่แยกกัน · ตารางมื้อ (กองกลางทุกตัว) · ของใช้แต่ละชิ้น · ประวัติซื้อเข้า
 *   คำนวณทั้งหมดจาก lib/cats-supplies (วันหมด · ต้องซื้อต่อเดือน · ค่าใช้จ่ายต่อเดือน)
 */
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { StepInput } from "@/components/step-input";
import { EmptyState } from "@/components/state-views";
import { formatDate, todayBangkok } from "@/lib/date";
import { SUPPLY_TYPE_LABEL, WET_KIND_LABEL, type CatsData, type Supply, type SupplyType } from "@/lib/cats";
import { asMealPlan, fmtQty, mealDaily, stockUnitLabel, supplyStatus, wetKindSummary, type MealPlan } from "@/lib/cats-supplies";
import { DuePill } from "./cat-detail";
import { fmtMoney } from "./use-cats";
import type { FormTarget } from "./cat-forms";

const TYPES: SupplyType[] = ["dry_food", "wet_food", "litter"];

export function FoodTab({ data, mealPlanRaw, canEdit, onForm, onPurchase, onCount, onDelete, onDeletePurchase, onSaveMealPlan }: {
  data: CatsData;
  mealPlanRaw: unknown;
  canEdit: boolean;
  onForm: (t: FormTarget) => void;
  onPurchase: (s: Supply) => void;
  onCount: (s: Supply, estimate: number) => void;
  onDelete: (s: Supply) => void;
  onDeletePurchase: (id: string, label: string) => void;
  onSaveMealPlan: (plan: MealPlan, before: MealPlan) => Promise<boolean>;
}) {
  const today = todayBangkok();
  const saved = useMemo(() => asMealPlan(mealPlanRaw), [mealPlanRaw]);
  const [plan, setPlan] = useState<MealPlan>(saved);
  useEffect(() => setPlan(saved), [saved]);
  const dirty = JSON.stringify(plan) !== JSON.stringify(saved);
  const daily = mealDaily(plan);

  const supplies = useMemo(() => data.supplies.filter((s) => s.is_active).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)), [data.supplies]);
  const status = useMemo(() => new Map(supplies.map((s) => [s.id, supplyStatus(s, data.purchases, saved, supplies, today)])), [supplies, data.purchases, saved, today]);
  const wet = wetKindSummary(supplies, data.purchases, saved, today);
  const monthly = TYPES.map((t) => ({ t, cost: supplies.filter((s) => s.type === t).reduce((n, s) => n + (status.get(s.id)?.monthlyCost ?? 0), 0) }));
  const supplyName = (id: string) => { const s = data.supplies.find((x) => x.id === id); return s ? [s.brand, s.flavor].filter(Boolean).join(" ") : "—"; };
  const purchases = data.purchases.filter((p) => p.is_active).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)).slice(0, 15);

  const setMeal = (i: number, patch: Partial<MealPlan["meals"][number]>) => setPlan((p) => ({ ...p, meals: p.meals.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));

  return (
    <div className="space-y-6">
      {/* สรุปบนสุด */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["gravy", "jelly"] as const).map((k) => (
          <div key={k} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs text-slate-500">{WET_KIND_LABEL[k]} (รวมทุกยี่ห้อ)</div>
            <div className="text-xl font-bold text-slate-800">{fmtQty(wet[k].remaining)} <span className="text-sm font-normal text-slate-500">ชิ้น</span></div>
            <div className="mt-1 text-xs text-slate-500">ใช้วันละ {fmtQty(wet[k].daily)} · {wet[k].daysLeft == null ? "ยังไม่ได้ตั้งตารางมื้อ" : <DuePill due={addDays(today, wet[k].daysLeft)} today={today} />}</div>
          </div>
        ))}
        <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-xs text-slate-500">ค่าอาหารและทรายต่อเดือน (ประมาณ)</div>
          <div className="text-xl font-bold text-slate-800">{fmtMoney(monthly.reduce((n, m) => n + m.cost, 0)) || "฿0"}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">{monthly.map((m) => <span key={m.t}>{SUPPLY_TYPE_LABEL[m.t]} {fmtMoney(m.cost) || "฿0"}</span>)}</div>
        </div>
      </div>

      {/* ตารางมื้อ */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-700">ตารางมื้ออาหารเปียก <span className="text-xs font-normal text-slate-400">ตั้งรวมทุกตัว · ใส่ครึ่งชิ้นได้</span></h3>
          {canEdit && dirty && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setPlan(saved)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
              <button type="button" onClick={() => void onSaveMealPlan(plan, saved)} className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700">บันทึกตารางมื้อ</button>
            </div>
          )}
        </div>
        {/* มือถือ: การ์ดต่อมื้อ (ตารางกว้างเกินจอ) */}
        <div className="space-y-2 sm:hidden">
          {plan.meals.map((m, i) => (
            <div key={m.key + i} className="rounded-lg border border-slate-200 p-2.5">
              <div className="mb-2 flex items-center gap-2">
                {canEdit ? <input value={m.label} onChange={(e) => setMeal(i, { label: e.target.value })} className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm" /> : <span className="flex-1 text-sm font-medium">{m.label}</span>}
                {canEdit && plan.meals.length > 1 && <button type="button" aria-label="ลบมื้อ" onClick={() => setPlan((p) => ({ ...p, meals: p.meals.filter((_, j) => j !== i) }))} className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="x" /></button>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-slate-500">เกรวี่<StepInput value={m.gravy} onChange={(x) => setMeal(i, { gravy: x ?? 0 })} step={0.5} min={0} max={50} disabled={!canEdit} /></label>
                <label className="text-xs text-slate-500">เจลลี่<StepInput value={m.jelly} onChange={(x) => setMeal(i, { jelly: x ?? 0 })} step={0.5} min={0} max={50} disabled={!canEdit} /></label>
              </div>
            </div>
          ))}
          <div className="flex justify-between px-1 text-sm font-semibold text-slate-700"><span>ต่อวัน</span><span>เกรวี่ {fmtQty(daily.gravy)} · เจลลี่ {fmtQty(daily.jelly)} ชิ้น</span></div>
        </div>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-500"><th className="py-1 pr-2 font-medium">มื้อ</th><th className="px-2 font-medium">เกรวี่ (ชิ้น)</th><th className="px-2 font-medium">เจลลี่ (ชิ้น)</th><th /></tr></thead>
            <tbody>
              {plan.meals.map((m, i) => (
                <tr key={m.key + i} className="border-t border-slate-100">
                  <td className="py-1.5 pr-2">{canEdit ? <input value={m.label} onChange={(e) => setMeal(i, { label: e.target.value })} className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm" /> : m.label}</td>
                  <td className="px-2"><StepInput value={m.gravy} onChange={(x) => setMeal(i, { gravy: x ?? 0 })} step={0.5} min={0} max={50} disabled={!canEdit} className="w-32" /></td>
                  <td className="px-2"><StepInput value={m.jelly} onChange={(x) => setMeal(i, { jelly: x ?? 0 })} step={0.5} min={0} max={50} disabled={!canEdit} className="w-32" /></td>
                  <td className="text-right">{canEdit && plan.meals.length > 1 && <button type="button" aria-label="ลบมื้อ" onClick={() => setPlan((p) => ({ ...p, meals: p.meals.filter((_, j) => j !== i) }))} className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="x" /></button>}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-semibold text-slate-700"><td className="py-1.5">ต่อวัน</td><td className="px-2">{fmtQty(daily.gravy)} ชิ้น</td><td className="px-2">{fmtQty(daily.jelly)} ชิ้น</td><td /></tr>
            </tbody>
          </table>
        </div>
        {canEdit && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
            {plan.meals.length < 8 && <button type="button" onClick={() => setPlan((p) => ({ ...p, meals: [...p.meals, { key: `m${Date.now()}`, label: "มื้อใหม่", gravy: 0, jelly: 0 }] }))} className="inline-flex items-center gap-1 text-sky-700 hover:underline"><Icon name="plus" /> เพิ่มมื้อ</button>}
            <label className="flex flex-wrap items-center gap-2 text-slate-600"><span>ถ้าให้อาหารเปียกด้วย ให้อาหารเม็ดเหลือ</span>
              <StepInput value={plan.dry_ratio_pct} onChange={(x) => setPlan((p) => ({ ...p, dry_ratio_pct: Math.max(0, Math.min(100, Math.round(x ?? 100))) }))} step={5} min={0} max={100} unit="%" className="w-36" />
              <span>ของกรัมที่ตั้ง</span></label>
          </div>
        )}
      </section>

      {/* ของใช้ */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-700">ของที่บ้าน</h3>
          {canEdit && <button type="button" onClick={() => onForm({ kind: "supplies" })} className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"><Icon name="plus" /> เพิ่มอาหาร/ทราย</button>}
        </div>
        {!supplies.length && <EmptyState icon={<Icon name="box" />} title="ยังไม่มีอาหารหรือทราย" hint="เพิ่มอาหารเม็ด อาหารเปียก (เกรวี่/เจลลี่) และทราย พร้อมราคาและลิงก์ร้าน แล้วระบบจะบอกว่าเหลือกี่วัน" onCreate={canEdit ? () => onForm({ kind: "supplies" }) : undefined} createLabel="เพิ่มอาหาร/ทราย" />}
        {TYPES.map((t) => {
          const list = supplies.filter((s) => s.type === t);
          if (!list.length) return null;
          return (
            <div key={t}>
              <div className="mb-1.5 text-xs font-medium text-slate-500">{SUPPLY_TYPE_LABEL[t]}</div>
              <div className="grid gap-3 md:grid-cols-2">
                {list.map((s) => {
                  const st = status.get(s.id)!;
                  const unit = stockUnitLabel(s);
                  return (
                    <div key={s.id} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-800">{s.brand}{s.flavor ? ` · ${s.flavor}` : ""}</div>
                          <div className="text-xs text-slate-500">
                            {s.wet_kind ? <span className="mr-1 rounded bg-violet-50 px-1.5 py-0.5 text-violet-700">{WET_KIND_LABEL[s.wet_kind]}</span> : null}
                            {s.type === "dry_food" && s.pack_size ? `ถุง ${fmtQty(Number(s.pack_size))} ${s.pack_size_unit === "kg" ? "กก." : "กรัม"} · ${fmtQty(Number(s.daily_g ?? 0))} กรัม/วัน` : ""}
                            {s.type === "wet_food" ? `${s.unit_size_g ? `${fmtQty(Number(s.unit_size_g))} กรัม/ชิ้น · ` : ""}${s.units_per_pack ? `${s.units_per_pack} ชิ้น/แพ็ค` : ""}` : ""}
                            {s.type === "litter" ? `${s.pack_size ? `${fmtQty(Number(s.pack_size))} ${s.pack_size_unit === "kg" ? "กก." : "ลิตร"} · ` : ""}${s.pack_lasts_days ? `1 ถุงใช้ ${fmtQty(Number(s.pack_lasts_days))} วัน` : ""}` : ""}
                          </div>
                        </div>
                        {st.daysLeft != null && st.runOut && <DuePill due={st.runOut} today={today} />}
                      </div>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div>
                          <div className="text-2xl font-bold text-slate-800">{fmtQty(st.remaining)} <span className="text-sm font-normal text-slate-500">{unit}</span></div>
                          <div className="text-xs text-slate-500">
                            {st.runOut ? `คาดว่าหมด ${formatDate(st.runOut)}` : "ยังคำนวณวันหมดไม่ได้"}
                            {st.monthlyPacks != null && ` · ต่อเดือนซื้อ ${st.monthlyPacks} ${s.type === "wet_food" ? "แพ็ค" : "ถุง"}`}
                            {st.monthlyCost != null && ` · ${fmtMoney(st.monthlyCost)}/เดือน`}
                          </div>
                        </div>
                      </div>
                      {st.missing.length > 0 && <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">ยังไม่ได้ตั้ง: {st.missing.join(" · ")}</p>}
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {canEdit && <button type="button" onClick={() => onPurchase(s)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"><Icon name="plus" /> ซื้อเข้า</button>}
                        {canEdit && <button type="button" onClick={() => onCount(s, st.remaining)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">นับสต็อก</button>}
                        {s.shop_url && <a href={s.shop_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-orange-300 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100"><Icon name="external-link" /> สั่งซื้อ{s.shop_name ? ` (${s.shop_name})` : ""}</a>}
                        {canEdit && <span className="ml-auto flex gap-1">
                          <button type="button" aria-label="แก้ไข" onClick={() => onForm({ kind: "supplies", row: s })} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon name="edit" /></button>
                          <button type="button" aria-label="ลบ" onClick={() => onDelete(s)} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="trash" /></button>
                        </span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {/* ประวัติซื้อเข้า */}
      {purchases.length > 0 && (
        <section>
          <h3 className="mb-2 font-semibold text-slate-700">ซื้อเข้าล่าสุด</h3>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {purchases.map((p) => {
              const s = data.supplies.find((x) => x.id === p.supply_id);
              return (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="w-24 shrink-0 text-slate-500">{formatDate(p.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-800">{supplyName(p.supply_id)} <span className="text-slate-500">+{fmtQty(Number(p.qty))} {s ? stockUnitLabel(s) : ""}{p.packs ? ` (${fmtQty(Number(p.packs))} แพ็ค)` : ""}</span></span>
                  <span className="shrink-0 font-medium text-slate-700">{fmtMoney(p.price_paid)}</span>
                  {canEdit && <button type="button" aria-label="ลบ" onClick={() => onDeletePurchase(p.id, `ซื้อเข้า ${supplyName(p.supply_id)}`)} className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="trash" /></button>}
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-slate-400">ลบใบซื้อเข้า = สต็อกลดลงตามและไม่นับเป็นค่าใช้จ่าย (กู้คืนได้จากถังขยะ)</p>
        </section>
      )}
    </div>
  );
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
