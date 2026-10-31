"use client";

/**
 * ✏️ ป๊อป "แก้ไข" ของโหมดอัปเดตงาน — แก้สิ่งที่บันทึกไปแล้ว รวมขั้นก่อนหน้าที่เคยข้าม
 *
 * เรียงตามขั้นจริง: ซื้อของ → เตรียม → ตัด → ใบจ่าย → รอบส่งคืน → ของบนชั้น QC → ลดจำนวน → ประวัติ
 * แก้แล้วโชว์ "ก่อน → หลัง" ก่อนบันทึก · ระบบกันข้อมูลขัดกัน (เช่น ลดใบจ่ายต่ำกว่าที่ช่างส่งคืน = ต้องแก้รอบส่งคืนก่อน)
 * กติกา/ตัวบันทึก = ./catch-up-edit-plan.ts (ceBuild / ceRun) · ลดจำนวน = ของกลาง ./catch-up-reduce.tsx + lib/mo-qty-reduce
 * สิทธิ์: แก้ได้เฉพาะคนที่ "บันทึกได้เลย" หรือ "ยืนยันคำขอ" — คนอื่นเปิดดูได้อย่างเดียว · ส่งออก/ปิด/ยกเลิก ยังย้อนไม่ได้
 * ลดใบจ่ายต่ำกว่ายอดที่ช่างคืนแล้ว = กล่องเหลือง "แก้ตามให้ทั้งชุด" (รอบส่งคืน/ของ QC/ที่เหลือ) — กติกา ceApplyCascade
 * ทุกใบจ่ายมีแถบ คืนแล้ว / ค้างช่าง + ค้างมากี่วัน (cuOutstanding) · ส่วนช่างส่งคืนมีปุ่ม "บันทึกส่งคืนเพิ่ม" → ป๊อปอัปเดตขั้นส่งคืน
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { isHireDesk } from "@/lib/work-entry-rules";
import type { Assignee } from "@/app/api/mo/assignees/route";
import type { CatchUpSnapshot } from "@/app/api/mo/catch-up/route";
import { cuDateText, cuWhen, cuDaysSince, cuOutstanding, CU_LATE_DAYS, type CuTargetKey } from "./catch-up";
import { ceInitial, ceBuild, ceRun, ymdTh, type CeForm, type CeOp, type CeRest } from "./catch-up-edit-plan";
import { REDUCE_REASONS, REDUCE_MODE_LABEL } from "@/lib/mo-qty-reduce";
import { ReducePanel } from "./catch-up-reduce";
import { CrewPick } from "./crew-pick";
import { DispatchDatePick } from "./dispatch-date-pick";

type DeptLite = { id: string; name: string };
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const r2 = (n: number) => Math.round(n * 100) / 100;
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
const inp = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500";
const lbl = "mb-0.5 block text-[11px] text-slate-500";
const WO_STATUS: Record<string, string> = { dispatched: "อยู่กับช่าง", partial_return: "ส่งคืนบางส่วน", done: "ส่งคืนครบ", cancelled: "ยกเลิก" };
const QC_STATUS: Record<string, string> = { good: "ของดี", defect: "ของเสีย", repairing: "ส่งซ่อม" };

/** 1 ขั้นในเส้นเวลา (อยู่นอกตัวป๊อป — ถ้าประกาศข้างใน ช่องกรอกจะหลุดโฟกัสทุกครั้งที่พิมพ์) */
const Step = ({ no, title, done, children, right }: { no: number; title: ReactNode; done?: boolean; children?: ReactNode; right?: ReactNode }) => (
  <section className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-2.5 border-t border-slate-100 py-3 first:border-0">
    <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${done ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{done ? <Icon name="done" /> : no}</span>
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-slate-800">{title}</span>{right}</div>
      {children}
    </div>
  </section>
);

export function CatchUpEdit({ moNo, onClose, onDone, departments, craftsmen, canEdit, onOpenUpdate }: {
  moNo: string | null;
  onClose: () => void;
  /** บันทึกการแก้แล้ว → หน้าแม่โหลดบอร์ดใหม่ */
  onDone: () => void;
  departments: DeptLite[]; craftsmen: Assignee[];
  /** แก้ได้ (สิทธิ์บันทึกได้เลย / ยืนยันคำขอ) — ไม่ได้ = ดูอย่างเดียว */
  canEdit: boolean;
  /** ไปป๊อปอัปเดต (พาใบไปขั้นถัดไป) */
  onOpenUpdate?: (moNo: string, target?: CuTargetKey) => void;
}) {
  const toast = useToast();
  const [snap, setSnap] = useState<CatchUpSnapshot | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [form, setForm] = useState<CeForm | null>(null);
  const [running, setRunning] = useState(-1);
  const [results, setResults] = useState<{ op: CeOp; ok: boolean; msg: string }[] | null>(null);
  const [n, setN] = useState(0);   // โหลดใหม่หลังบันทึก

  useEffect(() => {
    if (!moNo) return;
    setSnap(null); setLoadErr(""); setForm(null);
    if (n === 0) setResults(null);
    let alive = true;
    void (async () => {
      try {
        const r = await apiFetch(`/api/mo/catch-up?mo_no=${encodeURIComponent(moNo)}&edit=1`);
        const j = await r.json();
        if (!alive) return;
        if (!r.ok || j.error) throw new Error(j.error || "โหลดข้อมูลใบงานไม่สำเร็จ");
        const s = j.data as CatchUpSnapshot;
        setSnap(s); setForm(ceInitial(s));
      } catch (e) { if (alive) setLoadErr(e instanceof Error ? e.message : "โหลดข้อมูลใบงานไม่สำเร็จ"); }
    })();
    return () => { alive = false; };
  }, [moNo, n]);
  useEffect(() => { if (!moNo) { setN(0); setResults(null); } }, [moNo]);

  const deptOf = (id: string) => departments.find((d) => d.id === id) ?? null;
  const poolOf = (d: DeptLite | null) => (d ? (isHireDesk(d.name) ? craftsmen : craftsmen.filter((c) => c.department_id === d.id)) : []);
  const built = useMemo(() => (snap && form ? ceBuild(snap, form, { departments, people: craftsmen }) : null), [snap, form, departments, craftsmen]);
  const issues = built?.issues ?? [];
  const errs = issues.filter((x) => x.level === "error" && x.field !== "none");
  const ops = built?.ops ?? [];
  // แก้ตามให้ทั้งชุด — รอบส่งคืน/ของ QC ที่ระบบแก้ให้ โชว์ค่าหลังแก้ (แก้ช่องนั้นเองไม่ได้ จนกว่าจะปิดแก้ตามให้)
  const cascades = built?.cascades ?? [];
  const casSub = new Map(cascades.flatMap((c) => c.subs.map((x) => [x.id, x] as const)));
  const casQc = new Set(cascades.flatMap((c) => c.qcBack.map((x) => x.id)));
  const restTotal = cascades.reduce((a, c) => a + c.rest, 0);
  const setRest = (p: Partial<CeRest>) => setForm((f) => (f ? { ...f, rest: { ...f.rest, ...p } } : f));
  const ring = (field: string) => { const i = issues.find((x) => x.field === field && x.level === "error") ?? issues.find((x) => x.field === field); return !i ? "" : i.level === "error" ? " !border-rose-400 !bg-rose-50/40" : " !border-amber-400"; };
  const Msg = ({ field }: { field: string }): ReactNode => {
    const list = issues.filter((x) => x.field === field);
    return list.length ? <div className="mt-0.5 space-y-0.5">{list.map((x, i) => <div key={i} className={`text-[11px] ${x.level === "error" ? "text-rose-600" : "text-amber-700"}`}>{x.msg}</div>)}</div> : null;
  };
  const set = (p: Partial<CeForm>) => setForm((f) => (f ? { ...f, ...p } : f));
  const setWo = (id: string, p: Partial<CeForm["wos"][number]>) => setForm((f) => (f ? { ...f, wos: f.wos.map((w) => (w.id === id ? { ...w, ...p } : w)) } : f));
  const setSub = (id: string, p: Partial<CeForm["subs"][number]>) => setForm((f) => (f ? { ...f, subs: f.subs.map((x) => (x.id === id ? { ...x, ...p } : x)) } : f));
  const lock = !canEdit || running >= 0;

  const api = async (url: string, body: unknown, method: "POST" | "PATCH" | "DELETE" = "POST") => {
    const res = await apiFetch(url, method === "DELETE" ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j?.error) throw new Error(res.status === 401 || res.status === 403 ? "คุณไม่มีสิทธิ์แก้ส่วนนี้" : (j?.error || "บันทึกไม่สำเร็จ"));
    return j as Record<string, unknown>;
  };
  const save = async () => {
    if (!snap || !ops.length || errs.length) return;
    if (!(await askConfirm({ title: `บันทึกการแก้ไข ${ops.length} รายการ?`, confirmText: "บันทึก",
      message: <div className="space-y-1 text-sm"><div>ระบบจะแก้ทีละรายการตามลำดับนี้ (พัง = หยุด แล้วบอกว่าสำเร็จถึงไหน):</div>{ops.map((o, i) => <div key={i} className="text-slate-600">{i + 1}. {o.label}</div>)}</div> }))) return;
    setRunning(0);
    const res = await ceRun(ops, snap.mo.id, api, setRunning);
    setRunning(-1); setResults(res);
    if (res.some((x) => x.ok)) { onDone(); setN((x) => x + 1); }
    if (res.every((x) => x.ok)) toast.success(`แก้แล้ว ${res.length} รายการ`);
  };
  const revertReduce = async (changeId: string, label: string) => {
    if (!snap || !(await askConfirm({ title: "ย้อนการเปลี่ยนจำนวนนี้?", variant: "danger", confirmText: "ย้อนกลับ",
      message: <div className="space-y-1 text-sm"><div>{label}</div><div className="text-slate-500">คืนจำนวนเดิม + คืนยอดใบจ่ายที่ถูกลด · ใบที่แยกออกมา / ใบส่วนเกิน (ถ้ายังไม่เริ่มงาน) จะถูกเก็บเข้าคลัง</div></div> }))) return;
    try { await api(`/api/mo/${snap.mo.id}/reduce-qty`, { revert: changeId }); toast.success("ย้อนการเปลี่ยนจำนวนแล้ว"); onDone(); setN((x) => x + 1); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนไม่สำเร็จ"); }
  };

  const m = snap?.mo;
  const dirty = !!built && ops.length > 0;
  const mine = (snap?.qtyLog ?? []).filter((c) => !c.split_from && !c.reverted && c.mode !== "extra");   // แยกส่วนเกิน = ใบนี้จำนวนเดิม
  const origQty = mine.length ? mine[mine.length - 1].from : null;   // ล่าสุดก่อน → ตัวท้าย = ครั้งแรก
  const splitRow = (snap?.qtyLog ?? []).find((c) => c.split_from && !c.reverted);
  const splitFrom = splitRow?.mo_no ?? null;
  // จ่ายรวมหลังแก้ (ไว้เสนอ "เพิ่มจำนวนสั่ง" เมื่อจ่ายเกิน)
  const dispNow = form && snap ? snap.wos.reduce((a, w) => { const x = form.wos.find((y) => y.id === w.id); return x?.cancel ? a : a + (x && x.qty > 0 ? x.qty : w.qty); }, 0) : 0;
  const rateChanged = !!form && !!snap && form.wos.some((w) => { const o = snap.wos.find((x) => x.id === w.id); return !!o && Math.abs((w.rate ?? -1) - ((o.labor_cost > 0 && o.qty > 0) ? Math.round((o.labor_cost / o.qty) * 100) / 100 : -1)) > 0.0001; });
  const recvNow = snap ? snap.wos.reduce((a, w) => a + w.received_qty, 0) : 0;
  // ค้างช่าง (ตามที่บันทึกอยู่ตอนนี้) — หัวส่วนช่างส่งคืน + ปุ่มบันทึกส่งคืนเพิ่ม
  const outNow = snap ? cuOutstanding(snap.wos) : { total: 0, days: null, rows: [] };
  /** ยอดคืนของใบจ่าย "หลังแก้" (รวมรอบส่งคืนที่แก้/ลบ/แก้ตามให้) — แถบคืนแล้ว/ค้างช่าง ตามที่พิมพ์ */
  const effRecv = (woId: string, base: number) => {
    const e = built?.eff ?? form;
    if (!e || !snap) return base;
    return r2(base + (snap.subs ?? []).filter((x) => x.wo_id === woId).reduce((a, x) => { const y = e.subs.find((z) => z.id === x.id); return !y ? a : a + (y.del ? -x.qty : y.qty - x.qty); }, 0));
  };
  const buyReasonCu = !!m?.skipped.buy?.reason?.startsWith("อัปเดตงานย้อนหลัง");

  const footer = (<>
    {results && <span className={`mr-auto text-[12px] ${results.every((x) => x.ok) ? "text-emerald-700" : "text-rose-600"}`}>{results.every((x) => x.ok) ? `แก้แล้ว ${results.length} รายการ` : `ไม่สำเร็จ: ${results.find((x) => !x.ok)?.msg ?? ""}`}</span>}
    {onOpenUpdate && moNo && <button type="button" onClick={() => onOpenUpdate(moNo)} className="h-9 rounded-lg px-3 text-sm text-indigo-700 hover:bg-indigo-50"><Icon name="refresh" /> อัปเดตไปขั้นถัดไป</button>}
    <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-4 text-sm hover:bg-slate-50">ปิด</button>
    {canEdit && (errs.length ? (
      <span className="inline-flex h-9 items-center rounded-lg border border-rose-300 px-3 text-sm text-rose-700">ต้องแก้ {errs.length} จุดก่อน</span>
    ) : (
      <button type="button" disabled={!dirty || running >= 0} onClick={() => void save()}
        className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
        {running >= 0 ? `กำลังบันทึก ${running + 1}/${ops.length}…` : dirty ? `บันทึกการแก้ไข (${ops.length})` : "ยังไม่ได้แก้อะไร"}</button>
    ))}
  </>);

  return (
    <ERPModal open={!!moNo} onClose={onClose} size="lg" storageKey="wb-catchup-edit" footer={footer}
      hasUnsavedChanges={dirty && running < 0} closeOnBackdrop={!dirty}
      title={`แก้ไขใบงาน${m ? ` · ${m.product_sku ?? m.mo_no}` : ""}`}
      description={m ? `${m.mo_no}${m.product_name && m.product_name !== m.product_sku ? ` · ${m.product_name}` : ""} · สั่งผลิต ${fmt(m.qty)} ชิ้น` : undefined}>
      {loadErr ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadErr}</div>
        : !snap || !form || !m ? <div className="py-10 text-center text-sm text-slate-400">กำลังโหลดข้อมูลใบงาน…</div>
        : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              {origQty != null && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">เดิมสั่ง {fmt(origQty)} → ตอนนี้ {fmt(m.qty)}</span>}
              {splitFrom && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700">{splitRow?.mode === "extra" ? "ทำเพิ่มจาก" : "แยกมาจาก"} {splitFrom}</span>}
              {!canEdit && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600"><Icon name="lock" /> ดูอย่างเดียว — การแก้ต้องให้หัวหน้า (สิทธิ์บันทึกได้เลย / ยืนยันคำขอ)</span>}
              {m.status === "done" || m.status === "cancelled" ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700">ใบนี้{m.status === "done" ? "ปิดงาน" : "ยกเลิก"}แล้ว — แก้ได้เฉพาะวันที่/ค่าแรง</span> : null}
            </div>
            {results && results.some((x) => !x.ok) && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-800">
                {results.map((x, i) => <div key={i}>{x.ok ? "✓" : "✗"} {x.msg}</div>)}
              </div>
            )}

            <div className="rounded-lg border border-slate-200 px-3">
              {/* 1 ซื้อของ */}
              <Step no={1} title="ซื้อของ" done={!!m.skipped.buy || (!!snap.progress && snap.progress.buy + snap.progress.requested + snap.progress.ordered === 0)}>
                <div className="text-[12px] text-slate-600">
                  {m.skipped.buy ? <>มีป้าย &ldquo;ของครบ&rdquo; ({m.skipped.buy.by_name ?? "—"}{m.skipped.buy.reason ? ` · ${m.skipped.buy.reason}` : ""})</>
                    : !snap.progress ? "ใบนี้ยังไม่มีสูตร" : `ต้องซื้อ ${snap.progress.buy} · รออนุมัติ ${snap.progress.requested} · รอของ ${snap.progress.ordered} (จากระบบซื้อ — ดูอย่างเดียว)`}
                </div>
                {m.skipped.buy && (buyReasonCu
                  ? <label className="mt-1 flex items-center gap-2 text-[12px]"><input type="checkbox" disabled={lock} checked={form.unskipBuy} onChange={(e) => set({ unskipBuy: e.target.checked })} className="h-4 w-4 accent-rose-600" /> เอาป้ายนี้ออก (ติดผิด)</label>
                  : <div className="mt-0.5 text-[11px] text-slate-400">ป้ายนี้แอดมินติด — เอาออกที่หน้าใบสั่งผลิต</div>)}
              </Step>

              {/* 2-3 เตรียม / ตัด */}
              {(["prep", "cut"] as const).map((k, i) => {
                const label = k === "prep" ? "เตรียมของ" : "ตัด";
                const total = k === "prep" ? m.prep_total : m.cut_total, ready = k === "prep" ? m.prep_ready : m.cut_ready;
                const skipped = !!m.skipped[k];
                const st = form[k];
                const at = ymdTh(k === "prep" ? m.prep_done_at : m.cut_done_at);
                return (
                  <Step key={k} no={i + 2} title={label} done={st.done}
                    right={<span className="text-[11px] text-slate-400">{skipped ? "ข้ามขั้น (แอดมิน)" : m.has_bom ? `ติ๊กแล้ว ${ready}/${total} รายการ` : ""}{at ? ` · บันทึกไว้ ${cuDateText(at)}` : ""}</span>}>
                    {skipped ? <div className="text-[12px] text-slate-400">ข้ามขั้นนี้ไว้ — แก้ที่หน้าใบสั่งผลิต</div> : (
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" disabled={lock} checked={st.done} onChange={(e) => set({ [k]: { ...st, done: e.target.checked } })} className="h-4 w-4 accent-indigo-600" /> เสร็จครบแล้ว</label>
                        {st.done && <div className="w-44"><span className={lbl}>เสร็จเมื่อ</span><DispatchDatePick disabled={lock} value={st.date} onChange={(v) => set({ [k]: { ...st, date: v } })} /><Msg field={`${k}:date`} /></div>}
                        {m.has_bom && ready > 0 && ready < total && !st.done && <span className="text-[11px] text-amber-700">ติ๊กไว้บางรายการ — ติ๊ก &ldquo;เสร็จครบแล้ว&rdquo; = ครบทุกรายการ</span>}
                      </div>
                    )}
                  </Step>
                );
              })}

              {/* 4 ใบจ่าย */}
              <Step no={4} title="จ่ายงาน" done={snap.wos.length > 0} right={<>
                <Msg field="disp" />
                {canEdit && !form.reduce && issues.some((x) => x.field === "disp" && x.level === "error") && (
                  <button type="button" disabled={lock} onClick={() => set({ reduce: { qty: dispNow, pick: "ของพอทำเพิ่ม", detail: "", mode: "add" } })}
                    className="h-7 rounded-md border border-indigo-300 bg-indigo-50 px-2 text-[12px] font-medium text-indigo-800 hover:bg-indigo-100">ทำได้มากกว่าสั่งจริง — เพิ่มจำนวนสั่งเป็น {fmt(dispNow)}</button>
                )}
              </>}>
                {!snap.wos.length ? <div className="text-[12px] text-slate-400">ยังไม่ได้จ่ายงาน — ใช้ปุ่ม &ldquo;อัปเดต&rdquo;</div> : (
                  <div className="space-y-2">
                    {snap.wos.map((w) => {
                      const f = form.wos.find((x) => x.id === w.id)!;
                      const d = deptOf(f.deptId), pool = poolOf(d);
                      const key = `wo:${w.id}`;
                      return (
                        <div key={w.id} className={`rounded-lg border p-2.5 ${f.cancel ? "border-rose-200 bg-rose-50/40" : "border-slate-200"}`}>
                          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[12px]">
                            <b className="font-medium text-slate-700">{w.wo_no}</b>
                            <span className="rounded-full bg-slate-100 px-2 text-slate-600">{WO_STATUS[w.status] ?? w.status}</span>
                            {w.qc_pulled_qty > 0 && <span className="text-slate-500">เข้า QC แล้ว {fmt(w.qc_pulled_qty)}</span>}
                            {canEdit && <button type="button" disabled={lock} onClick={() => setWo(w.id, { cancel: !f.cancel })}
                              className={`ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 ${f.cancel ? "bg-white text-slate-600 hover:bg-slate-50" : "text-rose-600 hover:bg-rose-50"}`}>
                              {f.cancel ? <><Icon name="back" /> ไม่ยกเลิกแล้ว</> : <><Icon name="delete" /> ยกเลิกใบจ่ายนี้</>}</button>}
                          </div>
                          {!f.cancel && (() => {
                            // แถบ คืนแล้ว / ค้างช่าง ตามจำนวนที่พิมพ์ (เทียบของเดิม) + ค้างมากี่วัน
                            const qtyShown = f.qty > 0 ? f.qty : w.qty, recv = effRecv(w.id, w.received_qty);
                            const out = r2(Math.max(0, qtyShown - recv)), outBefore = r2(Math.max(0, w.qty - w.received_qty));
                            const days = out > 0 ? cuDaysSince(w.dispatch_date ?? w.created_at) : null;
                            const pct = (n: number) => `${qtyShown > 0 ? Math.min(100, (n / qtyShown) * 100) : 0}%`;
                            return (
                              <div className="mb-2">
                                <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden><div className="bg-emerald-500" style={{ width: pct(Math.min(recv, qtyShown)) }} /><div className="bg-amber-400" style={{ width: pct(out) }} /></div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
                                  <span><span className="text-emerald-600">●</span> คืนแล้ว <b className="font-semibold text-slate-800">{fmt(recv)}</b></span>
                                  {out > 0 ? <span><span className="text-amber-500">●</span> ค้างช่าง <b className="font-semibold text-amber-700">{fmt(out)}</b></span> : <span className="font-medium text-emerald-700">คืนครบแล้ว</span>}
                                  <span className="text-slate-400">จากใบจ่าย {fmt(qtyShown)} ชิ้น</span>
                                  {days != null && <span className={`rounded-full px-1.5 text-[11px] ${days > CU_LATE_DAYS ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>ค้างมา {days} วัน</span>}
                                  {Math.abs(out - outBefore) > 0.0001 && <span className="text-amber-700">ค้างส่งจะเป็น {fmt(out)} (เดิม {fmt(outBefore)})</span>}
                                </div>
                              </div>
                            );
                          })()}
                          <Msg field={`${key}:cancel`} /><Msg field={`${key}:qc`} />
                          {!f.cancel && (
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_5rem_6rem_minmax(0,1.2fr)]">
                              <div><span className={lbl}>โต๊ะ</span>
                                <select disabled={lock} value={f.deptId} onChange={(e) => setWo(w.id, { deptId: e.target.value, crewIds: [] })} className={`${inp}${ring(`${key}:dept`)}`}>
                                  <option value="">— เลือกโต๊ะ —</option>
                                  {departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                                </select><Msg field={`${key}:dept`} /></div>
                              <div><span className={lbl}>คนรับ</span>
                                {lock ? <div className={`${inp} flex items-center truncate bg-slate-50`}>{w.assignee_name ?? "ทั้งโต๊ะ"}</div>
                                  : <CrewPick people={pool} value={f.crewIds} onChange={(ids) => setWo(w.id, { crewIds: ids })} required={isHireDesk(d?.name)} />}</div>
                              <div><span className={lbl}>จำนวน</span>
                                <input type="number" min={0} disabled={lock} value={f.qty || ""} onChange={(e) => setWo(w.id, { qty: Number(e.target.value) || 0 })} className={`${inp} text-right${ring(`${key}:qty`)}`} /></div>
                              <div><span className={lbl}>ค่าแรง/ชิ้น</span>
                                <input type="number" min={0} disabled={lock} value={f.rate ?? ""} placeholder="ยังไม่มี" onChange={(e) => setWo(w.id, { rate: numOrNull(e.target.value) })} className={`${inp} text-right${ring(`${key}:rate`)}`} /></div>
                              <div><span className={lbl}>วันจ่าย</span><DispatchDatePick disabled={lock} value={f.date} onChange={(v) => setWo(w.id, { date: v })} /></div>
                              <div className="col-span-2 sm:col-span-5"><input disabled={lock} value={f.note} onChange={(e) => setWo(w.id, { note: e.target.value })} placeholder="หมายเหตุถึงช่าง" className={inp} /></div>
                            </div>
                          )}
                          <Msg field={`${key}:qty`} /><Msg field={`${key}:rate`} /><Msg field={`${key}:date`} />
                          {canEdit && !f.cancel && form.noCascade.includes(w.id) && issues.some((x) => x.field === `${key}:qty` && x.level === "error") && (
                            <button type="button" disabled={lock} onClick={() => set({ noCascade: form.noCascade.filter((x) => x !== w.id) })}
                              className="mt-1 h-8 rounded-lg border border-amber-300 bg-amber-50 px-3 text-[12px] font-medium text-amber-900 hover:bg-amber-100">ทำได้จริงแค่ {fmt(f.qty)} — ให้ระบบแก้ตามให้ทั้งชุด</button>
                          )}
                          {(() => {
                            const c = cascades.find((x) => x.woId === w.id);
                            if (!c) return null;
                            const first = cascades[0] === c;
                            return (
                              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                                <div className="font-medium"><Icon name="tip" /> ช่างส่งคืนไปแล้ว {fmt(c.recvFrom)} — ถ้าจริง ๆ ทำได้แค่ {fmt(c.to)} ระบบแก้ตามให้ทั้งชุด</div>
                                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                                  {c.qcBack.map((q) => <li key={q.id}>ย้อนของ {fmt(q.qty)} ชิ้นจาก &ldquo;{q.shelf}&rdquo; กลับไปรอรับ — หลังบันทึกกด &ldquo;อัปเดต&rdquo; รับเข้าใหม่</li>)}
                                  {c.subs.map((x) => <li key={x.id}>{x.to > 0 ? `รอบส่งคืน ${cuDateText(x.date)}: ${fmt(x.from)} → ${fmt(x.to)} ชิ้น · ค่าแรงคิดตามจำนวนใหม่` : `ลบรอบส่งคืน ${cuDateText(x.date)} (${fmt(x.from)} ชิ้น)`}</li>)}
                                  <li>ใบจ่าย {fmt(c.from)} → {fmt(c.to)} ชิ้น{f.rate != null ? ` · ค่าแรงรวม ฿${fmt(f.rate * c.to)}` : ""}</li>
                                </ul>
                                {c.rest > 0 && (form.reduce ? <div className="mt-1.5 text-amber-800">อีก {fmt(c.rest)} ชิ้นที่ไม่ได้ทำ: ใช้ตามช่อง &ldquo;จำนวนสั่งผลิต&rdquo; ด้านล่าง</div>
                                  : !first ? <div className="mt-1.5 text-amber-800">อีก {fmt(c.rest)} ชิ้นที่ไม่ได้ทำ: ตามที่เลือกในกล่องแรก</div> : (
                                  <div className="mt-1.5 space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span>อีก <b className="font-medium">{fmt(restTotal)}</b> ชิ้นที่ไม่ได้ทำ · เพราะ</span>
                                      <select disabled={lock} value={form.rest.pick} onChange={(e) => setRest({ pick: e.target.value })} className="h-8 rounded-lg border border-amber-300 bg-white px-2 text-[12px]">
                                        {REDUCE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                                      </select>
                                      <input disabled={lock} value={form.rest.detail} onChange={(e) => setRest({ detail: e.target.value })} placeholder={form.rest.pick === "อื่น ๆ" ? "พิมพ์เหตุผล" : "ระบุเพิ่ม (ไม่บังคับ)"}
                                        className={`h-8 min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-2 text-[12px]${ring("reduce:reason")}`} style={{ minWidth: 120 }} />
                                    </div>
                                    <div className="grid gap-1.5 sm:grid-cols-3">
                                      {([["split", `ใบใหม่ ${fmt(restTotal)} ชิ้น · ใบนี้เหลือ ${fmt(m.qty - restTotal)}`], ["drop", `ใบนี้เหลือ ${fmt(m.qty - restTotal)}`], ["keep", `ใบยังเป็น ${fmt(m.qty)} · ${fmt(restTotal)} ชิ้นกลับไปแท็บรอจ่าย`]] as const).map(([k, sub]) => (
                                        <button key={k} type="button" disabled={lock} onClick={() => setRest({ mode: k })} aria-pressed={form.rest.mode === k}
                                          className={`rounded-lg border bg-white px-2.5 py-1.5 text-left ${form.rest.mode === k ? "border-indigo-500 ring-1 ring-indigo-500" : "border-amber-200 hover:border-amber-400"}`}>
                                          <div className="text-[12px] font-medium text-slate-800">{k === "keep" ? "ค้างไว้ในใบนี้" : REDUCE_MODE_LABEL[k]}{k === "split" && <span className="ml-1 rounded bg-indigo-50 px-1 text-[10px] font-normal text-indigo-700">แนะนำ</span>}</div>
                                          <div className="text-[11px] text-slate-500">{sub}</div>
                                        </button>
                                      ))}
                                    </div>
                                    <Msg field="reduce:qty" />
                                  </div>
                                ))}
                                {canEdit && <button type="button" disabled={lock} onClick={() => set({ noCascade: [...form.noCascade, w.id] })} className="mt-1.5 h-7 rounded-md px-2 text-[12px] text-amber-800 underline decoration-dotted hover:bg-amber-100">ไม่ใช่ — แก้เฉพาะใบจ่าย</button>}
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Step>

              {/* 5 รอบส่งคืน */}
              <Step no={5} title="ช่างส่งคืน" done={recvNow > 0} right={<>
                {snap.wos.length > 0 && <span className="rounded-full bg-emerald-50 px-2 text-[11px] text-emerald-700">คืนแล้ว {fmt(recvNow)}</span>}
                {outNow.total > 0 && <span className={`rounded-full px-2 text-[11px] ${(outNow.days ?? 0) > CU_LATE_DAYS ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>ค้างส่ง {fmt(outNow.total)} ชิ้น{outNow.days != null ? ` · ${outNow.days} วัน` : ""}</span>}
                {rateChanged && <label className="flex items-center gap-1.5 text-[12px] text-slate-600"><input type="checkbox" disabled={lock} checked={form.reRateSubs} onChange={(e) => set({ reRateSubs: e.target.checked })} className="h-4 w-4 accent-indigo-600" /> เปลี่ยนค่าแรง/ชิ้นของใบจ่าย → คิดค่าแรงรอบส่งคืนใหม่ด้วย</label>}
              </>}>
                {outNow.total > 0 && onOpenUpdate && moNo && m.status !== "done" && m.status !== "cancelled" && (
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <button type="button" disabled={dirty} onClick={() => onOpenUpdate(moNo, "return")} title={dirty ? "บันทึกหรือยกเลิกการแก้ในป๊อปนี้ก่อน" : undefined}
                      className="h-8 rounded-lg border border-amber-300 bg-amber-50 px-3 text-[12px] font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-40">บันทึกส่งคืนเพิ่ม {fmt(outNow.total)} ชิ้น →</button>
                    <span className="text-[11px] text-slate-500">เปิดป๊อปอัปเดตขั้น &ldquo;ช่างส่งคืน&rdquo; ใส่จำนวนที่ค้างให้แล้ว (ส่งไม่ครบก็แก้ตัวเลขได้)</span>
                  </div>
                )}
                <Msg field="rerate" />
                {!(snap.subs ?? []).length ? <div className="text-[12px] text-slate-400">{recvNow > 0 ? `มียอดส่งคืน ${fmt(recvNow)} ชิ้นแต่ไม่มีรายการส่งคืนรายรอบ (ข้อมูลเก่า) — แก้ที่ใบจ่าย` : "ยังไม่มีการส่งคืน"}</div> : (
                  <div className="space-y-1.5">
                    {(snap.subs ?? []).map((x, i) => {
                      const f = form.subs.find((y) => y.id === x.id)!;
                      const key = `sub:${x.id}`;
                      return (
                        <div key={x.id} className={`grid grid-cols-2 items-start gap-2 rounded-lg border px-2.5 py-2 sm:grid-cols-[minmax(0,1.6fr)_5rem_6.5rem_9.5rem_auto] ${f.del ? "border-rose-200 bg-rose-50/40 opacity-70" : "border-slate-200"}`}>
                          <div className="col-span-2 text-[12px] sm:col-span-1">
                            <div className="font-medium text-slate-700">รอบ {i + 1} · {x.wo_no}</div>
                            <div className="text-slate-500">{x.craftsman_name ?? "—"}{x.info_pending ? " · ยังไม่ลงค่าแรง/วันที่" : ""}</div>
                          </div>
                          {casSub.has(x.id) ? (
                            <div className="col-span-2 self-center text-[12px] text-amber-800 sm:col-span-3">
                              {casSub.get(x.id)!.to > 0 ? <>จำนวน {fmt(casSub.get(x.id)!.from)} → <b className="font-medium">{fmt(casSub.get(x.id)!.to)}</b> ชิ้น</> : <>จะลบรอบนี้ ({fmt(casSub.get(x.id)!.from)} ชิ้น)</>} · แก้ตามใบจ่ายให้แล้ว</div>
                          ) : f.del ? <div className="col-span-2 self-center text-[12px] text-rose-700 sm:col-span-3">จะลบรอบนี้ ({fmt(x.qty)} ชิ้น)</div> : (<>
                            <div><span className={lbl}>จำนวน</span><input type="number" min={0} disabled={lock} value={f.qty || ""} onChange={(e) => setSub(x.id, { qty: Number(e.target.value) || 0 })} className={`${inp} text-right${ring(`${key}:qty`)}`} /></div>
                            <div><span className={lbl}>ค่าแรงรอบนี้ (฿)</span><input type="number" min={0} disabled={lock} value={f.wage ?? ""} placeholder="ยังไม่ลง" onChange={(e) => setSub(x.id, { wage: numOrNull(e.target.value) })} className={`${inp} text-right${ring(`${key}:wage`)}`} />
                              {f.wage != null && f.qty > 0 && <div className="text-[11px] text-slate-400">= ฿{fmt(f.wage / f.qty)}/ชิ้น</div>}</div>
                            <div><span className={lbl}>วันที่ส่ง</span><input type="date" disabled={lock} value={f.date ?? ""} onChange={(e) => setSub(x.id, { date: e.target.value || null })} className={`${inp}${ring(`${key}:date`)}`} /></div>
                          </>)}
                          {canEdit && !casSub.has(x.id) && <button type="button" disabled={lock} onClick={() => setSub(x.id, { del: !f.del })} title={f.del ? "ไม่ลบแล้ว" : "ลบรอบนี้ (ส่งผิด)"}
                            className={`mt-4 h-9 rounded-lg border px-2 text-[12px] ${f.del ? "border-slate-200 bg-white text-slate-600" : "border-slate-200 text-rose-600 hover:border-rose-300 hover:bg-rose-50"}`}>{f.del ? "ไม่ลบ" : <Icon name="delete" />}</button>}
                          <div className="col-span-2 sm:col-span-5"><Msg field={`${key}:qty`} /><Msg field={`${key}:wage`} /><Msg field={`${key}:date`} /></div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Step>

              {/* 6 ของบนชั้น QC */}
              <Step no={6} title="QC รับเข้าชั้น" done={(snap.qcItems ?? []).length > 0}>
                {!(snap.qcItems ?? []).length ? <div className="text-[12px] text-slate-400">ยังไม่มีของของใบนี้บนชั้น QC{snap.shelfAt.length === 0 && snap.wos.some((w) => w.qc_pulled_qty > 0) ? " (ส่งออกไปแล้ว)" : ""}</div> : (
                  <div className="space-y-1">
                    {(snap.qcItems ?? []).map((it) => {
                      const auto = casQc.has(it.id), back = auto || form.qcBack.includes(it.id);
                      return (
                        <label key={it.id} className={`flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] ${back ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
                          <input type="checkbox" disabled={lock || auto} checked={back} onChange={(e) => set({ qcBack: e.target.checked ? [...form.qcBack, it.id] : form.qcBack.filter((x) => x !== it.id) })} className="h-4 w-4 accent-amber-500" />
                          <span className="font-medium text-slate-700">{fmt(it.qty)} ชิ้น · {QC_STATUS[it.status] ?? it.status}</span>
                          <span className="text-slate-500">{it.shelf_name}{it.reason ? ` · ${it.reason}` : ""} · {cuDateText(ymdTh(it.created_at))}</span>
                          <span className="ml-auto text-slate-400">{auto ? "ย้อนให้ (แก้ตามใบจ่าย)" : back ? "จะย้อนกลับไปรอ QC รับ" : "ย้อนกลับไปรอรับ"}</span>
                        </label>
                      );
                    })}
                    <div className="text-[11px] text-slate-400">รับเข้าผิดชั้น/ผิดจำนวน = ย้อนกลับไปรอรับ แล้วรับเข้าใหม่ด้วยปุ่ม &ldquo;อัปเดต&rdquo; · ส่งออก/ปิดใบ/ยกเลิกใบ ย้อนจากที่นี่ไม่ได้</div>
                  </div>
                )}
              </Step>

              {/* 7 ลดจำนวน */}
              {m.status !== "done" && m.status !== "cancelled" && (
                <Step no={7} title="จำนวนสั่งผลิต" right={<span className="text-[11px] text-slate-400">ตอนนี้ {fmt(m.qty)} ชิ้น</span>}>
                  {built?.reduceFromCascade && built.eff.reduce ? (
                    <div className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-900">ลดตามใบจ่าย: {fmt(m.qty)} → <b className="font-medium">{fmt(built.eff.reduce.qty)}</b> ชิ้น · {REDUCE_MODE_LABEL[built.eff.reduce.mode === "split" ? "split" : "drop"]} <span className="text-amber-700">(ตั้งที่กล่องสีเหลืองของใบจ่ายด้านบน)</span><Msg field="reduce:qty" /></div>
                  ) : canEdit ? <ReducePanel qty={m.qty} received={recvNow} sized={!!m.sized} wos={snap.wos} value={form.reduce} onChange={(v) => set({ reduce: v })} issues={issues} allowKeep={false} />
                    : <div className="text-[12px] text-slate-400">เปลี่ยนจำนวนได้เฉพาะหัวหน้า</div>}
                </Step>
              )}
            </div>

            {/* ก่อน → หลัง */}
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-[12px]">
              <div className="mb-1 font-medium text-slate-600">จะแก้อะไร (ก่อน → หลัง)</div>
              {ops.length ? <ol className="list-decimal space-y-0.5 pl-5 text-slate-700">{ops.map((o, i) => <li key={i} className={running === i ? "font-medium text-indigo-700" : ""}>{o.label}</li>)}</ol>
                : <div className="text-slate-400">ยังไม่ได้แก้อะไร</div>}
              {errs.length > 0 && <div className="mt-1 text-rose-700">{errs.slice(0, 3).map((x) => (x.where ? `${x.where}: ${x.msg}` : x.msg)).join(" · ")}{errs.length > 3 ? ` · และอีก ${errs.length - 3}` : ""}</div>}
            </div>

            {/* ประวัติ */}
            {((snap.qtyLog ?? []).length > 0 || (snap.edits ?? []).length > 0) && (
              <details className="rounded-lg border border-slate-200 px-3 py-2 text-[12px]" open={(snap.qtyLog ?? []).some((c) => !c.reverted)}>
                <summary className="cursor-pointer select-none font-medium text-slate-600"><Icon name="history" /> ประวัติการแก้ / เปลี่ยนจำนวน</summary>
                <div className="mt-1.5 space-y-1">
                  {(snap.qtyLog ?? []).map((c, i) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-2 text-slate-600">
                      <span className="text-slate-400">{cuWhen(c.at)}</span>
                      <span className={c.reverted ? "line-through" : ""}>{c.split_from
                        ? (c.mode === "extra" ? `ใบนี้คือส่วนที่ทำเพิ่มจาก ${c.mo_no} (${c.reason})` : `ใบนี้แยกมาจาก ${c.mo_no} (ลด ${fmt(c.from)} → ${fmt(c.to)} · ${c.reason})`)
                        : c.mode === "add" ? `เพิ่มจำนวน ${fmt(c.from)} → ${fmt(c.to)} · ${c.reason}${!c.reverted && i === (snap.qtyLog ?? []).findIndex((x) => !x.split_from && !x.reverted) && outNow.total > 0 ? ` · ตอนนี้ช่างค้างส่ง ${fmt(outNow.total)}` : ""}`
                        : c.mode === "extra" ? `ทำเพิ่ม ${fmt(c.to - c.from)} ชิ้น เป็นใบ ${c.new_mo_no ?? "ใหม่"} · ${c.reason}`
                        : `ลดจำนวน ${fmt(c.from)} → ${fmt(c.to)} · ${c.reason}${c.new_mo_no ? ` · ที่เหลือไปใบ ${c.new_mo_no}` : " · ที่เหลือไม่ทำแล้ว"}`}</span>
                      {c.by && <span className="text-slate-400">· {c.by}</span>}
                      {c.reverted && <span className="rounded bg-slate-100 px-1 text-slate-500">ย้อนแล้ว</span>}
                      {canEdit && !c.reverted && !c.split_from && i === (snap.qtyLog ?? []).findIndex((x) => !x.split_from && !x.reverted) && (
                        <button type="button" onClick={() => void revertReduce(c.id, c.mode === "extra" ? `ทำเพิ่ม ${fmt(c.to - c.from)} ชิ้น (ใบ ${c.new_mo_no ?? "ใหม่"})` : `${c.mode === "add" ? "เพิ่ม" : "ลด"} ${fmt(c.from)} → ${fmt(c.to)}`)} className="h-6 rounded-md border border-slate-200 px-2 text-[11px] text-slate-600 hover:bg-slate-50"><Icon name="back" /> ย้อน</button>
                      )}
                    </div>
                  ))}
                  {(snap.edits ?? []).filter((e) => !/^(ลดจำนวน|เพิ่มจำนวน|ทำเพิ่ม|ย้อนการ)/.test(e.label)).map((e, i) => (
                    <div key={i} className="text-slate-600"><span className="text-slate-400">{cuWhen(e.at)}</span> {e.label}{e.by ? <span className="text-slate-400"> · {e.by}</span> : null}</div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
    </ERPModal>
  );
}
