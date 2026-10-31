"use client";

/**
 * 🔄 อัปเดตงานเป็นชุด (โหมดอัปเดตงานของบอร์ดจ่ายงาน) — ติ๊กหลายใบ → ตารางเดียว 1 ใบ = 1 กลุ่มแถว
 *   แต่ละใบเลือก "ไปถึงขั้น" ได้เอง · แถวย่อยโผล่ตามขั้น: เตรียม/ตัด · จ่าย (หลายแถว · คนรับหลายคน) · ส่งคืน (ตามยอดจ่ายอัตโนมัติ / หลายรอบ)
 *   · QC รับเข้า (ชั้น · ดี/เสีย · สาเหตุ · วันที่) · ส่งออก · ปิดใบ · ยกเลิก · บันทึกถึงทีม
 *   "ใส่ทั้งหมดตามใบแรก" = ก๊อปขั้น/โต๊ะ/คน/วันที่/หมายเหตุของใบแรกไปทุกใบ (จำนวนตามใบนั้น · ค่าแรงตามสูตรของรุ่นนั้น)
 * กติกา/การบันทึก/ย้อน = ตัวเดียวกับป๊อปทีละใบ (./catch-up.ts cuBuildSteps / cuRun / cuUndo + ./catch-up-lines.ts)
 * ไม่มีสิทธิ์ "บันทึกได้เลย" = ส่งเป็นคำขอแยกรายใบ · หัวหน้าเปิดใบที่มีคำขอค้าง = ข้อมูลคำขอขึ้นให้ แก้ได้ แล้วยืนยันทีเดียวหลายใบ
 * ใบซับซ้อน (ยังขาดของบางรายการ / แจ้งปัญหา / จัดคนในโต๊ะ) → "เปิดแบบละเอียด" = ป๊อปทีละใบเดิม
 * ทำได้ไม่ครบ (ลดจำนวน) ใส่ได้รายใบ — "ใส่ทั้งหมดตามใบแรก" ไม่ก๊อป (จำนวนแต่ละใบไม่เท่ากัน)
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { Icon } from "@/components/icon";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { QC_WAREHOUSES } from "@/lib/qc-ship";
import { isHireDesk, todayYmd } from "@/lib/work-entry-rules";
import type { Assignee } from "@/app/api/mo/assignees/route";
import type { CatchUpSnapshot } from "@/app/api/mo/catch-up/route";
import type { CuRequest } from "@/app/api/mo/catch-up/requests/route";
import type { WorkOrder } from "@/app/api/mo/work-orders/route";
import { CrewPick, crewFields, crewList, lastCrewIds } from "./crew-pick";
import { DispatchDatePick } from "./dispatch-date-pick";
import {
  CU_TARGETS, CU_STAGE_LABEL, CU_NO_DATES, cuFacts, cuRows, cuDefaultTicks, cuDefaultQty, cuBuildSteps, cuTargetBlocked, cuStepLabel, cuRun, cuUndo,
  cuIrreversible, cuLocateSnap, cuFactsDiff, cuReduceSnap, type CuReduce,
  type CuDraft, type CuTargetKey, type CuTicks, type CuResult, type CuStage, type CuStep, type CuRetLine, type CuDates,
} from "./catch-up";
import { ReducePanel } from "./catch-up-reduce";
import { cuCentralRate, cuRateFor, cuRetSources, cuRateOfRef, cuRetEffective, cuAutoReturns, cuBomCandidate, cuReadLast, cuWriteLast, type CuDispRow } from "./catch-up-lines";

type DeptLite = { id: string; name: string };
/** สถานะของแต่ละใบในตาราง */
type Phase = "edit" | "running" | "done" | "sent";
type BRow = {
  moNo: string; snap: CatchUpSnapshot | null; err: string;
  /** คำขอที่ยังไม่จบของใบนี้ (ของฉัน / ของคนอื่น) */
  req: CuRequest | null;
  target: CuTargetKey | null; ticks: CuTicks;
  disp: CuDispRow[]; ret: CuRetLine[]; retSet: boolean;
  qcGood: number; qcBad: number; qcSet: boolean;
  dates: CuDates; shelfId: string; badReason: string; cancelReason: string; teamNote: string; saveBom: boolean;
  shipMode: "sales_wh" | "sell"; shipWh: string;
  /** ทำได้ไม่ครบ (ลดจำนวน) — null = ทำครบตามสั่ง */
  reduce: CuReduce | null;
  open: boolean; phase: Phase; results: CuResult[]; runMsg: string;
  undoRes: { msg: string; ok: boolean }[] | null;
};

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const r2 = (n: number) => Math.round(n * 100) / 100;
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
const inp = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const addBtn = "inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-indigo-300 px-3 text-[12px] text-indigo-700 hover:bg-indigo-50";
const xBtn = "h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-rose-300 hover:text-rose-600";
const stepTd = "whitespace-nowrap py-2 pl-3 pr-2 align-top text-[12px] font-medium text-slate-600";
const td = "px-2 py-2 align-top";
const flow = CU_TARGETS.filter((t) => t.key !== "cancel");

const emptyRow = (moNo: string): BRow => ({
  moNo, snap: null, err: "", req: null, target: null, ticks: {}, disp: [], ret: [], retSet: false, qcGood: 0, qcBad: 0, qcSet: false,
  dates: CU_NO_DATES, shelfId: "", badReason: "", cancelReason: "", teamNote: "", saveBom: true, shipMode: "sales_wh", shipWh: QC_WAREHOUSES[0], reduce: null,
  open: true, phase: "edit", results: [], runMsg: "", undoRes: null,
});

export function CatchUpBatch({ moNos, onClose, onDone, departments, craftsmen, workOrders, mode = "direct", canApprove = false, onRequestsChanged, onOpenSingle, onOpenEdit, refresh }: {
  /** ใบที่ติ๊กมา (null = ปิด) */
  moNos: string[] | null;
  onClose: () => void;
  /** บันทึกแล้วอย่างน้อย 1 ใบ → หน้าแม่โหลดบอร์ดใหม่ · ส่งรายการใบที่บันทึกไป (ขึ้น "เพิ่งอัปเดต") */
  onDone: (saved: string[]) => void;
  departments: DeptLite[]; craftsmen: Assignee[]; workOrders: WorkOrder[];
  mode?: "direct" | "request"; canApprove?: boolean;
  onRequestsChanged?: () => void;
  /** "เปิดแบบละเอียด" = ป๊อปทีละใบเดิม (เปิดซ้อนบนตาราง) */
  onOpenSingle: (moNo: string) => void;
  /** "แก้ไข" = ป๊อปแก้สิ่งที่บันทึกแล้ว (รวมขั้นก่อนหน้า / ลดจำนวน) — ปิดแล้วตารางโหลดใบนั้นใหม่ */
  onOpenEdit?: (moNo: string) => void;
  /** ป๊อปทีละใบปิดแล้ว → โหลดใบนั้นในตารางใหม่ (n เปลี่ยน = โหลด) */
  refresh?: { mo: string; n: number } | null;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<BRow[]>([]);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [allT, setAllT] = useState("");
  const seq = useRef(0);
  const nk = (p: string) => `${p}${++seq.current}`;

  // ── โต๊ะ / คน (กติกาเดียวกับป๊อปทีละใบ)
  const deptOf = (id: string) => departments.find((d) => d.id === id) ?? null;
  const poolOf = (d: DeptLite | null) => (d ? (isHireDesk(d.name) ? craftsmen : craftsmen.filter((c) => c.department_id === d.id)) : []);
  const nickOf = (full: string | null | undefined) => (full ?? "").split(", ").map((n) => craftsmen.find((c) => c.name === n)?.nickname?.trim() || n).filter(Boolean).join(", ");
  const crewNick = (r: CuDispRow) => poolOf(deptOf(r.deptId)).filter((c) => r.crewIds.includes(c.id)).map((c) => c.nickname?.trim() || c.name).join(", ");
  const dispLabel = (r: CuDispRow, i: number) => { const d = deptOf(r.deptId); const n = crewNick(r); return d ? `${d.name} · ${n || "ทั้งโต๊ะ"}` : `แถวจ่าย ${i + 1}`; };

  // ── โหลดข้อมูลตั้งต้นของทุกใบ (ทีละ 4 ใบ กันเซิร์ฟเวอร์หนัก) + คำขอที่ค้างของแต่ละใบ
  const loadOne = async (moNo: string): Promise<Partial<BRow>> => {
    try {
      const [r, rq] = await Promise.all([
        apiFetch(`/api/mo/catch-up?mo_no=${encodeURIComponent(moNo)}`),
        apiFetch(`/api/mo/catch-up/requests?mo_no=${encodeURIComponent(moNo)}`).then((x) => (x.ok ? x.json() : null)).catch(() => null),
      ]);
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "โหลดข้อมูลใบงานไม่สำเร็จ");
      const snap = j.data as CatchUpSnapshot;
      const req = (rq?.data?.open ?? null) as CuRequest | null;
      const base: Partial<BRow> = { snap, err: "", req };
      // คำขอที่ค้าง (ของฉันที่ยังรอ / หัวหน้าตรวจ) = ใส่ข้อมูลที่กรอกไว้ให้เลย แก้ต่อได้
      if (req?.draft && (req.mine ? req.status === "pending" : canApprove)) return { ...base, ...fromDraft(req.draft as CuDraft) };
      return base;
    } catch (e) { return { err: e instanceof Error ? e.message : "โหลดข้อมูลใบงานไม่สำเร็จ" }; }
  };
  const fromDraft = (d: CuDraft): Partial<BRow> => {
    seq.current = Math.max(seq.current, 1000);
    return {
      target: d.target, ticks: d.ticks ?? {}, disp: d.disp ?? [], ret: d.ret ?? [], retSet: !!d.retSet,
      qcGood: d.qc?.good ?? 0, qcBad: d.qc?.bad ?? 0, qcSet: !!d.qcSet, dates: { ...CU_NO_DATES, ...(d.dates ?? {}) },
      shelfId: d.shelfId ?? "", badReason: d.badReason ?? "", cancelReason: d.cancelReason ?? "", teamNote: d.teamNote ?? "", saveBom: d.saveBom !== false,
      shipMode: d.shipMode === "sell" ? "sell" : "sales_wh", shipWh: d.shipWh || QC_WAREHOUSES[0], reduce: d.reduce ?? null,
    };
  };
  const patchRow = (moNo: string, p: Partial<BRow> | ((r: BRow) => Partial<BRow>)) =>
    setRows((rs) => rs.map((r) => (r.moNo === moNo ? { ...r, ...(typeof p === "function" ? p(r) : p) } : r)));

  const key = moNos?.join("|") ?? "";
  useEffect(() => {
    if (!moNos?.length) { setRows([]); return; }
    setRows(moNos.map(emptyRow)); setReview(false); setAllT("");
    let alive = true;
    void (async () => {
      const queue = [...moNos];
      const work = async () => {
        while (alive && queue.length) {
          const mo = queue.shift()!;
          const p = await loadOne(mo);
          if (alive) patchRow(mo, p);
        }
      };
      await Promise.all([work(), work(), work(), work()]);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  // ป๊อปทีละใบ (เปิดแบบละเอียด) ปิดแล้ว → โหลดใบนั้นใหม่ (บันทึกจากป๊อปไปแล้ว = เริ่มใหม่จากข้อมูลล่าสุด)
  useEffect(() => {
    if (!refresh || !rows.some((r) => r.moNo === refresh.mo)) return;
    void (async () => { const p = await loadOne(refresh.mo); patchRow(refresh.mo, (r) => ({ ...emptyRow(r.moNo), open: r.open, ...p })); })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh?.n]);

  // ── เลือกขั้น = ค่าตั้งต้นเหมือนป๊อปทีละใบ (ติ๊กขั้นก่อนหน้า · จำนวนที่เหลือ · โต๊ะ/คน/ชั้นล่าสุด · ค่าแรงตามสูตร)
  const initFor = (r: BRow, k: CuTargetKey): Partial<BRow> => {
    const snap = cuReduceSnap(r.snap!, r.reduce); const f = cuFacts(snap);   // ค่าตั้งต้นตามจำนวนหลังลด (ถ้าลด)
    const q = cuDefaultQty(f, k);
    const last = cuReadLast();
    const lastDept = last.deptId ? departments.find((d) => d.id === last.deptId) ?? null : null;
    const lastCrew = lastDept ? (last.crewIds ?? []).filter((id) => poolOf(lastDept).some((c) => c.id === id)) : [];
    const good = snap.shelves.filter((s) => s.kind !== "defect");
    return {
      target: k, ticks: { ...cuDefaultTicks(f, k), short: false },
      disp: [{ key: nk("d"), deptId: lastDept?.id ?? "", crewIds: lastCrew, qty: q.dispatchQty, date: null, rate: cuRateFor(snap, lastCrew) }],
      ret: k === "return_part" ? [{ key: nk("r"), ref: "", qty: 0, date: null, wage: null }] : [], retSet: k === "return_part",
      qcGood: q.qcGood, qcBad: 0, qcSet: false,
      shelfId: good.length === 1 ? good[0].id : good.some((s) => s.id === last.shelfId) ? last.shelfId! : "",
      results: [], runMsg: "", undoRes: null,
    };
  };
  /** เปลี่ยนขั้นของใบที่กรอกไปแล้ว = เก็บแถวจ่าย/วันที่/ชั้น/ของเสียไว้ (ไม่ต้องกรอกใหม่) · คิดติ๊กกับยอดส่งคืน/ของดีใหม่ตามขั้น */
  const retarget = (r: BRow, k: CuTargetKey): Partial<BRow> => {
    const base = initFor(r, k);
    if (!r.target) return base;
    const part = k === "return_part" || r.target === "return_part";   // ส่งคืนบางส่วน ↔ ขั้นอื่น = ยอดส่งคืนคนละแบบ เริ่มใหม่
    return { ...base, disp: r.disp.length ? r.disp : base.disp, shelfId: r.shelfId || base.shelfId, qcBad: r.qcBad,
      ret: part ? base.ret : r.ret, retSet: part ? base.retSet : r.retSet };
  };

  /** ทุกอย่างที่คำนวณจากแถว: ขั้นที่จะทำ · ที่มาของส่งคืน · ขั้นที่จะบันทึก · ปัญหารายช่อง · สถานะ */
  const derive = (r: BRow) => {
    const snap = r.snap;
    if (!snap || !r.target) return null;
    // f0 = ของจริงตอนนี้ (ตัวตรวจลดจำนวนเองก่อน) · f/snapR = ภาพหลังลดจำนวน (ติ๊ก/ยอด/ส่งคืนจากใคร)
    const f0 = cuFacts(snap), snapR = cuReduceSnap(snap, r.reduce), f = cuFacts(snapR), k = r.target;
    const chk = cuRows(f, k, r.ticks);
    const on = (st: CuStage) => chk.some((x) => x.stage === st && (x.state === "need" || (x.state === "opt" && !!r.ticks[st])));
    const sources = cuRetSources(snapR, r.disp, on("dispatch"), { nickOf, newWho: crewNick, deskName: (x) => deptOf(x.deptId)?.name ?? null });
    const ret = r.retSet ? r.ret : cuAutoReturns(sources, r.ret);   // ตามยอดจ่ายอัตโนมัติ จนกว่าจะแก้เอง
    const retEff = cuRetEffective(ret, sources);
    const dispTotal = r2(r.disp.reduce((a, x) => a + (x.qty > 0 ? x.qty : 0), 0));
    const retTotal = r2(ret.reduce((a, x) => a + (x.qty > 0 ? x.qty : 0), 0));
    const remain = r2(Math.max(0, f.qty - f.dispatched));
    const outstanding = r2(Math.max(0, f.dispatched + (on("dispatch") ? dispTotal : 0) - f.received));
    const qcAvail = r2(Math.max(0, f.received + (on("return") ? retTotal : 0) - f.qcPulled));
    const qcGood = r.qcSet ? r.qcGood : r2(Math.max(0, qcAvail - (r.qcBad || 0)));
    const centralRate = cuCentralRate(snap);
    const bomCandidate = cuBomCandidate(r.disp, on("dispatch"), ret, on("return"));
    const bomOffer = bomCandidate != null && bomCandidate !== centralRate && !!snap.mo.product_sku;
    const built = cuBuildSteps(f0, k, r.ticks, {
      disp: r.disp.map((x) => ({ ...x, deskName: deptOf(x.deptId)?.name ?? null, crewCount: x.crewIds.length })),
      ret: retEff, qcGood, qcBad: r.qcBad, shelfId: r.shelfId, cancelReason: r.cancelReason, missing: [], dates: r.dates, badReason: r.badReason,
      centralRate, today: todayYmd(), problems: [], teamNote: r.teamNote, bomRate: bomOffer && r.saveBom ? bomCandidate : null, shipMode: r.shipMode, shipWh: r.shipWh,
      reduce: k === "cancel" ? null : r.reduce,
    }, snap.wos);
    const whoOf = (s: CuStep) => {
      if (s.kind === "dispatch") { const i = r.disp.findIndex((x) => x.key === s.line); return i >= 0 ? dispLabel(r.disp[i], i) : ""; }
      if (s.kind === "return") return s.ref === "auto" ? "แบ่งอัตโนมัติ" : sources.find((o) => o.ref === s.ref)?.short ?? "";
      return "";
    };
    const errs = built.issues.filter((x) => x.level === "error"), warns = built.issues.filter((x) => x.level === "warn");
    return { f, f0, chk, on, sources, ret, retEff, dispTotal, retTotal, remain, outstanding, qcAvail, qcGood, centralRate, bomCandidate, bomOffer, built, whoOf, errs, warns };
  };
  type D = NonNullable<ReturnType<typeof derive>>;

  /** โหมดของแต่ละใบ: บันทึกเลย / ส่งให้หัวหน้า / หัวหน้าตรวจคำขอ / มีคำขอของคนอื่นค้าง */
  const modeOf = (r: BRow) => {
    const reviewing = !!r.req && !r.req.mine && canApprove && !!r.req.draft;
    const editingMine = !!r.req && !!r.req.mine && r.req.status === "pending";
    const blockedBy = !!r.req && !reviewing && !editingMine;
    return { reviewing, editingMine, blockedBy, asRequest: !reviewing && (mode === "request" || editingMine) };
  };
  const readyOf = (r: BRow, d: D | null) => r.phase === "edit" && !!d && !modeOf(r).blockedBy && d.built.steps.length > 0 && d.errs.length === 0;

  // ── แก้ค่าในแถว
  const setDisp = (moNo: string, dk: string, p: Partial<CuDispRow>) => patchRow(moNo, (r) => ({ disp: r.disp.map((x) => (x.key === dk ? { ...x, ...p } : x)) }));
  /** แก้รอบส่งคืน: เก็บรอบที่เห็นอยู่ (รวมรอบอัตโนมัติ) ลงแถวก่อน แล้วค่อยแก้ — แก้จำนวน = เลิกตามยอดจ่ายอัตโนมัติ */
  /** ทำได้ไม่ครบ: แถวจ่ายแถวเดียวที่ยังเป็นยอดเหลือเดิม → ตามยอดเหลือใหม่ */
  const setReduce = (moNo: string, v: CuReduce | null) => patchRow(moNo, (x) => {
    if (!x.snap) return { reduce: v };
    const a = cuFacts(cuReduceSnap(x.snap, x.reduce)), b = cuFacts(cuReduceSnap(x.snap, v));
    const oldRemain = Math.max(0, a.qty - a.dispatched), newRemain = Math.max(0, b.qty - b.dispatched);
    return { reduce: v, disp: x.disp.length === 1 && Math.abs(x.disp[0].qty - oldRemain) < 0.0001 ? [{ ...x.disp[0], qty: newRemain }] : x.disp };
  });
  const setRet = (r: BRow, d: D, rk: string, p: Partial<CuRetLine>, manual = false) =>
    patchRow(r.moNo, { ret: d.ret.map((x, i) => (x.key === rk ? { ...x, ref: d.retEff[i]?.ref ?? x.ref, ...p } : x)), ...(manual ? { retSet: true } : {}) });

  // ── ใส่ทั้งหมดตามใบแรก
  const firstRow = rows.find((r) => r.snap && r.target && r.phase === "edit");
  const fillFromFirst = () => {
    const F = firstRow; if (!F) return;
    const Fd = derive(F);
    let skipped = 0;
    setRows(rows.map((r) => {
      if (r.moNo === F.moNo || !r.snap || r.phase !== "edit" || modeOf(r).blockedBy) return r;
      const k = F.target!;
      const f = cuFacts(cuReduceSnap(r.snap, r.reduce));
      if (cuTargetBlocked(f, k)) { skipped++; return r; }
      const base = { ...r, ...initFor(r, k) } as BRow;
      // ติ๊กขั้นที่เลือกได้ (ของครบ/เตรียม/ตัด) ตามใบแรก — เฉพาะขั้นที่ใบนี้ก็เลือกได้
      const opt = cuRows(f, k, base.ticks).filter((x) => x.state === "opt").map((x) => x.stage);
      const ticks = { ...base.ticks }; for (const st of opt) ticks[st] = !!F.ticks[st];
      // แถวจ่าย: โต๊ะ/คน/วันที่/หมายเหตุตามใบแรก · จำนวนแบ่งจากที่เหลือของใบนี้ (แถวสุดท้ายได้ที่เหลือ) · ค่าแรงที่พิมพ์เองก๊อป ไม่งั้นตามสูตรของรุ่นนี้
      let left = cuDefaultQty(f, k).dispatchQty;
      const disp = F.disp.map((x, i) => {
        const pool = poolOf(deptOf(x.deptId));
        const crewIds = x.crewIds.filter((id) => pool.some((c) => c.id === id));
        const qty = i === F.disp.length - 1 ? left : r2(Math.min(left, Math.max(0, x.qty)));
        left = r2(Math.max(0, left - qty));
        return { key: nk("d"), deptId: x.deptId, crewIds, qty, date: x.date, note: x.note, rateSet: x.rateSet, rate: x.rateSet ? x.rate : cuRateFor(r.snap, crewIds) };
      });
      const next: BRow = { ...base, ticks, disp, dates: { ...F.dates }, badReason: F.badReason, cancelReason: F.cancelReason, saveBom: F.saveBom, shipMode: F.shipMode, shipWh: F.shipWh, open: true,
        shelfId: r.snap.shelves.some((s) => s.id === F.shelfId) ? F.shelfId : base.shelfId };
      // วันที่ส่งคืน: ตามรอบของใบแรก (รอบที่เกินใช้วันรอบสุดท้าย) — จำนวนตามยอดจ่ายอัตโนมัติของใบนี้
      const nd = derive(next);
      if (nd && Fd && Fd.ret.length && k !== "return_part") next.ret = nd.ret.map((x, i) => ({ ...x, date: Fd.ret[Math.min(i, Fd.ret.length - 1)].date }));
      return next;
    }));
    setAllT("");
    if (skipped) toast.info(`ข้าม ${skipped} ใบ — เลือกขั้น "${CU_TARGETS.find((t) => t.key === F.target)?.label}" ไม่ได้ (เช่น จ่ายงานไปแล้วยกเลิกไม่ได้)`);
  };
  const setAllTarget = (k: CuTargetKey) => {
    let skipped = 0;
    setRows(rows.map((r) => {
      if (!r.snap || r.phase !== "edit" || modeOf(r).blockedBy) return r;
      if (cuTargetBlocked(cuFacts(r.snap), k)) { skipped++; return r; }
      return { ...r, ...retarget(r, k), open: true };
    }));
    if (skipped) toast.info(`ข้าม ${skipped} ใบที่เลือกขั้นนี้ไม่ได้`);
  };

  // ── บันทึก: ทีละใบตามลำดับ (ใบไหนพัง ใบอื่นทำต่อ) — กติกาเดียวกับป๊อปทีละใบ
  const postReq = async (body: Record<string, unknown>) => {
    const res = await apiFetch("/api/mo/catch-up/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j?.error) throw new Error(j?.error || "ทำรายการไม่สำเร็จ");
    return j as { data?: { id?: string; updated?: boolean } };
  };
  const api = async (url: string, body: unknown, method: "POST" | "PATCH" | "DELETE" = "POST") => {
    const res = await apiFetch(url, method === "DELETE" ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j?.error) throw new Error(res.status === 401 || res.status === 403 ? "คุณไม่มีสิทธิ์ทำขั้นนี้" : (j?.error || "บันทึกไม่สำเร็จ"));
    return j as Record<string, unknown>;
  };
  const draftOf = (r: BRow, d: D): CuDraft => ({
    v: 1, target: r.target!, ticks: r.ticks, disp: r.disp, ret: d.ret, retSet: r.retSet, qc: { good: d.qcGood, bad: r.qcBad }, qcSet: r.qcSet,
    dates: r.dates, shelfId: r.shelfId, badReason: r.badReason, cancelReason: r.cancelReason, missing: [], problems: [], teamNote: r.teamNote, saveBom: r.saveBom,
    shipMode: r.shipMode, shipWh: r.shipWh, facts: d.f0, reduce: r.reduce,
  });
  const saveAll = async () => {
    const list = rows.map((r) => ({ r, d: derive(r) })).filter((x) => readyOf(x.r, x.d)) as { r: BRow; d: D }[];
    if (!list.length) return;
    const direct = list.filter((x) => !modeOf(x.r).asRequest).length;
    if (direct > 0 && !(await askConfirm({ title: `บันทึก ${list.length} ใบ?`, confirmText: "บันทึก",
      message: <div className="space-y-1 text-sm"><div>ระบบจะบันทึกทีละใบตามลำดับ — ใบไหนไม่สำเร็จ ใบอื่นทำต่อ และย้อนได้ทีละใบ</div>{list.some((x) => modeOf(x.r).asRequest) && <div className="text-slate-500">ใบที่ต้องรอยืนยันจะส่งเป็นคำขอให้หัวหน้า</div>}</div> }))) return;
    setBusy(true); setReview(false);
    const saved: string[] = [];
    let reqChanged = false;
    for (const { r, d } of list) {
      const m = modeOf(r);
      const labels = d.built.steps.map((s) => cuStepLabel(s, d.whoOf));
      patchRow(r.moNo, { phase: "running", runMsg: "" });
      if (m.asRequest) {
        try {
          await postReq({ action: "submit", mo_no: r.moNo, target: r.target, draft: draftOf(r, d), summary: labels });
          patchRow(r.moNo, { phase: "sent", runMsg: "ส่งให้หัวหน้ายืนยันแล้ว" }); reqChanged = true;
        } catch (e) { patchRow(r.moNo, { phase: "edit", runMsg: e instanceof Error ? e.message : "ส่งคำขอไม่สำเร็จ" }); }
        continue;
      }
      if (m.reviewing) {
        try { await postReq({ action: "claim", id: r.req!.id, draft: draftOf(r, d), summary: labels }); }
        catch (e) { patchRow(r.moNo, { phase: "edit", runMsg: e instanceof Error ? e.message : "เริ่มบันทึกคำขอไม่สำเร็จ" }); continue; }
      }
      const ctxDisp: Record<string, { dept: DeptLite; who: Record<string, unknown> }> = {};
      for (const x of r.disp) { const dept = deptOf(x.deptId); if (dept) ctxDisp[x.key] = { dept, who: crewFields(crewList(x.crewIds, poolOf(dept)), dept.name) }; }
      const res = await cuRun(d.built.steps, { snap: r.snap!, disp: ctxDisp, shelfId: r.shelfId, badReason: r.badReason }, api, undefined, (s) => cuStepLabel(s, d.whoOf));
      const ok = res.length === d.built.steps.length && res.every((x) => x.ok);
      if (m.reviewing) {
        const steps = d.built.steps.map((s, i) => ({ label: labels[i], ok: !!res[i]?.ok, msg: res[i]?.msg ?? "ยังไม่ได้ทำ" }));
        let closed = false;
        for (let i = 0; i < 2 && !closed; i++) { try { await postReq({ action: "finish", id: r.req!.id, result: { ok, steps } }); closed = true; } catch { /* ลองใหม่ */ } }
        if (!closed) toast.error(`${r.snap!.mo.product_sku ?? r.moNo}: บันทึกงานแล้ว แต่ปิดคำขอไม่สำเร็จ — ตีกลับพร้อมหมายเหตุว่าบันทึกแล้ว (อย่ายืนยันซ้ำ)`);
        reqChanged = true;
      }
      if (res.some((x) => x.ok)) saved.push(r.moNo);
      const fail = res.find((x) => !x.ok);
      patchRow(r.moNo, { phase: res.some((x) => x.ok) ? "done" : "edit", results: res, runMsg: fail ? `ไม่สำเร็จที่ "${cuStepLabel(fail.step, d.whoOf)}" — ${fail.msg}` : "" });
    }
    setBusy(false);
    // จำโต๊ะ/คน/ชั้นของใบแรกที่บันทึก ไว้ให้ครั้งหน้า (ที่เดียวกับป๊อปทีละใบ)
    const d0 = list[0].r.disp.find((x) => x.deptId);
    cuWriteLast({ ...cuReadLast(), ...(d0 ? { deptId: d0.deptId, crewIds: d0.crewIds } : {}), ...(list[0].r.shelfId ? { shelfId: list[0].r.shelfId } : {}) });
    if (reqChanged) onRequestsChanged?.();
    if (saved.length) onDone(saved);
  };

  // ── ย้อนใบเดียว (ลบสิ่งที่เพิ่งบันทึก จากหลังไปหน้า) — ส่งออก/ปิด/ยกเลิกแล้ว = ย้อนไม่ได้
  const undoRow = async (r: BRow) => {
    if (!r.snap) return;
    const d = derive({ ...r, phase: "edit" });
    const lab = (s: CuStep) => cuStepLabel(s, d?.whoOf);
    const items = r.results.filter((x) => x.undo && x.undo.kind !== "none").map((x) => `• ${lab(x.step)}`);
    if (!(await askConfirm({ title: `ย้อนการอัปเดต ${r.snap.mo.product_sku ?? r.moNo}?`, variant: "danger", confirmText: "ย้อนกลับ",
      message: <div className="space-y-1 text-sm"><div>ระบบจะลบ/คืนสิ่งที่เพิ่งบันทึก:</div>{items.map((x, i) => <div key={i} className="text-slate-600">{x}</div>)}</div> }))) return;
    patchRow(r.moNo, { phase: "running" });
    const out = await cuUndo(r.results, { snap: r.snap, disp: {}, shelfId: r.shelfId, badReason: r.badReason }, api, lab);
    patchRow(r.moNo, { phase: "done", undoRes: out });
    if (out.some((x) => x.ok)) onDone([]);
  };

  // ── ข้อความ/กรอบเตือนรายช่อง
  const issueAt = (d: D, field: string) => d.built.issues.find((x) => x.field === field && x.level === "error") ?? d.built.issues.find((x) => x.field === field);
  const ring = (d: D, field: string) => { const i = issueAt(d, field); return !i ? "" : i.level === "error" ? " !border-rose-400 !bg-rose-50/40" : " !border-amber-400"; };
  const Msg = ({ d, field }: { d: D; field: string }): ReactNode => {
    const list = d.built.issues.filter((x) => x.field === field);
    return list.length ? <div className="mt-0.5 space-y-0.5">{list.map((x, i) => <div key={i} className={`text-[11px] ${x.level === "error" ? "text-rose-600" : "text-amber-700"}`}>{x.msg}</div>)}</div> : null;
  };

  const derived = rows.map((r) => ({ r, d: derive(r) }));
  const ready = derived.filter((x) => readyOf(x.r, x.d));
  const needFix = derived.filter((x) => x.r.phase === "edit" && x.d && !modeOf(x.r).blockedBy && x.d.errs.length > 0).length;
  const noTarget = derived.filter((x) => x.r.phase === "edit" && x.r.snap && !x.r.target && !modeOf(x.r).blockedBy).length;
  const doneN = rows.filter((r) => r.phase === "done" || r.phase === "sent").length;
  const reqN = ready.filter((x) => modeOf(x.r).asRequest).length;
  const dirty = rows.some((r) => r.phase === "edit" && !!r.target);
  const saveLabel = busy ? "กำลังบันทึก…" : !ready.length ? "ไม่มีใบที่พร้อม"
    : reqN === ready.length ? `ส่งให้หัวหน้ายืนยัน ${ready.length} ใบ` : `บันทึก ${ready.length} ใบที่พร้อม${reqN ? ` (ส่งคำขอ ${reqN})` : ""}`;

  const statusChip = (r: BRow, d: D | null): ReactNode => {
    const m = modeOf(r);
    const chip = (cls: string, icon: string, text: string, title?: string) => <span title={title} className={`inline-flex max-w-[22rem] items-center gap-1 truncate rounded-full px-2 py-0.5 text-[12px] ${cls}`}><Icon name={icon} />{text}</span>;
    if (r.err) return chip("bg-rose-50 text-rose-700", "cancel", r.err);
    if (!r.snap) return chip("bg-slate-100 text-slate-500", "waiting", "กำลังโหลด…");
    if (r.phase === "running") return chip("bg-sky-50 text-sky-700", "waiting", "กำลังบันทึก…");
    if (r.phase === "sent") return chip("bg-indigo-50 text-indigo-700", "request", r.runMsg || "ส่งให้หัวหน้าแล้ว");
    if (r.phase === "done") {
      const fail = r.results.find((x) => !x.ok);
      if (r.undoRes) return chip(r.undoRes.every((x) => x.ok) ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-800", "back", r.undoRes.every((x) => x.ok) ? "ย้อนแล้ว" : "ย้อนได้บางขั้น", r.undoRes.map((x) => x.msg).join("\n"));
      return fail ? chip("bg-amber-50 text-amber-800", "warning", `บันทึกได้บางขั้น — ${fail.msg}`, r.runMsg) : chip("bg-emerald-50 text-emerald-700", "done", "บันทึกแล้ว");
    }
    if (m.blockedBy) return chip("bg-slate-100 text-slate-600", "request", `มีคำขอของ ${r.req?.requested_name ?? "คนอื่น"} ค้าง — ข้ามใบนี้`);
    if (r.runMsg) return chip("bg-rose-50 text-rose-700", "cancel", r.runMsg);
    if (!r.target || !d) return chip("bg-slate-100 text-slate-500", "info", "ยังไม่เลือกขั้น");
    if (d.errs.length) return chip("bg-rose-50 text-rose-700", "cancel", d.errs[0].where ? `${d.errs[0].where}: ${d.errs[0].msg}` : d.errs[0].msg, d.errs.map((x) => (x.where ? `${x.where}: ${x.msg}` : x.msg)).join("\n"));
    if (d.warns.length) return chip("bg-amber-50 text-amber-800", "warning", `พร้อม · เตือน ${d.warns.length}`, d.warns.map((x) => (x.where ? `${x.where}: ${x.msg}` : x.msg)).join("\n"));
    return chip("bg-emerald-50 text-emerald-700", "done", m.asRequest ? "พร้อมส่งให้หัวหน้า" : "พร้อม");
  };

  /** แถวย่อยของ 1 ใบ ตามขั้นที่เลือก */
  const body = (r: BRow, d: D) => {
    const lock = r.phase !== "edit" || modeOf(r).blockedBy;
    const out: ReactNode[] = [];
    const k = r.target!;
    const sectionCls = lock ? "pointer-events-none opacity-60" : "";
    // ── ยกเลิกใบ
    if (k === "cancel") {
      out.push(
        <tr key="cancel" className={sectionCls}>
          <td className={stepTd}><span className="inline-flex items-center gap-1 text-rose-700"><Icon name="cancel" /> ยกเลิกใบ</span></td>
          <td className={td} colSpan={4}>
            <input value={r.cancelReason} onChange={(e) => patchRow(r.moNo, { cancelReason: e.target.value })} placeholder="เหตุผลที่ยกเลิก (บังคับ) เช่น ลูกค้ายกเลิกออเดอร์" className={`${inp}${ring(d, "cancel:reason")}`} />
            <Msg d={d} field="cancel:reason" />
          </td>
          <td className={td}><DispatchDatePick value={r.dates.cancel} onChange={(v) => patchRow(r.moNo, { dates: { ...r.dates, cancel: v } })} /><Msg d={d} field="cancel:date" /></td>
          <td className={td} colSpan={2} />
        </tr>);
      return out;
    }
    // ── ทำได้ไม่ครบ (ลดจำนวน) — ของจริงตอนนี้ ไม่ใช่ภาพหลังลด
    out.push(
      <tr key="reduce" className={sectionCls}>
        <td className={`${stepTd} font-normal text-slate-500`}>จำนวนที่ทำได้</td>
        <td className={td} colSpan={7}>
          <ReducePanel compact qty={r.snap!.mo.qty} received={d.f0.received} sized={!!r.snap!.mo.sized} wos={r.snap!.wos} value={r.reduce}
            onChange={(v) => setReduce(r.moNo, v)} issues={d.built.issues} />
        </td>
      </tr>);
    // ── ของครบ / เตรียม / ตัด: ติ๊กให้ตามขั้นที่เลือก (ขั้นที่ข้ามได้ = กดเอาออก) + วันที่เสร็จ
    const pre = d.chk.filter((x) => x.stage === "have" || x.stage === "prep" || x.stage === "cut");
    const hasSkip = d.built.steps.some((s) => s.kind === "skip_buy"), hasReady = d.built.steps.some((s) => s.kind === "mark_ready");
    if (pre.length) out.push(
      <tr key="pre" className={sectionCls}>
        <td className={stepTd}>ของครบ / เตรียม / ตัด</td>
        <td className={td} colSpan={4}>
          <div className="flex flex-wrap items-center gap-1.5">
            {pre.map((x) => {
              const label = CU_STAGE_LABEL[x.stage];
              if (x.state === "done") return <span key={x.stage} className="inline-flex h-7 items-center gap-1 rounded-full bg-slate-100 px-2.5 text-[12px] text-slate-500"><Icon name="done" /> {label} (มีแล้ว)</span>;
              if (x.state === "implied") return <span key={x.stage} className="inline-flex h-7 items-center rounded-full bg-slate-50 px-2.5 text-[12px] text-slate-400">{label} (รวมในเตรียม)</span>;
              if (x.state === "need") return <span key={x.stage} className="inline-flex h-7 items-center gap-1 rounded-full bg-indigo-600 px-2.5 text-[12px] text-white"><Icon name="done" /> {label}</span>;
              const onT = !!r.ticks[x.stage];
              return <button key={x.stage} type="button" onClick={() => patchRow(r.moNo, { ticks: { ...r.ticks, [x.stage]: !onT } })} title={onT ? "กดเอาออก (ทำข้ามไปก่อน)" : "กดเพื่อติ๊ก"}
                className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[12px] ${onT ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-500 hover:border-indigo-300"}`}>{onT && <Icon name="done" />}{label}</button>;
            })}
            {!d.f.buyDone && d.f.materials > 0 && k !== "have" && <span className="text-[11px] text-slate-400">ยังขาดของบางรายการ? กด &ldquo;เปิดแบบละเอียด&rdquo;</span>}
          </div>
        </td>
        <td className={td}>
          {hasSkip && <><div className="mb-0.5 text-[11px] text-slate-500">ของครบเมื่อ</div><DispatchDatePick value={r.dates.have} onChange={(v) => patchRow(r.moNo, { dates: { ...r.dates, have: v } })} /><Msg d={d} field="have:date" /></>}
          {hasReady && <><div className="mb-0.5 mt-1 text-[11px] text-slate-500">เตรียม/ตัดเสร็จเมื่อ</div><DispatchDatePick value={r.dates.ready} onChange={(v) => patchRow(r.moNo, { dates: { ...r.dates, ready: v } })} /><Msg d={d} field="ready:date" /></>}
        </td>
        <td className={td} colSpan={2} />
      </tr>);
    // ── จ่ายงาน (หลายแถว · คนรับหลายคน)
    if (d.on("dispatch")) {
      r.disp.forEach((x, i) => {
        const dept = deptOf(x.deptId), hire = isHireDesk(dept?.name), pool = poolOf(dept), fk = `disp:${x.key}`;
        out.push(
          <tr key={x.key} className={`bg-slate-50/40 ${sectionCls}`}>
            <td className={stepTd}><span className="inline-flex items-center gap-1"><Icon name="truck" /> จ่าย{r.disp.length > 1 ? ` #${i + 1}` : ""}</span></td>
            <td className={td}>
              <select value={x.deptId} onChange={(e) => setDisp(r.moNo, x.key, { deptId: e.target.value, crewIds: [], ...(x.rateSet ? {} : { rate: d.centralRate }) })} className={`${inp}${ring(d, `${fk}:dept`)}`}>
                <option value="">— เลือกโต๊ะ —</option>
                {departments.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <Msg d={d} field={`${fk}:dept`} />
            </td>
            <td className={`${td} min-w-[18rem]`}>
              {dept ? <CrewPick people={pool} value={x.crewIds} required={hire} recent={lastCrewIds(workOrders, dept.id, pool)}
                onChange={(ids) => setDisp(r.moNo, x.key, { crewIds: ids, ...(x.rateSet ? {} : { rate: cuRateFor(r.snap, ids) }) })} />
                : <span className="text-[12px] text-slate-400">เลือกโต๊ะก่อน</span>}
              <Msg d={d} field={`${fk}:crew`} />
            </td>
            <td className={td}>
              <input type="number" min={0} step="any" value={x.qty} onChange={(e) => setDisp(r.moNo, x.key, { qty: Number(e.target.value) })} className={`${inp}${ring(d, `${fk}:qty`)}`} />
              <Msg d={d} field={`${fk}:qty`} />
            </td>
            <td className={td}>
              <input type="number" min={0} step="any" value={x.rate ?? ""} placeholder={d.centralRate != null ? `ราคากลาง ฿${fmt(d.centralRate)}` : "ใส่ทีหลังได้"}
                onChange={(e) => setDisp(r.moNo, x.key, { rate: numOrNull(e.target.value), rateSet: true })} className={`${inp}${ring(d, `${fk}:rate`)}`} />
              {x.rateSet && x.rate != null && x.rate !== d.centralRate && <div className="mt-0.5 text-[11px] text-indigo-600">พิมพ์เอง</div>}
              <Msg d={d} field={`${fk}:rate`} />
            </td>
            <td className={td}><DispatchDatePick value={x.date} onChange={(v) => setDisp(r.moNo, x.key, { date: v })} /><Msg d={d} field={`${fk}:date`} /></td>
            <td className={td}>
              <input value={x.note ?? ""} onChange={(e) => setDisp(r.moNo, x.key, { note: e.target.value })} placeholder="หมายเหตุถึงช่าง" className={inp} />
            </td>
            <td className={td}>
              {r.disp.length > 1 && <button type="button" title="ลบแถวจ่ายนี้" className={xBtn}
                onClick={() => patchRow(r.moNo, (rr) => ({ disp: rr.disp.filter((y) => y.key !== x.key), ret: rr.ret.map((y) => (y.ref === `new:${x.key}` ? { ...y, ref: "auto" } : y)) }))}><Icon name="cancel" /></button>}
            </td>
          </tr>);
      });
      out.push(
        <tr key="disp-add" className={sectionCls}>
          <td />
          <td className="px-2 pb-2" colSpan={7}>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={addBtn}
                onClick={() => patchRow(r.moNo, (rr) => ({ disp: [...rr.disp, { key: nk("d"), deptId: rr.disp[rr.disp.length - 1]?.deptId ?? "", crewIds: [], qty: Math.max(0, r2(d.remain - d.dispTotal)), date: rr.disp[rr.disp.length - 1]?.date ?? null, rate: d.centralRate }] }))}>
                <Icon name="add" /> เพิ่มแถวจ่าย (หลายช่าง / หลายวัน)
              </button>
              <span className={`text-[12px] ${d.dispTotal > d.remain + 0.0001 ? "font-medium text-rose-600" : "text-slate-500"}`}>จ่ายรวม {fmt(d.dispTotal)} / เหลือให้จ่าย {fmt(d.remain)} ชิ้น</span>
              <Msg d={d} field="disp" />
            </div>
          </td>
        </tr>);
    }
    // ── ช่างส่งคืน (ตามยอดจ่ายอัตโนมัติ / หลายรอบ)
    if (d.on("return")) {
      out.push(
        <tr key="ret-h" className={sectionCls}>
          <td className={stepTd}><span className="inline-flex items-center gap-1"><Icon name="back" /> ช่างส่งคืน</span></td>
          <td className="px-2 py-2" colSpan={7}>
            <div className="flex flex-wrap items-center gap-3 text-[12px]">
              <label className="inline-flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={!r.retSet} disabled={k === "return_part"} onChange={(e) => patchRow(r.moNo, e.target.checked ? { retSet: false } : { retSet: true, ret: d.ret.map((x, i) => ({ ...x, ref: d.retEff[i]?.ref ?? x.ref })) })} className="h-4 w-4 accent-indigo-600" />
                ตามยอดจ่ายอัตโนมัติ (คืนตามช่างที่จ่าย)
              </label>
              <span className={d.retTotal > d.outstanding + 0.0001 ? "font-medium text-rose-600" : "text-slate-500"}>คืนรวม {fmt(d.retTotal)} / ค้างช่าง {fmt(d.outstanding)} ชิ้น</span>
              <Msg d={d} field="ret" />
            </div>
          </td>
        </tr>);
      d.ret.forEach((x, i) => {
        const fk = `ret:${x.key}`, ref = d.retEff[i]?.ref ?? "auto", src = cuRateOfRef(d.sources, ref);
        out.push(
          <tr key={x.key} className={`bg-slate-50/40 ${sectionCls}`}>
            <td className={`${stepTd} pl-7 font-normal`}>รอบ {i + 1}</td>
            <td className={td} colSpan={2}>
              {!r.retSet || d.sources.length <= 1
                ? <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700">{d.sources.find((o) => o.ref === ref)?.short ?? "แบ่งอัตโนมัติ"}</div>
                : <select value={ref} onChange={(e) => setRet(r, d, x.key, { ref: e.target.value })} className={inp}>
                    {d.sources.map((o) => <option key={o.ref} value={o.ref}>{o.label}</option>)}
                    <option value="auto">แบ่งให้อัตโนมัติ (คนที่จ่ายก่อนได้ก่อน)</option>
                  </select>}
            </td>
            <td className={td}>
              <input type="number" min={0} step="any" value={x.qty} onChange={(e) => setRet(r, d, x.key, { qty: Number(e.target.value) }, true)} className={`${inp}${ring(d, `${fk}:qty`)}`} />
              <Msg d={d} field={`${fk}:qty`} />
            </td>
            <td className={td}>
              <input type="number" min={0} step="any" value={x.wage ?? ""} placeholder={src != null ? `ตามใบจ่าย ฿${fmt(src)}` : "ยังไม่ลง"}
                onChange={(e) => setRet(r, d, x.key, { wage: numOrNull(e.target.value) })} className={`${inp}${ring(d, `${fk}:wage`)}${x.wage == null && src != null ? " !border-emerald-200 !bg-emerald-50/60" : ""}`} />
              <Msg d={d} field={`${fk}:wage`} />
            </td>
            <td className={td}><DispatchDatePick value={x.date} onChange={(v) => setRet(r, d, x.key, { date: v })} /><Msg d={d} field={`${fk}:date`} /></td>
            <td className={td} />
            <td className={td}>
              {r.retSet && d.ret.length > 1 && <button type="button" title="ลบรอบนี้" className={xBtn} onClick={() => patchRow(r.moNo, { ret: d.ret.filter((y) => y.key !== x.key) })}><Icon name="cancel" /></button>}
            </td>
          </tr>);
      });
      if (r.retSet) out.push(
        <tr key="ret-add" className={sectionCls}>
          <td />
          <td className="px-2 pb-2" colSpan={7}>
            <button type="button" className={addBtn}
              onClick={() => patchRow(r.moNo, { retSet: true, ret: [...d.ret.map((x, j) => ({ ...x, ref: d.retEff[j]?.ref ?? x.ref })), { key: nk("r"), ref: "", qty: Math.max(0, r2(d.outstanding - d.retTotal)), date: null, wage: null }] })}>
              <Icon name="add" /> เพิ่มรอบส่งคืน (ส่งไม่พร้อมกัน)
            </button>
          </td>
        </tr>);
    }
    // ── QC รับเข้าชั้น
    if (d.on("qc_in")) {
      const shelves = r.snap!.shelves.filter((s) => s.kind !== "defect");
      out.push(
        <tr key="qc" className={sectionCls}>
          <td className={stepTd}><span className="inline-flex items-center gap-1"><Icon name="warehouse" /> QC รับเข้า</span></td>
          <td className={td}>
            <select value={r.shelfId} onChange={(e) => patchRow(r.moNo, { shelfId: e.target.value })} className={`${inp}${ring(d, "qc:shelf")}`}>
              <option value="">— ชั้นที่วางของดี —</option>
              {shelves.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Msg d={d} field="qc:shelf" />
          </td>
          <td className={td}>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-slate-500">ดี</span>
              <input type="number" min={0} step="any" value={d.qcGood} onChange={(e) => patchRow(r.moNo, { qcSet: true, qcGood: Number(e.target.value) })} className={`${inp} !w-24${ring(d, "qc:good")}`} />
              <span className="text-slate-500">เสีย</span>
              <input type="number" min={0} step="any" value={r.qcBad} onChange={(e) => patchRow(r.moNo, { qcBad: Number(e.target.value) })} className={`${inp} !w-20${ring(d, "qc:bad")}`} />
              <span className="text-[11px] text-slate-400">รอรับ {fmt(d.qcAvail)}{!r.qcSet ? " · ของดีตามยอดส่งคืน" : ""}</span>
            </div>
            <Msg d={d} field="qc:good" /><Msg d={d} field="qc:bad" />
          </td>
          <td className={td} colSpan={2} />
          <td className={td}><div className="mb-0.5 text-[11px] text-slate-500">รับเข้าเมื่อ</div><DispatchDatePick value={r.dates.qc} onChange={(v) => patchRow(r.moNo, { dates: { ...r.dates, qc: v } })} /><Msg d={d} field="qc:date" /></td>
          <td className={td}>
            {r.qcBad > 0 && <>
              <select value={r.badReason} onChange={(e) => patchRow(r.moNo, { badReason: e.target.value })} className={`${inp}${ring(d, "qc:reason")}`}>
                <option value="">— สาเหตุของเสีย —</option>
                {(r.snap!.reasons ?? []).map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}
              </select>
              <Msg d={d} field="qc:reason" />
            </>}
          </td>
          <td />
        </tr>);
    }
    // ── ส่งออก / ปิดใบ
    if (d.on("ship")) out.push(
      <tr key="ship" className={sectionCls}>
        <td className={stepTd}><span className="inline-flex items-center gap-1"><Icon name="export" /> ส่งออกจาก QC</span></td>
        <td className={td} colSpan={2}>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <select value={r.shipMode} onChange={(e) => patchRow(r.moNo, { shipMode: e.target.value === "sell" ? "sell" : "sales_wh" })} className={`${inp} !w-40`}>
              <option value="sales_wh">เข้าคลังขาย</option><option value="sell">ขายออกเลย</option>
            </select>
            {r.shipMode === "sales_wh" && <select value={r.shipWh} onChange={(e) => patchRow(r.moNo, { shipWh: e.target.value })} className={`${inp} !w-40`}>{QC_WAREHOUSES.map((w) => <option key={w} value={w}>{w}</option>)}</select>}
          </div>
          <Msg d={d} field="ship" />
        </td>
        <td className={td} colSpan={2} />
        <td className={td}><DispatchDatePick value={r.dates.ship} onChange={(v) => patchRow(r.moNo, { dates: { ...r.dates, ship: v } })} /><Msg d={d} field="ship:date" /></td>
        <td className={td} colSpan={2} />
      </tr>);
    if (d.on("close")) out.push(
      <tr key="close" className={sectionCls}>
        <td className={stepTd}><span className="inline-flex items-center gap-1"><Icon name="finish" /> ปิดใบ</span></td>
        <td className={td} colSpan={4}><Msg d={d} field="close" />
          {d.errs.some((x) => x.field === "close") && !r.reduce && d.built.received > 0 && (
            <button type="button" onClick={() => setReduce(r.moNo, { qty: d.built.received, pick: "ช่างส่งคืนไม่ครบ", detail: "", mode: "drop" })}
              className="mt-1 h-8 rounded-lg border border-amber-300 bg-amber-50 px-3 text-[12px] font-medium text-amber-900 hover:bg-amber-100">ปิดยอดขาด: ลดเหลือ {fmt(d.built.received)}</button>
          )}
        </td>
        <td className={td}><DispatchDatePick value={r.dates.close} onChange={(v) => patchRow(r.moNo, { dates: { ...r.dates, close: v } })} /><Msg d={d} field="close:date" /></td>
        <td className={td} colSpan={2} />
      </tr>);
    // ── เพิ่มเติม: บันทึกถึงทีม + ค่าแรงกลับเข้า BOM
    out.push(
      <tr key="extra" className={sectionCls}>
        <td className={`${stepTd} font-normal text-slate-400`}>เพิ่มเติม</td>
        <td className={td} colSpan={4}>
          <input value={r.teamNote} onChange={(e) => patchRow(r.moNo, { teamNote: e.target.value })} placeholder="บันทึกถึงทีม (ไม่บังคับ — ต่อท้ายหมายเหตุใบสั่งผลิต)" className={inp} />
        </td>
        <td className={td} colSpan={3}>
          {d.bomOffer && (
            <label className="flex cursor-pointer items-start gap-1.5 text-[12px] text-indigo-900">
              <input type="checkbox" checked={r.saveBom} onChange={(e) => patchRow(r.moNo, { saveBom: e.target.checked })} className="mt-0.5 h-4 w-4 accent-indigo-600" />
              <span>บันทึกค่าแรง ฿{fmt(d.bomCandidate!)}/ชิ้น กลับเข้าสูตร (BOM) <span className="text-indigo-700/70">{d.centralRate ? `เดิม ฿${fmt(d.centralRate)}` : "ยังไม่เคยตั้ง"}</span></span>
            </label>
          )}
        </td>
      </tr>);
    return out;
  };

  return (
    <ERPModal open={!!moNos?.length} onClose={() => { if (!busy) onClose(); }} size="xl" title={`อัปเดตงานเป็นชุด · ${rows.length} ใบ`} hasUnsavedChanges={dirty && !busy}
      storageKey="wb-catchup-batch"
      footer={<>
        <span className="mr-auto text-[12px] text-slate-500">
          {doneN > 0 && <>บันทึก/ส่งแล้ว {doneN} ใบ · </>}พร้อม {ready.length} ใบ{needFix ? ` · ต้องแก้ ${needFix} ใบ (ข้ามไว้ก่อน)` : ""}{noTarget ? ` · ยังไม่เลือกขั้น ${noTarget} ใบ` : ""}
        </span>
        <button type="button" onClick={() => setReview((v) => !v)} disabled={busy || !ready.length} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm hover:bg-slate-50 disabled:opacity-40"><Icon name="list" /> {review ? "ซ่อนสรุป" : "ตรวจก่อนบันทึก"}</button>
        <button type="button" onClick={onClose} disabled={busy} className="h-9 rounded-lg border border-slate-200 px-4 text-sm disabled:opacity-40">{doneN && !dirty ? "ปิด" : "ยกเลิก"}</button>
        <button type="button" onClick={() => void saveAll()} disabled={busy || !ready.length} className="h-9 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">{saveLabel}</button>
      </>}>
      <div className="space-y-3">
        {/* แถบบน: ตั้งขั้นทุกใบ · ใส่ทั้งหมดตามใบแรก */}
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px]">
          <span className="text-slate-600">ทุกใบไปถึงขั้น</span>
          <select value={allT} disabled={busy} onChange={(e) => { setAllT(e.target.value); if (e.target.value) setAllTarget(e.target.value as CuTargetKey); }} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm">
            <option value="">— เลือก —</option>
            {flow.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            <option value="cancel">ยกเลิกใบ</option>
          </select>
          <button type="button" disabled={busy || !firstRow || rows.length < 2} onClick={fillFromFirst}
            title={firstRow ? `ก๊อปขั้น โต๊ะ คนรับ วันที่ หมายเหตุ ของ ${firstRow.snap?.mo.product_sku ?? firstRow.moNo} ไปทุกใบ (จำนวนตามใบนั้น · ค่าแรงตามสูตรของรุ่นนั้น)` : "เลือกขั้นของใบแรกก่อน"}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-indigo-300 bg-white px-3 text-sm text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"><Icon name="list" /> ใส่ทั้งหมดตามใบแรก</button>
          <span className="text-[11px] text-slate-400">ใบไหนซับซ้อน (ยังขาดของบางรายการ / แจ้งปัญหา / จัดคนในโต๊ะ) กด &ldquo;เปิดแบบละเอียด&rdquo;</span>
          {mode === "request" && <span className="ml-auto rounded-full bg-indigo-50 px-2 py-0.5 text-[12px] text-indigo-700">อัปเดตของคุณจะส่งให้หัวหน้ายืนยันก่อน (แยกทีละใบ)</span>}
        </div>

        {review && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
            <div className="mb-2 text-sm font-medium text-indigo-900">จะอัปเดตอะไรบ้าง ({ready.length} ใบ)</div>
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {ready.map(({ r, d }) => (
                <div key={r.moNo} className="rounded-lg bg-white px-3 py-2 text-[12px]">
                  <div className="font-medium text-slate-800">{r.snap!.mo.product_sku ?? r.moNo} <span className="font-normal text-slate-400">· {r.moNo}{modeOf(r).asRequest ? " · ส่งคำขอ" : modeOf(r).reviewing ? " · ยืนยันคำขอ" : ""}</span></div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-slate-600">{d!.built.steps.map((s, i) => <li key={i}>{cuStepLabel(s, d!.whoOf)}</li>)}</ul>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[1180px] border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-slate-50 text-left text-[12px] text-slate-500">
              <tr>
                <th className="w-36 py-2 pl-3 pr-2 font-medium">ขั้นตอน</th>
                <th className="w-48 px-2 py-2 font-medium">โต๊ะ / ส่งคืนจาก / ชั้น</th>
                <th className="px-2 py-2 font-medium">คนรับ / ของดี · เสีย</th>
                <th className="w-24 px-2 py-2 font-medium">จำนวน</th>
                <th className="w-36 px-2 py-2 font-medium">ค่าแรง/ชิ้น</th>
                <th className="w-44 px-2 py-2 font-medium">วันที่</th>
                <th className="w-52 px-2 py-2 font-medium">หมายเหตุ / สาเหตุเสีย</th>
                <th className="w-12 px-2 py-2" />
              </tr>
            </thead>
            {derived.map(({ r, d }) => {
              const m = modeOf(r), f = r.snap ? cuFacts(r.snap) : null;   // ของจริงตอนนี้ (เทียบกับตอนส่งคำขอ)
              const where = r.snap ? cuLocateSnap(r.snap) : null;
              const diff = m.reviewing && f && (r.req?.draft as CuDraft | null)?.facts ? cuFactsDiff((r.req!.draft as CuDraft).facts, f) : [];
              const canUndo = r.phase === "done" && !r.undoRes && r.results.some((x) => x.undo && x.undo.kind !== "none") && !cuIrreversible(r.results);
              return (
                <tbody key={r.moNo} className="border-t-2 border-slate-200">
                  <tr className="bg-white">
                    <td colSpan={8} className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => patchRow(r.moNo, { open: !r.open })} className="h-7 w-7 shrink-0 rounded-md text-slate-500 hover:bg-slate-100" aria-label={r.open ? "ย่อ" : "ขยาย"}>{r.open ? "▾" : "▸"}</button>
                        <span className="font-semibold text-slate-800">{r.snap?.mo.product_sku ?? r.moNo}</span>
                        {r.snap?.mo.product_name && <span className="max-w-[16rem] truncate text-slate-500">{r.snap.mo.product_name}</span>}
                        <span className="text-[12px] text-slate-400">{r.moNo}{f ? ` · สั่งผลิต ${fmt(f.qty)} ชิ้น` : ""}</span>
                        {where && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600" title="ตอนนี้ของอยู่ไหน (ก่อนบันทึก)">ตอนนี้: {where.parts.map((p) => `${p.label}${p.qty != null ? ` ${fmt(p.qty)}` : ""}`).join(" · ")}</span>}
                        {r.snap && f && (
                          <select value={r.target ?? ""} disabled={r.phase !== "edit" || m.blockedBy || busy}
                            onChange={(e) => { const k = e.target.value as CuTargetKey; if (k) patchRow(r.moNo, (rr) => ({ ...retarget(rr, k), open: true })); }}
                            className={`h-8 rounded-lg border bg-white px-2 text-[13px] ${r.target ? "border-indigo-300" : "border-amber-300"}`}>
                            <option value="">— ไปถึงขั้นไหน —</option>
                            {CU_TARGETS.map((t) => { const b = cuTargetBlocked(f, t.key); return <option key={t.key} value={t.key} disabled={!!b} title={b ?? undefined}>{t.label}{b ? " (เลือกไม่ได้)" : ""}</option>; })}
                          </select>
                        )}
                        {statusChip(r, d)}
                        {m.reviewing && r.phase === "edit" && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">คำขอจาก {r.req?.requested_name ?? "พนักงาน"}</span>}
                        <span className="flex-1" />
                        {canUndo && <button type="button" onClick={() => void undoRow(r)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[12px] text-slate-600 hover:bg-slate-50"><Icon name="back" /> ย้อน</button>}
                        {r.snap && r.phase === "edit" && <button type="button" onClick={() => onOpenSingle(r.moNo)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[12px] text-slate-600 hover:bg-slate-50"><Icon name="open" /> เปิดแบบละเอียด</button>}
                        {r.snap && r.phase === "edit" && onOpenEdit && <button type="button" onClick={() => onOpenEdit(r.moNo)} title="แก้สิ่งที่บันทึกไปแล้ว (รวมขั้นก่อนหน้า)" className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[12px] text-slate-600 hover:bg-slate-50"><Icon name="edit" /> แก้ไข</button>}
                        {r.phase === "edit" && !busy && <button type="button" title="เอาใบนี้ออกจากชุด" onClick={() => setRows((rs) => rs.filter((x) => x.moNo !== r.moNo))} className="h-8 w-8 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="cancel" /></button>}
                      </div>
                      {diff.length > 0 && <div className="mt-1.5 rounded-md bg-amber-50 px-2 py-1 text-[12px] text-amber-900">ใบนี้เปลี่ยนไปหลังส่งคำขอ — ตรวจก่อนยืนยัน: {diff.join(" · ")}</div>}
                      {r.phase === "done" && r.results.length > 0 && (
                        <div className="mt-1.5 space-y-0.5 text-[12px]">
                          {r.results.map((x, i) => <div key={i} className={x.ok ? "text-emerald-700" : "text-rose-600"}>{x.ok ? "✓" : "✕"} {x.msg}</div>)}
                          {r.undoRes?.map((x, i) => <div key={`u${i}`} className={x.ok ? "text-slate-500" : "text-amber-700"}>{x.ok ? "↶" : "!"} {x.msg}</div>)}
                        </div>
                      )}
                    </td>
                  </tr>
                  {r.open && r.target && d && r.phase !== "done" && body(r, d)}
                </tbody>
              );
            })}
          </table>
        </div>
      </div>
    </ERPModal>
  );
}
