"use client";

/**
 * 🔄 อัปเดตงานเป็นชุด (โหมดอัปเดตงานของบอร์ดจ่ายงาน) — ติ๊กหลายใบ → แบบ B "แยกตารางตามขั้น" (เจ้าของเลือก 2026-10-31)
 *   ① ตารางใบงาน: 1 ใบ = 1 แถว — เลือก "ไปถึงขั้น" · สถานะ · เปลี่ยนจำนวน · ผลหลังบันทึก / ย้อน
 *   ② ตารางของแต่ละขั้น (โผล่เฉพาะขั้นที่มีใบต้องกรอก · หัวคอลัมน์ตรงงาน): ของครบ/เตรียม/ตัด · จ่ายงาน (หลายแถว/ใบ · รวมชิ้น+ค่าแรง)
 *     · ช่างส่งคืน (ตามยอดจ่าย / หลายรอบ · ยังค้าง) · QC รับเข้า · ส่งออก · ปิดใบ · ยกเลิก · เพิ่มเติม (ย่อไว้)
 *   ใบที่ผ่านหลายขั้น (เช่น ยังไม่จ่าย → ส่งคืนครบ) อยู่ทุกตารางที่เกี่ยว · "↓ ทุกใบ" ที่หัวคอลัมน์ = ค่าของใบแรกในตารางนั้นลงทุกใบ
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
import { HoverImage } from "@/components/hover-image";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { QC_WAREHOUSES } from "@/lib/qc-ship";
import { REDUCE_REASONS } from "@/lib/mo-qty-reduce";
import { matchShipDate, matchText, type MatchPart, type MoMatch } from "@/lib/mo-sales-match";
import { SalesBillPicker, type BillPick } from "./sales-bill-picker";
import { isHireDesk, todayYmd } from "@/lib/work-entry-rules";
import type { Assignee } from "@/app/api/mo/assignees/route";
import type { CatchUpSnapshot } from "@/app/api/mo/catch-up/route";
import type { CuRequest } from "@/app/api/mo/catch-up/requests/route";
import type { WorkOrder } from "@/app/api/mo/work-orders/route";
import { CrewPick, crewFields, crewList, lastCrewIds } from "./crew-pick";
import { DispatchDatePick } from "./dispatch-date-pick";
import {
  CU_TARGETS, CU_STAGE_LABEL, CU_NO_DATES, cuFacts, cuRows, cuDefaultTicks, cuDefaultQty, cuBuildSteps, cuTargetBlocked, cuStepLabel, cuRun, cuUndo,
  cuIrreversible, cuLocateSnap, cuFactsDiff, cuReduceSnap, type CuReduce, type CuWhere,
  type CuDraft, type CuTargetKey, type CuTicks, type CuResult, type CuStage, type CuStep, type CuRetLine, type CuDates,
} from "./catch-up";
import { ReducePanel } from "./catch-up-reduce";
import { CuStepList } from "./catch-up-step-line";
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
  /** ใบขายผูกได้บางส่วน: ขายออกกี่ชิ้น (ที่เหลือ = shipRest) — null = ส่งออกทั้งหมดตาม shipMode */
  shipSell: number | null; shipRest: "sales_wh" | "keep";
  /** เปลี่ยนจำนวน (ทำได้น้อย/มากกว่าสั่ง) — null = ทำตามสั่ง */
  reduce: CuReduce | null;
  /** หลังบันทึก: ตอนนี้ของอยู่ไหน + จำนวนสั่ง (โหลดใบนั้นใหม่ — ป้าย "ตอนนี้" ไม่ค้างค่าเดิม) */
  after: { where: CuWhere; qty: number } | null;
  open: boolean; phase: Phase; results: CuResult[]; runMsg: string;
  undoRes: { msg: string; ok: boolean }[] | null;
};

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const whereText = (w: CuWhere) => w.parts.map((p) => `${p.label}${p.qty != null ? ` ${fmt(p.qty)}` : ""}`).join(" · ");
const r2 = (n: number) => Math.round(n * 100) / 100;
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
const inp = "h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";
const addBtn = "inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-indigo-300 px-3 text-[12px] text-indigo-700 hover:bg-indigo-50";
const xBtn = "h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-rose-300 hover:text-rose-600";
const td = "px-2 py-2 align-top";
const flow = CU_TARGETS.filter((t) => t.key !== "cancel");
/** ตารางแยกตามขั้น (เรียงตามลำดับงาน) · SEC_FIELDS = ช่องของขั้นนั้น (นับ "ต้องแก้" ที่ป้าย) · SEC_STAGE = ขั้นในกติกากลาง */
type SecKey = "pre" | "disp" | "ret" | "qc" | "ship" | "close" | "cancel" | "extra";
const SECS: { key: SecKey; label: string; icon: string }[] = [
  { key: "pre", label: "ของครบ / เตรียม / ตัด", icon: "cut" },
  { key: "disp", label: "จ่ายงาน", icon: "truck" },
  { key: "ret", label: "ช่างส่งคืน", icon: "back" },
  { key: "qc", label: "QC รับเข้า", icon: "warehouse" },
  { key: "ship", label: "ส่งออกจาก QC", icon: "export" },
  { key: "close", label: "ปิดใบ", icon: "finish" },
  { key: "cancel", label: "ยกเลิกใบ", icon: "cancel" },
  { key: "extra", label: "เพิ่มเติม", icon: "note" },
];
const SEC_FIELDS: Record<SecKey, string[]> = { pre: ["have", "ready"], disp: ["disp"], ret: ["ret"], qc: ["qc"], ship: ["ship"], close: ["close"], cancel: ["cancel"], extra: [] };
const SEC_STAGE: Partial<Record<SecKey, CuStage>> = { disp: "dispatch", ret: "return", qc: "qc_in", ship: "ship", close: "close" };

const emptyRow = (moNo: string): BRow => ({
  moNo, snap: null, err: "", req: null, target: null, ticks: {}, disp: [], ret: [], retSet: false, qcGood: 0, qcBad: 0, qcSet: false,
  dates: CU_NO_DATES, shelfId: "", badReason: "", cancelReason: "", teamNote: "", saveBom: true, shipMode: "sales_wh", shipWh: QC_WAREHOUSES[0], shipSell: null, shipRest: "sales_wh", reduce: null, after: null,
  open: true, phase: "edit", results: [], runMsg: "", undoRes: null,
});

export function CatchUpBatch({ moNos, onClose, onDone, departments, craftsmen, workOrders, mode = "direct", canApprove = false, onRequestsChanged, onOpenSingle, onOpenEdit, refresh, imageOf }: {
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
  /** รูปสินค้าของใบ (จากข้อมูลบอร์ด) — โชว์ข้างรหัสทุกตาราง · ชี้ = รูปใหญ่ */
  imageOf?: (moNo: string) => string | null;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<BRow[]>([]);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [allT, setAllT] = useState("");
  const [extraOpen, setExtraOpen] = useState(false);
  // 🧾 เช็กกับใบขาย (บิลที่ส่งลูกค้าแล้ว) — กติกา lib/mo-sales-match · /api/mo/sales-match
  const [sales, setSales] = useState<Record<string, MoMatch> | null>(null);
  const [salesBusy, setSalesBusy] = useState(false);
  const [pickMo, setPickMo] = useState<string | null>(null);   // หน้าต่าง "เลือกใบขาย" ของใบนี้
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
      shipSell: d.shipSell ?? null, shipRest: d.shipRest === "keep" ? "keep" : "sales_wh",
    };
  };
  const loadSales = async (list: string[]) => {
    try {
      const r = await apiFetch(`/api/mo/sales-match?mo_nos=${list.map(encodeURIComponent).join(",")}`);
      const j = await r.json();
      setSales(r.ok && j?.data ? (j.data as Record<string, MoMatch>) : {});
    } catch { setSales({}); }
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
    void loadSales(moNos);
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
      centralRate, today: todayYmd(), problems: [], teamNote: r.teamNote, bomRate: bomOffer && r.saveBom ? bomCandidate : null, shipMode: r.shipMode, shipWh: r.shipWh, shipSell: r.shipSell, shipRest: r.shipRest,
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
    shipMode: r.shipMode, shipWh: r.shipWh, facts: d.f0, reduce: r.reduce, shipSell: r.shipSell, shipRest: r.shipRest,
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
      if (res.some((x) => x.ok)) {
        saved.push(r.moNo);
        // โหลดใบนั้นใหม่ → ป้าย "ตอนนี้" เป็นค่าหลังบันทึก (ไม่ได้ = คงค่าเดิม)
        try {
          const rr = await apiFetch(`/api/mo/catch-up?mo_no=${encodeURIComponent(r.moNo)}`); const jj = await rr.json();
          if (rr.ok && jj?.data) { const ns = jj.data as CatchUpSnapshot; patchRow(r.moNo, { after: { where: cuLocateSnap(ns), qty: ns.mo.qty } }); }
        } catch { /* ไม่รู้ตำแหน่งใหม่ก็ยังดูผลได้ */ }
      }
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
    patchRow(r.moNo, { phase: "done", undoRes: out, after: null });
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

  // ── 🧾 ใบขายที่ส่งไปแล้ว: ผูก (จำคู่ ใบขายเดียวกันไม่ถูกจับซ้ำ) + เลือกขั้น "ส่งออกจาก QC แล้ว · ขายออกเลย" + วันส่ง = วันที่ใบขาย
  //    หัวหน้า/บันทึกได้เลย = ผูกจริง · ส่งคำขอ = ใช้ข้อมูลตั้งขั้นอย่างเดียว (ไม่ผูก)
  const canLinkSales = mode === "direct" || canApprove;
  /** ตั้งขั้น "ส่งออกจาก QC แล้ว · ขายออกเลย" + วันส่ง = วันที่ใบขายล่าสุด · sell = ขายออกแค่บางส่วน (ที่เหลือ rest) · cutTo = ทำได้แค่นี้ (ลดจำนวนสั่ง แยกใบใหม่) */
  const toShip = (r: BRow, parts: MatchPart[], opt: { sell?: number | null; rest?: "sales_wh" | "keep"; cutTo?: number } = {}) => {
    if (!r.snap || r.phase !== "edit" || modeOf(r).blockedBy || cuTargetBlocked(cuFacts(r.snap), "ship")) return;
    patchRow(r.moNo, (rr) => {
      const base: BRow = opt.cutTo != null ? { ...rr, reduce: { qty: opt.cutTo, pick: "ของไม่พอ", detail: "ส่งตามใบขาย", mode: "split" } } : rr;
      return { ...(opt.cutTo != null ? { reduce: base.reduce } : {}), ...retarget(base, "ship"), shipMode: "sell", shipSell: opt.sell ?? null, shipRest: opt.rest ?? "sales_wh",
        dates: { ...rr.dates, ship: matchShipDate(parts) }, open: true };
    });
  };
  const partsOf = (m: MoMatch) => (m.kind === "linked" ? m.linked : m.suggest);
  const linkSale = async (r: BRow, m: MoMatch, quiet = false): Promise<boolean> => {
    if (!canLinkSales || m.kind === "linked") { toShip(r, partsOf(m)); return true; }
    const res = await apiFetch("/api/mo/sales-match", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mo_no: r.moNo, parts: m.suggest.map((p) => ({ sale_line_id: p.line.id, qty: p.qty })) }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j?.error) { if (!quiet) toast.error(`${r.snap?.mo.product_sku ?? r.moNo}: ${j?.error || "ผูกใบขายไม่สำเร็จ"}`); return false; }
    toShip(r, partsOf(m));
    return true;
  };
  // หน้าต่างเลือกใบขาย → (ยกเลิกของเดิม) ผูกตามที่เลือก → ตั้งขั้นส่งออก / แบ่งส่ง / ลดจำนวน
  const applyPick = async (pick: BillPick) => {
    const r = rows.find((x) => x.moNo === pickMo); if (!r) return;
    if (canLinkSales) {
      if (sales?.[r.moNo]?.kind === "linked") {
        const del = await apiFetch(`/api/mo/sales-match?mo_no=${encodeURIComponent(r.moNo)}`, { method: "DELETE" });
        if (!del.ok) { toast.error("ยกเลิกผูกเดิมไม่สำเร็จ"); return; }
      }
      const res = await apiFetch("/api/mo/sales-match", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mo_no: r.moNo, parts: pick.parts.map((p) => ({ sale_line_id: p.sale_line_id, qty: p.qty })) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) { toast.error(j?.error || "ผูกใบขายไม่สำเร็จ"); await loadSales(rows.map((x) => x.moNo)); return; }
    }
    const parts: MatchPart[] = pick.parts.map((p) => ({ line: { id: p.sale_line_id, sale_id: "", so_number: p.so_number, date: p.date, customer: null, sku: "", qty: p.qty }, qty: p.qty }));
    if (pick.rest === "cut") toShip(r, parts, { cutTo: pick.total });
    else if (pick.rest) toShip(r, parts, { sell: pick.total, rest: pick.rest });
    else toShip(r, parts);
    setPickMo(null);
    await loadSales(rows.map((x) => x.moNo));
  };
  const linkOne = async (r: BRow, m: MoMatch) => { setSalesBusy(true); await linkSale(r, m); await loadSales(rows.map((x) => x.moNo)); setSalesBusy(false); };
  const unlinkSale = async (r: BRow) => {
    setSalesBusy(true);
    const res = await apiFetch(`/api/mo/sales-match?mo_no=${encodeURIComponent(r.moNo)}`, { method: "DELETE" });
    if (!res.ok) toast.error("ยกเลิกผูกไม่สำเร็จ");
    await loadSales(rows.map((x) => x.moNo)); setSalesBusy(false);
  };
  const exactRows = rows.filter((r) => r.snap && r.phase === "edit" && !modeOf(r).blockedBy && sales?.[r.moNo]?.kind === "exact");
  const linkAllExact = async () => {
    setSalesBusy(true);
    let ok = 0;
    for (const r of exactRows) { const m = sales?.[r.moNo]; if (m && await linkSale(r, m, true)) ok++; }
    await loadSales(rows.map((x) => x.moNo)); setSalesBusy(false);
    toast.success(`${canLinkSales ? "ผูกใบขาย" : "ตั้งขั้นส่งออก"} ${ok} ใบ — ตั้งขั้น "ส่งออกจาก QC แล้ว · ขายออกเลย" ให้แล้ว (ขั้นก่อนหน้ายังต้องกรอก)`);
  };
  const salesCell = (r: BRow) => {
    if (!sales) return <span className="text-[11px] text-slate-400">กำลังเช็กใบขาย…</span>;
    const m = sales[r.moNo];
    const editable0 = r.phase === "edit" && !modeOf(r).blockedBy;
    if (!m || m.kind === "none") return (
      <div className="space-y-1">
        <span className="text-[11px] text-slate-400">ไม่เจอใบขาย (อัตโนมัติ)</span>
        {editable0 && <div><button type="button" onClick={() => setPickMo(r.moNo)} className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 hover:bg-slate-50">เลือกใบขาย…</button></div>}
      </div>
    );
    const parts = m.kind === "linked" ? m.linked : m.suggest;
    const date = matchShipDate(parts);
    const cust = parts.map((p) => p.line.customer).find(Boolean);
    const editable = r.phase === "edit" && !modeOf(r).blockedBy;
    const btn = "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] disabled:opacity-40";
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-1">
          {m.kind === "linked" ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">ผูกแล้ว{m.covered < m.qty - 0.0001 ? ` ${fmt(m.covered)}/${fmt(m.qty)}` : ""}</span>
            : m.kind === "exact" ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">ตรงจำนวน</span>
            : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">บางส่วน {fmt(m.covered)}/{fmt(m.qty)}</span>}
          <span className="text-[12px] text-slate-700">{matchText(parts)}</span>
        </div>
        <div className="text-[11px] text-slate-400">{date ? `ใบขายวันที่ ${date}` : ""}{cust ? ` · ${cust}` : ""}</div>
        {editable && (
          <div className="flex flex-wrap gap-1">
            {m.kind === "linked" ? <>
              <button type="button" disabled={salesBusy} onClick={() => toShip(r, m.linked, m.covered < m.qty - 0.0001 ? { sell: m.covered, rest: "sales_wh" } : {})} className={`${btn} border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50`}>ไปถึงขั้นส่งออก</button>
              <button type="button" disabled={salesBusy} onClick={() => setPickMo(r.moNo)} className={`${btn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}>เปลี่ยนใบขาย…</button>
              {canLinkSales && <button type="button" disabled={salesBusy} onClick={() => void unlinkSale(r)} className={`${btn} border-slate-200 bg-white text-slate-500 hover:text-rose-600`}>ยกเลิกผูก</button>}
            </> : m.kind === "partial" ? (
              <button type="button" disabled={salesBusy} onClick={() => setPickMo(r.moNo)} title="จำนวนในใบขายน้อยกว่าที่ผลิต — เลือกว่าที่เหลือเป็นอย่างไร"
                className={`${btn} border-amber-300 bg-amber-50 font-medium text-amber-900 hover:bg-amber-100`}>เลือกใบขาย / ที่เหลือ…</button>
            ) : (<>
              <button type="button" disabled={salesBusy} onClick={() => void linkOne(r, m)} title={canLinkSales ? "จำว่าใบนี้ส่งไปกับใบขายนี้ + ตั้งขั้นส่งออก" : "ตั้งขั้นส่งออกตามใบขาย (ผูกจริงตอนหัวหน้ายืนยัน)"}
                className={`${btn} border-emerald-300 bg-emerald-50 font-medium text-emerald-800 hover:bg-emerald-100`}>{canLinkSales ? "ผูก + ไปถึงขั้นส่งออก" : "ใช้ข้อมูลนี้ → ขั้นส่งออก"}</button>
              <button type="button" disabled={salesBusy} onClick={() => setPickMo(r.moNo)} className={`${btn} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}>เลือกเอง…</button>
            </>)}
          </div>
        )}
      </div>
    );
  };

  // ── แบบ B (เจ้าของเลือก 2026-10-31): ตารางใบงาน (เลือกขั้น · สถานะ · ผล) + ตารางแยกตามขั้น — แต่ละตารางมีแค่ช่องของขั้นนั้น
  type X = { r: BRow; d: D };
  type Fill = (x: X, src: X) => Partial<BRow> | null;
  const lockOf = (r: BRow) => r.phase !== "edit" || modeOf(r).blockedBy;
  const lockCls = (r: BRow) => (lockOf(r) ? " pointer-events-none opacity-60" : "");
  /** ใบไหนต้องกรอกในตารางขั้นไหน — ใบที่บันทึก/ส่งแล้ว ดูผลที่ตารางใบงาน */
  const inSec = (x: { r: BRow; d: D | null }, k: SecKey): x is X => {
    const { r, d } = x;
    if (!d || !r.target || r.phase === "done" || r.phase === "sent" || modeOf(r).blockedBy) return false;
    if (r.target === "cancel") return k === "cancel";
    if (k === "pre") return d.chk.some((c) => (c.stage === "have" || c.stage === "prep" || c.stage === "cut") && (c.state === "need" || c.state === "opt"));
    if (k === "extra") return true;
    const st = SEC_STAGE[k];
    return !!st && d.on(st);
  };
  const secs = SECS.map((s) => ({ ...s, list: derived.filter((x): x is X => inSec(x, s.key)) }));
  const listOf = (k: SecKey) => secs.find((s) => s.key === k)?.list ?? [];
  const errIn = (d: D, k: SecKey) => d.errs.some((e) => SEC_FIELDS[k].some((p) => e.field === p || e.field.startsWith(`${p}:`)));
  /** "↓ ทุกใบ" = ค่าของใบแรกในตารางนั้น ลงทุกใบในตาราง (เฉพาะใบที่ยังแก้ได้) */
  const fillDown = (k: SecKey, apply: Fill) => {
    const list = listOf(k).filter((x) => !lockOf(x.r));
    const p = new Map<string, Partial<BRow>>();
    for (const x of list.slice(1)) { const v = apply(x, list[0]); if (v) p.set(x.r.moNo, v); }
    if (p.size) setRows((rs) => rs.map((r) => (p.has(r.moNo) ? { ...r, ...p.get(r.moNo) } : r)));
  };
  const th = (label: ReactNode, k: SecKey, cls = "", fill?: Fill, tip?: string) => (
    <th className={`px-2 py-2 font-medium ${cls}`}>
      <span className="inline-flex flex-wrap items-center gap-1">{label}
        {fill && listOf(k).filter((x) => !lockOf(x.r)).length > 1 && (
          <button type="button" disabled={busy} onClick={() => fillDown(k, fill)} title={tip ?? "ใส่ค่าของใบแรกในตารางนี้ลงทุกใบ"}
            className="rounded px-1 text-[11px] font-normal text-indigo-600 hover:bg-indigo-50">↓ ทุกใบ</button>
        )}
      </span>
    </th>);
  const skuCell = (r: BRow, span = 1, extra?: ReactNode) => (
    <td rowSpan={span} className="w-48 py-2 pl-3 pr-2 align-top">
      <div className="flex items-start gap-2">
        {imageOf && <HoverImage url={imageOf(r.moNo)} size={36} previewSize={256} />}
        <div className="min-w-0">
          <div className="font-semibold text-slate-800">{r.snap!.mo.product_sku ?? r.moNo}</div>
          <div className="text-[11px] text-slate-400">{r.moNo}</div>
        </div>
      </div>
      {extra}
    </td>);
  const none = <span className="text-[12px] text-slate-300">—</span>;
  const section = (k: SecKey, head: ReactNode, body: ReactNode, foot?: ReactNode, hint?: ReactNode) => {
    const s = secs.find((x) => x.key === k)!;
    if (!s.list.length) return null;
    const bad = s.list.filter((x) => errIn(x.d, k)).length;
    return (
      <section key={k} id={`cub-${k}`} className="scroll-mt-14">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Icon name={s.icon} /> {s.label}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{s.list.length} ใบ</span>
          {bad > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">ต้องแก้ {bad} ใบ</span>}
          {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-slate-50 text-left text-[12px] text-slate-500"><tr>{head}</tr></thead>
            {body}
            {foot && <tfoot className="border-t-2 border-slate-200 bg-slate-50/60 text-[12px] text-slate-600">{foot}</tfoot>}
          </table>
        </div>
      </section>);
  };
  const dateCell = (r: BRow, d: D, key: keyof CuDates, field: string) => (
    <td className={td}><DispatchDatePick value={r.dates[key]} onChange={(v) => patchRow(r.moNo, { dates: { ...r.dates, [key]: v } })} /><Msg d={d} field={field} /></td>);
  const fillDate = (key: keyof CuDates): Fill => (x, s) => ({ dates: { ...x.r.dates, [key]: s.r.dates[key] } });

  // ── ของครบ / เตรียม / ตัด: ติ๊กให้ตามขั้นที่เลือก (ขั้นที่ข้ามได้ = กดเอาออก) + วันที่เสร็จ
  const preUses = (kind: CuStep["kind"]) => listOf("pre").some((x) => x.d.built.steps.some((s) => s.kind === kind));
  const preSec = section("pre", <>
    {th("ใบงาน", "pre", "pl-3")}
    {th("ขั้นที่ทำแล้ว (ยังไม่ได้ทำ = กดเอาออก)", "pre")}
    {th("ของครบเมื่อ", "pre", "w-44", preUses("skip_buy") ? fillDate("have") : undefined)}
    {th("เตรียม/ตัดเสร็จเมื่อ", "pre", "w-44", preUses("mark_ready") ? fillDate("ready") : undefined)}
  </>, listOf("pre").map(({ r, d }) => {
    const pre = d.chk.filter((x) => x.stage === "have" || x.stage === "prep" || x.stage === "cut");
    const hasSkip = d.built.steps.some((s) => s.kind === "skip_buy"), hasReady = d.built.steps.some((s) => s.kind === "mark_ready");
    return (
      <tbody key={r.moNo} className={`border-t border-slate-200${lockCls(r)}`}>
        <tr>
          {skuCell(r)}
          <td className={td}>
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
              {!d.f.buyDone && d.f.materials > 0 && r.target !== "have" && <span className="text-[11px] text-slate-400">ยังขาดของบางรายการ? กด &ldquo;เปิดแบบละเอียด&rdquo;</span>}
            </div>
          </td>
          {hasSkip ? dateCell(r, d, "have", "have:date") : <td className={td}>{none}</td>}
          {hasReady ? dateCell(r, d, "ready", "ready:date") : <td className={td}>{none}</td>}
        </tr>
      </tbody>);
  }));

  // ── จ่ายงาน (หลายแถวต่อใบ · คนรับหลายคน) — ค่าแรงว่าง = ระบบเติมตามสูตร (รวมเป็นสีเทา)
  const dispList = listOf("disp");
  const lineRate = (x: CuDispRow, d: D) => x.rate ?? d.centralRate ?? null;
  const dispSum = dispList.reduce((a, { r, d }) => {
    for (const x of r.disp) { if (!(x.qty > 0)) continue; a.qty += x.qty; const rt = lineRate(x, d); if (rt != null) a.pay += rt * x.qty; else a.noRate = true; }
    return a;
  }, { qty: 0, pay: 0, noRate: false });
  const fillDisp = (p: (s0: CuDispRow, x: X) => (l: CuDispRow) => Partial<CuDispRow>): Fill => (x, s) => {
    const s0 = s.r.disp[0]; if (!s0) return null;
    const f = p(s0, x);
    return { disp: x.r.disp.map((l) => ({ ...l, ...f(l) })) };
  };
  const fillDesk = fillDisp((s0, x) => {
    const pool = poolOf(deptOf(s0.deptId)), crewIds = s0.crewIds.filter((id) => pool.some((c) => c.id === id));
    return (l) => ({ deptId: s0.deptId, crewIds, ...(l.rateSet ? {} : { rate: cuRateFor(x.r.snap, crewIds) }) });
  });
  const dispSec = section("disp", <>
    {th("ใบงาน", "disp", "pl-3")}
    {th("ยังไม่จ่าย", "disp", "w-20 text-right")}
    {th("โต๊ะ · คนรับ", "disp", "w-44", fillDesk, "ใส่โต๊ะและคนรับของใบแรกลงทุกใบ")}
    {th("", "disp", "min-w-[16rem]")}
    {th("จำนวน", "disp", "w-24")}
    {th("ค่าแรง/ชิ้น", "disp", "w-32", fillDisp((s0) => () => ({ rate: s0.rate, rateSet: true })))}
    {th("รวมค่าแรง", "disp", "w-24 text-right")}
    {th("วันที่จ่าย", "disp", "w-40", fillDisp((s0) => () => ({ date: s0.date })))}
    {th("หมายเหตุถึงช่าง", "disp", "w-44", fillDisp((s0) => () => ({ note: s0.note })))}
    <th className="w-10" />
  </>, dispList.map(({ r, d }) => {
    const n = r.disp.length, over = d.dispTotal > d.remain + 0.0001;
    return (
      <tbody key={r.moNo} className={`border-t border-slate-200${lockCls(r)}`}>
        {r.disp.map((x, i) => {
          const dept = deptOf(x.deptId), hire = isHireDesk(dept?.name), pool = poolOf(dept), fk = `disp:${x.key}`, rt = lineRate(x, d);
          return (
            <tr key={x.key} className={i ? "border-t border-dashed border-slate-100" : ""}>
              {i === 0 && skuCell(r, n, (
                <div className="mt-1 space-y-1">
                  <button type="button" className={addBtn}
                    onClick={() => patchRow(r.moNo, (rr) => ({ disp: [...rr.disp, { key: nk("d"), deptId: rr.disp[rr.disp.length - 1]?.deptId ?? "", crewIds: [], qty: Math.max(0, r2(d.remain - d.dispTotal)), date: rr.disp[rr.disp.length - 1]?.date ?? null, rate: d.centralRate }] }))}>
                    <Icon name="add" /> แบ่งจ่าย
                  </button>
                  {over && !r.reduce && !r.snap!.mo.sized && (
                    <button type="button" onClick={() => setReduce(r.moNo, { qty: r2(d.f0.dispatched + d.dispTotal), pick: "ของพอทำเพิ่ม", detail: "", mode: "add" })}
                      className="block rounded-md border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-left text-[11px] font-medium text-indigo-800 hover:bg-indigo-100">ทำได้มากกว่าสั่ง — เพิ่มเป็น {fmt(d.f0.dispatched + d.dispTotal)}</button>
                  )}
                  <Msg d={d} field="disp" />
                </div>
              ))}
              {i === 0 && (
                <td rowSpan={n} className={`${td} text-right`}>
                  <div className="font-medium text-slate-700">{fmt(d.remain)}</div>
                  {(n > 1 || over) && <div className={`text-[11px] ${over ? "font-medium text-rose-600" : "text-slate-400"}`}>จ่ายรวม {fmt(d.dispTotal)}</div>}
                </td>
              )}
              <td className={td}>
                <select value={x.deptId} onChange={(e) => setDisp(r.moNo, x.key, { deptId: e.target.value, crewIds: [], ...(x.rateSet ? {} : { rate: d.centralRate }) })} className={`${inp}${ring(d, `${fk}:dept`)}`}>
                  <option value="">— เลือกโต๊ะ —</option>
                  {departments.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <Msg d={d} field={`${fk}:dept`} />
              </td>
              <td className={td}>
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
                <input type="number" min={0} step="any" value={x.rate ?? ""} placeholder={d.centralRate != null ? `สูตร ฿${fmt(d.centralRate)}` : "ใส่ทีหลังได้"}
                  onChange={(e) => setDisp(r.moNo, x.key, { rate: numOrNull(e.target.value), rateSet: true })} className={`${inp}${ring(d, `${fk}:rate`)}`} />
                {x.rateSet && x.rate != null && x.rate !== d.centralRate && <div className="mt-0.5 text-[11px] text-indigo-600">พิมพ์เอง</div>}
                <Msg d={d} field={`${fk}:rate`} />
              </td>
              <td className={`${td} text-right`}>{rt != null && x.qty > 0 ? <span className={x.rate == null ? "text-slate-400" : "font-medium text-slate-700"}>฿{fmt(rt * x.qty)}</span> : none}</td>
              <td className={td}><DispatchDatePick value={x.date} onChange={(v) => setDisp(r.moNo, x.key, { date: v })} /><Msg d={d} field={`${fk}:date`} /></td>
              <td className={td}><input value={x.note ?? ""} onChange={(e) => setDisp(r.moNo, x.key, { note: e.target.value })} placeholder="ไม่บังคับ" className={inp} /></td>
              <td className={td}>
                {n > 1 && <button type="button" title="ลบแถวจ่ายนี้" className={xBtn}
                  onClick={() => patchRow(r.moNo, (rr) => ({ disp: rr.disp.filter((y) => y.key !== x.key), ret: rr.ret.map((y) => (y.ref === `new:${x.key}` ? { ...y, ref: "auto" } : y)) }))}><Icon name="cancel" /></button>}
              </td>
            </tr>);
        })}
      </tbody>);
  }), (
    <tr>
      <td className="py-2 pl-3" colSpan={4}>รวม {dispList.length} ใบ</td>
      <td className="px-2 py-2 text-right font-semibold text-slate-800">{fmt(dispSum.qty)} ชิ้น</td>
      <td />
      <td className="px-2 py-2 text-right font-semibold text-slate-800">฿{fmt(dispSum.pay)}</td>
      <td className="px-2 py-2" colSpan={3}>{dispSum.noRate ? "บางแถวยังไม่ใส่ค่าแรง (ใส่ทีหลังได้)" : ""}</td>
    </tr>
  ), "ค่าแรงสีเทา = ตามสูตรของรุ่นนั้น");

  // ── ช่างส่งคืน (ตามยอดจ่ายอัตโนมัติ / หลายรอบ) — ค่าแรงว่าง = ตามใบจ่าย
  const retList = listOf("ret");
  const retRate = (d: D, i: number, x: CuRetLine) => x.wage ?? cuRateOfRef(d.sources, d.retEff[i]?.ref ?? "auto");
  const retSum = retList.reduce((a, { d }) => {
    d.ret.forEach((x, i) => { if (!(x.qty > 0)) return; a.qty += x.qty; const w = retRate(d, i, x); if (w != null) a.pay += w * x.qty; });
    return a;
  }, { qty: 0, pay: 0 });
  const fillRet = (p: (s0: CuRetLine) => Partial<CuRetLine>): Fill => (x, s) => {
    const s0 = s.d.ret[0]; if (!s0) return null;
    return { ret: x.d.ret.map((l, i) => ({ ...l, ref: x.d.retEff[i]?.ref ?? l.ref, ...p(s0) })) };
  };
  const retSec = section("ret", <>
    {th("ใบงาน", "ret", "pl-3")}
    {th("ค้างช่าง", "ret", "w-24 text-right")}
    {th("คืนจาก", "ret", "w-56")}
    {th("คืนกี่ชิ้น", "ret", "w-24")}
    {th("ค่าแรง/ชิ้น", "ret", "w-36", fillRet((s0) => ({ wage: s0.wage ?? null })))}
    {th("รวมค่าแรง", "ret", "w-24 text-right")}
    {th("วันที่คืน", "ret", "w-40", fillRet((s0) => ({ date: s0.date })))}
    <th className="w-10" />
  </>, retList.map(({ r, d }) => {
    const n = Math.max(1, d.ret.length), left = r2(d.outstanding - d.retTotal);
    const extra = (
      <div className="mt-1 space-y-1">
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-600" title="คืนตามช่างที่จ่าย เท่าที่ค้างอยู่ — แก้จำนวนเอง = เลิกอัตโนมัติ">
          <input type="checkbox" checked={!r.retSet} disabled={r.target === "return_part"} onChange={(e) => patchRow(r.moNo, e.target.checked ? { retSet: false } : { retSet: true, ret: d.ret.map((x, i) => ({ ...x, ref: d.retEff[i]?.ref ?? x.ref })) })} className="h-3.5 w-3.5 accent-indigo-600" />
          ตามยอดจ่าย
        </label>
        {r.retSet && (
          <button type="button" className={addBtn}
            onClick={() => patchRow(r.moNo, { retSet: true, ret: [...d.ret.map((x, j) => ({ ...x, ref: d.retEff[j]?.ref ?? x.ref })), { key: nk("r"), ref: "", qty: Math.max(0, r2(d.outstanding - d.retTotal)), date: null, wage: null }] })}>
            <Icon name="add" /> เพิ่มรอบ
          </button>
        )}
        <Msg d={d} field="ret" />
      </div>);
    const owe = (
      <td rowSpan={n} className={`${td} text-right`}>
        <div className="font-medium text-slate-700">{fmt(d.outstanding)}</div>
        {left < -0.0001 ? <span className="mt-0.5 inline-block rounded-full bg-rose-50 px-1.5 text-[11px] text-rose-700">เกิน {fmt(-left)}</span>
          : left > 0.0001 ? <span className="mt-0.5 inline-block rounded-full bg-amber-50 px-1.5 text-[11px] text-amber-800">ยังค้าง {fmt(left)}</span>
          : <span className="mt-0.5 inline-block rounded-full bg-emerald-50 px-1.5 text-[11px] text-emerald-700">คืนครบ</span>}
      </td>);
    return (
      <tbody key={r.moNo} className={`border-t border-slate-200${lockCls(r)}`}>
        {!d.ret.length && <tr>{skuCell(r, 1, extra)}{owe}<td className={`${td} text-[12px] text-slate-400`} colSpan={6}>ยังไม่มีรอบส่งคืน</td></tr>}
        {d.ret.map((x, i) => {
          const fk = `ret:${x.key}`, ref = d.retEff[i]?.ref ?? "auto", src = cuRateOfRef(d.sources, ref), w = retRate(d, i, x);
          return (
            <tr key={x.key} className={i ? "border-t border-dashed border-slate-100" : ""}>
              {i === 0 && skuCell(r, n, extra)}
              {i === 0 && owe}
              <td className={td}>
                {!r.retSet || d.sources.length <= 1
                  ? <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-2 text-sm text-slate-700">{d.sources.find((o) => o.ref === ref)?.short ?? "แบ่งอัตโนมัติ"}</div>
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
              <td className={`${td} text-right`}>{w != null && x.qty > 0 ? <span className={x.wage == null ? "text-slate-400" : "font-medium text-slate-700"}>฿{fmt(w * x.qty)}</span> : none}</td>
              <td className={td}><DispatchDatePick value={x.date} onChange={(v) => setRet(r, d, x.key, { date: v })} /><Msg d={d} field={`${fk}:date`} /></td>
              <td className={td}>
                {r.retSet && d.ret.length > 1 && <button type="button" title="ลบรอบนี้" className={xBtn} onClick={() => patchRow(r.moNo, { ret: d.ret.filter((y) => y.key !== x.key) })}><Icon name="cancel" /></button>}
              </td>
            </tr>);
        })}
      </tbody>);
  }), (
    <tr>
      <td className="py-2 pl-3" colSpan={3}>รวม {retList.length} ใบ</td>
      <td className="px-2 py-2 font-semibold text-slate-800">{fmt(retSum.qty)} ชิ้น</td>
      <td />
      <td className="px-2 py-2 text-right font-semibold text-slate-800">฿{fmt(retSum.pay)}</td>
      <td colSpan={2} />
    </tr>
  ), "ค่าแรงว่าง (สีเขียว) = ตามใบจ่าย");

  // ── QC รับเข้าชั้น
  const qcSec = section("qc", <>
    {th("ใบงาน", "qc", "pl-3")}
    {th("รอรับ", "qc", "w-20 text-right")}
    {th("ชั้นที่วางของดี", "qc", "w-48", (x, s) => (x.r.snap!.shelves.some((y) => y.id === s.r.shelfId && y.kind !== "defect") ? { shelfId: s.r.shelfId } : null))}
    {th("ของดี", "qc", "w-24")}
    {th("ของเสีย", "qc", "w-24")}
    {th("สาเหตุของเสีย", "qc", "w-48", listOf("qc").some((x) => x.r.qcBad > 0) ? (x, s) => (x.r.qcBad > 0 && (x.r.snap!.reasons ?? []).some((y) => y.name === s.r.badReason) ? { badReason: s.r.badReason } : null) : undefined)}
    {th("รับเข้าเมื่อ", "qc", "w-40", fillDate("qc"))}
  </>, listOf("qc").map(({ r, d }) => (
    <tbody key={r.moNo} className={`border-t border-slate-200${lockCls(r)}`}>
      <tr>
        {skuCell(r)}
        <td className={`${td} text-right`}><div className="font-medium text-slate-700">{fmt(d.qcAvail)}</div>{!r.qcSet && <div className="text-[11px] text-slate-400">ตามยอดคืน</div>}</td>
        <td className={td}>
          <select value={r.shelfId} onChange={(e) => patchRow(r.moNo, { shelfId: e.target.value })} className={`${inp}${ring(d, "qc:shelf")}`}>
            <option value="">— เลือกชั้น —</option>
            {r.snap!.shelves.filter((s) => s.kind !== "defect").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <Msg d={d} field="qc:shelf" />
        </td>
        <td className={td}><input type="number" min={0} step="any" value={d.qcGood} onChange={(e) => patchRow(r.moNo, { qcSet: true, qcGood: Number(e.target.value) })} className={`${inp}${ring(d, "qc:good")}`} /><Msg d={d} field="qc:good" /></td>
        <td className={td}><input type="number" min={0} step="any" value={r.qcBad} onChange={(e) => patchRow(r.moNo, { qcBad: Number(e.target.value) })} className={`${inp}${ring(d, "qc:bad")}`} /><Msg d={d} field="qc:bad" /></td>
        <td className={td}>
          {r.qcBad > 0 ? <>
            <select value={r.badReason} onChange={(e) => patchRow(r.moNo, { badReason: e.target.value })} className={`${inp}${ring(d, "qc:reason")}`}>
              <option value="">— เลือกสาเหตุ —</option>
              {(r.snap!.reasons ?? []).map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}
            </select>
            <Msg d={d} field="qc:reason" />
          </> : none}
        </td>
        {dateCell(r, d, "qc", "qc:date")}
      </tr>
    </tbody>
  )));

  // ── ส่งออกจาก QC
  const shipSec = section("ship", <>
    {th("ใบงาน", "ship", "pl-3")}
    {th("ส่งไปที่", "ship", "", (_x, s) => ({ shipMode: s.r.shipMode, shipWh: s.r.shipWh }))}
    {th("วันที่ส่งออก", "ship", "w-40", fillDate("ship"))}
  </>, listOf("ship").map(({ r, d }) => (
    <tbody key={r.moNo} className={`border-t border-slate-200${lockCls(r)}`}>
      <tr>
        {skuCell(r)}
        <td className={td}>
          {r.shipSell != null ? (
            // แบ่งส่งตามใบขาย: ขายออก N · ที่เหลือเข้าคลัง / ค้างชั้น QC
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[12px] text-emerald-800">ขายออก {fmt(r.shipSell)} (ตามใบขาย)</span>
              <span className="text-slate-500">ที่เหลือ →</span>
              <select value={r.shipRest} onChange={(e) => patchRow(r.moNo, { shipRest: e.target.value === "keep" ? "keep" : "sales_wh" })} className={`${inp} !w-44`}>
                <option value="sales_wh">เข้าคลังขาย</option><option value="keep">ค้างบนชั้น QC</option>
              </select>
              {r.shipRest === "sales_wh" && <select value={r.shipWh} onChange={(e) => patchRow(r.moNo, { shipWh: e.target.value })} className={`${inp} !w-40`}>{QC_WAREHOUSES.map((w) => <option key={w} value={w}>{w}</option>)}</select>}
              <button type="button" title="ไม่แบ่ง (ส่งออกทั้งหมด)" onClick={() => patchRow(r.moNo, { shipSell: null })} className="h-8 w-8 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="cancel" /></button>
            </div>
          ) : (
          <div className="flex flex-wrap items-center gap-2">
            <select value={r.shipMode} onChange={(e) => patchRow(r.moNo, { shipMode: e.target.value === "sell" ? "sell" : "sales_wh" })} className={`${inp} !w-40`}>
              <option value="sales_wh">เข้าคลังขาย</option><option value="sell">ขายออกเลย</option>
            </select>
            {r.shipMode === "sales_wh" && <select value={r.shipWh} onChange={(e) => patchRow(r.moNo, { shipWh: e.target.value })} className={`${inp} !w-40`}>{QC_WAREHOUSES.map((w) => <option key={w} value={w}>{w}</option>)}</select>}
          </div>
          )}
          <Msg d={d} field="ship" />
        </td>
        {dateCell(r, d, "ship", "ship:date")}
      </tr>
    </tbody>
  )));

  // ── ปิดใบ (ส่งคืนไม่ครบ = ปุ่มปิดยอดขาด)
  const closeSec = section("close", <>
    {th("ใบงาน", "close", "pl-3")}
    {th("ส่งคืนแล้ว / สั่ง", "close", "w-36 text-right")}
    {th("วันที่ปิดใบ", "close", "w-40", fillDate("close"))}
    {th("", "close")}
  </>, listOf("close").map(({ r, d }) => (
    <tbody key={r.moNo} className={`border-t border-slate-200${lockCls(r)}`}>
      <tr>
        {skuCell(r)}
        <td className={`${td} text-right`}><span className="font-medium text-slate-700">{fmt(d.built.received)}</span> <span className="text-slate-400">/ {fmt(d.f.qty)}</span></td>
        {dateCell(r, d, "close", "close:date")}
        <td className={td}>
          <Msg d={d} field="close" />
          {d.errs.some((x) => x.field === "close") && !r.reduce && d.built.received > 0 && (
            <button type="button" onClick={() => setReduce(r.moNo, { qty: d.built.received, pick: "ช่างส่งคืนไม่ครบ", detail: "", mode: "drop" })}
              className="mt-1 h-8 rounded-lg border border-amber-300 bg-amber-50 px-3 text-[12px] font-medium text-amber-900 hover:bg-amber-100">ปิดยอดขาด: ลดเหลือ {fmt(d.built.received)}</button>
          )}
        </td>
      </tr>
    </tbody>
  )));

  // ── ยกเลิกใบ
  const cancelSec = section("cancel", <>
    {th("ใบงาน", "cancel", "pl-3")}
    {th("เหตุผลที่ยกเลิก (บังคับ)", "cancel", "", (_x, s) => ({ cancelReason: s.r.cancelReason }))}
    {th("วันที่ยกเลิก", "cancel", "w-40", fillDate("cancel"))}
  </>, listOf("cancel").map(({ r, d }) => (
    <tbody key={r.moNo} className={`border-t border-slate-200${lockCls(r)}`}>
      <tr>
        {skuCell(r)}
        <td className={td}>
          <input value={r.cancelReason} onChange={(e) => patchRow(r.moNo, { cancelReason: e.target.value })} placeholder="เช่น ลูกค้ายกเลิกออเดอร์" className={`${inp}${ring(d, "cancel:reason")}`} />
          <Msg d={d} field="cancel:reason" />
        </td>
        {dateCell(r, d, "cancel", "cancel:date")}
      </tr>
    </tbody>
  )));

  // ── เพิ่มเติม (ไม่บังคับ): บันทึกถึงทีม + ค่าแรงกลับเข้า BOM — ย่อไว้ · มีใบที่จะบันทึกค่าแรงเข้าสูตร = บอกจำนวนที่หัว
  const extraList = listOf("extra");
  const bomN = extraList.filter((x) => x.d.bomOffer && x.r.saveBom).length;
  const noteN = extraList.filter((x) => x.r.teamNote.trim()).length;
  const extraSec = extraList.length > 0 && (
    <section id="cub-extra">
      <button type="button" onClick={() => setExtraOpen((v) => !v)} className="mb-1.5 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
        <span className="w-3 text-slate-400">{extraOpen ? "▾" : "▸"}</span>
        <Icon name="note" /> เพิ่มเติม (ไม่บังคับ) · บันทึกถึงทีม / ค่าแรงเข้าสูตร
        {noteN > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">บันทึก {noteN} ใบ</span>}
        {bomN > 0 && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">จะบันทึกค่าแรงเข้าสูตร {bomN} ใบ</span>}
      </button>
      {extraOpen && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-[13px]">
            <thead className="bg-slate-50 text-left text-[12px] text-slate-500"><tr>
              {th("ใบงาน", "extra", "pl-3")}
              {th("บันทึกถึงทีม (ต่อท้ายหมายเหตุใบสั่งผลิต)", "extra", "", (_x, s) => ({ teamNote: s.r.teamNote }))}
              {th("ค่าแรงกลับเข้าสูตร (BOM)", "extra", "w-80")}
            </tr></thead>
            {extraList.map(({ r, d }) => (
              <tbody key={r.moNo} className={`border-t border-slate-200${lockCls(r)}`}>
                <tr>
                  {skuCell(r)}
                  <td className={td}><input value={r.teamNote} onChange={(e) => patchRow(r.moNo, { teamNote: e.target.value })} placeholder="ไม่บังคับ" className={inp} /></td>
                  <td className={td}>
                    {d.bomOffer ? (
                      <label className="flex cursor-pointer items-start gap-1.5 text-[12px] text-indigo-900">
                        <input type="checkbox" checked={r.saveBom} onChange={(e) => patchRow(r.moNo, { saveBom: e.target.checked })} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                        <span>บันทึก ฿{fmt(d.bomCandidate!)}/ชิ้น เข้าสูตร <span className="text-indigo-700/70">{d.centralRate ? `เดิม ฿${fmt(d.centralRate)}` : "ยังไม่เคยตั้ง"}</span></span>
                      </label>
                    ) : none}
                  </td>
                </tr>
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  );
  const stageSecs = [preSec, dispSec, retSec, qcSec, shipSec, closeSec, cancelSec];
  const navSecs = secs.filter((s) => s.key !== "extra" && s.list.length > 0);

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
      <div className="space-y-4">
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
          {exactRows.length > 0 && (
            <button type="button" disabled={busy || salesBusy} onClick={() => void linkAllExact()} title="ใบที่จำนวนตรงกับใบขาย (ส่งลูกค้าแล้ว) — ผูกแล้วตั้งขั้นส่งออกให้ทุกใบ"
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-40">
              <Icon name="receipt" /> {canLinkSales ? "ผูกใบขายที่ตรงจำนวน" : "ใช้ใบขายที่ตรงจำนวน"} ({exactRows.length}) → ขั้นส่งออก
            </button>
          )}
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
                  <div className="mt-1.5"><CuStepList items={d!.built.steps.map((step) => ({ step }))} who={d!.whoOf} /></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 1) ตารางใบงาน: แต่ละใบไปถึงขั้นไหน · สถานะ · เปลี่ยนจำนวน · ผลหลังบันทึก */}
        <section>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Icon name="documents" /> ใบงาน {rows.length} ใบ</span>
            <span className="text-[11px] text-slate-400">เลือกว่าแต่ละใบไปถึงขั้นไหน แล้วกรอกในตารางของแต่ละขั้นด้านล่าง</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[1180px] border-collapse text-[13px]">
              <thead className="bg-slate-50 text-left text-[12px] text-slate-500">
                <tr>
                  <th className="w-72 py-2 pl-3 pr-2 font-medium">ใบงาน</th>
                  <th className="w-28 px-2 py-2 text-right font-medium">สั่งผลิต</th>
                  <th className="px-2 py-2 font-medium">ตอนนี้อยู่ไหน</th>
                  <th className="w-72 px-2 py-2 font-medium">ใบขายที่ส่งแล้ว</th>
                  <th className="w-56 px-2 py-2 font-medium">ไปถึงขั้น</th>
                  <th className="px-2 py-2 font-medium">สถานะ</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              {derived.map(({ r, d }) => {
                const m = modeOf(r), f = r.snap ? cuFacts(r.snap) : null;   // ของจริงตอนนี้ (เทียบกับตอนส่งคำขอ)
                const where = r.snap ? cuLocateSnap(r.snap) : null;
                const diff = m.reviewing && f && (r.req?.draft as CuDraft | null)?.facts ? cuFactsDiff((r.req!.draft as CuDraft).facts, f) : [];
                const canUndo = r.phase === "done" && !r.undoRes && r.results.some((x) => x.undo && x.undo.kind !== "none") && !cuIrreversible(r.results);
                const canQty = !!r.snap && r.phase === "edit" && !m.blockedBy && !!r.target && r.target !== "cancel";
                const smallBtn = "inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[12px] text-slate-600 hover:bg-slate-50 disabled:opacity-40";
                return (
                  <tbody key={r.moNo} className="border-t border-slate-200">
                    <tr className={r.phase === "done" ? "bg-emerald-50/30" : ""}>
                      <td className="py-2 pl-3 pr-2 align-top">
                        <div className="flex items-start gap-2.5">
                          {imageOf && <HoverImage url={imageOf(r.moNo)} size={44} previewSize={280} />}
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800">{r.snap?.mo.product_sku ?? r.moNo}</div>
                            <div className="truncate text-[11px] text-slate-400" title={r.snap?.mo.product_name ?? undefined}>{r.moNo}{r.snap?.mo.product_name && r.snap.mo.product_name !== r.snap.mo.product_sku ? ` · ${r.snap.mo.product_name}` : ""}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right align-top">
                        {f ? (r.after && Math.abs(r.after.qty - f.qty) > 0.0001
                          ? <><span className="text-slate-400 line-through">{fmt(f.qty)}</span> <b className="font-semibold text-slate-800">{fmt(r.after.qty)}</b></>
                          : <span className="text-slate-700">{fmt(f.qty)}</span>) : none}
                        {r.reduce && r.phase === "edit" && r.reduce.qty > 0 && <div className="text-[11px] text-amber-700">ทำจริง {fmt(r.reduce.qty)}</div>}
                      </td>
                      <td className="px-2 py-2 align-top text-[12px] text-slate-600">
                        {where ? (r.after
                          ? <span title="ตอนนี้ของอยู่ไหน (หลังบันทึก)"><span className="text-slate-400 line-through">{whereText(where)}</span> → <b className="font-semibold text-slate-800">{whereText(r.after.where)}</b></span>
                          : whereText(where)) : none}
                      </td>
                      <td className="px-2 py-2 align-top">{salesCell(r)}</td>
                      <td className="px-2 py-2 align-top">
                        {r.snap && f && (
                          <select value={r.target ?? ""} disabled={r.phase !== "edit" || m.blockedBy || busy}
                            onChange={(e) => { const k = e.target.value as CuTargetKey; if (k) patchRow(r.moNo, (rr) => ({ ...retarget(rr, k), open: true })); }}
                            className={`h-9 w-full rounded-lg border bg-white px-2 text-[13px] ${r.target ? "border-indigo-300" : "border-amber-400 bg-amber-50/40"}`}>
                            <option value="">— เลือกขั้น —</option>
                            {CU_TARGETS.map((t) => { const b = cuTargetBlocked(f, t.key); return <option key={t.key} value={t.key} disabled={!!b} title={b ?? undefined}>{t.label}{b ? " (เลือกไม่ได้)" : ""}</option>; })}
                          </select>
                        )}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div className="flex flex-wrap items-center gap-1">
                          {statusChip(r, d)}
                          {m.reviewing && r.phase === "edit" && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">คำขอจาก {r.req?.requested_name ?? "พนักงาน"}</span>}
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {canQty && !r.reduce && <button type="button" disabled={!!r.snap!.mo.sized} onClick={() => setReduce(r.moNo, { qty: 0, pick: REDUCE_REASONS[0], detail: "", mode: "split" })}
                            title={r.snap!.mo.sized ? "ใบนี้แบ่งจำนวนตามไซส์ — แก้รายไซส์ที่หน้าใบสั่งผลิต" : "ทำจริงไม่ตรงจำนวนสั่ง (ของไม่พอ / ทำเพิ่มได้ / ช่างคืนไม่ครบ)"} className={smallBtn}><Icon name="exchange" /> เปลี่ยนจำนวน</button>}
                          {canUndo && <button type="button" onClick={() => void undoRow(r)} className={smallBtn}><Icon name="back" /> ย้อน</button>}
                          {r.snap && r.phase === "edit" && <button type="button" onClick={() => onOpenSingle(r.moNo)} title="เปิดป๊อปทีละใบ (ขาดของบางรายการ / แจ้งปัญหา / จัดคนในโต๊ะ)" className={smallBtn}><Icon name="open" /> ละเอียด</button>}
                          {r.snap && r.phase === "edit" && onOpenEdit && <button type="button" onClick={() => onOpenEdit(r.moNo)} title="แก้สิ่งที่บันทึกไปแล้ว (รวมขั้นก่อนหน้า)" className={smallBtn}><Icon name="edit" /> แก้ไข</button>}
                          {r.phase === "edit" && !busy && <button type="button" title="เอาใบนี้ออกจากชุด" onClick={() => setRows((rs) => rs.filter((x) => x.moNo !== r.moNo))} className="h-8 w-8 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Icon name="cancel" /></button>}
                        </div>
                      </td>
                    </tr>
                    {canQty && r.reduce && d && (
                      <tr><td colSpan={7} className="px-3 pb-2">
                        <ReducePanel compact qty={r.snap!.mo.qty} received={d.f0.received} sized={!!r.snap!.mo.sized} wos={r.snap!.wos} value={r.reduce}
                          onChange={(v) => setReduce(r.moNo, v)} issues={d.built.issues} />
                      </td></tr>
                    )}
                    {diff.length > 0 && <tr><td colSpan={7} className="px-3 pb-2"><div className="rounded-md bg-amber-50 px-2 py-1 text-[12px] text-amber-900">ใบนี้เปลี่ยนไปหลังส่งคำขอ — ตรวจก่อนยืนยัน: {diff.join(" · ")}</div></td></tr>}
                    {r.phase === "done" && r.results.length > 0 && (() => {
                      // ยังต้องตามต่อ: รอบส่งคืนที่ยังไม่ลงค่าแรง/วันที่ · ใบใหม่ที่แยก/ทำเพิ่ม
                      const okSteps = r.results.filter((x) => x.ok).map((x) => x.step);
                      const pend = okSteps.filter((x) => x.kind === "return" && (x.wage == null || !x.date)).length;
                      const newMo = r.results.map((x) => (x.undo?.kind === "reduce" ? x.undo.newMo : null)).find(Boolean);
                      const wip = r.after?.where.parts.find((p) => p.key === "wip")?.qty ?? 0;   // ช่างยังค้างส่ง (หลังบันทึก)
                      return (
                        <tr><td colSpan={7} className="px-3 pb-2">
                          <div className="space-y-1.5">
                            <CuStepList items={r.results.map((x) => ({ step: x.step, state: x.ok ? "ok" as const : "fail" as const, msg: x.ok ? undefined : x.msg }))} who={d?.whoOf} />
                            {r.undoRes?.map((x, i) => <div key={`u${i}`} className={`text-[12px] ${x.ok ? "text-slate-500" : "text-amber-700"}`}>{x.ok ? "↶" : "!"} {x.msg}</div>)}
                            {!r.undoRes && (pend > 0 || newMo || wip > 0) && (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
                                <span className="inline-flex items-center gap-1"><Icon name="navigate" /> ยังต้องตามต่อ:</span>
                                {pend > 0 && <a href="/master/work-submissions" target="_blank" rel="noreferrer" className="text-indigo-700 underline underline-offset-2 hover:text-indigo-900">ใส่ค่าแรง/วันที่ส่งคืน {pend} รอบ (ตารางส่งงาน แท็บยังไม่ครบ)</a>}
                                {newMo && <span>ใบใหม่ <b className="font-semibold text-slate-700">{newMo}</b> อยู่แท็บรอจ่าย</span>}
                                {wip > 0 && <span className="text-amber-700">ช่างยังค้างส่ง <b className="font-semibold">{fmt(wip)}</b> ชิ้น</span>}
                              </div>
                            )}
                          </div>
                        </td></tr>
                      );
                    })()}
                  </tbody>
                );
              })}
            </table>
          </div>
        </section>

        {/* 2) ตารางแยกตามขั้น — กดป้ายเพื่อเลื่อนไปตารางนั้น */}
        {navSecs.length > 0 ? (
          <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center gap-1.5 bg-white/95 px-1 py-1.5 text-[12px] backdrop-blur">
            <span className="text-slate-500">กรอกตามขั้น:</span>
            {navSecs.map((s) => {
              const bad = s.list.filter((x) => errIn(x.d, s.key)).length;
              return (
                <button key={s.key} type="button" onClick={() => document.getElementById(`cub-${s.key}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 ${bad ? "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100" : "border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100"}`}>
                  <Icon name={s.icon} /> {s.label} {s.list.length}{bad ? ` · ต้องแก้ ${bad}` : ""}
                </button>
              );
            })}
          </div>
        ) : rows.some((r) => r.snap && r.phase === "edit") && (
          <div className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-[13px] text-slate-500">
            เลือก &ldquo;ไปถึงขั้น&rdquo; ของแต่ละใบในตารางด้านบน (หรือ &ldquo;ทุกใบไปถึงขั้น&rdquo;) — ตารางกรอกของแต่ละขั้นจะขึ้นตรงนี้
          </div>
        )}
        {stageSecs}
        {extraSec}
      </div>
      <SalesBillPicker moNo={pickMo} canLink={canLinkSales} onClose={() => setPickMo(null)} onConfirm={applyPick} />
    </ERPModal>
  );
}
