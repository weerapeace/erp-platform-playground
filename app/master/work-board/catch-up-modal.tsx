"use client";

/**
 * 🔄 ป๊อป "อัปเดตงาน" (โหมดอัปเดตงานของบอร์ดจ่ายงาน) — บอกระบบว่าใบนี้ไปถึงขั้นไหนแล้วจริงๆ
 *   ขั้น 1: เลือกสถานะปัจจุบันจากเส้นขั้นตอน → ติ๊กขั้นก่อนหน้าให้ (ของครบ/เตรียม/ตัด เอาออกได้ · ติ๊ก "ยังขาดของ" ได้)
 *   ขั้น 2: เติมเฉพาะข้อมูลที่ยังไม่มี — จ่ายงานหลายแถว · ส่งคืนหลายรอบ · ทุกขั้นมีวันที่ (ข้ามได้)
 *           เตือนรายช่อง (กรอบแดง = ต้องแก้ · เหลือง = เตือน) ด้วยกฎกลาง lib/work-entry-rules ตัวเดียวกับป๊อปจ่ายงานปกติ
 *   ขั้น 3: ผลการบันทึกทีละขั้น (พังขั้นไหน หยุดตรงนั้น บอกว่าสำเร็จถึงไหน)
 * กติกาทั้งหมดอยู่ที่ ./catch-up.ts (ทดสอบแล้ว) · ข้อมูลตั้งต้นจาก GET /api/mo/catch-up
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { defectNote, isHireDesk, todayYmd } from "@/lib/work-entry-rules";
import type { Assignee } from "@/app/api/mo/assignees/route";
import type { CatchUpSnapshot } from "@/app/api/mo/catch-up/route";
import { CrewPick, crewFields, crewList, lastCrewIds } from "./crew-pick";
import { DispatchDatePick } from "./dispatch-date-pick";
import { DeskStaffPanel } from "./desk-staff-panel";
import type { WorkOrder } from "@/app/api/mo/work-orders/route";
import {
  CU_TARGETS, CU_STAGE_LABEL, CU_NO_DATES, cuFacts, cuRows, cuDefaultTicks, cuDefaultQty, cuBuildSteps, cuTargetBlocked, cuStepLabel, cuRun, cuStageDone, cuCanShort,
  CU_SEVERITY, type CuTargetKey, type CuTicks, type CuResult, type CuStage, type CuStep, type CuDispLine, type CuRetLine, type CuDates, type CuIssue, type CuProblem,
} from "./catch-up";

type DeptLite = { id: string; name: string };
/** แถวจ่ายงานบนจอ = แถวตามกติกา + คนรับ · rateSet = พิมพ์ค่าแรงเองแล้ว (ไม่เปลี่ยนตามช่าง) */
type DispRow = CuDispLine & { crewIds: string[]; rateSet?: boolean };

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const r2 = (n: number) => Math.round(n * 100) / 100;
const numIn = "w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500";
const lbl = "mb-1 block text-[12px] text-slate-500";
const addBtn = "h-8 rounded-lg border border-dashed border-indigo-300 px-3 text-[12px] text-indigo-700 hover:bg-indigo-50";
/** สถานะซื้อของรายวัตถุดิบ (lib/mo-material-status) → คำที่โชว์ */
const MAT_LABEL: Record<string, string> = { buy: "ต้องซื้อ", requested: "รออนุมัติ", ordered: "รอของ", received: "ได้ของแล้ว", have: "มีของ", ready: "เตรียมแล้ว", skip: "ไม่ต้องซื้อ" };
/** เส้นขั้นตอน = สถานะที่เลือกได้เรียงตามลำดับ (ยกเลิกใบแยกไว้ล่างสุด) แบ่งหมวดตาม group */
const flow = CU_TARGETS.filter((t) => t.key !== "cancel");
const phases = [...new Set(flow.map((t) => t.group))];
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
/** จำโต๊ะ/คนรับ/ชั้น QC ล่าสุดไว้ให้ใบถัดไป (ต่อเครื่อง — ไม่จำวันที่ กันวันผิดติดไปเงียบ ๆ) */
const LAST_KEY = "wb-catchup-last";
type CuLast = { deptId?: string; crewIds?: string[]; shelfId?: string };
const readLast = (): CuLast => { try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}") as CuLast; } catch { return {}; } };
const writeLast = (v: CuLast) => { try { localStorage.setItem(LAST_KEY, JSON.stringify(v)); } catch { /* ไม่มี storage ก็ข้าม */ } };

export function CatchUpModal({ moNo, onClose, onDone, departments, craftsmen, workOrders, canMoveStaff = false, canAddNew = false, onStaffChanged, onDesksChanged, onNext, nextLabel }: {
  /** ใบสั่งผลิตที่จะอัปเดต (null = ปิดป๊อป) */
  moNo: string | null;
  onClose: () => void;
  /** บันทึกแล้วอย่างน้อย 1 ขั้น → ให้หน้าแม่โหลดบอร์ดใหม่ */
  onDone: () => void;
  departments: DeptLite[]; craftsmen: Assignee[]; workOrders: WorkOrder[];
  /** 👥 จัดคนในโต๊ะ (ของกลาง DeskStaffPanel — ตัวเดียวกับป๊อปจ่ายงาน) · ย้ายคน/สร้าง/เปลี่ยนชื่อ/ปิดโต๊ะ = สิทธิ์ฝ่ายบุคคล */
  canMoveStaff?: boolean; canAddNew?: boolean;
  onStaffChanged?: () => void | Promise<void>;
  /** สร้าง/เปลี่ยนชื่อ/ปิดโต๊ะแล้ว → หน้าแม่โหลดโต๊ะใหม่ */
  onDesksChanged?: () => void;
  /** ไปใบถัดไปในตาราง (โหมดอัปเดตงาน — ไล่ใบค้างทีละใบโดยไม่ต้องปิดป๊อป) · nextLabel = รหัสสินค้าใบถัดไป */
  onNext?: () => void; nextLabel?: string | null;
}) {
  const toast = useToast();
  const [snap, setSnap] = useState<CatchUpSnapshot | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [page, setPage] = useState<1 | 2 | 3>(1);
  const [target, setTarget] = useState<CuTargetKey | null>(null);
  const [ticks, setTicks] = useState<CuTicks>({});
  const [disp, setDisp] = useState<DispRow[]>([]);      // แถวจ่ายงาน (หลายช่าง = หลายแถว)
  const [ret, setRet] = useState<CuRetLine[]>([]);       // รอบส่งคืน (ส่งไม่พร้อมกัน = หลายรอบ)
  const [retSet, setRetSet] = useState(false);           // แก้จำนวนส่งคืนเองแล้ว (เลิกตามยอดจ่ายอัตโนมัติ)
  const [qc, setQc] = useState({ good: 0, bad: 0 });
  const [qcSet, setQcSet] = useState(false);             // แก้ของดีเองแล้ว (เลิกตามยอดส่งคืนอัตโนมัติ)
  const [dates, setDates] = useState<CuDates>(CU_NO_DATES);
  const [shelfId, setShelfId] = useState("");
  const [badReason, setBadReason] = useState("");
  const [reasons, setReasons] = useState<{ id: string; name: string }[]>([]);
  const [newReason, setNewReason] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [missing, setMissing] = useState<string[]>([]);   // รหัสวัตถุดิบที่ "ยังขาด"
  const [problems, setProblems] = useState<CuProblem[]>([]);   // ปัญหาที่เจอ (ข้อมูลเพิ่มเติม)
  const [teamNote, setTeamNote] = useState("");
  const [saveBom, setSaveBom] = useState(true);            // บันทึกค่าแรง/ชิ้นกลับเข้า BOM (เจ้าของสั่ง: ค่าเริ่ม = บันทึก)
  const [deskPanelFor, setDeskPanelFor] = useState<string | null>(null);   // แถวจ่ายที่เปิด "จัดคนในโต๊ะ"
  const [defects, setDefects] = useState<Record<string, { sku: string | null }[]> | null>(null);   // ประวัติงานเสียรายช่าง (โหลดตอนใช้)
  const [running, setRunning] = useState(-1);
  const [results, setResults] = useState<CuResult[]>([]);
  const seq = useRef(0);
  const nk = (p: string) => `${p}${++seq.current}`;

  useEffect(() => {
    if (!moNo) return;
    setSnap(null); setLoadErr(""); setPage(1); setTarget(null); setTicks({}); setDisp([]); setRet([]); setRetSet(false); setQcSet(false); setDates(CU_NO_DATES);
    setShelfId(""); setBadReason(""); setNewReason(null); setCancelReason(""); setMissing([]); setDeskPanelFor(null); setResults([]); setRunning(-1);
    setProblems([]); setTeamNote(""); setSaveBom(true);
    let alive = true;
    void (async () => {
      try {
        const r = await apiFetch(`/api/mo/catch-up?mo_no=${encodeURIComponent(moNo)}`);
        const j = await r.json();
        if (!alive) return;
        if (!r.ok || j.error) throw new Error(j.error || "โหลดข้อมูลใบงานไม่สำเร็จ");
        const s = j.data as CatchUpSnapshot;
        setSnap(s); setReasons(s.reasons ?? []);
      } catch (e) { if (alive) setLoadErr(e instanceof Error ? e.message : "โหลดข้อมูลใบงานไม่สำเร็จ"); }
    })();
    return () => { alive = false; };
  }, [moNo]);

  const f = useMemo(() => (snap ? cuFacts(snap) : null), [snap]);
  /** ค่าแรง/ชิ้นจากสูตร: เรตเฉพาะช่าง (เลือกคนเดียว) → ไม่งั้นราคากลาง (กติกาเดียวกับป๊อปจ่ายงานปกติ) */
  const centralRate = snap?.rates.find((x) => !x.craftsman_id)?.rate ?? null;
  const rateFor = (crewIds: string[]) => (crewIds.length === 1 ? snap?.rates.find((x) => x.craftsman_id === crewIds[0])?.rate : undefined) ?? centralRate;

  const pick = (k: CuTargetKey) => {
    if (!f) return;
    setTarget(k); setTicks((t) => ({ ...cuDefaultTicks(f, k), short: k !== "have" && cuCanShort(f, k) ? t.short : false }));
    const q = cuDefaultQty(f, k);
    // ใช้โต๊ะ/คนรับ/ชั้นล่าสุด (ถ้ายังมีอยู่) — ไล่ใบค้างชุดเดียวกันไม่ต้องเลือกซ้ำ
    const last = readLast();
    const lastDept = last.deptId ? departments.find((d) => d.id === last.deptId) ?? null : null;
    const lastCrew = lastDept ? (last.crewIds ?? []).filter((id) => poolOf(lastDept).some((c) => c.id === id)) : [];
    setDisp([{ key: nk("d"), deptId: lastDept?.id ?? "", crewIds: lastCrew, qty: q.dispatchQty, date: null, rate: lastCrew.length ? rateFor(lastCrew) : centralRate }]);
    setRet([{ key: nk("r"), ref: "auto", qty: q.returnQty, date: null, wage: null }]);
    setRetSet(k === "return_part"); setQcSet(false);
    setQc({ good: q.qcGood, bad: 0 });
    const good = snap?.shelves.filter((s) => s.kind !== "defect") ?? [];
    setShelfId(good.length === 1 ? good[0].id : good.some((s) => s.id === last.shelfId) ? last.shelfId! : "");
  };
  const rows = f && target ? cuRows(f, target, ticks) : [];
  const selIdx = target ? flow.findIndex((t) => t.key === target) : -1;
  const phaseOn = (ph: string) => selIdx >= 0 && flow.some((t, i) => t.group === ph && i <= selIdx);
  /** ขั้นที่ระบบบันทึกไปถึงแล้ว (ไกลสุด) — ป้าย "ระบบบันทึกถึงตรงนี้" */
  const sysKey = f ? [...flow].reverse().find((t) => t.upto && t.key !== "return_part" && cuStageDone(f, t.upto))?.key : undefined;
  const toggleShort = (v: boolean) => {
    setTicks((t) => ({ ...t, short: v }));
    if (v && snap) setMissing(snap.materials.filter((x) => !x.ready && ["buy", "requested", "ordered"].includes(x.status)).map((x) => x.sku));
  };
  const on = (st: CuStage) => rows.some((r) => r.stage === st && (r.state === "need" || (r.state === "opt" && !!ticks[st])));

  // ── แถวจ่ายงาน: โต๊ะ / คนรับ ของแต่ละแถว
  const deptOf = (id: string) => departments.find((d) => d.id === id) ?? null;
  const poolOf = (d: DeptLite | null) => (d ? (isHireDesk(d.name) ? craftsmen : craftsmen.filter((c) => c.department_id === d.id)) : []);
  const setRow = (key: string, patch: Partial<DispRow>) => setDisp((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setRetRow = (key: string, patch: Partial<CuRetLine>) => setRet((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const crewNames = (r: DispRow) => crewList(r.crewIds, poolOf(deptOf(r.deptId))).map((x) => x.name).join(", ");
  const dispLabel = (r: DispRow) => { const d = deptOf(r.deptId); const n = crewNames(r); return d ? `${d.name}${n ? ` · ${n}` : ""}` : `แถวจ่าย ${disp.indexOf(r) + 1}`; };
  const dispTotal = r2(disp.reduce((a, r) => a + (r.qty > 0 ? r.qty : 0), 0));
  const remain = f ? Math.max(0, f.qty - f.dispatched) : 0;
  const outstanding = f ? r2(Math.max(0, f.dispatched + (on("dispatch") ? dispTotal : 0) - f.received)) : 0;
  const retTotal = r2(ret.reduce((a, r) => a + (r.qty > 0 ? r.qty : 0), 0));
  const qcAvail = f ? r2(Math.max(0, f.received + (on("return") ? retTotal : 0) - f.qcPulled)) : 0;

  // ── ยอดตามกันอัตโนมัติ (จนกว่าจะพิมพ์แก้เอง): ส่งคืน ← ยอดจ่าย · ของดี QC ← ยอดส่งคืน
  useEffect(() => {
    if (page !== 2 || retSet || ret.length !== 1) return;
    if (ret[0].qty !== outstanding) setRet((rs) => rs.map((r, i) => (i === 0 ? { ...r, qty: outstanding } : r)));
  }, [page, retSet, outstanding, ret]);
  useEffect(() => {
    if (page !== 2 || qcSet) return;
    const g = r2(Math.max(0, qcAvail - (qc.bad || 0)));
    if (qc.good !== g) setQc((q) => ({ ...q, good: g }));
  }, [page, qcSet, qcAvail, qc.bad, qc.good]);

  // ── ประวัติงานเสียรายช่าง (เตือนที่ชื่อช่างเหมือนป๊อปจ่ายงานปกติ) — โหลดครั้งเดียวตอนเปิดหน้าจ่ายงาน
  const needDefects = page === 2 && on("dispatch");
  useEffect(() => {
    if (!needDefects || defects) return;
    void (async () => {
      try {
        const r = await apiFetch("/api/mo/craftsman-defects"); const j = await r.json();
        const m: Record<string, { sku: string | null }[]> = {};
        for (const d of (j.data ?? []) as { worker: string; items?: { sku: string | null }[] }[]) m[(d.worker ?? "").trim().toLowerCase()] = d.items ?? [];
        setDefects(m);
      } catch { setDefects({}); }
    })();
  }, [needDefects, defects]);
  const defectOf = (name: string) => defectNote(defects?.[name.trim().toLowerCase()], snap?.mo.product_sku);

  // ใบที่ส่งคืนได้: ใบจ่ายเดิมที่ยังค้างช่าง + แถวจ่ายใหม่
  const retOptions = [
    ...(snap?.wos ?? []).filter((w) => w.status !== "done" && w.qty - w.received_qty > 0.0001)
      .map((w) => ({ ref: w.id, label: `${w.wo_no} · ${w.assignee_name ?? w.department_name ?? "—"} (ค้าง ${fmt(w.qty - w.received_qty)})` })),
    ...(on("dispatch") ? disp.filter((r) => r.qty > 0).map((r) => ({ ref: `new:${r.key}`, label: `ใหม่: ${dispLabel(r)} (${fmt(r.qty)})` })) : []),
  ];
  /** ชื่อโต๊ะ/คน ที่โชว์ในสรุปขั้น */
  const whoOf = (s: CuStep) => {
    if (s.kind === "dispatch") { const r = disp.find((x) => x.key === s.line); return r ? dispLabel(r) : ""; }
    if (s.kind === "return") return s.ref === "auto" ? "" : retOptions.find((o) => o.ref === s.ref)?.label.replace(/ \((ค้าง )?[\d,.]+\)$/, "").replace(/^ใหม่: /, "") ?? "";
    return "";
  };

  // ค่าแรง/ชิ้นที่พิมพ์เอง (ต่างจากราคากลางในสูตร) → เสนอบันทึกกลับเข้า BOM
  const bomCandidate = (on("dispatch") ? disp.find((r) => r.rateSet && r.rate != null && r.rate > 0)?.rate : undefined)
    ?? (on("return") ? ret.find((r) => r.wage != null && r.wage > 0)?.wage : undefined) ?? null;
  const bomOffer = bomCandidate != null && bomCandidate !== centralRate && !!snap?.mo.product_sku;
  const built = f && target
    ? cuBuildSteps(f, target, ticks, {
        disp: disp.map((r) => ({ ...r, deskName: deptOf(r.deptId)?.name ?? null, crewCount: r.crewIds.length })),
        ret, qcGood: qc.good, qcBad: qc.bad, shelfId, cancelReason, missing, dates, badReason, centralRate, today: todayYmd(),
        problems, teamNote, bomRate: bomOffer && saveBom ? bomCandidate : null,
      }, snap?.wos ?? [])
    : { steps: [] as CuStep[], errors: [] as string[], issues: [] as CuIssue[] };
  // เตือนงานเสียของช่างที่เลือก (ข้อมูลอยู่ฝั่งจอ) — เตือนเฉย ๆ บันทึกได้
  const defectIssues: CuIssue[] = on("dispatch") ? disp.flatMap((r) => crewList(r.crewIds, poolOf(deptOf(r.deptId)))
    .map((c) => ({ c, d: defectOf(c.name) })).filter((x) => x.d)
    .map((x) => ({ level: "warn" as const, field: `disp:${r.key}:crew`, msg: `${x.c.name} ${x.d}` }))) : [];
  const issues = [...built.issues, ...defectIssues];
  const errs = issues.filter((x) => x.level === "error"), warns = issues.filter((x) => x.level === "warn");
  /** ช่องวันที่ที่ยังว่าง (ข้ามได้ — แค่นับให้รู้) */
  const noDates = built.steps.filter((s) => "date" in s && !s.date).length;
  const issueAt = (field: string) => issues.find((x) => x.field === field && x.level === "error") ?? issues.find((x) => x.field === field);
  const ring = (field: string) => { const i = issueAt(field); return !i ? "" : i.level === "error" ? " !border-rose-400 !bg-rose-50/40" : " !border-amber-400"; };
  const Msg = ({ field }: { field: string }): ReactNode => {
    const list = issues.filter((x) => x.field === field);
    return list.length ? <div className="mt-0.5 space-y-0.5">{list.map((x, i) => <div key={i} className={`text-[11px] ${x.level === "error" ? "text-rose-600" : "text-amber-700"}`}>{x.msg}</div>)}</div> : null;
  };
  const SecBadge = ({ prefix }: { prefix: string }): ReactNode => {
    const e = errs.filter((x) => x.field.startsWith(prefix)).length, w = warns.filter((x) => x.field.startsWith(prefix)).length;
    return <>{e > 0 && <span className="rounded-full bg-rose-50 px-2 text-[11px] text-rose-700">ต้องแก้ {e}</span>}{w > 0 && <span className="rounded-full bg-amber-50 px-2 text-[11px] text-amber-700">เตือน {w}</span>}</>;
  };
  /** พาไปช่องแรกที่ต้องแก้ (อยู่ขั้นที่ 1 = กลับไปขั้น 1) */
  const goFirstError = () => {
    const x = errs[0]; if (!x) return;
    if (x.field === "short" || x.field === "target") { setPage(1); return; }
    const parts = x.field.split(":");
    const el = document.getElementById(`cu-${x.field}`) ?? document.getElementById(`cu-${parts.slice(0, 2).join(":")}`) ?? document.getElementById(`cu-${parts[0]}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    (el?.querySelector("input,select,textarea,button") as HTMLElement | null)?.focus();
  };

  const addReason = async () => {
    const name = (newReason ?? "").trim(); if (!name) return;
    try {
      const r = await apiFetch("/api/qc-warehouse/reasons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || "เพิ่มสาเหตุไม่สำเร็จ");
      setReasons((rs) => [...rs, { id: `new-${name}`, name }]); setBadReason(name); setNewReason(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มสาเหตุไม่สำเร็จ"); }
  };

  const save = async () => {
    if (!snap || !built.steps.length) return;
    if (errs.length) { goFirstError(); return; }
    setPage(3); setResults([]);
    const ctxDisp: Record<string, { dept: DeptLite; who: Record<string, unknown> }> = {};
    for (const r of disp) { const d = deptOf(r.deptId); if (d) ctxDisp[r.key] = { dept: d, who: crewFields(crewList(r.crewIds, poolOf(d)), d.name) }; }
    const res = await cuRun(built.steps, { snap, disp: ctxDisp, shelfId, badReason }, async (url, body, method = "POST") => {
      const r = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(r.status === 401 || r.status === 403 ? "คุณไม่มีสิทธิ์ทำขั้นนี้" : (j?.error || "บันทึกไม่สำเร็จ"));
      return j as Record<string, unknown>;
    }, setRunning, (s) => cuStepLabel(s, whoOf));
    setRunning(-1); setResults(res);
    if (res.some((x) => x.ok)) {
      const d0 = disp.find((r) => r.deptId);
      writeLast({ ...readLast(), ...(d0 ? { deptId: d0.deptId, crewIds: d0.crewIds } : {}), ...(shelfId ? { shelfId } : {}) });
      onDone();
    }
  };

  const busy = page === 3 && results.length === 0;
  const m = snap?.mo, p = snap?.progress;
  const buyTxt = !m ? "" : m.skipped.buy ? "ป้ายของครบ" : !p ? "ยังไม่มีสูตร" : f?.buyDone ? "ของครบ"
    : `ต้องซื้อ ${p.buy}${p.requested ? ` · รออนุมัติ ${p.requested}` : ""}${p.ordered ? ` · รอของ ${p.ordered}` : ""}`;

  const footer = page === 1 ? (<>
    <button type="button" onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
    {onNext && <button type="button" onClick={onNext} title={nextLabel ? `ข้ามไป ${nextLabel}` : undefined} className="h-9 px-3 text-sm text-slate-600 rounded-lg hover:bg-slate-50">ข้ามใบนี้ →</button>}
    <button type="button" disabled={!target} onClick={() => setPage(2)} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">ถัดไป: เติมข้อมูล →</button>
  </>) : page === 2 ? (<>
    <button type="button" onClick={() => setPage(1)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">← กลับ</button>
    {errs.length > 0 ? (
      <button type="button" onClick={goFirstError} title="กดเพื่อไปที่ช่องที่ต้องแก้"
        className="h-9 px-4 text-sm font-medium rounded-lg border border-rose-300 bg-white text-rose-700 hover:bg-rose-50">ยังขาด {errs.length} จุด — ไปแก้</button>
    ) : (
      <button type="button" disabled={built.steps.length === 0} onClick={() => void save()}
        className={`h-9 px-4 text-sm font-medium text-white rounded-lg disabled:opacity-40 ${target === "cancel" ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"}`}>
        {target === "cancel" ? "ยืนยันยกเลิกใบ" : warns.length ? `บันทึก (มีคำเตือน ${warns.length})` : "✓ บันทึกอัปเดต"}
      </button>
    )}
  </>) : (
    <>
      <button type="button" disabled={busy} onClick={onClose} className={`h-9 px-4 text-sm rounded-lg disabled:opacity-40 ${onNext ? "border border-slate-200 hover:bg-slate-50" : "font-medium bg-indigo-600 text-white hover:bg-indigo-700"}`}>ปิด</button>
      {onNext && <button type="button" disabled={busy} onClick={onNext} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">ใบถัดไป{nextLabel ? ` · ${nextLabel}` : ""} →</button>}
    </>
  );

  return (
    <ERPModal open={!!moNo} onClose={onClose} size="lg" storageKey="wb-catchup" footer={footer}
      hasUnsavedChanges={page === 2} closeOnBackdrop={page === 1}
      title={`🔄 อัปเดตงาน${m ? ` · ${m.product_sku ?? m.mo_no}` : ""}`}
      description={m ? `${m.mo_no}${m.product_name && m.product_name !== m.product_sku ? ` · ${m.product_name}` : ""} · สั่งผลิต ${fmt(m.qty)} ชิ้น` : undefined}>
      {loadErr ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadErr}</div>
        : !snap || !f || !m ? <div className="py-10 text-center text-sm text-slate-400">กำลังโหลดข้อมูลใบงาน…</div>
        : page === 1 ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-[12px]">
              <div className="mb-1 font-medium text-slate-500">ระบบบันทึกไว้ตอนนี้</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-700">
                {([["ซื้อของ", buyTxt], ["เตรียม", m.has_bom ? `${m.prep_ready}/${m.prep_total}` : m.prep_done ? "ครบ" : "—"],
                  ["ตัด", m.has_bom ? (m.cut_total ? `${m.cut_ready}/${m.cut_total}` : "ไม่มีชิ้นต้องตัด") : m.cut_done ? "ครบ" : "—"],
                  ["จ่าย", `${fmt(f.dispatched)}/${fmt(f.qty)}`], ["ช่างคืน", fmt(f.received)],
                  ["QC รับเข้า", `${fmt(f.qcPulled)}${f.shelfGood ? ` (บนชั้น ${fmt(f.shelfGood)})` : ""}`]] as [string, string][]).map(([k, v]) => (
                  <span key={k}><span className="text-slate-400">{k}</span> {v}</span>
                ))}
              </div>
            </div>
            {(snap.past.mo.length > 0 || snap.past.model.length > 0) && (
              <details className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12px] text-amber-900">
                <summary className="cursor-pointer select-none">
                  <Icon name="warning" /> ปัญหาที่เคยแจ้ง: {snap.past.mo.length > 0 && `ใบนี้ ${snap.past.mo.length} เรื่อง`}{snap.past.mo.length > 0 && snap.past.model.length > 0 && " · "}{snap.past.model.length > 0 && `รุ่นนี้ ${snap.past.model.length} เรื่อง`}
                  <span className="text-amber-700/70"> — กดดู กันแจ้งซ้ำ</span>
                </summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {snap.past.mo.map((x, i) => <li key={`m${i}`}>{x.text}{x.qty ? ` (${fmt(x.qty)} ชิ้น)` : ""} <span className="text-amber-700/70">· ใบนี้</span></li>)}
                  {snap.past.model.map((x, i) => <li key={`p${i}`}>{x} <span className="text-amber-700/70">· ทั้งรุ่น</span></li>)}
                </ul>
              </details>
            )}
            <div>
              <div className="mb-2 text-sm font-medium text-slate-700">ตอนนี้ของจริงอยู่ขั้นไหน? <span className="text-[12px] font-normal text-slate-400">กดขั้นเดียว ขั้นก่อนหน้าเป็นสีม่วงให้เอง</span></div>
              <div>
                {phases.map((ph, pi) => {
                  const items = flow.filter((t) => t.group === ph);
                  const lineOn = pi < phases.length - 1 && phaseOn(phases[pi + 1]);
                  return (
                    <div key={ph} className="relative grid grid-cols-[5rem_minmax(0,1fr)] gap-3 py-1.5">
                      {pi < phases.length - 1 && <span className={`absolute left-[2.5rem] top-9 -bottom-1.5 w-0.5 ${lineOn ? "bg-indigo-400" : "bg-slate-200"}`} />}
                      <div className="relative z-[1] flex flex-col items-center gap-0.5 pt-1">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[11px] font-semibold ${phaseOn(ph) ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-white text-slate-400"}`}>{pi + 1}</span>
                        <span className="bg-white px-0.5 text-center text-[11px] leading-tight text-slate-500">{ph}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {items.map((t) => {
                          const i = flow.indexOf(t), why = cuTargetBlocked(f, t.key), sel = target === t.key, past = selIdx >= 0 && i < selIdx;
                          const isSys = sysKey === t.key;
                          return (
                            <button key={t.key} type="button" disabled={!!why} title={why ?? t.hint} onClick={() => pick(t.key)}
                              className={`min-w-[8.5rem] rounded-lg border px-2.5 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${sel
                                ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : past ? "border-indigo-200 bg-indigo-50/60" : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40"}`}>
                              <div className={`text-[13px] ${sel ? "font-semibold text-indigo-700" : past ? "text-indigo-700" : "font-medium text-slate-800"}`}>{t.label}</div>
                              <div className={`text-[11px] ${isSys ? "text-emerald-600" : "text-slate-400"}`}>{why ?? (isSys ? "ระบบบันทึกถึงตรงนี้" : t.hint)}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              {(() => {
                const why = cuTargetBlocked(f, "cancel"), sel = target === "cancel";
                return (
                  <button type="button" disabled={!!why} title={why ?? undefined} onClick={() => pick("cancel")}
                    className={`mt-1 rounded-md px-2 py-1 text-[12px] disabled:cursor-not-allowed disabled:opacity-40 ${sel ? "bg-rose-50 font-medium text-rose-700 ring-1 ring-rose-400" : "text-rose-600 underline decoration-dotted hover:bg-rose-50"}`}>
                    ยกเลิกใบ <span className="text-rose-400">({why ?? "เฉพาะใบที่ยังไม่จ่าย"})</span>
                  </button>
                );
              })()}
            </div>
            {target && target !== "cancel" && (
              <div>
                <div className="mb-1 text-[12px] text-slate-500">ขั้นที่จะบันทึก · เอาติ๊กออกได้ ถ้าทำข้ามไปก่อน</div>
                <div className="divide-y divide-dashed divide-slate-200 rounded-lg border border-slate-200 px-3">
                  {rows.map((r) => {
                    const checked = r.state === "done" || r.state === "need" || r.state === "implied" || (r.state === "opt" && !!ticks[r.stage]);
                    const note = r.state === "done" ? "มีในระบบแล้ว" : r.state === "need" ? "ต้องบันทึก" : r.state === "implied" ? "รวมอยู่ใน \"เตรียมของแล้ว\""
                      : r.state === "short" ? "ยังไม่ครบ (ดูด้านล่าง)" : ticks[r.stage] ? "ติ๊กให้แล้ว" : "ยังไม่ได้ทำ (ทำข้ามไปก่อน)";
                    return (
                      <div key={r.stage}>
                        <label className={`flex items-center gap-2 py-2 text-sm ${r.state === "opt" ? "cursor-pointer" : ""}`}>
                          <input type="checkbox" checked={checked} disabled={r.state !== "opt"} onChange={(e) => setTicks((t) => ({ ...t, [r.stage]: e.target.checked }))}
                            className="h-4 w-4 accent-indigo-600" />
                          <span className={`flex-1 ${r.state === "done" ? "text-slate-400" : "text-slate-800"}`}>{CU_STAGE_LABEL[r.stage]}</span>
                          <span className={`text-[11px] ${r.state === "done" ? "text-emerald-600" : r.state === "short" || (r.state === "opt" && !ticks[r.stage]) ? "text-amber-600" : "text-slate-400"}`}>{note}</span>
                        </label>
                        {r.stage === "have" && cuCanShort(f, target) && (
                          <div className="pb-2 pl-6">
                            <label className="flex cursor-pointer items-center gap-2 text-sm">
                              <input type="checkbox" checked={!!ticks.short} onChange={(e) => toggleShort(e.target.checked)} className="h-4 w-4 accent-amber-500" />
                              <span className="flex-1 text-amber-700">⚠️ ยังขาดของอยู่</span>
                              <span className="text-[11px] text-slate-400">{ticks.short ? `ขาด ${missing.length} รายการ` : "ติ๊กถ้ายังมีของไม่ครบ"}</span>
                            </label>
                            {ticks.short && (snap.materials.length ? (
                              <div className="mt-2">
                                <div className="mb-1.5 text-[12px] text-slate-500">ขาดอะไรบ้าง? (ระบบเลือกตัวที่ยังไม่มีของให้ก่อน)</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {snap.materials.map((x) => {
                                    const on = missing.includes(x.sku);
                                    return (
                                      <button key={x.sku} type="button" onClick={() => setMissing((ms) => (on ? ms.filter((s) => s !== x.sku) : [...ms, x.sku]))}
                                        className={`inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[12px] ${on ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-700 hover:border-amber-300"}`}>
                                        {on && "⚠️"} {x.name} <span className="text-[11px] text-slate-400">· {MAT_LABEL[x.status] ?? x.status}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="mt-1.5 text-[11px] text-slate-400">ตัวที่ขาดจะไม่ถูกติ๊กเตรียม/ตัด → ยังขึ้นในหน้าขอซื้อให้ฝ่ายจัดซื้อเห็น</div>
                              </div>
                            ) : <div className="mt-1 text-[11px] text-slate-400">ใบนี้ยังไม่มีสูตร เลือกรายการของไม่ได้ — ระบบจะไม่ติดป้าย "ของครบ" ให้</div>)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : page === 2 ? (
          <div className="space-y-3">
            {/* แถบสรุป: ต้องแก้ / เตือน / วันที่ที่ยังว่าง */}
            <div className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-[13px] ${errs.length ? "bg-rose-50" : "bg-emerald-50"}`}>
              {errs.length
                ? <span className="inline-flex items-center gap-1 font-medium text-rose-700"><Icon name="cancel" /> ต้องแก้ {errs.length} จุด</span>
                : <span className="inline-flex items-center gap-1 font-medium text-emerald-700"><Icon name="done" /> บันทึกได้</span>}
              {warns.length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 text-[12px] text-amber-800"><Icon name="warning" /> เตือน {warns.length}</span>}
              {noDates > 0 && <span className="rounded-full bg-white/70 px-2 text-[12px] text-slate-500">ไม่ใส่วันที่ {noDates} ช่อง (ข้ามได้)</span>}
              {errs.length > 0 && <button type="button" onClick={goFirstError} className="ml-auto h-7 rounded-md border border-rose-300 bg-white px-2 text-[12px] text-rose-700 hover:bg-rose-100">ไปที่ช่องแรก</button>}
              {errs.length > 0 && <div className="w-full text-[12px] text-rose-700">{errs.slice(0, 3).map((x) => (x.where ? `${x.where}: ${x.msg}` : x.msg)).join(" · ")}{errs.length > 3 ? ` · และอีก ${errs.length - 3}` : ""}</div>}
            </div>
            {target === "cancel" && (
              <div id="cu-cancel" className="grid grid-cols-1 gap-3 rounded-lg border border-rose-200 bg-rose-50/50 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div>
                  <label className="mb-1 block text-[12px] text-rose-700">เหตุผลที่ยกเลิก (บังคับ)</label>
                  <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} placeholder="ลูกค้ายกเลิกออเดอร์"
                    className={`w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400${ring("cancel:reason")}`} />
                  <Msg field="cancel:reason" />
                </div>
                <div><label className={lbl}>ยกเลิกเมื่อ</label><DispatchDatePick value={dates.cancel} onChange={(v) => setDates((d) => ({ ...d, cancel: v }))} /><Msg field="cancel:date" /></div>
              </div>
            )}
            {(built.steps.some((s) => s.kind === "skip_buy" || s.kind === "mark_ready")) && (
              <section id="cu-ready" className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-sm font-medium text-slate-700">วัตถุดิบ / เตรียม / ตัด</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {built.steps.some((s) => s.kind === "skip_buy") && <div><label className={lbl}>ของครบเมื่อ</label><DispatchDatePick value={dates.have} onChange={(v) => setDates((d) => ({ ...d, have: v }))} /><Msg field="have:date" /></div>}
                  {built.steps.some((s) => s.kind === "mark_ready") && <div><label className={lbl}>เตรียม/ตัดเสร็จเมื่อ</label><DispatchDatePick value={dates.ready} onChange={(v) => setDates((d) => ({ ...d, ready: v }))} /><Msg field="ready:date" /></div>}
                </div>
              </section>
            )}
            {on("dispatch") && (
              <section id="cu-disp" className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">🚚 จ่ายงาน</span>
                  <span className={`text-[12px] ${dispTotal > remain + 0.0001 ? "font-medium text-rose-600" : "text-slate-500"}`}>จ่ายรวม {fmt(dispTotal)} / เหลือให้จ่าย {fmt(remain)} ชิ้น{dispTotal > remain + 0.0001 ? ` · เกิน ${fmt(dispTotal - remain)} ชิ้น` : ""}</span>
                  <SecBadge prefix="disp" />
                  {f.dispatched > 0 && <span className="text-[11px] text-slate-400">· ใส่ 0 ได้ ถ้าที่เหลือยังไม่ได้จ่ายจริง</span>}
                </div>
                <Msg field="disp" />
                <div className="mt-1 space-y-2">
                  {disp.map((r, i) => {
                    const d = deptOf(r.deptId), hire = isHireDesk(d?.name), pool = poolOf(d);
                    const k = `disp:${r.key}`;
                    return (
                      <div key={r.key} id={`cu-${k}`} className="rounded-lg bg-slate-50/70 p-2.5">
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1.4fr)_6rem_6.5rem_minmax(0,1fr)_auto]">
                          <div id={`cu-${k}:dept`}>
                            <label className={lbl}>{disp.length > 1 ? `แถว ${i + 1} · ` : ""}โต๊ะ</label>
                            <select value={r.deptId} onChange={(e) => setRow(r.key, { deptId: e.target.value, crewIds: [], ...(r.rateSet ? {} : { rate: centralRate }) })} className={`${numIn}${ring(`${k}:dept`)}`}>
                              <option value="">— เลือกโต๊ะ —</option>
                              {departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                            </select>
                            <Msg field={`${k}:dept`} />
                          </div>
                          <div id={`cu-${k}:qty`}>
                            <label className={lbl}>จำนวน</label>
                            <input type="number" min={0} step="any" max={Math.max(0, r2(remain - (dispTotal - (r.qty > 0 ? r.qty : 0))))} value={r.qty} onChange={(e) => setRow(r.key, { qty: Number(e.target.value) })} className={`${numIn}${ring(`${k}:qty`)}`} />
                            <Msg field={`${k}:qty`} />
                          </div>
                          <div id={`cu-${k}:rate`}>
                            <label className={lbl} title="ค่าแรงต่อชิ้น — ตั้งต้นจากราคากลางในสูตร (เลือกช่างคนเดียวที่มีเรตเฉพาะ = ใช้เรตนั้น) · ว่างได้">ค่าแรง/ชิ้น</label>
                            <input type="number" min={0} step="any" value={r.rate ?? ""} placeholder="ราคากลาง"
                              onChange={(e) => setRow(r.key, { rate: numOrNull(e.target.value), rateSet: true })} className={`${numIn}${ring(`${k}:rate`)}`} />
                            <Msg field={`${k}:rate`} />
                          </div>
                          <div id={`cu-${k}:date`}><label className={lbl}>วันที่จ่าย</label><DispatchDatePick value={r.date} onChange={(v) => setRow(r.key, { date: v })} /><Msg field={`${k}:date`} /></div>
                          {disp.length > 1 && (
                            <button type="button" title="ลบแถวนี้" onClick={() => { setDisp((rs) => rs.filter((x) => x.key !== r.key)); setRet((rs) => rs.map((x) => (x.ref === `new:${r.key}` ? { ...x, ref: "auto" } : x))); }}
                              className="mt-5 h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-rose-300 hover:text-rose-600">✕</button>
                          )}
                        </div>
                        {d && (
                          <div className="mt-2 flex items-center gap-2 text-[12px]">
                            <span className="text-slate-500">👥 {craftsmen.filter((c) => c.department_id === d.id).length} คนในโต๊ะ</span>
                            <button type="button" onClick={() => setDeskPanelFor((x) => (x === r.key ? null : r.key))} className="text-violet-700 hover:underline">{deskPanelFor === r.key ? "ปิดจัดคน ▴" : "จัดคนในโต๊ะ ▾"}</button>
                          </div>
                        )}
                        {d && deskPanelFor === r.key && (
                          <div className="mt-2">
                            <DeskStaffPanel dept={d} desks={departments} people={craftsmen} canMove={canMoveStaff} canAddNew={canAddNew} onChanged={() => onStaffChanged?.()}
                              wos={workOrders} onDesksChanged={(focus) => { onDesksChanged?.(); setRow(r.key, { deptId: focus ?? "", crewIds: [] }); }} />
                          </div>
                        )}
                        {d && (
                          <div id={`cu-${k}:crew`} className="mt-2">
                            <label className={lbl}>คนรับ {hire ? "(โต๊ะเหมา ต้องเลือกคน)" : "(เลือกได้หลายคน)"}</label>
                            <CrewPick people={pool} value={r.crewIds} required={hire} recent={lastCrewIds(workOrders, d.id, pool)}
                              flag={(pp) => defectOf(pp.name)}
                              onChange={(ids) => setRow(r.key, { crewIds: ids, ...(r.rateSet ? {} : { rate: rateFor(ids) }) })} />
                            <Msg field={`${k}:crew`} />
                          </div>
                        )}
                        {d && (
                          <input value={r.note ?? ""} onChange={(e) => setRow(r.key, { note: e.target.value })} placeholder="หมายเหตุถึงช่าง (ไม่บังคับ) เช่น ใช้ด้ายสีเข้ม"
                            className="mt-2 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        )}
                      </div>
                    );
                  })}
                </div>
                <button type="button" className={`${addBtn} mt-2`}
                  onClick={() => setDisp((rs) => [...rs, { key: nk("d"), deptId: rs[rs.length - 1]?.deptId ?? "", crewIds: [], qty: Math.max(0, r2(remain - dispTotal)), date: rs[rs.length - 1]?.date ?? null, rate: centralRate }])}>
                  ＋ เพิ่มแถวจ่าย (จ่ายหลายช่าง / หลายวัน)
                </button>
              </section>
            )}
            {on("return") && (
              <section id="cu-ret" className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">↩️ ช่างส่งคืน</span>
                  <span className={`text-[12px] ${retTotal > outstanding + 0.0001 ? "font-medium text-rose-600" : "text-slate-500"}`}>คืนรวม {fmt(retTotal)} / ค้างช่าง {fmt(outstanding)} ชิ้น{retTotal > outstanding + 0.0001 ? ` · เกิน ${fmt(retTotal - outstanding)} ชิ้น` : ""}</span>
                  {!retSet && ret.length === 1 && <span className="rounded-full bg-emerald-50 px-2 text-[11px] text-emerald-700">ตามยอดจ่ายอัตโนมัติ</span>}
                  <SecBadge prefix="ret" />
                </div>
                <Msg field="ret" />
                <div className="mt-1 space-y-2">
                  {ret.map((r, i) => {
                    const k = `ret:${r.key}`;
                    return (
                      <div key={r.key} id={`cu-${k}`} className="grid grid-cols-1 gap-2 rounded-lg bg-slate-50/70 p-2.5 sm:grid-cols-[minmax(0,1.5fr)_6rem_6.5rem_minmax(0,1fr)_auto]">
                        <div>
                          <label className={lbl}>{ret.length > 1 ? `รอบ ${i + 1} · ` : ""}ส่งจากใบไหน</label>
                          <select value={r.ref} onChange={(e) => setRetRow(r.key, { ref: e.target.value })} className={numIn}>
                            <option value="auto">อัตโนมัติ (ใบเก่าก่อน)</option>
                            {retOptions.map((o) => <option key={o.ref} value={o.ref}>{o.label}</option>)}
                          </select>
                        </div>
                        <div id={`cu-${k}:qty`}>
                          <label className={lbl}>จำนวน</label>
                          <input type="number" min={0} step="any" max={Math.max(0, r2(outstanding - (retTotal - (r.qty > 0 ? r.qty : 0))))} value={r.qty} onChange={(e) => { setRetSet(true); setRetRow(r.key, { qty: Number(e.target.value) }); }} className={`${numIn}${ring(`${k}:qty`)}`} />
                          <Msg field={`${k}:qty`} />
                        </div>
                        <div id={`cu-${k}:wage`}>
                          <label className={lbl} title="ค่าแรงต่อชิ้น — ว่าง = ยังไม่ลงค่าแรง (ไปใส่ทีหลังที่ตารางส่งงาน)">ค่าแรง/ชิ้น</label>
                          <input type="number" min={0} step="any" value={r.wage ?? ""} placeholder="ยังไม่ลง" onChange={(e) => setRetRow(r.key, { wage: numOrNull(e.target.value) })} className={`${numIn}${ring(`${k}:wage`)}`} />
                          <Msg field={`${k}:wage`} />
                        </div>
                        <div id={`cu-${k}:date`}><label className={lbl}>วันที่ส่งคืน</label><DispatchDatePick value={r.date} onChange={(v) => setRetRow(r.key, { date: v })} /><Msg field={`${k}:date`} /></div>
                        {ret.length > 1 && (
                          <button type="button" title="ลบรอบนี้" onClick={() => setRet((rs) => rs.filter((x) => x.key !== r.key))}
                            className="mt-5 h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-rose-300 hover:text-rose-600">✕</button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button type="button" className={`${addBtn} mt-2`}
                  onClick={() => { setRetSet(true); setRet((rs) => [...rs, { key: nk("r"), ref: "auto", qty: Math.max(0, r2(outstanding - retTotal)), date: null, wage: rs[rs.length - 1]?.wage ?? null }]); }}>
                  ＋ เพิ่มรอบส่งคืน (ส่งไม่พร้อมกัน)
                </button>
                <div className="mt-2 text-[11px] text-slate-500">💰 ค่าแรงว่าง หรือไม่ใส่วันที่ = ติดป้าย "ยังไม่ลงวันที่/ค่าแรง" ไปเติมทีหลังที่ตารางส่งงาน (เงินเดือนยังไม่นับ)</div>
              </section>
            )}
            {on("qc_in") && (
              <section id="cu-qc" className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">🗄️ QC รับเข้าชั้น</span>
                  <span className="text-[12px] text-slate-500">รอรับ {fmt(qcAvail)} ชิ้น</span>
                  {!qcSet && <span className="rounded-full bg-emerald-50 px-2 text-[11px] text-emerald-700">ตามยอดส่งคืนอัตโนมัติ</span>}
                  <SecBadge prefix="qc" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <div id="cu-qc:good">
                    <label className={lbl}>ของดี (ชิ้น)</label>
                    <input type="number" min={0} step="any" value={qc.good} onChange={(e) => { setQcSet(true); setQc((q) => ({ ...q, good: Number(e.target.value) })); }} className={`${numIn}${ring("qc:good")}`} />
                    <Msg field="qc:good" />
                  </div>
                  <div id="cu-qc:shelf">
                    <label className={lbl}>ชั้นที่วางของดี</label>
                    <select value={shelfId} onChange={(e) => setShelfId(e.target.value)} className={`${numIn}${ring("qc:shelf")}`}>
                      <option value="">— เลือกชั้น —</option>
                      {snap.shelves.filter((s) => s.kind !== "defect").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <Msg field="qc:shelf" />
                  </div>
                  <div>
                    <label className={lbl}>ของเสีย (ชิ้น)</label>
                    <input type="number" min={0} step="any" value={qc.bad} onChange={(e) => setQc((q) => ({ ...q, bad: Number(e.target.value) }))} className={numIn} />
                  </div>
                  <div id="cu-qc:date"><label className={lbl}>QC รับเข้าเมื่อ</label><DispatchDatePick value={dates.qc} onChange={(v) => setDates((d) => ({ ...d, qc: v }))} /><Msg field="qc:date" /></div>
                </div>
                {qc.bad > 0 && (
                  <div id="cu-qc:reason" className="mt-2">
                    <label className={lbl}>สาเหตุของเสีย (รายการเดียวกับหน้าโกดัง QC)</label>
                    {newReason === null ? (
                      <div className="flex gap-2">
                        <select value={badReason} onChange={(e) => setBadReason(e.target.value)} className={`${numIn}${ring("qc:reason")}`}>
                          <option value="">— เลือกสาเหตุ —</option>
                          {reasons.map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}
                        </select>
                        <button type="button" onClick={() => setNewReason("")} className="h-9 shrink-0 rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-indigo-700 hover:bg-indigo-50">＋ สาเหตุใหม่</button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <input value={newReason} onChange={(e) => setNewReason(e.target.value)} placeholder="เช่น เย็บเบี้ยว" className={numIn} autoFocus />
                        <button type="button" onClick={() => void addReason()} className="h-9 shrink-0 rounded-lg bg-indigo-600 px-3 text-[12px] text-white hover:bg-indigo-700">เพิ่ม</button>
                        <button type="button" onClick={() => setNewReason(null)} className="h-9 shrink-0 rounded-lg border border-slate-200 px-2 text-[12px]">ยกเลิก</button>
                      </div>
                    )}
                    <Msg field="qc:reason" />
                  </div>
                )}
              </section>
            )}
            {(on("ship") || on("close")) && (
              <section id="cu-close" className="rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-sm font-medium text-slate-700">{on("ship") && on("close") ? "📤 ส่งออก / 🏁 ปิดใบ" : on("ship") ? "📤 ส่งออกจาก QC" : "🏁 ปิดใบ"}</div>
                <Msg field="ship" /><Msg field="close" />
                {on("ship") && qc.good > 0 && <div className="mb-2 text-[12px] text-slate-500">ของดี {fmt(qc.good)} ชิ้นที่รับเข้า จะถูกส่งออกจากชั้นต่อทันที</div>}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {on("ship") && <div><label className={lbl}>ส่งออกเมื่อ</label><DispatchDatePick value={dates.ship} onChange={(v) => setDates((d) => ({ ...d, ship: v }))} /><Msg field="ship:date" /></div>}
                  {on("close") && <div><label className={lbl}>ปิดใบเมื่อ</label><DispatchDatePick value={dates.close} onChange={(v) => setDates((d) => ({ ...d, close: v }))} /><Msg field="close:date" /></div>}
                </div>
              </section>
            )}
            {bomOffer && (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-[13px] text-indigo-900">
                <input type="checkbox" checked={saveBom} onChange={(e) => setSaveBom(e.target.checked)} className="h-4 w-4 accent-indigo-600" />
                บันทึกค่าแรง ฿{fmt(bomCandidate!)}/ชิ้น กลับเข้าสูตร (BOM) เป็นราคากลาง
                <span className="text-[11px] text-indigo-700/70">{centralRate ? `เดิม ฿${fmt(centralRate)}` : "ยังไม่เคยตั้ง"} · เก็บประวัติเดิมไว้</span>
              </label>
            )}
            {target !== "cancel" && (
              <section id="cu-extra" className="rounded-lg border border-slate-200 p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">📝 ข้อมูลเพิ่มเติม</span>
                  <span className="text-[11px] text-slate-400">ไม่บังคับ · ปัญหาไปขึ้นที่กล่อง "ปัญหา" ของใบงานบนบอร์ด</span>
                </div>
                <div className="space-y-2">
                  {problems.map((pr, i) => (
                    <div key={pr.key} id={`cu-prob:${pr.key}`} className="rounded-lg bg-slate-50/70 p-2.5">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_auto]">
                        <div>
                          <label className={lbl}>ปัญหาที่เจอ {problems.length > 1 ? i + 1 : ""}</label>
                          <input value={pr.text} onChange={(e) => setProblems((ps) => ps.map((x) => (x.key === pr.key ? { ...x, text: e.target.value } : x)))}
                            placeholder="เช่น ผ้าไม่ตรงสี / เย็บเบี้ยว" className={numIn} />
                        </div>
                        <div>
                          <label className={lbl}>กี่ชิ้น</label>
                          <input type="number" min={0} step="any" value={pr.qty ?? ""} placeholder="—"
                            onChange={(e) => setProblems((ps) => ps.map((x) => (x.key === pr.key ? { ...x, qty: numOrNull(e.target.value) } : x)))} className={`${numIn}${ring(`prob:${pr.key}:qty`)}`} />
                          <Msg field={`prob:${pr.key}:qty`} />
                        </div>
                        <button type="button" title="ลบปัญหานี้" onClick={() => setProblems((ps) => ps.filter((x) => x.key !== pr.key))}
                          className="mt-5 h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-rose-300 hover:text-rose-600">✕</button>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {(Object.keys(CU_SEVERITY) as CuProblem["severity"][]).map((sv) => (
                          <button key={sv} type="button" onClick={() => setProblems((ps) => ps.map((x) => (x.key === pr.key ? { ...x, severity: sv } : x)))}
                            className={`h-7 rounded-full border px-2.5 text-[12px] ${pr.severity === sv
                              ? sv === "high" ? "border-rose-400 bg-rose-50 text-rose-700" : sv === "medium" ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-400 bg-slate-100 text-slate-700"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{CU_SEVERITY[sv]}</button>
                        ))}
                        <label className="ml-1 inline-flex cursor-pointer items-center gap-1 text-[12px] text-slate-600" title="จำไว้ที่รุ่นสินค้า (ทุกสี) — ครั้งหน้าที่จ่ายงานรุ่นนี้จะเตือน">
                          <input type="checkbox" checked={pr.model} onChange={(e) => setProblems((ps) => ps.map((x) => (x.key === pr.key ? { ...x, model: e.target.checked } : x)))} className="h-3.5 w-3.5 accent-indigo-600" />
                          จำเป็นปัญหาของรุ่นนี้ (ทุกสี)
                        </label>
                      </div>
                    </div>
                  ))}
                  <button type="button" className={addBtn} onClick={() => setProblems((ps) => [...ps, { key: nk("p"), text: "", severity: "medium", qty: null, model: false }])}>＋ แจ้งปัญหาที่เจอ</button>
                  <div>
                    <label className={lbl}>บันทึกถึงทีม (ต่อท้ายหมายเหตุของใบสั่งผลิต)</label>
                    <input value={teamNote} onChange={(e) => setTeamNote(e.target.value)} placeholder="เช่น ลูกค้าขอเลื่อนส่ง / ช่างลาป่วยครึ่งวัน" className={numIn} />
                  </div>
                </div>
              </section>
            )}
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <div className="mb-1 text-[12px] font-medium text-slate-500">ระบบจะบันทึก</div>
              {built.steps.length ? built.steps.map((s, i) => <div key={i} className="text-[13px] text-slate-700">• {cuStepLabel(s, whoOf)}</div>)
                : <div className="text-[13px] text-slate-400">—</div>}
              <div className="mt-1 text-[11px] text-slate-400">วันที่ที่ไม่ใส่ = จำไม่ได้ (ข้ามได้) · ทุกขั้นลงประวัติว่าใครอัปเดต · ไม่ส่งแจ้งเตือน LINE เรื่องงานเก่า</div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {built.steps.map((s, i) => {
              const r = results[i];
              const st = r ? (r.ok ? "ok" : "fail") : running === i ? "run" : results.length ? "skip" : "wait";
              return (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="w-5 shrink-0 text-center">{st === "ok" ? <Icon name="done" className="text-emerald-600" /> : st === "fail" ? <Icon name="cancel" className="text-rose-600" /> : st === "run" ? <Icon name="waiting" className="text-amber-600" /> : "▫️"}</span>
                  <div className="min-w-0">
                    <div className={st === "skip" ? "text-slate-400" : "text-slate-800"}>{cuStepLabel(s, whoOf)}</div>
                    {st === "fail" && <div className="text-[12px] text-rose-600">{r!.msg}</div>}
                    {st === "skip" && <div className="text-[11px] text-slate-400">ยังไม่ได้ทำ (ขั้นก่อนหน้าไม่สำเร็จ)</div>}
                  </div>
                </div>
              );
            })}
            {results.length > 0 && (results.every((r) => r.ok) && results.length === built.steps.length
              ? <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">อัปเดตแล้ว — บอร์ดโหลดใหม่ให้แล้ว</div>
              : <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">บันทึกได้บางขั้น — ขั้นที่สำเร็จเก็บไว้แล้ว เปิดป๊อปนี้ใหม่เพื่อทำต่อได้</div>)}
          </div>
        )}
    </ERPModal>
  );
}
