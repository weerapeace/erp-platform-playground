"use client";

/**
 * 🔄 ป๊อป "อัปเดตงาน" (โหมดอัปเดตงานของบอร์ดจ่ายงาน) — บอกระบบว่าใบนี้ไปถึงขั้นไหนแล้วจริงๆ
 *   ขั้น 1: เลือกสถานะปัจจุบันจากเส้นขั้นตอน → ติ๊กขั้นก่อนหน้าให้ (ของครบ/เตรียม/ตัด เอาออกได้ · ติ๊ก "ยังขาดของ" ได้)
 *   ขั้น 2: เติมเฉพาะข้อมูลที่ยังไม่มี — จ่ายงานหลายแถว · ส่งคืนหลายรอบ · ทุกขั้นมีวันที่ (ข้ามได้)
 *           เตือนรายช่อง (กรอบแดง = ต้องแก้ · เหลือง = เตือน) ด้วยกฎกลาง lib/work-entry-rules ตัวเดียวกับป๊อปจ่ายงานปกติ
 *   ขั้น 3: ผลการบันทึกทีละขั้น (พังขั้นไหน หยุดตรงนั้น บอกว่าสำเร็จถึงไหน)
 *   ไม่มีสิทธิ์ "บันทึกได้เลย" (mode="request") = ส่งให้หัวหน้ายืนยันก่อน (/api/mo/catch-up/requests) · หัวหน้าเปิดใบที่มีคำขอค้าง = ข้อมูลที่พนักงานกรอกขึ้นให้ แก้ได้ แล้ว "ยืนยันและบันทึก" / "ตีกลับ"
 * กติกาทั้งหมดอยู่ที่ ./catch-up.ts (ทดสอบแล้ว) · ข้อมูลตั้งต้นจาก GET /api/mo/catch-up
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ERPModal } from "@/components/modal";
import { askConfirm, askText } from "@/components/modal/ask-dialog";
import { QC_WAREHOUSES } from "@/lib/qc-ship";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { apiFetch } from "@/lib/api";
import { defectNote, isHireDesk, todayYmd } from "@/lib/work-entry-rules";
import type { Assignee } from "@/app/api/mo/assignees/route";
import type { CatchUpSnapshot } from "@/app/api/mo/catch-up/route";
import type { CuRequest } from "@/app/api/mo/catch-up/requests/route";
import { CrewPick, crewFields, crewList, lastCrewIds } from "./crew-pick";
import { DispatchDatePick } from "./dispatch-date-pick";
import { DeskStaffPanel } from "./desk-staff-panel";
import type { WorkOrder } from "@/app/api/mo/work-orders/route";
import {
  CU_TARGETS, CU_STAGE_LABEL, CU_NO_DATES, cuFacts, cuRows, cuDefaultTicks, cuDefaultQty, cuBuildSteps, cuTargetBlocked, cuStepLabel, cuRun, cuStageDone, cuCanShort,
  CU_SEVERITY, cuUndo, cuIrreversible, cuFactsDiff, cuWhen, cuLocateSnap, CU_WHERE_LABEL, type CuWhere, type CuDraft, type CuTargetKey, type CuTicks, type CuResult, type CuStage, type CuStep, type CuRetLine, type CuDates, type CuIssue, type CuProblem,
} from "./catch-up";
import { cuCentralRate, cuRateFor, cuRetSources, cuRateOfRef, cuRetEffective, cuAutoReturns, cuBomCandidate, cuReadLast as readLast, cuWriteLast as writeLast, type CuDispRow } from "./catch-up-lines";

type DeptLite = { id: string; name: string };
type DispRow = CuDispRow;

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

export function CatchUpModal({ moNo, onClose, onDone, departments, craftsmen, workOrders, canMoveStaff = false, canAddNew = false, onStaffChanged, onDesksChanged, onNext, nextLabel, mode = "direct", canApprove = false, onRequestsChanged, onLocate }: {
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
  /** direct = บันทึกเลย · request = ส่งให้หัวหน้ายืนยันก่อน (ไม่มีสิทธิ์ work_board.catch_up_direct) */
  mode?: "direct" | "request";
  /** ยืนยัน/แก้/ตีกลับ คำขอของคนอื่นได้ (work_board.catch_up_approve) — เปิดใบที่มีคำขอค้าง = โหมดตรวจ */
  canApprove?: boolean;
  /** ส่ง/ยกเลิก/ยืนยัน/ตีกลับ คำขอแล้ว → หน้าแม่โหลดคิวใหม่ */
  onRequestsChanged?: () => void;
  /** "ไปดูใบนี้ในตาราง" หลังบันทึก — หน้าแม่สลับไปแท็บ "ทั้งหมด" + ค้นใบนี้ */
  onLocate?: (moNo: string, sku: string | null) => void;
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
  const [shipMode, setShipMode] = useState<"sales_wh" | "sell">("sales_wh");   // ส่งออกจาก QC ไปไหน (เหมือนหน้าโกดัง QC)
  const [shipWh, setShipWh] = useState(QC_WAREHOUSES[0]);
  const [undoRes, setUndoRes] = useState<{ msg: string; ok: boolean }[] | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [running, setRunning] = useState(-1);
  const [results, setResults] = useState<CuResult[]>([]);
  // ── คำขออัปเดตงาน (พนักงานส่ง → หัวหน้ายืนยัน)
  const [req, setReq] = useState<CuRequest | null>(null);              // คำขอที่ยังไม่จบของใบนี้
  const [rejected, setRejected] = useState<CuRequest | null>(null);    // คำขอล่าสุดของฉันที่ถูกตีกลับ
  const [sent, setSent] = useState<{ updated: boolean } | null>(null);  // ส่งคำขอแล้ว (หน้า 3)
  const [reqBusy, setReqBusy] = useState(false);
  const [wageOpen, setWageOpen] = useState<Record<string, boolean>>({});   // รอบส่งคืนที่กด "เปลี่ยน" ค่าแรง (ไม่ใช้ค่าแรงตามใบจ่าย)
  const [whereNow, setWhereNow] = useState<CuWhere | null>(null);         // หลังบันทึก: ตอนนี้ของอยู่ไหน
  const seq = useRef(0);
  const nk = (p: string) => `${p}${++seq.current}`;

  useEffect(() => {
    if (!moNo) return;
    setSnap(null); setLoadErr(""); setPage(1); setTarget(null); setTicks({}); setDisp([]); setRet([]); setRetSet(false); setQcSet(false); setDates(CU_NO_DATES);
    setShelfId(""); setBadReason(""); setNewReason(null); setCancelReason(""); setMissing([]); setDeskPanelFor(null); setResults([]); setRunning(-1);
    setProblems([]); setTeamNote(""); setSaveBom(true); setShipMode("sales_wh"); setShipWh(QC_WAREHOUSES[0]); setUndoRes(null); setUndoing(false);
    setWageOpen({}); setWhereNow(null);
    setReq(null); setRejected(null); setSent(null); setReqBusy(false);
    let alive = true;
    void (async () => {
      try {
        const [r, rq] = await Promise.all([
          apiFetch(`/api/mo/catch-up?mo_no=${encodeURIComponent(moNo)}`),
          apiFetch(`/api/mo/catch-up/requests?mo_no=${encodeURIComponent(moNo)}`).then((x) => (x.ok ? x.json() : null)).catch(() => null),
        ]);
        const j = await r.json();
        if (!alive) return;
        if (!r.ok || j.error) throw new Error(j.error || "โหลดข้อมูลใบงานไม่สำเร็จ");
        const s = j.data as CatchUpSnapshot;
        const open = (rq?.data?.open ?? null) as CuRequest | null;
        const rej = (rq?.data?.rejected ?? null) as CuRequest | null;
        setSnap(s); setReasons(s.reasons ?? []); setReq(open); setRejected(open ? null : rej);
        // เปิดใบที่มีคำขอค้าง (ของฉันเอง / หัวหน้าตรวจ) = ใส่ข้อมูลที่กรอกไว้ให้เลย แก้ต่อได้ทุกช่อง
        if (open?.draft && (open.mine ? open.status === "pending" : canApprove)) hydrate(open.draft as CuDraft);
      } catch (e) { if (alive) setLoadErr(e instanceof Error ? e.message : "โหลดข้อมูลใบงานไม่สำเร็จ"); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moNo]);

  const f = useMemo(() => (snap ? cuFacts(snap) : null), [snap]);
  /** ค่าแรง/ชิ้นจากสูตร: เรตเฉพาะช่าง (เลือกคนเดียว) → ไม่งั้นราคากลาง (กติกาเดียวกับป๊อปจ่ายงานปกติ) */
  const centralRate = cuCentralRate(snap);
  const rateFor = (crewIds: string[]) => cuRateFor(snap, crewIds);

  const pick = (k: CuTargetKey) => {
    if (!f) return;
    setTarget(k); setTicks((t) => ({ ...cuDefaultTicks(f, k), short: k !== "have" && cuCanShort(f, k) ? t.short : false }));
    const q = cuDefaultQty(f, k);
    // ใช้โต๊ะ/คนรับ/ชั้นล่าสุด (ถ้ายังมีอยู่) — ไล่ใบค้างชุดเดียวกันไม่ต้องเลือกซ้ำ
    const last = readLast();
    const lastDept = last.deptId ? departments.find((d) => d.id === last.deptId) ?? null : null;
    const lastCrew = lastDept ? (last.crewIds ?? []).filter((id) => poolOf(lastDept).some((c) => c.id === id)) : [];
    setDisp([{ key: nk("d"), deptId: lastDept?.id ?? "", crewIds: lastCrew, qty: q.dispatchQty, date: null, rate: lastCrew.length ? rateFor(lastCrew) : centralRate }]);
    // ส่งคืน: ปกติ = 1 รอบต่อ 1 ช่างที่จ่าย (ตามยอดอัตโนมัติ) · ส่งคืนบางส่วน = 1 รอบว่าง ให้ใส่จำนวนเอง
    setRet(k === "return_part" ? [{ key: nk("r"), ref: "", qty: 0, date: null, wage: null }] : []);
    setRetSet(k === "return_part"); setQcSet(false);
    setQc({ good: q.qcGood, bad: 0 });
    const good = snap?.shelves.filter((s) => s.kind !== "defect") ?? [];
    setShelfId(good.length === 1 ? good[0].id : good.some((s) => s.id === last.shelfId) ? last.shelfId! : "");
  };
  /** ใส่ข้อมูลจากคำขอ (ที่พนักงานกรอกไว้) กลับเข้าป๊อป */
  const hydrate = (d: CuDraft) => {
    seq.current = Math.max(seq.current, 1000);   // กันคีย์แถวใหม่ซ้ำกับแถวในคำขอ
    setTarget(d.target); setTicks(d.ticks ?? {}); setDisp(d.disp ?? []); setRet(d.ret ?? []); setRetSet(!!d.retSet);
    setQc(d.qc ?? { good: 0, bad: 0 }); setQcSet(!!d.qcSet); setDates({ ...CU_NO_DATES, ...(d.dates ?? {}) });
    setShelfId(d.shelfId ?? ""); setBadReason(d.badReason ?? ""); setCancelReason(d.cancelReason ?? ""); setMissing(d.missing ?? []);
    setProblems(d.problems ?? []); setTeamNote(d.teamNote ?? ""); setSaveBom(d.saveBom !== false);
    setShipMode(d.shipMode === "sell" ? "sell" : "sales_wh"); setShipWh(d.shipWh || QC_WAREHOUSES[0]);
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

  // ── ส่งคืนจากใคร: ใบจ่ายเดิมที่ยังค้างช่าง + แถวจ่ายใหม่ — เรียกด้วยชื่อเล่นช่าง (ไม่ใช่เลขใบ)
  const nickOf = (full: string | null | undefined) => (full ?? "").split(", ").map((n) => craftsmen.find((c) => c.name === n)?.nickname?.trim() || n).filter(Boolean).join(", ");
  const retSources = cuRetSources(snap, disp, on("dispatch"), {
    nickOf,
    newWho: (r) => poolOf(deptOf(r.deptId)).filter((c) => r.crewIds.includes(c.id)).map((c) => c.nickname?.trim() || c.name).join(", "),
    deskName: (r) => deptOf(r.deptId)?.name ?? null,
  });
  const srcSig = retSources.map((s) => `${s.ref}:${s.cap}`).join("|");
  /** รอบที่ยังไม่ได้เลือกที่มา = ช่างที่จ่าย (ตามลำดับรอบ) · ไม่มีใครค้าง = แบ่งอัตโนมัติ */
  /** ค่าแรง/ชิ้นตามใบจ่ายของที่มานั้น · "แบ่งอัตโนมัติ" = ใช้ได้เมื่อทุกที่มาราคาเดียวกัน */
  const rateOf = (ref: string): number | null => cuRateOfRef(retSources, ref);
  // ค่าแรงที่พิมพ์เองมาก่อน · ไม่ได้พิมพ์ = ตามใบจ่าย (เจ้าของ: "ไม่ต้องใส่ก็ได้เพราะมีข้อมูลข้างบนอยู่แล้ว")
  const retEff = cuRetEffective(ret, retSources);
  // ── ยอดตามกันอัตโนมัติ (จนกว่าจะพิมพ์แก้เอง): ส่งคืน = 1 รอบต่อ 1 ช่างที่จ่าย (ยอดเท่าที่ค้าง) · ของดี QC ← ยอดส่งคืน
  useEffect(() => {
    if (!target || retSet || !retSources.length) return;
    setRet((rs) => cuAutoReturns(retSources, rs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, retSet, srcSig]);
  useEffect(() => {
    if (!target || qcSet) return;
    const g = r2(Math.max(0, qcAvail - (qc.bad || 0)));
    if (qc.good !== g) setQc((q) => ({ ...q, good: g }));
  }, [target, qcSet, qcAvail, qc.bad, qc.good]);
  /** ชื่อโต๊ะ/คน ที่โชว์ในสรุปขั้น */
  const whoOf = (s: CuStep) => {
    if (s.kind === "dispatch") { const r = disp.find((x) => x.key === s.line); return r ? dispLabel(r) : ""; }
    if (s.kind === "return") return s.ref === "auto" ? "แบ่งอัตโนมัติ" : retSources.find((o) => o.ref === s.ref)?.short ?? "";
    return "";
  };

  // ค่าแรง/ชิ้นที่พิมพ์เอง (ต่างจากราคากลางในสูตร) → เสนอบันทึกกลับเข้า BOM
  const bomCandidate = cuBomCandidate(disp, on("dispatch"), ret, on("return"));
  const bomOffer = bomCandidate != null && bomCandidate !== centralRate && !!snap?.mo.product_sku;
  const built = f && target
    ? cuBuildSteps(f, target, ticks, {
        disp: disp.map((r) => ({ ...r, deskName: deptOf(r.deptId)?.name ?? null, crewCount: r.crewIds.length })),
        ret: retEff, qcGood: qc.good, qcBad: qc.bad, shelfId, cancelReason, missing, dates, badReason, centralRate, today: todayYmd(),
        problems, teamNote, bomRate: bomOffer && saveBom ? bomCandidate : null, shipMode, shipWh,
      }, snap?.wos ?? [])
    : { steps: [] as CuStep[], errors: [] as string[], issues: [] as CuIssue[] };
  // เตือนงานเสียของช่างที่เลือก (ข้อมูลอยู่ฝั่งจอ) — เตือนเฉย ๆ บันทึกได้
  const defectIssues: CuIssue[] = on("dispatch") ? disp.flatMap((r) => crewList(r.crewIds, poolOf(deptOf(r.deptId)))
    .map((c) => ({ c, d: defectOf(c.name) })).filter((x) => x.d)
    .map((x) => ({ level: "warn" as const, field: `disp:${r.key}:crew`, msg: `${x.c.name} ${x.d}` }))) : [];
  // เช็กใบขาย (จับคู่รหัสสินค้า) ตอนส่งออก/ปิดใบ — เตือนเฉย ๆ บันทึกได้
  const sales = snap?.sales ?? { so: [], dn: [] };
  const salesField = on("close") ? "close" : "ship";
  const salesIssues: CuIssue[] = !(on("close") || on("ship")) ? []
    : !sales.so.length ? [{ level: "warn", field: salesField, msg: "ยังไม่พบใบขายของสินค้านี้ — ตรวจว่าเก็บเข้าสต๊อก หรือขายแล้วแต่ยังไม่ได้ลงใบขาย" }]
    : !sales.dn.some((d) => d.delivered) ? [{ level: "warn", field: salesField, msg: `มีใบขายแล้ว (${sales.so.map((x) => x.no).slice(0, 2).join(", ")}) แต่ยังไม่มีใบส่งของที่ส่งแล้ว` }]
    : [];
  const issues = [...built.issues, ...defectIssues, ...salesIssues];
  // ── ตอนนี้ → หลังบันทึก (บอกว่าแต่ละหัวข้อจะเปลี่ยนเป็นอะไร + ใบย้ายไปแท็บไหนบนบอร์ด)
  const dispAfter = f ? r2(f.dispatched + (on("dispatch") ? dispTotal : 0)) : 0;
  const retAfter = f ? r2(f.received + (on("return") ? retTotal : 0)) : 0;
  const qcAfter = f ? r2(f.qcPulled + (on("qc_in") ? (qc.good || 0) + (qc.bad || 0) : 0)) : 0;
  const tabOf = (s: { status: string; disp: number; ret: number; qc: number; qty: number }) =>
    s.status === "done" || s.status === "cancelled" ? "หายจากบอร์ด (ปิด/ยกเลิกแล้ว)"
      : s.disp < s.qty - 0.0001 ? "รอจ่าย" : s.ret < s.disp - 0.0001 ? "กำลังผลิต" : s.ret > s.qc + 0.0001 ? "รอ QC รับเข้า" : "ไม่อยู่บนบอร์ดแล้ว (โกดัง QC / รอปิดใบ) — หาได้ที่แท็บ \"ทั้งหมด\"";
  const tabBefore = f ? tabOf({ status: f.status, disp: f.dispatched, ret: f.received, qc: f.qcPulled, qty: f.qty }) : "";
  const tabAfter = f ? tabOf({ status: target === "cancel" ? "cancelled" : on("close") ? "done" : f.status, disp: dispAfter, ret: retAfter, qc: qcAfter, qty: f.qty }) : "";
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

  // ── โหมดของป๊อป: บันทึกเลย / ส่งให้หัวหน้า / หัวหน้าตรวจคำขอ / ใบนี้มีคำขอของคนอื่นค้าง
  const reviewing = !!req && !req.mine && canApprove && !!req.draft;
  const editingMine = !!req && !!req.mine && req.status === "pending";
  const blockedBy = !!req && !reviewing && !editingMine;
  const asRequest = !reviewing && (mode === "request" || editingMine);
  const reqDraft = (req?.draft ?? null) as CuDraft | null;
  const reqDiff = reviewing && f && reqDraft?.facts ? cuFactsDiff(reqDraft.facts, f) : [];
  const stepLabels = built.steps.map((s) => cuStepLabel(s, whoOf));
  const draftNow = (): CuDraft | null => (f && target
    ? { v: 1, target, ticks, disp, ret, retSet, qc, qcSet, dates, shelfId, badReason, cancelReason, missing, problems, teamNote, saveBom, shipMode, shipWh, facts: f }
    : null);
  const postReq = async (body: Record<string, unknown>) => {
    const r = await apiFetch("/api/mo/catch-up/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error || "ทำรายการไม่สำเร็จ");
    return j as { data?: { id?: string; updated?: boolean } };
  };

  const save = async () => {
    if (!snap || !built.steps.length) return;
    if (errs.length) { goFirstError(); return; }
    // ส่งให้หัวหน้ายืนยัน — ยังไม่บันทึกอะไรลงใบงาน
    if (asRequest) {
      setReqBusy(true);
      try {
        const j = await postReq({ action: "submit", mo_no: snap.mo.mo_no, target, draft: draftNow(), summary: stepLabels });
        setSent({ updated: !!j.data?.updated }); setPage(3); onRequestsChanged?.();
        const d0 = disp.find((r) => r.deptId);
        writeLast({ ...readLast(), ...(d0 ? { deptId: d0.deptId, crewIds: d0.crewIds } : {}), ...(shelfId ? { shelfId } : {}) });
      } catch (e) { toast.error(e instanceof Error ? e.message : "ส่งคำขอไม่สำเร็จ"); }
      finally { setReqBusy(false); }
      return;
    }
    // หัวหน้ายืนยันคำขอ: จองคำขอก่อน (กันสองคนยืนยันซ้อน) แล้วบันทึกด้วยสิทธิ์ของหัวหน้าเอง
    if (reviewing) {
      setReqBusy(true);
      try { await postReq({ action: "claim", id: req!.id, draft: draftNow(), summary: stepLabels }); }
      catch (e) { setReqBusy(false); toast.error(e instanceof Error ? e.message : "เริ่มบันทึกคำขอไม่สำเร็จ"); return; }
      setReqBusy(false);
    }
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
    if (reviewing) {
      // ปิดคำขอพร้อมผลทีละขั้น (แจ้งเตือนกลับไปหาคนส่ง) — ลอง 2 ครั้ง กันเน็ตสะดุด
      const steps = built.steps.map((s, i) => ({ label: cuStepLabel(s, whoOf), ok: !!res[i]?.ok, msg: res[i]?.msg ?? "ยังไม่ได้ทำ" }));
      const ok = res.length === built.steps.length && res.every((x) => x.ok);
      let closed = false;
      for (let i = 0; i < 2 && !closed; i++) { try { await postReq({ action: "finish", id: req!.id, result: { ok, steps } }); closed = true; } catch { /* ลองใหม่ */ } }
      if (!closed) toast.error("บันทึกงานแล้ว แต่ปิดคำขอไม่สำเร็จ — คำขอยังค้างในคิว ให้กด \"ตีกลับ\" พร้อมหมายเหตุว่าบันทึกแล้ว (อย่ายืนยันซ้ำ)");
      onRequestsChanged?.();
    }
    if (res.some((x) => x.ok)) {
      const d0 = disp.find((r) => r.deptId);
      writeLast({ ...readLast(), ...(d0 ? { deptId: d0.deptId, crewIds: d0.crewIds } : {}), ...(shelfId ? { shelfId } : {}) });
      onDone();
      void locateNow(snap.mo.mo_no);
    }
  };
  /** ตอนนี้ของอยู่ไหน (ข้อมูลหลังบันทึก — ใบหลุดจากแท็บบนบอร์ดแล้วจะได้หาเจอ) */
  const locateNow = async (no: string) => {
    try {
      const r = await apiFetch(`/api/mo/catch-up?mo_no=${encodeURIComponent(no)}`);
      const j = await r.json();
      if (r.ok && j?.data) setWhereNow(cuLocateSnap(j.data as CatchUpSnapshot));
    } catch { /* ไม่รู้ตำแหน่งก็ยังดูผลได้ */ }
  };

  const rejectReq = async () => {
    if (!req) return;
    const who = req.requested_name ?? "พนักงาน";
    const note = await askText({ title: "ตีกลับคำขอนี้?", message: `บอก ${who} ว่าต้องแก้อะไร — ระบบแจ้งเตือนกลับไปให้ (ยังไม่มีอะไรถูกบันทึกลงใบงาน)`,
      placeholder: "เช่น จำนวนส่งคืนไม่ตรง / ลืมใส่วันที่ส่ง", required: true, confirmText: "ตีกลับ", variant: "danger" });
    if (note === null) return;
    setReqBusy(true);
    try { await postReq({ action: "reject", id: req.id, note }); toast.success(`ตีกลับให้ ${who} แล้ว`); onRequestsChanged?.(); if (onNext) onNext(); else onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ตีกลับไม่สำเร็จ"); }
    finally { setReqBusy(false); }
  };
  const cancelReq = async () => {
    if (!req || !(await askConfirm({ title: "ยกเลิกคำขอนี้?", message: "หัวหน้าจะไม่เห็นคำขอนี้แล้ว (ยังไม่มีอะไรถูกบันทึกลงใบงาน)", confirmText: "ยกเลิกคำขอ", variant: "danger" }))) return;
    setReqBusy(true);
    try { await postReq({ action: "cancel", id: req.id }); toast.success("ยกเลิกคำขอแล้ว"); setReq(null); onRequestsChanged?.(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ยกเลิกคำขอไม่สำเร็จ"); }
    finally { setReqBusy(false); }
  };

  // ── ย้อนการอัปเดตนี้ (ลบสิ่งที่เพิ่งสร้าง จากหลังไปหน้า) — ส่งออก/ปิด/ยกเลิกแล้ว = ย้อนไม่ได้
  const undo = async () => {
    if (!snap) return;
    const items = results.filter((r) => r.undo && r.undo.kind !== "none").map((r) => `• ${cuStepLabel(r.step, whoOf)}`);
    if (!(await askConfirm({ title: "ย้อนการอัปเดตนี้?", variant: "danger", confirmText: "ย้อนกลับ",
      message: <div className="space-y-1 text-sm"><div>ระบบจะลบ/คืนสิ่งที่เพิ่งบันทึก:</div>{items.map((x, i) => <div key={i} className="text-slate-600">{x}</div>)}</div> }))) return;
    setUndoing(true);
    const ctxDisp: Record<string, { dept: DeptLite; who: Record<string, unknown> }> = {};
    const out = await cuUndo(results, { snap, disp: ctxDisp, shelfId, badReason }, async (url, body, method = "POST") => {
      const r = await apiFetch(url, method === "DELETE" ? { method } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(r.status === 401 || r.status === 403 ? "คุณไม่มีสิทธิ์ย้อนขั้นนี้" : (j?.error || "ย้อนไม่สำเร็จ"));
      return j as Record<string, unknown>;
    }, (s) => cuStepLabel(s, whoOf));
    setUndoing(false); setUndoRes(out); setWhereNow(null);
    if (out.some((x) => x.ok)) onDone();
  };
  const irreversible = cuIrreversible(results);
  const canUndo = results.some((r) => r.undo && r.undo.kind !== "none");
  // ── ยังต้องตามต่อ (หลังบันทึก)
  const followUps = !results.length ? [] : [
    ...(() => {
      const rs = built.steps.filter((s) => s.kind === "return" && (s.wage == null || !s.date));
      const what = [rs.some((s) => s.kind === "return" && s.wage == null) ? "ไม่ลงค่าแรง" : "", rs.some((s) => s.kind === "return" && !s.date) ? "ไม่ใส่วันที่" : ""].filter(Boolean).join("/");
      return rs.length ? [{ text: `ส่งคืน ${rs.length} รอบ ยัง${what} — เติมที่ตารางส่งงาน แท็บ "ยังไม่ครบ"`, href: "/master/work-submissions" }] : []; })(),
    ...(() => { const n = built.steps.filter((s) => s.kind === "dispatch" && !(disp.find((r) => r.key === s.line)?.crewIds.length)).length;
      return n ? [{ text: `จ่ายเป็น "ทั้งโต๊ะ" ${n} ใบ — ระบุคนทีหลังได้ที่รายละเอียดใบงาน (✏️ แก้)` }] : []; })(),
    ...(() => { const n = built.steps.filter((s) => s.kind !== "return" && "date" in s && !s.date).length;
      return n ? [{ text: `ไม่ใส่วันที่ ${n} ขั้น — แก้วันที่จ่ายได้ที่รายละเอียดใบงาน` }] : []; })(),
    ...(missing.length && ticks.short ? [{ text: `ยังขาดของ ${missing.length} รายการ — ยังขึ้นในหน้าขอซื้อให้ฝ่ายจัดซื้อตามต่อ` }] : []),
    ...issues.filter((x) => x.level === "warn" && (x.field === "qc:good" || x.field === salesField) && (x.msg.startsWith("ยังเหลือรอ QC") || x.msg.includes("ใบขาย"))).map((x) => ({ text: x.msg })),
  ] as { text: string; href?: string }[];
  const busy = page === 3 && results.length === 0 && !sent;
  const warnTxt = warns.length ? ` (มีคำเตือน ${warns.length})` : "";
  const saveLabel = reqBusy ? "กำลังส่ง…" : asRequest ? `${editingMine ? "ส่งคำขอที่แก้" : "ส่งให้หัวหน้ายืนยัน"}${warnTxt}`
    : reviewing ? `ยืนยันและบันทึก${warnTxt}` : target === "cancel" ? "ยืนยันยกเลิกใบ" : warns.length ? `บันทึก (มีคำเตือน ${warns.length})` : "✓ บันทึกอัปเดต";
  /** แถบบนสุดของขั้น 1–2: ตรวจคำขอ / คำขอของฉันที่รออยู่ / ใบนี้มีคำขอของคนอื่น / ถูกตีกลับ / จะส่งให้หัวหน้า */
  const reqBanner: ReactNode = reviewing ? (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[13px] text-indigo-900">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="request" />
        <span className="min-w-0 flex-1"><b className="font-medium">คำขอจาก {req!.requested_name ?? "พนักงาน"}</b> · {cuWhen(req!.requested_at)} — ตรวจ/แก้ได้ทุกช่อง แล้วกด &ldquo;ยืนยันและบันทึก&rdquo;</span>
        <button type="button" disabled={reqBusy} onClick={() => void rejectReq()} className="h-8 shrink-0 rounded-lg border border-rose-200 bg-white px-3 text-[12px] text-rose-700 hover:bg-rose-50 disabled:opacity-40"><Icon name="back" /> ตีกลับ</button>
      </div>
      {req!.status === "processing" && <div className="mt-1 text-[12px] text-amber-800">{req!.reviewed_name ?? "หัวหน้าอีกคน"} กำลังบันทึกคำขอนี้อยู่ — ถ้าค้างเกิน 10 นาที ยืนยันต่อได้</div>}
      {reqDiff.length > 0 && <div className="mt-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-[12px] text-amber-900"><b className="font-medium">ใบนี้เปลี่ยนไปหลังส่งคำขอ — ตรวจก่อนยืนยัน:</b> {reqDiff.join(" · ")}</div>}
    </div>
  ) : editingMine ? (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
      <Icon name="waiting" />
      <span className="min-w-0 flex-1">คุณส่งอัปเดตใบนี้ไว้แล้ว ({cuWhen(req!.requested_at)}) รอหัวหน้ายืนยัน — แก้แล้วกด &ldquo;ส่งคำขอที่แก้&rdquo; ได้</span>
      <button type="button" disabled={reqBusy} onClick={() => void cancelReq()} className="h-8 shrink-0 rounded-lg border border-amber-300 bg-white px-3 text-[12px] hover:bg-amber-100 disabled:opacity-40">ยกเลิกคำขอ</button>
    </div>
  ) : blockedBy ? (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
      <Icon name="waiting" className="mt-0.5" />
      <span>{req!.status === "processing" ? `${req!.reviewed_name ?? "หัวหน้า"} กำลังบันทึกอัปเดตของใบนี้อยู่` : `ใบนี้มีอัปเดตรอหัวหน้ายืนยันอยู่ (ส่งโดย ${req!.requested_name ?? "คนอื่น"} · ${cuWhen(req!.requested_at)})`} — รอให้จบก่อน แล้วค่อยอัปเดตใหม่</span>
    </div>
  ) : (rejected || asRequest) ? (
    <>
      {rejected && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-900">
          <Icon name="back" />
          <span className="min-w-0 flex-1">อัปเดตครั้งก่อนถูกตีกลับโดย {rejected.reviewed_name ?? "หัวหน้า"} ({cuWhen(rejected.reviewed_at ?? rejected.requested_at)}): <b className="font-medium">{rejected.review_note}</b></span>
          {!!rejected.draft && <button type="button" onClick={() => { hydrate(rejected.draft as CuDraft); setRejected(null); }} className="h-8 shrink-0 rounded-lg border border-rose-200 bg-white px-3 text-[12px] hover:bg-rose-100">ใช้ข้อมูลเดิมแก้ต่อ</button>}
        </div>
      )}
      {asRequest && <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-[12px] text-slate-600"><Icon name="permission" /> อัปเดตของคุณจะส่งให้หัวหน้ายืนยันก่อน — ยังไม่บันทึกลงใบงานจนกว่าจะยืนยัน</div>}
    </>
  ) : null;
  const m = snap?.mo, p = snap?.progress;
  const buyTxt = !m ? "" : m.skipped.buy ? "ป้ายของครบ" : !p ? "ยังไม่มีสูตร" : f?.buyDone ? "ของครบ"
    : `ต้องซื้อ ${p.buy}${p.requested ? ` · รออนุมัติ ${p.requested}` : ""}${p.ordered ? ` · รอของ ${p.ordered}` : ""}`;

  const footer = page === 1 ? (<>
    <button type="button" onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
    {onNext && <button type="button" onClick={onNext} title={nextLabel ? `ข้ามไป ${nextLabel}` : undefined} className="h-9 px-3 text-sm text-slate-600 rounded-lg hover:bg-slate-50">ข้ามใบนี้ →</button>}
    <button type="button" disabled={!target || blockedBy} onClick={() => setPage(2)} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">ถัดไป: เติมข้อมูล →</button>
  </>) : page === 2 ? (<>
    <button type="button" onClick={() => setPage(1)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">← กลับ</button>
    {errs.length > 0 ? (
      <button type="button" onClick={goFirstError} title="กดเพื่อไปที่ช่องที่ต้องแก้"
        className="h-9 px-4 text-sm font-medium rounded-lg border border-rose-300 bg-white text-rose-700 hover:bg-rose-50">ยังขาด {errs.length} จุด — ไปแก้</button>
    ) : (
      <button type="button" disabled={built.steps.length === 0 || reqBusy || blockedBy} onClick={() => void save()}
        className={`h-9 px-4 text-sm font-medium text-white rounded-lg disabled:opacity-40 ${target === "cancel" ? "bg-rose-600 hover:bg-rose-700" : "bg-indigo-600 hover:bg-indigo-700"}`}>
        {saveLabel}
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
      title={`🔄 ${reviewing ? "ตรวจคำขออัปเดตงาน" : "อัปเดตงาน"}${m ? ` · ${m.product_sku ?? m.mo_no}` : ""}`}
      description={m ? `${m.mo_no}${m.product_name && m.product_name !== m.product_sku ? ` · ${m.product_name}` : ""} · สั่งผลิต ${fmt(m.qty)} ชิ้น` : undefined}>
      {loadErr ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{loadErr}</div>
        : !snap || !f || !m ? <div className="py-10 text-center text-sm text-slate-400">กำลังโหลดข้อมูลใบงาน…</div>
        : page === 1 ? (
          <div className="space-y-4">
            {reqBanner}
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
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <span className="text-slate-500">ใบขาย (จับคู่รหัส {m.product_sku ?? "—"}):</span>
              {sales.so.length ? sales.so.map((x) => (
                <span key={x.no} className={`rounded-full px-2 py-0.5 ${x.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                  {x.no} · {x.status === "confirmed" ? "ยืนยันแล้ว" : x.status === "draft" ? "ร่าง" : x.status} · {fmt(x.qty)} ชิ้น</span>
              )) : <span className="text-slate-400">ยังไม่พบ</span>}
              <span className="ml-1 text-slate-500">ใบส่งของ:</span>
              {sales.dn.length ? sales.dn.map((x) => (
                <span key={x.no} className={`rounded-full px-2 py-0.5 ${x.delivered ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{x.no} · {x.delivered ? "ส่งแล้ว" : "ยังไม่ส่ง"} · {fmt(x.qty)}</span>
              )) : <span className="text-slate-400">ยังไม่มี</span>}
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
            {target && target !== "cancel" && (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-[12px]">
                <div className="mb-1 font-medium text-slate-600">จะอัปเดตอะไร เป็นอะไร</div>
                <table className="w-full"><tbody>
                  {([
                    ["ซื้อของ", buyTxt, f.buyDone ? null : rows.some((r) => r.stage === "have" && r.state === "short") ? `ยังขาด ${missing.length} รายการ` : on("prep") ? "ของครบ (ติ๊กเตรียม)" : on("have") ? "ของครบ (ติดป้าย)" : null],
                    ["เตรียม", m.has_bom ? `${m.prep_ready}/${m.prep_total}` : m.prep_done ? "ครบ" : "—", on("prep") ? (m.has_bom ? `${m.prep_total - (ticks.short ? missing.length : 0)}/${m.prep_total}` : "ครบ") : null],
                    ["ตัด", m.has_bom ? (m.cut_total ? `${m.cut_ready}/${m.cut_total}` : "ไม่มีชิ้นต้องตัด") : m.cut_done ? "ครบ" : "—", on("cut") ? (m.has_bom ? (ticks.short && missing.length ? "ครบ (ยกเว้นของที่ขาด)" : `${m.cut_total}/${m.cut_total}`) : "ครบ") : null],
                    ["จ่ายงาน", `${fmt(f.dispatched)}/${fmt(f.qty)}`, on("dispatch") && dispTotal > 0 ? `${fmt(dispAfter)}/${fmt(f.qty)} (ใบจ่ายใหม่ ${disp.filter((r) => r.qty > 0).length} ใบ)` : null],
                    ["ช่างคืน", fmt(f.received), on("return") ? `${fmt(retAfter)}${retAfter < dispAfter - 0.0001 ? ` (ค้างช่าง ${fmt(dispAfter - retAfter)})` : ""}` : null],
                    ["QC รับเข้า", fmt(f.qcPulled), on("qc_in") ? `${fmt(qcAfter)}${on("ship") ? ` · ส่งออก ${fmt(qc.good)}` : ""}` : null],
                    ["สถานะใบ", "เปิดอยู่", on("close") ? "ปิดใบแล้ว" : null],
                  ] as [string, string, string | null][]).map(([k, before, after]) => (
                    <tr key={k} className="border-b border-slate-200/70 last:border-0">
                      <td className="w-24 py-1 text-slate-400">{k}</td>
                      <td className="py-1">{after
                        ? <><span className="text-slate-400">{before}</span><span className="mx-1.5 text-slate-300">→</span><span className="font-medium text-emerald-700">{after}</span></>
                        : <span className="text-slate-400">{before} · ไม่เปลี่ยน</span>}</td>
                    </tr>
                  ))}
                </tbody></table>
                <div className="mt-1.5 text-slate-600">บนบอร์ด: {tabBefore === tabAfter ? <>อยู่แท็บ <b className="font-medium">{tabBefore}</b> เหมือนเดิม</> : <>ย้ายจาก <b className="font-medium">{tabBefore}</b> → <b className="font-medium text-emerald-700">{tabAfter}</b></>}
                  <span className="text-slate-400"> · จำนวน/คน/วันที่ ใส่ในขั้นถัดไป</span></div>
              </div>
            )}
          </div>
        ) : page === 2 ? (
          <div className="space-y-3">
            {reqBanner}
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
                          <label className={lbl}>{ret.length > 1 ? `รอบ ${i + 1} · ` : ""}ส่งคืนจาก</label>
                          {retSources.length <= 1 ? (
                            // ที่มามีที่เดียว = ช่างที่จ่าย → ไม่ต้องเลือก
                            <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700">{retSources[0]?.short ?? "ทั้งโต๊ะ"}</div>
                          ) : (
                            <select value={retEff[i]?.ref ?? "auto"} onChange={(e) => setRetRow(r.key, { ref: e.target.value })} className={numIn}>
                              {retSources.map((o) => <option key={o.ref} value={o.ref}>{o.label}</option>)}
                              <option value="auto">แบ่งให้อัตโนมัติ (คนที่จ่ายก่อนได้ก่อน)</option>
                            </select>
                          )}
                        </div>
                        <div id={`cu-${k}:qty`}>
                          <label className={lbl}>จำนวน</label>
                          <input type="number" min={0} step="any" max={Math.max(0, r2(outstanding - (retTotal - (r.qty > 0 ? r.qty : 0))))} value={r.qty} onChange={(e) => { setRetSet(true); setRetRow(r.key, { qty: Number(e.target.value) }); }} className={`${numIn}${ring(`${k}:qty`)}`} />
                          <Msg field={`${k}:qty`} />
                        </div>
                        <div id={`cu-${k}:wage`}>
                          {(() => {
                            const src = rateOf(retEff[i]?.ref ?? "auto");
                            // มีค่าแรงในใบจ่ายแล้ว = ไม่ต้องพิมพ์ซ้ำ (กด "เปลี่ยน" ถ้าตอนส่งคืนได้ไม่เท่าตอนจ่าย)
                            if (src != null && r.wage == null && !wageOpen[r.key]) return (<>
                              <label className={lbl} title="ค่าแรงต่อชิ้นตามใบจ่ายงาน">ค่าแรง/ชิ้น</label>
                              <div className={`flex h-9 items-center rounded-lg border border-emerald-200 bg-emerald-50/70 px-2 text-sm font-medium text-emerald-800${ring(`${k}:wage`)}`}>฿{fmt(src)}</div>
                              <button type="button" onClick={() => setWageOpen((o) => ({ ...o, [r.key]: true }))} className="mt-0.5 text-[11px] text-slate-500 hover:text-indigo-700">ตามใบจ่าย · <span className="underline decoration-dotted">เปลี่ยน</span></button>
                            </>);
                            return (<>
                              <label className={lbl} title="ค่าแรงต่อชิ้น — ว่าง = ตามใบจ่าย (ใบจ่ายไม่มีค่าแรง = ยังไม่ลงค่าแรง ไปใส่ทีหลังที่ตารางส่งงาน)">ค่าแรง/ชิ้น</label>
                              <input type="number" min={0} step="any" value={r.wage ?? ""} placeholder={src != null ? `฿${fmt(src)}` : "ยังไม่ลง"} onChange={(e) => setRetRow(r.key, { wage: numOrNull(e.target.value) })} className={`${numIn}${ring(`${k}:wage`)}`} />
                            </>);
                          })()}
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
                  onClick={() => { setRetSet(true); setRet((rs) => [...rs.map((x, j) => ({ ...x, ref: retEff[j]?.ref ?? x.ref })), { key: nk("r"), ref: "", qty: Math.max(0, r2(outstanding - retTotal)), date: null, wage: rs[rs.length - 1]?.wage ?? null }]); }}>
                  ＋ เพิ่มรอบส่งคืน (ส่งไม่พร้อมกัน)
                </button>
                <div className="mt-2 text-[11px] text-slate-500">💰 ค่าแรงตอนส่งคืนใช้ตามใบจ่ายให้เลย (กด &ldquo;เปลี่ยน&rdquo; ถ้าได้ไม่เท่าตอนจ่าย) · ใบจ่ายที่ไม่มีค่าแรง หรือไม่ใส่วันที่ = ติดป้าย &ldquo;ยังไม่ลงวันที่/ค่าแรง&rdquo; ไปเติมทีหลังที่ตารางส่งงาน</div>
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
                {on("ship") && qc.good > 0 && (
                  <div className="mb-2 rounded-lg bg-slate-50/70 p-2.5 text-[13px]">
                    <div className="mb-1.5 text-[12px] text-slate-500">ของดี {fmt(qc.good)} ชิ้นที่รับเข้า ส่งออกไปที่ไหน (เหมือนป๊อปส่งออกหน้าโกดัง QC)</div>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex cursor-pointer items-center gap-1.5"><input type="radio" checked={shipMode === "sales_wh"} onChange={() => setShipMode("sales_wh")} className="accent-indigo-600" /> เข้าคลังขาย</label>
                      {shipMode === "sales_wh" && (
                        <select value={shipWh} onChange={(e) => setShipWh(e.target.value)} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[13px]">
                          {QC_WAREHOUSES.map((w) => <option key={w} value={w}>{w}</option>)}
                        </select>
                      )}
                      <label className="inline-flex cursor-pointer items-center gap-1.5"><input type="radio" checked={shipMode === "sell"} onChange={() => setShipMode("sell")} className="accent-indigo-600" /> ขายออกเลย</label>
                    </div>
                  </div>
                )}
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
        ) : sent ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <Icon name="done" className="mt-0.5" />
              <div>
                <div className="font-medium">{sent.updated ? "แก้คำขอแล้ว — รอหัวหน้ายืนยัน" : "ส่งให้หัวหน้ายืนยันแล้ว"}</div>
                <div className="text-[12px] text-emerald-700">ยังไม่บันทึกลงใบงาน — บันทึกจริงเมื่อหัวหน้ากดยืนยัน (แจ้งเตือนหัวหน้าให้แล้ว) · ต้องแก้: เปิดใบนี้อีกครั้งได้จนกว่าจะยืนยัน</div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]">
              <div className="mb-1 font-medium text-slate-600">สิ่งที่จะบันทึกเมื่อหัวหน้ายืนยัน</div>
              {stepLabels.map((x, i) => <div key={i} className="text-slate-700">• {x}</div>)}
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
            {results.length > 0 && !undoRes && (results.every((r) => r.ok) && results.length === built.steps.length
              ? <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">อัปเดตแล้ว — บอร์ดโหลดใหม่ให้แล้ว{reviewing ? ` · ยืนยันคำขอของ ${req!.requested_name ?? "พนักงาน"} แล้ว (แจ้งเตือนกลับให้แล้ว)` : ""}</div>
              : <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">บันทึกได้บางขั้น — ขั้นที่สำเร็จเก็บไว้แล้ว เปิดป๊อปนี้ใหม่เพื่อทำต่อได้</div>)}
            {results.length > 0 && !undoRes && whereNow && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-900">
                <div><b className="font-medium">ตอนนี้ของอยู่:</b> {whereNow.parts.map((x) => `${x.label}${x.qty != null ? ` ${fmt(x.qty)} ชิ้น` : ""}`).join(" · ")}</div>
                <div className="mt-0.5 text-[12px] text-sky-800">
                  {whereNow.onBoard ? `บนบอร์ด: แท็บ "${CU_WHERE_LABEL[whereNow.key]}"`
                    : whereNow.key === "shelf" || whereNow.key === "defect" ? "ไม่อยู่บนบอร์ดแล้ว — ของอยู่หน้าโกดัง QC (หรือดูแท็บ \"ทั้งหมด\")"
                    : "ไม่อยู่บนบอร์ดแล้ว — ดูได้ที่แท็บ \"ทั้งหมด\""}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {onLocate && m && <button type="button" onClick={() => onLocate(m.mo_no, m.product_sku)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-sky-300 bg-white px-3 text-[12px] hover:bg-sky-100"><Icon name="search" /> ไปดูใบนี้ในตาราง</button>}
                  {whereNow.parts.some((x) => x.key === "shelf" || x.key === "defect") && <a href="/master/qc-warehouse" target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-sky-300 bg-white px-3 text-[12px] hover:bg-sky-100"><Icon name="warehouse" /> เปิดโกดัง QC ↗</a>}
                </div>
              </div>
            )}
            {results.length > 0 && !undoRes && followUps.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-[13px]">
                <div className="mb-1 font-medium text-amber-900">ยังต้องตามต่อ</div>
                {followUps.map((x, i) => <div key={i} className="text-amber-900">• {x.href ? <a href={x.href} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-indigo-700">{x.text}</a> : x.text}</div>)}
              </div>
            )}
            {results.length > 0 && !undoRes && (canUndo || irreversible) && (
              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                {irreversible
                  ? <span className="text-slate-500">ย้อนจากที่นี่ไม่ได้: {irreversible.why}</span>
                  : <button type="button" disabled={undoing} onClick={() => void undo()}
                      className="h-8 rounded-lg border border-rose-200 bg-white px-3 text-rose-700 hover:bg-rose-50 disabled:opacity-40">{undoing ? "กำลังย้อน…" : "↶ ย้อนการอัปเดตนี้"}</button>}
                {!irreversible && <span className="text-slate-400">กดผิด? ย้อนได้ทันที — ลบใบจ่าย/ส่งคืน/ของเข้า QC/ปัญหาที่เพิ่งสร้าง และคืนค่าเดิม</span>}
              </div>
            )}
            {undoRes && (
              <div className="rounded-lg border border-slate-200 px-3 py-2 text-[13px]">
                <div className="mb-1 font-medium text-slate-700">ผลการย้อน</div>
                {undoRes.map((x, i) => <div key={i} className={x.ok ? "text-emerald-700" : "text-rose-600"}>{x.ok ? "✓" : "✕"} {x.msg}</div>)}
                <div className="mt-1 text-[11px] text-slate-400">บอร์ดโหลดใหม่ให้แล้ว · วัตถุดิบที่ย้ายเข้า WIP ตอนจ่ายใบแรก ระบบไม่ย้อนให้</div>
              </div>
            )}
          </div>
        )}
    </ERPModal>
  );
}
