"use client";

/**
 * 🐾 ทะเบียนแมว รอบ 5 — ชิ้นหน้าจอเสริม (กติกาทั้งหมดอยู่ lib/cats-extras · ไฟล์นี้แค่แสดงผล)
 *   SetupGuide        = ตัวช่วยเริ่มต้น 5 ขั้น (ทำแล้วติ๊กเขียวเอง จากข้อมูลจริง · ซ่อนได้ จำต่อเครื่อง)
 *   ShoppingListModal = รายการต้องซื้อ + คัดลอกไปวาง LINE (หน้าดูอย่างเดียว ไม่เปลี่ยนข้อมูล)
 *   PriceHistoryModal = ประวัติราคาต่อแพ็ค/ถุง เทียบร้าน · แก้/ลบใบซื้อเข้าได้จากตรงนี้
 *   AnniversaryList   = วันเกิด / วันรับเลี้ยงที่ใกล้ถึง (หน้าแรก)
 *   WeightAlertBadge  = ป้ายน้ำหนักลด / ไม่ได้ชั่งนาน
 */
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { copyText } from "@/components/copy-button";
import { useToast } from "@/components/toast";
import { formatDate } from "@/lib/date";
import type { CatsData, Purchase, Supply } from "@/lib/cats";
import { fmtQty, stockUnitLabel, type MealPlan } from "@/lib/cats-supplies";
import {
  anniversaryText, priceHistory, priceStats, setupSteps, shoppingList, shoppingText, supplyName, weightAlertText,
  type Anniversary, type SetupStepKey, type WeightAlert,
} from "@/lib/cats-extras";
import { fmtMoney } from "./use-cats";
import { setupSpeech } from "./cats-cute";

// ─── ตัวช่วยเริ่มต้น ───────────────────────────────────────────────────────
const HIDE_KEY = "cats.setup.hidden";

export function SetupGuide({ data, settings, onStep }: { data: CatsData; settings: { meal_plan?: unknown; notify?: unknown }; onStep: (k: SetupStepKey) => void }) {
  const steps = useMemo(() => setupSteps(data, settings), [data, settings]);
  const [hidden, setHidden] = useState(true);
  useEffect(() => { try { setHidden(localStorage.getItem(HIDE_KEY) === "1"); } catch { setHidden(false); } }, []);
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  if (hidden) return (
    <button type="button" onClick={() => { setHidden(false); try { localStorage.removeItem(HIDE_KEY); } catch { /* ไม่มีที่เก็บ */ } }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs text-orange-700 hover:bg-orange-100">
      <Icon name="wand" /> ตัวช่วยเริ่มต้น ({doneCount}/{steps.length})
    </button>
  );
  const next = steps.find((s) => !s.done);
  return (
    <section className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 font-semibold text-slate-800"><Icon name="wand" className="text-orange-500" /> เริ่มใช้ทะเบียนแมว</h2>
          <p className="text-xs text-slate-500">{setupSpeech(steps.length - doneCount)} · ทำแล้ว {doneCount}/{steps.length}</p>
        </div>
        <button type="button" onClick={() => { setHidden(true); try { localStorage.setItem(HIDE_KEY, "1"); } catch { /* ไม่มีที่เก็บ */ } }} className="shrink-0 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-white">ซ่อน</button>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-orange-100"><div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      <ol className="grid gap-2 sm:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.key}>
            <button type="button" onClick={() => onStep(s.key)}
              className={`flex h-full w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition sm:flex-col sm:items-start sm:py-2.5 ${s.done ? "border-emerald-200 bg-white" : s === next ? "border-orange-400 bg-white shadow-sm" : "border-slate-200 bg-white/70 hover:bg-white"}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-emerald-500 text-white" : s === next ? "bg-orange-500 text-white" : "bg-slate-200 text-slate-600"}`}>
                {s.done ? <Icon name="check" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-medium ${s.done ? "text-slate-500 line-through decoration-emerald-400" : "text-slate-800"}`}>{s.title}</span>
                <span className="hidden text-[11px] text-slate-500 sm:block">{s.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ─── รายการต้องซื้อ ───────────────────────────────────────────────────────
const WITHIN = [7, 14, 30] as const;

export function ShoppingListModal({ open, data, plan, today, onClose }: { open: boolean; data: CatsData; plan: MealPlan; today: string; onClose: () => void }) {
  const toast = useToast();
  const [within, setWithin] = useState<number>(14);
  const [cover, setCover] = useState<number>(30);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  useEffect(() => { if (open) setSkip(new Set()); }, [open]);
  const items = useMemo(() => shoppingList(data, plan, today, within, cover), [data, plan, today, within, cover]);
  const picked = items.filter((i) => !skip.has(i.supply.id));
  const text = shoppingText(picked, formatDate(today));
  const total = picked.reduce((n, i) => n + (i.estCost ?? 0), 0);
  const toggle = (id: string) => setSkip((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const copy = async () => { if (await copyText(text)) toast.success("คัดลอกแล้ว — ไปวางในแชต LINE ได้เลย"); else toast.error("คัดลอกไม่ได้ ลองกดค้างที่ข้อความแล้วคัดลอกเอง"); };
  if (!open) return null;
  return (
    <ERPModal open onClose={onClose} title="รายการต้องซื้อ" description="ของที่ใกล้หมด พร้อมจำนวนที่ควรซื้อและลิงก์ร้าน · หน้านี้ดูอย่างเดียว ไม่เปลี่ยนข้อมูล" size="lg"
      footer={<div className="flex w-full flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">ปิด</button>
        <button type="button" onClick={() => void copy()} disabled={!picked.length} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"><Icon name="copy" /> คัดลอกข้อความ</button>
      </div>}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
          <span className="flex items-center gap-1.5">ของที่จะหมดใน
            <span className="inline-flex overflow-hidden rounded-lg border border-slate-300">
              {WITHIN.map((d) => <button key={d} type="button" onClick={() => setWithin(d)} className={`px-2.5 py-1 text-sm ${within === d ? "bg-sky-50 font-medium text-sky-700" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{d}</button>)}
            </span> วัน</span>
          <span className="flex items-center gap-1.5">ซื้อให้พอใช้
            <select value={cover} onChange={(e) => setCover(Number(e.target.value))} className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" aria-label="ซื้อให้พอใช้กี่วัน">
              {[14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} วัน</option>)}
            </select></span>
        </div>
        {!items.length ? (
          <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">ไม่มีของที่จะหมดใน {within} วัน 🎉</p>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {items.map((i) => {
              const on = !skip.has(i.supply.id);
              return (
                <label key={i.supply.id} className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 ${on ? "" : "opacity-50"}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(i.supply.id)} className="mt-1 h-4 w-4 accent-sky-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">{i.name}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span className={`rounded-md px-1.5 py-0.5 font-medium ${i.daysLeft <= 3 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{i.daysLeft === 0 ? "หมดแล้ว" : `หมดใน ${i.daysLeft} วัน`}</span>
                      {i.shop && <span>{i.shop}</span>}
                      {i.cheapest && i.cheapest.shop !== i.shop && <span className="text-emerald-700">เคยถูกสุด {i.cheapest.shop} {fmtQty(i.cheapest.perPack)} บาท</span>}
                      {i.url && <a href={i.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="font-medium text-orange-700 underline">สั่งซื้อ</a>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-medium text-slate-800">{i.packLabel}</span>
                    <span className="block text-xs text-slate-500">{i.estCost != null ? `~${fmtMoney(i.estCost)}` : "ยังไม่ได้ตั้งราคา"}</span>
                  </span>
                </label>
              );
            })}
            <div className="flex justify-between bg-slate-50 px-3 py-2 text-sm"><span className="text-slate-600">รวม {picked.length} รายการ</span><b className="text-slate-800">~{fmtMoney(total) || "฿0"}</b></div>
          </div>
        )}
        {picked.length > 0 && (
          <details className="rounded-xl border border-slate-200 bg-slate-50">
            <summary className="cursor-pointer px-3 py-2 text-xs text-slate-500">ดูข้อความที่จะคัดลอก</summary>
            <pre className="whitespace-pre-wrap break-words px-3 pb-3 font-sans text-xs text-slate-700">{text}</pre>
          </details>
        )}
      </div>
    </ERPModal>
  );
}

// ─── ประวัติราคา ──────────────────────────────────────────────────────────
export function PriceHistoryModal({ supply, data, canEdit, onClose, onEdit, onDelete }: {
  supply: Supply | null; data: CatsData; canEdit: boolean; onClose: () => void;
  onEdit: (s: Supply, p: Purchase) => void; onDelete: (p: Purchase, label: string) => void;
}) {
  const rows = useMemo(() => (supply ? priceHistory(supply, data.purchases) : []), [supply, data.purchases]);
  const stats = useMemo(() => priceStats(rows), [rows]);
  if (!supply) return null;
  const word = supply.type === "wet_food" ? "แพ็ค" : "ถุง";
  const noPrice = data.purchases.filter((p) => p.is_active && p.supply_id === supply.id).length - rows.length;
  return (
    <ERPModal open onClose={onClose} title={`ประวัติราคา · ${supplyName(supply)}`} description={`ราคาต่อ 1 ${word} จากใบซื้อเข้า · ร้านที่ถูกสุดขึ้นก่อน`} size="lg">
      {!stats ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">ยังไม่มีใบซื้อเข้าที่ใส่ราคา · กด “ซื้อเข้า” แล้วใส่ราคาและร้าน ระบบจะเทียบให้</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "ถูกสุด", v: stats.min.perPack, sub: stats.min.shop, tone: "text-emerald-700" },
              { label: "เฉลี่ย", v: stats.avgPerPack, sub: `${rows.length} ครั้ง`, tone: "text-slate-800" },
              { label: "แพงสุด", v: stats.max.perPack, sub: stats.max.shop, tone: "text-rose-700" },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-slate-200 bg-white p-2.5">
                <div className="text-xs text-slate-500">{m.label}</div>
                <div className={`text-lg font-bold ${m.tone}`}>{fmtQty(m.v)} <span className="text-xs font-normal text-slate-500">บาท/{word}</span></div>
                <div className="truncate text-[11px] text-slate-500">{m.sub}</div>
              </div>
            ))}
          </div>
          {stats.shops.length > 1 && (
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">เทียบร้าน (ราคาดีสุดที่เคยได้)</div>
              <div className="space-y-1">
                {stats.shops.map((s, i) => (
                  <div key={s.shop} className="flex items-center gap-2 text-sm">
                    <span className="w-32 shrink-0 truncate text-slate-700 sm:w-48">{s.shop}</span>
                    <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${i === 0 ? "bg-emerald-500" : "bg-slate-400"}`} style={{ width: `${(stats.shops[0].bestPerPack / s.bestPerPack) * 100}%` }} /></span>
                    <span className="w-20 shrink-0 text-right font-medium text-slate-700">{fmtQty(s.bestPerPack)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {rows.map((r) => {
              const p = data.purchases.find((x) => x.id === r.id)!;
              return (
                <div key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="w-20 shrink-0 text-xs text-slate-500 sm:w-24 sm:text-sm">{formatDate(r.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate-800">{r.shop}{r.id === stats.min.id && <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">ถูกสุด</span>}</span>
                    <span className="text-xs text-slate-500">{fmtQty(r.qty)} {stockUnitLabel(supply)} · จ่าย {fmtMoney(r.paid)}</span>
                  </span>
                  <span className="shrink-0 text-right font-medium text-slate-800">{fmtQty(r.perPack)}</span>
                  {canEdit && <>
                    <button type="button" aria-label="แก้ไข" onClick={() => onEdit(supply, p)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon name="edit" /></button>
                    <button type="button" aria-label="ลบ" onClick={() => onDelete(p, `ซื้อเข้า ${supplyName(supply)}`)} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="trash" /></button>
                  </>}
                </div>
              );
            })}
          </div>
          {noPrice > 0 && <p className="text-xs text-slate-400">มีอีก {noPrice} ใบที่ไม่ได้ใส่ราคา (ไม่นับในการเทียบ)</p>}
        </div>
      )}
    </ERPModal>
  );
}

// ─── วันเกิด / วันรับเลี้ยง ────────────────────────────────────────────────
export function AnniversaryList({ items, onOpen }: { items: Anniversary[]; onOpen: (catId: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {items.map((a) => (
        <button key={a.key} type="button" onClick={() => onOpen(a.catId)} className={`cat-bday flex items-center gap-3 rounded-2xl border p-3 text-left ${a.daysLeft === 0 ? "ring-2 ring-pink-200" : ""}`}>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg ${a.kind === "birthday" ? "bg-pink-100 text-pink-600" : "bg-sky-100 text-sky-600"}`}><Icon name={a.kind === "birthday" ? "cake" : "home"} /></span>
          <span className="min-w-0">
            <span className="cat-title block text-sm font-semibold text-slate-800 sm:text-base">{anniversaryText(a)}</span>
            <span className="text-xs text-slate-500">{formatDate(a.date)} · {a.kind === "birthday" ? "เตรียมขนมไว้เลย" : "ขอบคุณที่มาอยู่ด้วยกันนะ"}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── ป้ายน้ำหนัก ──────────────────────────────────────────────────────────
export function WeightAlertBadge({ alert, className = "" }: { alert: WeightAlert | null; className?: string }) {
  if (!alert) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${alert.kind === "drop" ? "bg-rose-600 text-white" : "bg-slate-700/80 text-white"} ${className}`} title={weightAlertText(alert)}>
      <Icon name="scale" /> {alert.kind === "drop" ? `น้ำหนักลด ${alert.pct}%` : `ไม่ได้ชั่ง ${alert.days} วัน`}
    </span>
  );
}
