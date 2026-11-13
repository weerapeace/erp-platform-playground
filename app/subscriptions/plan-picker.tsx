"use client";

/**
 * แผง "แพ็กเกจของแอป" ในฟอร์ม App Subscription
 * - มีแอปในคลัง → ปุ่มแพ็กเกจ (กดแล้วราคา/สกุลเงิน/รอบบิลเติมให้) + เพิ่ม/แก้แพ็กเกจ + เตือนราคาไม่ตรงแพ็กเกจ
 * - ยังไม่มี → เพิ่มแพ็กเกจเอง หรือให้ AI ค้นจากเว็บ
 * คลัง/กติกา: lib/subscription-catalog.ts · โหลด/บันทึก: ./use-subscription-catalog
 */
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import {
  findPlan, newPlanId, planMatches,
  type CatalogApp, type CatalogInput, type CatalogPlan,
} from "@/lib/subscription-catalog";
import { CURRENCY_SYMBOL, CYCLE_LABEL, type BillingCycle, type Currency } from "@/lib/subscriptions";
import type { LookupResponse } from "./use-subscription-catalog";

const CELL = "h-8 px-2 text-xs border border-slate-200 rounded-md outline-none focus:border-indigo-400 bg-white";
const CYCLE_SHORT: Record<BillingCycle, string> = { monthly: "/เดือน", yearly: "/ปี", "one-time": " ครั้งเดียว" };

export const planPrice = (p: Pick<CatalogPlan, "cost" | "currency" | "billing_cycle">) =>
  `${CURRENCY_SYMBOL[p.currency] ?? ""}${p.cost.toLocaleString(undefined, { maximumFractionDigits: 2 })}${CYCLE_SHORT[p.billing_cycle]}`;

export type LookupState = { busy: boolean; error: string | null; info: LookupResponse | null };

type Draft = { id: string; name: string; cost: string; currency: Currency; billing_cycle: BillingCycle };
const toDraft = (p: CatalogPlan): Draft => ({ id: p.id, name: p.name, cost: String(p.cost), currency: p.currency, billing_cycle: p.billing_cycle });
const fromDraft = (d: Draft): CatalogPlan => ({ id: d.id, name: d.name.trim(), cost: Math.round((Number(d.cost) || 0) * 100) / 100, currency: d.currency, billing_cycle: d.billing_cycle });

export function PlanPicker({ appName, app, planName, current, perPerson, lookup, onLookup, onPick, onClear, saveApp }: {
  /** ชื่อรายการในฟอร์ม (ใช้ตั้งชื่อแอปตอนเพิ่มแพ็กเกจแรก) */
  appName: string;
  app: CatalogApp | null;
  planName: string;
  /** ราคาในฟอร์มตอนนี้ (โหมดแยกรายคน = ราคาต่อคน) — ไว้เทียบว่าตรงแพ็กเกจไหม */
  current: { cost: number; currency: Currency; billing_cycle: BillingCycle };
  perPerson: boolean;
  lookup: LookupState;
  onLookup: () => void;
  onPick: (plan: CatalogPlan, app: CatalogApp) => void;
  onClear: () => void;
  saveApp: (input: CatalogInput & { id?: string }) => Promise<CatalogApp>;
}) {
  const [adding, setAdding] = useState(false);
  const [manage, setManage] = useState(false);
  const [draft, setDraft] = useState<Draft>({ id: "", name: "", cost: "", currency: current.currency, billing_cycle: current.billing_cycle });
  const [rows, setRows] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // เปลี่ยนแอป → ปิดแผงแก้ไข
  useEffect(() => { setAdding(false); setManage(false); setErr(null); }, [app?.id]);

  const selected = findPlan(app, planName);
  const mismatch = selected && !planMatches(selected, current);
  const name = appName.trim();

  const openAdd = () => {
    setDraft({ id: newPlanId(), name: "", cost: current.cost ? String(current.cost) : "", currency: current.currency, billing_cycle: current.billing_cycle });
    setAdding(true); setManage(false); setErr(null);
  };
  const openManage = () => { setRows((app?.plans ?? []).map(toDraft)); setManage(true); setAdding(false); setErr(null); };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const saveNew = () => {
    const p = fromDraft(draft);
    if (!p.name) { setErr("ใส่ชื่อแพ็กเกจก่อน"); return; }
    if (!(p.cost > 0)) { setErr("ใส่ราคามากกว่า 0"); return; }
    if (app?.plans.some((x) => x.name.toLowerCase() === p.name.toLowerCase())) { setErr(`มีแพ็กเกจ "${p.name}" อยู่แล้ว`); return; }
    void run(async () => {
      const saved = app ? await saveApp({ id: app.id, plans: [...app.plans, p] }) : await saveApp({ name, plans: [p] });
      setAdding(false);
      onPick(saved.plans.find((x) => x.name.toLowerCase() === p.name.toLowerCase()) ?? p, saved);
    });
  };

  const saveManage = () => {
    if (!app) return;
    const plans = rows.map(fromDraft);
    if (plans.some((p) => !p.name)) { setErr("ทุกแพ็กเกจต้องมีชื่อ"); return; }
    if (plans.some((p) => !(p.cost >= 0))) { setErr("ราคาต้องเป็นตัวเลขไม่ติดลบ"); return; }
    void run(async () => { await saveApp({ id: app.id, plans }); setManage(false); });
  };

  const updatePlanPrice = () => {
    if (!app || !selected) return;
    void run(async () => {
      await saveApp({ id: app.id, plans: app.plans.map((p) => (p.id === selected.id ? { ...p, cost: current.cost, currency: current.currency, billing_cycle: current.billing_cycle } : p)) });
    });
  };

  const info = lookup.info;

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-700">
          <Icon value="i:package" className="mr-1" />แพ็กเกจ{app ? `ของ ${app.name}` : ""}
        </span>
        <span className="flex items-center gap-1.5">
          {app && <SourceTag app={app} />}
          {app && app.plans.length > 0 && !manage && (
            <button type="button" onClick={openManage} className="h-7 px-2.5 text-xs border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">
              <Icon value="i:settings" className="mr-1" />จัดการ
            </button>
          )}
        </span>
      </div>

      {/* กำลังค้น / ผลค้นจากเว็บ */}
      {lookup.busy && (
        <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
          <Icon value="i:refresh" className="animate-spin" /> กำลังให้ AI ค้นข้อมูล “{name}” จากเว็บ… (ประมาณ 5–15 วินาที)
        </div>
      )}
      {lookup.error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{lookup.error}</div>}
      {info && !lookup.busy && (
        info.app ? (
          <div className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800 space-y-1">
            <div><Icon value="i:sparkles" className="mr-1" />AI ค้นเจอ {info.app.plans.length} แพ็กเกจ{info.merged ? " (เพิ่มเข้าแอปที่มีในคลังแล้ว)" : ""} · บันทึกเข้าคลังแล้ว ครั้งหน้าไม่ต้องค้นใหม่</div>
            {info.note && <div className="text-indigo-700/80">{info.note}</div>}
            <div className="text-amber-700"><Icon value="i:alert-triangle" className="mr-1" />ราคาจากเว็บอาจไม่ตรงกับที่จ่ายจริง (เช่น ซื้อผ่าน App Store เป็นเงินบาท) — ตรวจก่อนบันทึก</div>
            {info.citations.length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {info.citations.slice(0, 4).map((c) => (
                  <a key={c.url} href={c.url} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted hover:text-indigo-900 truncate max-w-[240px]">
                    <Icon value="i:external-link" className="mr-0.5" />{c.title || hostOf(c.url)}
                  </a>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            ไม่พบข้อมูลที่มั่นใจของ “{name}” {info.note ? `— ${info.note}` : ""} · ลองพิมพ์ชื่อให้เต็มขึ้น หรือเพิ่มแพ็กเกจเอง
          </div>
        )
      )}

      {/* ปุ่มแพ็กเกจ */}
      {app && app.plans.length > 0 && !manage && (
        <div className="flex flex-wrap gap-2">
          {app.plans.map((p) => {
            const on = selected?.id === p.id;
            return (
              <button key={p.id} type="button" onClick={() => onPick(p, app)}
                className={`flex flex-col items-start rounded-lg border px-3 py-1.5 text-left transition ${on ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200" : "border-slate-200 bg-white hover:border-indigo-300"}`}>
                <span className={`text-[13px] font-medium ${on ? "text-indigo-700" : "text-slate-800"}`}>{p.name}</span>
                <span className={`text-[11px] tabular-nums ${on ? "text-indigo-600" : "text-slate-500"}`}>{planPrice(p)}{perPerson ? " ต่อคน" : ""}</span>
              </button>
            );
          })}
          <button type="button" onClick={openAdd}
            className="flex items-center rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:border-indigo-300 hover:text-indigo-700">
            <Icon value="i:plus" className="mr-1" />เพิ่มแพ็กเกจ
          </button>
        </div>
      )}

      {/* ยังไม่มีในคลัง */}
      {!app && !lookup.busy && name.length >= 2 && !adding && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>ยังไม่มีแพ็กเกจของ “{name}” ในคลัง</span>
          <button type="button" onClick={openAdd} className="h-7 px-2.5 border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">
            <Icon value="i:plus" className="mr-1" />เพิ่มแพ็กเกจเอง
          </button>
          <button type="button" onClick={onLookup} className="h-7 px-2.5 border border-indigo-200 rounded-md text-indigo-700 bg-indigo-50 hover:bg-indigo-100">
            <Icon value="i:sparkles" className="mr-1" />หาจากเว็บ (AI)
          </button>
        </div>
      )}
      {!app && name.length < 2 && <p className="text-[11px] text-slate-400">พิมพ์ชื่อแอปด้านบน — มีในคลังจะขึ้นให้เลือก ไม่มีให้ AI ค้นจากเว็บได้</p>}

      {/* เพิ่มแพ็กเกจ */}
      {adding && (
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5 space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-[1.4fr_1fr_0.8fr_1fr_auto] gap-2 items-end">
            <PlanCell label="ชื่อแพ็กเกจ"><input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="เช่น Plus, Pro รายปี" className={`${CELL} w-full`} /></PlanCell>
            <PlanCell label={perPerson ? "ราคาต่อคน" : "ราคา"}><input type="number" step="0.01" min="0" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} className={`${CELL} w-full tabular-nums`} /></PlanCell>
            <PlanCell label="สกุลเงิน"><CurrencySelect value={draft.currency} onChange={(v) => setDraft({ ...draft, currency: v })} /></PlanCell>
            <PlanCell label="รอบบิล"><CycleSelect value={draft.billing_cycle} onChange={(v) => setDraft({ ...draft, billing_cycle: v })} /></PlanCell>
            <span className="flex gap-1.5 col-span-2 md:col-span-1">
              <button type="button" disabled={busy} onClick={saveNew} className="h-8 px-3 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">{busy ? "…" : "บันทึก"}</button>
              <button type="button" onClick={() => setAdding(false)} className="h-8 px-2.5 text-xs border border-slate-200 rounded-md bg-white hover:bg-slate-50">ยกเลิก</button>
            </span>
          </div>
          <p className="text-[11px] text-slate-400">แพ็กเกจนี้จะขึ้นให้เลือกในทุกรายการชื่อ “{app?.name ?? name}”</p>
        </div>
      )}

      {/* จัดการแพ็กเกจ */}
      {manage && app && (
        <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5 space-y-2">
          {rows.map((r, i) => (
            <div key={r.id} className="grid grid-cols-2 md:grid-cols-[1.4fr_1fr_0.8fr_1fr_auto] gap-2 items-center">
              <input value={r.name} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={`${CELL} w-full`} aria-label="ชื่อแพ็กเกจ" />
              <input type="number" step="0.01" min="0" value={r.cost} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} className={`${CELL} w-full tabular-nums`} aria-label="ราคา" />
              <CurrencySelect value={r.currency} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, currency: v } : x)))} />
              <CycleSelect value={r.billing_cycle} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, billing_cycle: v } : x)))} />
              <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} title="ลบแพ็กเกจนี้" aria-label="ลบแพ็กเกจนี้"
                className="h-8 w-8 flex items-center justify-center border border-red-200 text-red-600 rounded-md bg-white hover:bg-red-50">
                <Icon value="i:trash" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-400">แก้ราคาที่นี่ไม่เปลี่ยนราคาในรายการที่บันทึกไว้แล้ว (จะขึ้นเตือนให้กดอัปเดตเอง)</span>
            <span className="flex gap-1.5">
              <button type="button" disabled={busy} onClick={saveManage} className="h-8 px-3 text-xs font-medium bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50">{busy ? "…" : "บันทึกแพ็กเกจ"}</button>
              <button type="button" onClick={() => setManage(false)} className="h-8 px-2.5 text-xs border border-slate-200 rounded-md bg-white hover:bg-slate-50">ยกเลิก</button>
            </span>
          </div>
        </div>
      )}

      {/* เลือกแพ็กเกจแล้ว */}
      {planName && !manage && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {selected
            ? <span className="text-emerald-700"><Icon value="i:circle-check" className="mr-1" />แพ็กเกจ {selected.name}</span>
            : <span className="text-slate-500">แพ็กเกจที่เลือกไว้: {planName} (ไม่อยู่ในคลังแล้ว)</span>}
          <button type="button" onClick={onClear} className="text-slate-400 hover:text-red-600 hover:underline">ไม่ใช้แพ็กเกจ</button>
        </div>
      )}
      {mismatch && selected && !manage && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          <span><Icon value="i:alert-triangle" className="mr-1" />ราคาในรายการไม่ตรงแพ็กเกจ {selected.name} ({planPrice(selected)})</span>
          <button type="button" onClick={() => app && onPick(selected, app)} className="h-7 px-2.5 border border-amber-300 rounded-md bg-white hover:bg-amber-100">ใช้ราคาแพ็กเกจ</button>
          <button type="button" disabled={busy} onClick={updatePlanPrice} className="h-7 px-2.5 border border-amber-300 rounded-md bg-white hover:bg-amber-100 disabled:opacity-50">
            อัปเดตราคา {selected.name} เป็น {planPrice(current)}
          </button>
        </div>
      )}
      {err && <div className="text-xs text-red-600">{err}</div>}
    </div>
  );
}

function SourceTag({ app }: { app: CatalogApp }) {
  if (app.source !== "ai") return null;
  const d = app.looked_up_at ? new Date(app.looked_up_at).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "";
  return <span className="text-[11px] text-slate-400" title="ข้อมูลแพ็กเกจจาก AI ค้นเว็บ — ตรวจราคาก่อนใช้"><Icon value="i:sparkles" className="mr-0.5" />AI ค้นเว็บ{d ? ` · ${d}` : ""}</span>;
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function PlanCell({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[11px] text-slate-500 mb-0.5">{label}</span>{children}</label>;
}

function CurrencySelect({ value, onChange }: { value: Currency; onChange: (v: Currency) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Currency)} className={`${CELL} w-full`} aria-label="สกุลเงิน">
      {(["THB", "USD", "EUR"] as Currency[]).map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  );
}

function CycleSelect({ value, onChange }: { value: BillingCycle; onChange: (v: BillingCycle) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as BillingCycle)} className={`${CELL} w-full`} aria-label="รอบบิล">
      {(["monthly", "yearly", "one-time"] as BillingCycle[]).map((c) => <option key={c} value={c}>{CYCLE_LABEL[c]}</option>)}
    </select>
  );
}
