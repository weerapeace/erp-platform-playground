"use client";

/**
 * บอร์ดจ่ายงาน (Canvas / Whiteboard แบบ Miro) — เฟส D
 * เลื่อน(pan)/ซูม · ลากย้าย+ขยายโซนแผนกได้ · วางการ์ดอิสระ (จำตำแหน่ง) · ปุ่มจัดเรียงสวย
 * โซน "📥 รอจ่าย" (การ์ดใบสั่งผลิตยังจ่ายไม่ครบ) + โซนแผนก (การ์ดใบจ่ายงาน)
 * ลากการ์ด MO ปล่อยในโซนแผนก = popup จ่ายงาน · ลากใบจ่ายงานข้ามแผนก = ย้ายแผนก
 * ซ่อน MO เมื่อจ่ายครบ · ซ่อนใบจ่ายงานเมื่อรับครบ · กรอบสีแบรนด์ + ปุ่มตั้งสี
 */
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, useDeferredValue, Suspense, type PointerEvent as RPE } from "react";
import { useSearchParams } from "next/navigation";
import { postMoChecklistEvent } from "@/lib/mo-checklist-embed";
import dynamicImport from "next/dynamic";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { apiSave } from "@/lib/save-toast";
import { formatDateTime } from "@/lib/date";
import { woRatePerPiece, roundWage, laborBomTarget } from "@/lib/wo-labor";
import { RecvWageHint } from "./recv-wage-hint";
import { MoProgressCell } from "@/components/mo-material-progress";
import { PendDetail, CELL_PANE, HistTab, DETAIL_PREFS_DEFAULT, parseDetailPrefs, type PendPane } from "./pend-detail";
import { useUserPref } from "@/lib/use-user-pref";
import type { MoSkipped } from "@/lib/mo-skip";
import { moSteps, currentStep } from "./mo-steps";
import { DeviceIframePreview, IPAD_SIZE, useCanPreviewDevice } from "@/components/device-view";
import { useTableDisplay } from "./table-display";
import { qvMatch, qvSort, qvVisible, qvNew, qvSummary, qvAudienceOk, qvApplyOrder, qvMoveOrder, QV_CARD_MIN, QV_FALLBACK, type QuickView, type QvRow, type TeamView, type QvMine } from "./quick-views";
import { ViewChipsBar } from "./view-chips-bar";
import { copyText } from "@/components/copy-button";
import type { QvBrand } from "./quick-views-editor";
import { useQuickViews } from "./use-quick-views";
import { ViewSettingsModal, type VsTab } from "./view-settings-modal";
import type { MoProgress, MoProgressResult } from "@/app/api/mo/material-progress/route";
import { InlineEdit } from "@/components/inline-edit";
import type { WorkOrder } from "@/app/api/mo/work-orders/route";
import type { MoPieceRow } from "@/app/api/mo/piecework/route";
import type { WorkStep } from "@/app/api/bom/work-steps/route";
import { WorkStepsTab } from "./work-steps-tab";
import type { MoCost, MoCostMaterial, CostScenario, PieceJob } from "@/app/api/mo/[id]/cost/route";
import type { PurchaseStatusRow } from "@/app/api/mo/purchase-status/route";
import type { MoIssue } from "@/app/api/mo/issues/route";
import type { DispatchHistRow } from "@/app/api/mo/dispatch-history/route";
import { AddPieceworkModal } from "./add-piecework-modal";
import { CatchUpModal } from "./catch-up-modal";
import { CatchUpQueue } from "./catch-up-queue";
import { CatchUpBatch } from "./catch-up-batch";
import { CatchUpEdit } from "./catch-up-edit";
import type { CuRequest, CuOpenTag } from "@/app/api/mo/catch-up/requests/route";
import type { CuAllRow } from "@/app/api/mo/catch-up/all/route";
import { CU_WHERE_ORDER, CU_LATE_DAYS, cuDaysSince, type CuWhereKey, type CuTargetKey } from "./catch-up";
import { dispatchRowIssues, isHireDesk, parentKeyOf } from "@/lib/work-entry-rules";
import { CopyPieceworkModal } from "./copy-piecework-modal";
import { WorkInstructionPanel } from "@/components/work-instruction";
import { MoMaterialsTable, type MoMatSummary, type MoMatPreview } from "@/components/mo-materials";
import { BomRefreshButton } from "@/components/bom-refresh";
import { BomChangeRequestButton } from "@/components/bom-change-request";
import { needsCut, type CutFields } from "@/lib/cut-rules";
import { addToPrCart } from "@/lib/pr-cart";
import { useViewPref } from "@/lib/use-view-pref";
import { PurchaseNeeds } from "./purchase-needs";
import { DispatchShop } from "./dispatch-shop";
import { ExecPlan, type ExecRow } from "./exec-plan";
// มุมมองปฏิทิน (นัดส่งลูกค้า / นัดส่งงานภายใน) — โหลดตอนเปิดแท็บเท่านั้น
const BoardCalendar = dynamicImport(() => import("./board-calendar").then((m) => m.BoardCalendar), { ssr: false });
// สรุปค่าแรงรายเดือนแยกตามช่าง — โหลดตอนเปิดแท็บเท่านั้น
const LaborSummary = dynamicImport(() => import("./labor-summary").then((m) => m.LaborSummary), { ssr: false });
// มุมมองแคนวาส (section = โต๊ะ) — โหลดตอนเปิดแท็บเท่านั้น
const CanvasView = dynamicImport(() => import("./canvas-view").then((m) => m.CanvasView), { ssr: false });
import { DeskShop } from "./desk-shop";
import { BoardLineSettings } from "@/components/board-line-settings";
import { RequestInboxButton } from "@/components/request-inbox";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { BulkActionBar } from "@/components/bulk-action-bar";
import { usePageChrome, PageChromeBar, useChromeHost, useIsDesktopXl } from "@/components/page-chrome";
import { MoCreateModal } from "@/components/mo-create";
import { DispatchPlanBoard } from "./dispatch-plan-board";
import type { DispatchPlan } from "@/app/api/mo/dispatch-plans/route";
import { MiniTable, ColumnChooser, useColumnPrefs, type MiniColumn } from "@/components/mini-table";
import { HoverImage } from "@/components/hover-image";
import { SearchableSelect } from "@/components/searchable-select";
import { AssignToGroupModal } from "@/app/master/manufacturing-orders/mo-groups-modal";
import { InstallAppModal } from "@/components/install-app";
import { Icon } from "@/components/icon";
import { ScanInput } from "@/components/scan-input";
import { useScanGun } from "@/components/scan-input/use-scan-gun";
import { parseScanned } from "@/lib/scan-code";
import { DispatchLines, dispLinesCheck, type DispLine } from "./dispatch-lines";
import type { Assignee } from "@/app/api/mo/assignees/route";
import { DeskStaffPanel } from "./desk-staff-panel";
import { CrewPick, crewFields, crewList, crewIdsOf, lastCrewIds } from "./crew-pick";
import { DispatchDatePick } from "./dispatch-date-pick";
import type { LaborRate } from "@/app/api/bom/labor-rates/route";
import type { Brand } from "@/app/api/brands/route";

// ป๊อปใส่ราคาต้นทุนวัตถุดิบ (ของกลาง) — โหลดตอนกดเท่านั้น (พ่วงตัวเลือกร้าน/หน่วย ไม่ควรถ่วงบอร์ด)
const SkuPriceModal = dynamicImport(() => import("@/components/sku-price-modal").then((m) => m.SkuPriceModal), { ssr: false });

type Dept = { id: string; name: string; note?: string | null; show_note?: boolean; show_on_board?: boolean };
type DeptFull = { id: string; name: string; status: string | null; note: string | null; show_note: boolean; display_order: number | null; show_on_board?: boolean };
// สรุปค่าแรง (กลุ่ม A) — ผลิต/งานเหมา × แผน/จริง
type Labor = { prod_plan: number; prod_actual: number; piece_plan: number; piece_actual: number };
type PendingMO = {
  id: string; mo_no: string; product_sku: string | null; product_name: string | null;
  qty: number; dispatched: number; remaining: number; due_date: string | null; status: string;
  internal_due_date?: string | null;   // 🪑 กำหนดส่งงานภายใน (ช่าง/โต๊ะต้องเสร็จ) — คนละอันกับ due_date ที่เป็นนัดส่งลูกค้า
  image_url: string | null; brand: string | null; brand_color: string | null; color?: string | null;
  prep_done: boolean; cut_done: boolean;
  // Phase 2: เช็กลิสต์วัตถุดิบจาก BOM
  has_bom: boolean; prep_total: number; prep_ready: number; cut_total: number; cut_ready: number; ready: boolean;
  labor?: Labor; bom_code?: string | null; central_rate?: number;
  // ธงลำดับความสำคัญที่ผู้บริหารติดไว้ (แท็บ 👔 แผนผู้บริหาร) — 0=ปกติ 1=สำคัญ 2=เร่งด่วน
  priority?: number; priority_note?: string | null;
  has_sizes?: boolean;   // ใบนี้แบ่งจำนวนตามไซส์ → แก้จำนวนรวมตรง ๆ ไม่ได้
  created_at?: string | null;   // เวลาที่สร้างใบงานในระบบ — โชว์หัวป๊อปเช็กลิสต์
  brand_oem?: boolean;          // แบรนด์รับจ้างผลิต (OEM)
  issue_count?: number;         // ปัญหาที่แจ้งไว้ (เฉพาะใบรอจ่าย)
  skipped_stages?: MoSkipped;   // ขั้นที่แอดมินข้าม (ป้าย) — กติกาที่ lib/mo-skip
};
type MatRow = { id: string; component_sku: string | null; component_name: string | null; required_qty: number; uom: string | null; is_ready: boolean; cut_done: boolean; needs_cut: boolean };
// แถวรายบล็อกสำหรับ "หน้าตัด" — มาจาก mo_materials โดยตรง (1 แถว = 1 บล็อกตัด) ติ๊กตัดครบรายบล็อกได้
type CutRow = { id: string; component_sku: string | null; component_name: string | null; material_type: string | null; cut_block_code: string | null; cut_width: number | null; cut_length: number | null; pieces: number | null; required_qty: number; uom: string | null; cut_done: boolean };
type PendingPiece = { id: string; mo_no: string; job_name: string; rate: number; qty_per: number; qty: number; product_sku: string | null; product_name: string | null; image_url: string | null; brand: string | null; brand_color: string | null };

// ---- โหลด+แปลงวัตถุดิบของใบสั่งผลิต (ใช้ทั้งตอนเปิดป๊อป และตอนกด "อัพเดตตาม BOM") ----
// mo = ค่าจริงจากฐานข้อมูลของใบนั้น (จำนวน/วันกำหนด/มีไซส์ไหม) — เอาไว้ sync ป๊อปให้ตรงเสมอ
type ClMats = { rows: MatRow[]; cutRows: CutRow[]; summary: MoMatSummary[]; materials: MoMatPreview[]; requested: Record<string, number>; sizeQty: Record<string, number>;
  mo: { qty: number; due_date: string | null; internal_due_date: string | null; status: string | null; has_sizes: boolean; created_at: string | null } };
async function fetchClMats(moId: string): Promise<ClMats> {
  const res = await apiFetch(`/api/mo/${moId}`); const j = await res.json();
  const summary = (j?.data?.summary ?? []) as Record<string, unknown>[];
  const materials = (j?.data?.materials ?? []) as Record<string, unknown>[];
  // ตัดครบของวัตถุดิบ = ทุกบล็อกที่ต้องตัดของมันตัดครบ (จาก mo_materials รายบล็อก) — ไม่นับอะไหล่
  const cutTotal = new Map<string, number>(), cutDoneN = new Map<string, number>();
  for (const x of materials) {
    if (!needsCut(x as CutFields)) continue;
    const k = String(x.component_sku);
    cutTotal.set(k, (cutTotal.get(k) ?? 0) + 1);
    if (x.cut_done) cutDoneN.set(k, (cutDoneN.get(k) ?? 0) + 1);
  }
  const num = (v: unknown) => (v == null ? null : Number(v));
  const n2 = (v: unknown) => Number(v) || 0;
  const rows: MatRow[] = summary.map((s) => {
    const k = String(s.component_sku); const ct = cutTotal.get(k) ?? 0;
    return { id: String(s.id), component_sku: (s.component_sku as string) ?? null, component_name: (s.component_name as string) ?? null,
      required_qty: n2(s.required_qty), uom: (s.uom as string) ?? null,
      is_ready: !!s.is_ready, needs_cut: ct > 0, cut_done: ct > 0 && (cutDoneN.get(k) ?? 0) >= ct };
  });
  // หน้าตัด — รายบล็อกจริงจาก mo_materials (1 แถว = 1 บล็อกตัด) — ไม่นับอะไหล่
  const cutRows: CutRow[] = materials.filter((x) => needsCut(x as CutFields)).map((x) => ({
    id: String(x.id), component_sku: (x.component_sku as string) ?? null, component_name: (x.component_name as string) ?? null,
    material_type: (x.material_type as string) ?? null,
    cut_block_code: (x.cut_block_code as string) ?? null, cut_width: num(x.cut_width), cut_length: num(x.cut_length), pieces: num(x.pieces),
    required_qty: n2(x.required_qty), uom: (x.uom as string) ?? null, cut_done: !!x.cut_done,
  }));
  // ตารางวัตถุดิบกลาง (MoMaterialsTable) — ใช้ข้อมูลดิบชุดเดียวกับหน้าแก้ใบสั่งผลิต
  const moSummary: MoMatSummary[] = summary.map((s) => ({
    key: String(s.id), id: String(s.id), component_sku: (s.component_sku as string) ?? null, component_name: (s.component_name as string) ?? null,
    material_type: (s.material_type as string) ?? null, uom: (s.uom as string) ?? null, qty_per: n2(s.qty_per),
    on_hand_qty: n2(s.on_hand_qty), is_ready: !!s.is_ready, purchase_override: s.to_purchase_qty != null ? Number(s.to_purchase_qty) : null,
  }));
  const moMaterials: MoMatPreview[] = materials.map((m) => ({
    key: String(m.id), id: String(m.id), component_sku: (m.component_sku as string) ?? null, component_name: (m.component_name as string) ?? null,
    material_type: (m.material_type as string) ?? null, qty_per: n2(m.qty_per), uom: (m.uom as string) ?? null,
    cut_block_code: (m.cut_block_code as string) ?? null, cut_width: num(m.cut_width), cut_length: num(m.cut_length), pieces: num(m.pieces),
    on_hand_qty: n2(m.on_hand_qty), is_ready: !!m.is_ready, purchase_override: null, cut_done: !!m.cut_done,
    size_label: (m.size_label as string) ?? null,
  }));
  const sb = (j?.data?.size_breakdown ?? []) as { label?: unknown; qty?: unknown }[];
  const sizeQty: Record<string, number> = {};
  for (const s of sb) { const lb = s?.label != null ? String(s.label) : ""; if (lb) sizeQty[lb] = Number(s.qty) || 0; }
  const head = (j?.data ?? {}) as Record<string, unknown>;
  return { rows, cutRows, summary: moSummary, materials: moMaterials, requested: (j?.data?.requested ?? {}) as Record<string, number>, sizeQty,
    mo: {
      qty: Number(head.qty) || 0,
      due_date: (head.due_date as string) ?? null,
      internal_due_date: (head.internal_due_date as string) ?? null,
      status: (head.status as string) ?? null,
      has_sizes: Array.isArray(head.size_breakdown) && (head.size_breakdown as unknown[]).length > 0,
      created_at: (head.created_at as string) ?? null,
    } };
}
// dispatchedMos = ใบที่จ่ายงานครบแล้ว (ไม่ใช่การ์ดรอจ่าย) — ยังต้องส่งลูกค้า ปฏิทินเลยต้องเห็น
type DeliveryPlan = { id: string; mo_id: string; mo_no: string; due_date: string; qty: number; note?: string | null;
  delivery_note_id?: string | null; dn_number?: string | null; shipped?: boolean; shipped_at?: string | null };
type Board = { departments: Dept[]; workOrders: WorkOrder[]; pending: PendingMO[]; dispatchedMos: PendingMO[]; deliveryPlans: DeliveryPlan[]; pendingPiece: PendingPiece[] };
type Pos = { x: number; y: number };
type Size = { w: number; h: number };
type Viewport = { x: number; y: number; scale: number };
type Inter =
  | { type: "pan"; sx: number; sy: number; ox: number; oy: number }
  | { type: "zone"; key: string; sx: number; sy: number; ox: number; oy: number; cards: { cid: string; ox: number; oy: number }[] }
  | { type: "resize"; key: string; sx: number; sy: number; ow: number; oh: number }
  | { type: "card"; cid: string; kind: "mo" | "wo"; id: string; sx: number; sy: number; ox: number; oy: number }
  | null;

const WO_STATUS: Record<string, { label: string; cls: string }> = {
  dispatched:     { label: "จ่ายแล้ว",       cls: "bg-blue-50 text-blue-700 border-blue-200" },
  in_progress:    { label: "กำลังทำ",        cls: "bg-amber-50 text-amber-700 border-amber-200" },
  partial_return: { label: "รับคืนบางส่วน",  cls: "bg-orange-50 text-orange-700 border-orange-200" },
  done:           { label: "รับครบ",         cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
// วันที่ "วันนี้" ตามเวลาเครื่อง (เวลาไทย) — ห้ามปล่อยให้ DB ใส่ CURRENT_DATE เอง เพราะนั่นคือเวลา UTC
// (เที่ยงคืน–ตี 7 บ้านเราจะถูกบันทึกเป็นเมื่อวาน)
// รวมเงินงานเหมาของใบสั่งผลิต 1 ใบ — ทั้งหมด / ที่ติ๊กจ่ายในใบนี้ / ที่ทำเสร็จแล้ว
const pieceSums = (rows: MoPieceRow[]) => rows.reduce((a, r) => {
  const qty = Number(r.total_qty) || 0, amt = qty * (Number(r.rate) || 0);
  a.qty += qty; a.money += amt;
  if (r.selected_id) { a.selQty += qty; a.selMoney += amt; if (r.status === "done") a.doneMoney += amt; }
  return a;
}, { qty: 0, money: 0, selQty: 0, selMoney: 0, doneMoney: 0 });
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const ZONE_W = 220, HEADER_H = 44, NOTE_H = 26, CARD_W = 150, CARD_SLOT = 228, GAP_C = 14, PENDING_W = 3 * 150 + 2 * 14 + 24, PAD = 12, GAP = 40;
const ZONES_KEY = "erp-workboard-zones:v2", ZONESIZE_KEY = "erp-workboard-zonesizes:v2", CARDPOS_KEY = "erp-workboard-cards:v2";
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const PALETTE = ["#94a3b8", "#60a5fa", "#34d399", "#f472b6", "#fb923c", "#a78bfa", "#22d3ee", "#facc15"];
const prodColor = (sku: string | null) => { let h = 0; for (const c of sku ?? "") h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
const ACCENT = ["#fbbf24", "#818cf8", "#60a5fa", "#34d399", "#fb7185", "#a78bfa", "#22d3ee"];

type Urg = "green" | "orange" | "red";
function urgencyByDate(due: string | null, done: boolean): Urg {
  if (done) return "green";
  if (due) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const d = new Date(due + "T00:00:00");
    const days = Math.floor((d.getTime() - today.getTime()) / 86400000);
    if (days < 0) return "red";
    if (days <= 2) return "orange";
  }
  return "green";
}
const URG_DOT: Record<Urg, string> = { green: "bg-emerald-500", orange: "bg-amber-500", red: "bg-rose-500" };
const daysLeftText = (due: string | null) => {
  if (!due) return "—";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(due + "T00:00:00");
  const days = Math.floor((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return `เลย ${-days} วัน`;
  if (days === 0) return "วันนี้";
  return `เหลือ ${days} วัน`;
};
const daysUntil = (due: string | null): number | null => {
  if (!due) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.floor((new Date(due + "T00:00:00").getTime() - today.getTime()) / 86400000);
};
// สีตามจำนวนวัน: <7 แดง · <15 เหลือง · อื่นๆ เทา
const daysLeftClass = (due: string | null): string => {
  const d = daysUntil(due);
  if (d == null) return "text-slate-400";
  if (d < 7) return "text-rose-600 font-semibold";
  if (d < 15) return "text-amber-600 font-semibold";
  return "text-slate-400";
};
const dueDateText = (due: string | null): string => (due ? new Date(due + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "—");
const stageOfDept = (name: string) => (name.includes("ตัด") || name.includes("เตรียม") ? "cut" : "assemble");

type Zone = { key: string; label: string; kind: "pending" | "dept"; dept?: Dept; accent: string; moCards: PendingMO[]; woCards: WorkOrder[] };

export default function WorkBoardPage() {
  // ห่อ Suspense เพราะ WorkBoardPageInner ใช้ useSearchParams (เปิดงานจาก ?mo=)
  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-400">กำลังโหลด…</div>}>
      <WorkBoardPageInner />
    </Suspense>
  );
}

function WorkBoardPageInner() {
  const canView = usePermission("products.view");
  const canEdit = usePermission("products.edit");
  // สิทธิ์ "จ่ายงานเข้าแผนก" แยกต่างหาก — ตั้งค่ารายตำแหน่งได้ที่ /admin/roles-permissions
  const canDispatch = usePermission("work_board.dispatch");
  // 🔄 โหมดอัปเดตงาน: ใช้ได้ = คนจ่ายงาน หรือมีสิทธิ์ catch_up · บันทึกเลย / ต้องรอหัวหน้ายืนยัน / ยืนยันคำขอของคนอื่น (ตั้งตามตำแหน่ง + รายคน)
  const cuUseP = usePermission("work_board.catch_up");
  const cuDirect = usePermission("work_board.catch_up_direct");
  const cuApprove = usePermission("work_board.catch_up_approve");
  const canCatchUp = canDispatch || cuUseP || cuDirect || cuApprove;
  // ย้ายคนเข้า/ออกโต๊ะ = เปลี่ยนแผนกในข้อมูลพนักงาน → เฉพาะสิทธิ์ฝ่ายบุคคล (เรียก hook แยก — ห้าม && ระหว่าง hook)
  const hrApp = usePermission("app.payroll");
  const hrEdit = usePermission("employees.edit");
  const canMoveStaff = hrApp && hrEdit;
  const { user } = useAuth();
  // แท็บ "แผนผู้บริหาร" (ตัวเลขราคาขาย/ต้นทุน/กำไร) — เจ้าของหรือแอดมินเท่านั้น
  // ⚠️ เรียก usePermission ไว้ตรง ๆ เสมอ (ห้ามใส่หลัง || เพราะ hook ห้ามเรียกแบบมีเงื่อนไข)
  // (ซ่อนปุ่มอย่างเดียวไม่พอ — /api/mo/exec-plan ล็อกด้วย admin.users ที่เซิร์ฟเวอร์อีกชั้น)
  const canAdminUsers = usePermission("admin.users");
  const isAdmin = user?.role === "admin" || canAdminUsers;
  const toast = useToast();

  const [board, setBoard] = useState<Board>({ departments: [], workOrders: [], pending: [], dispatchedMos: [], deliveryPlans: [], pendingPiece: [] });
  const [loading, setLoading] = useState(true);
  // สลับ บอร์ด/ตาราง/ช้อป/ขอซื้อ + จำมุมมองเริ่มต้นต่อผู้ใช้ (⭐)
  const { view: viewRaw, setView: setViewMode, defaultView: defView, saveDefault: saveDefView } = useViewPref("work_board_view", ["board", "canvas", "table", "shop", "purchase", "calendar", "labor", "exec"] as const, "board");
  // ถ้าเคยตั้ง "แผนผู้บริหาร" เป็นค่าเริ่มต้นไว้ แล้วสิทธิ์ถูกถอดทีหลัง → ถอยกลับบอร์ดปกติ (ไม่ค้างหน้าว่าง)
  const viewMode = viewRaw === "exec" && !isAdmin ? "board" : viewRaw;
  const [shopMode, setShopMode] = useState<"dispatch" | "desk">("dispatch");   // มุมมองช้อป: รอจ่าย / งานในโต๊ะ
  const [lineSettingsOpen, setLineSettingsOpen] = useState(false);   // ป๊อปตั้งค่าแจ้งเตือน LINE
  const [installOpen, setInstallOpen] = useState(false);             // ป๊อปติดตั้งแอป (ของกลาง components/install-app)

  const [moCreateOpen, setMoCreateOpen] = useState(false);           // ป๊อปสร้างใบสั่งผลิต (ของกลาง)
  const [pendingCols] = useState<number | null>(null);     // (เลิกใช้) คอลัมน์โซนรอจ่าย — รอจ่ายย้ายไปป๊อปอัปแล้ว
  const [craftsmen, setCraftsmen] = useState<Assignee[]>([]);
  // โหลดรายชื่อพนักงาน + เงินเดือนรวมต่อโต๊ะใหม่ (ใช้หลังย้ายคนเข้า/ออกโต๊ะจากป๊อป 👥)
  const reloadAssignees = useCallback(async () => {
    try { const r = await apiFetch("/api/mo/assignees"); const j = await r.json(); setCraftsmen(j.craftsmen ?? []); setDeptWages(j.dept_wages ?? {}); } catch { /* ignore */ }
  }, []);
  const [deptWages, setDeptWages] = useState<Record<string, number>>({});   // เงินเดือนรวมพนักงานต่อแผนก (จาก payroll)
  // กลุ่ม B: ประวัติงานเสียต่อช่าง (จับด้วยชื่อ) → เตือนตอนจ่ายงาน
  type DefItem = { sku: string | null; mo_no: string | null; defect_type: string; qty: number; created_at: string | null };
  const [defectByWorker, setDefectByWorker] = useState<Record<string, { worker: string; count: number; last_at: string | null; types: string[]; items: DefItem[] }>>({});
  const [defectListOpen, setDefectListOpen] = useState(false);   // popup จ่ายงาน: กางรายการงานเสีย (กดดูว่างานอะไร)
  // กลุ่ม D: แผนจ่ายงาน (ร่าง) — แท็บบนบอร์ด ("real" = บอร์ดจริง · id = แผนร่าง)
  const [plans, setPlans] = useState<DispatchPlan[]>([]);
  const [activePlan, setActivePlan] = useState<string>("real");

  const boardRef = useRef<HTMLDivElement>(null);
  const interRef = useRef<Inter>(null);
  const matSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedSumRef = useRef<Map<string, { on: number; rd: boolean; po: number | null }>>(new Map());
  const movedRef = useRef(false);
  const [vp, setVp] = useState<Viewport>({ x: 24, y: 16, scale: 0.85 });
  const [zonePos, setZonePos] = useState<Record<string, Pos>>({});
  const [zoneSize, setZoneSize] = useState<Record<string, Size>>({});
  const [cardPos, setCardPos] = useState<Record<string, Pos>>({});
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [isMax, setIsMax] = useState(false);
  // โหมดแท็บเล็ต — สลับอัตโนมัติตามจอ/การสัมผัส (จอแคบ ≤1024px หรือนิ้วสัมผัส) → โฟกัสทีละโต๊ะ, ขยายแตะง่าย
  const [tablet, setTablet] = useState(false);
  useEffect(() => {
    try {
      const mq = window.matchMedia("(max-width: 1024px), (pointer: coarse)");
      const update = () => { setTablet(mq.matches); if (mq.matches) setIsMax(true); };
      update();
      mq.addEventListener("change", update);
      // เปิดจากแอปที่ติดตั้ง (PWA standalone) → ขยายบอร์ดเต็มจอให้เลย
      if (window.matchMedia?.("(display-mode: standalone)").matches || (window.navigator as unknown as { standalone?: boolean }).standalone) setIsMax(true);
      return () => mq.removeEventListener("change", update);
    } catch { /* ignore */ }
  }, []);
  const [dragId, setDragId] = useState<string | null>(null);

  const [pendPopupOpen, setPendPopupOpen] = useState(false);   // widget รอจ่าย ลอยบนบอร์ด (แทนโซน)
  const [pendSearch, setPendSearch] = useState("");
  const [pendPos, setPendPos] = useState<{ x: number; y: number }>({ x: 80, y: 140 });   // ตำแหน่ง widget
  useEffect(() => { try { const v = localStorage.getItem("wb:pendWidgetPos"); if (v) { const p = JSON.parse(v); if (typeof p?.x === "number" && typeof p?.y === "number") setPendPos(p); } } catch { /* ignore */ } }, []);
  const pendPosRef = useRef(pendPos); pendPosRef.current = pendPos;   // อ่านตำแหน่งล่าสุดตอนเริ่มลาก
  const pendDragRef = useRef<PendingMO | null>(null);   // รายการที่กำลังลากจาก widget → วางที่โต๊ะ
  const [dropDeptId, setDropDeptId] = useState<string | null>(null);   // โต๊ะที่กำลังลากค้างอยู่ (ไฮไลต์)
  // ตัวกรองกลุ่มใน widget รอจ่าย
  const [pendGroupFilter, setPendGroupFilter] = useState("__all__");
  // เมนูพิมพ์รายงาน (รอจ่าย / กำลังผลิต) — เปิดหน้าพิมพ์กลาง /print/work-board ตามกลุ่มที่กรองอยู่

  const printUrl = useCallback((type: "pending" | "production" | "piece" | "all") => {
    const g = pendGroupFilter && pendGroupFilter !== "__all__" ? `&group=${encodeURIComponent(pendGroupFilter)}` : "";
    return `/print/work-board?type=${type}${g}`;
  }, [pendGroupFilter]);
  // แผนที่จะพิมพ์ (รายการจ่ายตามแผน) — ดีฟอลต์เป็นแผนที่กำลังเปิดอยู่ ถ้าไม่ใช่ก็แผนแรก
  const [printPlan, setPrintPlan] = useState<string>("");
  const [moGroups, setMoGroups] = useState<{ name: string; mo_nos: string[] }[]>([]);
  useEffect(() => { void (async () => { try { const r = await apiFetch("/api/mo/groups"); const j = await r.json();
    setMoGroups(((j.data ?? []) as { name: string; mo_nos: unknown }[]).map((g) => ({ name: g.name, mo_nos: (Array.isArray(g.mo_nos) ? g.mo_nos : []) as string[] }))); } catch { /* ignore */ } })(); }, []);
  const pendGroupOf = useCallback((moNo: string) => moGroups.find((g) => g.mo_nos.includes(moNo))?.name ?? null, [moGroups]);
  // ค่าแรงผลิต/ชิ้น ของใบ (ราคากลางจาก BOM ก่อน · ไม่มีค่อยถอดจากค่าแรงวางแผน ÷ จำนวน)
  const pendLaborPP = useCallback((m: PendingMO) => (m.central_rate && m.central_rate > 0) ? m.central_rate : (m.qty > 0 && m.labor ? m.labor.prod_plan / m.qty : 0), []);
  // ขนาด widget (ปรับได้ จำที่เครื่อง)
  const [pendSize, setPendSize] = useState<{ w: number; h: number }>({ w: 360, h: 480 });
  useEffect(() => { try { const v = localStorage.getItem("wb:pendWidgetSize"); if (v) { const s = JSON.parse(v); if (s?.w && s?.h) setPendSize({ w: s.w, h: s.h }); } } catch { /* ignore */ } }, []);
  const pendSizeRef = useRef(pendSize); pendSizeRef.current = pendSize;
  const startPendResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, ow = pendSizeRef.current.w, oh = pendSizeRef.current.h;
    let last = { w: ow, h: oh };
    const onMove = (ev: PointerEvent) => { last = { w: Math.max(280, Math.min(760, ow + ev.clientX - sx)), h: Math.max(240, Math.min(900, oh + ev.clientY - sy)) }; setPendSize(last); };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); try { localStorage.setItem("wb:pendWidgetSize", JSON.stringify(last)); } catch { /* ignore */ } };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  }, []);
  const startPendMove = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, ox = pendPosRef.current.x, oy = pendPosRef.current.y;
    let last = { x: ox, y: oy };
    const onMove = (ev: PointerEvent) => { last = { x: Math.max(0, ox + ev.clientX - sx), y: Math.max(0, oy + ev.clientY - sy) }; setPendPos(last); };
    const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); try { localStorage.setItem("wb:pendWidgetPos", JSON.stringify(last)); } catch { /* ignore */ } };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  }, []);
  const [dispMO, setDispMO] = useState<PendingMO | null>(null);
  const [dispDept, setDispDept] = useState<Dept | null>(null);
  const [deskPanel, setDeskPanel] = useState(false);   // 👥 แผงจัดคนในโต๊ะ (ในป๊อปจ่ายงาน)
  const [dispQty, setDispQty] = useState(0);
  const [dispCrew, setDispCrew] = useState<string[]>([]);   // 👥 คนรับงาน (หลายคนได้ · ว่าง = ทั้งโต๊ะ/จำไม่ได้ว่าใคร)
  const [dispDue, setDispDue] = useState("");
  const [dispDate, setDispDate] = useState<string | null>(todayLocal());   // วันที่จ่ายงาน (ตั้งต้น = วันนี้) — ย้อนวันได้ · null = จำไม่ได้ (ไม่ระบุวัน)
  const [dispSaving, setDispSaving] = useState(false);
  const [dispPiece, setDispPiece] = useState<PendingPiece | null>(null);   // งานเหมารายชิ้นที่กำลังจ่ายให้ช่างเหมา
  const [pieceCraftsman, setPieceCraftsman] = useState("");
  const [pieceSaving, setPieceSaving] = useState(false);
  const [dispRates, setDispRates] = useState<LaborRate[]>([]);   // ค่าแรง/ชิ้น จาก BOM (ราคากลาง + รายช่าง)
  const [dispLaborRate, setDispLaborRate] = useState("");        // ค่าแรง/ชิ้น ที่จะใช้ (default ราคากลาง)
  const [warnDispatch, setWarnDispatch] = useState<{ mo: PendingMO; dept: Dept } | null>(null);  // Phase 3: เตือนจ่ายทั้งที่ยังไม่พร้อม
  const [colorOpen, setColorOpen] = useState(false);
  const [brands, setBrands] = useState<Brand[]>([]);
  // คลิกการ์ด = ดูรายละเอียด / รับงานคืน
  const [detailWO, setDetailWO] = useState<WorkOrder | null>(null);
  // ✏️ แก้คนรับงาน / วันที่จ่าย ของใบที่จ่ายไปแล้ว (ในรายละเอียดใบงาน) — null = ไม่ได้แก้อยู่
  const [crewEdit, setCrewEdit] = useState<string[] | null>(null);
  const [dateEdit, setDateEdit] = useState<{ v: string | null } | null>(null);
  const [woFixSaving, setWoFixSaving] = useState(false);
  useEffect(() => { setCrewEdit(null); setDateEdit(null); }, [detailWO?.id]);
  const [detailMO, setDetailMO] = useState<PendingMO | null>(null);
  const [recvQty, setRecvQty] = useState(0);
  const [recvSaving, setRecvSaving] = useState(false);
  // Phase 2: ป๊อปอัปเช็กลิสต์วัตถุดิบ (เตรียม/ตัด รายชิ้น)
  const [checklistMO, setChecklistMO] = useState<PendingMO | null>(null);
  const [clRows, setClRows] = useState<MatRow[]>([]);
  const [clCutRows, setClCutRows] = useState<CutRow[]>([]);
  const [clLoading, setClLoading] = useState(false);
  const [delArmed, setDelArmed] = useState(false);   // ยืนยันลบงานใน popup
  const [clTab, setClTab] = useState<"recv" | "steps" | "prep" | "cut" | "piece" | "purch" | "issue" | "hist" | "cost" | "disp">("prep");
  const [clCost, setClCost] = useState<MoCost | null>(null);   // ต้นทุน/กำไรของใบ (lazy)
  const [clWO, setClWO] = useState<WorkOrder | null>(null);   // เปิดเช็กลิสต์จากใบจ่ายงาน → มีแท็บ "รับงานคืน"
  const [recvLabor, setRecvLabor] = useState("");             // ค่าแรงผลิตของใบจ่ายงานนี้
  const [saveLaborBom, setSaveLaborBom] = useState(false);    // บันทึกค่าแรงกลับเข้า BOM
  const [estLabor, setEstLabor] = useState("");               // ค่าแรงผลิตที่วางแผน — กรอกเป็นราคา/ชิ้น
  const [estEditing, setEstEditing] = useState(false);
  const estLaborInit = useRef("");                            // ค่าแรงเดิมตอนเปิดป๊อป (ไว้กด "ยกเลิก" คืนค่า)        // ค่าแรง/ชิ้น: มีค่าแล้ว = อ่านอย่างเดียว ต้องกด ✏️ ก่อนแก้
  const [moQty, setMoQty] = useState("");                     // จำนวนสั่งผลิต (แก้ได้ในป๊อปเช็กลิสต์)
  // 📅 วันกำหนด 2 อันของใบสั่งผลิต — แก้ได้จากป๊อปเช็กลิสต์เลย (เดิมต้องไปหน้าใบสั่งผลิต/ลากในปฏิทิน)
  const [moDue, setMoDue] = useState("");                     // 📦 นัดส่งลูกค้า
  const [moDueInt, setMoDueInt] = useState("");               // 🪑 ส่งงานภายใน
  const [moDueSaving, setMoDueSaving] = useState<"" | "due" | "internal">("");
  const [woDue, setWoDue] = useState("");                     // กำหนดเสร็จของ "ใบจ่ายงาน" ใบนี้
  const [woDueSaving, setWoDueSaving] = useState(false);
  const [woQty, setWoQty] = useState("");                     // จำนวนที่จ่ายของใบจ่ายงาน (แก้ได้ตอนลงผิด)
  const [woQtySaving, setWoQtySaving] = useState(false);
  // 📦 แบ่งงวดส่ง — ใบเดียวส่งหลายวัน (วันไหนส่งเท่าไหร่)
  const [planOpen, setPlanOpen] = useState(false);
  const [newPlanDate, setNewPlanDate] = useState("");
  const [newPlanQty, setNewPlanQty] = useState("");
  const [newPlanNote, setNewPlanNote] = useState("");
  const [planSaving, setPlanSaving] = useState(false);
  const [qtySaving, setQtySaving] = useState(false);
  // ปกติจำนวนเป็น "อ่านอย่างเดียว" — ต้องกดปุ่ม ✏️ ก่อนถึงจะพิมพ์แก้ได้ (กันเผลอพิมพ์ทับ = สูตรกางใหม่ทั้งใบ)
  const [qtyEditing, setQtyEditing] = useState(false);
  const [estSaving, setEstSaving] = useState(false);
  const [estSaveBom, setEstSaveBom] = useState(false);        // บันทึกค่าแรง/ชิ้น กลับเข้า BOM (ราคากลาง)
  const [estAllParent, setEstAllParent] = useState(false);    // ใส่ค่าแรง/ชิ้น ให้ทุกใบของรุ่นเดียวกัน (Parent SKU)
  const [clPieceRows, setClPieceRows] = useState<MoPieceRow[]>([]);
  // 📋 ขั้นตอนงาน (เก็บที่สูตร BOM) — null = ยังไม่โหลด · โหลดตอนเปิดแท็บ
  const [clSteps, setClSteps] = useState<WorkStep[] | null>(null);
  const [clStepsBom, setClStepsBom] = useState<string | null>(null);
  const [stepsPrintAsk, setStepsPrintAsk] = useState(false);   // ถามว่าจะพิมพ์ขั้นตอน หรือแม่แบบเปล่า
  const [clCutGroup, setClCutGroup] = useState<"none" | "type" | "material">("none");   // จัดกลุ่มหน้าตัด
  const [clSummary, setClSummary] = useState<MoMatSummary[]>([]);   // ตารางวัตถุดิบกลาง (สรุป)
  const [clMaterials, setClMaterials] = useState<MoMatPreview[]>([]); // ตารางวัตถุดิบกลาง (รายบล็อก)
  const [clSizeQty, setClSizeQty] = useState<Record<string, number>>({}); // จำนวนต่อไซส์ของใบนี้ (ให้ตารางบล็อกคิดยอดต่อไซส์)
  const [clRequested, setClRequested] = useState<Record<string, number>>({});
  const [clPurch, setClPurch] = useState<PurchaseStatusRow[] | null>(null);   // ของที่ซื้อ/ETA
  const [clIssues, setClIssues] = useState<MoIssue[] | null>(null);           // ปัญหา QC
  const [clHist, setClHist] = useState<DispatchHistRow[] | null>(null);       // ประวัติการจ่าย
  const [issType, setIssType] = useState(""); const [issSev, setIssSev] = useState("medium"); const [issQty, setIssQty] = useState("");
  const [addPieceOpen, setAddPieceOpen] = useState(false);
  // แก้/ลบ งานเหมารายแถว (ในแท็บ 🧵 งานเหมา)
  const [pieceEditKey, setPieceEditKey] = useState<string | null>(null);
  const [pieceEdit, setPieceEdit] = useState<{ job_name: string; rate: string; qty_per: string }>({ job_name: "", rate: "", qty_per: "" });
  const [pieceBusy, setPieceBusy] = useState(false);   // popup เพิ่มงานเหมาเข้า BOM
  const [copyPieceOpen, setCopyPieceOpen] = useState(false);   // popup คัดลอกงานเหมาจากสินค้าอื่น
  // popup ตั้งค่าแผนก (สร้าง/แก้/ลบ/โชว์-ซ่อน/หมายเหตุ/เรียงลำดับ)
  const [deptMgrOpen, setDeptMgrOpen] = useState(false);
  const [deptList, setDeptList] = useState<DeptFull[]>([]);
  const [deptLoading, setDeptLoading] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);

  // silent=true → refresh เบื้องหลัง ไม่โชว์สปินเนอร์เต็มจอ (ใช้หลังปิดป๊อปอัป/ทำ action เพื่อให้ลื่น)
  const [loadError, setLoadError] = useState(false);   // โหลดบอร์ดพลาด → โชว์ error+ลองใหม่ (ไม่ใช่บอร์ดว่าง)
  const [loadedAt, setLoadedAt] = useState<number | null>(null);   // เวลาโหลดบอร์ดสำเร็จล่าสุด → "อัปเดต x นาทีที่แล้ว" บนแถบบน
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { const res = await apiFetch("/api/mo/work-board"); const j = await res.json();
      if (!j.error) { setLoadedAt(Date.now()); setBoard({ departments: j.departments ?? [], workOrders: j.workOrders ?? [], pending: j.pending ?? [], dispatchedMos: j.dispatched_mos ?? [], deliveryPlans: j.delivery_plans ?? [], pendingPiece: j.pending_piece ?? [] }); setLoadError(false); }
      else if (!silent) setLoadError(true);
    } catch { if (!silent) setLoadError(true); } finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // กลุ่ม D: โหลดรายการแผนจ่ายงาน
  const loadPlans = useCallback(async () => {
    try { const r = await apiFetch("/api/mo/dispatch-plans"); const j = await r.json(); setPlans((j.data ?? []) as DispatchPlan[]); } catch { /* ignore */ }
  }, []);
  // ของรอง (ช่าง/งานเสีย/แผน) — เลื่อนให้บอร์ดหลักโหลด+แสดงก่อน แล้วค่อยดึงทีละตัว
  // (กันยิงพร้อมกัน 4 ตัวแย่ง Cloudflare Worker↔Supabase ทำให้หน้าค้าง)
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => { void (async () => {
      try { const r = await apiFetch("/api/mo/assignees"); const j = await r.json(); if (alive) { setCraftsmen(j.craftsmen ?? []); setDeptWages(j.dept_wages ?? {}); } } catch { /* ignore */ }
      if (!alive) return;
      try { const r = await apiFetch("/api/mo/craftsman-defects"); const j = await r.json();
        const m: Record<string, { worker: string; count: number; last_at: string | null; types: string[]; items: DefItem[] }> = {};
        for (const d of (j.data ?? []) as { worker: string; count: number; last_at: string | null; types: string[]; items?: DefItem[] }[]) m[(d.worker ?? "").trim().toLowerCase()] = { ...d, items: d.items ?? [] };
        if (alive) setDefectByWorker(m); } catch { /* ignore */ }
      if (!alive) return;
      await loadPlans();
    })(); }, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [loadPlans]);
  const createPlan = useCallback(async () => {
    try {
      const r = await apiFetch("/api/mo/dispatch-plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `แผน ${plans.length + 1}` }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setPlans((ps) => [...ps, j.data as DispatchPlan]); setActivePlan((j.data as DispatchPlan).id);
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างแผนไม่สำเร็จ"); }
  }, [plans.length, toast]);
  useEffect(() => { try {
    const r = localStorage.getItem(ZONES_KEY); if (r) setZonePos(JSON.parse(r));
    const s = localStorage.getItem(ZONESIZE_KEY); if (s) setZoneSize(JSON.parse(s));
    const c = localStorage.getItem(CARDPOS_KEY); if (c) setCardPos(JSON.parse(c));
  } catch { /* ignore */ } }, []);
  useEffect(() => { try { localStorage.setItem(ZONES_KEY, JSON.stringify(zonePos)); } catch { /* ignore */ } }, [zonePos]);
  useEffect(() => { try { localStorage.setItem(ZONESIZE_KEY, JSON.stringify(zoneSize)); } catch { /* ignore */ } }, [zoneSize]);
  useEffect(() => { try { localStorage.setItem(CARDPOS_KEY, JSON.stringify(cardPos)); } catch { /* ignore */ } }, [cardPos]);

  const wosByDept = useMemo(() => {
    const m = new Map<string, WorkOrder[]>();
    for (const w of board.workOrders) {
      if (w.status === "done") continue;
      let key = w.department_id ?? "";
      if (!key) { const d = board.departments.find((x) => stageOfDept(x.name) === w.stage); key = d?.id ?? ""; }
      if (!key) continue;
      (m.get(key) ?? m.set(key, []).get(key)!).push(w);
    }
    return m;
  }, [board]);

  // โต๊ะที่โชว์บนบอร์ด = เปิดโชว์ + โต๊ะที่ปิดแล้วแต่ยังมีงานค้าง (งานเก่ายังเห็นจนส่งคืนครบ) · ช่องเลือกโต๊ะตอนจ่ายงานใหม่ยังกรองแค่ที่เปิดโชว์
  const boardDesks = useMemo(() => {
    const busy = new Set(board.workOrders.filter((w) => w.status !== "done" && w.status !== "cancelled").map((w) => w.department_id).filter(Boolean));
    return board.departments.filter((d) => stageOfDept(d.name) !== "cut" && (d.show_on_board !== false || busy.has(d.id)));
  }, [board]);

  const zones: Zone[] = useMemo(() => {
    // รอจ่ายไม่อยู่บนแคนวาสแล้ว — ย้ายไปปุ่ม "📥 รอจ่าย" → ป๊อปอัป (ใช้พื้นที่น้อยลง) · เหลือแต่โซนโต๊ะ
    const arr: Zone[] = [];
    // เอาแผนก "ตัด/เตรียม" ออกจากบอร์ด — งานตัด/เตรียมย้ายไปเป็นเช็กลิสต์ในตัวการ์ดรอจ่าย
    boardDesks.forEach((d, i) => arr.push({ key: `dept:${d.id}`, label: d.name, kind: "dept", dept: d, accent: ACCENT[(i + 1) % ACCENT.length], moCards: [], woCards: wosByDept.get(d.id) ?? [] }));
    return arr;
  }, [board, wosByDept, boardDesks]);

  const countOf = (z: Zone) => (z.kind === "pending" ? z.moCards.length : z.woCards.length);
  // หมายเหตุที่จะโชว์ใต้หัวแผนก (ถ้าเปิด "โชว์หมายเหตุ")
  const noteOf = useCallback((z: Zone) => (z.kind === "dept" && z.dept?.show_note && z.dept?.note ? z.dept.note : null), []);
  const zoneByKey = useMemo(() => new Map(zones.map((z) => [z.key, z] as const)), [zones]);
  // ความกว้าง: "รอจ่าย" กล่องใหญ่ · แผนก = พอดีจำนวนการ์ด (สูงสุด 4 ใบต่อแถว)
  const defWof = useCallback((key: string) => {
    const z = zoneByKey.get(key);
    if (z?.kind !== "dept") {
      // โซนรอจ่าย: ถ้าตั้งจำนวนคอลัมน์ → กว้างพอดี ไม่งั้นใช้ค่ามาตรฐาน
      if (pendingCols) return pendingCols * CARD_W + (pendingCols - 1) * GAP_C + 2 * PAD;
      return PENDING_W;
    }
    const cols = Math.min(4, Math.max(1, z.woCards.length));
    return cols * CARD_W + (cols - 1) * GAP_C + 2 * PAD;
  }, [zoneByKey, pendingCols]);
  const zoneWof = useCallback((key: string) => zoneSize[key]?.w ?? defWof(key), [zoneSize, defWof]);
  const colsOf = useCallback((key: string) => Math.max(1, Math.floor((zoneWof(key) - PAD) / (CARD_W + GAP_C))), [zoneWof]);
  // คอลัมน์จริงที่ใช้วางการ์ด — แผนก = min(4, จำนวนการ์ด) · รอจ่าย = ตามความกว้าง
  const gridCols = useCallback((z: Zone) => z.kind === "pending" ? (pendingCols ?? colsOf(z.key)) : Math.min(4, Math.max(1, z.woCards.length)), [colsOf, pendingCols]);
  // ตำแหน่งเริ่มต้นของโซน — เรียงซ้าย→ขวาแบบสะสมความกว้าง (กล่องรอจ่ายใหญ่อยู่ซ้ายสุด)
  const defaultLayout = useMemo(() => {
    const m: Record<string, Pos> = {}; let x = 0;
    for (const z of zones) { m[z.key] = { x, y: 0 }; x += zoneWof(z.key) + GAP; }
    return m;
  }, [zones, zoneWof]);
  const posOfZone = useCallback((key: string): Pos => zonePos[key] ?? defaultLayout[key] ?? { x: 0, y: 0 }, [zonePos, defaultLayout]);
  const zoneH = useCallback((z: Zone) => {
    const rows = Math.ceil(Math.max(1, countOf(z)) / gridCols(z));
    const auto = HEADER_H + (noteOf(z) ? NOTE_H : 0) + rows * CARD_SLOT + PAD;
    return Math.max(auto, zoneSize[z.key]?.h ?? 0);
  }, [zoneSize, gridCols, noteOf]);

  // ตำแหน่ง "จัดเรียงสวย" อัตโนมัติ — รอจ่าย=กริดหลายคอลัมน์ · แผนก=คอลัมน์เดียว
  const autoPos = useMemo(() => {
    const map: Record<string, Pos> = {};
    for (const z of zones) {
      const p = posOfZone(z.key); const cols = gridCols(z); const noteY = noteOf(z) ? NOTE_H : 0;
      if (z.kind === "pending") {
        z.moCards.forEach((m, i) => {
          const col = i % cols, row = Math.floor(i / cols);
          map[`mo:${m.id}`] = { x: p.x + PAD + col * (CARD_W + GAP_C), y: p.y + HEADER_H + 10 + row * CARD_SLOT };
        });
      } else {
        z.woCards.forEach((w, i) => {
          const col = i % cols, row = Math.floor(i / cols);
          map[`wo:${w.id}`] = { x: p.x + PAD + col * (CARD_W + GAP_C), y: p.y + HEADER_H + 10 + noteY + row * CARD_SLOT };
        });
      }
    }
    return map;
  }, [zones, posOfZone, gridCols, noteOf]);
  const posOfCard = useCallback((cid: string): Pos => cardPos[cid] ?? autoPos[cid] ?? { x: 0, y: 0 }, [cardPos, autoPos]);

  const screenToWorld = (cx: number, cy: number): Pos => {
    const r = boardRef.current!.getBoundingClientRect();
    return { x: (cx - r.left - vp.x) / vp.scale, y: (cy - r.top - vp.y) / vp.scale };
  };
  const hitZone = (wx: number, wy: number): Zone | null => {
    for (const z of zones) { const p = posOfZone(z.key); if (wx >= p.x && wx <= p.x + zoneWof(z.key) && wy >= p.y && wy <= p.y + zoneH(z)) return z; }
    return null;
  };

  // ---- zoom ----
  useEffect(() => {
    const el = boardRef.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top;
      const f = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setVp((v) => { const ns = clamp(v.scale * f, 0.3, 1.8); return { scale: ns, x: sx - ((sx - v.x) / v.scale) * ns, y: sy - ((sy - v.y) / v.scale) * ns }; });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [loading, viewMode]);   // re-attach หลังสลับ บอร์ด/ตาราง (element ใหม่)
  const zoomBtn = (f: number) => { const el = boardRef.current; if (!el) return; const r = el.getBoundingClientRect(); const sx = r.width / 2, sy = r.height / 2;
    setVp((v) => { const ns = clamp(v.scale * f, 0.3, 1.8); return { scale: ns, x: sx - ((sx - v.x) / v.scale) * ns, y: sy - ((sy - v.y) / v.scale) * ns }; }); };
  const resetView = () => setVp({ x: 24, y: 16, scale: 0.85 });
  const tidy = () => setCardPos({});   // จัดเรียงการ์ดกลับเข้าโซนสวยๆ
  const resetZones = () => { setZonePos({}); setZoneSize({}); };

  // เปิด popup จ่ายงาน (ตั้งค่าเริ่มต้นจาก MO)
  const openDispatch = useCallback((mo: PendingMO, dept: Dept | null) => {
    setDispMO(mo); setDispDept(dept); setDispQty(mo.remaining); setDispCrew([]); setDispDue(mo.internal_due_date ?? mo.due_date ?? ""); setDispDate(todayLocal());
    setDispRates([]); setDispLaborRate(""); setDefectListOpen(false);
    // ดึงค่าแรง/ชิ้น จาก BOM ของสินค้านี้ (ราคากลาง + รายช่าง) → ใช้ตั้ง default
    if (mo.bom_code) void (async () => {
      try { const r = await apiFetch(`/api/bom/labor-rates?bom_code=${encodeURIComponent(mo.bom_code!)}`); const j = await r.json(); setDispRates((j.data ?? []) as LaborRate[]); }
      catch { /* ignore */ }
    })();
  }, []);
  // ตั้งค่าแรง/ชิ้น default ตามช่างที่เลือก (มีเรตเฉพาะ → ใช้, ไม่งั้นราคากลาง)
  useEffect(() => {
    if (!dispMO) return;
    // เลือกคนเดียวที่มีเรตเฉพาะ → ใช้เรตคนนั้น · หลายคน/ทั้งโต๊ะ → ราคากลาง
    const byCraft = dispCrew.length === 1 ? dispRates.find((r) => r.craftsman_id === dispCrew[0]) : null;
    const central = dispRates.find((r) => !r.craftsman_id);
    const pick = byCraft ?? central;
    if (pick) setDispLaborRate(String(pick.rate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispCrew, dispRates]);

  // ---- pointer ----
  const onBoardDown = (e: RPE) => {
    boardRef.current?.setPointerCapture(e.pointerId);
    interRef.current = { type: "pan", sx: e.clientX, sy: e.clientY, ox: vp.x, oy: vp.y };
  };
  const onZoneDown = (e: RPE, key: string) => {
    if (tool === "pan") return;
    e.stopPropagation();
    boardRef.current?.setPointerCapture(e.pointerId); movedRef.current = false;
    const p = posOfZone(key);
    // จับการ์ดในแผนกนี้ที่ "เคยลากเอง" (มีตำแหน่งจำไว้) เพื่อให้เลื่อนตามแผนกไปด้วย
    const z = zones.find((x) => x.key === key);
    const cids = z ? (z.kind === "pending" ? z.moCards.map((m) => `mo:${m.id}`) : z.woCards.map((w) => `wo:${w.id}`)) : [];
    const cards = cids.filter((cid) => cardPos[cid]).map((cid) => ({ cid, ox: cardPos[cid].x, oy: cardPos[cid].y }));
    interRef.current = { type: "zone", key, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, cards };
  };
  const onZoneResizeDown = (e: RPE, z: Zone) => {
    e.stopPropagation();
    boardRef.current?.setPointerCapture(e.pointerId); movedRef.current = false;
    interRef.current = { type: "resize", key: z.key, sx: e.clientX, sy: e.clientY, ow: zoneWof(z.key), oh: zoneH(z) };
  };
  const onCardDown = (e: RPE, kind: "mo" | "wo", id: string) => {
    // กดเพื่อเปิดรายละเอียด/เช็กลิสต์ได้เสมอ (อยู่หน้านี้ = ดูได้); การลากเพื่อจ่าย/ย้ายงานค่อยเช็คสิทธิ์ตอนวาง
    if (tool === "pan") return;
    e.stopPropagation();
    const cid = `${kind}:${id}`; const p = posOfCard(cid);
    boardRef.current?.setPointerCapture(e.pointerId); movedRef.current = false; setDragId(cid);
    interRef.current = { type: "card", cid, kind, id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y };
  };
  const onMove = (e: RPE) => {
    const it = interRef.current; if (!it) return;
    const dx = e.clientX - it.sx, dy = e.clientY - it.sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
    if (it.type === "pan") setVp((v) => ({ ...v, x: it.ox + dx, y: it.oy + dy }));
    else if (it.type === "zone") {
      setZonePos((zp) => ({ ...zp, [it.key]: { x: it.ox + dx / vp.scale, y: it.oy + dy / vp.scale } }));
      if (it.cards.length) setCardPos((cp) => { const n = { ...cp }; for (const c of it.cards) n[c.cid] = { x: c.ox + dx / vp.scale, y: c.oy + dy / vp.scale }; return n; });
    }
    else if (it.type === "resize") setZoneSize((zs) => ({ ...zs, [it.key]: { w: clamp(it.ow + dx / vp.scale, 180, 640), h: Math.max(160, it.oh + dy / vp.scale) } }));
    else if (it.type === "card") setCardPos((cp) => ({ ...cp, [it.cid]: { x: it.ox + dx / vp.scale, y: it.oy + dy / vp.scale } }));
  };
  const onUp = async (e: RPE) => {
    const it = interRef.current; interRef.current = null; setDragId(null);
    try { boardRef.current?.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!it || it.type !== "card") return;
    if (!movedRef.current) {
      // คลิก (ไม่ลาก) = เปิดรายละเอียด
      if (it.kind === "wo") {
        const wo = board.workOrders.find((x) => x.id === it.id);
        if (wo) { setRecvQty(Math.max(0, (wo.qty || 0) - (wo.received_qty || 0))); openWO(wo); }
      } else { const mo = board.pending.find((x) => x.id === it.id); if (mo) { setClWO(null); setChecklistMO(mo); } }
      return;
    }
    const w = screenToWorld(e.clientX, e.clientY);
    const target = hitZone(w.x, w.y);
    if (it.kind === "mo") {
      // วางในโซนแผนก = จ่ายงาน (เด้ง popup) แล้วสแนปการ์ดกลับโซนรอจ่าย
      if (target && target.kind === "dept" && target.dept) {
        const mo = board.pending.find((m) => m.id === it.id);
        setCardPos((cp) => { const n = { ...cp }; delete n[it.cid]; return n; });
        if (!canDispatch) { toast.error("คุณไม่มีสิทธิ์จ่ายงาน — ให้ผู้ดูแลเปิดสิทธิ์ที่หน้าจัดการสิทธิ์ (การผลิต › จ่ายงานเข้าแผนก)"); return; }
        if (mo) {
          if (mo.ready) openDispatch(mo, target.dept);
          else setWarnDispatch({ mo, dept: target.dept });   // ยังไม่พร้อม → เตือนก่อน (แต่จ่ายต่อได้)
        }
      }
      // วางที่อื่น = คงตำแหน่งอิสระไว้
    } else {
      const wo = board.workOrders.find((x) => x.id === it.id); if (!wo) return;
      if (target && target.kind === "dept" && target.dept && wo.department_id !== target.dept.id) {
        if (!canEdit) { toast.error("คุณไม่มีสิทธิ์ย้ายงานข้ามแผนก"); await load(true); return; }
        const d = target.dept;
        setBoard((b) => ({ ...b, workOrders: b.workOrders.map((x) => x.id === it.id ? { ...x, department_id: d.id, department_name: d.name } : x) }));
        try { const res = await apiFetch(`/api/mo/work-orders/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ department_id: d.id, department_name: d.name, stage: stageOfDept(d.name) }) });
          const j = await res.json(); if (j.error) throw new Error(j.error);
        } catch (err) { toast.error(err instanceof Error ? err.message : "ย้ายไม่สำเร็จ"); await load(true); }
      }
      // คงตำแหน่งที่วางไว้ (อิสระ)
    }
  };

  const openColor = async () => { setColorOpen(true); try { const r = await apiFetch("/api/brands"); const j = await r.json(); setBrands(j.data ?? []); } catch { /* ignore */ } };
  const saveColor = async (id: string, color: string) => {
    setBrands((bs) => bs.map((b) => b.id === id ? { ...b, color } : b));
    try { await apiFetch("/api/brands", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, color }) }); await load(true); }
    catch { toast.error("บันทึกสีไม่สำเร็จ"); }
  };

  // ช่องค่าแรงตอนรับงานคืน = ค่าแรง/ชิ้น · ตั้งต้นตามใบจ่าย (labor_cost = ค่าแรงรวมทั้งใบ ÷ จำนวนจ่าย) · ไม่มี = ให้พิมพ์เอง
  // เดิมใส่ยอดรวมทั้งใบมาให้ → ส่งคืนบางส่วนแล้วกดเลย ค่าแรงรอบนั้นเท่าทั้งใบ (ค่าแรงรวมบวม) + ติ๊กเข้า BOM ได้ยอดรวมเป็นราคาต่อชิ้น
  const woRateStr = (wo: WorkOrder) => { const r = woRatePerPiece(wo.labor_cost, wo.qty); return r == null ? "" : String(r); };
  const recvWage = () => roundWage(Number(recvLabor) || 0, recvQty);
  // เปิดป๊อปอัปเช็กลิสต์จากใบจ่ายงาน (มีแท็บ "รับงานคืน" เป็นแท็บแรก) — ถ้าไม่รู้ MO id ใช้ป๊อปอัปเดิม
  const openWO = (wo: WorkOrder) => {
    if (!wo.mo_id) { setDetailWO(wo); setRecvLabor(woRateStr(wo)); setSaveLaborBom(false); return; }
    setClWO(wo); setClTab("recv"); setWoDue((wo.due_date ?? "").slice(0, 10)); setWoQty(String(wo.qty ?? ""));
    setRecvLabor(woRateStr(wo)); setSaveLaborBom(false);
    setChecklistMO({
      id: wo.mo_id, mo_no: wo.mo_no, product_sku: wo.product_sku, product_name: wo.product_name,
      qty: wo.qty || 0, dispatched: 0, remaining: 0, due_date: wo.due_date, status: wo.status,
      image_url: wo.image_url ?? null, brand: wo.brand ?? null, brand_color: wo.brand_color ?? null,
      prep_done: false, cut_done: false, has_bom: false, prep_total: 0, prep_ready: 0, cut_total: 0, cut_ready: 0, ready: false,
    });
  };

  const submitDispatch = async () => {
    if (!dispMO || !dispDept) return;
    // กฎกลาง (lib/work-entry-rules) — ตัวเดียวกับป๊อป 🔄 อัปเดตงาน
    const bad = dispatchRowIssues({ qty: dispQty, remaining: dispMO.remaining, deskName: dispDept.name, crewCount: dispCrew.length }).find((x) => x.level === "error");
    if (bad) { toast.error(bad.msg); return; }
    // ค่าแรงว่างได้ — จ่ายก่อน ค่อยมาใส่ทีหลัง (ปุ่ม 💰 ใส่ค่าแรง ที่การ์ดในโต๊ะ / ตอนส่งงาน)
    const crew = crewList(dispCrew, deptCraftsmen);   // เฉพาะคนที่ยังอยู่ในโต๊ะนี้ (เปลี่ยนโต๊ะ/ย้ายคน → ตัดทิ้ง)
    setDispSaving(true);
    try {
      const res = await apiFetch("/api/mo/work-orders", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mo_no: dispMO.mo_no, product_sku: dispMO.product_sku, product_name: dispMO.product_name,
          stage: stageOfDept(dispDept.name), department_id: dispDept.id, department_name: dispDept.name,
          ...crewFields(crew, dispDept.name),
          // null = จำไม่ได้ว่าจ่ายวันไหน (บันทึกเป็นว่าง)
          qty: dispQty, uom: "ชิ้น", dispatch_date: dispDate === null ? null : (dispDate || todayLocal()), due_date: dispDue || null, note: `จากใบสั่งผลิต ${dispMO.mo_no}`,
          labor_cost: dispLaborRate.trim() !== "" ? (Number(dispLaborRate) || 0) * dispQty : null }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`จ่ายงานเข้า ${dispDept.name}${crew.length ? ` · ${crew.map((c) => c.name).join(", ")}` : ""} แล้ว: ${j.wo_no ?? ""}`);
      setDispMO(null); setDispDept(null); await load(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "จ่ายงานไม่สำเร็จ"); }
    finally { setDispSaving(false); }
  };

  // ✏️ แก้คนรับงาน/วันที่จ่าย ของใบที่จ่ายแล้ว (ลืมว่าให้ใคร/วันไหน · เพิ่มคนช่วย) — PATCH ตัวเดียวกับบอร์ดแผน
  const crewPoolOf = (wo: WorkOrder) => {
    const desk = /เหมา/.test(wo.department_name ?? "") ? craftsmen : craftsmen.filter((c) => c.department_id === wo.department_id);
    const cur = crewIdsOf(wo);   // คนที่รับอยู่แต่ย้ายโต๊ะไปแล้ว ยังโชว์ให้เอาออกได้
    return [...desk, ...craftsmen.filter((c) => cur.includes(c.id) && !desk.includes(c))];
  };
  const saveWoFix = async (patch: Partial<WorkOrder>, okMsg: string) => {
    if (!detailWO) return;
    setWoFixSaving(true);
    try {
      const res = await apiFetch("/api/mo/work-orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: detailWO.id, ...patch }) });
      const j = await res.json(); if (!res.ok || j?.error) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      setDetailWO({ ...detailWO, ...patch }); setCrewEdit(null); setDateEdit(null);
      toast.success(okMsg); void load(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setWoFixSaving(false); }
  };
  const saveCrew = () => {
    if (!detailWO || crewEdit === null) return;
    const f = crewFields(crewList(crewEdit, crewPoolOf(detailWO)), detailWO.department_name ?? "");
    void saveWoFix(f, f.assignees.length ? `บันทึกคนรับงานแล้ว: ${f.assignee_name}` : "ตั้งเป็นทั้งโต๊ะรับงาน (ไม่ระบุคน) แล้ว");
  };

  // A: จ่ายจริงทันที (แตะการ์ด→แตะโต๊ะ บนบอร์ดของจริง) — ไม่เปิดหน้าต่าง
  // ค่าเริ่มต้น: ทั้งโต๊ะ (ไม่ระบุช่าง) + จำนวนที่เลือก + ค่าแรงราคากลางจาก BOM (เลือกช่าง/แก้ทีหลังที่การ์ดในโต๊ะได้)
  const quickDispatch = useCallback(async (mo: PendingMO, dept: Dept, qty: number, ratePerUnit: number) => {
    if (!(qty > 0)) { toast.error("จำนวนต้องมากกว่า 0"); return; }
    try {
      const res = await apiFetch("/api/mo/work-orders", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mo_no: mo.mo_no, product_sku: mo.product_sku, product_name: mo.product_name,
          stage: stageOfDept(dept.name), department_id: dept.id, department_name: dept.name,
          assignee_type: "department", assignee_id: null, assignee_name: dept.name,
          qty, uom: "ชิ้น", dispatch_date: new Date().toISOString().slice(0, 10), due_date: mo.internal_due_date ?? mo.due_date ?? null,
          note: `จากใบสั่งผลิต ${mo.mo_no}`, labor_cost: ratePerUnit > 0 ? ratePerUnit * qty : null }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`จ่ายเข้า ${dept.name}: ${fmt(qty)} ชิ้น`);
      await load(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "จ่ายงานไม่สำเร็จ"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);
  // ช่างในแผนก — ยกเว้นแผนก "ช่างเหมา" (ชื่อมีคำว่า เหมา) ให้เลือกพนักงานได้ทุกคน
  const dispIsHire = useMemo(() => isHireDesk(dispDept?.name), [dispDept]);
  const deptCraftsmen = useMemo(() => {
    if (!dispDept) return [];
    return dispIsHire ? craftsmen : craftsmen.filter((c) => c.department_id === dispDept.id);
  }, [dispDept, dispIsHire, craftsmen]);
  // กลุ่ม B: ประวัติงานเสีย — Parent SKU จากรหัส (ตัดท้าย -NN) เช่น TTM094-02 → TTM094

  // ประวัติงานเสียของผู้รับงาน "เฉพาะ Parent SKU เดียวกับ MO ที่กำลังจ่าย" (ไม่ใช่ทุกงาน)
  const defectScoped = useCallback((name: string | null | undefined, parentKey: string) => {
    const d = name ? defectByWorker[name.trim().toLowerCase()] : undefined;
    if (!d || !parentKey) return undefined;
    const items = d.items.filter((it) => parentKeyOf(it.sku) === parentKey);
    if (items.length === 0) return undefined;
    const types = [...new Set(items.map((it) => it.defect_type).filter(Boolean))];
    const last_at = items.reduce<string | null>((a, it) => (it.created_at && (!a || it.created_at > a)) ? it.created_at : a, null);
    return { count: items.length, types, last_at, items };
  }, [defectByWorker]);

  // รับงานคืน (จากการ์ดบนบอร์ด) — รองรับรับคืนบางส่วน
  const submitReceive = async () => {
    if (!detailWO) return;
    if (recvLabor.trim() === "") { toast.error("กรุณาใส่ค่าแรงก่อนส่งงาน"); return; }
    setRecvSaving(true);
    try {
      const res = await apiFetch("/api/mo/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wo_id: detailWO.id, qty: recvQty, wage: recvWage(), submitted_at: todayLocal() }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("บันทึกส่งงานแล้ว"); setDetailWO(null); await load(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setRecvSaving(false); }
  };
  const cancelWO = async (wo: WorkOrder) => {
    try { const res = await apiFetch(`/api/mo/work-orders/${wo.id}`, { method: "DELETE" }); const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("ยกเลิกใบจ่ายงานแล้ว"); setDetailWO(null); await load(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ"); }
  };
  // การ์ดร่าง (แผน) กด "ใส่ค่าแรง" → ตั้งเรตกลางสินค้า (bom_labor_rates ราคากลาง) → ทุกการ์ดของสินค้านี้อัปเดตตาม
  /**
   * ตั้งค่าแรง/ชิ้น จากการ์ดบนบอร์ด
   *
   * 🐛 บั๊กที่แก้: เดิมเก็บไว้ที่ "ราคากลางของสูตร (BOM)" อย่างเดียว
   *    สินค้าที่ยังไม่มีสูตร → API ตอบ error แล้วค่าแรงไม่ขึ้นบนการ์ดเลย (เจอกับ PIX34-02..05)
   *    ตอนนี้บันทึกลง "ค่าแรงที่วางแผนของใบนั้น" เสมอ (ตัวเลขขึ้นแน่นอน)
   *    แล้วค่อยพยายามเก็บเข้าเป็นราคากลางของสูตรถ้ามีสูตร
   */
  const setCentralRate = async ({ moNo, rate }: { moNo: string; rate: number }) => {
    const mo = board.pending.find((x) => x.mo_no === moNo);
    const wo = board.workOrders.find((x) => x.mo_no === moNo);
    const bomCode = mo?.bom_code ?? null;
    const productSku = mo?.product_sku ?? wo?.product_sku ?? null;
    const moId = mo?.id ?? wo?.mo_id ?? null;
    const moQtyAll = mo?.qty ?? 0;

    let savedPlan = false;
    if (moId && moQtyAll > 0) {
      const r = await apiSave(toast, "/api/mo/est-labor",
        { method: "POST", body: { mo_id: moId, est_labor_cost: Math.round(rate * moQtyAll * 100) / 100 } },
        { quiet: true });
      savedPlan = r.ok;
    }

    let savedBom = false;
    if (bomCode || productSku) {
      const r = await apiSave(toast, "/api/bom/labor-rates",
        { method: "POST", body: { bom_code: bomCode ?? undefined, product_sku: productSku ?? undefined, craftsman_id: null, craftsman_name: "ราคากลาง", rate } },
        { quiet: true });
      savedBom = r.ok;
    }

    if (!savedPlan && !savedBom) { toast.error("ตั้งค่าแรงไม่สำเร็จ"); return; }
    toast.success(savedBom
      ? `ตั้งค่าแรง ฿${fmt(rate)}/ชิ้น แล้ว — เก็บเป็นราคากลางของสูตรด้วย`
      : `ตั้งค่าแรง ฿${fmt(rate)}/ชิ้น ให้ใบนี้แล้ว (สินค้ายังไม่มีสูตร จึงยังไม่ได้เก็บเป็นราคากลาง)`);
    await load(true);
  };
  // เฟส 2: จ่ายงานเหมารายชิ้นให้ช่างเหมา (set assignee_name → ออกจากรอจ่าย)
  const assignPiece = async () => {
    if (!dispPiece) return;
    const craft = craftsmen.find((c) => c.id === pieceCraftsman);
    if (!craft) { toast.error("เลือกช่างเหมาก่อน"); return; }
    setPieceSaving(true);
    try {
      const res = await apiFetch("/api/mo/piecework", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: dispPiece.id, assignee_name: craft.name }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`จ่ายงานเหมา "${dispPiece.job_name}" ให้ ${craft.name} แล้ว`);
      setDispPiece(null); setPieceCraftsman(""); await load(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "จ่ายงานไม่สำเร็จ"); }
    finally { setPieceSaving(false); }
  };
  // รับงานคืน/ยกเลิก จากแท็บ "รับงานคืน" ในป๊อปอัปเช็กลิสต์ (clWO)
  // BOM เก็บค่าแรง "ต่อชิ้น" (laborBomTarget: ใบของช่าง = ราคาช่าง · ใบของโต๊ะ/แผนก = ราคากลาง)
  const saveRateToBom = async (wo: WorkOrder, rate: number) => {
    if (!wo.product_sku || !(rate > 0)) return;
    await apiFetch("/api/bom/labor-rates", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_sku: wo.product_sku, ...laborBomTarget(wo), rate }) }).catch(() => {});
  };
  // "บันทึกค่าแรง" (ยังไม่รับคืน) = ตั้งค่าแรงรวมทั้งใบ = ค่าแรง/ชิ้น × จำนวนจ่าย (+ เลือกบันทึกกลับเข้า BOM)
  const saveLabor = async () => {
    if (!clWO) return;
    if (recvLabor.trim() === "") { toast.error("ใส่ค่าแรง/ชิ้นก่อน"); return; }
    const rate = Number(recvLabor) || 0;
    try {
      const res = await apiFetch(`/api/mo/work-orders/${clWO.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labor_cost: roundWage(rate, clWO.qty) }) });
      const j = await res.json().catch(() => ({})); if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      if (saveLaborBom) await saveRateToBom(clWO, rate);
      toast.success(`บันทึกค่าแรง ฿${fmt(rate)}/ชิ้นแล้ว${saveLaborBom ? " + เข้า BOM" : ""}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  };
  const submitReceiveTab = async () => {
    if (!clWO) return;
    if (recvLabor.trim() === "") { toast.error("กรุณาใส่ค่าแรงก่อนส่งงาน"); return; }
    setRecvSaving(true);
    try {
      // ค่าแรงรวมของใบ: ระบบส่งงานคิดใหม่จากทุกรอบให้เอง (lib/wo-labor) — ไม่ต้องเขียนทับเอง
      const res = await apiFetch("/api/mo/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ wo_id: clWO.id, qty: recvQty, wage: recvWage(), submitted_at: todayLocal() }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      if (saveLaborBom) await saveRateToBom(clWO, Number(recvLabor) || 0);
      toast.success(`บันทึกส่งงานแล้ว${saveLaborBom ? " + เข้า BOM" : ""}`); closeChecklist();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setRecvSaving(false); }
  };
  const cancelWOTab = async () => {
    if (!clWO) return;
    try { const res = await apiFetch(`/api/mo/work-orders/${clWO.id}`, { method: "DELETE" }); const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("ยกเลิกใบจ่ายงานแล้ว"); closeChecklist();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ยกเลิกไม่สำเร็จ"); }
  };
  // กลุ่ม A: บันทึกค่าแรงผลิตที่วางแผน (ต่อใบสั่งผลิต) → โชว์เป็น "ผลิต-แผน" บนการ์ด/หัวแผนก
  const saveEstLabor = async () => {
    if (!checklistMO) return;
    setEstSaving(true);
    try {
      const perPiece = estLabor.trim() === "" ? null : Number(estLabor) || 0;   // ราคา/ชิ้น ที่กรอก
      // ติ๊ก "ใส่ทุกใบของรุ่นเดียวกัน" → เซิร์ฟเวอร์ไล่ใส่ให้ทุกใบที่ยังเปิดอยู่ของ Parent SKU เดียวกัน
      // (แต่ละใบคิดยอดรวมจากจำนวนของใบนั้นเอง) + เขียนราคากลางเข้า BOM ของทุกสีถ้าติ๊กไว้
      if (estAllParent && perPiece != null) {
        const r = await apiSave<{ count?: number; bom_updated?: number }>(toast, "/api/mo/est-labor",
          { method: "POST", body: { mo_id: checklistMO.id, rate_per_piece: perPiece, scope: "parent", save_bom: estSaveBom } },
          { quiet: true });
        if (!r.ok) throw new Error(r.error ?? "บันทึกไม่สำเร็จ");
        toast.success(`ใส่ค่าแรง ฿${fmt(perPiece)}/ชิ้น ให้ทุกใบของรุ่นนี้แล้ว ${r.data?.count ?? 0} ใบ${r.data?.bom_updated ? ` · เข้า BOM ${r.data.bom_updated} สูตร` : ""}`);
        await load(true);
        return;
      }
      const total = perPiece == null ? null : Math.round(perPiece * (checklistMO.qty || 0) * 100) / 100;   // ยอดรวม → เก็บใน est_labor_cost (ระบบเดิมใช้ยอดรวม)
      const res = await apiFetch("/api/mo/est-labor", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mo_id: checklistMO.id, est_labor_cost: total }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      if (estSaveBom && perPiece != null && checklistMO.product_sku) {   // บันทึกราคา/ชิ้น กลับเข้า BOM (ราคากลาง — craftsman_id null)
        await apiFetch("/api/bom/labor-rates", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bom_code: checklistMO.bom_code ?? undefined, product_sku: checklistMO.product_sku, craftsman_id: null, craftsman_name: "ราคากลาง", rate: perPiece }) }).catch(() => {});
      }
      toast.success(`บันทึกค่าแรงผลิต/ชิ้นแล้ว${estSaveBom ? " + เข้า BOM" : ""}`); await load(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setEstSaving(false); }
  };
  // กลุ่ม A: กด "งานเหมาเสร็จ" → นับเป็นค่าแรงงานเหมา-จริง
  const togglePieceDone = async (r: MoPieceRow) => {
    if (!canEdit || !r.selected_id) return;
    const done = r.status !== "done";
    setClPieceRows((rs) => rs.map((x) => x.key === r.key ? { ...x, status: done ? "done" : "pending" } : x));
    try {
      const res = await apiFetch("/api/mo/piecework", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.selected_id, done }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      void load(true);
    } catch (e) {
      setClPieceRows((rs) => rs.map((x) => x.key === r.key ? { ...x, status: done ? "pending" : "done" } : x));
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  };

  // โหลดเช็กลิสต์วัตถุดิบเมื่อเปิดป๊อปอัป (เตรียม=is_ready, ตัด=cut_done; needs_cut จากข้อมูลบล็อกตัด)
  useEffect(() => {
    setDelArmed(false); setClTab(clWO ? "recv" : "prep");
    setClPurch(null); setClIssues(null); setClHist(null); setClCost(null); setIssType(""); setIssSev("medium"); setIssQty("");
    setQtyEditing(false); setEstEditing(false);   // เปิดป๊อปใหม่ = จำนวน/ค่าแรง กลับเป็นอ่านอย่างเดียวเสมอ
    setClSteps(null); setClStepsBom(null);   // เปลี่ยนใบ → โหลดขั้นตอนใหม่
    if (!checklistMO) { setClRows([]); setClCutRows([]); setClPieceRows([]); setEstLabor(""); setMoQty(""); setMoDue(""); setMoDueInt(""); return; }
    setMoQty(String(checklistMO.qty ?? ""));   // ช่องแก้จำนวนสั่งผลิตในป๊อป
    setMoDue((checklistMO.due_date ?? "").slice(0, 10));
    setMoDueInt((checklistMO.internal_due_date ?? "").slice(0, 10));
    // ค่าแรงผลิตวางแผน — กรอกเป็น "ราคา/ชิ้น"
    // default: ราคากลาง/ชิ้น จาก BOM ก่อน · ไม่มีค่อยถอดจากยอดรวมที่เคยตั้งไว้ (prod_plan ÷ จำนวน)
    setEstSaveBom(false);
    const initRate = checklistMO.central_rate && checklistMO.central_rate > 0 ? String(checklistMO.central_rate)
      : (checklistMO.labor?.prod_plan && (checklistMO.qty || 0) > 0 ? String(Math.round((checklistMO.labor.prod_plan / (checklistMO.qty || 1)) * 100) / 100) : "");
    estLaborInit.current = initRate;
    setEstLabor(initRate);
    let cancel = false; setClLoading(true);
    void (async () => {
      try {
        const d = await fetchClMats(checklistMO.id);
        savedSumRef.current = new Map(d.summary.filter((s) => s.id).map((s) => [s.id as string, { on: s.on_hand_qty, rd: s.is_ready, po: s.purchase_override }]));
        if (!cancel) {
          setClRows(d.rows); setClCutRows(d.cutRows); setClSummary(d.summary); setClMaterials(d.materials); setClRequested(d.requested); setClSizeQty(d.sizeQty);
          // 🐛 ให้ตัวเลขในป๊อปตรงกับฐานข้อมูลเสมอ (บางทางเปิดป๊อปมาด้วยข้อมูลของการ์ดที่อาจค้างเก่า)
          setChecklistMO((m) => {
            if (!m || m.id !== checklistMO.id) return m;
            const same = m.qty === d.mo.qty && (m.due_date ?? null) === d.mo.due_date
              && (m.internal_due_date ?? null) === d.mo.internal_due_date && !!m.has_sizes === d.mo.has_sizes
              && (m.created_at ?? null) === d.mo.created_at;
            if (same) return m;
            // created_at: บางทางเปิดป๊อปด้วยข้อมูลที่ประกอบเอง (ไม่มีวันที่สร้าง) → เติมจากใบจริงตรงนี้
            return { ...m, qty: d.mo.qty, remaining: Math.max(0, d.mo.qty - (m.dispatched || 0)),
              due_date: d.mo.due_date, internal_due_date: d.mo.internal_due_date, has_sizes: d.mo.has_sizes, created_at: d.mo.created_at };
          });
          setMoQty(String(d.mo.qty));
          setMoDue((d.mo.due_date ?? "").slice(0, 10));
          setMoDueInt((d.mo.internal_due_date ?? "").slice(0, 10));
        }
      } catch { if (!cancel) { setClRows([]); setClCutRows([]); setClSummary([]); setClMaterials([]); } }
      finally { if (!cancel) setClLoading(false); }
    })();
    // งานเหมารายชิ้นของใบนี้ (โหลดแยก ไม่บล็อกเช็กลิสต์หลัก)
    void (async () => {
      try {
        const pr = await apiFetch(`/api/mo/piecework?mo_id=${encodeURIComponent(checklistMO.id)}`);
        const pj = await pr.json();
        if (!cancel) setClPieceRows((pj?.data ?? []) as MoPieceRow[]);
      } catch { if (!cancel) setClPieceRows([]); }
    })();
    // ปัญหา (โหลดเลย — ใช้เลขบนแท็บ) · ของซื้อ/ประวัติ เลื่อนไปโหลดตอนกดแท็บนั้น (ลดของที่ยิงตอนเปิด = เร็วขึ้น)
    const moNo = checklistMO.mo_no;
    void (async () => { try { const r = await apiFetch(`/api/mo/issues?mo_no=${encodeURIComponent(moNo)}`); const j = await r.json(); if (!cancel) setClIssues((j?.data ?? []) as MoIssue[]); } catch { if (!cancel) setClIssues([]); } })();
    return () => { cancel = true; };
    // ผูกกับ "ใบไหน" อย่างเดียว — ข้างในมี setChecklistMO (sync ค่าจาก DB) ถ้าผูกทั้งก้อนจะวิ่งซ้ำไม่จบ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checklistMO?.id, clWO?.id]);

  // เลื่อนโหลด: ของซื้อ/ประวัติ ดึงเฉพาะตอนกดเข้าแท็บนั้น (ยังไม่เคยโหลด = null)
  useEffect(() => {
    if (!checklistMO) return;
    const moNo = checklistMO.mo_no; let cancel = false;
    if (clTab === "purch" && clPurch === null) void (async () => { try { const r = await apiFetch(`/api/mo/purchase-status?mo_no=${encodeURIComponent(moNo)}`); const j = await r.json(); if (!cancel) setClPurch((j?.data ?? []) as PurchaseStatusRow[]); } catch { if (!cancel) setClPurch([]); } })();
    if (clTab === "hist" && clHist === null) void (async () => { try { const r = await apiFetch(`/api/mo/dispatch-history?mo_no=${encodeURIComponent(moNo)}`); const j = await r.json(); if (!cancel) setClHist((j?.data ?? []) as DispatchHistRow[]); } catch { if (!cancel) setClHist([]); } })();
    if (clTab === "cost" && clCost === null && checklistMO) void (async () => { try { const r = await apiFetch(`/api/mo/${encodeURIComponent(checklistMO.id)}/cost`); const j = await r.json(); if (!cancel) setClCost((j?.data ?? null) as MoCost | null); } catch { /* ignore */ } })();
    return () => { cancel = true; };
  }, [clTab, checklistMO, clPurch, clHist, clCost]);

  // ติ๊กเตรียม/ตัด รายวัตถุดิบในป๊อปอัป (optimistic + audit)
  const toggleMat = useCallback(async (rowId: string, field: "is_ready" | "cut_done") => {
    if (!canEdit) return;
    const cur = clRows.find((r) => r.id === rowId); if (!cur) return;
    const next = !cur[field];
    setClRows((rs) => rs.map((r) => r.id === rowId ? { ...r, [field]: next } : r));
    try {
      const res = await apiFetch(`/api/mo/material`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rowId, [field]: next }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
    } catch (e) {
      setClRows((rs) => rs.map((r) => r.id === rowId ? { ...r, [field]: !next } : r));
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }, [canEdit, clRows, toast]);
  // ติ๊ก "ตัดครบ" รายบล็อก (หน้าตัด) — อัปเดต mo_materials + ลิงก์สองทางมาที่เตรียมครบในหน้าเตรียม
  const toggleCut = useCallback(async (rowId: string) => {
    if (!canEdit) return;
    const cur = clCutRows.find((r) => r.id === rowId); if (!cur) return;
    const next = !cur.cut_done;
    setClCutRows((rs) => rs.map((r) => r.id === rowId ? { ...r, cut_done: next } : r));
    try {
      const res = await apiFetch(`/api/mo/material-line`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rowId, cut_done: next }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      // server คืน is_ready (เตรียมครบ) ของวัตถุดิบนั้น → sync แท็บเตรียม
      if (cur.component_sku != null && typeof j.is_ready === "boolean") {
        setClRows((rs) => rs.map((r) => r.component_sku === cur.component_sku ? { ...r, is_ready: j.is_ready, cut_done: j.is_ready } : r));
      }
    } catch (e) {
      setClCutRows((rs) => rs.map((r) => r.id === rowId ? { ...r, cut_done: !next } : r));
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }, [canEdit, clCutRows, toast]);
  // โหลดงานเหมาของใบนี้ใหม่ (หลังเพิ่มจาก popup)
  const reloadPiece = useCallback(async () => {
    if (!checklistMO) return;
    try { const pr = await apiFetch(`/api/mo/piecework?mo_id=${encodeURIComponent(checklistMO.id)}`); const pj = await pr.json(); setClPieceRows((pj?.data ?? []) as MoPieceRow[]); } catch { /* ignore */ }
  }, [checklistMO]);
  // เลือก/ยกเลิก งานเหมารายชิ้นที่จะจ่าย (จากงานเหมาใน BOM ของสินค้า)
  /** เปิดแก้บรรทัดงานเหมา (ชื่อ/เรต/จำนวนต่อใบ) */
  const openPieceEdit = (r: MoPieceRow) => {
    setPieceEditKey(r.key);
    setPieceEdit({ job_name: r.job_name, rate: r.rate ? String(r.rate) : "", qty_per: String(r.qty_per ?? 1) });
  };
  /** บันทึกที่แก้ — ถ้าแถวนี้ยังไม่ได้ติ๊กจ่าย จะสร้างแถวของใบนี้ให้ (= ติ๊กจ่ายให้ด้วย) */
  const savePieceEdit = async (r: MoPieceRow) => {
    if (!canEdit || !checklistMO) return;
    const name = pieceEdit.job_name.trim();
    if (!name) { toast.error("ชื่องานห้ามว่าง"); return; }
    const rate = Number(pieceEdit.rate) || 0;
    const qtyPer = Math.max(0, Number(pieceEdit.qty_per) || 0);
    setPieceBusy(true);
    try {
      if (r.selected_id) {
        const res = await apiFetch("/api/mo/piecework", { method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: r.selected_id, job_name: name, rate, qty_per: qtyPer }) });
        const j = await res.json(); if (j.error) throw new Error(j.error);
      } else {
        const res = await apiFetch("/api/mo/piecework", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mo_id: checklistMO.id, job_id: r.job_id, job_name: name, rate, qty_per: qtyPer, is_detail: r.is_detail, note: r.note }) });
        const j = await res.json(); if (j.error) throw new Error(j.error);
      }
      setPieceEditKey(null);
      await reloadPiece();
      toast.success(r.selected_id ? "แก้งานเหมาแล้ว" : "แก้แล้ว + เลือกจ่ายงานนี้ในใบนี้ให้ด้วย");
      void load(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setPieceBusy(false); }
  };
  /** ลบงานเหมา — แถวที่ติ๊กจ่ายแล้ว = เอาออกจากใบนี้ · แถวที่มาจากสูตร = เอาออกจากสูตร (กระทบใบอื่นในอนาคต) */
  const deletePieceRow = async (r: MoPieceRow) => {
    if (!canEdit || !checklistMO) return;
    if (r.selected_id) {
      if (!window.confirm(`เอา "${r.job_name}" ออกจากใบนี้?`)) return;
      setPieceBusy(true);
      try {
        const res = await apiFetch(`/api/mo/piecework?id=${encodeURIComponent(r.selected_id)}`, { method: "DELETE" });
        const j = await res.json(); if (j.error) throw new Error(j.error);
        await reloadPiece(); toast.success("เอาออกจากใบนี้แล้ว"); void load(true);
      } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
      finally { setPieceBusy(false); }
      return;
    }
    // แถวที่มาจากสูตร (ยังไม่ได้ติ๊ก) → เอาออกจาก BOM
    const bomCode = checklistMO.bom_code;
    if (!bomCode) { toast.error("ใบนี้ไม่มีสูตร จึงลบงานจากสูตรไม่ได้"); return; }
    if (!window.confirm(`เอา "${r.job_name}" ออกจาก "สูตร" (BOM ${bomCode})?

มีผลกับใบสั่งผลิตที่จะสร้างใหม่ด้วย (ใบที่ติ๊กจ่ายไปแล้วไม่กระทบ)`)) return;
    setPieceBusy(true);
    try {
      const cur = await apiFetch(`/api/bom/piecework?bom_code=${encodeURIComponent(bomCode)}`).then((x) => x.json());
      const rows = ((cur.data ?? []) as { job_id: string | null; job_name: string; rate: number; note: string | null; is_detail: boolean; qty_per: number }[])
        .filter((x) => !(x.job_name === r.job_name && (x.job_id ?? null) === (r.job_id ?? null)));
      const res = await apiFetch("/api/bom/piecework", { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bom_code: bomCode, lines: rows }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      await reloadPiece(); toast.success("เอาออกจากสูตรแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบจากสูตรไม่สำเร็จ"); }
    finally { setPieceBusy(false); }
  };

  const togglePiece = useCallback(async (key: string) => {
    if (!canEdit || !checklistMO) return;
    const cur = clPieceRows.find((r) => r.key === key); if (!cur) return;
    try {
      if (cur.selected_id) {
        const res = await apiFetch(`/api/mo/piecework?id=${encodeURIComponent(cur.selected_id)}`, { method: "DELETE" });
        const j = await res.json(); if (j.error) throw new Error(j.error);
        setClPieceRows((rs) => rs.filter((r) => r.in_bom || r.key !== key).map((r) => r.key === key ? { ...r, selected_id: null } : r));
      } else {
        const res = await apiFetch(`/api/mo/piecework`, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mo_id: checklistMO.id, job_id: cur.job_id, job_name: cur.job_name, rate: cur.rate, qty_per: cur.qty_per, is_detail: cur.is_detail, note: cur.note }) });
        const j = await res.json(); if (j.error) throw new Error(j.error);
        setClPieceRows((rs) => rs.map((r) => r.key === key ? { ...r, selected_id: String(j.id), total_qty: Number(j.total_qty) || r.total_qty } : r));
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  }, [canEdit, checklistMO, clPieceRows, toast]);
  // ลงปัญหา (QC) ผูกกับใบสั่งผลิตนี้
  const addIssue = useCallback(async () => {
    if (!canEdit || !checklistMO) return;
    const dtype = issType.trim(); if (!dtype) { toast.error("กรุณาระบุปัญหาที่เจอ"); return; }
    try {
      const res = await apiFetch(`/api/mo/issues`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mo_no: checklistMO.mo_no, defect_type: dtype, severity: issSev, qty: issQty || null }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setClIssues((rs) => [{ id: String(j.id), defect_no: j.defect_no ?? null, defect_type: dtype, severity: issSev, qty: issQty ? Number(issQty) : null, cause: null, created_at: new Date().toISOString() }, ...(rs ?? [])]);
      setIssType(""); setIssQty(""); toast.success("ลงปัญหาแล้ว");
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  }, [canEdit, checklistMO, issType, issSev, issQty, toast]);
  // แก้ปัญหาที่ลงผิด (ข้อความ / ความรุนแรง / จำนวน)
  const editIssue = useCallback(async (id: string, patch: { defect_type: string; severity: string; qty: string }): Promise<boolean> => {
    try {
      const res = await apiFetch(`/api/mo/issues`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, defect_type: patch.defect_type, severity: patch.severity, qty: patch.qty === "" ? null : patch.qty }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setClIssues((rs) => (rs ?? []).map((x) => x.id === id ? { ...x, defect_type: patch.defect_type.trim(), severity: patch.severity, qty: patch.qty === "" ? null : Number(patch.qty) } : x));
      toast.success("แก้ปัญหาแล้ว");
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : "แก้ไม่สำเร็จ"); return false; }
  }, [toast]);
  const delIssue = useCallback(async (id: string) => {
    try { const res = await apiFetch(`/api/mo/issues?id=${encodeURIComponent(id)}`, { method: "DELETE" }); const j = await res.json(); if (j.error) throw new Error(j.error); setClIssues((rs) => (rs ?? []).filter((x) => x.id !== id)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  }, [toast]);
  // โหลดวัตถุดิบใหม่โดยไม่ปิด/รีเซ็ตป๊อป (ใช้หลังกด "อัพเดตตาม BOM")
  const reloadClMats = useCallback(async () => {
    if (!checklistMO) return;
    setClLoading(true);
    try {
      const d = await fetchClMats(checklistMO.id);
      savedSumRef.current = new Map(d.summary.filter((s) => s.id).map((s) => [s.id as string, { on: s.on_hand_qty, rd: s.is_ready, po: s.purchase_override }]));
      setClRows(d.rows); setClCutRows(d.cutRows); setClSummary(d.summary); setClMaterials(d.materials); setClRequested(d.requested); setClSizeQty(d.sizeQty);
      setClCost(null);   // ต้นทุนเปลี่ยนตามวัตถุดิบ → ให้โหลดใหม่ตอนเข้าแท็บ
      void load(true);   // อัปเดตไฟเขียว/ตัวนับบนการ์ดที่บอร์ด
    } catch { toast.error("โหลดวัตถุดิบใหม่ไม่สำเร็จ"); }
    finally { setClLoading(false); }
  }, [checklistMO, load, toast]);

  /**
   * แก้ "จำนวนสั่งผลิต" ได้จากป๊อปเช็กลิสต์เลย (เดิมต้องไปหน้าใบสั่งผลิต)
   * ⚠️ ต้องส่ง preserve: true — การเปลี่ยนจำนวนทำให้ระบบกางสูตรใหม่ ถ้าไม่ preserve
   *    ค่าที่ติ๊กไว้ (เตรียม/ตัด/จำนวนที่มี/ยอดขอซื้อ) จะถูกล้างทิ้งหมด
   */
  const saveMoQty = useCallback(async () => {
    if (!checklistMO) return;
    const n = Number(moQty);
    if (!isFinite(n) || n <= 0) { toast.error("จำนวนต้องมากกว่า 0"); return; }
    if (n === (checklistMO.qty || 0)) return;
    setQtySaving(true);
    const r = await apiSave(toast, `/api/mo/${encodeURIComponent(checklistMO.id)}`, { body: { qty: n, preserve: true } },
      { ok: `เปลี่ยนจำนวนเป็น ${fmt(n)} ชิ้นแล้ว — คิดวัตถุดิบตามจำนวนใหม่ให้อัตโนมัติ`, fail: "เปลี่ยนจำนวนไม่สำเร็จ" });
    setQtySaving(false);
    if (!r.ok) return;
    setQtyEditing(false);   // บันทึกแล้วกลับเป็นอ่านอย่างเดียว
    setChecklistMO((m) => (m ? { ...m, qty: n, remaining: Math.max(0, n - (m.dispatched || 0)) } : m));
    await reloadClMats();   // วัตถุดิบ + ต้นทุน + การ์ดบนบอร์ด (reloadClMats เรียก load(true) ให้แล้ว)
  }, [checklistMO, moQty, reloadClMats, toast]);

  // ตารางวัตถุดิบกลาง — แก้ (จำนวนที่มี/ขอซื้อ/เตรียมครบ) → อัปเดตทันที + บันทึกแบบ debounce (กันยิง API ถี่ตอนพิมพ์)
  const onMatSummaryChange = useCallback((rows: MoMatSummary[]) => {
    setClSummary(rows);
    if (matSaveTimer.current) clearTimeout(matSaveTimer.current);
    matSaveTimer.current = setTimeout(() => {
      for (const r of rows) {
        if (!r.id) continue;
        const p = savedSumRef.current.get(r.id);
        const body: Record<string, unknown> = {};
        if (!p || p.rd !== r.is_ready) body.is_ready = r.is_ready;
        if (!p || p.on !== r.on_hand_qty) body.on_hand_qty = r.on_hand_qty;
        if (!p || p.po !== r.purchase_override) body.purchase_override = r.purchase_override;
        if (Object.keys(body).length === 0) continue;
        savedSumRef.current.set(r.id, { on: r.on_hand_qty, rd: r.is_ready, po: r.purchase_override });
        void apiFetch(`/api/mo/material`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, ...body }) })
          .then((res) => res.json()).then((j) => { if (j.error) toast.error(j.error); }).catch(() => toast.error("บันทึกไม่สำเร็จ"));
      }
    }, 600);
  }, [toast]);
  const onMatToggleCut = useCallback(async (line: MoMatPreview, next: boolean) => {
    if (!canEdit || !line.id) return;
    setClMaterials((ms) => ms.map((m) => m.id === line.id ? { ...m, cut_done: next } : m));
    try {
      const res = await apiFetch(`/api/mo/material-line`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: line.id, cut_done: next }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      if (line.component_sku != null && typeof j.is_ready === "boolean") setClSummary((ss) => ss.map((s) => s.component_sku === line.component_sku ? { ...s, is_ready: j.is_ready } : s));
    } catch (e) {
      setClMaterials((ms) => ms.map((m) => m.id === line.id ? { ...m, cut_done: !next } : m));
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }, [canEdit, toast]);
  /**
   * บันทึก "วันกำหนด" ของใบสั่งผลิตจากป๊อปเช็กลิสต์
   *  · due      = 📦 นัดส่งลูกค้า
   *  · internal = 🪑 ส่งงานภายใน (เซิร์ฟเวอร์จะไล่ขยับใบจ่ายงานที่ยังทำอยู่ให้ด้วย)
   */
  const saveMoDue = useCallback(async (field: "due" | "internal", value: string) => {
    if (!checklistMO) return;
    setMoDueSaving(field);
    const body = field === "due"
      ? { id: checklistMO.id, due_date: value || null }
      : { id: checklistMO.id, internal_due_date: value || null };
    const r = await apiSave<{ cascaded?: number }>(toast, "/api/mo/set-due-date", { method: "POST", body }, {
      ok: field === "due"
        ? (value ? "ตั้งวันนัดส่งลูกค้าแล้ว" : "ล้างวันนัดส่งลูกค้าแล้ว")
        : (value ? "ตั้งวันส่งงานภายในแล้ว" : "ล้างวันส่งงานภายในแล้ว"),
      fail: "บันทึกวันไม่สำเร็จ",
    });
    setMoDueSaving("");
    if (r.ok) await load(true);
  }, [checklistMO, toast, load]);

  /**
   * งวดส่ง — "ใบนี้ 1,000 ชิ้น ส่ง 300 วันที่ 20 · อีก 700 วันที่ 28"
   * เก็บที่ mo_delivery_plan · ปฏิทินนัดส่งลูกค้าโชว์ทีละงวด (ลากเลื่อนวันได้)
   */
  const addPlanRow = useCallback(async () => {
    if (!checklistMO) return;
    const qty = Number(newPlanQty);
    if (!newPlanDate) { toast.error("เลือกวันที่ส่งก่อน"); return; }
    if (!(qty > 0)) { toast.error("ใส่จำนวนที่จะส่งงวดนี้"); return; }
    setPlanSaving(true);
    const r = await apiSave(toast, "/api/mo/delivery-plan",
      { method: "POST", body: { mo_id: checklistMO.id, due_date: newPlanDate, qty, note: newPlanNote.trim() || null } },
      { ok: `เพิ่มงวดส่ง ${fmt(qty)} ชิ้นแล้ว`, fail: "เพิ่มงวดส่งไม่สำเร็จ" });
    setPlanSaving(false);
    if (r.ok) { setNewPlanQty(""); setNewPlanNote(""); await load(true); }
  }, [checklistMO, newPlanDate, newPlanQty, newPlanNote, toast, load]);

  const patchPlanRow = useCallback(async (id: string, patch: {
    due_date?: string; qty?: number; shipped?: boolean; shipped_at?: string | null;
    delivery_note_id?: string | null; dn_number?: string | null;
  }) => {
    setPlanSaving(true);
    const okMsg = "shipped" in patch ? (patch.shipped ? "ติ๊กว่าส่งแล้ว" : "ยกเลิกติ๊กส่งแล้ว") : "แก้งวดส่งแล้ว";
    const r = await apiSave(toast, "/api/mo/delivery-plan", { method: "PATCH", body: { id, ...patch } },
      { ok: okMsg, fail: "บันทึกงวดส่งไม่สำเร็จ" });
    setPlanSaving(false);
    if (r.ok) await load(true);
  }, [toast, load]);

  /**
   * ออกใบส่งสินค้า (ร่าง) จากงวดส่ง — ใช้ระบบใบส่งสินค้าของกลาง (/api/delivery-notes)
   * ใบสั่งผลิตไม่มีข้อมูลลูกค้า → ออกเป็นร่างพร้อมรายการสินค้า แล้วไปเลือกลูกค้าต่อในใบ
   */
  const createDNForPlan = useCallback(async (p: DeliveryPlan) => {
    const mo = [...board.pending, ...board.dispatchedMos].find((m) => m.id === p.mo_id);
    if (!mo) { toast.error("ไม่พบใบสั่งผลิตของงวดนี้"); return; }
    setPlanSaving(true);
    const r = await apiSave<{ id?: string }>(toast, "/api/delivery-notes", {
      method: "POST",
      body: {
        header: { delivery_date: String(p.due_date).slice(0, 10), note: `จากใบสั่งผลิต ${mo.mo_no}${p.note ? ` · ${p.note}` : ""}` },
        lines: [{ sku: mo.product_sku, product_name: mo.product_name ?? mo.product_sku ?? "", qty: Number(p.qty) || 0, unit: "ชิ้น" }],
        actor: user?.email ?? null,
      },
    }, { ok: "ออกใบส่งสินค้า (ร่าง) แล้ว — ไปเลือกลูกค้าในใบต่อได้เลย", fail: "ออกใบส่งสินค้าไม่สำเร็จ" });
    if (!r.ok || !r.data?.id) { setPlanSaving(false); return; }
    // อ่านเลขที่ใบมาโชว์บนงวด (ไม่สำเร็จก็ไม่เป็นไร ยังลิงก์ด้วย id ได้)
    let dnNo: string | null = null;
    try {
      const d = await apiFetch(`/api/delivery-notes/${r.data.id}`);
      const dj = await d.json(); dnNo = (dj?.data?.dn_number as string) ?? null;
    } catch { /* ไม่มีเลขก็โชว์ว่า "ใบส่งสินค้า" */ }
    await apiSave(toast, "/api/mo/delivery-plan",
      { method: "PATCH", body: { id: p.id, delivery_note_id: r.data.id, dn_number: dnNo } },
      { quiet: true });
    setPlanSaving(false);
    await load(true);
  }, [board.pending, board.dispatchedMos, user?.email, toast, load]);

  const delPlanRow = useCallback(async (id: string) => {
    setPlanSaving(true);
    const r = await apiSave(toast, `/api/mo/delivery-plan?id=${encodeURIComponent(id)}`, { method: "DELETE" },
      { ok: "ลบงวดส่งแล้ว (จำนวนกลับไปเป็นยังไม่แบ่งงวด)", fail: "ลบงวดส่งไม่สำเร็จ" });
    setPlanSaving(false);
    if (r.ok) await load(true);
  }, [toast, load]);

  /**
   * แก้ "จำนวนที่จ่าย" ของใบจ่ายงาน — ใช้ตอนลงผิด (เช่น เปิดใบ 30 แต่งานจริง 20)
   * กติกา: ห้ามน้อยกว่าจำนวนที่ช่างส่งกลับมาแล้ว (ไม่งั้นยอดติดลบ)
   * ถ้าใบสั่งผลิตยังเป็นจำนวนเดิม ต้องไปแก้จำนวนใบสั่งผลิตด้วย (ป๊อปเตือนให้)
   */
  const saveWoQty = useCallback(async (value: string) => {
    if (!clWO) return;
    const n = Number(value);
    if (!isFinite(n) || n <= 0) { toast.error("จำนวนต้องมากกว่า 0"); return; }
    const recv = Number(clWO.received_qty) || 0;
    if (n < recv - 0.0001) { toast.error(`ลดต่ำกว่าที่ส่งกลับมาแล้วไม่ได้ (ส่งแล้ว ${fmt(recv)} ชิ้น)`); return; }
    setWoQtySaving(true);
    const r = await apiSave(toast, `/api/mo/work-orders/${encodeURIComponent(clWO.id)}`,
      { method: "PATCH", body: { qty: n } },
      { ok: `แก้จำนวนที่จ่ายเป็น ${fmt(n)} ชิ้นแล้ว`, fail: "แก้จำนวนที่จ่ายไม่สำเร็จ" });
    setWoQtySaving(false);
    if (r.ok) { setClWO({ ...clWO, qty: n }); setWoQty(String(n)); await load(true); }
  }, [clWO, toast, load]);

  // บันทึกกำหนดเสร็จของ "ใบจ่ายงาน" ใบเดียว (แท็บส่งงาน)
  const saveWoDue = useCallback(async (value: string) => {
    if (!clWO) return;
    setWoDueSaving(true);
    const r = await apiSave(toast, `/api/mo/work-orders/${encodeURIComponent(clWO.id)}`,
      { method: "PATCH", body: { due_date: value || null } },
      { ok: value ? "ตั้งกำหนดเสร็จแล้ว" : "ล้างกำหนดเสร็จแล้ว", fail: "บันทึกกำหนดเสร็จไม่สำเร็จ" });
    setWoDueSaving(false);
    if (r.ok) { setClWO({ ...clWO, due_date: value || null }); await load(true); }
  }, [clWO, toast, load]);

  // เปิดเช็กลิสต์งานจาก URL (?mo=<id>) — ใช้ตอนกดการ์ดจากหน้า Dashboard ผลิต (เปิด modal ตัวจริงตัวเดียวกัน)
  const searchParams = useSearchParams();
  // ?view=table — เปิดมุมมองที่ระบุตรง ๆ (กรอบพรีวิว iPad / ลิงก์ QR) · เปลี่ยนชั่วคราว ไม่ทับมุมมองเริ่มต้นที่ผู้ใช้ตั้ง ⭐
  useEffect(() => {
    const v = searchParams.get("view");
    if (v === "board" || v === "canvas" || v === "table" || v === "shop" || v === "purchase" || v === "calendar" || v === "labor" || v === "exec") setViewMode(v);
  }, [searchParams, setViewMode]);
  // โหมด "เช็กลิสต์อย่างเดียว": หน้าอื่นฝังหน้านี้ใน iframe (?embed=1&mo=<id> — ของกลาง lib/mo-checklist-embed)
  // → เช็กลิสต์เต็มกรอบ ไม่โชว์บอร์ด · ปิด/ลบแล้วแจ้งหน้าแม่ให้ถอยกลับเอง
  const popupOnly = searchParams.get("embed") === "1" && !!searchParams.get("mo");
  // ?cu=requests — ลิงก์จากแจ้งเตือน "รอยืนยันอัปเดตงาน" → เข้าโหมดอัปเดตงาน (มุมมองตาราง) + เปิดคิวคำขอ
  const [cuQueueAsk, setCuQueueAsk] = useState(false);
  useEffect(() => {
    if (searchParams.get("cu") !== "requests" || !canCatchUp) return;
    setCatchUpMode(true); setViewMode("table"); setCuQueueAsk(true);
  }, [searchParams, canCatchUp, setViewMode]);
  const [urlOpened, setUrlOpened] = useState(false);   // เปิดเช็กลิสต์จาก URL ไปแล้ว (ใช้เลือกข้อความบนฉากบังบอร์ด)

  const closeChecklist = useCallback(() => {
    setChecklistMO(null); setClWO(null); setDelArmed(false); void load(true);
    if (popupOnly) postMoChecklistEvent("close");
  }, [load, popupOnly]);

  const openedFromUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const moId = searchParams.get("mo");
    if (!moId || openedFromUrlRef.current === moId) return;
    // ใบที่จ่ายงานครบแล้ว (ไม่อยู่ในรอจ่าย) ก็เปิดเช็กลิสต์ได้ — เหมือนตอนกดจากปฏิทิน
    const mo = board.pending.find((x) => x.id === moId) ?? board.dispatchedMos.find((x) => x.id === moId);
    if (mo) { openedFromUrlRef.current = moId; setClWO(null); setChecklistMO(mo); setUrlOpened(true); }
  }, [searchParams, board.pending, board.dispatchedMos]);
  const deleteMO = useCallback(async (mo: PendingMO) => {
    try {
      const res = await apiFetch(`/api/mo/${mo.id}`, { method: "DELETE" });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success("ลบงานแล้ว"); setChecklistMO(null); setDelArmed(false);
      if (popupOnly) postMoChecklistEvent("deleted");
      await load(true);
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
  }, [toast, load, popupOnly]);

  // ---- จัดการแผนก (popup ตั้งค่าแผนก) ----
  const loadDepts = useCallback(async () => {
    setDeptLoading(true);
    try { const res = await apiFetch("/api/mo/departments"); const j = await res.json(); setDeptList((j.data ?? []) as DeptFull[]); }
    catch { /* ignore */ } finally { setDeptLoading(false); }
  }, []);
  const openDeptMgr = useCallback(() => { setConfirmDelId(null); setDeptMgrOpen(true); void loadDepts(); }, [loadDepts]);
  // สร้าง/เปลี่ยนชื่อ/ปิดโต๊ะจากแผง 👥 ในป๊อปจ่ายงาน → โหลดบอร์ดใหม่ แล้วเลือกโต๊ะปลายทางให้ (null = ไม่เลือก)
  const [deskFocus, setDeskFocus] = useState<string | null | undefined>(undefined);
  const deskChanged = useCallback(async (focus: string | null) => { await load(true); setDeskFocus(focus); }, [load]);
  useEffect(() => {
    if (deskFocus === undefined) return;
    if (deskFocus === null) { setDispDept(null); setDeskFocus(undefined); return; }
    const d = board.departments.find((x) => x.id === deskFocus);
    if (d) { setDispDept(d); setDeskFocus(undefined); }
  }, [deskFocus, board.departments]);
  const closeDeptMgr = useCallback(() => { setDeptMgrOpen(false); void load(true); }, [load]);
  const patchDept = useCallback(async (id: string, p: Partial<DeptFull>) => {
    setDeptList((ls) => ls.map((d) => d.id === id ? { ...d, ...p } : d));
    try { const res = await apiFetch("/api/mo/departments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...p }) }); const j = await res.json(); if (j.error) throw new Error(j.error); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); void loadDepts(); }
  }, [toast, loadDepts]);
  const addDept = useCallback(async () => {
    const name = newDeptName.trim(); if (!name) return;
    try { const res = await apiFetch("/api/mo/departments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); const j = await res.json(); if (j.error) throw new Error(j.error); setNewDeptName(""); await loadDepts(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
  }, [newDeptName, toast, loadDepts]);
  const delDept = useCallback(async (id: string) => {
    try { const res = await apiFetch(`/api/mo/departments?id=${encodeURIComponent(id)}`, { method: "DELETE" }); const j = await res.json(); if (j.error) throw new Error(j.error); setConfirmDelId(null); await loadDepts(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); setConfirmDelId(null); }
  }, [toast, loadDepts]);
  const moveDept = useCallback((idx: number, dir: -1 | 1) => {
    const j = idx + dir; if (j < 0 || j >= deptList.length) return;
    const arr = [...deptList]; const tmp = arr[idx]; arr[idx] = arr[j]; arr[j] = tmp;
    arr[idx] = { ...arr[idx], display_order: idx }; arr[j] = { ...arr[j], display_order: j };
    setDeptList(arr);
    void patchDept(arr[idx].id, { display_order: idx }); void patchDept(arr[j].id, { display_order: j });
  }, [deptList, patchDept]);

  // ติ๊ก "เตรียมครบ / ตัดครบ" บนการ์ดรอจ่าย → ไฟเขียวเมื่อครบทั้งคู่ (optimistic + audit) — ใช้กับใบที่ไม่มี BOM
  const togglePrep = useCallback(async (mo: PendingMO, field: "prep_done" | "cut_done") => {
    if (!canEdit) return;
    const next = !mo[field];
    const apply = (val: boolean) => setBoard((b) => ({ ...b, pending: b.pending.map((p) => {
      if (p.id !== mo.id) return p;
      const np = { ...p, [field]: val };
      return { ...np, ready: np.has_bom ? np.ready : (np.prep_done && np.cut_done) };
    }) }));
    apply(next);
    try {
      const res = await apiFetch(`/api/mo/${mo.id}/prep`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: next }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
    } catch (e) {
      apply(!next);
      toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    }
  }, [canEdit, toast]);

  // รายการการ์ดทั้งหมด (วาดแยกจากโซน เพื่อวางอิสระทับโซนได้)
  // ซ่อนใบจ่ายงานสเตจ "ตัด" (ของเดิม) — งานตัดย้ายไปเป็นเช็กลิสต์ในการ์ดรอจ่าย
  const cards = useMemo(() => {
    const arr: { cid: string; kind: "mo" | "wo"; node: React.ReactNode }[] = [];
    // รอจ่ายย้ายไปป๊อปอัปแล้ว — แคนวาสวาดเฉพาะใบจ่ายงานในโต๊ะ
    for (const w of board.workOrders) if (w.status !== "done" && w.stage !== "cut") arr.push({ cid: `wo:${w.id}`, kind: "wo", node: <WOBody w={w} /> });
    return arr;
  }, [board, canEdit, togglePrep]);

  // ---- แถบบนแบบแอป (ของกลาง components/page-chrome) ----
  //   ชื่อ+สลับมุมมอง · อัปเดตล่าสุด · คำขอ · ＋ สร้างใบ · ⋯ เมนูรวม (ไปหน้า / พิมพ์รายงาน / ตั้งค่า)
  //   จอ < xl = เชลล์วาดในแถบบนของมันเอง (ค้นหา + ปุ่มผู้ใช้ "มุมมองหน้านี้" มาจากมุมมองตาราง) · จอคอม/embed/ขยายเต็มจอ = หน้าวาดเอง
  const chromeHost = useChromeHost();
  const isXl = useIsDesktopXl();
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreSec, setMoreSec] = useState<"" | "print">("");
  // 🔄 โหมดอัปเดตงาน (ย้อนหลัง) — ทุกแถวในตารางมีปุ่ม "อัปเดต" (ดู ./catch-up.ts)
  const [catchUpMode, setCatchUpMode] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const planSel = printPlan || (activePlan !== "real" ? activePlan : plans[0]?.id) || "";
  const planHref = planSel ? `/print/work-board?type=plan&plan=${encodeURIComponent(planSel)}` : "";
  const menuItem = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50";
  const menuHead = "px-3 pt-2 pb-1 text-[11px] font-medium text-slate-400";
  const closeMore = () => setMoreOpen(false);
  const moreMenu = (
    <div ref={moreRef} className="inline-block">
      <button type="button" onClick={() => setMoreOpen((v) => !v)} title="เมนูบอร์ด — ไปหน้าอื่น · พิมพ์รายงาน · ตั้งค่า" aria-label="เมนูบอร์ด"
        className={`h-9 w-9 rounded-lg border text-lg leading-none ${moreOpen ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>⋯</button>
      <FloatingDropdown anchorRef={moreRef} open={moreOpen} onClose={closeMore} minWidth={290} maxWidth={330}>
        <div className="overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white py-1 shadow-xl" style={{ maxHeight: "var(--fd-max-h, 80vh)" }}>
          <div className={menuHead}>ไปหน้า</div>
          <a href="/master/work-submissions" className={menuItem}>📤 ตารางส่งงาน</a>
          <a href="/master/manufacturing-orders" className={menuItem}>🏭 ใบสั่งผลิต</a>
          <a href="/master/mo-backlog" className={menuItem}>🧹 จัดการใบค้าง <span className="ml-auto text-[11px] text-slate-400">ปิด · ยกเลิก · ตั้งวัน</span></a>
          {canCatchUp && (
            <button type="button" onClick={() => { closeMore(); setCatchUpMode(true); if (viewMode !== "table") setViewMode("table"); }} className={menuItem}>
              🔄 อัปเดตงาน <span className="ml-auto text-[11px] text-slate-400">บอกว่าใบไปถึงขั้นไหนแล้ว</span>
            </button>
          )}
          <div className="my-1 border-t border-slate-100" />
          <button type="button" onClick={() => setMoreSec((s) => (s === "print" ? "" : "print"))} className={menuItem}>
            🖨 พิมพ์รายงาน <span className="ml-auto text-slate-400">{moreSec === "print" ? "▴" : "▾"}</span>
          </button>
          {moreSec === "print" && (
            <div className="mx-2 mb-1 rounded-lg border border-slate-100 bg-slate-50/60 py-1">
              <div className="px-3 py-1.5">
                <label className="mb-1 block text-[11px] text-slate-500">เลือกกลุ่มที่จะพิมพ์ (รอจ่าย/กำลังผลิต)</label>
                <select value={pendGroupFilter} onChange={(e) => setPendGroupFilter(e.target.value)} className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm">
                  <option value="__all__">ทั้งหมด</option>
                  <option value="__none__">— ยังไม่จับกลุ่ม —</option>
                  {moGroups.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
                </select>
              </div>
              <a href={printUrl("all")} target="_blank" rel="noreferrer" onClick={closeMore} className="block px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50">🖨 พิมพ์ทั้งหมดในใบเดียว<div className="text-[11px] font-normal text-indigo-400">รอจ่าย + งานเหมา + กำลังผลิต</div></a>
              <a href={printUrl("pending")} target="_blank" rel="noreferrer" onClick={closeMore} className="block px-3 py-1.5 text-sm text-slate-700 hover:bg-white">📋 รายการรอจ่ายทั้งหมด</a>
              <a href={printUrl("piece")} target="_blank" rel="noreferrer" onClick={closeMore} className="block px-3 py-1.5 text-sm text-slate-700 hover:bg-white">🧵 รายการรอจ่ายเหมาทั้งหมด</a>
              <a href={printUrl("production")} target="_blank" rel="noreferrer" onClick={closeMore} className="block px-3 py-1.5 text-sm text-slate-700 hover:bg-white">🔨 รายการกำลังผลิต (แยกตามโต๊ะ/ช่าง)</a>
              <div className="border-t border-slate-100 px-3 py-1.5">
                <label className="mb-1 block text-[11px] text-slate-500">📅 รายการจ่ายงานตามแผน — เลือกแผน</label>
                <select value={planSel} onChange={(e) => setPrintPlan(e.target.value)} disabled={plans.length === 0} className="mb-1.5 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm disabled:bg-slate-50">
                  {plans.length === 0 ? <option value="">— ยังไม่มีแผน —</option> : plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.line_count ? ` (${p.line_count})` : ""}</option>)}
                </select>
                {planSel
                  ? <a href={planHref} target="_blank" rel="noreferrer" onClick={closeMore} className="block rounded-lg bg-indigo-600 px-3 py-1.5 text-center text-sm text-white hover:bg-indigo-700">พิมพ์แผนที่เลือก</a>
                  : <div className="rounded-lg bg-slate-100 px-3 py-1.5 text-center text-sm text-slate-400">ยังไม่มีแผนให้พิมพ์</div>}
              </div>
            </div>
          )}
          <div className="my-1 border-t border-slate-100" />
          <div className={menuHead}>ตั้งค่า</div>
          <button type="button" onClick={() => { closeMore(); setInstallOpen(true); }} className={menuItem}><Icon name="mobile" /> ติดตั้งแอป <span className="ml-auto text-[11px] text-slate-400">เครื่องนี้ / QR</span></button>
          <button type="button" onClick={() => { closeMore(); void openColor(); }} className={menuItem}>🎨 ตั้งสีแบรนด์</button>
          {canDispatch && (
            <button type="button" onClick={() => { closeMore(); setLineSettingsOpen(true); }} className={menuItem}>🔔 แจ้งเตือน <span className="ml-auto text-[11px] text-slate-400">กลุ่ม LINE</span></button>
          )}
        </div>
      </FloatingDropdown>
    </div>
  );
  usePageChrome({
    title: <BoardViewPicker view={viewMode} isAdmin={isAdmin} defView={defView} onPick={setViewMode}
      onSaveDefault={() => { void saveDefView(viewMode); toast.success("ตั้งเป็นมุมมองเริ่มต้นของคุณแล้ว"); }} />,
    actions: (<>
      <UpdatedAgo at={loadedAt} onReload={() => void load(true)} />
      <RequestInboxButton />
      {canEdit && (
        <button type="button" onClick={() => setMoCreateOpen(true)} title="เปิดใบสั่งผลิตใหม่ (สร้างเสร็จการ์ดจะโผล่ในช่องรอจ่ายทันที)"
          className="h-9 whitespace-nowrap rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700">＋<span className="hidden sm:inline"> สร้างใบ</span></button>
      )}
      {moreMenu}
    </>),
  });
  const ownBar = !chromeHost || isXl || isMax;   // เชลล์ไม่ได้วาดแถบให้ (จอคอม / embed / ขยายเต็มจอ) → หน้าวาดเอง

  if (!canView) return <AccessDenied />;

  // ⚠️ ห้ามใส่ CSS zoom ที่ wrapper ล่างนี้ — บน iPad/Safari ทำให้ "จุดแตะ" เพี้ยน (ยิ่งไปทางขวายิ่งคลาด)
  //    → แตะช่องโต๊ะฝั่งขวาไม่ติด จ่ายงานไม่ได้ (เคยใช้ zoom:1.25 บน tablet แล้วพัง)
  return (
    <div className={isMax ? "fixed inset-0 z-40 bg-white flex flex-col p-3 overflow-auto" : "max-w-[1700px] mx-auto px-3 py-3 xl:px-5 xl:py-5"}>
      {/* แถบบนแบบแอป — จอคอม/embed/ขยายเต็มจอ วาดในหน้า · จอเล็กอยู่ในแถบบนของเชลล์ (ของกลาง page-chrome) */}
      {ownBar && <PageChromeBar variant="page" className="mb-3" />}
      {viewMode === "board" && <p className="mb-2 text-sm text-slate-500">ติ๊ก <b>เตรียม/ตัด</b> บนการ์ด → ครบทั้งคู่ <b className="text-emerald-600">ไฟเขียว</b> = พร้อมจ่าย → ลากไปวางที่แผนกช่างเพื่อจ่ายงาน</p>}

      {/* Toolbar — เฉพาะมุมมองบอร์ด */}
      {/* กลุ่ม D: แท็บแผนจ่ายงาน (ของจริง / แผนร่าง) */}
      {viewMode === "board" && (
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <button onClick={() => setActivePlan("real")} className={`h-8 px-3 text-sm rounded-lg border ${activePlan === "real" ? "bg-blue-600 text-white border-blue-600 font-medium" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>✅ ของจริง</button>
          {plans.map((p) => (
            <button key={p.id} onClick={() => setActivePlan(p.id)} className={`h-8 px-3 text-sm rounded-lg border ${activePlan === p.id ? "bg-indigo-600 text-white border-indigo-600 font-medium" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>📅 {p.name}{p.status === "applied" ? " ✓" : p.line_count ? ` (${p.line_count})` : ""}</button>
          ))}
          {canDispatch && <button onClick={() => void createPlan()} className="h-8 px-2.5 text-sm rounded-lg border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50">＋ สร้างแผน</button>}
        </div>
      )}

      {viewMode === "board" && activePlan === "real" && (
      <div className="z-20 flex items-center gap-1 bg-white rounded-lg border border-slate-200 shadow-sm p-1 w-fit mb-2">
        <ToolBtn onClick={() => void load()} title="โหลดใหม่">⟳</ToolBtn>
        <ToolBtn onClick={() => setIsMax((m) => !m)} title={isMax ? "ย่อกลับ" : "ขยายเต็มจอ"}>{isMax ? "🗗" : "⛶"}</ToolBtn>
      </div>
      )}

      {loading ? <div className="text-center py-20 text-slate-400">กำลังโหลด…</div>
        : loadError ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-slate-700 font-medium">โหลดบอร์ดไม่สำเร็จ</p>
          <p className="text-slate-400 text-sm mt-1">เชื่อมต่อไม่ได้หรือเครือข่ายมีปัญหา — ไม่ใช่ว่าไม่มีงาน</p>
          <button onClick={() => void load()} className="mt-4 h-9 px-4 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-700">↻ ลองใหม่</button>
        </div>
      ) : viewMode === "calendar" ? (
        <BoardCalendar
          pending={board.pending}
          extraMos={board.dispatchedMos}
          plans={board.deliveryPlans}
          workOrders={board.workOrders}
          departments={board.departments}
          canEdit={canEdit}
          moGroups={moGroups}
          groupOf={pendGroupOf}
          onOpenMO={(moId) => { const mo = [...board.pending, ...board.dispatchedMos].find((x) => x.id === moId); if (mo) { setClWO(null); setChecklistMO(mo); } }}
          onOpenWO={(woId) => { const wo = board.workOrders.find((x) => x.id === woId); if (wo) { setRecvQty(Math.max(0, (wo.qty || 0) - (wo.received_qty || 0))); openWO(wo); } }}
          onReload={() => load(true)}
        />
      ) : viewMode === "labor" ? (
        <LaborSummary />
      ) : viewMode === "canvas" ? (
        (() => {
          // แคนวาส — กระดาน Excalidraw: 1 กรอบ = 1 โต๊ะ · การ์ดแผน (ลากย้ายโต๊ะได้) + ของจริง (สีเทา ล็อก)
          // ค่าแรง/ชิ้น + รูป ส่งเข้าไปให้การ์ดคิดค่าแรงและหัวกรอบรวมยอด (สูตรเดียวกับหน้าแผน)
          const laborPerUnit: Record<string, number> = {};
          const imageByMo: Record<string, string | null> = {};
          for (const m of board.pending) { laborPerUnit[m.mo_no] = (m.central_rate && m.central_rate > 0) ? m.central_rate : (m.qty > 0 && m.labor ? m.labor.prod_plan / m.qty : 0); if (m.image_url) imageByMo[m.mo_no] = m.image_url; }
          for (const w of board.workOrders) { const k = String(w.mo_no); if (!laborPerUnit[k]) laborPerUnit[k] = (w.central_rate && w.central_rate > 0) ? w.central_rate : ((w.qty || 0) > 0 && w.labor ? w.labor.prod_plan / (w.qty || 1) : 0); if (imageByMo[k] == null && w.image_url) imageByMo[k] = w.image_url; }
          return <CanvasView
            departments={boardDesks}
            realWOs={board.workOrders} plans={plans} canEdit={canDispatch}
            imageByMo={imageByMo} laborPerUnit={laborPerUnit}
            onOpenWO={(id) => { const wo = board.workOrders.find((x) => x.id === id); if (wo) { setRecvQty(Math.max(0, (wo.qty || 0) - (wo.received_qty || 0))); openWO(wo); } }}
            onOpenWork={(info) => {
              // ดับเบิลคลิกการ์ดแผน → เปิดป๊อปรายละเอียดงาน · หาใบจาก "รอจ่าย" ก่อน ไม่เจอค่อยหาจากใบที่จ่ายครบแล้ว
              const all = [...board.pending, ...board.dispatchedMos];
              const mo = info.moId ? all.find((x) => x.id === info.moId) : (info.moNo ? all.find((x) => x.mo_no === info.moNo) : null);
              setClWO(null);
              if (mo) { setChecklistMO(mo); return; }
              setChecklistMO({
                id: info.moId ?? "", mo_no: info.moNo ?? "", product_sku: info.productSku, product_name: info.productName,
                qty: info.qty || 0, dispatched: 0, remaining: 0, due_date: null, status: "",
                image_url: null, brand: null, brand_color: null,
                prep_done: false, cut_done: false, has_bom: false, prep_total: 0, prep_ready: 0, cut_total: 0, cut_ready: 0, ready: false,
              });
            }}
          />;
        })()
      ) : viewMode === "exec" ? (
        <ExecPlan onOpenMO={(row: ExecRow) => {
          setClWO(null);
          // ใบที่ยังมีของค้างจ่าย ใช้ข้อมูลจากบอร์ด (ครบกว่า — มีค่าแรง/ราคากลาง)
          // ใบที่จ่ายงานครบแล้วจะไม่อยู่ในรายการรอจ่าย → ประกอบการ์ดจากแถวในหน้าแผน เพื่อให้กดเปิดป๊อปได้เหมือนกัน
          const real = board.pending.find((x) => x.id === row.id);
          setChecklistMO(real ?? {
            id: row.id, mo_no: row.mo_no, product_sku: row.product_sku, product_name: row.product_name,
            qty: row.qty, dispatched: row.dispatched, remaining: row.remaining,
            due_date: row.due_date, status: row.status ?? "",
            image_url: row.image_url, brand: row.brand, brand_color: row.brand_color, color: row.color,
            prep_done: row.prep_done, cut_done: row.cut_done, bom_code: row.bom_code, has_sizes: row.has_sizes,
            has_bom: row.has_bom, prep_total: row.prep_total, prep_ready: row.prep_ready,
            cut_total: row.cut_total, cut_ready: row.cut_ready, ready: row.ready,
            priority: row.priority, priority_note: row.priority_note,
          });
        }} />
      ) : viewMode === "purchase" ? (
        <PurchaseNeeds canEdit={canEdit} onOpenMo={(moId) => { const mo = board.pending.find((x) => x.id === moId); if (mo) { setClWO(null); setChecklistMO(mo); } }} />
      ) : viewMode === "table" ? (
        <BoardTable pending={board.pending} workOrders={board.workOrders}
          departments={board.departments} craftsmen={craftsmen} canEdit={canDispatch} canSeeMoney={isAdmin} deliveryPlans={board.deliveryPlans}
          canMoveStaff={canMoveStaff} onStaffChanged={reloadAssignees}
          catchUp={catchUpMode && canCatchUp} onExitCatchUp={() => setCatchUpMode(false)}
          cuMode={cuDirect ? "direct" : "request"} cuApprove={cuApprove} cuQueueAsk={cuQueueAsk} onCuQueueSeen={() => setCuQueueAsk(false)}
          onReload={() => void load(true)} onOpenMO={(mo) => { setClWO(null); setChecklistMO(mo); }} onOpenWO={(wo) => { setRecvQty(Math.max(0, (wo.qty || 0) - (wo.received_qty || 0))); openWO(wo); }} />
      ) : viewMode === "shop" ? (
        <div className="space-y-3">
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-sm">
            <button onClick={() => setShopMode("dispatch")} className={`h-9 px-3 font-medium ${shopMode === "dispatch" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>🛒 รอจ่าย (จ่ายงาน)</button>
            <button onClick={() => setShopMode("desk")} className={`h-9 px-3 font-medium border-l border-slate-200 ${shopMode === "desk" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>🪑 งานในโต๊ะ (ส่งงาน)</button>
          </div>
          {shopMode === "dispatch" ? (
            <DispatchShop
              pending={board.pending}
              departments={boardDesks}
              craftsmen={craftsmen}
              canDispatch={canDispatch}
              moGroups={moGroups}
              groupOf={pendGroupOf}
              laborByMo={Object.fromEntries(board.pending.map((m) => [m.mo_no, pendLaborPP(m)]))}
              onOpenMO={(mo) => { const real = board.pending.find((x) => x.id === mo.id); if (real) { setClWO(null); setChecklistMO(real); } }}
              onReload={() => void load(true)}
            />
          ) : (
            <DeskShop
              workOrders={board.workOrders}
              departments={boardDesks}
              onOpenWO={(w) => { const real = board.workOrders.find((x) => x.id === w.id); if (real) { setRecvQty(Math.max(0, (real.qty || 0) - (real.received_qty || 0))); openWO(real); } }}
            />
          )}
        </div>
      ) : activePlan !== "real" ? (
        (() => {
          const p = plans.find((x) => x.id === activePlan);
          if (!p) return <div className="text-center py-20 text-slate-400 text-sm">ไม่พบแผน</div>;
          // ค่าแรงผลิตต่อชิ้น (จากแผนกลุ่ม A) + รูป ต่อใบสั่งผลิต — ส่งให้หน้าแผนคิดค่าแรง/โชว์รูป
          const laborPerUnit: Record<string, number> = {};
          const imageByMo: Record<string, string | null> = {};
          // ค่าแรง/ชิ้น = ราคากลางจาก BOM ก่อน (ที่เจ้าของตั้งไว้) · ไม่มีค่อย fallback เป็นค่าแรงวางแผน/จำนวน
          for (const m of board.pending) { laborPerUnit[m.mo_no] = (m.central_rate && m.central_rate > 0) ? m.central_rate : (m.qty > 0 && m.labor ? m.labor.prod_plan / m.qty : 0); if (m.image_url) imageByMo[m.mo_no] = m.image_url; }
          for (const w of board.workOrders) { const k = String(w.mo_no); if (!laborPerUnit[k]) laborPerUnit[k] = (w.central_rate && w.central_rate > 0) ? w.central_rate : ((w.qty || 0) > 0 && w.labor ? w.labor.prod_plan / (w.qty || 1) : 0); if (imageByMo[k] == null && w.image_url) imageByMo[k] = w.image_url; }
          return <DispatchPlanBoard
            planId={p.id} planName={p.name} planStatus={p.status} startDate={p.start_date} endDate={p.end_date}
            departments={boardDesks}
            pending={board.pending} pendingPiece={board.pendingPiece} onPieceClick={(p) => { setDispPiece({ ...p, image_url: p.image_url ?? null, brand: null, brand_color: null }); setPieceCraftsman(""); }} realWOs={board.workOrders} craftsmen={craftsmen} defectByWorker={defectByWorker} deptWages={deptWages}
            laborPerUnit={laborPerUnit} imageByMo={imageByMo}
            canEdit={canDispatch} tablet={tablet} onManageDepts={openDeptMgr} onStaffMoved={() => void reloadAssignees()} canMoveStaff={canMoveStaff}
            onApplied={() => { void load(true); void loadPlans(); setActivePlan("real"); }}
            onSetCentralRate={setCentralRate}
            onRenamed={(name) => setPlans((ps) => ps.map((x) => x.id === p.id ? { ...x, name } : x))}
            onDates={(start_date, end_date) => setPlans((ps) => ps.map((x) => x.id === p.id ? { ...x, start_date, end_date } : x))}
            onDeleted={() => { setActivePlan("real"); void loadPlans(); }}
            onOpenWork={(info) => {
              const mo = info.moId ? board.pending.find((x) => x.id === info.moId) : null;
              setClWO(null);
              if (mo) { setChecklistMO(mo); return; }
              setChecklistMO({
                id: info.moId ?? "", mo_no: info.moNo ?? "", product_sku: info.productSku, product_name: info.productName,
                qty: info.qty || 0, dispatched: 0, remaining: 0, due_date: null, status: "",
                image_url: null, brand: null, brand_color: null,
                prep_done: false, cut_done: false, has_bom: false, prep_total: 0, prep_ready: 0, cut_total: 0, cut_ready: 0, ready: false,
              });
            }}
            onReorderDepts={(orderedIds) => {
              void (async () => {
                try {
                  await Promise.all(orderedIds.map((id, i) => apiFetch("/api/mo/departments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, display_order: i }) })));
                  await load(true);
                } catch { /* ignore */ }
              })();
            }}
          />;
        })()
      ) : (
        (() => {
          // มุมมอง "ของจริง" — ใช้คอลัมน์เหมือนหน้าแผน (ของกลาง) แต่จ่ายจริงทันที (ไม่ใช่ร่าง)
          const laborPerUnit: Record<string, number> = {};
          const imageByMo: Record<string, string | null> = {};
          for (const m of board.pending) { laborPerUnit[m.mo_no] = (m.central_rate && m.central_rate > 0) ? m.central_rate : (m.qty > 0 && m.labor ? m.labor.prod_plan / m.qty : 0); if (m.image_url) imageByMo[m.mo_no] = m.image_url; }
          for (const w of board.workOrders) { const k = String(w.mo_no); if (!laborPerUnit[k]) laborPerUnit[k] = (w.central_rate && w.central_rate > 0) ? w.central_rate : ((w.qty || 0) > 0 && w.labor ? w.labor.prod_plan / (w.qty || 1) : 0); if (imageByMo[k] == null && w.image_url) imageByMo[k] = w.image_url; }
          return <DispatchPlanBoard
            realMode planId="real" planName="" planStatus="" startDate={null} endDate={null}
            departments={boardDesks}
            pending={board.pending} pendingPiece={board.pendingPiece} onPieceClick={(p) => { setDispPiece({ ...p, image_url: p.image_url ?? null, brand: null, brand_color: null }); setPieceCraftsman(""); }} realWOs={board.workOrders} craftsmen={craftsmen} defectByWorker={defectByWorker} deptWages={deptWages}
            laborPerUnit={laborPerUnit} imageByMo={imageByMo}
            canEdit={canDispatch} tablet={tablet} onManageDepts={openDeptMgr} onStaffMoved={() => void reloadAssignees()} canMoveStaff={canMoveStaff}
            onApplied={() => {}} onRenamed={() => {}} onDates={() => {}} onDeleted={() => {}}
            onDispatch={({ moId, deptId, qty }) => {
              const mo = board.pending.find((x) => x.id === moId);
              const dept = board.departments.find((x) => x.id === deptId);
              // A: แตะการ์ด→แตะโต๊ะ = จ่ายจริงทันที (ไม่เปิดหน้าต่าง) — ทั้งโต๊ะ + จำนวนที่เลือก + ค่าแรงราคากลาง
              if (mo && dept) void quickDispatch(mo, dept, qty, laborPerUnit[mo.mo_no] ?? 0);
            }}
            onCancelWO={async (id) => { const wo = board.workOrders.find((x) => x.id === id); if (wo) await cancelWO(wo); }}
            onSetCentralRate={setCentralRate}
            onPickDispatch={(moNo, qty) => { const mo = board.pending.find((x) => x.mo_no === moNo); if (mo) { openDispatch(mo, null); if (qty > 0) setDispQty(qty); } }}
            onUpdateWO={async (id, patch, quiet) => {
              try {
                const res = await apiFetch("/api/mo/work-orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) });
                const j = await res.json(); if (j.error) throw new Error(j.error);
                if (!quiet) toast.success("บันทึกแล้ว");   // quiet = ลากย้ายโต๊ะ (บอร์ดเด้ง toast เองพร้อมชื่อโต๊ะ)
                await load(true);
              } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); throw e; }
            }}
            onOpenWork={(info) => {
              const mo = info.moId ? board.pending.find((x) => x.id === info.moId) : null;
              setClWO(null);
              if (mo) { setChecklistMO(mo); return; }
              setChecklistMO({
                id: info.moId ?? "", mo_no: info.moNo ?? "", product_sku: info.productSku, product_name: info.productName,
                qty: info.qty || 0, dispatched: 0, remaining: 0, due_date: null, status: "",
                image_url: null, brand: null, brand_color: null,
                prep_done: false, cut_done: false, has_bom: false, prep_total: 0, prep_ready: 0, cut_total: 0, cut_ready: 0, ready: false,
              });
            }}
            onReorderDepts={(orderedIds) => { void (async () => { try { await Promise.all(orderedIds.map((id, i) => apiFetch("/api/mo/departments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, display_order: i }) }))); await load(true); } catch { /* ignore */ } })(); }}
          />;
        })()
      )}

      {/* Phase 3: เตือนเมื่อจ่ายทั้งที่ยังเตรียม/ตัดไม่ครบ (เตือนแต่จ่ายได้) */}
      <ERPModal open={warnDispatch !== null} onClose={() => setWarnDispatch(null)} size="sm" title="⚠️ ยังไม่พร้อมจ่าย"
        footer={<>
          <button onClick={() => setWarnDispatch(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">กลับไปเตรียม/ตัด</button>
          <button onClick={() => { if (warnDispatch) openDispatch(warnDispatch.mo, warnDispatch.dept); setWarnDispatch(null); }} className="h-9 px-4 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600">จ่ายงานต่อ</button>
        </>}>
        {warnDispatch && (
          <div className="space-y-2 text-sm">
            <p className="text-slate-700">งานนี้<b className="text-amber-600"> ยังเตรียม/ตัดไม่ครบ</b></p>
            <p className="font-medium text-slate-800">{warnDispatch.mo.product_name ?? warnDispatch.mo.product_sku}</p>
            <div className="flex gap-4 text-[12px]">
              {warnDispatch.mo.has_bom ? <>
                <span className={warnDispatch.mo.prep_ready >= warnDispatch.mo.prep_total ? "text-emerald-600" : "text-amber-600"}>เตรียม {warnDispatch.mo.prep_ready}/{warnDispatch.mo.prep_total}</span>
                <span className={warnDispatch.mo.cut_ready >= warnDispatch.mo.cut_total ? "text-emerald-600" : "text-amber-600"}>ตัด {warnDispatch.mo.cut_ready}/{warnDispatch.mo.cut_total}</span>
              </> : <>
                <span className={warnDispatch.mo.prep_done ? "text-emerald-600" : "text-amber-600"}>เตรียม {warnDispatch.mo.prep_done ? "ครบ ✓" : "ยังไม่ครบ"}</span>
                <span className={warnDispatch.mo.cut_done ? "text-emerald-600" : "text-amber-600"}>ตัด {warnDispatch.mo.cut_done ? "ครบ ✓" : "ยังไม่ครบ"}</span>
              </>}
            </div>
            <p className="text-[11px] text-slate-400 pt-1">ถ้าแน่ใจ กด “จ่ายงานต่อ” เพื่อจ่ายให้ <b>{warnDispatch.dept.name}</b> เลย</p>
          </div>
        )}
      </ERPModal>

      {/* widget "รอจ่าย" — ลอยบนบอร์ด · ลากย้ายตำแหน่งได้ · ลากรายการไปวางที่โต๊ะ = จ่ายงาน */}
      {pendPopupOpen && (
        <div className="fixed z-[55] bg-white rounded-xl border border-slate-200 shadow-2xl flex flex-col" style={{ left: pendPos.x, top: pendPos.y, width: pendSize.w, height: pendSize.h }}>
          <div onPointerDown={startPendMove} className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 cursor-move select-none rounded-t-xl bg-slate-50">
            <span className="text-sm font-bold text-slate-700">📥 รอจ่าย ({board.pending.length})</span>
            <button onClick={() => setPendPopupOpen(false)} title="ปิด" className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
          </div>
          <div className="p-2 border-b border-slate-100 space-y-1.5">
            <input value={pendSearch} onChange={(e) => setPendSearch(e.target.value)} placeholder="ค้นหา สินค้า / เลขใบสั่งผลิต"
              className="w-full h-8 px-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <select value={pendGroupFilter} onChange={(e) => setPendGroupFilter(e.target.value)} title="กรองตามกลุ่มใบสั่งผลิต"
              className="w-full h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="__all__">🗂 ทุกกลุ่ม</option>
              {moGroups.map((g) => <option key={g.name} value={g.name}>{g.name}</option>)}
              <option value="__none__">— ยังไม่จับกลุ่ม —</option>
            </select>
          </div>
          <div className="overflow-y-auto p-1.5 space-y-1 flex-1 min-h-0">
            {board.pending
              .filter((m) => pendGroupFilter === "__all__" ? true : pendGroupFilter === "__none__" ? pendGroupOf(m.mo_no) === null : pendGroupOf(m.mo_no) === pendGroupFilter)
              .filter((m) => `${m.product_sku ?? ""} ${m.product_name ?? ""} ${m.mo_no}`.toLowerCase().includes(pendSearch.trim().toLowerCase())).map((m) => (
              <div key={m.id} draggable onDragStart={(e) => { pendDragRef.current = m; e.dataTransfer.setData("text/plain", m.mo_no); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { pendDragRef.current = null; setDropDeptId(null); }}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-grab active:cursor-grabbing">
                <HoverImage url={m.image_url} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-800 truncate">{m.product_sku}</div>
                  <div className="text-[10px] text-slate-400 truncate">{m.mo_no}</div>
                  {(() => { const pp = pendLaborPP(m); return pp > 0 ? <div className="text-[10px] text-amber-600 truncate">💰 ฿{fmt(pp)}/ชิ้น · รวม ฿{fmt(pp * m.remaining)}</div> : null; })()}
                </div>
                <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">เหลือ <b className="text-sm">{fmt(m.remaining)}</b></span>
                {m.ready
                  ? <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 whitespace-nowrap">พร้อม ✓</span>
                  : <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap">ยังไม่พร้อม</span>}
                <button onClick={() => { setClWO(null); setChecklistMO(m); }} title="ดูรายละเอียด/เช็กลิสต์" className="shrink-0 text-slate-300 hover:text-blue-600">📋</button>
                {canDispatch && <button onClick={() => openDispatch(m, null)} title="เลือกโต๊ะแล้วจ่าย" className="shrink-0 h-7 px-2.5 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">จ่ายงาน</button>}
              </div>
            ))}
            {board.pending.length === 0 && <div className="text-center text-sm text-slate-300 py-8">ไม่มีงานรอจ่าย 🎉</div>}
          </div>
          <div className="px-3 py-1.5 border-t border-slate-100 text-[10px] text-slate-400 rounded-b-xl">💡 ลากรายการไปวางที่โต๊ะ = จ่ายงาน · หรือกดปุ่ม “จ่ายงาน”</div>
          {/* ที่จับปรับขนาด (มุมขวาล่าง) */}
          <div onPointerDown={startPendResize} title="ลากเพื่อปรับขนาดแผง" className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
            style={{ background: "linear-gradient(135deg, transparent 50%, #94a3b8 50%)", borderBottomRightRadius: 12 }} />
        </div>
      )}

      {/* popup จ่ายงานเหมารายชิ้น → เลือกช่างเหมา */}
      <ERPModal open={dispPiece !== null} onClose={() => { if (pieceSaving) return; setDispPiece(null); void load(true); }} size="sm" title="🧵 จ่ายงานเหมาให้ช่าง"
        footer={<>
          <button onClick={() => setDispPiece(null)} disabled={pieceSaving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={() => void assignPiece()} disabled={pieceSaving || !pieceCraftsman} title={!pieceCraftsman ? "เลือกช่างก่อน" : ""} className="h-9 px-4 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">{pieceSaving ? "กำลังจ่าย…" : "จ่ายงานเหมา"}</button>
        </>}>
        {dispPiece && (
          <div className="space-y-3">
            <div className="rounded-lg bg-violet-50/60 border border-violet-100 px-3 py-2">
              <div className="text-sm font-semibold text-slate-700">🧵 {dispPiece.job_name}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{dispPiece.product_sku} · {dispPiece.mo_no} · <b>{fmt(dispPiece.qty)}</b> ชิ้น × ฿{fmt(dispPiece.rate)} = <b className="text-violet-700">฿{fmt(dispPiece.qty * dispPiece.rate)}</b></div>
            </div>
            <label className="block"><span className="text-[11px] text-slate-500">เลือกช่างเหมา (จำเป็น *)</span>
              <div className="mt-0.5">
                <SearchableSelect value={pieceCraftsman} onChange={setPieceCraftsman} placeholder="— เลือกช่าง —"
                  options={craftsmen.map((c) => ({ value: c.id, label: `${c.code ? `[${c.code}] ` : ""}${c.name}`, searchText: `${c.code ?? ""} ${c.name}` }))} />
              </div>
              <span className="text-[10px] text-slate-400">จ่ายแล้วงานจะออกจาก “รอจ่าย” · ส่งงานเสร็จ → ค่าแรงนับเป็นงานเหมา-จริง</span>
            </label>
          </div>
        )}
      </ERPModal>

      {/* popup จ่ายงาน */}
      <ERPModal open={dispMO !== null} onClose={() => { if (dispSaving) return; setDispMO(null); void load(true); }} size="md" title={`🧰 จ่ายงาน → ${dispDept?.name ?? ""}`}
        footer={<>
          <button onClick={() => setDispMO(null)} disabled={dispSaving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={submitDispatch} disabled={dispSaving || !dispDept || (dispIsHire && dispCrew.length === 0)} title={!dispDept ? "เลือกโต๊ะก่อน" : (dispIsHire && dispCrew.length === 0) ? "งานเหมา ต้องเลือกช่างก่อน" : !(Number(dispLaborRate) > 0) ? "จ่ายได้เลย — ค่าแรงค่อยมาใส่ทีหลัง" : ""} className="h-9 px-4 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{dispSaving ? "กำลังจ่าย..." : "ยืนยันจ่ายงาน"}</button>
        </>}>
        {dispMO && (
          <div className="space-y-3">
            <p className="text-[11px] text-slate-400">ใบสั่งผลิต <b>{dispMO.mo_no}</b> · {dispMO.product_name ?? dispMO.product_sku} · เหลือจ่าย {fmt(dispMO.remaining)} ชิ้น</p>
            <label className="block"><span className="text-[11px] text-slate-500">โต๊ะ/แผนกที่จ่าย</span>
              <select value={dispDept?.id ?? ""} onChange={(e) => { setDispDept(board.departments.find((d) => d.id === e.target.value) ?? null); setDispCrew([]); }}
                className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                <option value="">— เลือกโต๊ะ —</option>
                {board.departments.filter((d) => stageOfDept(d.name) !== "cut" && d.show_on_board !== false).map((d) => {
                  const n = craftsmen.filter((c) => c.department_id === d.id).length;
                  return <option key={d.id} value={d.id}>{d.name}{n ? ` · ${n} คน` : " · ยังไม่มีคน"}</option>;
                })}
              </select>
            </label>
            {/* 👥 จัดคนในโต๊ะได้ในป๊อปนี้เลย (ย้าย = เฉพาะสิทธิ์ฝ่ายบุคคล) */}
            {dispDept && (
              <div className="-mt-1.5 flex items-center gap-2 text-[12px]">
                <span className="text-slate-500">👥 {craftsmen.filter((c) => c.department_id === dispDept.id).length} คนในโต๊ะ</span>
                <button type="button" onClick={() => setDeskPanel((o) => !o)} className="text-violet-700 hover:underline">{deskPanel ? "ปิดจัดคน ▴" : "จัดคนในโต๊ะ ▾"}</button>
              </div>
            )}
            {dispDept && deskPanel && (
              <DeskStaffPanel dept={dispDept} desks={board.departments} people={craftsmen} canMove={canMoveStaff} canAddNew={canDispatch} onChanged={reloadAssignees}
                wos={board.workOrders} onDesksChanged={deskChanged} />
            )}
            <div className="grid grid-cols-3 gap-2">
              <label className="block"><span className="text-[11px] text-slate-500">จำนวนที่จ่าย</span>
                <input type="number" min={0} step="any" max={dispMO.remaining} value={dispQty} onChange={(e) => setDispQty(Number(e.target.value))}
                  className="w-full h-9 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label>
              <div><span className="text-[11px] text-slate-500">วันที่จ่าย</span>
                <div className="mt-0.5"><DispatchDatePick value={dispDate} onChange={setDispDate} /></div></div>
              <label className="block"><span className="text-[11px] text-slate-500">กำหนดเสร็จ</span>
                <input type="date" value={dispDue} onChange={(e) => setDispDue(e.target.value)} className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" /></label>
            </div>
            {dispDept && (
              <div>
                <span className="text-[11px] text-slate-500">{dispIsHire ? "👥 คนรับงาน (งานเหมา — ต้องเลือก *)" : `👥 คนรับงานใน ${dispDept.name} — กดได้หลายคน`}</span>
                <div className="mt-1">
                  <CrewPick people={deptCraftsmen} value={dispCrew} onChange={setDispCrew} required={dispIsHire}
                    recent={lastCrewIds(board.workOrders, dispDept.id, deptCraftsmen)}
                    flag={(p) => { const d = defectScoped(p.name, parentKeyOf(dispMO.product_sku)); return d ? `เคยทำรุ่นนี้เสีย ${d.count} ครั้ง` : null; }} />
                </div>
              </div>
            )}
            {/* ค่าแรงผลิต/ชิ้น — default ราคากลางจาก BOM (เลือกช่างที่มีเรต → ใช้เรตช่างนั้น) */}
            <label className="block">
              <span className="text-[11px] text-slate-500">💰 ค่าแรงผลิต / ชิ้น (บาท) <span className="text-slate-400">— เว้นว่างได้ ใส่ทีหลังก็ได้</span></span>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <input type="number" min={0} step="any" value={dispLaborRate} onChange={(e) => setDispLaborRate(e.target.value)} placeholder="—"
                  className="w-28 h-9 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                <span className="text-[11px] text-slate-500">× {fmt(dispQty)} = <b className="text-slate-700">฿{fmt((Number(dispLaborRate) || 0) * dispQty)}</b></span>
                {dispRates.some((r) => !r.craftsman_id) && <span className="text-[10px] text-slate-400">ราคากลาง ฿{fmt(dispRates.find((r) => !r.craftsman_id)!.rate)}/ชิ้น</span>}
              </div>
            </label>
            {/* กลุ่ม B: เตือนถ้าผู้รับงานเคยทำ "รุ่นเดียวกัน (Parent SKU)" เสีย — กดดูได้ว่างานอะไร */}
            {(() => {
              // เลือกหลายคน → เตือนทีละคนที่เคยทำรุ่นนี้เสีย · ไม่เลือกใคร → ดูของทั้งโต๊ะ
              const picked = deptCraftsmen.filter((c) => dispCrew.includes(c.id)).map((c) => c.name);
              const hits = (picked.length ? picked : [dispDept?.name ?? ""]).flatMap((n) => {
                const d = defectScoped(n, parentKeyOf(dispMO.product_sku)); return d ? [{ targetName: n, d }] : [];
              });
              if (!hits.length) return null;
              return hits.map(({ targetName, d }) => (
                <div key={targetName} className={`rounded-lg border px-3 py-2 text-xs ${dispIsHire ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                  <button type="button" onClick={() => setDefectListOpen((o) => !o)} className="w-full text-left">
                    ⚠️ <b>{targetName}</b> เคยทำ<b>รุ่นนี้</b>เสีย <b>{d.count}</b> ครั้ง
                    {d.types.length > 0 && <span className="opacity-70"> ({d.types.slice(0, 3).join(", ")}{d.types.length > 3 ? "…" : ""})</span>}
                    {d.last_at && <span className="opacity-60"> · ล่าสุด {new Date(d.last_at).toLocaleDateString("th-TH")}</span>}
                    <span className="ml-1 underline shrink-0">{defectListOpen ? "ซ่อน" : "ดูว่างานอะไร"}</span>
                  </button>
                  {defectListOpen && (
                    <div className="mt-1.5 border-t border-current/20 pt-1.5 space-y-0.5 max-h-40 overflow-y-auto">
                      {d.items.map((it, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <code className="text-[10px] opacity-80 shrink-0">{it.sku ?? "—"}</code>
                          <span className="flex-1 truncate">{it.defect_type}{it.qty ? ` · ${fmt(it.qty)} ชิ้น` : ""}</span>
                          {it.mo_no && <span className="opacity-60 text-[10px] shrink-0">{it.mo_no}</span>}
                          {it.created_at && <span className="opacity-50 text-[10px] shrink-0">{new Date(it.created_at).toLocaleDateString("th-TH")}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {dispIsHire && <div className="mt-0.5 text-[11px] font-medium">เป็นช่างเหมา — โปรดพิจารณาก่อนจ่ายงาน</div>}
                </div>
              ));
            })()}
          </div>
        )}
      </ERPModal>

      {/* popup ตั้งสีแบรนด์ */}
      <ERPModal open={colorOpen} onClose={() => { setColorOpen(false); void load(true); }} size="sm" title="🎨 ตั้งสีประจำแบรนด์"
        footer={<button onClick={() => setColorOpen(false)} className="h-9 px-4 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700">เสร็จ</button>}>
        <div className="space-y-2">
          <p className="text-[11px] text-slate-400">สีจะใช้เป็นกรอบการ์ดบนบอร์ด — กดที่ช่องสีเพื่อเปลี่ยน</p>
          {brands.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 py-1 border-b border-slate-50 last:border-0">
              <span className="text-sm text-slate-700">{b.name}</span>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded border border-slate-200" style={{ background: b.color ?? "transparent" }} />
                <input type="color" value={b.color ?? "#94a3b8"} onChange={(e) => saveColor(b.id, e.target.value)} className="h-7 w-10 cursor-pointer rounded" />
              </div>
            </div>
          ))}
          {brands.length === 0 && <div className="text-center text-xs text-slate-300 py-6">ไม่มีแบรนด์</div>}
        </div>
      </ERPModal>

      {/* รายละเอียดใบจ่ายงาน + รับงานคืน (คลิกการ์ด) */}
      <ERPModal open={detailWO !== null} onClose={() => { if (recvSaving) return; setDetailWO(null); void load(true); }} size="sm" title={`📄 ${detailWO?.wo_no ?? ""}`}
        footer={detailWO && (detailWO.status === "done" ? <button onClick={() => setDetailWO(null)} className="h-9 px-4 text-sm bg-slate-800 text-white rounded-lg">ปิด</button> : <>
          <button onClick={() => detailWO && cancelWO(detailWO)} disabled={recvSaving} className="h-9 px-4 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 disabled:opacity-50 mr-auto">ยกเลิกใบ</button>
          <button onClick={() => setDetailWO(null)} disabled={recvSaving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ปิด</button>
          <button onClick={submitReceive} disabled={recvSaving || recvQty <= 0 || recvLabor.trim() === ""} title={recvLabor.trim() === "" ? "ใส่ค่าแรงก่อน" : ""} className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">{recvSaving ? "กำลังบันทึก..." : "✓ ส่งงาน"}</button>
        </>)}>
        {detailWO && (
          <div className="space-y-2 text-sm">
            <p className="font-medium text-slate-800">{detailWO.product_name ?? detailWO.product_sku}</p>
            <div className="grid grid-cols-2 gap-y-1 text-xs text-slate-500">
              <span>ใบสั่งผลิต</span><span className="text-slate-700">{detailWO.mo_no}</span>
              <span>แผนก/ผู้รับ</span>
              <span className="text-slate-700">{detailWO.department_name ?? "—"} · {detailWO.assignee_name ?? "—"}
                {canDispatch && detailWO.status !== "cancelled" && crewEdit === null && (
                  <button type="button" onClick={() => setCrewEdit(crewIdsOf(detailWO))} className="ml-1.5 text-violet-700 hover:underline">✏️ แก้</button>
                )}
              </span>
              <span>วันที่จ่าย</span>
              <span className="text-slate-700">{detailWO.dispatch_date ? new Date(detailWO.dispatch_date).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : <span className="text-amber-600">🤷 ไม่ระบุ</span>}
                {canDispatch && detailWO.status !== "cancelled" && dateEdit === null && (
                  <button type="button" onClick={() => setDateEdit({ v: detailWO.dispatch_date })} className="ml-1.5 text-violet-700 hover:underline">✏️ แก้</button>
                )}
              </span>
              <span>จ่าย</span><span className="text-slate-700">{fmt(detailWO.qty)} ชิ้น</span>
              <span>ส่งแล้ว</span><span className="text-slate-700">{fmt(detailWO.received_qty)} · เหลือ {fmt(detailWO.qty - detailWO.received_qty)}</span>
              <span>กำหนดเสร็จ</span><span className="text-slate-700">{detailWO.due_date ?? "—"}</span>
              <span>สถานะ</span><span><span className={`text-[11px] px-2 py-0.5 rounded border ${(WO_STATUS[detailWO.status] ?? WO_STATUS.dispatched).cls}`}>{(WO_STATUS[detailWO.status] ?? WO_STATUS.dispatched).label}</span></span>
            </div>
            {crewEdit !== null && (() => {
              const pool = crewPoolOf(detailWO);
              const hire = /เหมา/.test(detailWO.department_name ?? "");
              return (
                <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2 space-y-2">
                  <div className="text-[11px] font-medium text-violet-800">👥 คนรับงานใบนี้ — กดได้หลายคน</div>
                  <CrewPick people={pool} value={crewEdit} onChange={setCrewEdit} required={hire} recent={lastCrewIds(board.workOrders, detailWO.department_id, pool)} />
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setCrewEdit(null)} disabled={woFixSaving} className="h-8 px-3 text-xs border border-slate-200 rounded-lg bg-white disabled:opacity-50">ยกเลิก</button>
                    <button type="button" onClick={saveCrew} disabled={woFixSaving || (hire && crewEdit.length === 0)} className="h-8 px-3 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">{woFixSaving ? "กำลังบันทึก…" : "บันทึกคนรับ"}</button>
                  </div>
                </div>
              );
            })()}
            {dateEdit !== null && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2 space-y-2">
                <div className="text-[11px] font-medium text-violet-800">📅 วันที่จ่ายใบนี้</div>
                <DispatchDatePick value={dateEdit.v} onChange={(v) => setDateEdit({ v })} />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setDateEdit(null)} disabled={woFixSaving} className="h-8 px-3 text-xs border border-slate-200 rounded-lg bg-white disabled:opacity-50">ยกเลิก</button>
                  <button type="button" onClick={() => void saveWoFix({ dispatch_date: dateEdit.v }, dateEdit.v ? "บันทึกวันที่จ่ายแล้ว" : "ตั้งเป็นไม่ระบุวันแล้ว")} disabled={woFixSaving}
                    className="h-8 px-3 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">{woFixSaving ? "กำลังบันทึก…" : "บันทึกวันที่"}</button>
                </div>
              </div>
            )}
            {detailWO.status !== "done" && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="block"><span className="text-[11px] text-slate-500">ส่งรอบนี้ (ชิ้น)</span>
                  <input type="number" min={0} step="any" max={detailWO.qty - detailWO.received_qty} value={recvQty} onChange={(e) => setRecvQty(Number(e.target.value))}
                    className="w-full h-9 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" /></label>
                <label className="block"><span className="text-[11px] text-slate-500">ค่าแรง/ชิ้น (บาท)</span>
                  <input type="number" min={0} step="any" value={recvLabor} onChange={(e) => setRecvLabor(e.target.value)} placeholder="—"
                    className="w-full h-9 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <RecvWageHint rate={recvLabor} fromSlip={woRateStr(detailWO)} total={recvWage()} /></label>
              </div>
            )}
          </div>
        )}
      </ERPModal>

      {/* รายละเอียดใบสั่งผลิต (คลิกการ์ดรอจ่าย) */}
      <ERPModal open={detailMO !== null} onClose={() => { setDetailMO(null); void load(true); }} size="sm" title={`🏭 ${detailMO?.mo_no ?? ""}`}
        footer={<>
          <button onClick={() => setDetailMO(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>
          <a href="/master/manufacturing-orders" className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center">เปิดหน้าใบสั่งผลิต</a>
        </>}>
        {detailMO && (
          <div className="space-y-2 text-sm">
            <p className="font-medium text-slate-800">{detailMO.product_name ?? detailMO.product_sku}</p>
            <div className="grid grid-cols-2 gap-y-1 text-xs text-slate-500">
              {detailMO.brand && <><span>แบรนด์</span><span className="text-slate-700">{detailMO.brand}</span></>}
              <span>ผลิตทั้งหมด</span><span className="text-slate-700">{fmt(detailMO.qty)} ชิ้น</span>
              <span>จ่ายแล้ว</span><span className="text-slate-700">{fmt(detailMO.dispatched)}</span>
              <span>เหลือจ่าย</span><span className="text-rose-600 font-semibold">{fmt(detailMO.remaining)}</span>
              <span>กำหนดเสร็จ</span><span className="text-slate-700">{detailMO.due_date ?? "—"}</span>
            </div>
            <p className="text-[11px] text-slate-400 pt-1">ลากการ์ดนี้ไปวางที่โซนแผนก เพื่อจ่ายงาน</p>
          </div>
        )}
      </ERPModal>

      <BoardLineSettings open={lineSettingsOpen} onClose={() => setLineSettingsOpen(false)} />
      <InstallAppModal open={installOpen} onClose={() => setInstallOpen(false)} />

      {/* สร้างใบสั่งผลิตจากบอร์ด — ของกลางตัวเดียวกับหน้า /master/manufacturing-orders */}
      <MoCreateModal open={moCreateOpen} onClose={() => setMoCreateOpen(false)} onCreated={() => void load(true)} />

      {/* เช็กลิสต์วัตถุดิบ เตรียม/ตัด (Phase 2 — จาก BOM) */}
      {/* ถามแบบพิมพ์ขั้นตอนงาน: ขั้นตอนจากสูตร หรือแม่แบบเปล่าให้เขียนเอง */}
      <ERPModal open={stepsPrintAsk} onClose={() => setStepsPrintAsk(false)} size="sm" title="🪜 พิมพ์ขั้นตอนงาน"
        footer={<button onClick={() => setStepsPrintAsk(false)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>}>
        <div className="grid grid-cols-1 gap-2">
          <button type="button" onClick={() => { if (checklistMO) window.open(`/print/work-steps/${checklistMO.id}`, "_blank"); setStepsPrintAsk(false); }}
            className="text-left rounded-lg border border-blue-200 bg-blue-50/40 hover:bg-blue-50 px-4 py-3">
            <div className="text-sm font-semibold text-slate-800">📋 พิมพ์ขั้นตอน ({clSteps?.length ?? 0} ขั้น)</div>
            <div className="text-[11px] text-slate-500 mt-0.5">ขั้นตอนจากสูตรของสินค้า + ช่องผู้ทำ/วันที่/✓ ให้ช่างติ๊ก</div>
          </button>
          <button type="button" onClick={() => { if (checklistMO) window.open(`/print/work-steps/${checklistMO.id}?blank=1`, "_blank"); setStepsPrintAsk(false); }}
            className="text-left rounded-lg border border-slate-200 hover:bg-slate-50 px-4 py-3">
            <div className="text-sm font-semibold text-slate-800">▦ ตารางติ๊ก (ชิ้นส่วน × ประเภทงาน)</div>
            <div className="text-[11px] text-slate-500 mt-0.5">แถว = ชิ้นส่วน (เติมจากบล็อกตัดให้) · คอลัมน์ = ทับ/เย็บตรง/เย็บโค้ง/ทากาว… เอาไปถามช่างแล้วติ๊ก</div>
          </button>
          <button type="button" onClick={() => { if (checklistMO) window.open(`/print/work-steps/${checklistMO.id}?mode=perpiece`, "_blank"); setStepsPrintAsk(false); }}
            className="text-left rounded-lg border border-slate-200 hover:bg-slate-50 px-4 py-3">
            <div className="text-sm font-semibold text-slate-800">▤ แยกตามชิ้น + ประกอบรวม</div>
            <div className="text-[11px] text-slate-500 mt-0.5">แต่ละชิ้นมีช่วงขั้นตอนของตัวเอง แล้วปิดท้ายด้วยช่วงประกอบรวม (ติ๊กว่าใช้ชิ้นไหน)</div>
          </button>
        </div>
      </ERPModal>
      {/* โหมดเช็กลิสต์อย่างเดียว: บังบอร์ดไว้ระหว่างรอเปิด/หลังปิด (หน้าแม่เป็นคนสลับจอ) */}
      {popupOnly && !checklistMO && (
        <div className="fixed inset-0 z-50 bg-white flex items-center justify-center px-6 text-center text-sm text-slate-400">
          {urlOpened ? "กำลังกลับ…"
            : loading ? "กำลังเปิดเช็กลิสต์…"
            : loadError ? "โหลดข้อมูลบอร์ดจ่ายงานไม่สำเร็จ กรุณาปิดแล้วเปิดใหม่"
            : "ไม่พบใบสั่งผลิตนี้ในบอร์ดจ่ายงาน (อาจปิดงาน ยกเลิก หรือถูกลบไปแล้ว)"}
        </div>
      )}
      <ERPModal open={checklistMO !== null} onClose={closeChecklist} size="xl" storageKey="wb-checklist" embedded={popupOnly} title={clWO ? `🔄 ใบจ่ายงาน · ${clWO.wo_no}` : `📋 เช็กลิสต์เตรียม/ตัด · ${checklistMO?.mo_no ?? ""}`}
        footer={<>
          {checklistMO && !clWO && canEdit && (delArmed
            ? <span className="mr-auto flex gap-1"><button onClick={() => deleteMO(checklistMO)} className="h-9 px-3 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700">ยืนยันลบงานนี้</button><button onClick={() => setDelArmed(false)} className="h-9 px-3 text-sm border border-slate-200 rounded-lg">ยกเลิก</button></span>
            : <button onClick={() => setDelArmed(true)} className="h-9 px-4 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 mr-auto">🗑 ลบงาน</button>)}
          {checklistMO && (
            <button type="button" title="พิมพ์รายการขั้นตอนงานให้ช่าง — ถ้าสินค้ายังไม่มีขั้นตอนในสูตร จะพิมพ์ตารางติ๊ก (ชิ้นส่วน × ประเภทงาน) ให้เอาไปถามช่าง"
              onClick={() => { if (clSteps && clSteps.length > 0) setStepsPrintAsk(true); else window.open(`/print/work-steps/${checklistMO.id}${clSteps ? "?blank=1" : ""}`, "_blank"); }}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1">🪜 พิมพ์ขั้นตอนงาน</button>
          )}
          {checklistMO && <a href={`/print/work-order/${checklistMO.id}`} target="_blank" rel="noreferrer" className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1">🖨 พิมพ์ใบสั่งงาน</a>}
          <button onClick={closeChecklist} className="h-9 px-4 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700">เสร็จ</button>
        </>}>
        {checklistMO && (() => {
          const curMo = board.pending.find((p) => p.id === checklistMO.id) ?? checklistMO;
          const prepTotal = clRows.length, prepDone = clRows.filter((r) => r.is_ready).length;
          const cutTotal = clCutRows.length, cutDone = clCutRows.filter((r) => r.cut_done).length;
          const ready = clRows.length > 0 ? (prepDone >= prepTotal && cutDone >= cutTotal) : curMo.ready;
          return (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-800 truncate">{checklistMO.product_name ?? checklistMO.product_sku}</p>
                {checklistMO.created_at && (() => {
                  const days = Math.max(0, Math.floor((Date.now() - new Date(checklistMO.created_at).getTime()) / 86400000));
                  return (
                    <span className="ml-auto shrink-0 text-[11px] text-slate-500 whitespace-nowrap" title="วันเวลาที่สร้างใบงานนี้ในระบบ">
                      🗓 สร้างใบงาน <b className="font-medium text-slate-700 tabular-nums">{formatDateTime(checklistMO.created_at)}</b>
                      <span className="text-slate-400"> · {days === 0 ? "วันนี้" : `${fmt(days)} วันที่แล้ว`}</span>
                    </span>
                  );
                })()}
                <span className={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${ready ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{ready ? "พร้อมจ่าย ✓" : "ยังไม่พร้อม"}</span>
              </div>
              {/* จำนวนสั่งผลิต — ปกติ "อ่านอย่างเดียว" ต้องกด ✏️ ก่อนถึงแก้ได้
                  (เปลี่ยนจำนวน = ระบบกางสูตรวัตถุดิบใหม่ทั้งใบ ไม่ควรให้เผลอพิมพ์ทับ) */}
              <div className="flex items-center gap-2 flex-wrap text-[12px] rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                <span className="text-slate-500 whitespace-nowrap">จำนวนสั่งผลิต</span>
                {qtyEditing ? (
                  <>
                    <input type="number" min={0} step="any" value={moQty} disabled={qtySaving} autoFocus
                      onChange={(e) => setMoQty(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveMoQty(); if (e.key === "Escape") { setMoQty(String(checklistMO.qty ?? "")); setQtyEditing(false); } }}
                      className="w-28 h-8 px-2 text-sm text-right border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100" />
                    <span className="text-slate-400">ชิ้น</span>
                    <button onClick={() => void saveMoQty()} disabled={qtySaving || !(Number(moQty) > 0) || Number(moQty) === (checklistMO.qty || 0)}
                      className="h-8 px-3 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                      {qtySaving ? "กำลังบันทึก…" : "💾 บันทึก"}
                    </button>
                    <button onClick={() => { setMoQty(String(checklistMO.qty ?? "")); setQtyEditing(false); }} disabled={qtySaving}
                      className="h-8 px-2.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-white disabled:opacity-50">ยกเลิก</button>
                  </>
                ) : (
                  <>
                    <b className="text-slate-700 tabular-nums text-sm">{fmt(checklistMO.qty || 0)}</b>
                    <span className="text-slate-400">ชิ้น</span>
                    {canEdit && !curMo.has_sizes && (
                      <button onClick={() => { setMoQty(String(checklistMO.qty ?? "")); setQtyEditing(true); }}
                        title="แก้จำนวนสั่งผลิต (ระบบจะคิดวัตถุดิบตามจำนวนใหม่ให้)"
                        className="h-7 px-2 text-xs border border-slate-200 rounded-lg text-slate-500 bg-white hover:text-blue-600 hover:border-blue-300">✏️ แก้จำนวน</button>
                    )}
                  </>
                )}
                <span className="text-slate-400">· จ่ายไปแล้ว {fmt(checklistMO.dispatched || 0)} · เหลือ <b className="text-slate-600">{fmt(checklistMO.remaining || 0)}</b></span>
                {curMo.has_sizes && <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">ใบนี้แบ่งตามไซส์ — แก้จำนวนที่หน้าใบสั่งผลิต</span>}
                {qtyEditing && <span className="text-[11px] text-slate-400">บันทึกแล้ววัตถุดิบจะคิดใหม่ให้ (ค่าที่ติ๊กไว้ยังอยู่)</span>}
              </div>
              {/* 📅 วันกำหนด 2 อัน — เลือกวันแล้วบันทึกให้เลย (ไม่ต้องกดปุ่ม)
                  ลูกค้า = วันที่ต้องส่งของถึงลูกค้า · ภายใน = วันที่ช่าง/โต๊ะต้องทำเสร็จ */}
              {!clWO && (
                <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-[12px] rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5">
                  <span className="flex items-center gap-1">
                    <span className="text-slate-500 whitespace-nowrap">📦 กำหนดส่งลูกค้า</span>
                    <InlineEdit type="date" value={moDue} disabled={!canEdit || moDueSaving !== ""} width="9.5rem" placeholder="— ยังไม่กำหนด —"
                      onSave={(v) => { setMoDue(v); void saveMoDue("due", v); }} />
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="text-slate-500 whitespace-nowrap">🪑 กำหนดส่งงานภายใน</span>
                    <InlineEdit type="date" value={moDueInt} disabled={!canEdit || moDueSaving !== ""} width="9.5rem" placeholder="— ยังไม่กำหนด —"
                      onSave={(v) => { setMoDueInt(v); void saveMoDue("internal", v); }} />
                  </span>
                  {moDueSaving !== "" ? <span className="text-[11px] text-slate-400">กำลังบันทึก…</span>
                    : <span className="text-[11px] text-slate-400">ตั้งวันภายใน = ใบจ่ายงานที่ยังทำอยู่ของใบนี้ขยับตามให้</span>}
                </div>
              )}
              {/* 📦 แบ่งงวดส่ง — วันไหนส่งเท่าไหร่ (ใบเดียวส่งหลายรอบได้) */}
              {!clWO && (() => {
                const rows = board.deliveryPlans.filter((p) => p.mo_id === checklistMO.id);
                const planned = rows.reduce((n, p) => n + (Number(p.qty) || 0), 0);
                const left = Math.round(((checklistMO.qty || 0) - planned) * 100) / 100;
                const show = planOpen || rows.length > 0;
                return (
                  <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-[12px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button type="button" onClick={() => setPlanOpen((v) => !v)}
                        className="h-7 px-2 text-xs border border-slate-200 rounded-lg bg-white text-slate-600 hover:text-indigo-600 hover:border-indigo-300">
                        📦 แบ่งงวดส่ง {rows.length > 0 ? `(${rows.length} งวด)` : ""} {show ? "▾" : "▸"}
                      </button>
                      {rows.length > 0 && (
                        <span className="text-slate-500">
                          แบ่งแล้ว <b className="text-slate-700 tabular-nums">{fmt(planned)}</b> / {fmt(checklistMO.qty || 0)} ชิ้น
                          {left > 0.0001 ? <> · ยังไม่แบ่ง <b className="text-amber-600 tabular-nums">{fmt(left)}</b></>
                            : left < -0.0001 ? <span className="text-rose-600"> · เกินยอดสั่ง {fmt(-left)}</span>
                            : <span className="text-emerald-600"> · แบ่งครบแล้ว ✓</span>}
                        </span>
                      )}
                      {rows.length === 0 && !planOpen && <span className="text-slate-400">ยังไม่ได้แบ่ง — ส่งทีเดียวตามวันนัดส่งลูกค้า</span>}
                    </div>
                    {show && (
                      <div className="mt-2 space-y-1">
                        {rows.map((p, i) => (
                          <div key={p.id} className={`flex items-center gap-2 flex-wrap rounded-lg px-1 py-0.5 ${p.shipped ? "bg-emerald-50/70" : ""}`}>
                            <span className={`w-14 shrink-0 text-[11px] px-1.5 py-0.5 rounded text-center ${p.shipped ? "bg-emerald-100 text-emerald-700" : "bg-indigo-100 text-indigo-700"}`}>งวด {i + 1}</span>
                            <InlineEdit type="date" value={p.due_date?.slice(0, 10) ?? ""} disabled={!canEdit || planSaving} width="9.5rem"
                              onSave={(v) => { if (v) void patchPlanRow(p.id, { due_date: v }); }} />
                            <InlineEdit type="number" value={p.qty} suffix="ชิ้น" align="right" width="6rem" disabled={!canEdit || planSaving}
                              onSave={(v) => { const n = Number(v); if (n > 0 && n !== Number(p.qty)) void patchPlanRow(p.id, { qty: n }); }} />
                            {p.note && <span className="text-[11px] text-slate-500 truncate max-w-[10rem]">{p.note}</span>}
                            {/* 🧾 ใบส่งสินค้า — ยังไม่มีก็กดออกได้เลย (ร่าง) · มีแล้วกดเปิดดู */}
                            {p.delivery_note_id ? (
                              <a href={`/delivery-notes?id=${encodeURIComponent(p.delivery_note_id)}`} target="_blank" rel="noreferrer"
                                className="h-7 px-2 inline-flex items-center gap-1 text-[11px] rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-indigo-600 hover:border-indigo-300">
                                🧾 {p.dn_number ?? "ใบส่งสินค้า"} ↗
                              </a>
                            ) : canEdit && (
                              <button type="button" onClick={() => void createDNForPlan(p)} disabled={planSaving}
                                title="ออกใบส่งสินค้า (ร่าง) จากงวดนี้ — ไปเลือกลูกค้าต่อในใบ"
                                className="h-7 px-2 text-[11px] rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-indigo-600 hover:border-indigo-300 disabled:opacity-40">🧾 ออกใบส่งของ</button>
                            )}
                            {canEdit && (
                              <label className={`h-7 px-2 inline-flex items-center gap-1 text-[11px] rounded-lg border cursor-pointer ${p.shipped ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-500 hover:border-emerald-300"}`}>
                                <input type="checkbox" checked={!!p.shipped} disabled={planSaving}
                                  onChange={(e) => void patchPlanRow(p.id, { shipped: e.target.checked, shipped_at: e.target.checked ? todayLocal() : null })}
                                  className="w-3.5 h-3.5 accent-emerald-600" />
                                {p.shipped ? `ส่งแล้ว${p.shipped_at ? ` ${p.shipped_at.slice(8, 10)}/${p.shipped_at.slice(5, 7)}` : ""}` : "ส่งแล้ว"}
                              </label>
                            )}
                            {canEdit && !p.shipped && (
                              <button type="button" onClick={() => void delPlanRow(p.id)} disabled={planSaving}
                                title="ลบงวดนี้ (จำนวนกลับไปเป็นยังไม่แบ่ง)"
                                className="h-7 w-7 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-600 hover:border-rose-300 disabled:opacity-40">🗑</button>
                            )}
                          </div>
                        ))}
                        {canEdit && (
                          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-200/70">
                            <span className="w-14 shrink-0 text-[11px] text-slate-400 text-center">เพิ่ม</span>
                            <input type="date" value={newPlanDate} onChange={(e) => setNewPlanDate(e.target.value)} disabled={planSaving}
                              className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white" />
                            <input type="number" min={0} step="any" value={newPlanQty} onChange={(e) => setNewPlanQty(e.target.value)} disabled={planSaving}
                              placeholder={left > 0 ? String(left) : "จำนวน"}
                              className="w-24 h-8 px-2 text-sm text-right border border-slate-200 rounded-lg bg-white" />
                            <input value={newPlanNote} onChange={(e) => setNewPlanNote(e.target.value)} disabled={planSaving} placeholder="หมายเหตุ (ไม่ใส่ก็ได้)"
                              className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white w-40" />
                            <button type="button" onClick={() => void addPlanRow()} disabled={planSaving}
                              className="h-8 px-3 text-xs font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40">
                              {planSaving ? "กำลังบันทึก…" : "➕ เพิ่มงวด"}
                            </button>
                            {left > 0.0001 && <button type="button" onClick={() => setNewPlanQty(String(left))} className="text-[11px] text-indigo-600 underline">ใส่ที่เหลือ {fmt(left)}</button>}
                          </div>
                        )}
                        <p className="text-[11px] text-slate-400">แบ่งแล้วปฏิทินนัดส่งลูกค้าจะโชว์แยกทีละงวด · ลากการ์ดงวดในปฏิทินเพื่อเลื่อนวันได้</p>
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* รายละเอียดสั่งงาน (เหมือนหน้าแก้ใบสั่งผลิต) — พับไว้ โชว์แค่รูป+ชื่อ กดกางดูสเปกเต็ม */}
              {checklistMO.product_sku && <WorkInstructionPanel sku={checklistMO.product_sku} editable={false} defaultOpen={false} onAfterBomEdit={() => load(true)} />}
              {/* แท็บรวม 6 หน้า — ใช้ได้ทั้งมี/ไม่มี BOM */}
              {(() => {
                const tabBtn = (id: typeof clTab, label: string) => (
                  <button type="button" onClick={() => setClTab(id)}
                    className={`h-8 px-3 rounded-lg border ${clTab === id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{label}</button>
                );
                const issN = clIssues?.length ?? 0;
                // map สถานะซื้อ ตามชื่อวัตถุดิบ (โชว์ในหน้าเตรียม)
                const norm = (s: string | null) => (s ?? "").trim().toLowerCase();
                const purchByName = new Map((clPurch ?? []).map((p) => [norm(p.item_name), p]));
                return (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1 text-[12px]">
                      {clWO && tabBtn("recv", "📤 ส่งงาน")}
                      {tabBtn("steps", `🪜 ขั้นตอนงาน${clSteps ? ` ${clSteps.length}` : ""}`)}
                      {tabBtn("prep", `📋 วัตถุดิบ · เตรียม ${prepDone}/${prepTotal} · ตัด ${cutDone}/${cutTotal}`)}
                      {tabBtn("piece", `🧵 งานเหมา ${clPieceRows.filter((r) => r.selected_id).length}/${clPieceRows.length}`)}
                      {tabBtn("disp", `🧰 จ่ายงาน ${board.workOrders.filter((w) => w.mo_no === checklistMO.mo_no && w.status !== "cancelled").length}`)}
                      {tabBtn("cost", "💰 ต้นทุน")}
                      {tabBtn("purch", "📦 ของซื้อ")}
                      {tabBtn("issue", `⚠️ ปัญหา${issN ? ` ${issN}` : ""}`)}
                      {tabBtn("hist", "🕑 ประวัติ")}
                    </div>
                    {/* แถบค่าแรงใบนี้ (กลุ่ม A) — สรุป แผน/จริง + กรอกค่าแรงผลิตที่วางแผน */}
                    {clTab !== "recv" && (
                      <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2 space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-[11px] flex-wrap">
                          <span className="font-medium text-slate-600">💰 ค่าแรงใบนี้ — แผน/<span className="text-emerald-600">จริง</span></span>
                          <span className="text-slate-500 tabular-nums">
                            ผลิต ฿{fmt(checklistMO.labor?.prod_plan ?? 0)}/<span className="text-emerald-600">฿{fmt(checklistMO.labor?.prod_actual ?? 0)}</span>
                            {" · "}เหมา ฿{fmt(checklistMO.labor?.piece_plan ?? 0)}/<span className="text-emerald-600">฿{fmt(checklistMO.labor?.piece_actual ?? 0)}</span>
                          </span>
                        </div>
                        {canEdit && (
                          <div className="space-y-1.5">
                            {/* อ่านอย่างเดียวจนกว่าจะกด ✏️ — โหมดขึ้นกับ estEditing เท่านั้น
                                🐛 เดิมเช็ก "มีค่าแล้วหรือยัง" ด้วย → พิมพ์ 1 ตัวแรกช่องก็เด้งกลับเป็นอ่านอย่างเดียว
                                   (จะพิมพ์ 100 ได้แค่ 1 ต้องกดแก้ใหม่ทุกครั้ง) */}
                            {(() => {
                              const hasRate = estLabor.trim() !== "" && Number(estLabor) > 0;
                              const totalTxt = (checklistMO.qty || 0) > 0
                                ? `= รวม ฿${fmt((Number(estLabor) || 0) * (checklistMO.qty || 0))} (${fmt(checklistMO.qty || 0)} ชิ้น)` : "";
                              if (!estEditing) return (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <label className="text-[11px] text-slate-500 whitespace-nowrap">ค่าแรงผลิต/ชิ้น (วางแผน)</label>
                                  {hasRate ? (<>
                                    <b className="text-sm text-slate-700 tabular-nums">฿{fmt(Number(estLabor) || 0)}</b>
                                    <span className="text-[10px] text-slate-400">บาท/ชิ้น</span>
                                    {totalTxt && <span className="text-[10px] text-slate-400">{totalTxt}</span>}
                                  </>) : <span className="text-[12px] text-slate-400 italic">— ยังไม่ใส่ค่าแรง —</span>}
                                  <button onClick={() => { estLaborInit.current = estLabor; setEstEditing(true); }} title="แก้ค่าแรงผลิต/ชิ้น ของใบนี้"
                                    className="h-7 px-2 text-xs border border-slate-200 rounded-lg text-slate-500 bg-white hover:text-indigo-600 hover:border-indigo-300">
                                    {hasRate ? "✏️ แก้ค่าแรง" : "✏️ ใส่ค่าแรง"}
                                  </button>
                                </div>
                              );
                              return (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <label className="text-[11px] text-slate-500 whitespace-nowrap">ค่าแรงผลิต/ชิ้น (วางแผน)</label>
                                  <input type="number" min={0} step="any" autoFocus value={estLabor} onChange={(e) => setEstLabor(e.target.value)} placeholder="—"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") { e.preventDefault(); void (async () => { await saveEstLabor(); setEstEditing(false); })(); }
                                      if (e.key === "Escape") { setEstLabor(estLaborInit.current); setEstEditing(false); }
                                    }}
                                    className="w-24 h-8 px-2 text-sm text-right border border-indigo-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                                  <span className="text-[10px] text-slate-400">บาท/ชิ้น</span>
                                  {estLabor.trim() !== "" && totalTxt && <span className="text-[10px] text-slate-400">{totalTxt}</span>}
                                  <button onClick={async () => { await saveEstLabor(); setEstEditing(false); }} disabled={estSaving} className="h-8 px-3 text-sm border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 disabled:opacity-50">{estSaving ? "บันทึก…" : "💾 บันทึก"}</button>
                                  <button onClick={() => { setEstEditing(false); setEstLabor(estLaborInit.current); }} disabled={estSaving} className="h-8 px-2 text-xs border border-slate-200 rounded-lg text-slate-500 disabled:opacity-50">ยกเลิก</button>
                                  <span className="text-[10px] text-slate-400">กด Enter = บันทึก · Esc = ยกเลิก</span>
                                </div>
                              );
                            })()}
                            <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer w-fit">
                              <input type="checkbox" checked={estSaveBom} onChange={(e) => setEstSaveBom(e.target.checked)} className="w-3.5 h-3.5 accent-indigo-600" />
                              💾 บันทึกกลับเข้า BOM ด้วย (เป็นราคากลาง/ชิ้น)
                            </label>
                            {/* ใส่ค่าแรงเดียวกันให้ทุกสีของรุ่นนี้ — ไม่ต้องเปิดทีละใบพิมพ์ซ้ำ */}
                            <label className={`flex items-center gap-1.5 text-[11px] cursor-pointer w-fit ${estAllParent ? "text-indigo-700 font-medium" : "text-slate-500"}`}
                              title="ใส่ค่าแรง/ชิ้น นี้ให้ทุกใบสั่งผลิตที่ยังเปิดอยู่ ของสินค้ารุ่นเดียวกัน (ทุกสี/ทุกไซส์ที่อยู่ใต้ Parent SKU เดียวกัน) — แต่ละใบคิดยอดรวมจากจำนวนของใบนั้นเอง">
                              <input type="checkbox" checked={estAllParent} onChange={(e) => setEstAllParent(e.target.checked)} className="w-3.5 h-3.5 accent-indigo-600" />
                              🧬 ใส่ให้ทุกใบของรุ่นเดียวกัน (Parent SKU เดียวกัน)
                            </label>
                            <span className="block text-[10px] text-slate-400">เหมา-จริง = กด “เสร็จ” ในแท็บ 🧵</span>
                          </div>
                        )}
                      </div>
                    )}
                    {clTab === "recv" && clWO ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-[6rem_1fr] gap-y-1.5 text-xs">
                          <span className="text-slate-400">แผนก/ผู้รับ</span><span className="text-slate-700">{clWO.department_name ?? "—"} · {clWO.assignee_name ?? "—"}</span>
                          <span className="text-slate-400">จ่าย</span>
                          <span className="flex items-center gap-1.5 flex-wrap">
                            <InlineEdit type="number" value={woQty} suffix="ชิ้น" width="6rem" disabled={!canEdit || woQtySaving}
                              onSave={(v) => void saveWoQty(v)} />
                            {woQtySaving && <span className="text-[11px] text-slate-400">กำลังบันทึก…</span>}
                            <span className="text-[10px] text-slate-400">แก้ได้ถ้าลงผิด (ลดต่ำกว่าที่ส่งแล้วไม่ได้)</span>
                          </span>
                          <span className="text-slate-400">ส่งแล้ว</span><span className="text-slate-700">{fmt(clWO.received_qty)} · เหลือ {fmt(Math.max(0, (clWO.qty || 0) - (clWO.received_qty || 0)))}</span>
                          <span className="text-slate-400">กำหนดเสร็จ</span>
                          <span className="flex items-center gap-1.5">
                            <input type="date" value={woDue} disabled={!canEdit || woDueSaving}
                              onChange={(e) => { setWoDue(e.target.value); void saveWoDue(e.target.value); }}
                              className="h-7 px-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
                            {woDueSaving && <span className="text-[11px] text-slate-400">กำลังบันทึก…</span>}
                          </span>
                          <span className="text-slate-400">สถานะ</span><span><span className={`text-[11px] px-2 py-0.5 rounded border ${(WO_STATUS[clWO.status] ?? WO_STATUS.dispatched).cls}`}>{(WO_STATUS[clWO.status] ?? WO_STATUS.dispatched).label}</span></span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="block"><span className="text-[11px] text-slate-500">ส่งรอบนี้ (ชิ้น)</span>
                            <input type="number" min={0} step="any" value={recvQty} onChange={(e) => setRecvQty(Number(e.target.value))} disabled={!canEdit}
                              className="w-full h-9 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50" /></label>
                          <label className="block"><span className="text-[11px] text-slate-500">ค่าแรง/ชิ้น (บาท)</span>
                            <input type="number" min={0} step="any" value={recvLabor} onChange={(e) => setRecvLabor(e.target.value)} disabled={!canEdit} placeholder="—"
                              className="w-full h-9 mt-0.5 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
                            <RecvWageHint rate={recvLabor} fromSlip={woRateStr(clWO)} total={recvWage()} /></label>
                        </div>
                        {canEdit && (
                          <label className="flex items-center gap-2 text-xs text-slate-600">
                            <input type="checkbox" checked={saveLaborBom} onChange={(e) => setSaveLaborBom(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
                            บันทึกค่าแรง/ชิ้นนี้กลับเข้า BOM ({laborBomTarget(clWO).craftsman_id ? `ราคาของช่าง ${clWO.assignee_name ?? "—"}` : "ราคากลาง"})
                          </label>
                        )}
                        {canEdit && (
                          <div className="flex items-center gap-2">
                            <button onClick={() => void cancelWOTab()} className="h-9 px-4 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50">ยกเลิกใบจ่ายงาน</button>
                            <button onClick={() => void saveLabor()} className="h-9 px-3 text-sm border border-indigo-200 text-indigo-600 rounded-lg hover:bg-indigo-50 ml-auto">💾 บันทึกค่าแรง</button>
                            <button onClick={() => void submitReceiveTab()} disabled={recvSaving || recvQty <= 0 || recvLabor.trim() === ""} title={recvLabor.trim() === "" ? "ใส่ค่าแรงก่อน" : ""} className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">{recvSaving ? "กำลังบันทึก…" : "✓ ส่งงาน"}</button>
                          </div>
                        )}
                        <p className="text-[11px] text-slate-400">แท็บอื่นด้านบนดูข้อมูลใบสั่งผลิตเดียวกัน (เตรียม/ตัด/งานเหมา/ของซื้อ/ปัญหา/ประวัติ)</p>
                      </div>
                    ) : clTab === "steps" ? (
                      <WorkStepsTab moId={checklistMO.id} bomCode={clStepsBom ?? checklistMO.bom_code ?? null} pieceRows={clPieceRows} canEdit={canEdit}
                        steps={clSteps} onSteps={(s, b) => { setClSteps(s); if (b) setClStepsBom(b); }} />
                    ) : (clTab === "prep" || clTab === "cut" || clTab === "piece") && clLoading ? (
                      <div className="text-center py-8 text-slate-400 text-sm">กำลังโหลด…</div>
                    ) : clTab === "prep" ? (
                      clSummary.length === 0 && clMaterials.length === 0 ? (
                        <div className="text-center py-6">
                          <p className="text-slate-400 text-sm mb-3">ใบนี้ไม่มีรายการวัตถุดิบจาก BOM — ติ๊กรวมทั้งใบ</p>
                          <div className="grid grid-cols-2 gap-2 max-w-[280px] mx-auto">
                            <StepChip label="เตรียม" done={curMo.prep_done} disabled={!canEdit} onClick={() => togglePrep(curMo, "prep_done")} />
                            <StepChip label="ตัด" done={curMo.cut_done} disabled={!canEdit} onClick={() => togglePrep(curMo, "cut_done")} />
                          </div>
                          {canEdit && (checklistMO.product_sku || curMo.bom_code) && (
                            <div className="mt-4 flex justify-center">
                              <BomRefreshButton moId={checklistMO.id} productSku={checklistMO.product_sku} currentBomCode={curMo.bom_code ?? null}
                                onDone={reloadClMats} label="🔄 ดึงวัตถุดิบจาก BOM" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <MoMaterialsTable
                          summary={clSummary} materials={clMaterials} qty={checklistMO.qty || 0} sizeQty={clSizeQty} requested={clRequested}
                          editable={canEdit} canEdit={canEdit}
                          extraActions={canEdit && (checklistMO.product_sku || curMo.bom_code)
                            ? <>
                                <BomRefreshButton moId={checklistMO.id} productSku={checklistMO.product_sku} currentBomCode={curMo.bom_code ?? null} onDone={reloadClMats} />
                                {/* เสนอแก้สูตร — ยังไม่แตะ BOM จริงจนกว่าจะอนุมัติ (ของกลาง) */}
                                <BomChangeRequestButton productSku={checklistMO.product_sku} productName={checklistMO.product_name} moNo={checklistMO.mo_no} />
                              </>
                            : undefined}
                          onChangeSummary={(rows) => void onMatSummaryChange(rows)}
                          onToggleCut={(line, next) => void onMatToggleCut(line, next)}
                          onAddToCart={canEdit ? (row) => {
                            const label = row.component_sku ? `[${row.component_sku}] ${row.component_name ?? ""}`.trim() : (row.component_name ?? "วัตถุดิบ");
                            addToPrCart([{ label, qty: row.to_purchase, uom: row.uom ?? "", seller: "—", price: 0, currency: "THB", image: null, variationId: null, skuRef: row.component_sku, skuId: null, note: `จากใบสั่งผลิต ${checklistMO.mo_no}`, sourceMoNo: checklistMO.mo_no, usedForLabel: checklistMO.product_name ?? checklistMO.product_sku ?? null }]);
                            toast.success(`ใส่ตะกร้าขอซื้อแล้ว: ${row.component_name ?? row.component_sku ?? ""} · ${fmt(row.to_purchase)} ${row.uom ?? ""} — ไปหน้า “ขอซื้อ” เพื่อยืนยัน`);
                          } : undefined}
                        />
                      )
                    ) : clTab === "cut" ? (
                      clCutRows.length === 0 ? (
                        <div className="text-center py-8 text-slate-300 text-sm">ใบนี้ไม่มีงานตัด</div>
                      ) : (() => {
                        const moQty = checklistMO.qty || 0;
                        const rowTotal = (r: CutRow) => (r.pieces ?? 0) * moQty;   // ยอดรวมชิ้น = ชิ้น/บล็อก × จำนวนสั่ง
                        const totalPieces = clCutRows.reduce((s, r) => s + rowTotal(r), 0);
                        const sorted = [...clCutRows].sort((a, b) => (a.component_name ?? "").localeCompare(b.component_name ?? "", "th") || (a.cut_block_code ?? "").localeCompare(b.cut_block_code ?? ""));
                        const gkey = (r: CutRow) => clCutGroup === "type" ? (r.material_type ?? "ไม่ระบุประเภท") : clCutGroup === "material" ? (r.component_name ?? r.component_sku ?? "—") : "";
                        const groups: { key: string; rows: CutRow[] }[] = [];
                        if (clCutGroup === "none") groups.push({ key: "", rows: sorted });
                        else { const m = new Map<string, CutRow[]>(); for (const r of sorted) { const k = gkey(r); (m.get(k) ?? m.set(k, []).get(k)!).push(r); } for (const [key, rows] of m) groups.push({ key, rows }); }
                        const GRID = "grid grid-cols-[3rem_1fr_3.6rem_2.2rem_3.4rem_2.4rem] gap-1";
                        return (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1.5 text-[11px]">
                              <span className="text-slate-400">จัดกลุ่ม:</span>
                              {([["none", "ไม่จัด"], ["type", "ประเภท"], ["material", "วัตถุดิบ"]] as const).map(([v, l]) => (
                                <button key={v} type="button" onClick={() => setClCutGroup(v)} className={`px-2 py-0.5 rounded-full border ${clCutGroup === v ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}>{l}</button>
                              ))}
                            </div>
                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                              <div className={`${GRID} px-2.5 py-1.5 bg-slate-100 text-[10px] font-semibold text-slate-600`}>
                                <span>บล็อก</span><span>วัตถุดิบ / ประเภท</span><span className="text-center">ก×ย</span><span className="text-center">ชิ้น</span><span className="text-right">ยอดรวม</span><span className="text-center">ตัด</span>
                              </div>
                              <div className="max-h-[42vh] overflow-y-auto">
                                {groups.map((g) => (
                                  <div key={g.key || "all"}>
                                    {g.key && <div className="px-2.5 py-1 bg-slate-50 text-[11px] font-medium text-slate-500 border-t border-slate-100">{g.key} <span className="text-slate-400">({g.rows.length})</span></div>}
                                    {g.rows.map((r, idx) => (
                                      <div key={r.id} className={`${GRID} px-2.5 py-2 items-center border-t border-slate-100 ${r.cut_done ? "bg-emerald-50/60" : idx % 2 ? "bg-slate-50/30" : "bg-white"}`}>
                                        <span className="font-mono text-[10px] bg-indigo-50 text-indigo-700 px-1 py-0.5 rounded text-center truncate" title={r.cut_block_code ?? ""}>{r.cut_block_code ?? "—"}</span>
                                        <span className="min-w-0">
                                          <span className="block text-[12px] text-slate-800 truncate" title={r.component_name ?? ""}>{r.component_name ?? r.component_sku}</span>
                                          {r.material_type && <span className="block text-[9px] text-slate-400">{r.material_type}</span>}
                                        </span>
                                        <span className="text-center text-[10px] text-slate-500">{r.cut_width != null && r.cut_length != null ? `${fmt(r.cut_width)}×${fmt(r.cut_length)}` : "—"}</span>
                                        <span className="text-center text-[11px] text-slate-600">{r.pieces != null ? fmt(r.pieces) : "—"}</span>
                                        <span className="text-right text-[12px] font-semibold text-slate-700">{fmt(rowTotal(r))}</span>
                                        <span className="flex justify-center"><CheckBtn done={r.cut_done} disabled={!canEdit} onClick={() => toggleCut(r.id)} /></span>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                              <div className="flex justify-between px-3 py-1.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
                                <span>ทั้งหมด <b className="text-slate-700">{clCutRows.length}</b> บล็อก · ยอดรวม <b className="text-slate-700">{fmt(totalPieces)}</b> ชิ้น</span>
                                <span>ตัดแล้ว <b className="text-emerald-600">{cutDone}/{cutTotal}</b></span>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : clTab === "piece" ? (
                      clPieceRows.length === 0 ? (
                        <div className="text-center py-8">
                          <p className="text-slate-300 text-sm mb-3">สินค้านี้ยังไม่มีงานเหมาใน BOM</p>
                          {canEdit && (
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => setAddPieceOpen(true)} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">➕ เพิ่มงานเหมาเข้า BOM</button>
                              <button onClick={() => setCopyPieceOpen(true)} title="ยกงานเหมาจากรุ่นเดียวกันหรือสินค้าตัวอื่นมาทั้งชุด"
                                className="h-9 px-4 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:border-blue-300 hover:text-blue-600">📋 คัดลอกจากรุ่นอื่น</button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="border border-slate-100 rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50">
                            <span className="text-[11px] font-medium text-slate-500">เลือกงานเหมาที่จะจ่าย</span>
                            <span className="flex items-center gap-2">
                              {(() => { const t = pieceSums(clPieceRows); return (
                                <span className="text-[11px] text-slate-500">
                                  จ่ายในใบนี้ <b className="text-indigo-700">฿{fmt(t.selMoney)}</b>
                                  {t.doneMoney > 0 && <> · เสร็จแล้ว <b className="text-emerald-700">฿{fmt(t.doneMoney)}</b></>}
                                  <span className="text-slate-400"> · ทั้งหมด ฿{fmt(t.money)}</span>
                                </span>
                              ); })()}
                              {canEdit && <button onClick={() => setCopyPieceOpen(true)} className="text-[11px] text-slate-500 hover:text-blue-600 hover:underline">📋 คัดลอกจากรุ่นอื่น</button>}
                              {canEdit && <button onClick={() => setAddPieceOpen(true)} className="text-[11px] text-blue-600 hover:underline">➕ เพิ่มงานเข้า BOM</button>}
                            </span>
                          </div>
                          <div className="grid grid-cols-[2rem_1fr_4.5rem_5rem_3.6rem_3.4rem] gap-2 px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-[11px] font-medium text-slate-500"><span className="text-center">จ่าย</span><span>งาน</span><span className="text-right">จำนวนรวม</span><span className="text-right">รวมเงิน</span><span className="text-center">เสร็จ</span><span className="text-center">แก้/ลบ</span></div>
                          <div className="divide-y divide-slate-50 max-h-[46vh] overflow-y-auto">
                            {clPieceRows.map((r) => {
                              const done = r.status === "done";
                              const editing = pieceEditKey === r.key;
                              const editQty = (Number(pieceEdit.qty_per) || 0) * (checklistMO.qty || 0);
                              if (editing) return (
                                <div key={r.key} className="px-3 py-2 bg-amber-50/60 space-y-1.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <input autoFocus value={pieceEdit.job_name} onChange={(e) => setPieceEdit((v) => ({ ...v, job_name: e.target.value }))} placeholder="ชื่องาน"
                                      className="flex-1 min-w-[120px] h-8 px-2 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
                                    <input type="number" min={0} step="any" value={pieceEdit.rate} onChange={(e) => setPieceEdit((v) => ({ ...v, rate: e.target.value }))} placeholder="฿/ชิ้น" title="ค่าแรงต่อชิ้น"
                                      className="w-20 h-8 px-2 text-sm text-right border border-amber-300 rounded-lg" />
                                    <input type="number" min={0} step="any" value={pieceEdit.qty_per} onChange={(e) => setPieceEdit((v) => ({ ...v, qty_per: e.target.value }))} placeholder="ต่อใบ" title="จำนวนต่อสินค้า 1 ใบ"
                                      className="w-16 h-8 px-2 text-sm text-right border border-amber-300 rounded-lg" />
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                    <span>รวม {fmt(editQty)} ชิ้น{Number(pieceEdit.rate) > 0 ? ` · ฿${fmt(editQty * (Number(pieceEdit.rate) || 0))}` : ""}</span>
                                    <button disabled={pieceBusy} onClick={() => void savePieceEdit(r)} className="ml-auto h-7 px-3 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50">{pieceBusy ? "บันทึก…" : "บันทึก"}</button>
                                    <button disabled={pieceBusy} onClick={() => setPieceEditKey(null)} className="h-7 px-2 text-xs border border-slate-200 rounded-lg text-slate-500">ยกเลิก</button>
                                  </div>
                                  {!r.selected_id && <p className="text-[10px] text-amber-600">บันทึกแล้วระบบจะติ๊ก “จ่ายงานนี้ในใบนี้” ให้เลย (ค่าที่แก้ใช้เฉพาะใบนี้)</p>}
                                </div>
                              );
                              return (
                              <div key={r.key} className="grid grid-cols-[2rem_1fr_4.5rem_5rem_3.6rem_3.4rem] gap-2 px-3 py-2 items-center hover:bg-slate-50/60">
                                <span className="flex justify-center"><input type="checkbox" checked={!!r.selected_id} disabled={!canEdit} onChange={() => togglePiece(r.key)} className="w-4 h-4 accent-blue-600" title="เลือกจ่ายงานนี้" /></span>
                                <div className="min-w-0">
                                  <p className="text-sm text-slate-800 truncate">{r.job_name} {r.is_detail && <span className="text-[10px] text-amber-600">★ละเอียด</span>}{!r.in_bom && <span className="text-[10px] text-slate-400">(เพิ่มเอง)</span>}</p>
                                  <p className="text-[10px] text-slate-400">{fmt(r.qty_per)} × จำนวนสั่ง{r.rate ? ` · ${fmt(r.rate)} ฿/ชิ้น · รวม ฿${fmt(r.total_qty * r.rate)}` : ""}</p>
                                </div>
                                <span className="text-right text-sm font-semibold text-slate-700">{fmt(r.total_qty)}</span>
                                <span className={`text-right text-sm tabular-nums ${r.selected_id ? "text-indigo-700 font-semibold" : "text-slate-400"}`}>{r.rate > 0 ? `฿${fmt(r.total_qty * r.rate)}` : "—"}</span>
                                <span className="flex justify-center">
                                  {r.selected_id ? (
                                    <button type="button" disabled={!canEdit} onClick={() => void togglePieceDone(r)}
                                      className={`text-[10px] px-2 py-1 rounded-full border whitespace-nowrap ${done ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-white text-slate-400 border-slate-200 hover:bg-slate-50"}`}
                                      title={done ? "งานเหมาเสร็จแล้ว — กดเพื่อยกเลิก" : "กดเมื่อทำงานเหมานี้เสร็จ (นับเป็นค่าแรงจริง)"}>
                                      {done ? "✓ เสร็จ" : "ทำเสร็จ"}
                                    </button>
                                  ) : <span className="text-[10px] text-slate-300">—</span>}
                                </span>
                                {/* แก้ / ลบ งานเหมาบรรทัดนี้ */}
                                <span className="flex justify-center gap-0.5">
                                  {canEdit && (
                                    <button type="button" onClick={() => openPieceEdit(r)} title="แก้ชื่องาน / ค่าแรงต่อชิ้น / จำนวนต่อใบ"
                                      className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 text-xs">✎</button>
                                  )}
                                  {canEdit && (
                                    <button type="button" disabled={pieceBusy} onClick={() => void deletePieceRow(r)}
                                      title={r.selected_id ? "เอาออกจากใบนี้" : "เอาออกจากสูตร (BOM)"}
                                      className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 text-xs disabled:opacity-40">🗑</button>
                                  )}
                                </span>
                              </div>
                              );
                            })}
                          </div>
                          {/* แถวรวมท้ายตาราง — ยอดที่จะจ่ายจริงในใบนี้ (นับเฉพาะที่ติ๊ก) */}
                          {(() => { const t = pieceSums(clPieceRows); return (
                            <div className="grid grid-cols-[2rem_1fr_4.5rem_5rem_3.6rem_3.4rem] gap-2 px-3 py-1.5 bg-slate-50 border-t border-slate-200 text-[11px] font-semibold text-slate-600">
                              <span />
                              <span>รวมที่ติ๊กจ่าย {clPieceRows.filter((x) => x.selected_id).length}/{clPieceRows.length} รายการ</span>
                              <span className="text-right tabular-nums">{fmt(t.selQty)}</span>
                              <span className="text-right tabular-nums text-indigo-700">฿{fmt(t.selMoney)}</span>
                              <span /><span />
                            </div>
                          ); })()}
                        </div>
                      )
                    ) : clTab === "disp" ? (
                      // 🧰 รายละเอียดการจ่ายงานของใบนี้ — ใครรับไปเท่าไหร่ ส่งกลับแล้วเท่าไหร่ ค่าแรงเท่าไหร่
                      (() => {
                        const list = board.workOrders
                          .filter((w) => w.mo_no === checklistMO.mo_no && w.status !== "cancelled")
                          .sort((a, b) => (a.department_name ?? "").localeCompare(b.department_name ?? "", "th"));
                        const sumQty = list.reduce((n, w) => n + (Number(w.qty) || 0), 0);
                        const sumRecv = list.reduce((n, w) => n + (Number(w.received_qty) || 0), 0);
                        const sumLabor = list.reduce((n, w) => n + (Number(w.labor_cost) || 0), 0);
                        if (list.length === 0) return <div className="text-center py-8 text-sm text-slate-300">ใบนี้ยังไม่ได้จ่ายงานให้ใคร</div>;
                        return (
                          <div className="border border-slate-100 rounded-lg overflow-hidden">
                            <div className="grid grid-cols-[1fr_5rem_5rem_5.5rem_4.5rem] gap-2 px-3 py-1.5 bg-slate-50 text-[11px] font-medium text-slate-500">
                              <span>โต๊ะ / ช่าง</span><span className="text-right">จ่าย</span><span className="text-right">ส่งแล้ว</span><span className="text-right">ค่าแรง</span><span className="text-center">สถานะ</span>
                            </div>
                            <div className="divide-y divide-slate-50 max-h-[46vh] overflow-y-auto">
                              {list.map((w) => {
                                const left = Math.max(0, (Number(w.qty) || 0) - (Number(w.received_qty) || 0));
                                const st = WO_STATUS[w.status] ?? WO_STATUS.dispatched;
                                return (
                                  <div key={w.id} onClick={() => { setRecvQty(left); openWO(w); }}
                                    title="กดเพื่อเปิดใบจ่ายงานนี้ (ส่งงาน / แก้จำนวน / ใส่ค่าแรง)"
                                    className="grid grid-cols-[1fr_5rem_5rem_5.5rem_4.5rem] gap-2 px-3 py-2 items-center text-[12px] hover:bg-slate-50/60 cursor-pointer">
                                    <span className="min-w-0">
                                      <span className="block text-slate-700 truncate">{w.department_name ?? "—"}{w.assignee_name ? ` · ${w.assignee_name}` : ""}</span>
                                      <span className="block text-[10px] text-slate-400 font-mono truncate">{w.wo_no}{w.due_date ? ` · กำหนด ${dueDateText(w.due_date)}` : ""}</span>
                                    </span>
                                    <span className="text-right tabular-nums font-semibold text-slate-700">{fmt(Number(w.qty) || 0)}</span>
                                    <span className="text-right tabular-nums text-slate-600">
                                      {fmt(Number(w.received_qty) || 0)}
                                      {left > 0 && <span className="block text-[10px] text-amber-600">ค้าง {fmt(left)}</span>}
                                    </span>
                                    <span className="text-right tabular-nums text-slate-600">{(Number(w.labor_cost) || 0) > 0 ? `฿${fmt(Number(w.labor_cost) || 0)}` : <span className="text-slate-300">—</span>}</span>
                                    <span className="text-center"><span className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${st.cls}`}>{st.label}</span></span>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="grid grid-cols-[1fr_5rem_5rem_5.5rem_4.5rem] gap-2 px-3 py-1.5 bg-slate-50 border-t border-slate-100 text-[11px] font-semibold text-slate-600">
                              <span>รวม {list.length} ใบจ่ายงาน</span>
                              <span className="text-right tabular-nums">{fmt(sumQty)}</span>
                              <span className="text-right tabular-nums">{fmt(sumRecv)}</span>
                              <span className="text-right tabular-nums text-indigo-700">฿{fmt(sumLabor)}</span>
                              <span />
                            </div>
                          </div>
                        );
                      })()
                    ) : clTab === "cost" ? (
                      <CostTab cost={clCost} pieceRows={clPieceRows} moId={checklistMO.id} bomCode={checklistMO.bom_code ?? null} departments={board.departments} deptWages={deptWages} craftsmen={craftsmen} canEdit={canEdit} onReloadCost={() => setClCost(null)} />
                    ) : clTab === "purch" ? (
                      <PurchTab rows={clPurch} />
                    ) : clTab === "issue" ? (
                      <IssueTab issues={clIssues} canEdit={canEdit} issType={issType} setIssType={setIssType} issSev={issSev} setIssSev={setIssSev} issQty={issQty} setIssQty={setIssQty} onAdd={addIssue} onDel={delIssue} onEdit={editIssue} />
                    ) : (
                      <HistTab rows={clHist} />
                    )}
                    {clTab !== "recv" && <p className="text-[11px] text-slate-400">{clTab === "prep" ? "ติ๊ก ✓ เมื่อเตรียมวัตถุดิบชิ้นนั้นครบ · ครบทั้ง 2 หน้า → การ์ดไฟเขียว"
                      : clTab === "cut" ? "ติ๊ก ✓ ตัดครบรายบล็อก — ตัดครบทุกบล็อกของวัตถุดิบใด ระบบติ๊กเตรียมครบให้อัตโนมัติ"
                      : clTab === "piece" ? "ติ๊กเลือกงานเหมาที่จะจ่ายในใบนี้ · จำนวนรวม = จำนวนต่อใบ × จำนวนที่สั่ง"
                      : clTab === "disp" ? "กดแถวเพื่อเปิดใบจ่ายงานนั้น (ส่งงาน · แก้จำนวนที่จ่าย · ใส่ค่าแรง)"
                      : clTab === "purch" ? "สถานะและวันของจะถึง ดึงจากใบขอซื้อ/ใบสั่งซื้อที่ผูกกับงานนี้"
                      : clTab === "cost" ? "ต้นทุนวัตถุดิบ = Σ(ใช้/ชิ้น × Standard Price) · ราคาขาย = Sale Price · เพดานค่าแรง = ค่าแรงกลาง"
                      : clTab === "issue" ? "ลงปัญหาที่เจอ (เชื่อมระบบ QC) — ใช้ติดตามของเสีย/แก้ไข"
                      : "ใบจ่ายงานทั้งหมดของงานนี้ (รวมที่ยกเลิกแล้ว)"}</p>}
                  </div>
                );
              })()}
            </div>
          );
        })()}
      </ERPModal>

      {/* popup เพิ่มงานเหมาเข้า BOM (จากแท็บงานเหมา) */}
      <AddPieceworkModal open={addPieceOpen} productSku={checklistMO?.product_sku ?? null} productName={checklistMO?.product_name ?? null}
        onClose={() => setAddPieceOpen(false)} onAdded={() => void reloadPiece()} />
      {/* คัดลอกงานเหมาจากสินค้าตัวอื่น / รุ่นเดียวกัน */}
      <CopyPieceworkModal open={copyPieceOpen} productSku={checklistMO?.product_sku ?? null} productName={checklistMO?.product_name ?? null}
        onClose={() => setCopyPieceOpen(false)} onCopied={() => void reloadPiece()} />

      {/* ⚙️ ตั้งค่าแผนก — จบในที่เดียว (สร้าง/แก้/ลบ/ซ่อน/หมายเหตุ/เรียงลำดับ) */}
      <ERPModal open={deptMgrOpen} onClose={closeDeptMgr} size="md" title="⚙️ ตั้งค่าแผนก"
        footer={<>
          <a href="/admin/departments" className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 inline-flex items-center mr-auto">🏢 หน้าจัดการแผนกเต็ม</a>
          <button onClick={closeDeptMgr} className="h-9 px-4 text-sm bg-slate-800 text-white rounded-lg hover:bg-slate-700">เสร็จ</button>
        </>}>
        <div className="space-y-3">
          <p className="text-[11px] text-slate-400">เพิ่ม/แก้ไข/ลบแผนก · เปิด-ปิดการโชว์บนบอร์ด · ใส่หมายเหตุ · เรียงลำดับด้วย ▲▼</p>
          <div className="flex gap-2">
            <input value={newDeptName} onChange={(e) => setNewDeptName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addDept(); }}
              placeholder="ชื่อแผนกใหม่…" className="flex-1 h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            <button onClick={() => void addDept()} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 whitespace-nowrap">＋ เพิ่มแผนก</button>
          </div>
          {deptLoading ? <div className="text-center py-6 text-slate-400 text-sm">กำลังโหลด…</div>
            : deptList.length === 0 ? <div className="text-center py-6 text-slate-300 text-sm">ยังไม่มีแผนก</div>
              : (
                <div className="border border-slate-100 rounded-lg divide-y divide-slate-50 max-h-[54vh] overflow-y-auto">
                  {deptList.map((d, i) => {
                    const isCut = d.name.includes("ตัด") || d.name.includes("เตรียม");
                    return (
                      <div key={d.id} className="p-2.5 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col text-[10px] leading-none">
                            <button onClick={() => moveDept(i, -1)} disabled={i === 0} className="h-4 text-slate-400 hover:text-slate-700 disabled:opacity-20">▲</button>
                            <button onClick={() => moveDept(i, 1)} disabled={i === deptList.length - 1} className="h-4 text-slate-400 hover:text-slate-700 disabled:opacity-20">▼</button>
                          </div>
                          <input defaultValue={d.name} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== d.name) void patchDept(d.id, { name: v }); }}
                            className="flex-1 h-8 px-2 text-sm font-medium border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          {confirmDelId === d.id ? (
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => void delDept(d.id)} className="h-8 px-2 text-xs bg-rose-600 text-white rounded-lg hover:bg-rose-700">ยืนยันลบ</button>
                              <button onClick={() => setConfirmDelId(null)} className="h-8 px-2 text-xs border border-slate-200 rounded-lg">ยกเลิก</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmDelId(d.id)} title="ลบแผนก" className="shrink-0 h-8 w-8 flex items-center justify-center text-slate-300 hover:text-rose-600 rounded-lg hover:bg-rose-50">🗑</button>
                          )}
                        </div>
                        <div className="flex items-center gap-4 pl-7">
                          <Toggle label="โชว์ในบอร์ด" on={d.show_on_board !== false}
                            onClick={() => void patchDept(d.id, d.show_on_board === false ? { show_on_board: true, status: "active" } : { show_on_board: false })} />
                          {d.status === "inactive" && <span className="text-[10px] text-rose-600">🔒 ปิดโต๊ะแล้ว — เปิด “โชว์ในบอร์ด” = เปิดโต๊ะกลับ</span>}
                          <Toggle label="โชว์หมายเหตุ" on={d.show_note} onClick={() => void patchDept(d.id, { show_note: !d.show_note })} />
                          {isCut && <span className="text-[10px] text-amber-600">ℹ️ แผนกตัด/เตรียม จะไม่ขึ้นบอร์ด (อยู่ในตัวการ์ด)</span>}
                        </div>
                        <div className="pl-7">
                          <input defaultValue={d.note ?? ""} onBlur={(e) => { const v = e.target.value; if (v !== (d.note ?? "")) void patchDept(d.id, { note: v }); }}
                            placeholder="หมายเหตุของแผนก (เช่น เบอร์ติดต่อ, เงื่อนไข)…" className="w-full h-8 px-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          <p className="text-[11px] text-slate-400">ปิด “โชว์ในบอร์ด” = ซ่อนแผนกจากบอร์ด (ไม่ลบ) · ลบได้เฉพาะแผนกที่ไม่มีงานค้าง</p>
        </div>
      </ERPModal>
    </div>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1.5 text-[11px] text-slate-600">
      <span className={`relative inline-block h-4 w-7 rounded-full transition-colors ${on ? "bg-emerald-500" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${on ? "left-3.5" : "left-0.5"}`} />
      </span>
      {label}
    </button>
  );
}

function Sep() { return <span className="w-px h-6 bg-slate-200 mx-0.5" />; }
function ToolBtn({ active, onClick, title, children }: { active?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return <button onClick={onClick} title={title} className={`h-8 min-w-8 px-1.5 flex items-center justify-center rounded-md text-sm transition-colors ${active ? "bg-indigo-100 ring-1 ring-indigo-300" : "hover:bg-slate-100"}`}>{children}</button>;
}

// ---- ปุ่มติ๊กขั้นตอน (เตรียม / ตัด) ----
function StepChip({ label, done, disabled, onClick }: { label: string; done: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} title={done ? `${label}ครบแล้ว — กดเพื่อยกเลิก` : `กดเมื่อ${label}ครบ`}
      className={`h-6 rounded-md text-[10px] font-medium border flex items-center justify-center gap-0.5 transition-colors ${done ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"} ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
      <span className="text-[11px] leading-none">{done ? "✓" : "○"}</span>{label}
    </button>
  );
}

// ---- ปุ่มติ๊กกลม (ในป๊อปอัปเช็กลิสต์) ----
function CheckBtn({ done, disabled, onClick }: { done: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`h-7 w-7 rounded-md border flex items-center justify-center text-sm transition-colors ${done ? "bg-emerald-500 text-white border-emerald-500" : "bg-white text-slate-300 border-slate-300 hover:border-emerald-400"} ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}>
      {done ? "✓" : ""}
    </button>
  );
}

// ---- ไอคอนพนักงานในแผนก (วงกลมรูป/อักษรย่อ) ----
function StaffAvatars({ staff }: { staff: Assignee[] }) {
  if (!staff.length) return null;
  const show = staff.slice(0, 4);
  return (
    <div className="flex -space-x-1.5" title={staff.map((s) => s.name).join(", ")}>
      {show.map((s) => (
        <span key={s.id} title={s.name} className="h-5 w-5 rounded-full ring-2 ring-white bg-slate-200 overflow-hidden flex items-center justify-center text-[9px] font-medium text-slate-600">
          {s.photo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={s.photo} alt="" className="h-full w-full object-cover" /> : (s.name?.trim()?.[0] ?? "?")}
        </span>
      ))}
      {staff.length > 4 && <span className="h-5 w-5 rounded-full ring-2 ring-white bg-slate-100 flex items-center justify-center text-[8px] text-slate-500">+{staff.length - 4}</span>}
    </div>
  );
}

// ---- เฟส 4: ของที่ซื้อ / ETA ----
const _dt = (s: string | null) => { if (!s) return "—"; try { return new Date(s).toLocaleDateString("th-TH", { day: "2-digit", month: "short" }); } catch { return s; } };
const PO_BADGE: Record<string, { t: string; c: string }> = {
  draft: { t: "ร่าง", c: "bg-slate-100 text-slate-600" }, confirmed: { t: "สั่งแล้ว", c: "bg-blue-50 text-blue-700" },
  partially_received: { t: "รับบางส่วน", c: "bg-amber-50 text-amber-700" }, received: { t: "รับครบ", c: "bg-emerald-50 text-emerald-700" }, closed: { t: "ปิดแล้ว", c: "bg-slate-100 text-slate-500" },
};
const DEFAULT_SC: CostScenario = { labor_mode: "system", piece_rate: 0, piece_jobs: [], table: { salary: 0, workdays: 26, capacity: 0, dept_name: "", calc: "days", days: 0, target_pp: 0, pick_mode: "table", worker_ids: [] }, extras: [] };
const normPieceJob = (j: Partial<PieceJob>): PieceJob => ({ label: String(j.label ?? ""), kind: j.kind === "table" ? "table" : "piece", rate: Number(j.rate) || 0, qty_per: Number(j.qty_per) || 1, salary: Number(j.salary) || 0, workdays: Number(j.workdays) || 26, days: Number(j.days) || 0, dept_name: String(j.dept_name ?? "") });

function CostTab({ cost, pieceRows, moId, bomCode, departments, deptWages, craftsmen, canEdit, onReloadCost }: { cost: MoCost | null; pieceRows: MoPieceRow[]; moId: string; bomCode: string | null; departments: { id: string; name: string }[]; deptWages: Record<string, number>; craftsmen: { id: string; name: string; code?: string | null; department_id?: string | null }[]; canEdit: boolean; onReloadCost?: () => void }) {
  const toast = useToast();
  const [sc, setSc] = useState<CostScenario>(DEFAULT_SC);
  const [saving, setSaving] = useState(false);
  const [bomSaving, setBomSaving] = useState(false);
  // ⚠️ hooks ทุกตัวต้องอยู่เหนือ early return (cost === null) ไม่งั้น React error #310
  const [savingStd, setSavingStd] = useState(false);
  // วัตถุดิบที่กำลังใส่ราคา (กดที่ช่อง "ราคา/หน่วย" ในตารางล่าง) — ของกลาง SkuPriceModal
  const [priceFor, setPriceFor] = useState<MoCostMaterial | null>(null);
  useEffect(() => {
    if (!cost) return;
    // ใบนี้เคยคิดแล้ว → ใช้ของใบ · ยังไม่เคย → ดึง "ต้นทุนมาตรฐานของสินค้า" มาเป็นค่าตั้งต้น
    const s = cost.scenario ?? cost.default_scenario ?? null;
    setSc(s ? { labor_mode: s.labor_mode ?? "system", piece_rate: Number(s.piece_rate) || 0,
      piece_jobs: Array.isArray(s.piece_jobs) ? s.piece_jobs.map(normPieceJob) : undefined,
      table: { salary: Number(s.table?.salary) || 0, workdays: Number(s.table?.workdays) || 26, capacity: Number(s.table?.capacity) || 0, dept_name: s.table?.dept_name ?? "", calc: s.table?.calc === "target" ? "target" : "days", days: Number(s.table?.days) || 0, target_pp: Number(s.table?.target_pp) || 0, pick_mode: s.table?.pick_mode === "workers" ? "workers" : "table", worker_ids: Array.isArray(s.table?.worker_ids) ? s.table.worker_ids : [] },
      extras: Array.isArray(s.extras) ? s.extras : [] } : DEFAULT_SC);
  }, [cost]);

  if (cost === null) return <div className="text-center py-8 text-slate-400 text-sm">กำลังคิดต้นทุน…</div>;
  const qty = cost.qty || 0;
  const sell = cost.sell_price;
  const matPP = cost.material_cost_pp;
  const central = cost.central_rate;
  const estPP = cost.est_labor_pp;
  const overCeiling = central > 0 && estPP > central + 0.0001;
  const estUsed = estPP > 0 ? estPP : central;                                 // ค่าแรงผลิตที่ใช้จริง (หรือเพดานถ้ายังไม่ตั้ง)
  const sysPiecePP = pieceRows.reduce((a, r) => a + (Number(r.rate) || 0) * (Number(r.qty_per) || 0), 0);
  const systemLaborPP = estUsed + sysPiecePP;                                  // ค่าแรงตามระบบ
  // โหมดงานเหมา: รายการงานเหมา (ยังไม่แก้ → ดึงจาก BOM) · แต่ละงาน เหมา ฿/ชิ้น หรือ ประกอบโต๊ะ
  const effPieceJobs: PieceJob[] = (sc.piece_jobs && sc.piece_jobs.length)
    ? sc.piece_jobs
    : pieceRows.map((r) => ({ label: r.job_name, kind: "piece" as const, rate: Number(r.rate) || 0, qty_per: Number(r.qty_per) || 1, salary: 0, workdays: 26, days: 0, dept_name: "" }));
  const pieceJobPP = (j: PieceJob) => j.kind === "table"
    ? (qty > 0 && j.workdays > 0 ? ((Number(j.salary) || 0) / j.workdays) * (Number(j.days) || 0) / qty : 0)
    : (Number(j.rate) || 0) * (Number(j.qty_per) || 1);
  const pieceJobsPP = effPieceJobs.reduce((a, j) => a + pieceJobPP(j), 0);
  // โหมดจ่ายโต๊ะ: เงินเดือน/วันทำงาน → ราย/วัน · 2 ทาง (ใส่วัน หรือ ใส่ค่าแรงเป้าหมาย→วันสูงสุด)
  const t = sc.table;
  const dailyPay = t.workdays > 0 ? (Number(t.salary) || 0) / t.workdays : 0;
  const tableCalc = t.calc ?? "days";
  const tablePP = tableCalc === "target" ? (Number(t.target_pp) || 0) : (qty > 0 ? dailyPay * (Number(t.days) || 0) / qty : 0);
  const maxDays = tableCalc === "target" && dailyPay > 0 ? Math.floor((tablePP * qty) / dailyPay) : 0;   // ห้ามเกินกี่วัน
  const daysNeeded = tableCalc === "days" ? (Number(t.days) || 0) : maxDays;
  const laborPP = sc.labor_mode === "piece" ? pieceJobsPP : sc.labor_mode === "table" ? tablePP : systemLaborPP;
  const laborLabel = sc.labor_mode === "piece" ? "ค่าแรงเหมา (ทดลอง) / ชิ้น" : sc.labor_mode === "table" ? "ค่าแรงจ่ายโต๊ะ / ชิ้น" : "ค่าแรง (ตามระบบ) / ชิ้น";
  const setJob = (i: number, p: Partial<PieceJob>) => setSc((s) => ({ ...s, piece_jobs: effPieceJobs.map((j, idx) => idx === i ? { ...j, ...p } : j) }));
  const addJob = () => setSc((s) => ({ ...s, piece_jobs: [...effPieceJobs, { label: "", kind: "piece", rate: 0, qty_per: 1, salary: 0, workdays: 26, days: 0, dept_name: "" }] }));
  const delJob = (i: number) => setSc((s) => ({ ...s, piece_jobs: effPieceJobs.filter((_, idx) => idx !== i) }));
  // เพิ่มงานเหมา (kind=piece) กลับเข้าสูตร BOM (แทนที่ทั้งชุด bom_piecework_lines)
  const saveJobsToBom = async () => {
    if (!bomCode) { toast.error("ใบนี้ยังไม่มี BOM"); return; }
    const lines = effPieceJobs.filter((j) => j.kind === "piece" && j.label.trim()).map((j) => ({ job_name: j.label.trim(), rate: j.rate, qty_per: j.qty_per, is_detail: false, note: null }));
    setBomSaving(true);
    try { const r = await apiFetch("/api/bom/piecework", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bom_code: bomCode, lines }) }); const j = await r.json(); if (j.error) throw new Error(j.error); toast.success(`บันทึกงานเหมาเข้า BOM แล้ว (${lines.length} งาน)`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกเข้า BOM ไม่สำเร็จ"); }
    finally { setBomSaving(false); }
  };
  const extrasPP = sc.extras.reduce((a, e) => a + (e.per === "mo" ? (qty > 0 ? (Number(e.amount) || 0) / qty : 0) : (Number(e.amount) || 0)), 0);
  const costPP = matPP + laborPP + extrasPP;
  const profitPP = sell - costPP;
  const marginPct = sell > 0 ? Math.round((profitPP / sell) * 1000) / 10 : 0;

  const save = async () => {
    setSaving(true);
    try { const r = await apiFetch(`/api/mo/${encodeURIComponent(moId)}/cost`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario: sc }) }); const j = await r.json(); if (j.error) throw new Error(j.error); toast.success("บันทึกการคำนวณแล้ว"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };
  // บันทึกการคิดนี้กลับเป็น "ต้นทุนมาตรฐาน" ของสินค้า (รุ่น/ทุกสี) → module คำนวณต้นทุน + ใบอื่นดึงไปใช้
  const saveToProduct = async () => {
    if (!cost?.parent_code) { toast.error("สินค้านี้ไม่มี Parent SKU"); return; }
    setSavingStd(true);
    try {
      const summary = { material_pp: matPP, labor_pp: laborPP, extras_pp: extrasPP, cost_pp: costPP, sell, profit_pp: profitPP, margin_pct: marginPct };
      const r = await apiFetch("/api/product-costings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target_type: "parent", target_code: cost.parent_code, qty_basis: qty, scenario: sc, summary }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast.success(`บันทึกเป็นต้นทุนมาตรฐานของรุ่น (${cost.parent_code}) แล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSavingStd(false); }
  };
  const setTable = (p: Partial<CostScenario["table"]>) => setSc((s) => ({ ...s, table: { ...s.table, ...p } }));
  const setExtra = (i: number, p: Partial<CostScenario["extras"][number]>) => setSc((s) => ({ ...s, extras: s.extras.map((e, idx) => idx === i ? { ...e, ...p } : e) }));
  // เลือกบางคน → ให้ server รวมเงินเดือน (ไม่ส่งรายคน) แล้วตั้งเป็นเงินเดือนรวม
  const toggleWorker = (id: string) => {
    const cur = sc.table.worker_ids ?? [];
    const ids = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setSc((s) => ({ ...s, table: { ...s.table, worker_ids: ids } }));
    void (async () => {
      try { const r = await apiFetch(`/api/mo/worker-wage?ids=${encodeURIComponent(ids.join(","))}`); const j = await r.json(); if (!j.error) setSc((s) => ({ ...s, table: { ...s.table, salary: Number(j.total) || 0 } })); }
      catch { /* ignore */ }
    })();
  };

  const Row = ({ label, amount, neg, strong, cls = "text-slate-700", sub, subCls = "text-slate-400" }: { label: string; amount: number; neg?: boolean; strong?: boolean; cls?: string; sub?: string; subCls?: string }) => (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5">
      <div className="min-w-0"><span className={strong ? "font-semibold text-slate-700" : "text-slate-600"}>{label}</span>{sub && <span className={`ml-2 text-[10px] ${subCls}`}>{sub}</span>}</div>
      <span className={`tabular-nums shrink-0 ${strong ? "font-bold text-base" : ""} ${cls}`}>{neg ? "− " : ""}฿{fmt(Math.abs(amount))}</span>
    </div>
  );
  const Metric = ({ label, amount, cls = "text-slate-800" }: { label: string; amount: number; cls?: string }) => (
    <div className="rounded-lg bg-slate-50 px-2 py-1.5 text-center">
      <div className="text-[10px] text-slate-400">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${cls}`}>฿{fmt(amount)}</div>
    </div>
  );
  const modeBtn = (id: CostScenario["labor_mode"], label: string) => (
    <button type="button" onClick={() => setSc((s) => ({ ...s, labor_mode: id }))} disabled={!canEdit}
      className={`h-7 px-2.5 text-xs rounded-lg border ${sc.labor_mode === id ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{label}</button>
  );
  const numIn = "w-24 h-8 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50";

  return (
    <div className="space-y-3">
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-semibold text-slate-500 flex items-center justify-between"><span>สรุปต่อชิ้น</span><span>จำนวน {fmt(qty)} ชิ้น</span></div>
        <div className="divide-y divide-slate-50 text-sm">
          <Row label="💵 ราคาขาย / ชิ้น" amount={sell} strong cls="text-slate-800" />
          <Row label="วัตถุดิบ / ชิ้น" amount={matPP} neg sub={cost.missing_price > 0 ? `⚠️ ${cost.missing_price} รายการยังไม่มีราคา` : undefined} subCls={cost.missing_price > 0 ? "text-amber-600" : "text-slate-400"} />
          <Row label={laborLabel} amount={laborPP} neg subCls={overCeiling ? "text-rose-600 font-medium" : "text-slate-400"}
            sub={sc.labor_mode === "system"
              ? `ค่าแรงกลาง ฿${fmt(central)} · ใช้จริง ฿${fmt(estUsed)}${sysPiecePP > 0 ? ` · เหมา ฿${fmt(sysPiecePP)}` : ""}${overCeiling ? " · เกินเพดาน!" : ""}`
              : sc.labor_mode === "table"
                ? (tableCalc === "target" ? `อยากได้ → เสร็จใน ≤ ${fmt(maxDays)} วัน` : daysNeeded > 0 ? `ทำ ${fmt(Math.ceil(daysNeeded))} วัน` : undefined)
                : `${effPieceJobs.length} งานเหมา`} />
          {extrasPP > 0 && <Row label="ค่าอื่นๆ / ชิ้น" amount={extrasPP} neg />}
          <Row label="= กำไร / ชิ้น" amount={profitPP} neg={profitPP < 0} strong cls={profitPP >= 0 ? "text-emerald-700" : "text-rose-600"} sub={`${marginPct}% ของราคาขาย`} subCls={profitPP >= 0 ? "text-emerald-600" : "text-rose-500"} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric label="ยอดขายรวม" amount={sell * qty} />
        <Metric label="ต้นทุนรวม" amount={costPP * qty} />
        <Metric label="กำไรรวม" amount={profitPP * qty} cls={profitPP >= 0 ? "text-emerald-700" : "text-rose-600"} />
      </div>

      {/* 🧮 ทดลองคำนวณ (บันทึกได้) */}
      <div className="border border-indigo-100 bg-indigo-50/40 rounded-xl p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-700">🧮 ทดลองคำนวณ</span>
          <div className="flex items-center gap-1.5">
            {canEdit && cost.parent_code && <button onClick={() => void saveToProduct()} disabled={savingStd} title="บันทึกการคิดนี้เป็นต้นทุนมาตรฐานของสินค้า (ทุกสี) → ใบอื่นดึงไปใช้ได้" className="h-8 px-3 text-sm border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-50">{savingStd ? "…" : "→ ต้นทุนมาตรฐาน"}</button>}
            {canEdit && <button onClick={() => void save()} disabled={saving} className="h-8 px-3 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{saving ? "บันทึก…" : "💾 บันทึกใบนี้"}</button>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-500">ใช้ค่าแรง:</span>
          {modeBtn("system", "ตามระบบ")}{modeBtn("piece", "งานเหมา/ชิ้น")}{modeBtn("table", "จ่ายโต๊ะ (เงินเดือน)")}
        </div>
        {sc.labor_mode === "piece" && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">รายการงานเหมา (จาก BOM — แก้/เพิ่มได้)</span>
              {canEdit && bomCode && <button onClick={() => void saveJobsToBom()} disabled={bomSaving} className="h-7 px-2 text-[11px] font-medium text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-50">{bomSaving ? "บันทึก…" : "💾 บันทึกเข้า BOM"}</button>}
            </div>
            {effPieceJobs.length === 0 && <div className="text-[11px] text-slate-400 py-1">ยังไม่มีงานเหมา — กด “เพิ่มงานเหมา”</div>}
            {effPieceJobs.map((j, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-white border border-slate-100 rounded-lg px-2 py-1.5 flex-wrap">
                <input value={j.label} disabled={!canEdit} placeholder="ชื่องาน" onChange={(e) => setJob(i, { label: e.target.value })} className="flex-1 min-w-[110px] h-7 px-2 text-xs border border-slate-200 rounded-lg disabled:bg-slate-50" />
                <select value={j.kind} disabled={!canEdit} onChange={(e) => setJob(i, { kind: e.target.value as "piece" | "table" })} className="h-7 px-1 text-[11px] border border-slate-200 rounded-lg bg-white disabled:bg-slate-50">
                  <option value="piece">เหมา ฿/ชิ้น</option><option value="table">ประกอบที่โต๊ะ</option>
                </select>
                {j.kind === "piece" ? (
                  <span className="flex items-center gap-1 text-[11px] text-slate-500">
                    <input type="number" min={0} step="any" value={j.rate || ""} disabled={!canEdit} onChange={(e) => setJob(i, { rate: Number(e.target.value) || 0 })} className="w-16 h-7 px-1.5 text-xs text-right border border-slate-200 rounded-lg disabled:bg-slate-50" />฿ ×
                    <input type="number" min={0} step="any" value={j.qty_per || ""} disabled={!canEdit} onChange={(e) => setJob(i, { qty_per: Number(e.target.value) || 1 })} className="w-12 h-7 px-1.5 text-xs text-right border border-slate-200 rounded-lg disabled:bg-slate-50" />
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-slate-500">
                    <select value={j.dept_name} disabled={!canEdit} onChange={(e) => { const d = departments.find((x) => x.name === e.target.value); setJob(i, { dept_name: e.target.value, salary: d ? (deptWages[d.id] || 0) : j.salary }); }} className="h-7 px-1 text-[11px] border border-slate-200 rounded-lg bg-white max-w-[110px] disabled:bg-slate-50">
                      <option value="">เลือกโต๊ะ</option>{departments.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                    <input type="number" min={0} step="any" value={j.days || ""} disabled={!canEdit} placeholder="วัน" onChange={(e) => setJob(i, { days: Number(e.target.value) || 0 })} className="w-12 h-7 px-1.5 text-xs text-right border border-slate-200 rounded-lg disabled:bg-slate-50" />ว.
                  </span>
                )}
                <span className="text-[11px] font-medium text-slate-600 tabular-nums">= ฿{fmt(pieceJobPP(j))}</span>
                {canEdit && <button onClick={() => delJob(i)} className="text-slate-300 hover:text-rose-600 text-sm">🗑</button>}
              </div>
            ))}
            {canEdit && <button onClick={addJob} className="h-7 px-2.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50">＋ เพิ่มงานเหมา</button>}
            <div className="text-[11px] text-indigo-700 bg-white border border-indigo-100 rounded-lg px-2.5 py-1.5">รวมค่าแรงเหมา <b>฿{fmt(pieceJobsPP)}</b>/ชิ้น · รวมทั้งใบ <b>฿{fmt(pieceJobsPP * qty)}</b></div>
          </div>
        )}
        {sc.labor_mode === "table" && (() => {
          const pickMode = sc.table.pick_mode ?? "table";
          const workerIds = sc.table.worker_ids ?? [];
          const selDept = departments.find((d) => d.name === sc.table.dept_name);
          const workerList = pickMode === "workers" ? (selDept ? craftsmen.filter((c) => c.department_id === selDept.id) : craftsmen) : [];
          const daysN = Number(sc.table.days) || 0;
          return (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="w-32 text-[12px] text-slate-600">เลือกคนทำ</span>
              <button type="button" disabled={!canEdit} onClick={() => setTable({ pick_mode: "table" })} className={`h-7 px-2.5 text-[11px] rounded-lg border ${pickMode === "table" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200"}`}>ทั้งโต๊ะ</button>
              <button type="button" disabled={!canEdit} onClick={() => setTable({ pick_mode: "workers" })} className={`h-7 px-2.5 text-[11px] rounded-lg border ${pickMode === "workers" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200"}`}>เลือกบางคน</button>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-slate-600"><span className="w-32">{pickMode === "workers" ? "โต๊ะ (กรองคน)" : "เลือกโต๊ะ"}</span>
              <select value={sc.table.dept_name || ""} disabled={!canEdit} onChange={(e) => { const d = departments.find((x) => x.name === e.target.value); setTable(pickMode === "workers" ? { dept_name: e.target.value } : { dept_name: e.target.value, salary: d ? (deptWages[d.id] || 0) : sc.table.salary }); }}
                className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white disabled:bg-slate-50">
                <option value="">{pickMode === "workers" ? "— ทุกแผนก —" : "— เลือกโต๊ะ (ดึงเงินเดือนรวม) —"}</option>{departments.map((d) => <option key={d.id} value={d.name}>{d.name}{pickMode === "table" && deptWages[d.id] ? ` · ฿${fmt(deptWages[d.id])}/ด.` : ""}</option>)}
              </select></label>
            {pickMode === "workers" && (
              <div className="border border-slate-200 rounded-lg bg-white">
                <div className="px-2.5 py-1 text-[11px] text-slate-500 border-b border-slate-100 flex justify-between"><span>ติ๊กคนที่ทำงานนี้</span><span>เลือก {workerIds.length} คน</span></div>
                <div className="max-h-36 overflow-y-auto divide-y divide-slate-50">
                  {workerList.length === 0 ? <div className="px-2.5 py-2 text-[11px] text-slate-300">— ไม่มีคนในแผนกนี้ —</div>
                  : workerList.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 px-2.5 py-1.5 text-[12px] text-slate-700 hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" disabled={!canEdit} checked={workerIds.includes(c.id)} onChange={() => toggleWorker(c.id)} className="w-4 h-4 accent-indigo-600" />
                      <span className="truncate">{c.code ? `[${c.code}] ` : ""}{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <label className="flex items-center gap-2 text-[12px] text-slate-600"><span className="w-32">เงินเดือนรวม</span>
              <input type="number" min={0} step="any" value={sc.table.salary || ""} disabled={!canEdit} onChange={(e) => setTable({ salary: Number(e.target.value) || 0 })} className={numIn} /><span className="text-slate-400">บาท/เดือน{pickMode === "workers" ? ` (${workerIds.length} คนที่เลือก)` : ""}</span></label>
            <label className="flex items-center gap-2 text-[12px] text-slate-600"><span className="w-32">วันทำงาน / เดือน</span>
              <input type="number" min={0} step="any" value={sc.table.workdays || ""} disabled={!canEdit} onChange={(e) => setTable({ workdays: Number(e.target.value) || 0 })} className={numIn} /><span className="text-slate-400">วัน</span></label>
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              <span className="w-32 text-[12px] text-slate-600">คิดแบบ</span>
              <button type="button" disabled={!canEdit} onClick={() => setTable({ calc: "days" })} className={`h-7 px-2.5 text-[11px] rounded-lg border ${tableCalc === "days" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200"}`}>ใส่จำนวนวัน</button>
              <button type="button" disabled={!canEdit} onClick={() => setTable({ calc: "target" })} className={`h-7 px-2.5 text-[11px] rounded-lg border ${tableCalc === "target" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200"}`}>ใส่ค่าแรงที่อยากได้</button>
            </div>
            {tableCalc === "days" ? (
              <label className="flex items-center gap-2 text-[12px] text-slate-600"><span className="w-32">ผลิตกี่วัน</span>
                <input type="number" min={0} step="any" value={sc.table.days || ""} disabled={!canEdit} onChange={(e) => setTable({ days: Number(e.target.value) || 0 })} className={numIn} /><span className="text-slate-400">วัน</span></label>
            ) : (
              <label className="flex items-center gap-2 text-[12px] text-slate-600"><span className="w-32">ค่าแรง/ชิ้น ที่อยากได้</span>
                <input type="number" min={0} step="any" value={sc.table.target_pp || ""} disabled={!canEdit} onChange={(e) => setTable({ target_pp: Number(e.target.value) || 0 })} className={numIn} /><span className="text-slate-400">บาท</span></label>
            )}
            {/* วิธีคิด (สูตร) */}
            <div className="text-[11px] bg-white border border-indigo-100 rounded-lg px-2.5 py-1.5 space-y-0.5">
              <div className="text-slate-400">🧾 วิธีคิด</div>
              <div className="text-slate-600">เงินเดือนรวม ฿{fmt(sc.table.salary)} ÷ {fmt(sc.table.workdays || 0)} วัน = <b>฿{fmt(dailyPay)}</b>/วัน</div>
              {tableCalc === "days" ? <>
                <div className="text-slate-600">ค่าแรงรวม = ฿{fmt(dailyPay)} × {fmt(daysN)} วัน = ฿{fmt(dailyPay * daysN)}</div>
                <div className="text-indigo-700 font-medium">ค่าแรง/ชิ้น = ฿{fmt(dailyPay * daysN)} ÷ {fmt(qty)} ชิ้น = ฿{fmt(tablePP)}</div>
              </> : <>
                <div className="text-slate-600">งบค่าแรง = ฿{fmt(tablePP)}/ชิ้น × {fmt(qty)} ชิ้น = ฿{fmt(tablePP * qty)}</div>
                <div className="text-indigo-700 font-medium">วันสูงสุด = ฿{fmt(tablePP * qty)} ÷ ฿{fmt(dailyPay)}/วัน = {dailyPay > 0 ? fmt(Math.round((tablePP * qty) / dailyPay * 100) / 100) : "—"} → ≤ <b>{fmt(maxDays)}</b> วัน{maxDays < 1 ? " ⚠️ งบไม่พอ 1 วัน (ลองเลือกคนน้อยลง)" : ""}</div>
              </>}
            </div>
          </div>
          );
        })()}
        {/* ค่าอื่นๆ */}
        <div className="space-y-1.5">
          <div className="text-[11px] text-slate-500">ค่าอื่นๆ (ค่าส่ง / ค่าจิปาถะ ฯลฯ)</div>
          {sc.extras.map((e, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input value={e.label} disabled={!canEdit} placeholder="ชื่อค่าใช้จ่าย" onChange={(ev) => setExtra(i, { label: ev.target.value })} className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
              <input type="number" min={0} step="any" value={e.amount || ""} disabled={!canEdit} placeholder="0" onChange={(ev) => setExtra(i, { amount: Number(ev.target.value) || 0 })} className="w-20 h-8 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50" />
              <select value={e.per} disabled={!canEdit} onChange={(ev) => setExtra(i, { per: ev.target.value as "piece" | "mo" })} className="h-8 px-1 text-xs border border-slate-200 rounded-lg bg-white disabled:bg-slate-50">
                <option value="piece">/ชิ้น</option><option value="mo">/ทั้งใบ</option>
              </select>
              {canEdit && <button onClick={() => setSc((s) => ({ ...s, extras: s.extras.filter((_, idx) => idx !== i) }))} className="text-slate-300 hover:text-rose-600 text-sm">🗑</button>}
            </div>
          ))}
          {canEdit && <button onClick={() => setSc((s) => ({ ...s, extras: [...s.extras, { label: "", amount: 0, per: "piece" }] }))} className="h-7 px-2.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50">＋ เพิ่มค่าใช้จ่าย</button>}
        </div>
      </div>

      <div className="border border-slate-100 rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_4.5rem_5rem_5rem] gap-2 px-3 py-1.5 bg-slate-50 text-[11px] font-medium text-slate-500"><span>วัตถุดิบ</span><span className="text-right">ใช้/ชิ้น</span><span className="text-right">ราคา/หน่วย</span><span className="text-right">รวม/ชิ้น</span></div>
        <div className="divide-y divide-slate-50 max-h-[28vh] overflow-y-auto">
          {cost.materials.map((m, i) => (
            <div key={i} className="grid grid-cols-[1fr_4.5rem_5rem_5rem] gap-2 px-3 py-1.5 items-center text-[12px]">
              <div className="min-w-0"><div className="truncate text-slate-700">{m.name}</div><div className="text-[10px] text-slate-400 truncate">{m.sku}</div></div>
              <span className="text-right tabular-nums text-slate-500">{fmt(m.qty_per)} {m.uom ?? ""}</span>
              {/* กดที่ราคา = ใส่/แก้ราคาได้เลย แล้วบันทึกกลับเข้าสินค้า (ระบุร้านที่ซื้อได้ด้วย) */}
              {canEdit && m.sku ? (
                <button onClick={() => setPriceFor(m)}
                  title={m.has_price ? "แก้ราคาต้นทุน (บันทึกกลับเข้าสินค้า)" : "ใส่ราคาต้นทุนของวัตถุดิบนี้ (บันทึกกลับเข้าสินค้า + ระบุร้านได้)"}
                  className={`text-right tabular-nums rounded px-1 -mx-1 hover:bg-indigo-50 hover:text-indigo-700 ${m.has_price ? "text-slate-600" : "text-rose-500 font-medium underline decoration-dotted"}`}>
                  {m.has_price ? `฿${fmt(m.unit_cost)}` : "＋ ใส่ราคา"}
                </button>
              ) : (
                <span className={`text-right tabular-nums ${m.has_price ? "text-slate-600" : "text-rose-500"}`}>{m.has_price ? `฿${fmt(m.unit_cost)}` : "ไม่มีราคา"}</span>
              )}
              <span className="text-right tabular-nums font-medium text-slate-700">฿{fmt(m.line_pp)}</span>
            </div>
          ))}
          {cost.materials.length === 0 && <div className="text-center py-4 text-slate-300 text-sm">ไม่มีวัตถุดิบใน BOM</div>}
        </div>
      </div>

      {/* ป๊อปใส่ราคาต้นทุน (ของกลาง) — บันทึกกลับ skus_v2.standard_price + ร้านที่ซื้อ (supplier_items) */}
      {priceFor && (
        <SkuPriceModal open skuCode={priceFor.sku} skuName={priceFor.name} uom={priceFor.uom}
          // ปิดป๊อป = โหลดต้นทุนใหม่เสมอ (เผื่อไปแก้ราคา/ร้านข้างใน แล้วปิดโดยไม่ได้กดบันทึกที่ช่องหลัก)
          onClose={() => { setPriceFor(null); onReloadCost?.(); }}
          onSaved={() => { onReloadCost?.(); }} />
      )}
    </div>
  );
}

function PurchTab({ rows }: { rows: PurchaseStatusRow[] | null }) {
  if (rows === null) return <div className="text-center py-8 text-slate-400 text-sm">กำลังโหลด…</div>;
  if (rows.length === 0) return <div className="text-center py-8 text-slate-300 text-sm">ยังไม่มีรายการสั่งซื้อสำหรับงานนี้</div>;
  return (
    <div className="border border-slate-100 rounded-lg overflow-hidden">
      <div className="grid grid-cols-[1fr_5rem_3.5rem] gap-2 px-3 py-1.5 bg-slate-50 text-[11px] font-medium text-slate-500"><span>ของที่ซื้อ</span><span className="text-center">สถานะ</span><span className="text-right">ของถึง</span></div>
      <div className="divide-y divide-slate-50 max-h-[46vh] overflow-y-auto">
        {rows.map((r) => {
          const po = r.po_status ? (PO_BADGE[r.po_status] ?? { t: r.po_status, c: "bg-slate-100 text-slate-600" }) : null;
          return (
            <div key={r.id} className="grid grid-cols-[1fr_5rem_3.5rem] gap-2 px-3 py-2 items-center">
              <div className="min-w-0">
                <p className="text-sm text-slate-800 truncate">{r.is_urgent && <span className="text-rose-500">⚡</span>} {r.item_name}</p>
                <p className="text-[10px] text-slate-400">{r.po_no ? `PO ${r.po_no}${r.seller_name ? ` · ${r.seller_name}` : ""}` : "ยังไม่ออกใบสั่งซื้อ"}</p>
              </div>
              <span className="flex justify-center">
                {po ? <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${po.c}`}>{po.t}</span>
                  : <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">รอสั่งซื้อ</span>}
              </span>
              <span className="text-right text-[11px] text-slate-600">{_dt(r.expected_date ?? r.needed_date)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- เฟส 4: ปัญหา QC (ลง/ดู/ลบ) ----
const SEV_OPT: [string, string][] = [["low", "เล็กน้อย"], ["medium", "ปานกลาง"], ["high", "รุนแรง"]];
const SEV_BADGE: Record<string, string> = { low: "bg-slate-100 text-slate-600", medium: "bg-amber-50 text-amber-700", high: "bg-rose-50 text-rose-700" };
function IssueTab({ issues, canEdit, issType, setIssType, issSev, setIssSev, issQty, setIssQty, onAdd, onDel, onEdit }: {
  issues: MoIssue[] | null; canEdit: boolean; issType: string; setIssType: (v: string) => void; issSev: string; setIssSev: (v: string) => void; issQty: string; setIssQty: (v: string) => void; onAdd: () => void; onDel: (id: string) => void;
  onEdit: (id: string, patch: { defect_type: string; severity: string; qty: string }) => Promise<boolean>;
}) {
  // ✏️ แก้ในแถว · 🗑 ลบต้องกดยืนยันอีกครั้ง (กันมือลั่น)
  const [ed, setEd] = useState<{ id: string; defect_type: string; severity: string; qty: string } | null>(null);
  const [edBusy, setEdBusy] = useState(false);
  const [delAsk, setDelAsk] = useState<string | null>(null);
  const saveEd = async () => {
    if (!ed || !ed.defect_type.trim()) return;
    setEdBusy(true);
    try { if (await onEdit(ed.id, ed)) setEd(null); } finally { setEdBusy(false); }
  };
  return (
    <div className="space-y-2">
      {canEdit && (
        <div className="flex gap-1.5 items-center">
          <input value={issType} onChange={(e) => setIssType(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
            placeholder="ปัญหาที่เจอ เช่น เย็บเบี้ยว" className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400" />
          <select value={issSev} onChange={(e) => setIssSev(e.target.value)} className="h-8 px-1.5 text-xs border border-slate-200 rounded-lg bg-white">
            {SEV_OPT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input value={issQty} onChange={(e) => setIssQty(e.target.value)} type="number" inputMode="numeric" placeholder="จำนวน" className="w-16 h-8 px-2 text-sm text-center border border-slate-200 rounded-lg" />
          <button onClick={onAdd} className="h-8 px-3 text-sm bg-rose-600 text-white rounded-lg hover:bg-rose-700">＋</button>
        </div>
      )}
      {issues === null ? <div className="text-center py-8 text-slate-400 text-sm">กำลังโหลด…</div>
        : issues.length === 0 ? <div className="text-center py-6 text-slate-300 text-sm">ยังไม่มีปัญหาในงานนี้</div>
          : (
            <div className="border border-slate-100 rounded-lg overflow-hidden">
              <div className="divide-y divide-slate-50 max-h-[40vh] overflow-y-auto">
                {issues.map((i) => ed?.id === i.id ? (
                  <div key={i.id} className="flex gap-1.5 items-center px-3 py-2 bg-blue-50/40">
                    <input value={ed.defect_type} autoFocus onChange={(e) => setEd({ ...ed, defect_type: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveEd(); if (e.key === "Escape") setEd(null); }}
                      className="flex-1 min-w-0 h-8 px-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    <select value={ed.severity} onChange={(e) => setEd({ ...ed, severity: e.target.value })} className="h-8 px-1.5 text-xs border border-slate-200 rounded-lg bg-white">
                      {SEV_OPT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <input value={ed.qty} onChange={(e) => setEd({ ...ed, qty: e.target.value })} type="number" inputMode="numeric" placeholder="จำนวน" className="w-16 h-8 px-2 text-sm text-center border border-slate-200 rounded-lg" />
                    <button onClick={() => void saveEd()} disabled={edBusy || !ed.defect_type.trim()} className="h-8 px-2.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">{edBusy ? "…" : "บันทึก"}</button>
                    <button onClick={() => setEd(null)} disabled={edBusy} className="h-8 px-2 text-xs border border-slate-200 rounded-lg text-slate-500">ยกเลิก</button>
                  </div>
                ) : (
                  <div key={i.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800 truncate">{i.defect_type}</p>
                      <p className="text-[10px] text-slate-400">{i.qty != null ? `${fmt(i.qty)} ชิ้น · ` : ""}{_dt(i.created_at)}{i.cause ? ` · ${i.cause}` : ""}</p>
                    </div>
                    <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full ${SEV_BADGE[i.severity ?? "medium"] ?? SEV_BADGE.medium}`}>{(SEV_OPT.find(([v]) => v === i.severity)?.[1]) ?? i.severity}</span>
                    {canEdit && delAsk !== i.id && <button onClick={() => { setDelAsk(null); setEd({ id: i.id, defect_type: i.defect_type ?? "", severity: i.severity ?? "medium", qty: i.qty != null ? String(i.qty) : "" }); }} title="แก้ไข" className="shrink-0 text-slate-300 hover:text-blue-600 text-xs">✏️</button>}
                    {canEdit && (delAsk === i.id ? (
                      <span className="shrink-0 flex items-center gap-1">
                        <button onClick={() => { setDelAsk(null); onDel(i.id); }} className="h-6 px-2 text-[11px] bg-rose-600 text-white rounded-md hover:bg-rose-700">ยืนยันลบ</button>
                        <button onClick={() => setDelAsk(null)} className="h-6 px-1.5 text-[11px] border border-slate-200 rounded-md text-slate-500">ไม่ลบ</button>
                      </span>
                    ) : <button onClick={() => setDelAsk(i.id)} title="ลบ" className="shrink-0 text-slate-300 hover:text-rose-600 text-xs">🗑</button>)}
                  </div>
                ))}
              </div>
            </div>
          )}
    </div>
  );
}


// ---- ค่าแรงย่อบนการ์ด (กลุ่ม A): ผลิต/เหมา = แผน/จริง (จริงเป็นสีเขียว) ----
function LaborMini({ labor }: { labor?: Labor }) {
  if (!labor) return null;
  if (!(labor.prod_plan || labor.prod_actual || labor.piece_plan || labor.piece_actual)) return null;
  const cell = (plan: number, actual: number) => (
    <span className="tabular-nums text-slate-600">฿{fmt(plan)}<span className="text-slate-300">/</span><span className="text-emerald-600 font-medium">฿{fmt(actual)}</span></span>
  );
  return (
    <div className="mt-1 pt-1 border-t border-slate-100 text-[9px] leading-tight space-y-0.5" title="ค่าแรง แผน / จริง (จริง = สีเขียว)">
      <div className="flex items-center justify-between"><span className="text-slate-400">ผลิต</span>{cell(labor.prod_plan, labor.prod_actual)}</div>
      <div className="flex items-center justify-between"><span className="text-slate-400">เหมา</span>{cell(labor.piece_plan, labor.piece_actual)}</div>
    </div>
  );
}

// ---- เนื้อการ์ดใบสั่งผลิต (รอจ่าย) — กดเปิดเช็กลิสต์ · SKU หนา + วันที่ + เงาแบรนด์ ----
function PendingBody({ mo }: { mo: PendingMO }) {
  const ready = mo.ready;
  const border = mo.brand_color || prodColor(mo.product_sku);
  const showName = mo.product_name && mo.product_name !== mo.product_sku;
  return (
    <div className="bg-white rounded-lg p-2 transition select-none cursor-pointer hover:-translate-y-0.5" style={{ border: `2px solid ${ready ? "#10b981" : border}`, boxShadow: `5px 5px 0 0 ${border}` }} title="กดเพื่อเปิดเช็กลิสต์ เตรียม/ตัด">
      <div className="relative w-full aspect-[4/3] rounded-md bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center mb-1.5">
        {mo.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={mo.image_url} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" /> : <span className="text-slate-300 text-2xl">📦</span>}
        <span className={`absolute top-1 right-1 h-3 w-3 rounded-full ring-2 ring-white ${ready ? "bg-emerald-500" : "bg-rose-500"}`} title={ready ? "พร้อมจ่าย (เตรียม+ตัด ครบ)" : "ยังไม่พร้อม — เตรียม/ตัด ยังไม่ครบ"} />
      </div>
      <div className="flex items-center justify-between gap-1 mb-1">
        {mo.brand ? <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium border truncate max-w-[58%]" style={{ background: `${border}18`, color: border, borderColor: `${border}55` }}>{mo.brand}</span> : <span className="text-[9px] text-slate-400">ใบสั่งผลิต</span>}
        <span className="font-mono text-[9px] text-slate-400 truncate">{mo.mo_no}</span>
      </div>
      <div className="text-center">
        <div className="text-sm font-bold text-slate-800 leading-tight truncate">{mo.product_sku}</div>
        {showName && <div className="text-[10px] text-slate-400 line-clamp-1 leading-tight">{mo.product_name}</div>}
        <div className="text-[10px] text-slate-500 mt-0.5">📅 {dueDateText(mo.due_date)}</div>
      </div>
      <div className="flex items-center justify-between gap-1 mt-1.5 pt-1.5 border-t border-slate-100 text-[10px]">
        <span className="text-rose-600 font-semibold">เหลือ {fmt(mo.remaining)}/{fmt(mo.qty)}</span>
        <span className={daysLeftClass(mo.due_date)}>⏱ {daysLeftText(mo.due_date)}</span>
      </div>
      <LaborMini labor={mo.labor} />
    </div>
  );
}

// ---- เนื้อการ์ดใบจ่ายงาน (ในแผนก) — ดีไซน์เดียวกับการ์ดรอจ่าย ----
function WOBody({ w }: { w: WorkOrder }) {
  const urg = urgencyByDate(w.due_date, w.status === "done");
  const st = WO_STATUS[w.status] ?? WO_STATUS.dispatched;
  const border = w.brand_color || prodColor(w.product_sku);
  const showName = w.product_name && w.product_name !== w.product_sku;
  return (
    <div className="relative bg-white rounded-lg p-2 transition select-none cursor-pointer hover:-translate-y-0.5" style={{ border: `2px solid ${border}`, boxShadow: `5px 5px 0 0 ${border}` }} title="กดเพื่อดูรายละเอียด/รับงานคืน">
      {/* ช่างที่จ่าย — badge มุมซ้ายบน */}
      {w.assignee_name && (
        <span className="absolute -top-2.5 left-2 z-20 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white shadow-sm truncate max-w-[85%]" style={{ border: `2px solid ${border}`, color: border }} title={w.assignee_name}>
          {w.assignee_type === "department" ? "🏢" : (w.assignees?.length ?? 0) > 1 ? "👥" : "👤"} {w.assignee_name}
        </span>
      )}
      <div className="relative w-full aspect-[4/3] rounded-md bg-slate-50 border border-slate-100 overflow-hidden flex items-center justify-center mb-1.5 mt-1.5">
        {w.image_url ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={w.image_url} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" /> : <span className="text-slate-300 text-2xl">📦</span>}
        <span className={`absolute top-1 right-1 h-3 w-3 rounded-full ring-2 ring-white ${URG_DOT[urg]}`} />
        <span className={`absolute top-1 left-1 inline-flex items-center px-1 py-0.5 rounded text-[9px] font-medium border ${st.cls}`}>{st.label}</span>
      </div>
      <div className="text-center">
        <div className="text-sm font-bold text-slate-800 leading-tight truncate">{w.product_sku}</div>
        {showName && <div className="text-[10px] text-slate-400 line-clamp-1 leading-tight">{w.product_name}</div>}
        <div className="text-[10px] text-slate-500 mt-0.5">📅 {dueDateText(w.due_date)}</div>
      </div>
      {/* จำนวน — แถบล่างตัวหนาเด่น */}
      <div className="flex items-center justify-between gap-1 mt-2">
        <span className="px-2.5 py-1 rounded-lg text-sm font-bold text-white shadow-sm tabular-nums" style={{ background: border }}>{fmt(w.qty)} ชิ้น{w.received_qty > 0 && w.status !== "done" ? ` · รับ ${fmt(w.received_qty)}` : ""}</span>
        <span className={`text-[10px] ${daysLeftClass(w.due_date)}`}>⏱ {daysLeftText(w.due_date)}</span>
      </div>
      <LaborMini labor={w.labor} />
      <div className="text-center font-mono text-[8px] text-slate-300 mt-1">{w.wo_no}</div>
    </div>
  );
}

// ---- รูปย่อในตาราง ----
function BoardImg({ url }: { url: string | null | undefined }) {
  return <HoverImage url={url} size={36} previewSize={256} />;
}

// ---- มุมมองตาราง (สลับจากบอร์ด) — รอจ่าย + จ่ายแล้ว ----
// แถวคิว "รอ QC รับเข้า" (มาจาก /api/qc-warehouse?only=queue)
type QcQueueRow = { wo_id: string; mo_no: string | null; sku: string | null; name: string | null; worker: string | null; remaining: number; due_date: string | null; image_key?: string | null; received_at?: string | null };
const ProdCell = ({ url, sku, name }: { url: string | null | undefined; sku: string | null; name: string | null }) => (
  <div className="flex items-center gap-2">
    <BoardImg url={url} />
    <div className="min-w-0"><div className="font-semibold text-slate-800 truncate">{sku}</div>{name && name !== sku && <div className="text-[11px] text-slate-400 truncate">{name}</div>}</div>
  </div>
);
const DueCell = ({ d }: { d: string | null }) => (
  <span className="text-[12px] whitespace-nowrap">📅 {dueDateText(d)} <span className={daysLeftClass(d)}>· {daysLeftText(d)}</span></span>
);

// ---- ขั้นตอนของใบรอจ่าย (ตาราง) — ซื้อของ → เตรียม/ตัด → พร้อมจ่าย · ใช้จัดกลุ่ม + เรียง ----
// p = ความคืบหน้าการซื้อจาก /api/mo/material-progress (ไม่มี = ใบยังไม่มีสูตร หรือยังโหลดไม่เสร็จ)
type MoStage = "buy" | "wait" | "prep" | "ready" | "nobom" | "skipdisp" | "close";
const STAGE_META: Record<MoStage, [string, number]> = {
  buy: ["🛒 รอซื้อของ", 1], wait: ["🚚 รอของเข้า", 2], prep: ["✂️ รอเตรียม/ตัด", 3], ready: ["✅ พร้อมจ่าย", 4], nobom: ["❔ ยังไม่มีสูตร (BOM)", 5],
  skipdisp: ["⏭ ข้ามจ่ายงาน · รอรับคืน", 6], close: ["🏁 ครบแล้ว รอปิดใบ", 7],
};
const stageOf = (m: PendingMO, p: MoProgress | undefined): MoStage => {
  // แอดมินข้ามขั้นจ่ายงาน (lib/mo-skip) → ใบยังอยู่ตารางรอจ่าย แต่ขั้นถัดไปคือรับคืน/ปิดใบ
  if (m.skipped_stages?.dispatch) return m.skipped_stages.receive ? "close" : "skipdisp";
  if (!m.has_bom && !p) return "nobom";
  if (p && p.buy + p.requested > 0) return "buy";
  if (p && p.ordered > 0) return "wait";
  if (m.has_bom ? (m.prep_ready < m.prep_total || m.cut_ready < m.cut_total) : !m.ready) return "prep";
  return "ready";
};
const stageOrder = (name: string) => Object.values(STAGE_META).find(([label]) => label === name)?.[1] ?? 99;
/** ราคาขายต่ำกว่านี้ (฿0 / ฿1) = น่าจะยังไม่ได้ตั้งจริง → ขึ้นเตือน + ไม่นับรวมในยอดมูลค่า */
const PRICE_MIN = 10;
const NO_BRAND = "— ไม่ระบุแบรนด์ —";   // หัวกลุ่มของใบที่สินค้าไม่ผูกแบรนด์ (ไว้ท้ายสุดตอนจัดกลุ่มตามแบรนด์)
/** แท็บที่เปิดอยู่ → ไฮไลต์ช่องไหนในแถว (ให้รู้ว่ากดช่องไหนมา) */
const PANE_COL: Record<string, string> = { job: "prod", bom: "buy", prep: "prep", stage: "stage", dispatch: "qty", due: "due", group: "group", hist: "created" };
/** จำนวนวันจาก "YYYY-MM-DD" ถึง "YYYY-MM-DD" (คิดแบบ UTC ล้วน ไม่เพี้ยนตามเขตเวลา) — บวก = to อยู่หลัง from */
const ymdDiff = (from: string, to: string) => {
  const [y1, m1, d1] = from.split("-").map(Number), [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};
/** ช่อง "ขั้นตอน" แบบคำพูด / ป้ายสี (ชุดหน้าตาโหมดง่าย) — late = เลยกำหนดกี่วัน */
function StageText({ m, p, late, pill }: { m: PendingMO; p: MoProgress | undefined; late: number; pill?: boolean }) {
  const st = stageOf(m, p);
  const [label] = STAGE_META[st];
  const tone = st === "buy" ? "rose" : st === "wait" ? "blue" : st === "prep" ? "amber" : st === "ready" || st === "close" ? "emerald" : "slate";
  const toneCls: Record<string, string> = { rose: "bg-rose-50 text-rose-700", blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-700", emerald: "bg-emerald-50 text-emerald-700", slate: "bg-slate-100 text-slate-600" };
  const txtCls: Record<string, string> = { rose: "text-rose-700", blue: "text-blue-700", amber: "text-amber-700", emerald: "text-emerald-700", slate: "text-slate-500" };
  const detail = st === "buy" && p ? `ต้องซื้อ ${p.buy}${p.requested ? ` · รออนุมัติ ${p.requested}` : ""}`
    : st === "wait" && p ? `รอของ ${p.ordered} อย่าง`
    : st === "prep" && m.has_bom ? `เตรียม ${m.prep_ready}/${m.prep_total} · ตัด ${m.cut_ready}/${m.cut_total}`
    : st === "nobom" ? "ต้องทำสูตรวัตถุดิบก่อน" : "";
  if (pill) return <span className={`inline-block text-[12px] px-2.5 py-0.5 rounded-full whitespace-nowrap ${toneCls[tone]}`}>{label}</span>;
  return (
    <div className="leading-tight">
      <div className={`font-semibold whitespace-nowrap ${txtCls[tone]}`}>{label}</div>
      {detail && <div className="text-[11px] text-slate-500 whitespace-nowrap">{detail}</div>}
      {late > 0 && <div className="text-[11px] font-medium text-rose-600 whitespace-nowrap">⚠️ เลยกำหนด {fmt(late)} วัน</div>}
    </div>
  );
}
/** ช่อง "ซื้อของ" แบบคำพูด */
function BuyText({ p, loading }: { p: MoProgress | undefined; loading: boolean }) {
  if (loading) return <span className="text-[11px] text-slate-300">กำลังโหลด…</span>;
  if (!p || p.total === 0) return <span className="text-[12px] text-slate-400">— ยังไม่มีสูตร —</span>;
  if (p.skipped) return <span className="text-slate-500 font-medium whitespace-nowrap" title="แอดมินข้ามขั้นซื้อของแล้ว">⏭ ข้ามซื้อของ</span>;
  if (p.buy > 0) return <span className="text-rose-600 font-medium whitespace-nowrap">ต้องซื้อ {p.buy} อย่าง</span>;
  if (p.requested > 0) return <span className="text-amber-600 font-medium whitespace-nowrap">รออนุมัติ {p.requested} อย่าง</span>;
  if (p.ordered > 0) return <span className="text-blue-600 font-medium whitespace-nowrap">รอของ {p.ordered} อย่าง</span>;
  return <span className="text-emerald-700 font-medium whitespace-nowrap">✓ ของครบ</span>;
}
/** คอลัมน์ที่โชว์ตั้งต้น — จอคอม (ซ่อน 4 ตัวใหม่ไว้ก่อน) / iPad (เท่าที่จำเป็น) · ผู้ใช้เปลี่ยนเองได้ที่ปุ่ม ▥ คอลัมน์ */
const PEND_HIDDEN_PC = new Set(["eta", "brand", "prio", "issues"]);
const PEND_SHOWN_IPAD = new Set(["img", "prod", "qty", "buy", "stage", "due", "value"]);

const PrepBar = ({ label, a, b }: { label: string; a: number; b: number }) => {
  const pct = b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 100;
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      <span className="w-7 shrink-0 text-slate-400">{label}</span>
      <span className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><span className={`block h-full ${pct >= 100 ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} /></span>
      <span className="w-9 shrink-0 text-right tabular-nums text-slate-500">{b > 0 ? `${a}/${b}` : "—"}</span>
    </div>
  );
};

/** จุดขั้นตอน ซื้อ → เตรียม → ตัด → จ่าย → รับคืน · เขียว = เสร็จ · วงส้ม = ขั้นที่ค้างอยู่ · วงฟ้า = ทำไปบางส่วน · เส้นประ = ไม่มีข้อมูล */
function MoStepDots({ m, p, received }: { m: PendingMO; p: MoProgress | undefined; received: number }) {
  const steps = moSteps(m, p, received);   // คิดที่เดียวกับแผง 🚦 ความคืบหน้า (mo-steps.ts)
  const cur = currentStep(steps);
  return (
    <div className="flex">
      {steps.map((st, i) => {
        const s = st.state;
        const dot = s === "done" ? "bg-emerald-500"
          : s === "skip" ? "bg-slate-300"
          : s === "na" ? "border border-dashed border-slate-300"
          : i === cur ? `border-2 border-amber-500 ${s === "part" ? "bg-amber-200" : ""}`
          : s === "part" ? "border-2 border-blue-400 bg-blue-100" : "border border-slate-300";
        const txt = s === "done" ? "text-emerald-600" : s === "skip" ? "text-slate-400 line-through" : i === cur ? "text-amber-600 font-medium" : "text-slate-400";
        return (
          <span key={st.key} title={`${st.label}: ${st.sub}`} className="flex flex-col items-center gap-0.5 w-[2.3rem] shrink-0">
            <span className={`h-2.5 w-2.5 rounded-full box-border ${dot}`} />
            <span className={`text-[10px] leading-none ${txt}`}>{st.short}</span>
          </span>
        );
      })}
    </div>
  );
}


function BoardTable({ pending, workOrders, departments, craftsmen, canEdit, canSeeMoney, deliveryPlans, onOpenMO, onOpenWO, onReload, canMoveStaff = false, onStaffChanged, catchUp = false, onExitCatchUp, cuMode = "direct", cuApprove = false, cuQueueAsk = false, onCuQueueSeen }: {
  pending: PendingMO[]; workOrders: WorkOrder[]; deliveryPlans: DeliveryPlan[];
  /** 🔄 โหมดอัปเดตงาน — ทุกแถวมีปุ่ม "อัปเดต" เปิดป๊อป CatchUpModal */
  catchUp?: boolean; onExitCatchUp?: () => void;
  /** direct = บันทึกเลย · request = ส่งให้หัวหน้ายืนยัน · cuApprove = ยืนยันคำขอของคนอื่นได้ · cuQueueAsk = เปิดคิวคำขอทันที (ลิงก์แจ้งเตือน) */
  cuMode?: "direct" | "request"; cuApprove?: boolean; cuQueueAsk?: boolean; onCuQueueSeen?: () => void;
  departments: Dept[]; craftsmen: Assignee[]; canEdit: boolean;
  /** ย้ายคนเข้า/ออกโต๊ะได้ (สิทธิ์ฝ่ายบุคคล) · ย้าย/เพิ่มแล้วให้หน้าแม่โหลดรายชื่อใหม่ */
  canMoveStaff?: boolean; onStaffChanged?: () => void | Promise<void>;
  /** เห็นราคาขาย/มูลค่า = คนที่ดูแผนผู้บริหารได้ (API ราคาล็อกสิทธิ์ admin.users ที่เซิร์ฟเวอร์อีกชั้น) */
  canSeeMoney: boolean;
  onOpenMO: (mo: PendingMO) => void; onOpenWO: (wo: WorkOrder) => void; onReload?: () => void;
}) {
  const toast = useToast();
  // ── หน้าตาตาราง: ชุด ปกติ / 👓 โหมดง่าย / กำหนดเอง (ดู ./table-display) · canSeeMoney = แอดมิน → แก้ชุดกลางได้
  const disp = useTableDisplay(canSeeMoney);
  const dc = disp.cfg;
  const wos = workOrders.filter((w) => w.status !== "done" && w.stage !== "cut");
  const [cuMo, setCuMo] = useState<string | null>(null);   // ใบที่เปิดป๊อปอัปเดตงานอยู่
  const [cuList, setCuList] = useState<string[]>([]);      // ลำดับใบของแท็บที่เปิดอยู่ (ตอนกดอัปเดต) — ไว้ไป "ใบถัดไป"
  const [cuEditMo, setCuEditMo] = useState<string | null>(null);   // ใบที่เปิดป๊อป "แก้ไข" (แก้สิ่งที่บันทึกแล้ว / ลดจำนวน)
  const [cuInitTarget, setCuInitTarget] = useState<CuTargetKey | null>(null);   // เปิดป๊อปอัปเดตมาที่ขั้นนี้เลย (ปุ่ม "บันทึกส่งคืนเพิ่ม")
  const openCu = (moNo: string) => {
    const rows = tab === "all" ? allShown.map((r) => r.mo_no)
      : tab === "pend" ? pendShown.filter((m) => hit(pendText(m))).map((m) => m.mo_no)
      : tab === "wip" ? wosShown.filter((w) => hit(woText(w))).map((w) => w.mo_no)
      : qQueue.filter((q) => hit(qcText(q))).map((q) => q.mo_no ?? "");
    setCuList([...new Set(rows.filter(Boolean))]); setCuMo(moNo);
  };
  const cuNext = cuMo ? cuList[cuList.indexOf(cuMo) + 1] ?? null : null;
  // ── คำขออัปเดตงาน (รอหัวหน้ายืนยัน): ป้ายบนแถว + คิว — โหลดตอนอยู่ในโหมด ทุก 1 นาที และทุกครั้งที่ส่ง/ยืนยัน/ตีกลับ
  const [cuReqs, setCuReqs] = useState<{ queue: CuRequest[]; mine: CuRequest[]; open: CuOpenTag[] }>({ queue: [], mine: [], open: [] });
  const [cuQueueOpen, setCuQueueOpen] = useState(false);
  const loadCuReqs = useCallback(async () => {
    try { const r = await apiFetch("/api/mo/catch-up/requests"); const j = await r.json(); if (r.ok && j?.data) setCuReqs(j.data); } catch { /* ป้ายไม่ขึ้นก็ยังอัปเดตงานได้ */ }
  }, []);
  useEffect(() => {
    if (!catchUp) return;
    void loadCuReqs();
    const t = window.setInterval(() => void loadCuReqs(), 60000);
    return () => window.clearInterval(t);
  }, [catchUp, loadCuReqs]);
  useEffect(() => { if (catchUp && cuQueueAsk) { setCuQueueOpen(true); onCuQueueSeen?.(); } }, [catchUp, cuQueueAsk, onCuQueueSeen]);
  // ── แท็บ "ทั้งหมด" (เฉพาะโหมดอัปเดตงาน): ทุกใบ + ตอนนี้ของอยู่ไหน — อัปเดตแล้วใบหลุดจากแท็บอื่น (โกดัง QC / รอปิดใบ) ก็ยังหาเจอ
  const [cuAll, setCuAll] = useState(false);
  const [cuAllRows, setCuAllRows] = useState<CuAllRow[] | null>(null);
  const [cuRecent, setCuRecent] = useState<string[]>([]);
  // ป้าย "เดิม 20" / "แยกจาก MO-…" (ประวัติเปลี่ยนจำนวน) — มากับแท็บ "ทั้งหมด"
  const cuAllMap = useMemo(() => new Map((cuAllRows ?? []).map((r) => [r.mo_no, r])), [cuAllRows]);
  // 🔄 อัปเดตเป็นชุด: ใบที่ติ๊กมา (null = ปิด) · เลือกในแท็บ "ทั้งหมด" · ป๊อปทีละใบ (เปิดแบบละเอียด) ปิดแล้ว = ให้ตารางโหลดใบนั้นใหม่
  const [cuBatch, setCuBatch] = useState<string[] | null>(null);
  const [cuAllSel, setCuAllSel] = useState<Set<string>>(new Set());
  const [cuBatchRefresh, setCuBatchRefresh] = useState<{ mo: string; n: number } | null>(null);   // ใบที่เพิ่งอัปเดตรอบนี้ (ล่าสุดก่อน)
  const loadCuAll = useCallback(async () => {
    try { const r = await apiFetch("/api/mo/catch-up/all"); const j = await r.json(); if (r.ok && Array.isArray(j?.data)) setCuAllRows(j.data as CuAllRow[]); } catch { /* แท็บว่างก็ยังใช้แท็บอื่นได้ */ }
  }, []);
  useEffect(() => { if (catchUp) void loadCuAll(); else setCuAll(false); }, [catchUp, loadCuAll]);
  const cuWaiting = cuApprove ? cuReqs.queue.filter((q) => !q.mine).length : cuReqs.mine.filter((q) => q.status === "pending" || q.status === "rejected").length;
  const skuOfMo = (mo: string) => pending.find((m) => m.mo_no === mo)?.product_sku ?? workOrders.find((w) => w.mo_no === mo)?.product_sku ?? qQueue.find((q) => q.mo_no === mo)?.sku ?? mo;
  const cuBtn = (moNo: string | null | undefined) => {
    if (!catchUp || !moNo) return null;
    const t = cuReqs.open.find((o) => o.mo_no === moNo);   // ใบนี้มีคำขอรอยืนยันอยู่
    const review = !!t && !t.mine && cuApprove;
    return (
      <span className="inline-flex shrink-0 items-center gap-1">
        {t && (
          <span title={t.status === "processing" ? "หัวหน้ากำลังบันทึก" : `ส่งโดย ${t.requested_name ?? "—"} · รอหัวหน้ายืนยัน`}
            className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 text-[11px] ${t.status === "processing" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-800"}`}>
            <Icon name="waiting" />{t.status === "processing" ? "กำลังบันทึก" : t.mine ? "รอยืนยัน" : `รอยืนยัน · ${t.requested_name ?? ""}`}
          </span>
        )}
        {(() => {
          const a = cuAllMap.get(moNo);
          // ค้างช่าง (จ่าย − คืน) · ค้างนานเกิน 14 วัน = แดง
          const out = a ? Math.round((a.dispatched - a.received) * 100) / 100 : 0;
          const days = out > 0 ? cuDaysSince(a?.out_since ?? null) : null;
          return <>
            {out > 0 && <span title={days != null ? `ช่างยังค้างส่ง ${out.toLocaleString("th-TH")} ชิ้น · ค้างมา ${days} วัน` : `ช่างยังค้างส่ง ${out.toLocaleString("th-TH")} ชิ้น`} className={`whitespace-nowrap rounded-full px-1.5 text-[11px] ${(days ?? 0) > CU_LATE_DAYS ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>ค้างช่าง {out.toLocaleString("th-TH")}</span>}
            {a?.qty_from != null && <span title="เปลี่ยนจำนวนไปแล้ว (ดูประวัติในปุ่มแก้ไข)" className="whitespace-nowrap rounded-full bg-amber-50 px-1.5 text-[11px] text-amber-800">เดิม {a.qty_from.toLocaleString("th-TH")}</span>}
            {a?.split_from && <span title={a.split_kind === "extra" ? "ใบนี้คือส่วนที่ทำเพิ่มเกินจำนวนสั่งของใบเดิม" : "ใบนี้แยกออกมาจากใบที่ลดจำนวน (ที่เหลือ รอของ)"} className="whitespace-nowrap rounded-full bg-indigo-50 px-1.5 text-[11px] text-indigo-700">{a.split_kind === "extra" ? "ทำเพิ่มจาก" : "แยกจาก"} {a.split_from}</span>}
          </>;
        })()}
        <button type="button" onClick={(e) => { e.stopPropagation(); openCu(moNo); }} title={review ? "ตรวจคำขอ แก้ได้ แล้วยืนยันหรือตีกลับ" : "บอกว่าใบนี้ไปถึงขั้นไหนแล้ว (ติ๊กขั้นก่อนหน้าให้อัตโนมัติ)"}
          className={`shrink-0 rounded-md px-2 font-medium text-white ${review ? "bg-amber-600 hover:bg-amber-700" : "bg-indigo-600 hover:bg-indigo-700"} ${touch ? "h-9 text-sm" : "h-7 text-[12px]"}`}>{review ? "ตรวจ" : "🔄 อัปเดต"}</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); setCuEditMo(moNo); }} title="แก้สิ่งที่บันทึกไปแล้ว (รวมขั้นก่อนหน้า) · ลดจำนวน"
          className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 font-medium text-slate-700 hover:bg-slate-50 ${touch ? "h-9 text-sm" : "h-7 text-[12px]"}`}><Icon name="edit" /> แก้ไข</button>
      </span>
    );
  };
  const [sel, setSel] = useState<Set<string>>(new Set());   // เลือกใบรอจ่าย (by id) → จัดกลุ่ม / แก้กำหนดเสร็จ
  // คำค้นร่วมของทั้ง 2 ตาราง — พิมพ์ที่ไหนก็กรองทั้ง "รอจ่าย" และ "จ่ายแล้ว" (เดิมต่างคนต่างค้น หาของที่จ่ายไปแล้วไม่เจอ)
  const [tableSearch, setTableSearch] = useState("");
  // ⚡ ช่องค้นหาตอบทันที · การกรองตาราง (~400 แถว) ตามมาทีหลังเมื่อเครื่องว่าง — พิมพ์รัว ๆ ไม่กระตุก
  const searchQ = useDeferredValue(tableSearch);
  // 🪟 หน้าตาของแต่ละแท็บ: ตาราง / การ์ด / ปฏิทิน (จำต่อคน ตามไปทุกเครื่อง) · รอจ่าย "auto" = ตามมุมมองด่วนที่เลือก
  type TabLayout = "auto" | "table" | "cards" | "cal";
  const [tabLayout, setTabLayoutPref] = useUserPref<Record<"pend" | "wip" | "qc", TabLayout>>("wb_tab_layout", { pend: "auto", wip: "table", qc: "table" }, (raw) => {
    if (!raw || typeof raw !== "object") return null;
    const o = raw as Record<string, unknown>;
    const ok = (v: unknown, d: TabLayout): TabLayout => (v === "auto" || v === "table" || v === "cards" || v === "cal" ? v : d);
    return { pend: ok(o.pend, "auto"), wip: ok(o.wip, "table"), qc: ok(o.qc, "table") };
  });
  const setTabLayout = (t: "pend" | "wip" | "qc", v: TabLayout) => setTabLayoutPref({ ...tabLayout, [t]: v });
  const [wipCalDate, setWipCalDate] = useUserPref<"dispatch" | "due">("wb_wip_cal_date", "dispatch", (r) => (r === "dispatch" || r === "due" ? r : null));
  const [assignOpen, setAssignOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);
  const [dueVal, setDueVal] = useState("");
  const [dueField, setDueField] = useState<"due" | "internal">("due");   // แก้วันไหน: นัดส่งลูกค้า / ส่งงานภายใน
  // 🚚 จ่ายงานตามที่ติ๊ก (จ่ายทีเดียวหลายใบเข้าโต๊ะเดียวกัน)
  const [dispOpen, setDispOpen] = useState(false);
  const [dispDeptId, setDispDeptId] = useState("");
  const [deskPanel, setDeskPanel] = useState(false);   // 👥 แผงจัดคนในโต๊ะ (ในป๊อปจ่ายงาน)
  const [dispCrew, setDispCrew] = useState<string[]>([]);   // 👥 คนรับงาน (หลายคนได้ · ว่าง = ทั้งโต๊ะ/จำไม่ได้ว่าใคร)
  const [dispDue2, setDispDue2] = useState("");
  const [dispDate2, setDispDate2] = useState<string | null>(todayLocal());   // วันที่จ่ายงาน (ตั้งต้น = วันนี้ · null = จำไม่ได้)
  const [dispRate, setDispRate] = useState("");                       // ช่อง "ใส่ให้ทุกใบ" (ตัวช่วย)
  const [dispRateBy, setDispRateBy] = useState<Record<string, string>>({});   // ค่าแรง/ชิ้น รายใบ (ตั้งต้นจากสูตรของสินค้านั้น)
  const [dispQtyBy, setDispQtyBy] = useState<Record<string, string>>({});     // จำนวนที่จ่ายรายใบ (ว่าง = ที่เหลือทั้งหมด · 0 = ไม่จ่ายใบนี้)
  const [dispLines, setDispLines] = useState<DispLine[]>([]);                  // ใบเดียว = แถวจ่าย (เลือกจำนวน / แบ่งหลายคน) ./dispatch-lines
  const [dispBusy, setDispBusy] = useState(false);
  const [dispMsg, setDispMsg] = useState("");
  // 📷 สแกนหาใบงาน (บาร์โค้ดเส้น / QR บนใบสั่งงาน) — เครื่องยิง USB ยิงได้เลย · ปุ่ม "สแกน" = กล้อง
  const [scanOpen, setScanOpen] = useState(false);
  const [scanHit, setScanHit] = useState<{ moNo: string; sku: string | null; name: string | null; where: string; pendId: string | null; remaining: number } | null>(null);
  // 💰 ใส่ค่าแรงให้ใบจ่ายงานหลายใบพร้อมกัน (ตารางล่าง)
  const [woSel, setWoSel] = useState<Set<string>>(new Set());
  const [woLaborOpen, setWoLaborOpen] = useState(false);
  const [woLaborRate, setWoLaborRate] = useState("");
  const [woLaborSaving, setWoLaborSaving] = useState(false);
  // 📤 ส่งงานเข้า QC หลายใบพร้อมกัน (จากใบที่ติ๊กไว้ในตาราง "จ่ายแล้ว")
  const [qcOpen, setQcOpen] = useState(false);
  const [qcDate, setQcDate] = useState(todayLocal());                       // วันที่ส่งงาน (ตั้งต้น = วันนี้ · ลงย้อนหลังได้)
  const [qcRows, setQcRows] = useState<Record<string, { qty: string; wage: string }>>({});
  const [qcBusy, setQcBusy] = useState(false);
  const [qcMsg, setQcMsg] = useState("");
  // 📥 section "รับเข้า QC" — งานที่ช่างส่งมาแล้ว รอ QC ดึงเข้าชั้น (คิวเดียวกับหน้าโกดัง QC)
  const [qQueue, setQQueue] = useState<QcQueueRow[]>([]);
  const [qShelves, setQShelves] = useState<{ id: string; name: string; kind: string }[]>([]);
  const [qReasons, setQReasons] = useState<{ id: string; name: string }[]>([]);
  const [qcSectionOn, setQcSectionOn] = useState(true);     // ไม่มีสิทธิ์ดู QC → ซ่อน section ไปเลย
  const [qSel, setQSel] = useState<Set<string>>(new Set());
  const [recvOpen, setRecvOpen] = useState(false);
  const [recvShelf, setRecvShelf] = useState("");
  const [recvRows, setRecvRows] = useState<Record<string, { good: string; bad: string; reason: string }>>({});
  const [recvBusy, setRecvBusy] = useState(false);
  const [recvMsg, setRecvMsg] = useState("");

  const loadQcQueue = useCallback(async () => {
    try {
      const r = await apiFetch("/api/qc-warehouse?only=queue");   // only=queue = เอาเฉพาะคิว+ชั้น+สาเหตุ (ไม่ลากของทั้งโกดังมา)
      if (!r.ok) { setQcSectionOn(false); return; }               // 401 = ไม่มีสิทธิ์ qc.view → ซ่อนเงียบ ๆ
      const j = await r.json();
      if (j?.error) { setQcSectionOn(false); return; }
      setQQueue((j.queue ?? []) as QcQueueRow[]);
      setQShelves(((j.shelves ?? []) as { id: string; name: string; kind: string }[]).filter((x) => x.kind !== "defect"));
      setQReasons((j.reasons ?? []) as { id: string; name: string }[]);
    } catch { /* เงียบ — section แค่ไม่มีข้อมูล */ }
  }, []);
  useEffect(() => { void loadQcQueue(); }, [loadQcQueue]);
  const [dueSaving, setDueSaving] = useState(false);
  const selMoNos = pending.filter((m) => sel.has(m.id)).map((m) => m.mo_no);
  // กดช่องไหน = กางแท็บของช่องนั้น (ซื้อของ → BOM · สินค้า → รายละเอียดงาน · กำหนดส่ง → แก้วัน/งวดส่ง …) · กดช่องเดิมซ้ำ = พับ
  //   ถ้ากำลังเลือกอยู่ (มีติ๊กแล้ว) → กดแถว/ช่อง = สลับติ๊ก (แบบ Gmail) · ชุดหน้าตาปิด "แตะแถวกาง" → กด = เปิดเช็กลิสต์ (แบบเดิม)
  const toggleSel = useCallback((id: string) => setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
  const [openPane, setOpenPane] = useState<Record<string, PendPane>>({});
  const [detailPrefs, setDetailPrefs] = useUserPref("wb_pend_detail_prefs", DETAIL_PREFS_DEFAULT, parseDetailPrefs); // ปุ่ม/กล่องที่ซ่อนในรายละเอียดงาน (ต่อคน)
  const expanded = useMemo(() => new Set(Object.keys(openPane)), [openPane]);
  const showPane = useCallback((id: string, pane: PendPane | null) => setOpenPane((prev) => {
    const n = { ...prev };
    if (pane === null || prev[id] === pane) delete n[id]; else n[id] = pane;
    return n;
  }), []);
  const onPendRow = useCallback((m: PendingMO) => {
    if (sel.size > 0) toggleSel(m.id);
    else if (!dc.expand) onOpenMO(m);
    else showPane(m.id, openPane[m.id] ? null : "job");   // กดช่องว่างระหว่างช่อง = เปิด/พับ แท็บรายละเอียดงาน
  }, [sel.size, toggleSel, dc.expand, onOpenMO, showPane, openPane]);
  const onPendCell = useCallback((m: PendingMO, colKey: string) => {
    if (sel.size > 0) { toggleSel(m.id); return; }
    if (!dc.expand) { onOpenMO(m); return; }
    const pane = CELL_PANE[colKey];
    if (pane) showPane(m.id, pane);
  }, [sel.size, toggleSel, dc.expand, onOpenMO, showPane]);
  // ช่อง "ซื้อของ" + จุดขั้นตอน — ความคืบหน้าการซื้อทุกใบในคำขอเดียว (กติกาเดียวกับหน้าขอซื้อ → ตัวเลขตรงกัน)
  const [prog, setProg] = useState<MoProgressResult | null>(null);
  const [progTick, setProgTick] = useState(0);   // บังคับโหลดใหม่ (เช่น หลังแอดมินข้าม/เอาคืนขั้นซื้อของ)
  const pendKey = pending.map((m) => m.mo_no).join(",");
  useEffect(() => {
    let cancel = false;
    void (async () => {
      try { const r = await apiFetch("/api/mo/material-progress"); const j = await r.json(); if (!cancel) setProg((j.data ?? {}) as MoProgressResult); }
      catch { if (!cancel) setProg((p) => p ?? {}); }
    })();
    return () => { cancel = true; };
  }, [pendKey, progTick]);
  // รับงานคืนแล้วเท่าไหร่ต่อใบ (รวมจากใบจ่ายงานทุกใบของใบสั่งผลิตนั้น)
  const recvByMo = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of workOrders) m.set(w.mo_no, (m.get(w.mo_no) ?? 0) + (Number(w.received_qty) || 0));
    return m;
  }, [workOrders]);
  // รูปเล็ก/ใหญ่ — จำต่อคน (ข้ามเครื่อง)
  const imgPref = useViewPref("wb_table_img", ["s", "l"] as const, "s");
  const imgBig = imgPref.view === "l";
  const toggleImg = () => { const v = imgBig ? "s" : "l"; imgPref.setView(v); void imgPref.saveDefault(v); };

  // ── มุมมองอุปกรณ์: 💻 คอม · 📱 iPad แนวนอน (ตารางแถวใหญ่) · 📱 iPad แนวตั้ง (การ์ด) — จำ "ต่อเครื่อง" (คนเดียวใช้คอม+iPad คนละแบบได้)
  //   iPad แนวนอนกว้างเกิน 1024px ระบบเดาจากความกว้างไม่ได้ → ให้เลือกเอง · อยู่โหมด iPad แล้วหมุนเครื่อง = สลับแนวให้เอง
  const [dev, setDevState] = useState<"pc" | "ipadL" | "ipadP">("pc");
  useEffect(() => {
    try {
      const v = localStorage.getItem("wb_table_device");
      if (v === "pc" || v === "ipadL" || v === "ipadP") setDevState(v);
      // ยังไม่เคยเลือก + เครื่องจอสัมผัส (iPad) → เปิดโหมด iPad ตามแนวเครื่องให้ก่อน (ยังไม่จำ จนกว่าจะกดเลือกเอง)
      else if (window.matchMedia("(pointer: coarse)").matches) setDevState(window.matchMedia("(orientation: portrait)").matches ? "ipadP" : "ipadL");
    } catch { /* ignore */ }
  }, []);
  const setDev = useCallback((v: "pc" | "ipadL" | "ipadP") => { setDevState(v); try { localStorage.setItem("wb_table_device", v); } catch { /* ignore */ } }, []);
  const touch = dev !== "pc";
  useEffect(() => {
    if (!touch) return;
    const mq = window.matchMedia("(orientation: portrait)");
    const onTurn = () => setDev(mq.matches ? "ipadP" : "ipadL");
    mq.addEventListener("change", onTurn);
    return () => mq.removeEventListener("change", onTurn);
  }, [touch, setDev]);
  // หน้าในกรอบพรีวิว (iframe) กดสลับมุมมอง → ค่าในเครื่องเปลี่ยน → หน้านอกเปลี่ยนตาม (storage event ข้าม iframe โดเมนเดียวกัน)
  useEffect(() => {
    const onStore = (e: StorageEvent) => { if (e.key === "wb_table_device" && (e.newValue === "pc" || e.newValue === "ipadL" || e.newValue === "ipadP")) setDevState(e.newValue); };
    window.addEventListener("storage", onStore);
    return () => window.removeEventListener("storage", onStore);
  }, []);
  // บนคอม: เลือกโหมด iPad = เปิด "ของจริง" ในกรอบ iPad ขนาดจริง (โหลดหน้านี้ใน iframe) · บน iPad จริง / หน้าที่อยู่ในกรอบแล้ว = เรนเดอร์ตรง ๆ
  const canPreview = useCanPreviewDevice();
  const framePreview = touch && canPreview;

  // ── ราคาขาย/มูลค่า — ราคาชุดเดียวกับแผนผู้บริหาร (skus_v2.list_price) · โหลดเฉพาะคนที่มีสิทธิ์
  const [priceByMo, setPriceByMo] = useState<Map<string, { price: number; oem: boolean }> | null>(null);
  useEffect(() => {
    if (!canSeeMoney) return;
    let cancel = false;
    void (async () => {
      try {
        const r = await apiFetch("/api/mo/exec-plan"); const j = await r.json();
        if (!cancel) setPriceByMo(new Map(((j.rows ?? []) as ExecRow[]).map((x) => [x.mo_no, { price: Number(x.list_price) || 0, oem: !!x.brand_oem }])));
      } catch { if (!cancel) setPriceByMo(new Map()); }
    })();
    return () => { cancel = true; };
  }, [canSeeMoney, pendKey]);
  const priceOf = (m: PendingMO) => priceByMo?.get(m.mo_no)?.price ?? 0;
  const priceOk = (m: PendingMO) => priceOf(m) >= PRICE_MIN;
  const valueOf = (m: PendingMO, part: "all" | "rem") => (priceOk(m) ? priceOf(m) * (part === "all" ? m.qty : m.remaining) : 0);

  // ── ปุ่มกรองด่วน (กรองก่อนส่งเข้าตาราง)
  const today = todayLocal();
  const isLate = (m: PendingMO) => [m.due_date, m.internal_due_date].some((d) => !!d && d.slice(0, 10) < today);
  const isShort = (m: PendingMO) => { const p = prog?.[m.mo_no]; return !!p && p.buy + p.requested + p.ordered > 0; };
  // ── มุมมองด่วน (ปุ่มบนแถบ — กติกาที่ ./quick-views · ตั้งค่าในแผง 🎛 หน้าตา) + ชิปแบรนด์เสริม — จำต่อคน ตามไปทุกเครื่อง
  const [filt, setFilt] = useUserPref<{ view: string; brand: string }>("wb_table_filters", { view: "", brand: "" }, (v) => {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    return { view: typeof o.view === "string" ? o.view : "", brand: typeof o.brand === "string" ? o.brand : "" };
  });
  const brandF = filt.brand;   // "" = ทุกแบรนด์ · "__none__" = ใบที่ไม่ระบุแบรนด์
  const setBrandF = (b: string) => setFilt({ ...filt, brand: brandF === b ? "" : b });
  const brandOk = (b: string | null | undefined) => !brandF || (brandF === "__none__" ? !b : b === brandF);
  // มุมมองทีม (แอดมินตั้ง · กรอง "ใครเห็น" + ที่ฉันซ่อน) ต่อด้วยมุมมองของฉัน — ที่เก็บ ./use-quick-views
  const qvStore = useQuickViews(canSeeMoney);
  const { user: authUser } = useAuth();
  // ลำดับปุ่มบนแถบ = ลำดับเฉพาะตัว (ลากสลับ/เมนูลัด) ทับลำดับของแอดมิน
  const views = qvApplyOrder(qvVisible([...qvStore.team.filter((v) => qvAudienceOk(v, authUser) && !qvStore.mine.hidden.includes(v.id)), ...qvStore.mine.views], canSeeMoney), qvStore.mine.order);
  const mineRef = useRef(qvStore.mine);   // ค่าล่าสุดสำหรับปุ่ม "ย้อนกลับ" ที่กดทีหลัง (กันใช้ค่าเก่าในปิด)
  mineRef.current = qvStore.mine;
  // ⚙️ ป๊อปตั้งค่ามุมมอง (4 แท็บ · แก้ในร่าง → 💾 บันทึกทีเดียว) · tab = เปิดมาที่แท็บนี้ (ไม่ส่ง = แท็บล่าสุด)
  //   ＋ บันทึกเป็นมุมมอง = เปิดป๊อปพร้อมมุมมองของฉันใหม่ในร่าง · previewView = มุมมองที่กำลังแก้ในป๊อป → ตารางโชว์ตามทันที
  const [mgr, setMgr] = useState<{ open: boolean; tab?: VsTab; newMine?: QuickView | null; sel?: { kind: "team" | "mine"; id: string } }>({ open: false });
  const [previewView, setPreviewView] = useState<QuickView | null>(null);
  // ซ่อนแถบมุมมอง = ใช้มุมมองแรกเสมอ (ไม่ให้ค้างกรองอยู่โดยมองไม่เห็นปุ่ม)
  const baseView: QuickView = (dc.show.chips ? views.find((v) => v.id === filt.view) : undefined) ?? views[0] ?? QV_FALLBACK;
  const view: QuickView = (mgr.open && previewView) || baseView;
  const pickView = (id: string) => { setFilt({ ...filt, view: id }); if (tabLayout.pend !== "auto") setTabLayout("pend", "auto"); };
  const lateDays = (m: PendingMO) => Math.max(0, ...[m.due_date, m.internal_due_date].filter((d): d is string => !!d).map((d) => ymdDiff(d.slice(0, 10), today)));
  const nearDue = (m: PendingMO) => [m.due_date, m.internal_due_date].filter((d): d is string => !!d).sort()[0] ?? "9999";
  // ค่าที่มุมมองใช้กรอง/เรียง ต่อใบ (คิดครั้งเดียวต่อรอบข้อมูล)
  const qvRowOf = (m: PendingMO): QvRow => {
    const p = prog?.[m.mo_no];
    const near = [m.due_date, m.internal_due_date].filter((d): d is string => !!d).map((d) => d.slice(0, 10)).sort()[0];
    const st = stageOf(m, p);
    return {
      brand: m.brand, oem: !!m.brand_oem, late: lateDays(m), dueIn: near ? ymdDiff(today, near) : null,
      flag: m.priority ?? 0, short: isShort(m), ready: st === "ready",
      noprice: canSeeMoney && priceByMo !== null ? !priceOk(m) : null,
      age: m.created_at ? Math.max(0, ymdDiff(m.created_at.slice(0, 10), today)) : 0,
      stage: STAGE_META[st][1], buy: p ? p.buy + p.requested : 0,
      left: m.remaining, value: canSeeMoney ? valueOf(m, "all") : 0, sku: m.product_sku ?? "",
    };
  };
  const qvRowMap = useMemo(() => new Map(pending.map((m) => [m.id, qvRowOf(m)])), [pending, prog, priceByMo, canSeeMoney, today]);   // eslint-disable-line react-hooks/exhaustive-deps
  const rowQ = (m: PendingMO) => qvRowMap.get(m.id) ?? qvRowOf(m);
  const viewCount = (v: QuickView) => pending.filter((m) => qvMatch(v, rowQ(m))).length;
  const pendShown = (() => {
    // แท็บรอจ่ายกรองแบรนด์ผ่านมุมมองอย่างเดียว (เจ้าของสั่งเอาชิปแบรนด์ออก 2026-10-28) — ชิปแบรนด์เหลือแท็บกำลังผลิต
    const rows = pending.filter((m) => qvMatch(view, rowQ(m)));
    if (view.sort1 !== "none" || view.sort2 !== "none") return qvSort(rows, rowQ, view);
    // มุมมองไม่ได้ตั้งเรียง → ใช้ "ค่าเริ่มต้นตอนเปิด" ของชุดหน้าตา (กดหัวตารางเรียงทับได้)
    if (dc.sortDef === "urgent") return [...rows].sort((a, b) => lateDays(b) - lateDays(a) || (b.priority ?? 0) - (a.priority ?? 0)
      || STAGE_META[stageOf(a, prog?.[a.mo_no])][1] - STAGE_META[stageOf(b, prog?.[b.mo_no])][1] || nearDue(a).localeCompare(nearDue(b)));
    if (dc.sortDef === "old") return [...rows].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
    if (dc.sortDef === "value" && canSeeMoney) return [...rows].sort((a, b) => valueOf(b, "all") - valueOf(a, "all"));
    return rows;
  })();
  // แบรนด์ในใบรอจ่าย (สี + OEM + จำนวน) — ใช้ทั้งจุดสีบนปุ่มมุมมอง และตัวเลือกแบรนด์ในแผงตั้งค่า
  const qvBrands: QvBrand[] = (() => {
    const m = new Map<string, QvBrand>();
    for (const x of pending) { const k = x.brand ?? ""; const e = m.get(k) ?? { name: k, color: x.brand_color ?? null, oem: !!x.brand_oem, n: 0 }; e.n += 1; m.set(k, e); }
    return [...m.values()].sort((a, b) => (a.name === "" ? 1 : b.name === "" ? -1 : b.n - a.n));
  })();
  const brandColorOf = (b: string) => qvBrands.find((x) => (x.name || "__none__") === b)?.color ?? "#94a3b8";
  const saveViews = async (next: { team?: TeamView[]; mine?: QvMine }) => {
    if (next.team && !(await qvStore.saveTeam(next.team))) return false;
    if (next.mine) qvStore.setMine(next.mine);
    // บันทึกแล้ว ตารางค้างที่มุมมองที่เพิ่งแก้ (ถ้าคนนี้ยังเห็นปุ่มนั้น) — ปิดป๊อปแล้วไม่เด้งกลับมุมมองเดิม
    const pv = previewView;
    const team = next.team ?? qvStore.team, mineNext = next.mine ?? qvStore.mine;
    const seen = !!pv && (mineNext.views.some((v) => v.id === pv.id)
      || team.some((v) => v.id === pv.id && qvAudienceOk(v, authUser) && !mineNext.hidden.includes(v.id)));
    if (pv && seen) setFilt({ view: pv.id, brand: mgr.newMine?.id === pv.id ? "" : filt.brand });
    return true;   // แจ้ง + ปุ่มย้อนกลับ = ป๊อปเป็นคนแสดง
  };
  // ---- เมนูลัดของปุ่มมุมมอง (คลิกขวา / กดค้าง) ----
  const [chipMenu, setChipMenu] = useState<QuickView | null>(null);
  const chipMenuAnchor = useRef<HTMLElement | null>(null);
  const openChipMenu = (v: QuickView, el: HTMLElement) => { chipMenuAnchor.current = el; setChipMenu(v); };
  const kindOf = (id: string): "team" | "mine" => (qvStore.mine.views.some((x) => x.id === id) ? "mine" : "team");
  const copyAsMine = (v: QuickView, p: Partial<QuickView> = {}) => qvNew({
    name: `${v.name} (ของฉัน)`, icon: v.icon, own: v.own, mode: v.mode, conds: [...v.conds], brands: [...v.brands], layout: v.layout, size: v.size,
    cols: v.cols ? [...v.cols] : null, cardFields: [...v.cardFields], sort1: v.sort1, dir1: v.dir1, sort2: v.sort2, dir2: v.dir2, group: v.group,
    widths: { ...v.widths }, fit: v.fit, ...p,
  });
  const setOrder = (ids: string[]) => qvStore.setMine({ ...mineRef.current, order: ids });
  const moveChip = (fromId: string, toId: string) => { const ids = views.map((x) => x.id); setOrder(qvMoveOrder(ids, fromId, ids.indexOf(toId))); };
  const viewLink = (id: string) => `${window.location.origin}/master/work-board?view=table&qv=${encodeURIComponent(id)}`;
  const chipAction = async (act: "edit" | "copy" | "link" | "left" | "right" | "hide" | "del", v: QuickView) => {
    setChipMenu(null);
    if (act === "edit") { setMgr({ open: true, tab: "views", sel: { kind: kindOf(v.id), id: v.id } }); return; }
    if (act === "copy") { setMgr({ open: true, tab: "views", newMine: copyAsMine(v) }); return; }
    if (act === "link") { const ok = await copyText(viewLink(v.id)); toast[ok ? "success" : "error"](ok ? `คัดลอกลิงก์ “${v.name}” แล้ว — ส่งทาง LINE ได้ (คนที่เปิดต้องเห็นมุมมองนี้ด้วย)` : "คัดลอกไม่สำเร็จ"); return; }
    if (act === "left" || act === "right") { setOrder(qvMoveOrder(views.map((x) => x.id), v.id, { dir: act === "left" ? -1 : 1 })); return; }
    if (act === "hide") {
      qvStore.setMine({ ...mineRef.current, hidden: [...mineRef.current.hidden.filter((x) => x !== v.id), v.id] });
      toast.action(`ซ่อนปุ่ม “${v.name}” แล้ว (เฉพาะคุณ)`, "ย้อนกลับ", () => qvStore.setMine({ ...mineRef.current, hidden: mineRef.current.hidden.filter((x) => x !== v.id) }), { variant: "info" });
      return;
    }
    const old = mineRef.current.views.find((x) => x.id === v.id);
    const at = mineRef.current.views.findIndex((x) => x.id === v.id);
    if (!old) return;
    qvStore.setMine({ ...mineRef.current, views: mineRef.current.views.filter((x) => x.id !== v.id) });
    toast.action(`ลบมุมมอง “${v.name}” แล้ว`, "ย้อนกลับ", () => {
      const vs = [...mineRef.current.views];
      vs.splice(Math.min(at, vs.length), 0, old);
      qvStore.setMine({ ...mineRef.current, views: vs });
    }, { variant: "info" });
  };
  // ลิงก์ ?qv=<id> (ส่งให้เพื่อน) → เปิดบอร์ดที่มุมมองนั้น (ครั้งเดียวหลังโหลดมุมมองทีมเสร็จ)
  const qvLinkDone = useRef(false);
  useEffect(() => {
    if (qvLinkDone.current || !qvStore.teamLoaded) return;
    qvLinkDone.current = true;
    const id = new URLSearchParams(window.location.search).get("qv");
    if (!id) return;
    if (views.some((x) => x.id === id)) { setFilt({ view: id, brand: "" }); pickTab("pend"); }
    else toast.warning("มุมมองในลิงก์นี้คุณยังไม่เห็น (อาจตั้งให้เฉพาะบางคน หรือถูกซ่อน/ลบไปแล้ว)");
  }, [qvStore.teamLoaded]);   // eslint-disable-line react-hooks/exhaustive-deps
  const saveAsView = () => {
    const v = copyAsMine(view);
    setMgr({ open: true, tab: "views", newMine: v });
  };
  // ความกว้างคอลัมน์ของมุมมอง: ลากในตาราง = ร่าง (มีแถบให้กดบันทึก) · มุมมองของฉัน = เก็บในมุมมอง · มุมมองทีม = แอดมินเก็บให้ทุกคน / คนอื่นเก็บเฉพาะตัว
  const isMineView = qvStore.mine.views.some((v) => v.id === view.id);
  // + คอลัมน์ของมุมมอง (เมนู ⋮ ที่หัวคอลัมน์: ย้าย/ซ่อน) = ร่างเดียวกัน → แถบเหลืองให้กดบันทึก
  const savedWidths = isMineView ? view.widths : (qvStore.mine.widthOverride[view.id] ?? view.widths);
  const savedCols = isMineView ? view.cols : (qvStore.mine.colsOverride[view.id] ?? view.cols);
  const [widthDraft, setWidthDraft] = useState<Record<string, number> | null>(null);
  const [colsDraft, setColsDraft] = useState<string[] | null>(null);
  useEffect(() => { setWidthDraft(null); setColsDraft(null); }, [view.id]);
  const effWidths = widthDraft ?? savedWidths;
  const effCols = colsDraft ?? savedCols;
  const widthDirty = widthDraft !== null && JSON.stringify(widthDraft) !== JSON.stringify(savedWidths);
  const colsDirty = colsDraft !== null && JSON.stringify(colsDraft) !== JSON.stringify(savedCols);
  const layoutDirty = widthDirty || colsDirty;
  const discardLayout = () => { setWidthDraft(null); setColsDraft(null); };
  const saveLayout = async (scope: "view" | "me") => {
    if (!layoutDirty) return;
    const w = widthDirty && widthDraft ? widthDraft : savedWidths;
    const cols = colsDirty ? colsDraft : savedCols;
    const patch = <V extends QuickView>(v: V): V => ({ ...v, widths: w, cols });
    if (isMineView) qvStore.setMine({ ...qvStore.mine, views: qvStore.mine.views.map((v) => (v.id === view.id ? patch(v) : v)) });
    else if (scope === "view" && canSeeMoney) {
      if (!(await qvStore.saveTeam(qvStore.team.map((v) => (v.id === view.id ? patch(v) : v))))) return;
      if (qvStore.mine.widthOverride[view.id] || qvStore.mine.colsOverride[view.id]) {
        const wo = { ...qvStore.mine.widthOverride }; delete wo[view.id];
        const co = { ...qvStore.mine.colsOverride }; delete co[view.id];
        qvStore.setMine({ ...qvStore.mine, widthOverride: wo, colsOverride: co });
      }
    } else qvStore.setMine({
      ...qvStore.mine,
      widthOverride: widthDirty ? { ...qvStore.mine.widthOverride, [view.id]: w } : qvStore.mine.widthOverride,
      colsOverride: colsDirty && cols ? { ...qvStore.mine.colsOverride, [view.id]: cols } : qvStore.mine.colsOverride,
    });
    discardLayout();
    toast.success(scope === "view" && !isMineView ? `บันทึกคอลัมน์ในมุมมอง “${view.name}” แล้ว (ทุกคนที่เห็น)` : `บันทึกคอลัมน์ของ “${view.name}” แล้ว`);
  };
  // ปิดช่องติ๊กในชุดหน้าตา → ล้างที่เลือกค้างไว้ (ปุ่มทำหลายใบจะได้ไม่โผล่)
  useEffect(() => { if (!dc.check) { setSel(new Set()); setWoSel(new Set()); setQSel(new Set()); setCuAllSel(new Set()); } }, [dc.check]);
  const applyDue = useCallback(async () => {
    const ids = pending.filter((m) => sel.has(m.id)).map((m) => m.id);
    if (!ids.length) return;
    setDueSaving(true);
    try {
      const r = await apiFetch("/api/mo/bulk-due-date", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, due_date: dueVal || null, field: dueField }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast.success(`${dueField === "due" ? "แก้วันนัดส่งลูกค้า" : "แก้วันส่งงานภายใน"}แล้ว ${j.updated} ใบ${j.cascaded ? ` (ใบจ่ายงานขยับตาม ${j.cascaded} ใบ)` : ""}`);
      setDueOpen(false); setSel(new Set()); onReload?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setDueSaving(false); }
  }, [pending, sel, dueVal, dueField, toast, onReload]);

  /**
   * จ่ายงานทุกใบที่ติ๊กไว้ เข้าโต๊ะ/ช่างเดียวกัน — จำนวน = "เหลือ" ของแต่ละใบ
   * (ยิง /api/mo/work-orders ตัวเดิม เลข WO / แจ้งเตือน / ย้ายวัตถุดิบเข้า WIP ทำฝั่งเซิร์ฟเวอร์)
   * ค่าแรงเว้นว่างได้ — เซิร์ฟเวอร์จะเติมจากค่าแรง/ชิ้นของใบสั่งผลิตหรือราคากลาง BOM ให้เอง
   */
  const selPend = pending.filter((m) => sel.has(m.id));

  // ── แก้ค่าในตารางได้เลย (ดับเบิลคลิกที่ช่อง) ──
  const saveMoDate = useCallback(async (id: string, field: "due" | "internal", value: string) => {
    const body = field === "due" ? { id, due_date: value || null } : { id, internal_due_date: value || null };
    const r = await apiSave(toast, "/api/mo/set-due-date", { method: "POST", body },
      { ok: field === "due" ? "บันทึกวันส่งลูกค้าแล้ว" : "บันทึกวันส่งภายในแล้ว", fail: "บันทึกวันไม่สำเร็จ" });
    if (r.ok) onReload?.();
  }, [toast, onReload]);

  /** ค่าแรง/ชิ้น ของใบสั่งผลิต — เก็บเป็นยอดรวม (est_labor_cost = ต่อชิ้น × จำนวนทั้งใบ) */
  const saveMoRate = useCallback(async (m: PendingMO, value: string) => {
    const per = value.trim() === "" ? null : Number(value) || 0;
    const total = per == null ? null : Math.round(per * (m.qty || 0) * 100) / 100;
    const r = await apiSave(toast, "/api/mo/est-labor", { method: "POST", body: { mo_id: m.id, est_labor_cost: total } },
      { ok: per == null ? "ล้างค่าแรงแล้ว" : `ใส่ค่าแรง ฿${fmt(per)}/ชิ้น แล้ว`, fail: "บันทึกค่าแรงไม่สำเร็จ" });
    if (r.ok) onReload?.();
  }, [toast, onReload]);

  /** ค่าแรง/ชิ้นที่ใช้อยู่ของใบนั้น (ราคากลางจาก BOM ก่อน ถ้าไม่มีใช้ค่าที่วางแผนไว้ ÷ จำนวน) */
  const rateOf = (m: PendingMO) => (m.central_rate && m.central_rate > 0)
    ? m.central_rate
    : (m.qty > 0 && m.labor?.prod_plan ? Math.round((m.labor.prod_plan / m.qty) * 100) / 100 : 0);
  const dispatchSelected = useCallback(async () => {
    const dept = departments.find((d) => d.id === dispDeptId);
    if (!dept) { toast.error("เลือกโต๊ะ/แผนกก่อน"); return; }
    // จำนวนต่อใบ: ว่าง = ที่เหลือทั้งหมด · 0 = ไม่จ่ายใบนี้ · เกินที่เหลือ = ห้าม (ที่ไม่ได้จ่าย = ค้างรอจ่าย)
    const qtyOf = (m: PendingMO) => { const v = dispQtyBy[m.id]; return v == null || v.trim() === "" ? m.remaining : Math.max(0, Number(v) || 0); };
    const list = pending.filter((m) => sel.has(m.id) && m.remaining > 0 && qtyOf(m) > 0);
    if (!list.length) { toast.error("ใบที่ติ๊กไว้ไม่มีจำนวนให้จ่าย"); return; }
    const over = list.find((m) => qtyOf(m) > m.remaining + 0.0001);
    if (over) { toast.error(`${over.product_sku ?? over.mo_no}: จ่ายได้ไม่เกิน ${fmt(over.remaining)} ชิ้น`); return; }
    const hire = isHireDesk(dept.name);
    const crew = crewList(dispCrew, hire ? craftsmen : craftsmen.filter((c) => c.department_id === dept.id));
    // งานเหมา = ต้องระบุคน (กฎเดียวกับป๊อปจ่ายงานปกติ)
    if (hire && !crew.length) { toast.error("งานเหมา ต้องเลือกช่างก่อน"); return; }
    const who = crewFields(crew, dept.name);
    const rateFor = (m: PendingMO) => {
      const v = dispRateBy[m.id];
      if (v == null || v.trim() === "") return 0;
      return Number(v) || 0;
    };

    setDispBusy(true);
    let ok = 0; const fails: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      setDispMsg(`กำลังจ่าย ${i + 1}/${list.length} · ${m.product_sku ?? m.mo_no}`);
      try {
        const res = await apiFetch("/api/mo/work-orders", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mo_no: m.mo_no, product_sku: m.product_sku, product_name: m.product_name,
            stage: stageOfDept(dept.name), department_id: dept.id, department_name: dept.name,
            ...who,
            qty: qtyOf(m), uom: "ชิ้น", dispatch_date: dispDate2 === null ? null : (dispDate2 || todayLocal()),
            due_date: dispDue2 || m.internal_due_date || m.due_date || null,
            note: `จากใบสั่งผลิต ${m.mo_no}`,
            // ค่าแรงรายใบ (0 = ไม่ส่ง → เซิร์ฟเวอร์เติมจากใบสั่งผลิต/ราคากลางในสูตรให้เอง)
            labor_cost: rateFor(m) > 0 ? Math.round(rateFor(m) * qtyOf(m) * 100) / 100 : undefined,
          }) });
        const j = await res.json();
        if (!res.ok || j?.error) throw new Error(j?.error || "จ่ายไม่สำเร็จ");
        ok += 1;
      } catch (e) { fails.push(`${m.product_sku ?? m.mo_no}: ${e instanceof Error ? e.message : "ไม่สำเร็จ"}`); }
    }
    setDispBusy(false); setDispMsg("");
    if (ok > 0) toast.success(`จ่ายเข้า ${dept.name}${crew.length ? ` · ${who.assignee_name}` : ""} แล้ว ${ok} ใบ`);
    if (fails.length) toast.error(`ไม่สำเร็จ ${fails.length} ใบ — ${fails[0]}`);
    if (ok > 0) { setDispOpen(false); setSel(new Set()); onReload?.(); }
  }, [pending, sel, departments, craftsmen, dispDeptId, dispCrew, dispDate2, dispDue2, dispRateBy, dispQtyBy, toast, onReload]);

  // จ่ายงานใบเดียวแบบแถว (เลือกจำนวน / แบ่งหลายคน) — 1 แถว = 1 ใบจ่าย · ทีละแถว (แถวไหนพัง แถวอื่นต่อ · แถวที่พังค้างไว้ให้ลองใหม่)
  const dispatchLines = useCallback(async () => {
    const m = pending.find((x) => sel.has(x.id) && x.remaining > 0);
    if (!m) { toast.error("ใบนี้ไม่มีจำนวนคงเหลือให้จ่าย"); return; }
    const chk = dispLinesCheck(dispLines, m.remaining, departments);
    if (chk.errors.length) { toast.error(chk.errors[0]); return; }
    const rows = dispLines.filter((l) => l.qty > 0);
    setDispBusy(true);
    const done: string[] = [], fails: string[] = [], failKeys = new Set<string>();
    for (let i = 0; i < rows.length; i++) {
      const l = rows[i];
      const dept = departments.find((d) => d.id === l.deptId);
      if (!dept) continue;
      const who = crewFields(crewList(l.crewIds, isHireDesk(dept.name) ? craftsmen : craftsmen.filter((c) => c.department_id === dept.id)), dept.name);
      const rate = Number(l.rate) || 0;
      setDispMsg(`กำลังจ่าย ${i + 1}/${rows.length} · ${dept.name}`);
      try {
        const res = await apiFetch("/api/mo/work-orders", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mo_no: m.mo_no, product_sku: m.product_sku, product_name: m.product_name,
            stage: stageOfDept(dept.name), department_id: dept.id, department_name: dept.name,
            ...who,
            qty: l.qty, uom: "ชิ้น", dispatch_date: dispDate2 === null ? null : (dispDate2 || todayLocal()),
            due_date: dispDue2 || m.internal_due_date || m.due_date || null,
            note: `จากใบสั่งผลิต ${m.mo_no}${rows.length > 1 ? ` (แบ่งจ่าย ${i + 1}/${rows.length})` : ""}`,
            // ว่าง = ไม่ส่ง → เซิร์ฟเวอร์เติมจากใบสั่งผลิต/ราคากลางในสูตรให้เอง
            labor_cost: rate > 0 ? Math.round(rate * l.qty * 100) / 100 : undefined,
          }) });
        const j = await res.json();
        if (!res.ok || j?.error) throw new Error(j?.error || "จ่ายไม่สำเร็จ");
        done.push(`${fmt(l.qty)} → ${String(who.assignee_name || dept.name)}`);
      } catch (e) { failKeys.add(l.key); fails.push(`${dept.name}: ${e instanceof Error ? e.message : "ไม่สำเร็จ"}`); }
    }
    setDispBusy(false); setDispMsg("");
    if (done.length) toast.success(`จ่ายงาน ${m.product_sku ?? m.mo_no} แล้ว — ${done.join(" · ")}${!fails.length && chk.left > 0 ? ` · ค้างรอจ่าย ${fmt(chk.left)} ชิ้น` : ""}`);
    if (fails.length) toast.error(`ไม่สำเร็จ ${fails.length} แถว — ${fails[0]}`);
    if (done.length) { setDispDeptId(rows[0].deptId); onReload?.(); }
    if (!fails.length) { setDispOpen(false); setSel(new Set()); }
    else setDispLines((ls) => ls.filter((l) => failKeys.has(l.key)));   // จ่ายแล้วเอาออก เหลือแถวที่พังให้ลองใหม่
  }, [pending, sel, departments, craftsmen, dispLines, dispDate2, dispDue2, toast, onReload]);

  // ใส่ค่าแรง/ชิ้น ให้ใบจ่ายงานที่ติ๊กไว้ — ใบละ (ค่าแรง/ชิ้น × จำนวนของใบนั้น)
  const selWos = wos.filter((w) => woSel.has(w.id));
  const applyWoLabor = useCallback(async () => {
    const ids = wos.filter((w) => woSel.has(w.id)).map((w) => w.id);
    if (!ids.length) return;
    setWoLaborSaving(true);
    try {
      const r = await apiFetch("/api/mo/work-orders/bulk-labor", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, rate_per_piece: woLaborRate.trim() === "" ? null : Number(woLaborRate) }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast.success(woLaborRate.trim() === "" ? `ล้างค่าแรงแล้ว ${j.updated} ใบ` : `ใส่ค่าแรง ฿${woLaborRate}/ชิ้น แล้ว ${j.updated} ใบ`);
      setWoLaborOpen(false); setWoSel(new Set()); onReload?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setWoLaborSaving(false); }
  }, [wos, woSel, woLaborRate, toast, onReload]);

  /** เปิดป๊อป "รับเข้า QC" — ตั้งต้น: ของดี = จำนวนที่รอรับเข้าทั้งหมด · ของเสีย = 0 */
  const openRecv = useCallback(() => {
    const init: Record<string, { good: string; bad: string; reason: string }> = {};
    for (const q of qQueue.filter((x) => qSel.has(x.wo_id))) init[q.wo_id] = { good: String(q.remaining), bad: "", reason: "" };
    setRecvRows(init); setRecvShelf((prev) => prev || qShelves[0]?.id || ""); setRecvMsg(""); setRecvOpen(true);
  }, [qQueue, qSel, qShelves]);

  const submitRecv = useCallback(async () => {
    const shelf = qShelves.find((s2) => s2.id === recvShelf);
    if (!shelf) { toast.error("เลือกชั้นที่จะรับเข้าก่อน"); return; }
    const list = qQueue.filter((q) => qSel.has(q.wo_id));
    setRecvBusy(true);
    let ok = 0; const fails: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      const row = recvRows[q.wo_id] ?? { good: "", bad: "", reason: "" };
      const good = Number(row.good) || 0, bad = Number(row.bad) || 0;
      if (good + bad <= 0) continue;
      setRecvMsg(`กำลังรับเข้า ${i + 1}/${list.length} · ${q.sku ?? q.mo_no}`);
      try {
        const res = await apiFetch("/api/qc-warehouse/items", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "receive", wo_id: q.wo_id, shelf_id: shelf.id, good,
            bad: bad > 0 ? [{ reason: row.reason || "ไม่ระบุ", qty: bad }] : [] }) });
        const j = await res.json();
        if (!res.ok || j?.error) throw new Error(j?.error || "รับเข้าไม่สำเร็จ");
        ok += 1;
      } catch (e) { fails.push(`${q.sku ?? q.mo_no}: ${e instanceof Error ? e.message : "ไม่สำเร็จ"}`); }
    }
    setRecvBusy(false); setRecvMsg("");
    if (ok > 0) toast.success(`รับเข้าชั้น ${shelf.name} แล้ว ${ok} ใบ`);
    if (fails.length) toast.error(`ไม่สำเร็จ ${fails.length} ใบ — ${fails[0]}`);
    if (ok > 0) { setRecvOpen(false); setQSel(new Set()); await loadQcQueue(); onReload?.(); }
  }, [qQueue, qSel, qShelves, recvShelf, recvRows, toast, loadQcQueue, onReload]);

  /** จำนวนที่ยังไม่ได้ส่งของใบนั้น */
  const woLeft = (w: WorkOrder) => Math.max(0, (Number(w.qty) || 0) - (Number(w.received_qty) || 0));
  /** เปิดป๊อปส่งงาน QC — ตั้งต้น: จำนวน = ที่เหลือของใบนั้น · ค่าแรง = ค่าแรงของใบนั้น (เหมือนป๊อปส่งงานทีละใบ) */
  const openQc = useCallback(() => {
    const init: Record<string, { qty: string; wage: string }> = {};
    for (const w of wos.filter((x) => woSel.has(x.id))) init[w.id] = { qty: String(woLeft(w)), wage: w.labor_cost != null ? String(w.labor_cost) : "" };
    setQcRows(init); setQcDate(todayLocal()); setQcMsg(""); setQcOpen(true);
  }, [wos, woSel]);

  const submitQc = useCallback(async () => {
    const list = wos.filter((w) => woSel.has(w.id) && (Number(qcRows[w.id]?.qty) || 0) > 0);
    if (!list.length) { toast.error("ยังไม่มีใบที่มีจำนวนส่ง"); return; }
    setQcBusy(true);
    let ok = 0; let pending = 0; const fails: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      const row = qcRows[w.id];
      const qty = Number(row?.qty) || 0;
      const wageTxt = (row?.wage ?? "").trim();
      setQcMsg(`กำลังส่ง ${i + 1}/${list.length} · ${w.product_sku ?? w.wo_no}`);
      try {
        const res = await apiFetch("/api/mo/submissions", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wo_id: w.id, qty, submitted_at: qcDate || todayLocal(),
            // ไม่ใส่ค่าแรง = ส่งไว้ก่อน แล้วไปเติมทีหลังที่ "ตารางส่งงาน" (ระบบจะขึ้นธง "ยังไม่ครบ" ให้)
            ...(wageTxt === "" ? { info_pending: true } : { wage: Number(wageTxt) || 0 }),
          }) });
        const j = await res.json();
        if (!res.ok || j?.error) throw new Error(j?.error || "ส่งไม่สำเร็จ");
        ok += 1; if (wageTxt === "") pending += 1;
      } catch (e) { fails.push(`${w.product_sku ?? w.wo_no}: ${e instanceof Error ? e.message : "ไม่สำเร็จ"}`); }
    }
    setQcBusy(false); setQcMsg("");
    if (ok > 0) toast.success(`ส่งเข้า QC แล้ว ${ok} ใบ${pending > 0 ? ` (${pending} ใบยังไม่ลงค่าแรง — เติมได้ที่ตารางส่งงาน)` : ""}`);
    if (fails.length) toast.error(`ไม่สำเร็จ ${fails.length} ใบ — ${fails[0]}`);
    if (ok > 0) { setQcOpen(false); setWoSel(new Set()); onReload?.(); }
  }, [wos, woSel, qcRows, qcDate, toast, onReload]);
  // กลุ่มใบสั่งผลิต (สำหรับคอลัมน์ "กลุ่ม" + จัดกลุ่มตามกลุ่ม)
  const [moGroups, setMoGroups] = useState<{ name: string; mo_nos: string[] }[]>([]);
  const loadGroups = useCallback(async () => { try { const r = await apiFetch("/api/mo/groups"); const j = await r.json();
    setMoGroups(((j.data ?? []) as { name: string; mo_nos: unknown }[]).map((g) => ({ name: g.name, mo_nos: (Array.isArray(g.mo_nos) ? g.mo_nos : []) as string[] }))); } catch { /* ignore */ } }, []);
  useEffect(() => { void loadGroups(); }, [loadGroups]);
  const groupNameOf = useCallback((moNo: string) => moGroups.find((g) => g.mo_nos.includes(moNo))?.name ?? null, [moGroups]);
  const [groupFor, setGroupFor] = useState<string[] | null>(null);   // จับเข้ากลุ่มจากแผงรายละเอียด (ทีละใบ)
  const GroupCell = ({ moNo }: { moNo: string }) => { const g = groupNameOf(moNo); return g ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">{g}</span> : <span className="text-slate-300">—</span>; };
  // โหมดจัดกลุ่ม (เลือกได้): ไม่จัด / ตามกลุ่ม / ตามความพร้อม(รอจ่าย) หรือ ตามสถานะ(จ่ายแล้ว)
  const [pendGroup, setPendGroup] = useState<"none" | "group" | "ready" | "stage" | "brand">("none");
  const lastGroupRef = useRef<"group" | "ready" | "stage" | "brand">("stage");   // กดปุ่มจัดกลุ่มในตารางเปิดกลับ = ใช้แบบล่าสุด
  // ชุดหน้าตาซ่อนปุ่มจัดกลุ่ม/เรียง → เลิกจัดกลุ่ม (ไม่งั้นค้างจัดกลุ่มอยู่โดยไม่มีปุ่มให้ยกเลิก)
  useEffect(() => { if (!dc.show.tools) { setPendGroup("none"); setWoGroup("none"); } }, [dc.show.tools]);
  const [woGroup, setWoGroup] = useState<"none" | "group" | "status" | "crew" | "desk">("none");
  // จัดกลุ่มตามช่าง: ใบที่ทำร่วมหลายคน ขึ้นในกลุ่มของทุกคน (แถวซ้ำ key = id::ชื่อ) · จ่ายให้ทั้งโต๊ะ = "<โต๊ะ> (ทั้งโต๊ะ)"
  const crewOf = (w: WorkOrder): string[] => {
    const names = (w.assignees ?? []).map((a) => a.name).filter(Boolean);
    if (names.length) return names;
    if (w.assignee_name && w.assignee_name !== w.department_name) return [w.assignee_name];
    return [`${w.department_name ?? "ไม่ระบุโต๊ะ"} (ทั้งโต๊ะ)`];
  };
  const grpSelectCls = "h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600";

  const imgPx = dc.img === "l" ? 72 : dc.img === "m" ? 52 : touch ? 56 : imgBig ? 64 : 36;   // รูป: ชุดหน้าตา (กลาง/ใหญ่) หรือเล็กตามโหมดเครื่อง/ปุ่ม 🖼
  const prioIcon = (m: PendingMO) => ((m.priority ?? 0) >= 2 ? "🔥 " : (m.priority ?? 0) === 1 ? "⭐ " : "");
  const dueText = (d: string | null | undefined) => d
    ? <><span className="tabular-nums">{dueDateText(d.slice(0, 10))}</span> <span className={daysLeftClass(d)}>{daysLeftText(d)}</span></>
    : <span className="text-slate-300">— ยังไม่กำหนด —</span>;
  const priceWarn = (m: PendingMO) => (priceOf(m) <= 0 ? "ยังไม่ตั้งราคา" : `ราคา ฿${fmt(priceOf(m))} ผิดปกติ?`);
  const valueCell = (m: PendingMO) => {
    if (!priceByMo) return <span className="text-[11px] text-slate-300">กำลังโหลด…</span>;
    if (!priceOk(m)) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap" title="ไม่นับรวมในยอดมูลค่า — ตั้งราคาขายที่หน้าสินค้า (Sale Price)">{priceWarn(m)}</span>;
    return <div className="leading-tight text-right">
      <div className="tabular-nums font-semibold text-slate-700 whitespace-nowrap">฿{fmt(valueOf(m, "all"))}</div>
      {m.dispatched > 0 && <div className="text-[10px] text-slate-400 whitespace-nowrap">ค้างจ่าย ฿{fmt(valueOf(m, "rem"))}</div>}
    </div>;
  };
  const hid = (k: string) => (touch ? !PEND_SHOWN_IPAD.has(k) : PEND_HIDDEN_PC.has(k));
  const pendCols: MiniColumn<PendingMO>[] = [
    { key: "img", header: "รูป", group: "พื้นฐาน", locked: true, width: imgPx > 40 ? `${imgPx / 16 + 0.25}rem` : "2.5rem", cell: (m) => <HoverImage url={m.image_url} size={imgPx} previewSize={256} /> },
    { key: "prod", header: "สินค้า / ใบสั่งผลิต", group: "พื้นฐาน", locked: true, width: "minmax(11rem,1.6fr)", sortValue: (m) => m.product_sku ?? "", sortLabel: "ชื่อสินค้า",
      cell: (m) => (
        <div className="flex items-start gap-1.5 min-w-0">
          <span className="mt-0.5 shrink-0 text-[10px] text-slate-400">{expanded.has(m.id) ? "▾" : "▸"}</span>
          <div className="min-w-0 flex-1">
            <div className={`font-semibold text-slate-800 truncate ${touch ? "text-[15px]" : ""}`} title={m.priority_note ?? undefined}>{prioIcon(m)}{m.product_sku}</div>
            {m.product_name && m.product_name !== m.product_sku && <div className="text-[11px] text-slate-400 truncate">{m.product_name}</div>}
            <div className="font-mono text-[10px] text-slate-400">{m.mo_no}</div>
          </div>
          {cuBtn(m.mo_no)}
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpenMO(m); }} title="เปิดเช็กลิสต์เตรียม/ตัด"
            className={`shrink-0 text-slate-300 hover:text-blue-600 ${touch ? "text-lg px-1" : ""}`}>📋</button>
        </div>
      ) },
    { key: "created", header: "สร้างเมื่อ", group: "พื้นฐาน", defaultHidden: hid("created"), width: "6rem", sortValue: (m) => m.created_at ?? "", sortLabel: "วันที่สร้างใบ",
      cell: (m) => { if (!m.created_at) return <span className="text-slate-300">—</span>;
        const d = Math.max(0, Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86400000));
        return <div className="leading-tight"><div className="text-[12px] text-slate-600 tabular-nums">{formatDateTime(m.created_at).slice(0, 10)}</div>
          <div className={`text-[10px] ${d > 60 ? "text-rose-500" : "text-slate-400"}`}>{d === 0 ? "วันนี้" : `${fmt(d)} วันที่แล้ว`} <span className="text-slate-400" title="กดดูประวัติ">🕘</span></div></div>; } },
    { key: "qty", header: "เหลือ / ทั้งหมด", group: "พื้นฐาน", defaultHidden: hid("qty"), width: "6rem", align: "right", sortValue: (m) => m.remaining, sortLabel: "จำนวนเหลือ",
      cell: (m) => <div className="leading-tight">
        <div className="tabular-nums whitespace-nowrap"><b className={`text-rose-600 ${touch ? "text-base" : ""}`}>{fmt(m.remaining)}</b><span className="text-[11px] text-slate-400"> / {fmt(m.qty)}</span></div>
        <div className="text-[10px] text-slate-400 whitespace-nowrap">{m.dispatched > 0 ? `จ่ายแล้ว ${fmt(m.dispatched)}` : "ยังไม่จ่าย"}</div>
      </div> },
    { key: "prep", header: "เตรียม / ตัด", group: "ผลิต", defaultHidden: hid("prep"), width: "7.5rem", sortValue: (m) => (m.prep_total > 0 ? m.prep_ready / m.prep_total : -1), sortLabel: "ความคืบหน้าเตรียม",
      cell: (m) => m.has_bom
        ? <div className="space-y-1"><PrepBar label={m.skipped_stages?.prep ? "⏭ เตรียม" : "เตรียม"} a={m.prep_ready} b={m.prep_total} /><PrepBar label={m.skipped_stages?.cut ? "⏭ ตัด" : "ตัด"} a={m.cut_ready} b={m.cut_total} /></div>
        : <span className="text-[11px] text-slate-400">{m.ready ? "พร้อม ✓" : "— ไม่มีสูตร —"}</span> },
    { key: "buy", header: "🛒 ซื้อของ", group: "ซื้อของ", defaultHidden: hid("buy"), width: "minmax(8.5rem,1fr)", sortLabel: "ของที่ยังต้องซื้อ",
      sortValue: (m) => { const p = prog?.[m.mo_no]; return p ? p.buy * 10000 + p.requested * 100 + p.ordered : -1; },
      cell: (m) => dc.buy === "words" ? <BuyText p={prog?.[m.mo_no]} loading={prog === null} /> : <MoProgressCell p={prog?.[m.mo_no]} loading={prog === null} /> },
    // ของครบประมาณ = วันของถึงช้าสุดของรายการที่สั่งแล้ว (ยังมีต้องซื้อ/รออนุมัติ = ยังบอกวันไม่ได้)
    { key: "eta", header: "📅 ของครบประมาณ", label: "ของครบประมาณ", group: "ซื้อของ", isNew: true, defaultHidden: hid("eta"), width: "8rem", sortLabel: "วันของครบ",
      sortValue: (m) => { const p = prog?.[m.mo_no]; return !p ? "9999" : p.buy + p.requested > 0 ? "8888" : p.ordered === 0 ? "0000" : p.eta ?? "7777"; },
      cell: (m) => { const p = prog?.[m.mo_no];
        if (!p) return <span className="text-slate-300">—</span>;
        if (p.skipped) return <span className="text-[11px] text-slate-500">⏭ ข้ามซื้อของ</span>;
        if (p.buy + p.requested > 0) return <span className="text-[11px] text-rose-600">ยังสั่งไม่ครบ</span>;
        if (p.ordered === 0) return <span className="text-[11px] text-emerald-600">✓ ครบแล้ว</span>;
        return <div className="leading-tight text-[12px]">
          {p.eta ? <div className="whitespace-nowrap">{dueText(p.eta)}</div> : <div className="text-[11px] text-slate-400">PO ยังไม่ระบุวัน</div>}
          {p.eta && p.eta_unknown > 0 && <div className="text-[10px] text-slate-400">+{p.eta_unknown} รายการไม่ระบุวัน</div>}
        </div>; } },
    { key: "stage", header: "ขั้นตอน", group: "ผลิต", defaultHidden: hid("stage"), width: touch ? "13rem" : "11.75rem", sortLabel: "ขั้นตอน", sortValue: (m) => STAGE_META[stageOf(m, prog?.[m.mo_no])][1],
      cell: (m) => dc.stage === "dots" ? <MoStepDots m={m} p={prog?.[m.mo_no]} received={recvByMo.get(m.mo_no) ?? 0} />
        : <StageText m={m} p={prog?.[m.mo_no]} late={lateDays(m)} pill={dc.stage === "pill"} /> },
    // กำหนดส่ง: กดช่อง = กางแท็บ 📅 กำหนดส่ง (แก้วัน + แบ่งงวดส่ง) — ในตารางเป็นตัวหนังสืออย่างเดียว
    { key: "due", header: "กำหนดส่ง", group: "อื่น ๆ", defaultHidden: hid("due"), width: "11rem", sortLabel: "กำหนดส่ง (วันที่ใกล้สุด)",
      sortValue: (m) => [m.due_date, m.internal_due_date].filter((d): d is string => !!d).sort()[0] ?? "9999",
      cell: (m) => <div className="space-y-0.5">
        {([["due", "📦", m.due_date, "ลูกค้า"], ["internal", "🪑", m.internal_due_date, "ภายใน"]] as const).map(([f, ic, v, lb]) => (
          <span key={f} className="flex items-center gap-1 text-[12px]" title={`ส่ง${lb} — กดเพื่อแก้วัน / แบ่งงวดส่ง`}>
            <span className="w-4 shrink-0 text-[11px]">{ic}</span>
            <span className="whitespace-nowrap">{
              !v || dc.due === "both" ? dueText(v)
                : dc.due === "date" ? <span className="tabular-nums">{dueDateText(v.slice(0, 10))}</span>
                : <span className={daysLeftClass(v)}>{daysLeftText(v)}</span>
            }</span>
          </span>
        ))}
        {deliveryPlans.some((p) => p.mo_id === m.id) && <span className="text-[10px] text-indigo-600">📦 แบ่ง {deliveryPlans.filter((p) => p.mo_id === m.id).length} งวด</span>}
      </div> },
    ...(canSeeMoney ? [
      { key: "price", header: "🏷 ราคาขาย/ชิ้น", label: "ราคาขาย/ชิ้น", group: "เงิน", isNew: true, defaultHidden: hid("price"), width: "7rem", align: "right",
        sortLabel: "ราคาขาย", sortValue: (m: PendingMO) => priceOf(m),
        cell: (m: PendingMO) => !priceByMo ? <span className="text-[11px] text-slate-300">…</span>
          : !priceOk(m) ? <span className="text-[10px] text-amber-700">{priceOf(m) <= 0 ? "ยังไม่ตั้ง" : `฿${fmt(priceOf(m))} ผิดปกติ?`}</span>
          : <div className="leading-tight text-right"><div className="tabular-nums whitespace-nowrap">฿{fmt(priceOf(m))}</div>{priceByMo.get(m.mo_no)?.oem && <div className="text-[10px] text-slate-400">OEM</div>}</div> },
      { key: "value", header: "💵 มูลค่ารวม", label: "มูลค่ารวม (จำนวน × ราคา)", group: "เงิน", isNew: true, defaultHidden: hid("value"), width: "7.5rem", align: "right",
        sortLabel: "มูลค่ารวม", sortValue: (m: PendingMO) => (priceOk(m) ? valueOf(m, "all") : -1), cell: valueCell },
    ] as MiniColumn<PendingMO>[] : []),
    // ค่าแรง/ชิ้น — ดับเบิลคลิกแก้ได้ (บันทึกเป็นยอดรวมของใบให้อัตโนมัติ)
    { key: "rate", header: "💰 ค่าแรง/ชิ้น", label: "ค่าแรง/ชิ้น", group: "เงิน", defaultHidden: hid("rate"), width: "8.5rem", align: "right", sortValue: (m) => rateOf(m), sortLabel: "ค่าแรง/ชิ้น",
      cell: (m) => { const r = rateOf(m); return (
        <span className="flex items-center justify-end gap-1">
          <InlineEdit type="number" trigger="dblclick" compact align="right" width="5rem" disabled={!canEdit || !dc.edit}
            value={r > 0 ? r : ""} placeholder="— ใส่ —" className="text-slate-600"
            onSave={(v) => void saveMoRate(m, v)} />
          {r > 0 && <span className="text-[10px] text-slate-400 whitespace-nowrap">= ฿{fmt(Math.round(r * (m.qty || 0) * 100) / 100)}</span>}
        </span> ); } },
    { key: "brand", header: "แบรนด์", group: "อื่น ๆ", isNew: true, defaultHidden: hid("brand"), width: "minmax(7rem,0.8fr)", sortValue: (m) => m.brand ?? "~", sortLabel: "แบรนด์",
      cell: (m) => m.brand
        ? <span className="flex items-center gap-1.5 min-w-0 text-[12px] text-slate-600"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.brand_color || "#cbd5e1" }} /><span className="truncate">{m.brand}</span>{m.brand_oem && <span className="shrink-0 text-[10px] text-slate-400">OEM</span>}</span>
        : <span className="text-slate-300">—</span> },
    { key: "prio", header: "งานเร่ง", group: "อื่น ๆ", isNew: true, defaultHidden: hid("prio"), width: "6rem", sortValue: (m) => -(m.priority ?? 0), sortLabel: "งานเร่งก่อน",
      cell: (m) => (m.priority ?? 0) >= 2 ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 whitespace-nowrap" title={m.priority_note ?? ""}>🔥 เร่งด่วน</span>
        : (m.priority ?? 0) === 1 ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 whitespace-nowrap" title={m.priority_note ?? ""}>⭐ สำคัญ</span>
        : <span className="text-slate-300">—</span> },
    { key: "issues", header: "ปัญหา", group: "อื่น ๆ", isNew: true, defaultHidden: hid("issues"), width: "5.5rem", sortValue: (m) => -(m.issue_count ?? 0), sortLabel: "ปัญหามากก่อน",
      cell: (m) => (m.issue_count ?? 0) > 0 ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 whitespace-nowrap">⚠️ {m.issue_count} เรื่อง</span> : <span className="text-slate-300">—</span> },
    { key: "group", header: "กลุ่ม", group: "อื่น ๆ", defaultHidden: hid("group"), width: "minmax(6rem,0.8fr)", sortValue: (m) => groupNameOf(m.mo_no) ?? "~", sortLabel: "กลุ่ม", cell: (m) => <GroupCell moNo={m.mo_no} /> },
  ];
  // จำคอลัมน์ที่เลือก "ต่อคน" แยกจอคอม / iPad (การ์ดแนวตั้งหน้าตาตายตัว ไม่ใช้ตัวเลือกคอลัมน์)
  const pendColPrefs = useColumnPrefs(touch ? "wb_table_cols_ipad" : "wb_table_cols_pc", pendCols);
  // คอลัมน์ที่โชว์จริง: ชุดหน้าตากำหนดไว้ (เรียงตามชุด) หรือ ▥ คอลัมน์ของแต่ละคน · ชื่อสินค้าต้องมีเสมอ · ช่องเงินไม่มีสิทธิ์ = ไม่มีใน pendCols อยู่แล้ว
  const pendColsShown = (() => {
    const fixedCols = effCols ?? dc.cols;   // มุมมองกำหนดคอลัมน์เอง (+ ร่างจากเมนูหัวคอลัมน์) > ชุดหน้าตา > ▥ คอลัมน์ของแต่ละคน
    const base = fixedCols ? fixedCols.map((k) => pendCols.find((c) => c.key === k)).filter((c): c is MiniColumn<PendingMO> => !!c) : pendColPrefs.visible;
    const withProd = base.some((c) => c.key === "prod") ? base : [...pendCols.filter((c) => c.key === "prod"), ...base];
    return withProd.filter((c) => dc.img !== "0" || c.key !== "img");
  })();
  // เมนู ⋮ ที่หัวคอลัมน์ (ของกลาง MiniTable) — ย้าย/ซ่อน = ร่างคอลัมน์ของมุมมองนี้ (แถบเหลืองให้บันทึก)
  const pendColMenu = {
    onMove: (key: string, d: -1 | 1) => setColsDraft(qvMoveOrder(pendColsShown.map((c) => c.key), key, { dir: d })),
    onHide: (key: string) => setColsDraft(pendColsShown.map((c) => c.key).filter((k) => k !== key)),
    canHide: (key: string) => key !== "prod",
  };
  // คีย์ลัด (คอม): 1–9 = สลับมุมมอง · / = ไปช่องค้นหา — ไม่ทำงานตอนพิมพ์อยู่หรือมีป๊อปเปิด
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || mgr.open) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector("[data-erp-modal]")) return;
      if (e.key === "/") {
        const box = Array.from(document.querySelectorAll<HTMLInputElement>("[data-page-search]")).find((x) => x.offsetParent !== null);
        if (box) { e.preventDefault(); box.focus(); box.select(); }
        return;
      }
      if (tab !== "pend" || !dc.show.chips || !/^[1-9]$/.test(e.key)) return;
      const v = views[Number(e.key) - 1];
      if (v) { e.preventDefault(); pickView(v.id); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // จ่ายงาน (ป๊อปเดิมของตาราง) — ค่าแรงตั้งต้น = ราคากลางในสูตรของสินค้านั้น (ไม่มีก็ถอดจากค่าแรงที่วางแผนไว้) แก้รายใบได้
  const openDispatchFor = (ids: Set<string>) => {
    const init: Record<string, string> = {};
    const list = pending.filter((x) => ids.has(x.id));
    for (const m of list) { const r = rateOf(m); if (r > 0) init[m.id] = String(r); }
    setDispRateBy(init); setDispRate(""); setDispDate2(todayLocal()); setDispOpen(true); setDispMsg(""); setDispQtyBy({});
    // ใบเดียว = แถวจ่าย (เลือกจำนวน / แบ่งหลายคน) · แถวแรก = โต๊ะล่าสุด · จำนวน = ที่เหลือทั้งหมด · ค่าแรงตามสูตร
    const one = list.length === 1 ? list[0] : null;
    setDispLines(one ? [{ key: `l${Date.now()}`, deptId: dispDeptId, crewIds: [], qty: one.remaining, rate: init[one.id] ?? "" }] : []);
  };

  // 📷 สแกน/ยิงบาร์โค้ด → หาใบบนบอร์ด: เลขใบสั่งผลิต · เลขใบจ่ายงาน (WO-) · QR ใบเก่า (/s/… · /print/work-order/<id>) · รหัสสินค้า (ใบเดียว)
  //    เจอ = สลับแท็บ (+ มุมมองที่มีใบนี้) · ค้นด้วยเลขใบ · กางแผงจ่ายงาน · แถบ "เจอแล้ว" + ปุ่มลัด
  const findScanned = (raw: string) => {
    const p = parseScanned(raw);
    const code = (p.code || raw).trim();
    if (!code) return;
    const U = code.toUpperCase();
    const eq = (a: string | null | undefined) => !!a && a.trim().toUpperCase() === U;
    let moNo: string | null = workOrders.find((w) => eq(w.wo_no))?.mo_no ?? null;
    if (!moNo && p.byId) moNo = pending.find((m) => m.id === code)?.mo_no ?? workOrders.find((w) => w.mo_id === code)?.mo_no ?? null;
    if (!moNo) moNo = [...pending.map((m) => m.mo_no), ...workOrders.map((w) => w.mo_no), ...qQueue.map((q) => q.mo_no)].find((n) => eq(n)) ?? null;
    if (!moNo) {
      const bySku = new Set([...pending.filter((m) => eq(m.product_sku)).map((m) => m.mo_no), ...wos.filter((w) => eq(w.product_sku)).map((w) => w.mo_no)]);
      if (bySku.size > 1) { setScanHit(null); setTableSearch(code); toast.info(`รหัส ${code} มี ${bySku.size} ใบบนบอร์ด — กรองให้ดูแล้ว`); return; }
      moNo = [...bySku][0] ?? null;
    }
    if (!moNo) { setScanHit(null); toast.error(`ไม่พบ "${code}" บนบอร์ด — ใบอาจปิดงาน/ยกเลิกแล้ว หรือยังไม่ได้สร้าง`); return; }
    const pm = pending.find((m) => m.mo_no === moNo && m.remaining > 0) ?? null;
    const anyW = workOrders.find((w) => w.mo_no === moNo);
    let where = "";
    if (pm) {
      pickTab("pend"); where = "รอจ่าย";
      if (dc.show.chips && !qvMatch(view, rowQ(pm))) { const v = views.find((x) => qvMatch(x, rowQ(pm))); if (v) pickView(v.id); }
      showPane(pm.id, "dispatch");
    } else if (wos.some((w) => w.mo_no === moNo) && tabVisible("wip")) { pickTab("wip"); where = "กำลังผลิต"; }
    else if (qQueue.some((q) => q.mo_no === moNo) && tabVisible("qc")) { pickTab("qc"); where = "รอ QC รับเข้า"; }
    else if (catchUp) { pickTab("all"); void loadCuAll(); where = "ทั้งหมด"; }
    else { toast.info(`${moNo} ไม่อยู่ในแท็บที่เปิดได้ — อาจจบงานแล้ว`); }
    setTableSearch(moNo);
    setScanHit({ moNo, sku: pm?.product_sku ?? anyW?.product_sku ?? null, name: pm?.product_name ?? anyW?.product_name ?? null, where, pendId: pm?.id ?? null, remaining: pm?.remaining ?? 0 });
  };
  useScanGun(findScanned, { enabled: !scanOpen && !dispOpen });
  // งวดส่ง (API เดียวกับเช็กลิสต์ /api/mo/delivery-plan)
  const addPlan = useCallback(async (moId: string, date: string, qty: number, note: string) => {
    const r = await apiSave(toast, "/api/mo/delivery-plan", { method: "POST", body: { mo_id: moId, due_date: date, qty, note: note || null } },
      { ok: `เพิ่มงวดส่ง ${fmt(qty)} ชิ้นแล้ว`, fail: "เพิ่มงวดส่งไม่สำเร็จ" });
    if (r.ok) onReload?.();
    return r.ok;
  }, [toast, onReload]);
  const delPlan = useCallback(async (id: string) => {
    const r = await apiSave(toast, `/api/mo/delivery-plan?id=${encodeURIComponent(id)}`, { method: "DELETE" },
      { ok: "ลบงวดส่งแล้ว (จำนวนกลับไปเป็นยังไม่แบ่งงวด)", fail: "ลบงวดส่งไม่สำเร็จ" });
    if (r.ok) onReload?.();
  }, [toast, onReload]);
  // แถวที่กางออก = แผงรายละเอียด 8 แท็บ (./pend-detail) — เปิดที่แท็บของช่องที่กด
  const renderPendDetail = (m: PendingMO) => (
    <PendDetail m={m} pane={openPane[m.id] ?? "job"} onPane={(pane) => setOpenPane((prev) => ({ ...prev, [m.id]: pane }))} onClose={() => showPane(m.id, null)}
      touch={touch} canEdit={canEdit} canSeeMoney={canSeeMoney} canSkip={canSeeMoney} onSkipped={() => { setProgTick((t) => t + 1); onReload?.(); }} prefs={detailPrefs} onPrefs={setDetailPrefs} prog={prog?.[m.mo_no]} received={recvByMo.get(m.mo_no) ?? 0}
      wos={workOrders.filter((w) => w.mo_no === m.mo_no)} plans={deliveryPlans.filter((p) => p.mo_id === m.id)}
      groupName={groupNameOf(m.mo_no)} rate={rateOf(m)} valueNode={canSeeMoney ? valueCell(m) : undefined}
      onOpenChecklist={() => onOpenMO(m)}
      onDispatch={() => { const ids = new Set([m.id]); setSel(ids); openDispatchFor(ids); }}
      onAssignGroup={() => setGroupFor([m.mo_no])}
      onChanged={() => onReload?.()}
      onSaveDue={(field, value) => void saveMoDate(m.id, field, value)}
      onAddPlan={(date, qty, note) => addPlan(m.id, date, qty, note)}
      onDelPlan={delPlan} />
  );
  // iPad แนวตั้ง — 1 ใบ = 1 การ์ด
  const renderPendCard = (m: PendingMO) => (
    <div className="flex gap-3">
      <HoverImage url={m.image_url} size={72} previewSize={256} />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-[15px] text-slate-800 truncate" title={m.priority_note ?? undefined}>{prioIcon(m)}{m.product_sku}</div>
            {m.product_name && m.product_name !== m.product_sku && <div className="text-[12px] text-slate-400 truncate">{m.product_name}</div>}
            <div className="font-mono text-[10px] text-slate-400">{m.mo_no}{m.created_at ? ` · สร้าง ${formatDateTime(m.created_at).slice(0, 10)}` : ""}</div>
          </div>
          <div className="shrink-0 text-right leading-tight">
            <div className="tabular-nums whitespace-nowrap"><b className="text-base text-rose-600">{fmt(m.remaining)}</b><span className="text-[11px] text-slate-400"> / {fmt(m.qty)}</span></div>
            <div className="text-[10px] text-slate-400">{m.dispatched > 0 ? `จ่ายแล้ว ${fmt(m.dispatched)}` : "ยังไม่จ่าย"}</div>
          </div>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-44"><MoProgressCell p={prog?.[m.mo_no]} loading={prog === null} /></div>
          <MoStepDots m={m} p={prog?.[m.mo_no]} received={recvByMo.get(m.mo_no) ?? 0} />
        </div>
        <div className="flex items-end justify-between gap-2 flex-wrap text-[12px]">
          <div className="space-y-0.5">
            <div className="whitespace-nowrap">📦 ลูกค้า {dueText(m.due_date)}</div>
            <div className="whitespace-nowrap">🪑 ภายใน {dueText(m.internal_due_date)}</div>
          </div>
          {canSeeMoney && valueCell(m)}
        </div>
      </div>
    </div>
  );
  // มุมมองการ์ด (มุมมองด่วนตั้งเป็น "การ์ด") — ช่องบนการ์ด + ขนาด ตามที่ตั้ง · แตะการ์ด = กางรายละเอียดเต็มแถว
  const CARD_IMG = { s: 96, m: 140, l: 200 } as const;
  const renderViewCard = (m: PendingMO) => {
    const f = new Set(view.cardFields);
    const big = view.size === "l";
    const late = lateDays(m);
    return (
      <div className="space-y-1.5">
        {f.has("img") && <div className="flex justify-center rounded-lg bg-slate-50 py-1"><HoverImage url={m.image_url} size={CARD_IMG[view.size]} previewSize={360} /></div>}
        <div className="min-w-0">
          <div className={`truncate font-semibold text-slate-800 ${big ? "text-lg" : "text-[15px]"}`} title={m.priority_note ?? m.product_name ?? undefined}>{prioIcon(m)}{m.product_sku}</div>
          {m.product_name && m.product_name !== m.product_sku && <div className="truncate text-[12px] text-slate-400">{m.product_name}</div>}
          {f.has("mo") && <div className="font-mono text-[10px] text-slate-400">{m.mo_no}</div>}
        </div>
        {f.has("due") && (late > 0
          ? <div className={`font-semibold text-rose-600 ${big ? "text-base" : "text-[13px]"}`}>⚠️ เลยกำหนด {fmt(late)} วัน</div>
          : <div className={`text-slate-600 ${big ? "text-[15px]" : "text-[12px]"}`}>📦 {dueText(m.due_date)}{m.internal_due_date ? <> · 🪑 {dueText(m.internal_due_date)}</> : null}</div>)}
        {f.has("left") && <div className={big ? "text-[15px]" : "text-[13px]"}><b className="text-rose-600">{fmt(m.remaining)}</b><span className="text-slate-400"> / {fmt(m.qty)} ชิ้น ยังไม่จ่าย</span></div>}
        {f.has("stage") && <StageText m={m} p={prog?.[m.mo_no]} late={0} pill />}
        {f.has("buy") && <div className="text-[12px]"><BuyText p={prog?.[m.mo_no]} loading={prog === null} /></div>}
        {f.has("brand") && m.brand && <div className="flex items-center gap-1.5 text-[12px] text-slate-500"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.brand_color || "#94a3b8" }} />{m.brand}{m.brand_oem ? " · OEM" : ""}</div>}
        {f.has("created") && m.created_at && <div className="text-[11px] text-slate-400">สร้าง {formatDateTime(m.created_at).slice(0, 10)}</div>}
        {f.has("value") && canSeeMoney && valueCell(m)}
      </div>
    );
  };
  // ยอดท้ายหัวกลุ่ม — จำนวนเหลือ (+ มูลค่าค้างจ่าย สำหรับคนที่เห็นเงิน)
  const groupSum = (rows: PendingMO[]) => {
    const rem = rows.reduce((s, m) => s + (m.remaining || 0), 0);
    if (!canSeeMoney || !priceByMo) return `เหลือ ${fmt(rem)} ชิ้น`;
    const val = rows.reduce((s, m) => s + valueOf(m, "rem"), 0);
    const bad = rows.filter((m) => !priceOk(m)).length;
    return `เหลือ ${fmt(rem)} ชิ้น · มูลค่าค้างจ่าย ฿${fmt(val)}${bad ? ` (ไม่นับ ${bad} ใบที่ราคายังไม่ถูกต้อง)` : ""}`;
  };
  // หัวตาราง: แถบสรุป (คิดจากใบที่กรองอยู่)
  const sumCards: [string, string, string][] = [
    ["รอจ่าย", `${fmt(pendShown.length)} ใบ`, pendShown.length === pending.length ? `เหลือ ${fmt(pendShown.reduce((s, m) => s + m.remaining, 0))} ชิ้น` : `${view.icon} ${view.name} · จาก ${fmt(pending.length)} ใบ`],
    ...(canSeeMoney ? [["มูลค่าค้างจ่าย", priceByMo ? `฿${fmt(pendShown.reduce((s, m) => s + valueOf(m, "rem"), 0))}` : "…",
      priceByMo ? `ไม่นับ ${fmt(pendShown.filter((m) => !priceOk(m)).length)} ใบที่ราคายังไม่ถูกต้อง` : "กำลังโหลดราคา"] as [string, string, string]] : []),
    ["เกินกำหนด", `${fmt(pending.filter(isLate).length)} ใบ`, "เลยวันส่งลูกค้าหรือวันส่งภายใน"],
    canSeeMoney
      ? ["ยังไม่ตั้งราคา", priceByMo ? `${fmt(pending.filter((m) => !priceOk(m)).length)} ใบ` : "…", `ราคา ฿0 / ต่ำกว่า ฿${PRICE_MIN} / ว่าง`]
      : ["รอซื้อของ", prog ? `${fmt(pending.filter((m) => stageOf(m, prog[m.mo_no]) === "buy").length)} ใบ` : "…", "ยังมีของต้องซื้อหรือรออนุมัติ"],
  ];
  const pickGroup = (g: "none" | "group" | "ready" | "stage" | "brand") => { setPendGroup(g); if (g !== "none") lastGroupRef.current = g; };
  // เปลี่ยนมุมมอง (หรือแก้จัดกลุ่มของมุมมอง) → จัดกลุ่มตามที่มุมมองตั้งไว้ · ปรับเองชั่วคราวได้ที่ปุ่มจัดกลุ่ม
  const viewGroupKey = `${view.id}:${view.group}`;
  useEffect(() => { pickGroup(view.group); }, [viewGroupKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  const devBtn = (v: "pc" | "ipadL" | "ipadP", label: string, tip: string) => (
    <button type="button" onClick={() => setDev(v)} title={tip}
      className={`h-8 px-2.5 text-sm ${dev === v ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>
  );

  const woCols: MiniColumn<WorkOrder>[] = [
    { key: "prod", header: "สินค้า", width: "minmax(12rem,1.6fr)", sortValue: (w) => w.product_sku ?? "", sortLabel: "ชื่อสินค้า",
      cell: (w) => catchUp ? <div className="flex min-w-0 items-center gap-1.5"><div className="min-w-0 flex-1"><ProdCell url={w.image_url} sku={w.product_sku} name={w.product_name} /></div>{cuBtn(w.mo_no)}</div>
        : <ProdCell url={w.image_url} sku={w.product_sku} name={w.product_name} /> },
    { key: "wo", header: "ใบจ่ายงาน", width: "9rem", sortValue: (w) => w.wo_no, sortLabel: "เลขใบจ่ายงาน", cell: (w) => <span className="font-mono text-[11px] text-slate-500">{w.wo_no}</span> },
    { key: "group", header: "กลุ่ม", width: "minmax(7rem,1fr)", sortValue: (w) => groupNameOf(w.mo_no) ?? "~", sortLabel: "กลุ่ม", cell: (w) => <GroupCell moNo={w.mo_no} /> },
    { key: "dept", header: "แผนก/ช่าง", width: "minmax(8rem,1fr)", sortValue: (w) => w.department_name ?? "", sortLabel: "แผนก", cell: (w) => <span className="text-[12px] text-slate-600">{w.department_name ?? "—"}{w.assignee_name ? ` · ${w.assignee_name}` : ""}</span> },
    { key: "qty", header: "จำนวน", width: "5rem", align: "right", sortValue: (w) => w.qty, sortLabel: "จำนวน", cell: (w) => <span className="tabular-nums">{fmt(w.qty)}</span> },
    // ส่งแล้วเท่าไหร่ + ค้างอีกเท่าไหร่ (ค้าง = จำนวนที่จ่าย − ที่ช่างส่งกลับมาแล้ว) — ค้างขึ้นสีส้มให้สะดุดตา
    { key: "recv", header: "ส่งแล้ว", width: "7rem", align: "right",
      sortValue: (w) => Math.max(0, (w.qty || 0) - (w.received_qty || 0)), sortLabel: "ค้างส่ง",
      cell: (w) => { const left = Math.round(Math.max(0, (w.qty || 0) - (w.received_qty || 0)) * 100) / 100; return (
        <span className="flex items-center justify-end gap-1 whitespace-nowrap">
          <span className="tabular-nums text-slate-500">{fmt(w.received_qty)}</span>
          {left > 0
            ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 tabular-nums">ค้าง {fmt(left)}</span>
            : <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">ครบ ✓</span>}
        </span> ); } },
    { key: "due", header: "กำหนดเสร็จ", width: "minmax(9rem,1fr)", sortValue: (w) => w.due_date ?? "9999", sortLabel: "กำหนดเสร็จ", cell: (w) => <DueCell d={w.due_date} /> },
    // ค่าแรง/ชิ้น ของจริง = ยอดค่าแรงใบนั้น ÷ จำนวน · ยังไม่ใส่ = ขึ้นเตือนสีส้ม
    { key: "rate", header: "ค่าแรง/ชิ้น", width: "7rem", align: "right", sortValue: (w) => ((w.labor_cost ?? 0) > 0 && w.qty > 0 ? (w.labor_cost as number) / w.qty : -1), sortLabel: "ค่าแรง/ชิ้น",
      cell: (w) => ((w.labor_cost ?? 0) > 0 && w.qty > 0)
        ? <span className="tabular-nums text-slate-600">฿{fmt(Math.round(((w.labor_cost as number) / w.qty) * 100) / 100)}</span>
        : <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 whitespace-nowrap">ยังไม่ใส่</span> },
    { key: "status", header: "สถานะ", width: "7rem", align: "center", sortValue: (w) => (WO_STATUS[w.status]?.label ?? w.status), sortLabel: "สถานะ", cell: (w) => { const st = WO_STATUS[w.status] ?? WO_STATUS.dispatched; return <span className={`text-[10px] px-2 py-0.5 rounded border whitespace-nowrap ${st.cls}`}>{st.label}</span>; } },
  ];

  // ── ตาราง "รอ QC รับเข้า" (คอลัมน์) · ทุกแท็บเลือกคอลัมน์ได้ จำต่อคน แยกคอม/iPad
  const qcCols: MiniColumn<QcQueueRow>[] = [
    { key: "prod", header: "สินค้า", width: "minmax(12rem,1.6fr)", sortValue: (q) => q.sku ?? "", sortLabel: "ชื่อสินค้า",
      cell: (q) => {
        const pc = <ProdCell url={q.image_key ? `/api/r2-image?key=${encodeURIComponent(q.image_key)}` : null} sku={q.sku} name={q.name} />;
        return catchUp ? <div className="flex min-w-0 items-center gap-1.5"><div className="min-w-0 flex-1">{pc}</div>{cuBtn(q.mo_no)}</div> : pc;
      } },
    { key: "mo", header: "ใบสั่งผลิต", width: "9rem", sortValue: (q) => q.mo_no ?? "", sortLabel: "เลขใบสั่งผลิต", cell: (q) => <span className="font-mono text-[11px] text-slate-500">{q.mo_no ?? "—"}</span> },
    { key: "worker", header: "ช่างที่ส่ง", width: "minmax(8rem,1fr)", sortValue: (q) => q.worker ?? "", sortLabel: "ช่าง", cell: (q) => <span className="text-[12px] text-slate-600">{q.worker ?? "—"}</span> },
    { key: "qty", header: "รอรับเข้า", width: "6rem", align: "right", sortValue: (q) => q.remaining, sortLabel: "จำนวน", cell: (q) => <span className="tabular-nums font-semibold text-slate-700">{fmt(q.remaining)}</span> },
    { key: "recv", header: "วันที่ช่างส่ง", width: "minmax(8rem,1fr)", sortValue: (q) => q.received_at ?? "9999", sortLabel: "วันที่ช่างส่ง", cell: (q) => <span className="text-[12px] text-slate-500">{q.received_at ? dueDateText(q.received_at) : "—"}</span> },
    { key: "due", header: "กำหนดเสร็จ", width: "minmax(9rem,1fr)", sortValue: (q) => q.due_date ?? "9999", sortLabel: "กำหนดเสร็จ", cell: (q) => <DueCell d={q.due_date} /> },
  ];
  const withMeta = <R,>(cols: MiniColumn<R>[], ipadHidden: string[]) =>
    cols.map((c) => ({ ...c, locked: c.key === "prod", defaultHidden: touch && ipadHidden.includes(c.key) }));
  const woColPrefs = useColumnPrefs(touch ? "wb_table_cols_wip_ipad" : "wb_table_cols_wip_pc", withMeta(woCols, ["group", "wo"]));
  const qcColPrefs = useColumnPrefs(touch ? "wb_table_cols_qc_ipad" : "wb_table_cols_qc_pc", withMeta(qcCols, ["mo"]));

  // ── 3 แท็บ: 📥 รอจ่าย · 🛠 กำลังผลิต · ✅ รอ QC รับเข้า — จำแท็บล่าสุด "ต่อคน" (ตามไปทุกเครื่อง)
  const tabPref = useViewPref("wb_table_tab", ["pend", "wip", "qc"] as const, "pend");
  // แท็บที่ชุดหน้าตาซ่อนไว้ / ไม่มีสิทธิ์ QC → ไปแท็บแรกที่ยังโชว์
  const tabVisible = (t: "pend" | "wip" | "qc") => dc.tabs[t] && (t !== "qc" || qcSectionOn);
  const tab: "pend" | "wip" | "qc" | "all" = catchUp && cuAll ? "all" : tabVisible(tabPref.view) ? tabPref.view : ((["pend", "wip", "qc"] as const).find(tabVisible) ?? "pend");
  const pickTab = (t: "pend" | "wip" | "qc" | "all") => {
    if (qq) setSearchPinned(true);   // ระหว่างค้นหา: กดแท็บ = ดูผลเฉพาะแท็บนั้น
    if (t === "all") { setCuAll(true); return; }
    setCuAll(false); tabPref.setView(t); void tabPref.saveDefault(t);
  };
  // ค้นหาร่วม 3 แท็บ — คำเดียวกรองทุกตาราง · ตัวเลขบนแท็บ = จำนวนที่ค้นเจอในแท็บนั้น (กติกาเดียวกับช่องค้นของตาราง)
  const pendText = (m: PendingMO) => `${m.product_sku ?? ""} ${m.product_name ?? ""} ${m.mo_no}`;
  const woText = (w: WorkOrder) => `${w.product_sku ?? ""} ${w.product_name ?? ""} ${w.wo_no} ${w.department_name ?? ""} ${w.assignee_name ?? ""}`;
  const qcText = (q: QcQueueRow) => `${q.sku ?? ""} ${q.name ?? ""} ${q.mo_no ?? ""} ${q.worker ?? ""}`;
  const allText = (r: CuAllRow) => `${r.product_sku ?? ""} ${r.product_name ?? ""} ${r.mo_no} ${r.where.parts.map((x) => x.label).join(" ")}`;
  const qq = searchQ.trim().toLowerCase();
  const hit = (s: string) => !qq || s.toLowerCase().includes(qq);
  // 🔎 ค้นแล้วเห็นผลทุกแท็บ (กล่องละแท็บ เรียงลงมา) · กดแท็บ = ดูเฉพาะแท็บนั้น · ลบคำค้น = กลับแท็บเดิม · โหมดอัปเดตงานมีแท็บ "ทั้งหมด" ของตัวเองอยู่แล้ว
  const [searchPinned, setSearchPinned] = useState(false);
  useEffect(() => { if (!qq) setSearchPinned(false); }, [qq]);
  const allSearch = !!qq && !searchPinned && !catchUp;
  // ต้องอยู่หลัง hit — filter เรียก hit ทันที (เคยอยู่ก่อน = หน้าพัง "Cannot access before initialization" ตอนแท็บทั้งหมดมีข้อมูล)
  // เพิ่งอัปเดตขึ้นก่อน → แล้วเรียงตามขั้น (รอจ่าย → … → ปิดแล้ว)
  const allShown = (cuAllRows ?? []).filter((r) => hit(allText(r))).sort((a, b) => {
    const ra = cuRecent.indexOf(a.mo_no), rb = cuRecent.indexOf(b.mo_no);
    if (ra !== rb) return ra < 0 ? 1 : rb < 0 ? -1 : ra - rb;
    return CU_WHERE_ORDER.indexOf(a.where.key) - CU_WHERE_ORDER.indexOf(b.where.key) || (a.product_sku ?? "").localeCompare(b.product_sku ?? "");
  });
  // แท็บกำลังผลิตกรองแบรนด์ด้วย (ชิปเดียวกัน) · ชิปแบรนด์นับจากแท็บที่เปิดอยู่ (ไม่กรองด่วน)
  const wosShown = brandF ? wos.filter((w) => brandOk(w.brand)) : wos;
  // ชิปแบรนด์ = เฉพาะแท็บกำลังผลิต (รอจ่ายใช้มุมมองด่วนกรองแบรนด์แทน)
  const brandChips = tab !== "wip" ? [] : (() => {
    const src: { brand?: string | null; brand_color?: string | null }[] = wos;
    const m = new Map<string, { n: number; color: string | null }>();
    for (const r of src) { const k = r.brand || "__none__"; const e = m.get(k) ?? { n: 0, color: r.brand_color ?? null }; e.n += 1; m.set(k, e); }
    if (brandF && !m.has(brandF)) m.set(brandF, { n: 0, color: null });   // แบรนด์ที่จำไว้แต่แท็บนี้ไม่มี = ยังโชว์ชิปให้กดล้างได้
    return [...m.entries()].sort((a, b) => (a[0] === "__none__" ? 1 : b[0] === "__none__" ? -1 : b[1].n - a[1].n));
  })();
  // 🪟 หน้าตาแต่ละแท็บ — รอจ่าย: iPad แนวตั้ง = การ์ดเสมอ · "auto" = ตามมุมมองด่วน
  const pendLayout: "table" | "cards" | "cal" = dev === "ipadP" ? "cards" : tabLayout.pend === "auto" ? (view.layout === "cards" ? "cards" : "table") : tabLayout.pend;
  const layoutOf = (t: "pend" | "wip" | "qc"): "table" | "cards" | "cal" => (t === "pend" ? pendLayout : tabLayout[t] === "auto" ? "table" : tabLayout[t] as "table" | "cards" | "cal");
  const layoutToggle = (t: "pend" | "wip" | "qc") => {
    if (t === "pend" && dev === "ipadP") return null;
    const cur = layoutOf(t);
    return (
      <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white" role="group" aria-label="หน้าตาของแท็บนี้">
        {([["table", "i:table", "ตาราง"], ["cards", "i:layout-grid", "การ์ด"], ["cal", "i:calendar", "ปฏิทิน"]] as const).map(([v, ic, label]) => (
          <button key={v} type="button" onClick={() => setTabLayout(t, v)} aria-pressed={cur === v} title={label}
            className={`inline-flex ${touch ? "h-10 px-3" : "h-8 px-2.5"} items-center gap-1 text-sm ${cur === v ? "bg-blue-50 font-medium text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>
            <Icon value={ic} />{label}
          </button>
        ))}
      </div>
    );
  };
  // จัดกลุ่มตามช่าง: แถวซ้ำต่อคน (ทำร่วม) → key = id::ชื่อ · การเลือกยังเก็บเป็นเลขใบ (เลือก/เลิกแถวไหน = ทั้งใบ)
  type WoRow = WorkOrder & { _crew?: string };
  const woRows: WoRow[] = woGroup === "crew" ? wosShown.flatMap((w) => crewOf(w).map((n) => ({ ...w, _crew: n }))) : wosShown;
  const woKey = (w: WorkOrder) => ((w as WoRow)._crew ? `${w.id}::${(w as WoRow)._crew}` : w.id);
  const woSelKeys = woGroup === "crew" ? new Set(woRows.filter((r) => woSel.has(r.id)).map(woKey)) : woSel;
  const onWoSelKeys = (next: Set<string>) => {
    if (woGroup !== "crew") { setWoSel(next); return; }
    const ids = new Set(woSel);
    for (const k of woSelKeys) if (!next.has(k)) ids.delete(k.split("::")[0]);
    for (const k of next) if (!woSelKeys.has(k)) ids.add(k.split("::")[0]);
    setWoSel(ids);
  };
  const woGroupSum = (rows: WorkOrder[]) => {
    const shared = woGroup === "crew" ? rows.filter((r) => crewOf(r).length > 1).length : 0;
    return `${fmt(rows.length)} ใบ · ${fmt(rows.reduce((n, w) => n + (Number(w.qty) || 0), 0))} ชิ้น · ค้าง ${fmt(rows.reduce((n, w) => n + woLeft(w), 0))}${shared ? ` · ทำร่วม ${shared} ใบ` : ""}`;
  };
  const renderWipCard = (w: WorkOrder) => {
    const left = woLeft(w);
    const rate = (w.labor_cost ?? 0) > 0 && w.qty > 0 ? Math.round(((w.labor_cost as number) / w.qty) * 100) / 100 : 0;
    return (
      <div className="space-y-1.5">
        <div className="flex justify-center rounded-lg bg-slate-50 py-1"><HoverImage url={w.image_url ?? null} size={96} previewSize={320} /></div>
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold text-slate-800">{w.product_sku ?? "—"}</div>
          {w.product_name && w.product_name !== w.product_sku && <div className="truncate text-[12px] text-slate-400">{w.product_name}</div>}
        </div>
        <div className="truncate text-[12px] text-slate-600" title={w.assignee_name ?? undefined}>{crewOf(w).join(" + ")}{w.department_name ? <span className="text-slate-400"> · {w.department_name}</span> : null}</div>
        <div className="flex items-center justify-between gap-2 text-[12px]">
          <span className="tabular-nums text-slate-600">{fmt(w.received_qty)} / {fmt(w.qty)} ชิ้น</span>
          {left > 0 ? <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] tabular-nums text-amber-700">ค้าง {fmt(left)}</span>
            : <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700">ครบ</span>}
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>จ่าย {dueText(w.dispatch_date)}</span><span>เสร็จ {dueText(w.due_date)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-slate-400">{w.wo_no}</span>
          {rate > 0 ? <span className="text-[12px] tabular-nums text-slate-600">฿{fmt(rate)}/ชิ้น</span> : <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">ยังไม่ใส่ค่าแรง</span>}
        </div>
      </div>
    );
  };
  const qcImg = (q: QcQueueRow) => (q.image_key ? `/api/r2-image?key=${encodeURIComponent(q.image_key)}` : null);
  const renderQcCard = (q: QcQueueRow) => (
    <div className="space-y-1.5">
      <div className="flex justify-center rounded-lg bg-slate-50 py-1"><HoverImage url={qcImg(q)} size={96} previewSize={320} /></div>
      <div className="min-w-0">
        <div className="truncate text-[15px] font-semibold text-slate-800">{q.sku ?? "—"}</div>
        {q.name && q.name !== q.sku && <div className="truncate text-[12px] text-slate-400">{q.name}</div>}
      </div>
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="truncate text-slate-600">{q.worker ?? "—"}</span>
        <b className="tabular-nums text-slate-700">{fmt(q.remaining)} ชิ้น</b>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>ส่งคืน {q.received_at ? dueDateText(q.received_at.slice(0, 10)) : "—"}</span><span className="font-mono text-slate-400">{q.mo_no ?? ""}</span>
      </div>
    </div>
  );
  // 📅 ปฏิทินของแท็บ = ปฏิทินบอร์ดตัวเดิม (ลากตั้งวันได้) แต่โชว์เฉพาะงานของแท็บนี้ ตามแบรนด์/คำค้นที่กรองอยู่
  const calBox = (t: "pend" | "wip" | "qc") => {
    const wipCal = wosShown.filter((w) => hit(woText(w)));
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {layoutToggle(t)}
          {t === "wip" && (
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white text-sm" role="group" aria-label="วางตามวันไหน">
              {([["dispatch", "วันที่จ่าย", wipCal.filter((w) => !!w.dispatch_date).length], ["due", "กำหนดเสร็จ", wipCal.filter((w) => !!w.due_date).length]] as const).map(([v, label, n]) => (
                <button key={v} type="button" onClick={() => setWipCalDate(v)} aria-pressed={wipCalDate === v}
                  className={`h-8 px-3 ${wipCalDate === v ? "bg-violet-50 font-medium text-violet-700" : "text-slate-600 hover:bg-slate-50"}`}>{label} <span className="text-[11px] text-slate-400">{fmt(n)}/{fmt(wipCal.length)}</span></button>
              ))}
            </div>
          )}
          <span className="text-[11px] text-slate-400">เฉพาะงานในแท็บนี้ (ตามแบรนด์/คำค้นที่กรองอยู่){t === "wip" && wipCalDate === "dispatch" ? " · วันที่จ่ายดูอย่างเดียว — ลากตั้งวันได้ในโหมดกำหนดเสร็จ" : ""}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {t === "pend"
            ? <BoardCalendar pending={pendShown.filter((m) => hit(pendText(m)))} plans={deliveryPlans} workOrders={[]} departments={departments} canEdit={canEdit}
                moGroups={[]} groupOf={groupNameOf} onOpenMO={(id) => { const m = pending.find((x) => x.id === id); if (m) onOpenMO(m); }} onOpenWO={() => undefined}
                onReload={() => onReload?.()} hideSearch />
            : t === "wip"
              ? <BoardCalendar pending={[]} workOrders={wipCal} departments={departments} canEdit={canEdit} moGroups={[]} groupOf={groupNameOf}
                  onOpenMO={() => undefined} onOpenWO={(id) => { const w = workOrders.find((x) => x.id === id); if (w) onOpenWO(w); }}
                  onReload={() => onReload?.()} lockMode="internal" woDate={wipCalDate} hideSearch />
              : <BoardCalendar pending={[]} departments={departments} canEdit={false} moGroups={[]} groupOf={groupNameOf}
                  workOrders={qQueue.filter((q) => hit(qcText(q))).map((q) => ({ id: q.wo_id, mo_no: q.mo_no ?? "—", product_sku: q.sku, product_name: q.name, qty: q.remaining,
                    due_date: q.received_at ? q.received_at.slice(0, 10) : null, department_name: q.worker, assignee_name: null, image_url: qcImg(q), status: "qc" }))}
                  onOpenMO={() => undefined} onOpenWO={(id) => { const w = workOrders.find((x) => x.id === id); if (w) onOpenWO(w); }}
                  onReload={() => onReload?.()} lockMode="internal" woDate="received" hideSearch />}
        </div>
      </div>
    );
  };
  // เลื่อนตารางลง = ซ่อนแท็บ/ตัวกรอง (ตารางได้ที่เต็ม เหมือนแอป) · เลื่อนขึ้น/กลับบนสุด = โชว์
  // ⚡ ไม่ใช้ state — สลับด้วย data-top บนกล่อง + CSS (เดิมทุกครั้งที่ซ่อน/โชว์ ทั้งบอร์ด ~400 แถววาดใหม่กลางการเลื่อน = กระตุก)
  const topHiddenRef = useRef(false);
  const lastTop = useRef(0);
  const topLockUntil = useRef(0);
  const setTopHidden = useCallback((h: boolean) => {
    if (topHiddenRef.current === h) return;
    topHiddenRef.current = h;
    topLockUntil.current = performance.now() + 350;   // ซ่อน/โชว์แล้วความสูงตารางเปลี่ยน ตำแหน่งเลื่อนกระโดด → ไม่ตัดสินใจซ้ำช่วงสั้น ๆ (กันกระพริบไปมา)
    const el = boxRef.current;
    if (el) { if (h) el.dataset.top = "hidden"; else delete el.dataset.top; }
  }, []);
  const onTableScroll = useCallback((top: number, el?: HTMLElement) => {
    const d = top - lastTop.current; lastTop.current = top;
    if (top < 24) { setTopHidden(false); return; }
    if (performance.now() < topLockUntil.current) return;
    const atBottom = !!el && el.scrollTop + el.clientHeight >= el.scrollHeight - 4;   // ชนท้าย: ตารางสูงขึ้นแล้วตำแหน่งถอยเอง ไม่ใช่ผู้ใช้เลื่อนขึ้น
    if (d > 8 && top > 120) setTopHidden(true);
    else if (d < -24 && !atBottom) setTopHidden(false);
  }, [setTopHidden]);
  const WHERE_TONE: Record<CuWhereKey, string> = {
    pend: "bg-slate-100 text-slate-700", wip: "bg-indigo-50 text-indigo-700", qc: "bg-amber-50 text-amber-800", shelf: "bg-emerald-50 text-emerald-700",
    defect: "bg-rose-50 text-rose-700", close_wait: "bg-sky-50 text-sky-700", closed: "bg-slate-100 text-slate-400", cancelled: "bg-slate-100 text-slate-400",
  };
  const allCols: MiniColumn<CuAllRow>[] = [
    { key: "prod", header: "สินค้า", width: "minmax(15rem,2fr)", sortValue: (r) => r.product_sku ?? "", sortLabel: "รหัสสินค้า",
      cell: (r) => <div className="flex min-w-0 items-center gap-1.5"><div className="min-w-0 flex-1"><ProdCell url={r.image_url} sku={r.product_sku} name={r.product_name} /></div>
        {cuRecent.includes(r.mo_no) && <span className="shrink-0 rounded-full bg-indigo-50 px-1.5 text-[11px] text-indigo-700">เพิ่งอัปเดต</span>}{cuBtn(r.mo_no)}</div> },
    { key: "mo", header: "ใบสั่งผลิต", width: "8.5rem", sortValue: (r) => r.mo_no, cell: (r) => <span className="text-[12px] text-slate-500">{r.mo_no}</span> },
    { key: "where", header: "ตอนนี้ของอยู่ไหน", width: "minmax(16rem,2.4fr)", sortValue: (r) => CU_WHERE_ORDER.indexOf(r.where.key), sortLabel: "ขั้น",
      cell: (r) => <div className="flex flex-wrap items-center gap-1">{r.where.parts.map((x, i) => (
        <span key={i} className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] ${i === 0 ? `font-medium ${WHERE_TONE[x.key]}` : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>{x.label}{x.qty != null ? ` ${fmt(x.qty)}` : ""}</span>
      ))}</div> },
    { key: "prog", header: "จ่าย / คืน / QC", width: "minmax(9rem,1fr)", sortValue: (r) => r.dispatched,
      cell: (r) => <span className="text-[12px] tabular-nums text-slate-600">{fmt(r.dispatched)}/{fmt(r.qty)} · {fmt(r.received)} · {fmt(r.qc_pulled)}</span> },
    { key: "go", header: "", width: "8.5rem",
      cell: (r) => r.where.onBoard
        ? <button type="button" onClick={(e) => { e.stopPropagation(); pickTab(r.where.key as "pend" | "wip" | "qc"); }} className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-600 hover:bg-slate-50">ไปแท็บ{r.where.label}</button>
        : r.where.parts.some((x) => x.key === "shelf" || x.key === "defect")
          ? <a href="/master/qc-warehouse" target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2 text-[12px] text-slate-600 hover:bg-slate-50">โกดัง QC ↗</a>
          : null },
  ];
  const tabCards = ([
    ["pend", "📥", "รอจ่าย", pendShown.filter((m) => hit(pendText(m))).length, pending.length, "ยังไม่ได้จ่ายให้โต๊ะ/ช่าง"],
    ["wip", "🛠", "กำลังผลิต", wosShown.filter((w) => hit(woText(w))).length, wos.length, "จ่ายแล้ว รอช่างส่งคืน"],
    ["qc", "✅", "รอ QC รับเข้า", qQueue.filter((q) => hit(qcText(q))).length, qQueue.length, "ช่างส่งแล้ว รอตรวจ/เข้าชั้น"],
    ...(catchUp ? [["all", <Icon key="i" name="list" />, "ทั้งหมด", allShown.length, cuAllRows?.length ?? 0, "ทุกใบ (รวมที่อยู่โกดัง QC / รอปิดใบ / ปิดแล้ว 30 วัน) + บอกว่าของอยู่ไหน"]] : []),
  ] as ["pend" | "wip" | "qc" | "all", React.ReactNode, string, number, number, string][]).filter(([k]) => k === "all" || tabVisible(k));
  // แถบสรุปของแท็บ "กำลังผลิต" / "รอ QC"
  const wipCards: [string, string, string][] = [
    ["กำลังผลิต", `${fmt(wos.length)} ใบ`, `จ่ายไปแล้ว ${fmt(wos.reduce((s, w) => s + (Number(w.qty) || 0), 0))} ชิ้น`],
    ["ค้างส่งคืน", `${fmt(wos.reduce((s, w) => s + woLeft(w), 0))} ชิ้น`, `${fmt(wos.filter((w) => woLeft(w) > 0).length)} ใบยังส่งไม่ครบ`],
    ["เลยกำหนดเสร็จ", `${fmt(wos.filter((w) => woLeft(w) > 0 && !!w.due_date && w.due_date.slice(0, 10) < today).length)} ใบ`, "ยังส่งไม่ครบ และเลยวันกำหนด"],
    ["ยังไม่ใส่ค่าแรง", `${fmt(wos.filter((w) => !((w.labor_cost ?? 0) > 0)).length)} ใบ`, "ติ๊กหลายใบแล้วกด 💰 ใส่ค่าแรง"],
  ];
  const qcWait = qQueue.map((q) => (q.received_at ? Math.max(0, Math.floor((Date.now() - new Date(q.received_at).getTime()) / 86400000)) : 0));
  const qcCards: [string, string, string][] = [
    ["รอรับเข้า", `${fmt(qQueue.length)} ใบ`, "งานที่ช่างส่งมาแล้ว"],
    ["ชิ้นรอตรวจ", `${fmt(qQueue.reduce((s, q) => s + (Number(q.remaining) || 0), 0))} ชิ้น`, "รวมทุกใบที่รอรับเข้า"],
    ["รอนานสุด", qQueue.length ? `${fmt(Math.max(...qcWait))} วัน` : "—", "นับจากวันที่ช่างส่ง"],
    ["ช่างส่งวันนี้", `${fmt(qQueue.filter((q) => (q.received_at ?? "").slice(0, 10) === today).length)} ใบ`, today],
  ];
  // keys[i] = ชื่อช่องของ cards[i] ใช้ซ่อน/โชว์ตามชุดหน้าตา (dc.cards)
  const SumRow = ({ cards: all, keys }: { cards: [string, string, string][]; keys: string[] }) => {
    const cards = all.filter((_, i) => dc.cards[keys[i]] !== false);
    if (!dc.show.cards || cards.length === 0) return null;
    return (
    <div className={`grid gap-2 ${cards.length > 3 ? "grid-cols-2 md:grid-cols-4" : cards.length === 3 ? "grid-cols-3" : cards.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
      {cards.map(([label, val, sub]) => (
        <div key={label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
          <div className="text-[11px] text-slate-500">{label}</div>
          <div className={`${touch ? "text-xl" : "text-lg"} font-bold text-slate-800 tabular-nums leading-tight`}>{val}</div>
          <div className="text-[10px] text-slate-400 truncate" title={sub}>{sub}</div>
        </div>
      ))}
    </div>
    );
  };
  const pendCardKeys = canSeeMoney ? ["pend.count", "pend.value", "pend.late", "pend.noprice"] : ["pend.count", "pend.late", "pend.buy"];
  const wipCardKeys = ["wip.count", "wip.left", "wip.late", "wip.nolabor"];
  const qcCardKeys = ["qc.count", "qc.qty", "qc.oldest", "qc.today"];
  // ตัวเลือกในแผงตั้งค่าหน้าตา
  const panelCardGroups: [string, [string, string][]][] = [
    ["รอจ่าย", [["pend.count", "รอจ่าย"], ...(canSeeMoney ? [["pend.value", "มูลค่าค้างจ่าย"], ["pend.noprice", "ยังไม่ตั้งราคา"]] as [string, string][] : []), ["pend.late", "เกินกำหนด"], ["pend.buy", "รอซื้อของ (คนที่ไม่เห็นราคา)"]]],
    ["กำลังผลิต", [["wip.count", "กำลังผลิต"], ["wip.left", "ค้างส่งคืน"], ["wip.late", "เลยกำหนดเสร็จ"], ["wip.nolabor", "ยังไม่ใส่ค่าแรง"]]],
    ["รอ QC", [["qc.count", "รอรับเข้า"], ["qc.qty", "ชิ้นรอตรวจ"], ["qc.oldest", "รอนานสุด"], ["qc.today", "ช่างส่งวันนี้"]]],
  ];
  const panelColOptions: [string, string][] = pendCols.map((c) => [c.key, c.label ?? (typeof c.header === "string" ? c.header : c.key)]);

  const presetName = disp.preset === "simple" ? "👓 โหมดง่าย" : disp.preset === "custom" ? "✏️ กำหนดเอง" : "ปกติ";

  // ⛶ เต็มจอ = ตารางทับทั้งหน้าต่าง (ซ่อนเมนู/หัวหน้า ใต้ป๊อปอัป z-50) จำต่อเครื่อง
  // ปกติ = กล่องสูงพอดีถึงขอบล่างจอ (วัดตำแหน่งจริง — เดิมเดา 100vh−210px แล้วเหลือที่ว่างด้านล่าง)
  const [full, setFull] = useState(false);
  useEffect(() => { try { setFull(localStorage.getItem("wb_table_full") === "1"); } catch { /* ไม่มีที่เก็บ = ปกติ */ } }, []);
  const toggleFull = () => setFull((v) => { try { localStorage.setItem("wb_table_full", v ? "0" : "1"); } catch { /* ไม่มีที่เก็บก็ใช้ได้ */ } return !v; });
  const boxRef = useRef<HTMLDivElement>(null);
  const [fitH, setFitH] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (full) return;
    // หักแถบเมนูล่างของเชลล์ (จอเล็ก — ลอยทับเนื้อหา) ไม่งั้นแถวท้ายตารางโดนบัง
    const fit = () => {
      const el = boxRef.current; if (!el) return;
      const nr = (document.querySelector('nav[aria-label="เมนูล่าง"]') as HTMLElement | null)?.getBoundingClientRect();
      const navH = nr && nr.height > 0 && nr.top < window.innerHeight ? window.innerHeight - nr.top : 0;
      setFitH(Math.max(360, Math.floor(window.innerHeight - el.getBoundingClientRect().top - navH - 8)));
    };
    fit();
    const late = setTimeout(fit, 400);   // หัวหน้า/ข้อมูลโหลดเสร็จทีหลัง ตำแหน่งกล่องขยับ → วัดซ้ำอีกรอบ
    window.addEventListener("resize", fit);
    return () => { clearTimeout(late); window.removeEventListener("resize", fit); };
  }, [full, framePreview, tab]);
  useEffect(() => { setTopHidden(false); lastTop.current = 0; }, [tab]);
  // กล่องตาราง: สูงตายตัวพอดีจอ (flex-col) → ตารางเลื่อนในตัว + หัวตารางติดบน · เลือกหลายใบ = เว้นล่างให้แถบคำสั่งลอย
  const anySel = (tab === "pend" && selMoNos.length > 0) || (tab === "wip" && selWos.length > 0) || (tab === "qc" && qSel.size > 0);
  const boxProps = full
    ? { ref: boxRef, className: `fixed inset-0 z-40 flex flex-col gap-3 overflow-hidden bg-slate-50 p-3 sm:p-4 ${anySel ? "pb-24" : ""}` }
    : { ref: boxRef, className: `flex flex-col gap-3 overflow-hidden ${anySel ? "pb-20" : ""}`, style: { height: fitH ? `${fitH}px` : "calc(100vh - 210px)" } };
  const frameBoxProps = { ref: boxRef, className: "space-y-3 overflow-y-auto pr-1", style: { maxHeight: fitH ? `${fitH}px` : "calc(100vh - 210px)" } };
  // ค้นหา + มุมมองหน้านี้ → แถบบนแบบแอป (ของกลาง page-chrome): จอเล็ก = แถบบนเชลล์ + ปุ่มผู้ใช้ · จอคอม = แถบของหน้า
  usePageChrome({
    search: dc.show.search ? { value: tableSearch, onChange: (v: string) => { setTableSearch(v); if (!v) setScanHit(null); }, placeholder: "ค้นในบอร์ด — สินค้า / เลขใบ / ใบจ่ายงาน / ช่าง" } : null,
    actions: (
      <button type="button" onClick={() => setScanOpen(true)} title="สแกนบาร์โค้ด/QR บนใบสั่งงาน เพื่อหาใบบนบอร์ด (เครื่องยิง USB ยิงได้เลยไม่ต้องกด)"
        className={`inline-flex ${touch ? "h-11" : "h-9"} items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50`}>
        <Icon name="camera" /> สแกน
      </button>
    ),
    viewOptions: (
      <div className="space-y-2">
        {dc.show.dev && (
          <div className="flex overflow-hidden rounded-lg border border-slate-200 divide-x divide-slate-200 [&>button]:flex-1" title="มุมมองตาราง (จำไว้ที่เครื่องนี้)">
            {devBtn("pc", "💻 คอม", "มุมมองจอคอม")}{devBtn("ipadL", "📱 นอน", "iPad แนวนอน — ตารางแถวใหญ่ กดง่าย")}{devBtn("ipadP", "📱 ตั้ง", "iPad แนวตั้ง — 1 ใบ = 1 การ์ด")}
          </div>
        )}
        <button type="button" onClick={() => setMgr({ open: true, tab: "look" })}
          className="flex h-9 w-full items-center rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-700 hover:bg-slate-50">
          🎛 หน้าตา: {presetName}<span className="ml-auto text-xs text-slate-400">ปรับ ›</span>
        </button>
        <button type="button" onClick={toggleFull}
          className={`flex h-9 w-full items-center rounded-lg border px-3 text-left text-sm ${full ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
          {full ? "✕ ออกจากเต็มจอ" : "⛶ เต็มจอ"}<span className="ml-auto text-xs opacity-60">{full ? "" : "ซ่อนเมนูและหัวหน้า"}</span>
        </button>
      </div>
    ),
  });
  const fullBtn = (
    <button type="button" onClick={toggleFull} title={full ? "ออกจากโหมดเต็มจอ" : "ขยายตารางเต็มหน้าต่าง (ซ่อนเมนูและหัวหน้า) — จำไว้ที่เครื่องนี้"}
      className={`${touch ? "h-11" : "h-9"} px-3 text-sm rounded-lg border whitespace-nowrap ${full ? "bg-slate-800 border-slate-800 text-white hover:bg-slate-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
      {full ? "✕ ออกจากเต็มจอ" : "⛶ เต็มจอ"}
    </button>
  );
  const zoomStyle = dc.scale !== 100 ? { zoom: dc.scale / 100 } : undefined;   // ขยายทั้งส่วน (ตัวหนังสือ ปุ่ม รูป) — ป๊อปอัปอยู่นอกส่วนนี้ ไม่ถูกขยาย

  if (framePreview) {
    const sz = dev === "ipadP" ? IPAD_SIZE.portrait : IPAD_SIZE.landscape;
    const openUrl = `${window.location.origin}/master/work-board?view=table`;
    return (
      <div {...frameBoxProps}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-sm text-slate-600">📱 ดูแบบ iPad ของจริง — หน้าจริงขนาดเท่าเครื่อง กดใช้งานในกรอบได้เลย · สแกน QR ด้านขวาเพื่อเปิดบน iPad</p>
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden divide-x divide-slate-200" title="มุมมองตาราง (จำไว้ที่เครื่องนี้)">
            {devBtn("pc", "💻 คอม", "กลับมุมมองจอคอม")}
            {devBtn("ipadL", "📱 iPad แนวนอน", "ตารางแถวใหญ่ กดง่าย")}
            {devBtn("ipadP", "📱 iPad แนวตั้ง", "1 ใบ = 1 การ์ด")}
          </div>
          {fullBtn}
        </div>
        <DeviceIframePreview src="/master/work-board?view=table" width={sz.w} height={sz.h}
          label={dev === "ipadP" ? "📱 iPad แนวตั้ง" : "📱 iPad แนวนอน"} qr={{ openUrl }} />
      </div>
    );
  }

  return (
    <div {...boxProps}>
      {/* เต็มจอ = ทับแถบบนของเชลล์ → วาดแถบแบบแอปของหน้าเองไว้บนสุด (ค้นหา · ปุ่ม · มุมมอง) */}
      {full && <PageChromeBar variant="page" className="shrink-0" />}

      <div className={`flex min-h-0 flex-col gap-3 ${tab === "pend" ? "flex-1" : "shrink-0"}`} style={zoomStyle}>
        {catchUp && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <span className="font-medium">🔄 โหมดอัปเดตงาน</span>
            <span className="min-w-0 flex-1 text-[13px]">กดปุ่ม "🔄 อัปเดต" ท้ายชื่อสินค้า เพื่อบอกว่าใบนั้นไปถึงขั้นไหนแล้ว — ระบบติ๊กขั้นก่อนหน้าให้{cuMode === "request" ? " · อัปเดตของคุณจะส่งให้หัวหน้ายืนยันก่อน" : ""}</span>
            {cuRecent.length > 0 && (
              <span className="flex min-w-0 basis-full flex-wrap items-center gap-1 text-[12px] sm:basis-auto">
                <span className="text-amber-700">เพิ่งอัปเดต:</span>
                {cuRecent.slice(0, 5).map((no) => (
                  <button key={no} type="button" onClick={() => { setCuAll(true); setTableSearch(skuOfMo(no)); void loadCuAll(); }} title="หาใบนี้ในแท็บ ทั้งหมด"
                    className="h-6 rounded-full border border-amber-300 bg-white px-2 hover:bg-amber-100">{skuOfMo(no)}</button>
                ))}
              </span>
            )}
            {(cuApprove || cuMode === "request" || cuReqs.mine.length > 0) && (
              <button type="button" onClick={() => setCuQueueOpen(true)}
                className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-3 text-[13px] ${cuWaiting ? "border-amber-400 bg-amber-100 font-medium text-amber-900 hover:bg-amber-200" : "border-amber-300 bg-white hover:bg-amber-100"}`}>
                <Icon name="request" /> {cuApprove ? "รอยืนยัน" : "คำขอของฉัน"}{cuWaiting ? <span className="rounded-full bg-rose-600 px-1.5 text-[11px] font-semibold text-white">{cuWaiting}</span> : null}
              </button>
            )}
            <button type="button" onClick={onExitCatchUp} className="h-8 shrink-0 rounded-lg border border-amber-300 bg-white px-3 text-[13px] hover:bg-amber-100">ออกจากโหมด</button>
          </div>
        )}
        <CatchUpModal moNo={cuMo} initialTarget={cuInitTarget} onClose={() => { if (cuBatch && cuMo) { const mo = cuMo; setCuBatchRefresh((x) => ({ mo, n: (x?.n ?? 0) + 1 })); } setCuMo(null); setCuInitTarget(null); }}
          onDone={() => {
            // ⚠️ คิว "รอ QC รับเข้า" โหลดแยก — เดิมไม่โหลดใหม่หลังอัปเดต ใบที่ช่างเพิ่งส่งคืนเลยหายจากทุกแท็บจนกด F5
            onReload?.(); void loadQcQueue(); void loadCuAll();
            if (cuMo) setCuRecent((rs) => [cuMo, ...rs.filter((x) => x !== cuMo)].slice(0, 8));
          }}
          onLocate={(no, sku) => { setCuMo(null); setCuAll(true); setTableSearch(sku ?? no); void loadCuAll(); }}
          departments={departments} craftsmen={craftsmen} workOrders={workOrders}
          canMoveStaff={canMoveStaff} canAddNew={canEdit} onStaffChanged={() => onStaffChanged?.()} onDesksChanged={() => onReload?.()}
          onNext={cuNext ? () => setCuMo(cuNext) : undefined} nextLabel={cuNext ? skuOfMo(cuNext) : null}
          mode={cuMode} canApprove={cuApprove} onRequestsChanged={() => void loadCuReqs()} />
        <CatchUpBatch moNos={cuBatch} onClose={() => setCuBatch(null)}
          onDone={(saved) => {
            onReload?.(); void loadQcQueue(); void loadCuAll();
            if (saved.length) { setCuRecent((rs) => [...saved, ...rs.filter((x) => !saved.includes(x))].slice(0, 8)); setSel(new Set()); setWoSel(new Set()); setQSel(new Set()); setCuAllSel(new Set()); }
          }}
          departments={departments} craftsmen={craftsmen} workOrders={workOrders}
          mode={cuMode} canApprove={cuApprove} onRequestsChanged={() => void loadCuReqs()}
          onOpenSingle={(mo) => { setCuList([]); setCuMo(mo); }} onOpenEdit={(mo) => setCuEditMo(mo)} refresh={cuBatchRefresh}
          imageOf={(mo) => cuAllMap.get(mo)?.image_url ?? pending.find((m) => m.mo_no === mo)?.image_url ?? workOrders.find((w) => w.mo_no === mo)?.image_url ?? null} />
        <CatchUpEdit moNo={cuEditMo} departments={departments} craftsmen={craftsmen} canEdit={cuMode === "direct" || cuApprove}
          onClose={() => { if (cuBatch && cuEditMo) { const mo = cuEditMo; setCuBatchRefresh((x) => ({ mo, n: (x?.n ?? 0) + 1 })); } setCuEditMo(null); }}
          onDone={() => { onReload?.(); void loadQcQueue(); void loadCuAll(); if (cuEditMo) { const mo = cuEditMo; setCuRecent((rs) => [mo, ...rs.filter((x) => x !== mo)].slice(0, 8)); } }}
          onOpenUpdate={(mo, t) => { setCuEditMo(null); setCuList([]); setCuInitTarget(t ?? null); setCuMo(mo); }} />
        <CatchUpQueue open={cuQueueOpen} onClose={() => setCuQueueOpen(false)} queue={cuReqs.queue} mine={cuReqs.mine} canApprove={cuApprove}
          onOpenMo={(moNo) => {
            // ไล่ตรวจทีละใบ: "ใบถัดไป" ในป๊อป = คำขอถัดไปในคิว
            const list = (cuApprove ? cuReqs.queue.filter((q) => !q.mine) : cuReqs.mine.filter((q) => q.status === "pending" || q.status === "rejected")).map((q) => q.mo_no);
            setCuList([...new Set(list)]); setCuQueueOpen(false); setCuMo(moNo);
          }} />
      {scanHit && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[13px]">
          <Icon name="camera" />
          <span className="font-semibold text-indigo-900">เจอแล้ว: {scanHit.sku ?? scanHit.moNo}</span>
          <span className="min-w-0 truncate text-indigo-800/80">{scanHit.moNo}{scanHit.name && scanHit.name !== scanHit.sku ? ` · ${scanHit.name}` : ""}{scanHit.where ? ` · แท็บ${scanHit.where}` : ""}</span>
          <span className="flex-1" />
          {canEdit && scanHit.pendId && scanHit.remaining > 0 && (
            <button type="button" onClick={() => { const ids = new Set([scanHit.pendId!]); setSel(ids); openDispatchFor(ids); }}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-[12px] font-medium text-white hover:bg-indigo-700"><Icon name="truck" /> จ่ายงาน ({fmt(scanHit.remaining)})</button>
          )}
          {catchUp && <button type="button" onClick={() => { setCuList([]); setCuMo(scanHit.moNo); }} className="inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 text-[12px] text-indigo-800 hover:bg-indigo-100"><Icon name="refresh" /> อัปเดต</button>}
          {catchUp && (cuMode === "direct" || cuApprove) && <button type="button" onClick={() => setCuEditMo(scanHit.moNo)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 text-[12px] text-indigo-800 hover:bg-indigo-100"><Icon name="edit" /> แก้ไข</button>}
          <button type="button" onClick={() => setScanOpen(true)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-3 text-[12px] text-indigo-800 hover:bg-indigo-100">สแกนใบต่อไป</button>
          <button type="button" title="ล้างคำค้น ดูทุกใบ" onClick={() => { setScanHit(null); setTableSearch(""); }} className="h-8 w-8 rounded-lg text-indigo-400 hover:bg-indigo-100 hover:text-indigo-700"><Icon name="cancel" /></button>
        </div>
      )}
      <ERPModal open={scanOpen} onClose={() => setScanOpen(false)} size="sm" title="สแกนหาใบงาน">
        <div className="space-y-2">
          <p className="text-[12px] text-slate-500">สแกนบาร์โค้ดเส้น หรือ QR บนใบสั่งงาน — หรือพิมพ์เลขใบ / เลขใบจ่ายงาน แล้วกด Enter</p>
          <ScanInput paused={!scanOpen} onScan={(c) => { setScanOpen(false); findScanned(c); }} />
        </div>
      </ERPModal>
      {/* เลื่อนตารางลง = ซ่อนแท็บ/ตัวกรองให้ตารางได้ที่เต็ม (เหมือนแอป) · แตะแถบนี้หรือเลื่อนขึ้น = กลับมา
          สลับด้วย CSS: กล่องมี data-top="hidden" → แถบย่อโผล่ · ส่วนแท็บ/ตัวกรองซ่อน (ไม่ render ใหม่) */}
        <button type="button" onClick={() => setTopHidden(false)}
          className="hidden h-9 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-600 hover:bg-slate-50 [[data-top=hidden]_&]:flex">
          <span className="text-slate-400">▾</span>
          <span className="font-medium text-slate-800">{tabCards.find(([k]) => k === tab)?.[2] ?? ""}</span>
          <span className="truncate text-slate-500">
            {tab === "pend" ? `· ${view.icon} ${view.name} ` : ""}
            {brandF && tab === "wip" ? `· ${brandF === "__none__" ? "ไม่ระบุแบรนด์" : brandF}` : ""}
          </span>
          <span className="ml-auto shrink-0 text-[11px] text-slate-400">แตะเพื่อแสดงแท็บ/ตัวกรอง</span>
        </button>
      <div className="contents [[data-top=hidden]_&]:hidden">
      {/* แท็บแบบปุ่มแบ่งช่อง — ตัวเลข = จำนวนใบ (ตอนค้นหา/กรอง = จำนวนที่เจอ / ทั้งหมด) */}
      {dc.show.tabs && <div className="flex shrink-0 gap-1 rounded-xl bg-slate-100 p-1">
        {tabCards.map(([k, icon, label, found, total, sub]) => {
          const on = !allSearch && tab === k;
          const filtered = found !== total;
          return (
            <button key={k} type="button" onClick={() => pickTab(k)} title={sub}
              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 ${touch ? "h-11" : "h-9"} text-sm font-medium transition-colors ${on ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
              <span className="shrink-0">{icon}</span>
              <span className="truncate">{label}</span>
              <span className={`shrink-0 rounded-full px-2 text-xs tabular-nums ${on ? "bg-blue-100 text-blue-700" : "bg-white/80 text-slate-500"}`}>
                {fmt(filtered ? found : total)}{filtered && <span className="opacity-60">/{fmt(total)}</span>}
              </span>
            </button>
          );
        })}
      </div>}
      {qq && searchPinned && !catchUp && (
        <button type="button" onClick={() => setSearchPinned(false)} className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg px-1 text-[12px] text-blue-600 hover:underline">
          <Icon value="i:arrow-left" /> ดูผลค้นหา “{searchQ.trim()}” จากทุกแท็บ
        </button>
      )}
      {!allSearch && tab === "pend" && SumRow({ cards: sumCards, keys: pendCardKeys })}
      {/* ชิปตัวกรองด่วน + แบรนด์ (แถวเดียว เลื่อนแนวนอนด้วยนิ้ว) — จำต่อคน */}
      {!allSearch && (tab === "pend" || tab === "wip") && ((tab === "pend" && dc.show.chips) || brandChips.length > 1) && (
        <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {/* มุมมองด่วน — กดแล้วกรอง + หน้าตา (ตาราง/การ์ด) + เรียง + จัดกลุ่ม ตามที่ตั้งไว้ · ชี้ค้าง = สรุปว่าโชว์อะไร */}
          {tab === "pend" && dc.show.chips && (
            <ViewChipsBar views={views} activeId={view.id} onPick={pickView} countOf={viewCount} brandColorOf={brandColorOf} touch={touch} fmt={fmt}
              onMenu={openChipMenu} onReorder={moveChip} reserve={touch ? 300 : 260} share={brandChips.length > 1 ? 0.62 : 1}
              after={<>
                <button type="button" onClick={saveAsView} title="บันทึกสิ่งที่เปิดอยู่ (มุมมองนี้ + แบรนด์ที่กดไว้) เป็นปุ่มใหม่ แล้วตั้งชื่อ/ปรับต่อได้"
                  className={`shrink-0 ${touch ? "h-10 px-3" : "h-8 px-2.5"} rounded-full border border-dashed border-slate-300 bg-white text-xs text-slate-500 hover:bg-slate-50`}>＋ บันทึกเป็นมุมมอง</button>
                <button type="button" onClick={() => setMgr({ open: true })} title="ตั้งค่ามุมมอง — มุมมองด่วน (ทีม/ของฉัน · ใครเห็น) · หน้าตา · ส่วนหัว · คอลัมน์ — เปิดมาเจอแท็บที่ใช้ล่าสุด"
                  className={`shrink-0 ${touch ? "h-10 px-3" : "h-8 px-2.5"} rounded-full border border-dashed border-slate-300 bg-white text-xs text-slate-500 hover:bg-slate-50`}>⚙️ ตั้งค่ามุมมอง</button>
              </>} />
          )}
          {/* เมนูลัดของปุ่มมุมมอง (คลิกขวา / กดค้าง) */}
          <FloatingDropdown anchorRef={chipMenuAnchor} open={!!chipMenu} onClose={() => setChipMenu(null)} minWidth={230}>
            {chipMenu && (() => {
              const v = chipMenu;
              const mineV = kindOf(v.id) === "mine";
              const idx = views.findIndex((x) => x.id === v.id);
              const it = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent";
              return (
                <div className="rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <div className="px-3 pb-1 pt-0.5 text-[11px] text-slate-400">{v.icon} {v.name} · {mineV ? "มุมมองของฉัน" : "มุมมองของทีม"}</div>
                  <button type="button" className={it} onClick={() => void chipAction("edit", v)}>✏️ แก้มุมมองนี้</button>
                  <button type="button" className={it} onClick={() => void chipAction("copy", v)}>📄 ทำสำเนาเป็นของฉัน</button>
                  <button type="button" className={it} disabled={mineV} onClick={() => void chipAction("link", v)}
                    title={mineV ? "มุมมองของฉัน — คนอื่นเปิดไม่ได้ (แชร์เป็นมุมมองทีมก่อน)" : undefined}>🔗 คัดลอกลิงก์ส่งเพื่อน{mineV ? " (เฉพาะมุมมองทีม)" : ""}</button>
                  <div className="my-1 border-t border-slate-100" />
                  <button type="button" className={it} disabled={idx <= 0} onClick={() => void chipAction("left", v)}>← ย้ายไปซ้าย</button>
                  <button type="button" className={it} disabled={idx < 0 || idx >= views.length - 1} onClick={() => void chipAction("right", v)}>→ ย้ายไปขวา</button>
                  <div className="my-1 border-t border-slate-100" />
                  {mineV
                    ? <button type="button" className={`${it} text-rose-600`} onClick={() => void chipAction("del", v)}>🗑 ลบมุมมองนี้</button>
                    : <button type="button" className={it} onClick={() => void chipAction("hide", v)}>🙈 ซ่อนปุ่มนี้ (เฉพาะฉัน)</button>}
                </div>
              );
            })()}
          </FloatingDropdown>
          {brandChips.length > 1 && (<>
            {tab === "pend" && dc.show.chips && <span className="mx-1 h-6 w-px shrink-0 bg-slate-200" aria-hidden />}
            {brandChips.map(([b, info]) => {
              const on = brandF === b;
              return (
                <button key={b} type="button" onClick={() => setBrandF(b)} title={on ? "กดอีกครั้ง = ดูทุกแบรนด์" : `ดูเฉพาะ ${b === "__none__" ? "ใบที่ไม่ระบุแบรนด์" : `แบรนด์ ${b}`}`}
                  className={`inline-flex shrink-0 items-center gap-1.5 ${touch ? "h-10 px-4" : "h-8 px-3"} text-sm rounded-full border ${on ? "border-blue-400 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: info.color || "#94a3b8" }} aria-hidden />
                  {b === "__none__" ? "ไม่ระบุแบรนด์" : b}
                  <span className={on ? "text-blue-500" : "text-slate-400"}>{fmt(info.n)}</span>
                </button>
              );
            })}
          </>)}
        </div>
      )}
      </div>
      {allSearch && (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-2 pr-1" style={zoomStyle}>
          <div className="flex items-center gap-1.5 px-1 text-[12px] text-slate-500"><Icon value="i:search" />ผลค้นหา “{searchQ.trim()}” จากทุกแท็บ — กดแท็บด้านบน หรือ “ดูเฉพาะแท็บนี้” เพื่อดูแท็บเดียว</div>
          {tabCards.filter(([k]) => k !== "all").map(([k, icon, label, found]) => {
            const head = (
              <button type="button" onClick={() => pickTab(k)} className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left hover:bg-slate-50">
                <span className="shrink-0">{icon}</span><span className="font-semibold text-slate-800">{label}</span>
                <span className="rounded-full bg-blue-100 px-2 text-xs tabular-nums text-blue-700">{fmt(found)}</span>
                {k === "pend" && pendShown.length !== pending.length && <span className="text-[11px] text-slate-400">ในมุมมอง “{view.name}”</span>}
                <span className="ml-auto shrink-0 text-[12px] text-blue-600">ดูเฉพาะแท็บนี้ →</span>
              </button>
            );
            if (found === 0) return <div key={k} className="flex items-center gap-2 px-1 text-[12px] text-slate-400"><span>{icon}</span>{label}: ไม่พบ</div>;
            const more = found > 50 ? <button type="button" onClick={() => pickTab(k)} className="w-full px-3 py-2 text-center text-[12px] text-blue-600 hover:bg-slate-50">ดูทั้งหมด {fmt(found)} ใบ ในแท็บนี้ →</button> : null;
            return (
              <section key={k} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {head}
                {k === "pend" && <MiniTable rows={pendShown.filter((m) => hit(pendText(m))).slice(0, 50)} rowKey={(m) => m.id} columns={dev === "ipadP" ? pendCols : pendColsShown}
                  onRowClick={(m) => onOpenMO(m)} hideToolbar dense={dc.row === "s"} zebra={dc.zebra} touch={touch || dc.row === "l"} countUnit="ใบ" />}
                {k === "wip" && <MiniTable rows={wosShown.filter((w) => hit(woText(w))).slice(0, 50)} rowKey={(w) => w.id} columns={woColPrefs.visible}
                  onRowClick={(w) => onOpenWO(w)} hideToolbar dense={dc.row === "s"} zebra={dc.zebra} touch={touch || dc.row === "l"} countUnit="ใบ" />}
                {k === "qc" && <MiniTable rows={qQueue.filter((q) => hit(qcText(q))).slice(0, 50)} rowKey={(q) => q.wo_id} columns={qcColPrefs.visible}
                  hideToolbar dense={dc.row === "s"} zebra={dc.zebra} touch={touch || dc.row === "l"} countUnit="ใบ" />}
                {more}
              </section>
            );
          })}
        </div>
      )}
      {tab === "pend" && !allSearch && (<>
      {/* ลากความกว้าง / ย้าย-ซ่อนคอลัมน์ (เมนู ⋮) แล้ว → แถบให้กดบันทึกลงมุมมอง (ไม่บันทึกเองเงียบ ๆ) */}
      {layoutDirty && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] text-amber-800">
          <span>↔️ ปรับ{colsDirty ? (widthDirty ? "คอลัมน์ + ความกว้าง" : "คอลัมน์") : "ความกว้างคอลัมน์"}ของมุมมอง “{view.name}” แล้ว — ยังไม่บันทึก
            {colsDirty && !savedCols && <span className="ml-1 text-amber-700/80">(บันทึกแล้วมุมมองนี้จะใช้คอลัมน์ของตัวเอง)</span>}</span>
          <span className="ml-auto flex flex-wrap gap-1.5">
            {(isMineView || canSeeMoney) && (
              <button type="button" onClick={() => void saveLayout("view")} className="h-7 rounded-md bg-amber-600 px-3 font-medium text-white hover:bg-amber-700">
                💾 บันทึกในมุมมอง{!isMineView ? " (ทุกคนที่เห็น)" : ""}
              </button>
            )}
            {!isMineView && (
              <button type="button" onClick={() => void saveLayout("me")} className={`h-7 rounded-md px-3 ${canSeeMoney ? "border border-amber-300 bg-white" : "bg-amber-600 font-medium text-white hover:bg-amber-700"}`}>💾 บันทึกเฉพาะฉัน</button>
            )}
            <button type="button" onClick={discardLayout} className="h-7 rounded-md border border-amber-300 bg-white px-3">ย้อนกลับ</button>
          </span>
        </div>
      )}
      {pendLayout === "cal" ? calBox("pend") : <MiniTable
        rows={pendShown} rowKey={(m) => m.id} columns={dev === "ipadP" ? pendCols : pendColsShown} onRowClick={onPendRow}
        expandedKeys={expanded} renderExpanded={dc.expand ? renderPendDetail : undefined}
        onCellClick={dev !== "ipadP" ? onPendCell : undefined} activeCell={(m) => PANE_COL[openPane[m.id] ?? ""] ?? null}
        touch={touch || dc.row === "l"} dense={dc.row === "s"} zebra={dc.zebra} hideToolbar={!dc.show.tools}
        layout={pendLayout === "cards" ? "cards" : "table"} renderCard={dev === "ipadP" ? renderPendCard : renderViewCard}
        cardGrid={dev !== "ipadP" && pendLayout === "cards" ? `repeat(auto-fill,minmax(${QV_CARD_MIN[view.size]},1fr))` : undefined}
        fill stickyCols={pendLayout === "cards" ? 0 : 2} inlineActions lazyRows onScrollTop={onTableScroll}
        resizable={pendLayout === "table"} widths={effWidths} onWidthsChange={setWidthDraft} fitContent={view.fit}
        columnMenu={pendLayout === "table" ? pendColMenu : undefined}
        countUnit="ใบ"
        selectable={dc.check} selected={sel} onSelectedChange={setSel}
        actions={<div className="flex items-center gap-2 flex-wrap">
          {layoutToggle("pend")}
          {dev !== "ipadP" && dc.show.colBtn && !dc.cols && !effCols && pendLayout === "table" && <ColumnChooser state={pendColPrefs}
            note={`จำแยกกันระหว่างจอคอมกับ iPad · ${canSeeMoney ? "ราคาขาย/มูลค่าเห็นเฉพาะคนที่ดูแผนผู้บริหารได้" : "ช่องราคาขาย/มูลค่าเห็นเฉพาะผู้บริหาร"}`} />}
          {dc.show.tools && <>
          <button type="button" onClick={() => pickGroup(pendGroup === "stage" ? "none" : "stage")} title="จัดกลุ่มตามขั้นตอน: รอซื้อของ → รอของเข้า → รอเตรียม/ตัด → พร้อมจ่าย"
            className={`h-8 px-3 text-sm rounded-lg border ${pendGroup === "stage" ? "bg-amber-50 border-amber-300 text-amber-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            🪜 จัดกลุ่มตามขั้นตอน{pendGroup === "stage" ? " ✓" : ""}
          </button>
          {dev === "pc" && dc.img === "s" && <button type="button" onClick={toggleImg} title="สลับขนาดรูปในตาราง (จำไว้ให้ครั้งหน้า)"
            className="h-8 px-3 text-sm rounded-lg border bg-white border-slate-200 text-slate-600 hover:bg-slate-50">🖼 รูป{imgBig ? "เล็ก" : "ใหญ่"}</button>}
          <select value={pendGroup} onChange={(e) => pickGroup(e.target.value as "none" | "group" | "ready" | "stage" | "brand")} className={grpSelectCls} title="จัดกลุ่มตาราง">
            <option value="none">ไม่จัดกลุ่ม</option>
            <option value="stage">จัดกลุ่มตามขั้นตอน</option>
            <option value="brand">จัดกลุ่มตามแบรนด์</option>
            <option value="group">จัดกลุ่มตามกลุ่ม</option>
            <option value="ready">จัดกลุ่มตามความพร้อม</option>
          </select>
          </>}
        </div>}
        searchText={pendText} hideSearch
        searchValue={searchQ} onSearchChange={setTableSearch}
        groupBy={pendGroup === "group" ? (m) => groupNameOf(m.mo_no) ?? "— ยังไม่จับกลุ่ม —"
          : pendGroup === "ready" ? (m) => (m.ready ? "✅ พร้อมจ่าย" : "⏳ ยังไม่พร้อม")
          : pendGroup === "stage" ? (m) => STAGE_META[stageOf(m, prog?.[m.mo_no])][0]
          : pendGroup === "brand" ? (m) => (m.brand ? `${m.brand}${m.brand_oem ? " · OEM" : ""}` : NO_BRAND) : undefined}
        groupOrder={pendGroup === "stage" ? stageOrder : pendGroup === "brand" ? (g) => (g === NO_BRAND ? 1 : 0) : undefined}
        groupLabel={pendGroup === "group" ? "จัดกลุ่มตามกลุ่ม" : pendGroup === "stage" ? "จัดกลุ่มตามขั้นตอน" : pendGroup === "brand" ? "จัดกลุ่มตามแบรนด์" : "จัดกลุ่มตามความพร้อม"}
        grouped={pendGroup !== "none"} onGroupedChange={(v) => pickGroup(v ? (pendGroup === "none" ? lastGroupRef.current : pendGroup) : "none")}
        groupExtra={groupSum}
        footnote={dc.show.foot ? `${dc.expand ? (dev === "ipadP" ? `${touch ? "แตะ" : "กด"}การ์ด = กางรายละเอียด (สลับแท็บได้)` : `${touch ? "แตะ" : "กด"}ช่องไหน = กางรายละเอียดเรื่องนั้น (ซื้อของ → BOM · สินค้า → รายละเอียดงาน · กำหนดส่ง → แก้วัน/งวดส่ง · เตรียม/ตัด → ติ๊กได้ · เหลือ → จ่ายงาน)`) : `${touch ? "แตะ" : "กด"}แถว = เปิดเช็กลิสต์`} · 📋 = เปิดเช็กลิสต์เต็ม${dc.stage === "dots" ? ` · จุดขั้นตอน: เขียว = เสร็จ · วงส้ม = ขั้นที่ค้างอยู่ · วงฟ้า = ทำไปบางส่วน${touch ? "" : " (ชี้ที่จุดเพื่อดูตัวเลข)"}` : ""}${canSeeMoney ? ` · ราคาต่ำกว่า ฿${PRICE_MIN} หรือยังไม่ตั้ง = ไม่นับรวมยอด` : ""}` : undefined}
        emptyText={pending.length ? `ไม่มีใบในมุมมอง “${view.name}”` : "ไม่มีงานรอจ่าย"}
        noMatchText={(q) => `ไม่พบ “${q}” ในมุมมอง “${view.name}”`}
      />}
      </>)}
      </div>
      {assignOpen &&<AssignToGroupModal moNos={selMoNos} onClose={() => setAssignOpen(false)} onDone={() => { setSel(new Set()); void loadGroups(); onReload?.(); }} />}
      {groupFor && <AssignToGroupModal moNos={groupFor} onClose={() => setGroupFor(null)} onDone={() => { setGroupFor(null); void loadGroups(); onReload?.(); }} />}
      {dueOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setDueOpen(false)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-800">📅 แก้วันกำหนด</h3>
            <p className="mt-0.5 mb-3 text-xs text-slate-500">ตั้งวันใหม่ให้ใบที่เลือก <b>{selMoNos.length}</b> ใบ</p>
            <div className="mb-3 flex gap-1.5">
              {([["due", "📦 นัดส่งลูกค้า"], ["internal", "🪑 ส่งงานภายใน"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setDueField(k)}
                  className={`h-8 flex-1 rounded-lg border text-xs font-medium ${dueField === k ? "bg-amber-600 text-white border-amber-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{label}</button>
              ))}
            </div>
            {dueField === "internal" && <p className="mb-2 text-[11px] text-slate-400">ใบจ่ายงานที่ยังทำอยู่ของใบเหล่านี้จะขยับวันตามให้ด้วย</p>}
            <input type="date" value={dueVal} onChange={(e) => setDueVal(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" />
            <button onClick={() => setDueVal("")} className="mt-1.5 text-[11px] text-slate-400 underline hover:text-slate-600">ล้างวัน (ตั้งเป็นไม่กำหนด)</button>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDueOpen(false)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
              <button onClick={() => void applyDue()} disabled={dueSaving} className="h-9 rounded-lg bg-amber-600 px-5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">{dueSaving ? "กำลังบันทึก…" : "บันทึก"}</button>
            </div>
          </div>
        </div>
      )}
      {/* จ่ายงาน — ใบเดียว ("จ่ายงานใบนี้") = แถวจ่าย เลือกจำนวน/แบ่งหลายคน (./dispatch-lines) · หลายใบ = โต๊ะเดียวกัน + จำนวนต่อใบ
          ใช้ของกลางชุดเดียวกับป๊อปจ่ายงานปกติ (ERPModal + CrewPick + กฎงานเหมา) */}
      {(() => {
        const dept = departments.find((d) => d.id === dispDeptId) ?? null;
        const isHire = !!dept && /เหมา/.test(dept.name);
        const deptCrafts = !dept ? [] : (isHire ? craftsmen : craftsmen.filter((c) => c.department_id === dept.id));
        const single = selPend.length === 1 ? selPend[0] : null;
        const deskOpts = departments.filter((d) => stageOfDept(d.name) !== "cut" && d.show_on_board !== false);
        const deskLabel = (d: { id: string; name: string }) => { const n = craftsmen.filter((c) => c.department_id === d.id).length; return `${d.name}${n ? ` · ${n} คน` : " · ยังไม่มีคน"}`; };
        const lineChk = single ? dispLinesCheck(dispLines, single.remaining, departments) : null;
        // จัดคนในโต๊ะ = โต๊ะของแถวแรก (ใบเดียว) / โต๊ะที่เลือก (หลายใบ)
        const staffDept = single ? departments.find((d) => d.id === dispLines[0]?.deptId) ?? null : dept;
        const qtyOf = (m: PendingMO) => { const v = dispQtyBy[m.id]; return v == null || v.trim() === "" ? m.remaining : Math.max(0, Number(v) || 0); };
        const totalQty = selPend.reduce((n, m) => n + qtyOf(m), 0);
        const overMo = selPend.find((m) => qtyOf(m) > m.remaining + 0.0001);
        const block = single ? (lineChk!.errors[0] ?? "") : !dept ? "เลือกโต๊ะก่อน" : (isHire && dispCrew.length === 0) ? "งานเหมา ต้องเลือกช่างก่อน"
          : overMo ? `${overMo.product_sku ?? overMo.mo_no} จ่ายได้ไม่เกิน ${fmt(overMo.remaining)} ชิ้น` : totalQty <= 0 ? "ใส่จำนวนอย่างน้อย 1 ใบ" : "";
        return (
          <ERPModal open={dispOpen} onClose={() => { if (!dispBusy) setDispOpen(false); }} size="md"
            title={single ? `🧰 จ่ายงาน ${single.product_sku ?? single.mo_no}` : `🧰 จ่ายงาน ${selPend.length} ใบ${dept ? ` → ${dept.name}` : ""}`}
            footer={<>
              <span className={`mr-auto text-[11px] ${!dispMsg && block ? "text-rose-600" : "text-slate-400"}`}>{dispMsg || block}</span>
              <button onClick={() => setDispOpen(false)} disabled={dispBusy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
              <button onClick={() => void (single ? dispatchLines() : dispatchSelected())} disabled={dispBusy || !!block}
                title={block}
                className="h-9 px-4 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                {dispBusy ? "กำลังจ่าย..." : single ? `ยืนยันจ่ายงาน ${fmt(lineChk!.total)} ชิ้น${lineChk!.n > 1 ? ` (${lineChk!.n} ใบจ่าย)` : ""}` : `ยืนยันจ่ายงาน ${selPend.length} ใบ`}
              </button>
            </>}>
            <div className="space-y-3">
              {single ? (
                <DispatchLines lines={dispLines} onChange={setDispLines} remaining={single.remaining} desks={deskOpts} deskLabel={deskLabel}
                  craftsmen={craftsmen} workOrders={workOrders} defaultRate={dispRateBy[single.id] ?? ""} check={lineChk!} />
              ) : (
                <p className="text-[11px] text-slate-400">
                  จ่าย <b>{selPend.length}</b> ใบ · รวม <b>{fmt(totalQty)}</b> ชิ้น — แก้จำนวนต่อใบได้ในรายการด้านล่าง (จ่ายไม่ครบ = ที่เหลือค้างรอจ่าย)
                </p>
              )}

              {!single && <label className="block"><span className="text-[11px] text-slate-500">โต๊ะ/แผนกที่จ่าย</span>
                <select value={dispDeptId} onChange={(e) => { setDispDeptId(e.target.value); setDispCrew([]); }}
                  className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">— เลือกโต๊ะ —</option>
                  {departments.filter((d) => stageOfDept(d.name) !== "cut" && d.show_on_board !== false).map((d) => {
                    const n = craftsmen.filter((c) => c.department_id === d.id).length;
                    return <option key={d.id} value={d.id}>{d.name}{n ? ` · ${n} คน` : " · ยังไม่มีคน"}</option>;
                  })}
                </select>
              </label>}
              {/* 👥 จัดคนในโต๊ะได้ในป๊อปนี้เลย (ย้าย = เฉพาะสิทธิ์ฝ่ายบุคคล) */}
              {staffDept && (
                <div className="-mt-1.5 flex items-center gap-2 text-[12px]">
                  <span className="text-slate-500">👥 {craftsmen.filter((c) => c.department_id === staffDept.id).length} คนในโต๊ะ{single ? ` ${staffDept.name}` : ""}</span>
                  <button type="button" onClick={() => setDeskPanel((o) => !o)} className="text-violet-700 hover:underline">{deskPanel ? "ปิดจัดคน ▴" : "จัดคนในโต๊ะ ▾"}</button>
                </div>
              )}
              {staffDept && deskPanel && (
                <DeskStaffPanel dept={staffDept} desks={departments} people={craftsmen} canMove={canMoveStaff} canAddNew={canEdit} onChanged={() => onStaffChanged?.()}
                  wos={workOrders} onDesksChanged={(focus) => {
                    onReload?.();
                    if (single) setDispLines((ls) => ls.map((l, i) => (i === 0 ? { ...l, deptId: focus ?? "", crewIds: [] } : l)));
                    else setDispDeptId(focus ?? "");
                  }} />
              )}

              {!single && dept && (
                <div>
                  <span className="text-[11px] text-slate-500">{isHire ? "👥 คนรับงาน (งานเหมา — ต้องเลือก *)" : `👥 คนรับงานใน ${dept.name} — กดได้หลายคน`}</span>
                  <div className="mt-1">
                    <CrewPick people={deptCrafts} value={dispCrew} onChange={setDispCrew} required={isHire} recent={lastCrewIds(workOrders, dept.id, deptCrafts)} />
                  </div>
                </div>
              )}

              <div><span className="text-[11px] text-slate-500">วันที่จ่าย <span className="text-slate-400">— ตั้งต้นวันนี้ · ย้อนวันได้ถ้าคีย์ตามหลัง</span></span>
                <div className="mt-0.5"><DispatchDatePick value={dispDate2} onChange={setDispDate2} /></div>
              </div>

              <label className="block"><span className="text-[11px] text-slate-500">กำหนดเสร็จ <span className="text-slate-400">— เว้นว่าง = ใช้วันส่งภายใน/ส่งลูกค้าของแต่ละใบ</span></span>
                <input type="date" value={dispDue2} onChange={(e) => setDispDue2(e.target.value)}
                  className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </label>

              {!single && <label className="block">
                <span className="text-[11px] text-slate-500">💰 ใส่ค่าแรง/ชิ้น ให้ทุกใบพร้อมกัน <span className="text-slate-400">— หรือแก้รายใบด้านล่าง</span></span>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <input type="number" min={0} step="any" value={dispRate} onChange={(e) => setDispRate(e.target.value)} placeholder="—"
                    className="w-28 h-9 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <button type="button" onClick={() => {
                    const v = dispRate.trim();
                    setDispRateBy(Object.fromEntries(selPend.map((m) => [m.id, v])));
                  }} className="h-9 px-3 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">⬇ ลงทุกใบ</button>
                  <button type="button" onClick={() => {
                    // กลับไปใช้ค่าตั้งต้นจากสูตรของแต่ละสินค้า
                    const init: Record<string, string> = {};
                    for (const m of selPend) { const r = rateOf(m); if (r > 0) init[m.id] = String(r); }
                    setDispRateBy(init); setDispRate("");
                  }} className="h-9 px-3 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">↺ ใช้ค่าจากสูตร</button>
                </div>
              </label>}

              {!single && (() => {
                const sumLabor = selPend.reduce((n, m) => n + (Number(dispRateBy[m.id]) || 0) * qtyOf(m), 0);
                const noRate = selPend.filter((m) => !(Number(dispRateBy[m.id]) > 0)).length;
                return (
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 text-[11px] text-slate-500">
                      <span>ใบที่จะจ่าย ({selPend.length}) · จำนวน (ตั้งต้น = ที่เหลือ) · ค่าแรง/ชิ้น ตั้งต้นจากสูตร</span>
                      <span>รวมค่าแรง <b className="text-slate-700">฿{fmt(sumLabor)}</b></span>
                    </div>
                    <div className="divide-y divide-slate-50 max-h-52 overflow-y-auto">
                      {selPend.map((m) => {
                        const r = Number(dispRateBy[m.id]) || 0;
                        return (
                          <div key={m.id} className="flex items-center gap-2 px-3 py-1 text-[12px]">
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-slate-700">{m.product_sku} · {m.product_name}</span>
                              <span className="block font-mono text-[10px] text-slate-400">{m.mo_no} · เหลือ {fmt(m.remaining)} ชิ้น</span>
                            </span>
                            <input type="number" min={0} max={m.remaining} step="any" value={dispQtyBy[m.id] ?? String(m.remaining)}
                              onChange={(e) => setDispQtyBy((p) => ({ ...p, [m.id]: e.target.value }))}
                              title={`จำนวนที่จ่ายใบนี้ (ไม่เกิน ${fmt(m.remaining)} · 0 = ไม่จ่ายใบนี้ · ที่เหลือค้างรอจ่าย)`}
                              className={`w-20 h-8 px-2 text-sm text-right border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 shrink-0 ${qtyOf(m) > m.remaining + 0.0001 ? "border-rose-400 bg-rose-50" : qtyOf(m) < m.remaining ? "border-amber-300 bg-amber-50/50" : "border-slate-200"}`} />
                            <input type="number" min={0} step="any" value={dispRateBy[m.id] ?? ""} placeholder="—"
                              onChange={(e) => setDispRateBy((p) => ({ ...p, [m.id]: e.target.value }))}
                              title="ค่าแรง/ชิ้น ของใบนี้ (เว้นว่าง = ให้ระบบเติมจากสูตรตอนบันทึก)"
                              className="w-20 h-8 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 shrink-0" />
                            <span className="w-24 text-right tabular-nums text-slate-600 shrink-0">{r > 0 ? `฿${fmt(r * qtyOf(m))}` : "—"}</span>
                          </div>
                        );
                      })}
                    </div>
                    {noRate > 0 && (
                      <div className="px-3 py-1.5 bg-amber-50 border-t border-amber-100 text-[11px] text-amber-700">
                        มี {noRate} ใบที่ยังไม่มีค่าแรง — จ่ายได้ ระบบจะเติมจากค่าแรงของใบสั่งผลิต/ราคากลางในสูตรให้ตอนบันทึก
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </ERPModal>
        );
      })()}
      {tab === "wip" && !allSearch && (<div className="flex min-h-0 flex-1 flex-col gap-3" style={zoomStyle}>
      <div className="contents [[data-top=hidden]_&]:hidden">{SumRow({ cards: wipCards, keys: wipCardKeys })}</div>
      {layoutOf("wip") === "cal" ? calBox("wip") : <MiniTable
        key={`wo-${woGroup}`}
        rows={woRows} rowKey={woKey} columns={woColPrefs.visible}
        layout={layoutOf("wip") === "cards" ? "cards" : "table"} renderCard={renderWipCard}
        cardGrid={layoutOf("wip") === "cards" ? "repeat(auto-fill,minmax(210px,1fr))" : undefined}
        fill stickyCols={layoutOf("wip") === "cards" ? 0 : 1} inlineActions lazyRows onScrollTop={onTableScroll}
        touch={touch || dc.row === "l"} dense={dc.row === "s"} zebra={dc.zebra} hideToolbar={!dc.show.tools}
        onRowClick={(w) => { if (woSel.size > 0) setWoSel((prev) => { const n = new Set(prev); n.has(w.id) ? n.delete(w.id) : n.add(w.id); return n; }); else onOpenWO(w); }}
        countUnit="ใบ"
        selectable={dc.check} selected={woSelKeys} onSelectedChange={onWoSelKeys}
        actions={<div className="flex items-center gap-2 flex-wrap">
          {layoutToggle("wip")}
          {dc.show.colBtn && layoutOf("wip") === "table" && <ColumnChooser state={woColPrefs} note="จำแยกกันระหว่างจอคอมกับ iPad" />}
          {dc.show.tools && <select value={woGroup} onChange={(e) => setWoGroup(e.target.value as "none" | "group" | "status" | "crew" | "desk")} className={grpSelectCls} title="จัดกลุ่มตาราง">
            <option value="none">ไม่จัดกลุ่ม</option>
            <option value="crew">จัดกลุ่มตามช่าง</option>
            <option value="desk">จัดกลุ่มตามโต๊ะ</option>
            <option value="group">จัดกลุ่มตามกลุ่ม</option>
            <option value="status">จัดกลุ่มตามสถานะ</option>
          </select>}
        </div>}
        searchText={woText} hideSearch
        searchValue={searchQ} onSearchChange={setTableSearch}
        groupBy={woGroup === "group" ? (w) => groupNameOf(w.mo_no) ?? "— ยังไม่จับกลุ่ม —" : woGroup === "status" ? (w) => (WO_STATUS[w.status]?.label ?? w.status)
          : woGroup === "crew" ? (w) => (w as WoRow)._crew ?? "—" : woGroup === "desk" ? (w) => w.department_name || "— ไม่ระบุโต๊ะ —" : undefined}
        groupLabel={woGroup === "group" ? "จัดกลุ่มตามกลุ่ม" : woGroup === "status" ? "จัดกลุ่มตามสถานะ" : woGroup === "crew" ? "จัดกลุ่มตามช่าง" : "จัดกลุ่มตามโต๊ะ"} defaultGrouped={woGroup !== "none"}
        groupExtra={woGroup === "crew" || woGroup === "desk" ? woGroupSum : undefined}
        footnote={woGroup === "crew" ? "งานที่ทำร่วมหลายคน ขึ้นในกลุ่มของทุกคน (จำนวนแถวจึงอาจมากกว่าจำนวนใบ)" : undefined}
        emptyText="ยังไม่มีงานที่จ่าย"
        noMatchText={(q) => `ไม่พบ “${q}” ในแท็บกำลังผลิต`}
      />}
      </div>)}
      {/* ✅ รอ QC รับเข้า — งานที่ช่างส่งมาแล้ว รอดึงเข้าชั้น (คิวเดียวกับหน้าโกดัง QC) จัดการจบในหน้าเดียว */}
      {tab === "qc" && qcSectionOn && !allSearch && (<div className="flex min-h-0 flex-1 flex-col gap-3" style={zoomStyle}>
        <div className="contents [[data-top=hidden]_&]:hidden">{SumRow({ cards: qcCards, keys: qcCardKeys })}</div>
        {layoutOf("qc") === "cal" ? calBox("qc") : <MiniTable
          rows={qQueue} rowKey={(q) => q.wo_id}
          layout={layoutOf("qc") === "cards" ? "cards" : "table"} renderCard={renderQcCard}
          cardGrid={layoutOf("qc") === "cards" ? "repeat(auto-fill,minmax(200px,1fr))" : undefined}
          fill stickyCols={layoutOf("qc") === "cards" ? 0 : 1} inlineActions lazyRows onScrollTop={onTableScroll}
          touch={touch || dc.row === "l"} dense={dc.row === "s"} zebra={dc.zebra} hideToolbar={!dc.show.tools}
          columns={qcColPrefs.visible}
          countUnit="ใบ"
          selectable={dc.check} selected={qSel} onSelectedChange={setQSel}
          actions={<div className="flex items-center gap-2 flex-wrap">
            {layoutToggle("qc")}
            {dc.show.colBtn && layoutOf("qc") === "table" && <ColumnChooser state={qcColPrefs} note="จำแยกกันระหว่างจอคอมกับ iPad" />}

            <a href="/master/qc-warehouse" className="h-8 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">เปิดโกดัง QC ↗</a>
          </div>}
          searchText={qcText} hideSearch
          searchValue={searchQ} onSearchChange={setTableSearch}
          emptyText="ไม่มีงานรอรับเข้า QC"
          noMatchText={(q) => `ไม่พบ “${q}” ในแท็บรอ QC`}
        />}
      </div>)}
      {/* 🗂 ทั้งหมด (โหมดอัปเดตงาน) — ทุกใบ + ตอนนี้ของอยู่ไหน (กติกา cuLocate) */}
      {tab === "all" && (<div className="flex min-h-0 flex-1 flex-col gap-3" style={zoomStyle}>
        <MiniTable
          rows={allShown} rowKey={(r) => r.mo_no}
          selectable={dc.check} selected={cuAllSel} onSelectedChange={setCuAllSel}
          fill stickyCols={1} inlineActions lazyRows onScrollTop={onTableScroll}
          touch={touch || dc.row === "l"} dense={dc.row === "s"} zebra={dc.zebra} hideToolbar={!dc.show.tools}
          columns={allCols} countUnit="ใบ"
          actions={<a href="/master/qc-warehouse" className="h-8 px-3 inline-flex items-center text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">เปิดโกดัง QC ↗</a>}
          searchText={allText} hideSearch
          searchValue={searchQ} onSearchChange={setTableSearch}
          emptyText={cuAllRows ? "ไม่มีใบสั่งผลิต" : "กำลังโหลดรายการทั้งหมด…"}
          noMatchText={(q) => `ไม่พบ “${q}” — ลองค้นด้วยรหัสสินค้า หรือเลขใบสั่งผลิต`}
        />
      </div>)}

      <ViewSettingsModal open={mgr.open} onClose={() => { setPreviewView(null); setMgr({ open: false }); }} isAdmin={canSeeMoney}
        team={qvStore.team} mine={qvStore.mine} onSave={saveViews} brands={qvBrands} colOptions={panelColOptions} defaultCols={pendColPrefs.visible.map((c) => c.key)}
        disp={disp} currentCols={pendColPrefs.visible.map((c) => c.key)} cardGroups={panelCardGroups}
        openTab={mgr.tab ?? null} focus={{ kind: isMineView ? "mine" : "team", id: baseView.id }} openSel={mgr.sel ?? null} newMine={mgr.newMine ?? null} onPreview={setPreviewView}
        countOf={viewCount} total={pending.length} />
      {/* แถบคำสั่งลอยด้านล่าง (ของกลาง BulkActionBar) — โผล่เมื่อติ๊กเลือกหลายใบ แทนปุ่มกระจายบนหัวตาราง */}
      <BulkActionBar count={tab === "pend" ? selMoNos.length : 0} unit="ใบ" onClear={() => setSel(new Set())} spacer={false}>
        {catchUp && <button type="button" onClick={() => setCuBatch(selMoNos)} title="อัปเดตหลายใบในตารางเดียว — ใส่รายละเอียดทีละใบ หรือใส่ทั้งหมดตามใบแรก" className="inline-flex h-9 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700"><Icon name="refresh" /> อัปเดตเป็นชุด</button>}
        <button type="button" onClick={() => setAssignOpen(true)} className="h-9 rounded-lg bg-violet-500 px-3 text-sm font-medium text-white hover:bg-violet-600">🗂 จับเข้ากลุ่ม</button>
        <button type="button" onClick={() => setDueOpen(true)} className="h-9 rounded-lg bg-amber-500 px-3 text-sm font-medium text-white hover:bg-amber-600">📅 แก้วันกำหนด</button>
        {canEdit && <button type="button" onClick={() => openDispatchFor(sel)} className="h-9 rounded-lg bg-emerald-500 px-3 text-sm font-medium text-white hover:bg-emerald-600">🚚 จ่ายงาน</button>}
      </BulkActionBar>
      <BulkActionBar count={tab === "wip" ? selWos.length : 0} unit="ใบ" onClear={() => setWoSel(new Set())} spacer={false}>
        {catchUp && <button type="button" onClick={() => setCuBatch([...new Set(selWos.map((w) => w.mo_no).filter((x): x is string => !!x))])} title="อัปเดตหลายใบในตารางเดียว — ใส่รายละเอียดทีละใบ หรือใส่ทั้งหมดตามใบแรก" className="inline-flex h-9 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700"><Icon name="refresh" /> อัปเดตเป็นชุด</button>}
        {canEdit && <button type="button" onClick={openQc} title="ส่งงานที่ติ๊กไว้เข้า QC (ลงวันที่ย้อนหลังได้)" className="h-9 rounded-lg bg-emerald-500 px-3 text-sm font-medium text-white hover:bg-emerald-600">📤 ส่งงาน QC</button>}
        <button type="button" onClick={() => setWoLaborOpen(true)} className="h-9 rounded-lg bg-indigo-500 px-3 text-sm font-medium text-white hover:bg-indigo-600">💰 ใส่ค่าแรง</button>
      </BulkActionBar>
      <BulkActionBar count={tab === "qc" && (canEdit || catchUp) ? qSel.size : 0} unit="ใบ" onClear={() => setQSel(new Set())} spacer={false}>
        {catchUp && <button type="button" onClick={() => setCuBatch([...new Set(qQueue.filter((q) => qSel.has(q.wo_id)).map((q) => q.mo_no).filter((x): x is string => !!x))])} title="อัปเดตหลายใบในตารางเดียว — ใส่รายละเอียดทีละใบ หรือใส่ทั้งหมดตามใบแรก" className="inline-flex h-9 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700"><Icon name="refresh" /> อัปเดตเป็นชุด</button>}
        {canEdit && <button type="button" onClick={openRecv} className="h-9 rounded-lg bg-teal-500 px-3 text-sm font-medium text-white hover:bg-teal-600">📥 รับเข้าชั้น</button>}
      </BulkActionBar>
      <BulkActionBar count={tab === "all" && catchUp ? cuAllSel.size : 0} unit="ใบ" onClear={() => setCuAllSel(new Set())} spacer={false}>
        {catchUp && <button type="button" onClick={() => setCuBatch((cuAllRows ?? []).filter((r) => cuAllSel.has(r.mo_no) && r.status !== "done" && r.status !== "cancelled").map((r) => r.mo_no))} title="อัปเดตหลายใบในตารางเดียว — ใส่รายละเอียดทีละใบ หรือใส่ทั้งหมดตามใบแรก" className="inline-flex h-9 items-center gap-1 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700"><Icon name="refresh" /> อัปเดตเป็นชุด</button>}
      </BulkActionBar>
      {/* ป๊อปรับเข้าชั้น QC (หลายใบ) */}
      {(() => {
        const list = qQueue.filter((q) => qSel.has(q.wo_id));
        const sumGood = list.reduce((n, q) => n + (Number(recvRows[q.wo_id]?.good) || 0), 0);
        const sumBad = list.reduce((n, q) => n + (Number(recvRows[q.wo_id]?.bad) || 0), 0);
        return (
          <ERPModal open={recvOpen} onClose={() => { if (!recvBusy) setRecvOpen(false); }} size="md"
            title={`📥 รับเข้า QC ${list.length} ใบ`}
            footer={<>
              <span className="mr-auto text-[11px] text-slate-400">{recvMsg}</span>
              <button onClick={() => setRecvOpen(false)} disabled={recvBusy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
              <button onClick={() => void submitRecv()} disabled={recvBusy || !recvShelf || (sumGood + sumBad) <= 0}
                className="h-9 px-4 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50">
                {recvBusy ? "กำลังรับเข้า…" : `✓ รับเข้า ${list.length} ใบ`}
              </button>
            </>}>
            <div className="space-y-3">
              <p className="text-[11px] text-slate-400">รับเข้าชั้นรวม <b>{fmt(sumGood)}</b> ชิ้นดี{sumBad > 0 ? <> · <b className="text-rose-600">{fmt(sumBad)}</b> ชิ้นเสีย</> : null} — ของเสียจะเข้าชั้นของเสียให้อัตโนมัติ + แจ้งเตือนช่าง</p>

              <label className="block"><span className="text-[11px] text-slate-500">ชั้นที่จะรับเข้า</span>
                <select value={recvShelf} onChange={(e) => setRecvShelf(e.target.value)}
                  className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                  <option value="">— เลือกชั้น —</option>
                  {qShelves.map((sh) => <option key={sh.id} value={sh.id}>{sh.name}</option>)}
                </select>
              </label>

              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500">ใบที่จะรับเข้า ({list.length}) · แยกของดี/ของเสียรายใบได้</div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                  {list.map((q) => {
                    const row = recvRows[q.wo_id] ?? { good: "", bad: "", reason: "" };
                    const over = (Number(row.good) || 0) + (Number(row.bad) || 0) > q.remaining;
                    const put = (patch: Partial<{ good: string; bad: string; reason: string }>) =>
                      setRecvRows((p) => ({ ...p, [q.wo_id]: { ...(p[q.wo_id] ?? { good: "", bad: "", reason: "" }), ...patch } }));
                    return (
                      <div key={q.wo_id} className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-700 truncate">{q.sku ?? q.name}</div>
                            <div className="text-[10px] text-slate-400 truncate">{q.mo_no ?? "—"} · {q.worker ?? "—"} · รอรับเข้า {fmt(q.remaining)}</div>
                          </div>
                          <input type="number" min={0} step="any" value={row.good} title="จำนวนของดี"
                            onChange={(e) => put({ good: e.target.value })}
                            className={`w-20 h-8 px-2 text-sm text-right border rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 shrink-0 ${over ? "border-rose-300 bg-rose-50" : "border-slate-200"}`} />
                          <input type="number" min={0} step="any" value={row.bad} placeholder="เสีย" title="จำนวนของเสีย"
                            onChange={(e) => put({ bad: e.target.value })}
                            className="w-16 h-8 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-400 shrink-0" />
                        </div>
                        {(Number(row.bad) || 0) > 0 && (
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[11px] text-rose-500 shrink-0">สาเหตุของเสีย</span>
                            <select value={row.reason} onChange={(e) => put({ reason: e.target.value })}
                              className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white flex-1">
                              <option value="">— ไม่ระบุ —</option>
                              {qReasons.map((rs) => <option key={rs.id} value={rs.name}>{rs.name}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </ERPModal>
        );
      })()}

      {/* 📤 ส่งงานเข้า QC หลายใบ — ใช้ของกลาง ERPModal · ลงวันที่ได้ (ตั้งต้นวันนี้) */}
      {(() => {
        const list = wos.filter((w) => woSel.has(w.id));
        const sumQty = list.reduce((n, w) => n + (Number(qcRows[w.id]?.qty) || 0), 0);
        const sumWage = list.reduce((n, w) => n + (Number(qcRows[w.id]?.wage) || 0), 0);
        const noWage = list.filter((w) => (qcRows[w.id]?.wage ?? "").trim() === "").length;
        return (
          <ERPModal open={qcOpen} onClose={() => { if (!qcBusy) setQcOpen(false); }} size="md"
            title={`📤 ส่งงานเข้า QC ${list.length} ใบ`}
            footer={<>
              <span className="mr-auto text-[11px] text-slate-400">{qcMsg}</span>
              <button onClick={() => setQcOpen(false)} disabled={qcBusy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
              <button onClick={() => void submitQc()} disabled={qcBusy || sumQty <= 0}
                className="h-9 px-4 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                {qcBusy ? "กำลังส่ง…" : `✓ ส่งงาน ${list.length} ใบ`}
              </button>
            </>}>
            <div className="space-y-3">
              <p className="text-[11px] text-slate-400">ส่งเข้า QC รวม <b>{fmt(sumQty)}</b> ชิ้น — งานจะไปโผล่ที่ <b>โกดัง QC</b> และมีแจ้งเตือนให้ฝ่าย QC</p>

              <label className="block"><span className="text-[11px] text-slate-500">วันที่ส่งงาน <span className="text-slate-400">— ตั้งต้นวันนี้ · ลงย้อนหลังได้</span></span>
                <input type="date" value={qcDate} onChange={(e) => setQcDate(e.target.value)}
                  className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </label>

              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
                  <span>ใบที่จะส่ง ({list.length}) · แก้จำนวน/ค่าแรงรายใบได้</span>
                  <span>รวมค่าแรง <b className="text-slate-700">฿{fmt(sumWage)}</b></span>
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                  {list.map((w) => {
                    const left = woLeft(w);
                    const row = qcRows[w.id] ?? { qty: "", wage: "" };
                    const over = (Number(row.qty) || 0) > left;
                    return (
                      <div key={w.id} className="flex items-center gap-2 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-700 truncate">{w.product_sku ?? w.product_name}</div>
                          <div className="text-[10px] text-slate-400 font-mono truncate">{w.wo_no} · {w.assignee_name ?? w.department_name ?? "—"} · เหลือส่ง {fmt(left)}</div>
                        </div>
                        <input type="number" min={0} step="any" value={row.qty} title="จำนวนที่ส่งเข้า QC"
                          onChange={(e) => setQcRows((p) => ({ ...p, [w.id]: { ...(p[w.id] ?? { qty: "", wage: "" }), qty: e.target.value } }))}
                          className={`w-20 h-8 px-2 text-sm text-right border rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 shrink-0 ${over ? "border-rose-300 bg-rose-50" : "border-slate-200"}`} />
                        <input type="number" min={0} step="any" value={row.wage} placeholder="ค่าแรง —" title="ค่าแรงของใบนี้ (เว้นว่าง = ส่งไว้ก่อน ค่อยเติมทีหลัง)"
                          onChange={(e) => setQcRows((p) => ({ ...p, [w.id]: { ...(p[w.id] ?? { qty: "", wage: "" }), wage: e.target.value } }))}
                          className="w-24 h-8 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 shrink-0" />
                      </div>
                    );
                  })}
                </div>
                {noWage > 0 && (
                  <div className="px-3 py-1.5 bg-amber-50 border-t border-amber-100 text-[11px] text-amber-700">
                    มี {noWage} ใบที่ยังไม่ลงค่าแรง — ส่งได้เลย ระบบจะติดธง “ยังไม่ครบ” ให้ไปเติมทีหลังที่ 📤 ตารางส่งงาน
                  </div>
                )}
              </div>
            </div>
          </ERPModal>
        );
      })()}

      {woLaborOpen && (() => {
        const rate = Number(woLaborRate) || 0;
        const totalQty = selWos.reduce((n, w) => n + (w.qty || 0), 0);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setWoLaborOpen(false)}>
            <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold text-slate-800">💰 ใส่ค่าแรงให้ใบจ่ายงาน</h3>
              <p className="mt-0.5 mb-3 text-xs text-slate-500">เลือกไว้ <b>{selWos.length}</b> ใบ · รวม {fmt(totalQty)} ชิ้น — แต่ละใบจะได้ (ค่าแรง/ชิ้น × จำนวนของใบนั้น)</p>
              <label className="block text-[11px] text-slate-500">ค่าแรง/ชิ้น (บาท)</label>
              <input type="number" min={0} step="any" value={woLaborRate} onChange={(e) => setWoLaborRate(e.target.value)} autoFocus placeholder="เช่น 55"
                className="mt-0.5 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-right focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              {rate > 0 && <p className="mt-1.5 text-[11px] text-slate-500">รวมทั้งหมดประมาณ <b className="text-slate-700">฿{fmt(rate * totalQty)}</b></p>}
              <button onClick={() => setWoLaborRate("")} className="mt-1.5 text-[11px] text-slate-400 underline hover:text-slate-600">ล้างค่าแรง (ตั้งเป็นยังไม่ใส่)</button>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setWoLaborOpen(false)} className="h-9 rounded-lg border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
                <button onClick={() => void applyWoLabor()} disabled={woLaborSaving} className="h-9 rounded-lg bg-indigo-600 px-5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{woLaborSaving ? "กำลังบันทึก…" : "บันทึก"}</button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

// ---- แถบบนแบบแอป: สลับมุมมองบอร์ด (ปุ่มชื่อหน้า ▾) ----
type BoardView = "board" | "canvas" | "table" | "shop" | "purchase" | "calendar" | "labor" | "exec";
const BOARD_VIEWS: [BoardView, string, string][] = [
  ["board", "📋", "บอร์ด"], ["canvas", "🗂", "แคนวาส (โซนตามโต๊ะ)"], ["table", "▦", "ตาราง"], ["shop", "🛒", "ช้อปจ่ายงาน"],
  ["purchase", "📦", "ขอซื้อ/เตรียม"], ["calendar", "📅", "ปฏิทิน"], ["labor", "💰", "ค่าแรงรายเดือน"], ["exec", "👔", "แผนผู้บริหาร"],
];
function BoardViewPicker({ view, isAdmin, defView, onPick, onSaveDefault }: {
  view: BoardView; isAdmin: boolean; defView: BoardView | null | undefined; onPick: (v: BoardView) => void; onSaveDefault: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const cur = BOARD_VIEWS.find(([k]) => k === view);
  return (
    <div ref={anchor} className="inline-block max-w-full min-w-0">
      <button type="button" onClick={() => setOpen((v) => !v)} title="บอร์ดจ่ายงาน — กดเพื่อสลับมุมมอง"
        className="inline-flex h-9 max-w-full min-w-0 items-center gap-1.5 rounded-lg px-1.5 hover:bg-slate-100">
        <span className="text-base">📋</span>
        <span className="hidden truncate font-semibold text-slate-800 md:inline">บอร์ดจ่ายงาน</span>
        <span className="truncate text-sm text-slate-600"><span className="hidden md:inline">· </span>{cur?.[1]} {cur?.[2]}</span>
        <span className="text-xs text-slate-400">▾</span>
      </button>
      <FloatingDropdown anchorRef={anchor} open={open} onClose={() => setOpen(false)} minWidth={250} maxWidth={300}>
        <div className="overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-xl" style={{ maxHeight: "var(--fd-max-h, 80vh)" }}>
          <div className="px-3 pt-1.5 pb-1 text-[11px] font-medium text-slate-400">มุมมองของบอร์ด</div>
          {BOARD_VIEWS.filter(([k]) => k !== "exec" || isAdmin).map(([k, ic, label]) => (
            <button key={k} type="button" onClick={() => { onPick(k); setOpen(false); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 ${k === view ? "bg-blue-50/60 font-medium text-blue-700" : "text-slate-700"}`}>
              <span className="w-5 text-center">{ic}</span><span className="flex-1">{label}</span>
              {defView === k && <span title="มุมมองเริ่มต้นของคุณ">⭐</span>}
            </button>
          ))}
          <div className="my-1 border-t border-slate-100" />
          <button type="button" disabled={defView === view} onClick={() => { onSaveDefault(); setOpen(false); }}
            className="w-full px-3 py-2 text-left text-slate-600 hover:bg-slate-50 disabled:text-slate-400">
            {defView === view ? `⭐ "${cur?.[2]}" เป็นมุมมองเริ่มต้นของคุณแล้ว` : `☆ ตั้ง "${cur?.[2]}" เป็นมุมมองเริ่มต้นของฉัน`}
          </button>
        </div>
      </FloatingDropdown>
    </div>
  );
}

// ---- แถบบนแบบแอป: "อัปเดต x นาทีที่แล้ว" — แตะเพื่อโหลดใหม่ (นานเกิน 10 นาที = สีเหลืองเตือน) ----
function UpdatedAgo({ at, onReload }: { at: number | null; onReload: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  const mins = at == null ? null : Math.floor((Date.now() - at) / 60000);
  const short = mins == null ? "…" : mins < 1 ? "เพิ่งอัปเดต" : mins < 60 ? `${mins} นาที` : `${Math.floor(mins / 60)} ชม.`;
  const long = mins == null ? "กำลังโหลด…" : mins < 1 ? "อัปเดตเมื่อสักครู่" : mins < 60 ? `อัปเดต ${mins} นาทีที่แล้ว` : `อัปเดต ${Math.floor(mins / 60)} ชม.ที่แล้ว`;
  return (
    <button type="button" onClick={onReload} title={`${long} — แตะเพื่อโหลดข้อมูลใหม่`}
      className={`h-9 whitespace-nowrap rounded-lg px-2 text-[11px] ${mins != null && mins >= 10 ? "bg-amber-50 text-amber-700" : "text-slate-500 hover:bg-slate-100"}`}>
      ⟳ <span className="xl:hidden">{short}</span><span className="hidden xl:inline">{long}</span>
    </button>
  );
}
