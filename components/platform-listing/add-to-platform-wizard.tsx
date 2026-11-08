"use client";

/**
 * ตัวช่วยลงสินค้าขึ้นร้าน (ของกลาง) — เจ้าของเลือก flow "เข้าได้ 2 ทาง ใช้ตัวช่วยตัวเดียว" (2026-11-08)
 * --------------------------------------------------------------------------
 * ใช้ที่: หน้าสินค้าบนแพลตฟอร์ม (มุมมองหน้าร้าน แท็บ "ยังไม่ลง") · Parent SKU (แท็บแพลตฟอร์ม "ลงร้านนี้" + ติ๊กหลายตัวในหน้ารายการ)
 * 4 ขั้น: เลือกร้าน → ตรวจความครบ → แก้เลย / สร้างงานเติม / ข้าม → ยืนยัน + ติดตามผล
 *
 * ของเดิมที่ใช้ (ไม่ทำซ้ำ):
 *   ตรวจ = GET /api/product-platforms/readiness?parent_sku_ids= (+on_shop) · บันทึกร่าง = POST /api/product-platforms/prepare
 *   ลงจริง = POST /api/line-shopping/create-product (เฉพาะร้านที่มีตัวเชื่อมจริง — ตอนนี้ LINE) · แก้ = ProductPlatformManager
 *   สร้างงาน = CreateTaskModal (presetProducts) · ป๊อป = ERPModal · กฎตัดสิน = lib/platform-add-plan (pure + เทสต์)
 * กันซ้ำ: ข้ามตัวที่มีบนร้านแล้ว (on_shop / ร่างมีรหัส) · ลงจริงทีละตัว · server ล็อกระหว่างสร้าง · ลงจริง > 20 ต้องพิมพ์ยืนยัน
 * สิทธิ์: บันทึกร่าง = products.platforms.edit · ลงจริง = products.platforms.publish · สร้างงาน = tasks.create
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { PlatformIcon } from "@/components/platform-icon";
import { Icon } from "@/components/icon";
import { LoadingState } from "@/components/state-views";
import { isSellingPlatform } from "@/lib/selling-platforms";
import { normalizePriceRule } from "@/lib/platform-listing-builder";
import type { ParentSkuPickerValue } from "@/components/pickers";
import {
  ADD_CONFIRM_WORD, ADD_DECISION_LABEL, ADD_MAX_ITEMS, decideAdd, isOnShop, missingList, needsTypedConfirm, summarizePlan,
  type AddDecision, type AddReadinessRow,
} from "@/lib/platform-add-plan";

const ProductPlatformManager = dynamic(() => import("@/components/product-platform-manager").then((m) => m.ProductPlatformManager), { ssr: false });
const CreateTaskModal = dynamic(() => import("@/app/tasks/create-task-modal").then((m) => m.CreateTaskModal), { ssr: false });

/** ร้านที่ลงจริงได้แล้ว → ปลายทางสร้างสินค้า (ร้านอื่น = บันทึกร่างอย่างเดียวจนกว่าจะต่อตัวเชื่อม) */
const REAL_CREATE_ENDPOINT: Record<string, string> = { line_shopping: "/api/line-shopping/create-product" };

type Pf = { id: string; code: string; name_th: string; icon_key: string | null; can_publish?: boolean };
export type AddWizardParent = { id: string; code: string; name: string | null };
type Outcome = { parent_id: string; platform: string; ok: boolean; text: string };
const STEPS = ["เลือกร้าน", "ตรวจความครบ", "แก้ / ส่งงาน", "ยืนยัน"];

export function AddToPlatformWizard({ open, onClose, onDone, parents, brandId, initialPlatformCodes = [] }: {
  open: boolean;
  onClose: () => void;
  /** ลงเสร็จ (มีอะไรเปลี่ยน) — ให้หน้าแม่โหลดใหม่ */
  onDone?: () => void;
  parents: AddWizardParent[];
  /** แบรนด์ของสินค้า (ใช้เลือกไว้ให้ในป๊อปสร้างงาน) */
  brandId?: string | null;
  /** ร้านที่ติ๊กไว้ให้ก่อน (code) */
  initialPlatformCodes?: string[];
}) {
  const { can } = useAuth();
  const toast = useToast();
  const canEdit = can("products.platforms.edit");
  const canPublish = can("products.platforms.publish" as Parameters<typeof can>[0]);
  const canTask = can("tasks.create" as Parameters<typeof can>[0]);

  const list = useMemo(() => parents.slice(0, ADD_MAX_ITEMS), [parents]);
  const [step, setStep] = useState(1);
  const [pfs, setPfs] = useState<Pf[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());          // platform code
  const [real, setReal] = useState<Set<string>>(new Set());              // code ที่เลือก "ลงจริง"
  const [mode, setMode] = useState<"same" | "pct">("same");
  const [pct, setPct] = useState("5");
  const [overwrite, setOverwrite] = useState(false);
  const [rows, setRows] = useState<Record<string, AddReadinessRow[]>>({}); // code → แถว
  const [checking, setChecking] = useState(false);
  const [checkErr, setCheckErr] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());       // parent id ที่ผู้ใช้กดข้าม
  const [typed, setTyped] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: "" });
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [fixFor, setFixFor] = useState<{ parentId: string; platformId: string } | null>(null);
  const [taskFor, setTaskFor] = useState<ParentSkuPickerValue[] | null>(null);
  const stopRef = useRef(false);

  // เปิดใหม่ = เริ่มขั้น 1 · ติ๊กร้านที่ส่งมาให้ · ร้านลงจริงได้ + มีสิทธิ์ = ติ๊ก "ลงจริง" ไว้ให้
  useEffect(() => {
    if (!open) return;
    setStep(1); setRows({}); setSkipped(new Set()); setTyped(""); setOutcomes(null); setCheckErr(null); setProgress({ done: 0, total: 0, label: "" });
    let alive = true;
    apiFetch(`/api/platform-accounts${brandId ? `?brand_id=${encodeURIComponent(brandId)}` : ""}`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      const sel = ((j.platforms ?? []) as Pf[]).filter((p) => isSellingPlatform(p.code));
      setPfs(sel);
      const init = new Set(initialPlatformCodes.filter((c) => sel.some((p) => p.code === c)));
      setPicked(init);
      setReal(new Set(sel.filter((p) => init.has(p.code) && p.can_publish && REAL_CREATE_ENDPOINT[p.code] && canPublish).map((p) => p.code)));
    }).catch(() => { if (alive) setPfs([]); });
    return () => { alive = false; };
  }, [open]);   // eslint-disable-line react-hooks/exhaustive-deps

  const pickedPfs = useMemo(() => (pfs ?? []).filter((p) => picked.has(p.code)), [pfs, picked]);
  const realOk = (p: Pf) => !!p.can_publish && !!REAL_CREATE_ENDPOINT[p.code] && canPublish;

  // ---------- ขั้น 2: ตรวจความครบ (เฉพาะสินค้าที่เลือก ทีละร้าน) ----------
  const check = useCallback(async () => {
    setChecking(true); setCheckErr(null);
    try {
      const ids = list.map((p) => p.id).join(",");
      const res = await Promise.all(pickedPfs.map(async (p) => {
        const j = await apiFetch(`/api/product-platforms/readiness?platform_code=${encodeURIComponent(p.code)}&parent_sku_ids=${encodeURIComponent(ids)}`).then((r) => r.json());
        if (j.error) throw new Error(`${p.name_th}: ${j.error}`);
        return [p.code, (j.data ?? []) as AddReadinessRow[]] as const;
      }));
      setRows(Object.fromEntries(res));
    } catch (e) { setCheckErr((e as Error).message || "ตรวจไม่สำเร็จ"); }
    finally { setChecking(false); }
  }, [list, pickedPfs]);

  const goNext = async () => {
    if (step === 1) {
      if (!pickedPfs.length) { toast.warning("เลือกร้านอย่างน้อย 1 ร้าน"); return; }
      setStep(2); await check(); return;
    }
    setStep((s) => Math.min(4, s + 1));
  };

  // ---------- แผน (ต่อร้าน × สินค้า) ----------
  const plan = useMemo(() => {
    const out: { pf: Pf; row: AddReadinessRow; decision: AddDecision }[] = [];
    for (const p of pickedPfs) for (const r of rows[p.code] ?? []) out.push({ pf: p, row: r, decision: decideAdd(r, real.has(p.code) && realOk(p), skipped.has(r.id)) });
    return out;
  }, [pickedPfs, rows, real, skipped]);   // eslint-disable-line react-hooks/exhaustive-deps
  const summary = summarizePlan(plan.map((x) => x.decision));
  const needTyped = needsTypedConfirm(summary.publish);
  const problemParents = useMemo(() => {
    const m = new Map<string, { row: AddReadinessRow; pfs: { pf: Pf; missing: string[] }[] }>();
    for (const x of plan) {
      if (isOnShop(x.row) || x.row.ready_now) continue;
      const cur = m.get(x.row.id) ?? { row: x.row, pfs: [] };
      cur.pfs.push({ pf: x.pf, missing: missingList(x.row.missing) });
      m.set(x.row.id, cur);
    }
    return [...m.values()];
  }, [plan]);

  // ---------- ขั้น 4: ลง ----------
  const run = async () => {
    if (needTyped && typed.trim() !== ADD_CONFIRM_WORD) { toast.warning(`พิมพ์ "${ADD_CONFIRM_WORD}" ก่อนลงจริง`); return; }
    setRunning(true); stopRef.current = false;
    const res: Outcome[] = [];
    const rule = normalizePriceRule({ mode, pct: Number(pct) });
    const toCreate: { pf: Pf; id: string }[] = [];
    try {
      // 1) บันทึกร่าง (ทุกตัวที่ไม่ข้าม) — ร่างคือสิ่งที่ "ลงจริง" ใช้ส่งขึ้นร้าน
      const prepTotal = plan.filter((x) => x.decision === "prepare" || x.decision === "publish").length;
      let done = 0;
      setProgress({ done: 0, total: prepTotal, label: "กำลังบันทึกร่าง" });
      for (const p of pickedPfs) {
        const mine = plan.filter((x) => x.pf.code === p.code && (x.decision === "prepare" || x.decision === "publish"));
        for (let i = 0; i < mine.length; i += 100) {
          const chunk = mine.slice(i, i + 100);
          const r = await apiFetch("/api/product-platforms/prepare", { method: "POST", body: JSON.stringify({ platform_code: p.code, parent_sku_ids: chunk.map((x) => x.row.id), price_rule: rule, overwrite }) });
          const j = await r.json();
          if (j.error) { for (const x of chunk) res.push({ parent_id: x.row.id, platform: p.name_th, ok: false, text: `บันทึกร่างไม่สำเร็จ: ${j.error}` }); }
          else {
            for (const it of (j.results ?? []) as { parent_sku_id: string; result: string; ready: boolean; blockers?: string[] }[]) {
              const x = chunk.find((c) => c.row.id === it.parent_sku_id);
              if (!x) continue;
              if (it.result === "skipped_listed") { res.push({ parent_id: x.row.id, platform: p.name_th, ok: true, text: "มีบนร้านแล้ว — ข้าม" }); continue; }
              if (x.decision === "publish" && it.ready) toCreate.push({ pf: p, id: x.row.id });
              else res.push({ parent_id: x.row.id, platform: p.name_th, ok: true, text: it.ready ? "บันทึกร่างแล้ว · พร้อมลง" : ((it.blockers ?? []).length ? `บันทึกร่างแล้ว · ยังขาด ${(it.blockers ?? []).length} ข้อ` : "บันทึกร่างแล้ว · ยังขาดข้อมูล") });
            }
          }
          done += chunk.length; setProgress({ done, total: prepTotal, label: "กำลังบันทึกร่าง" });
        }
      }
      // 2) ลงจริง ทีละตัว (กันกดรัว + server ล็อกซ้ำอีกชั้น) · กดหยุดได้ระหว่างทาง
      setProgress({ done: 0, total: toCreate.length, label: "กำลังลงบนร้าน" });
      for (let i = 0; i < toCreate.length; i++) {
        const { pf, id } = toCreate[i];
        if (stopRef.current) { res.push({ parent_id: id, platform: pf.name_th, ok: false, text: "หยุดก่อนลง (บันทึกร่างไว้แล้ว)" }); continue; }
        try {
          const r = await apiFetch(REAL_CREATE_ENDPOINT[pf.code], { method: "POST", body: JSON.stringify({ parent_sku_id: id }) });
          const j = await r.json();
          if (j.error || j.ok === false) res.push({ parent_id: id, platform: pf.name_th, ok: false, text: `ลงไม่สำเร็จ: ${j.error ?? "ไม่ทราบสาเหตุ"}` });
          else res.push({ parent_id: id, platform: pf.name_th, ok: true, text: `ลงบนร้านแล้ว${j.product_id ? ` (#${j.product_id})` : ""}` });
        } catch (e) { res.push({ parent_id: id, platform: pf.name_th, ok: false, text: `ลงไม่สำเร็จ: ${(e as Error).message}` }); }
        setProgress({ done: i + 1, total: toCreate.length, label: "กำลังลงบนร้าน" });
      }
      for (const x of plan) if (x.decision.startsWith("skip")) res.push({ parent_id: x.row.id, platform: x.pf.name_th, ok: x.decision === "skip_listed", text: ADD_DECISION_LABEL[x.decision] });
    } finally {
      setRunning(false);
      setOutcomes(res);
      onDone?.();
    }
  };

  // ---------- แสดงผล ----------
  const nameOf = (id: string) => { const p = list.find((x) => x.id === id); return p ? `${p.code}${p.name ? ` · ${p.name}` : ""}` : id; };
  const fails = outcomes?.filter((o) => !o.ok) ?? [];
  const lineFail = fails.some((o) => o.text.startsWith("ลงไม่สำเร็จ"));
  const title = outcomes ? "ผลการลงสินค้า" : `ลงสินค้า · ${list.length.toLocaleString()} สินค้า`;

  const footer = outcomes ? (
    <div className="flex justify-end"><button type="button" onClick={onClose} className="h-9 px-4 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700">ปิด</button></div>
  ) : (
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1 || running} className="h-9 px-3 text-sm rounded-lg border border-slate-200 hover:bg-slate-50 disabled:invisible">ย้อนกลับ</button>
      <span className="text-xs text-slate-500">ขั้น {step}/4 · {STEPS[step - 1]}</span>
      {step < 4 ? (
        <button type="button" onClick={() => void goNext()} disabled={checking || (step === 1 && !pfs)} className="h-9 px-4 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">ถัดไป</button>
      ) : running ? (
        <button type="button" onClick={() => { stopRef.current = true; }} className="h-9 px-4 text-sm rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50">หยุด</button>
      ) : (
        <button type="button" onClick={() => void run()} disabled={!canEdit || summary.publish + summary.prepare === 0} className="h-9 px-4 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
          {summary.publish > 0 ? `ลงสินค้า (${summary.publish.toLocaleString()} ลงจริง)` : `บันทึกร่าง (${summary.prepare.toLocaleString()})`}
        </button>
      )}
    </div>
  );

  return (
    <>
      <ERPModal open={open} onClose={() => { if (!running) onClose(); }} title={title} size="lg" footer={footer}
        closeOnBackdrop={false} hasUnsavedChanges={running} storageKey="add-to-platform-wizard"
        description={parents.length > ADD_MAX_ITEMS ? `เลือกมา ${parents.length.toLocaleString()} ตัว — ลงได้ครั้งละ ${ADD_MAX_ITEMS} ตัว (ใช้ ${ADD_MAX_ITEMS} ตัวแรก)` : undefined}>
        {!outcomes && (
          <ol className="flex items-center gap-1.5 mb-3 text-xs">
            {STEPS.map((s, i) => (
              <li key={s} className={`inline-flex items-center gap-1.5 ${i + 1 === step ? "text-violet-700 font-medium" : i + 1 < step ? "text-emerald-700" : "text-slate-400"}`}>
                <span className={`h-5 w-5 rounded-full border inline-flex items-center justify-center ${i + 1 === step ? "border-violet-400 bg-violet-50" : i + 1 < step ? "border-emerald-300 bg-emerald-50" : "border-slate-200"}`}>{i + 1 < step ? <Icon name="done" /> : i + 1}</span>
                {s}{i < STEPS.length - 1 && <span className="w-4 h-px bg-slate-200 ml-1" />}
              </li>
            ))}
          </ol>
        )}

        {outcomes ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="text-emerald-700">สำเร็จ {(outcomes.length - fails.length).toLocaleString()}</span>
              {fails.length > 0 && <span className="text-rose-700">ไม่สำเร็จ {fails.length.toLocaleString()}</span>}
            </div>
            {lineFail && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">ตัวที่ลงไม่สำเร็จ: ถ้าไม่แน่ใจว่าร้านสร้างไปแล้วหรือยัง ให้กด &quot;ดึงสินค้าจากร้าน&quot; ก่อนลองใหม่ — ระบบจะไม่สร้างซ้ำตัวที่จับคู่บนร้านแล้ว</p>
            )}
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[50vh] overflow-auto">
              {outcomes.map((o, i) => (
                <div key={`${o.parent_id}-${o.platform}-${i}`} className="flex items-start gap-2 px-3 py-2 text-sm">
                  <span className={o.ok ? "text-emerald-600" : "text-rose-600"}><Icon name={o.ok ? "done" : "warning"} /></span>
                  <div className="min-w-0 flex-1"><div className="truncate">{nameOf(o.parent_id)}</div><div className="text-xs text-slate-500">{o.platform} · {o.text}</div></div>
                </div>
              ))}
            </div>
          </div>
        ) : step === 1 ? (
          !pfs ? <LoadingState label="กำลังโหลดร้าน..." /> : (
            <div className="space-y-3">
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                {pfs.map((p) => {
                  const on = picked.has(p.code);
                  const canReal = realOk(p);
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-2.5 px-3 py-2.5">
                      <label className="flex items-center gap-2 flex-1 min-w-[10rem] cursor-pointer">
                        <input type="checkbox" checked={on} onChange={() => setPicked((s) => { const n = new Set(s); if (n.has(p.code)) n.delete(p.code); else n.add(p.code); return n; })} />
                        <PlatformIcon code={p.code} iconKey={p.icon_key} size={18} /><span className="text-sm">{p.name_th}</span>
                      </label>
                      {p.can_publish && REAL_CREATE_ENDPOINT[p.code] ? (
                        canPublish ? (
                          <select value={real.has(p.code) ? "real" : "draft"} disabled={!on}
                            onChange={(e) => setReal((s) => { const n = new Set(s); if (e.target.value === "real") n.add(p.code); else n.delete(p.code); return n; })}
                            className="h-8 border border-slate-200 rounded-md px-2 text-xs bg-white disabled:opacity-50">
                            <option value="real">ลงบนร้านจริง</option>
                            <option value="draft">บันทึกร่างอย่างเดียว</option>
                          </select>
                        ) : <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">บันทึกร่าง · ลงจริงต้องมีสิทธิ์ลงขาย</span>
                      ) : <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">บันทึกร่าง · ยังลงจริงไม่ได้ (ยังไม่ต่อตัวเชื่อม)</span>}
                      {on && canReal && real.has(p.code) && <span className="basis-full text-[11px] text-emerald-700 pl-6">สร้างสินค้าบนร้านจริงทีละตัว แล้วจับคู่ให้อัตโนมัติ</span>}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-500">ราคาบนร้าน</span>
                <select value={mode} onChange={(e) => setMode(e.target.value as "same" | "pct")} className="h-8 border border-slate-200 rounded-md px-2 text-sm bg-white">
                  <option value="same">ใช้ราคาขายในระบบ</option>
                  <option value="pct">บวกเพิ่ม % (ปัดขึ้น)</option>
                </select>
                {mode === "pct" && <input value={pct} onChange={(e) => setPct(e.target.value.replace(/[^0-9.]/g, ""))} className="h-8 w-16 border border-slate-200 rounded-md px-2 text-sm" aria-label="บวกเพิ่มกี่เปอร์เซ็นต์" />}
                <span className="text-slate-500 ml-2">ร่างเดิม</span>
                <select value={overwrite ? "1" : "0"} onChange={(e) => setOverwrite(e.target.value === "1")} className="h-8 border border-slate-200 rounded-md px-2 text-sm bg-white">
                  <option value="0">เติมเฉพาะช่องที่ว่าง</option>
                  <option value="1">เขียนทับด้วยข้อมูลในระบบ</option>
                </select>
              </div>
              {!canEdit && <p className="text-xs text-rose-700">คุณไม่มีสิทธิ์บันทึกร่าง/ลงสินค้า (ดูความครบได้อย่างเดียว)</p>}
            </div>
          )
        ) : step === 2 ? (
          checking ? <LoadingState label="กำลังตรวจความครบ..." /> : checkErr ? (
            <div className="text-sm text-rose-700 space-y-2"><p>{checkErr}</p><button type="button" onClick={() => void check()} className="h-8 px-3 text-sm border border-slate-200 rounded-lg">ลองใหม่</button></div>
          ) : (
            <div className="space-y-3">
              {pickedPfs.map((p) => {
                const rs = rows[p.code] ?? [];
                const shop = rs.filter(isOnShop).length;
                const ok = rs.filter((r) => !isOnShop(r) && r.ready_now).length;
                return (
                  <div key={p.id} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2 bg-slate-50 px-3 py-2 text-sm">
                      <PlatformIcon code={p.code} iconKey={p.icon_key} size={16} /><span className="font-medium">{p.name_th}</span>
                      <span className="text-xs text-emerald-700">พร้อม {ok.toLocaleString()}</span>
                      <span className="text-xs text-rose-700">ขาดข้อมูล {(rs.length - ok - shop).toLocaleString()}</span>
                      {shop > 0 && <span className="text-xs text-slate-500">มีบนร้านแล้ว {shop.toLocaleString()} (ข้ามให้)</span>}
                    </div>
                    <div className="divide-y divide-slate-100 max-h-[40vh] overflow-auto">
                      {rs.map((r) => (
                        <div key={r.id} className="flex items-start gap-2 px-3 py-1.5 text-sm">
                          <span className={isOnShop(r) ? "text-slate-400" : r.ready_now ? "text-emerald-600" : "text-rose-600"}><Icon name={isOnShop(r) ? "store" : r.ready_now ? "done" : "warning"} /></span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate">{r.name || r.code} <span className="text-[11px] text-slate-400 font-mono">{r.code}</span></div>
                            <div className="text-xs text-slate-500">{isOnShop(r) ? "มีบนร้านแล้ว — ไม่ลงซ้ำ" : r.ready_now ? (r.warnings ? `พร้อม · ควรเติม: ${r.warnings}` : "พร้อมลง") : `ขาด: ${r.missing}`}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : step === 3 ? (
          problemParents.length === 0 ? (
            <p className="text-sm text-emerald-700 py-6 text-center">ทุกตัวพร้อมแล้ว (หรือมีบนร้านแล้ว) — กดถัดไป</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">ตัวที่ข้อมูลยังไม่ครบจะไม่ถูกลงจริง (บันทึกร่างได้) — แก้เลย หรือส่งงานให้ทีมเติม แล้วกด &quot;ตรวจใหม่&quot;</p>
                <div className="flex gap-2">
                  {canTask && <button type="button" onClick={() => setTaskFor(problemParents.map((x) => ({ id: x.row.id, code: x.row.code, name: x.row.name || x.row.code })))} className="h-8 px-3 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1"><Icon name="add" />สร้างงานเติมทั้งหมด ({problemParents.length})</button>}
                  <button type="button" onClick={() => void check()} disabled={checking} className="h-8 px-3 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 inline-flex items-center gap-1 disabled:opacity-50"><Icon name="refresh" />ตรวจใหม่</button>
                </div>
              </div>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-[50vh] overflow-auto">
                {problemParents.map(({ row, pfs: ps }) => {
                  const sk = skipped.has(row.id);
                  return (
                    <div key={row.id} className={`flex flex-wrap items-start gap-2 px-3 py-2 text-sm ${sk ? "opacity-50" : ""}`}>
                      <span className="text-rose-600 mt-0.5"><Icon name="warning" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{row.name || row.code} <span className="text-[11px] text-slate-400 font-mono">{row.code}</span></div>
                        {ps.map(({ pf, missing }) => <div key={pf.code} className="text-xs text-rose-700">{pf.name_th}: ขาด {missing.join(" · ")}</div>)}
                      </div>
                      <div className="flex flex-wrap gap-1 justify-end">
                        {canEdit && <button type="button" onClick={() => setFixFor({ parentId: row.id, platformId: ps[0].pf.id })} className="h-7 px-2 text-xs border border-slate-200 rounded-md hover:bg-slate-50 inline-flex items-center gap-1"><Icon name="edit" />แก้เลย</button>}
                        {canTask && <button type="button" onClick={() => setTaskFor([{ id: row.id, code: row.code, name: row.name || row.code }])} className="h-7 px-2 text-xs border border-slate-200 rounded-md hover:bg-slate-50 inline-flex items-center gap-1"><Icon name="add" />สร้างงานเติม</button>}
                        <button type="button" onClick={() => setSkipped((s) => { const n = new Set(s); if (n.has(row.id)) n.delete(row.id); else n.add(row.id); return n; })} className="h-7 px-2 text-xs border border-slate-200 rounded-md hover:bg-slate-50">{sk ? "เอากลับมา" : "ข้ามตัวนี้"}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          <div className="space-y-3 text-sm">
            {running ? (
              <div className="space-y-2 py-4">
                <div className="text-slate-600">{progress.label} {progress.done.toLocaleString()}/{progress.total.toLocaleString()}</div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-violet-500 transition-all" style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} /></div>
                <p className="text-xs text-slate-400">ห้ามปิดหน้าระหว่างลง · กด &quot;หยุด&quot; ได้ (ตัวที่ยังไม่ลงจะบันทึกร่างไว้)</p>
              </div>
            ) : (
              <>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {pickedPfs.map((p) => {
                    const mine = plan.filter((x) => x.pf.code === p.code);
                    const s = summarizePlan(mine.map((x) => x.decision));
                    return (
                      <div key={p.id} className="px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="inline-flex items-center gap-1.5 font-medium"><PlatformIcon code={p.code} iconKey={p.icon_key} size={16} />{p.name_th}</span>
                        {s.publish > 0 && <span className="text-emerald-700">ลงบนร้านจริง {s.publish.toLocaleString()}</span>}
                        {s.prepare > 0 && <span className="text-sky-700">บันทึกร่าง {s.prepare.toLocaleString()}</span>}
                        {s.skip_listed > 0 && <span className="text-slate-500">มีบนร้านแล้ว {s.skip_listed.toLocaleString()}</span>}
                        {s.skip_missing > 0 && <span className="text-rose-700">ข้าม (ไม่ครบ) {s.skip_missing.toLocaleString()}</span>}
                        {s.skip_user > 0 && <span className="text-slate-500">เลือกไม่ลง {s.skip_user.toLocaleString()}</span>}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-500">ตัวที่มีบนร้านแล้ว/กำลังลงอยู่ ระบบข้ามให้เอง · ทุกตัวบันทึกประวัติว่าใครลงอะไร{summary.publish > 0 ? " · ลงจริงทีละตัว (ร้านใหญ่อาจใช้เวลาหลายนาที)" : ""}</p>
                {needTyped && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-rose-700">ลงจริง {summary.publish.toLocaleString()} ตัว — พิมพ์ &quot;{ADD_CONFIRM_WORD}&quot; เพื่อเริ่ม</span>
                    <input value={typed} onChange={(e) => setTyped(e.target.value)} className="h-8 w-32 border border-slate-200 rounded-md px-2 text-sm" aria-label="พิมพ์คำยืนยัน" />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </ERPModal>

      {fixFor && (
        <ProductPlatformManager parentSkuId={fixFor.parentId} initialPlatformId={fixFor.platformId} canEdit={canEdit} canPublish={false}
          onClose={() => { setFixFor(null); void check(); }} />
      )}
      {taskFor && (
        <CreateTaskModal open onClose={() => setTaskFor(null)} pushToast={(type, m) => toast.show(m, type)}
          onCreated={(r) => { setTaskFor(null); toast.action(`สร้างงาน ${r.task_no} แล้ว`, "เปิดงาน", () => window.open(`/tasks?task=${r.id}`, "_blank")); }}
          presetProducts={{ brandId: brandId || null, parents: taskFor, platforms: pickedPfs.map((p) => p.code) }} />
      )}
    </>
  );
}
