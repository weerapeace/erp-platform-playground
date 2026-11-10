"use client";

/**
 * Design Sheets (ใบงานออกแบบ) — เฟส 1: ตาราง + ฟอร์ม + รูป · เฟส 2: Canvas แยกโซนตามแบรนด์ (สลับมุมมองได้)
 * ของกลาง: DataTable(server) / CanvasBoard / ERPModal / ConfirmDialog / ImageManager(แนบไฟล์กลาง→R2) / useToast / useAuth
 * เฟสถัดไป: comment ลูกค้า · รอบเสนอราคา · แท็บตีราคา · ตั้ง Parent SKU
 */
import { useState, useCallback, useMemo, useEffect, useRef, useLayoutEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable, type ServerFetchParams } from "@/components/data-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { Icon } from "@/components/icon";
import { MenuBar, type MenuDef, type MenuItem } from "@/components/menu-bar";
import { askConfirm } from "@/components/modal/ask-dialog";
import { CampaignBoardPicker, useCanSendToBoard } from "@/components/campaign-board-send";
import { useToast } from "@/components/toast";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { formatDate, todayBangkok, addDaysYmd } from "@/lib/date";
import { RECENT_KEYS, loadRecent, pushRecent } from "@/lib/recent-picks";
import { ImageManager, ImageThumbnail } from "@/components/image-manager";
import { RecordChecklist, RecordTasksButton } from "@/components/record-tasks";
import { SplitPanes, type SplitSize } from "@/components/split-panes";
import { DateCards } from "@/components/date-cards";
import { ParentSkuBox } from "./parent-sku-box";
import { takePrefetchedSheet } from "./prefetch";
import { DESIGN_WAITING } from "@/lib/design-sheet-waiting";
import { CanvasBoard, type CanvasZone } from "@/components/canvas-board";
import type { BomPulledLine } from "./bom-to-cost-wizard";
import type { PresetQuoteLine } from "@/app/master/design-sheets/to-quotation-modal";
import { costTabLabel, generalLabelOf } from "@/lib/design-sheet-cost-labels";
import { useT } from "@/components/i18n";
import { tr } from "@/lib/lang";

const QUOTE_CART_KEY = "erp-design-quote-cart";   // ตัวชี้ใบเสนอราคาร่างที่เป็น "ตะกร้า" ปัจจุบัน (ต่อ browser)
import type { Attachment } from "@/app/api/attachments/route";
import { lineShapeArea, normalizePiece, pieceGeometry, refitLineShape, shapeBox, shapePathD, type LineShape, type Shape } from "@/lib/pattern-shape";
import type { EditorPiece, PieceMat, RefImage, ShapeEditorResult } from "@/components/pattern-sheet/shape-editor";
import { SheetImagePicker } from "./sheet-image-picker";
import { COST_QTY_TIERS, costItemPatch, costLineFromItem, isPieceGroup, isZeroCostLine, pieceArea, recomputeCostLine, restorePrevItem, withPrevItem } from "@/lib/design-sheet-cost-row";
import { buildStatusMeta, isOwnBrandJob, statusOptsFor, UNKNOWN_STATUS_CLS, type StatusMeta, type WfStatusRow } from "@/lib/design-sheets-meta";
import { LineItemsGrid, type LineColumn } from "@/components/line-items-grid";
import { costUsagePerUnit } from "@/lib/cost-usage";
import { CostSummaryCard } from "./cost-summary-card";
import { CostPresetsManager, CutLaborBreakdown, LaborRefPicker, OrderQtyBar, OtherCostPicker, OverheadBreakdown, presetsOf, useCostPresets } from "./cost-extras-tools";
import { cleanOrderQty, cutLaborRows, cutLaborSummary, DEFAULT_OH, groupCutRows, overheadRows, overheadTotal, packSuggestions, pickBag, type CostPreset, type OverheadCfg, type PackRef, type PresetKind } from "@/lib/design-cost-presets";
import type { SkuPickerValue } from "@/components/pickers";
import type { SkuLite } from "@/app/api/design-sheets/price-item-skus/route";
import { SearchableSelect } from "@/components/searchable-select";
import { ComponentPicker } from "@/components/material-picker";
import type { BomComponent } from "@/app/api/bom/components/route";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import type { DesignSheetComment } from "@/app/api/design-sheets/[id]/comments/route";
import type { DesignSheetQuote } from "@/app/api/design-sheets/[id]/quotes/route";
import type { CostLine, PrevItem } from "@/app/api/design-sheets/[id]/cost-lines/route";
import { normalizeSnapLine, cleanExtra, extraAmountAt, extraKindOf, type SnapExtra, type SnapLine } from "@/lib/design-sheet-cost-snapshot";
import type { SpecMaterialItem } from "@/lib/design-sheet-spec";
import type { PriceItem, PriceGroup } from "@/app/api/design-sheets/price-items/route";
import type { MaterialGroup } from "@/app/api/bom/material-groups/route";
import type { ParentSkuCheck } from "@/app/api/design-sheets/parent-sku-check/route";
import type { DesignSheetLinkedSku } from "@/app/api/design-sheets/[id]/route";
import dynamic from "next/dynamic";
import { DblClickToEdit } from "@/components/dbl-click-edit";
import { DriveUploadBox } from "@/components/drive-upload-box";
import { fetchSheetDriveFolder, startSheetDriveUpload } from "@/lib/design-sheet-drive-client";
// แผงใบนำเสนอ A4 — โหลดเฉพาะตอนกด (ไม่ถ่วงป๊อปอัป)
const DesignSheetPresentPanel = dynamic(() => import("@/components/design-sheet-present").then((m) => m.DesignSheetPresentPanel), { ssr: false });
// ลงออเดอร์จากใบงานนี้ (ของกลาง ป๊อปเดียวกับหน้าใบสั่งขาย) — โหลดเฉพาะตอนกด
const OrderBatchEntryModal = dynamic(() => import("@/components/order-batch-entry").then((m) => m.OrderBatchEntryModal), { ssr: false });
// แท็บ "รายละเอียดงาน" (วาดบนรูป + หมุดวัตถุดิบ) — โหลดเฉพาะตอนเปิดแท็บ
const DesignSheetSpecTab = dynamic(() => import("./spec-tab").then((m) => m.DesignSheetSpecTab), { ssr: false });
const DesignSheetNoticeTab = dynamic(() => import("./notice-tab").then((m) => m.DesignSheetNoticeTab), { ssr: false });
// ⚡ ส่วนในป๊อปใบงาน/ป๊อปย่อย (ตัวแก้ข้อความ tiptap ~300KB ฯลฯ) → โหลดโค้ดตอนเปิดใช้ (จุดวางเดิม พฤติกรรมเดิม — npm run perf-check 2026-11-07 หน้า /master/design-sheets 729KB)
const PatternStudio = dynamic(() => import("@/components/pattern-studio").then((m) => m.PatternStudio), { ssr: false });   // ✏️ วาดชิ้นวัสดุ + ภาพ 3D + แม่แบบทรงกระเป๋า (ครอบ ShapeEditor · โหลดเมื่อเปิด)
const RichTextEditor = dynamic(() => import("@/components/rich-text").then((m) => m.RichTextEditor), { ssr: false });
const SupplierQuoteSection = dynamic(() => import("./supplier-quote").then((m) => m.SupplierQuoteSection), { ssr: false });
const AddToPlanButton = dynamic(() => import("@/components/team-plan/add-to-plan").then((m) => m.AddToPlanButton), { ssr: false });
// ป๊อป "ใส่แผนงาน" (เปิดจากเมนู ส่งต่อ ปุ่มล่าง) — โหลดเฉพาะตอนกด
const AddToPlanModal = dynamic(() => import("@/components/team-plan/add-to-plan").then((m) => m.AddToPlanModal), { ssr: false });
const CostVersionsModal = dynamic(() => import("./cost-versions").then((m) => m.CostVersionsModal), { ssr: false });
const SkuWizard = dynamic(() => import("@/app/master/design-sheets/sku-wizard").then((m) => m.SkuWizard), { ssr: false });
const FabricCalcModal = dynamic(() => import("./fabric-calc-modal").then((m) => m.FabricCalcModal), { ssr: false });
const QuoteRounds = dynamic(() => import("./quote-rounds").then((m) => m.QuoteRounds), { ssr: false });
const ToQuotationModal = dynamic(() => import("@/app/master/design-sheets/to-quotation-modal").then((m) => m.ToQuotationModal), { ssr: false });
const QuotationCartDrawer = dynamic(() => import("@/app/master/design-sheets/quotation-cart-drawer").then((m) => m.QuotationCartDrawer), { ssr: false });
const SheetQuotations = dynamic(() => import("./sheet-quotations").then((m) => m.SheetQuotations), { ssr: false });
const PullCostFromSheetModal = dynamic(() => import("./pull-cost-modal").then((m) => m.PullCostFromSheetModal), { ssr: false });
const BomFromCostWizard = dynamic(() => import("./bom-from-cost-wizard").then((m) => m.BomFromCostWizard), { ssr: false });
const BomToCostWizard = dynamic(() => import("./bom-to-cost-wizard").then((m) => m.BomToCostWizard), { ssr: false });
const SkuMultiPickerModal = dynamic(() => import("@/components/sku-multi-picker").then((m) => m.SkuMultiPickerModal), { ssr: false });
const WorkflowStatusManager = dynamic(() => import("@/components/workflow-status-manager").then((m) => m.WorkflowStatusManager), { ssr: false });
const PatternTicketLinks = dynamic(() => import("@/components/pattern-ticket-links").then((m) => m.PatternTicketLinks), { ssr: false });

type Brand = { id: string; name: string; color: string | null; is_customer_job?: boolean | null };
// ค่าใช้จ่ายเพิ่ม: amount = ต่อชิ้นเสมอ · mode "split" = ค่าครั้งเดียวหารจำนวนสั่ง (ค่าบล็อกสกรีน) — สูตรอยู่ lib/design-sheet-cost-snapshot
type CostExtra = SnapExtra;
const SPLIT_TIERS = COST_QTY_TIERS;   // "ถ้าสั่ง…" ใต้สรุปต้นทุน — ตัวจริง lib/design-sheet-cost-row (มือถือใช้ร่วม)
// ค่าใช้จ่ายเพิ่มเริ่มต้น (แก้/ลบ/เพิ่มได้) — ชื่อพวกนี้ "ถูกบันทึกเป็นข้อมูล" ของใบงาน (ไปโผล่ในใบพิมพ์ต้นทุน)
// → คงภาษาไทยเสมอ ไม่แปลตามภาษาคนกด (กันข้อมูลในระบบปนไทย/อังกฤษ) — เหมือนข้อมูลอื่นที่คนพิมพ์เอง
const defaultCostExtra = (): CostExtra[] => [
  { label: "ค่าแรงผลิต", amount: 0 },
  { label: "ค่าแรง (ตัด/ปลอก/วาด)", amount: 0 },
  { label: "ค่าโสหุ้ย (ส่ง/QC/Packing)", amount: 0 },
  { label: "ต้นทุนอื่นๆ", amount: 0 },
];

type FormState = {
  id: string | null; code: string;
  name: string; brand_id: string; detail: string; note: string;
  status: string; order_date: string; deadline: string; appointment_date: string; drive_link: string;
  // ⏳ รออะไรอยู่ = เช็กลิสต์กลาง (RecordChecklist · บันทึกทีละข้อ) ไม่อยู่ในฟอร์มนี้แล้ว — ช่อง waiting_for เดิมเลิกใช้ (2026-10-23)
  parent_sku_codes: string[];   // ตั้งได้หลาย Parent SKU (รหัสจริง)
  parent_sku_drafts: string[];  // ข้อ 6: ร่าง Parent (ชื่อ ยังไม่มีรหัสจริง)
  cost_general_label: string;   // ชื่อแท็บตีราคา "ทั่วไป" ที่ตั้งเอง (ว่าง = ทั่วไป) — บันทึกทันทีผ่านปุ่ม ✎ เปลี่ยนชื่อ
};
// วันนี้ตามเวลาไทย (เดิม toISOString = วันสากล → ก่อน 7 โมงเช้าได้ "เมื่อวาน")
const todayStr = () => todayBangkok();
const DEADLINE_QUICK = [1, 3, 7] as const;   // ปุ่มลัด "ส่งงานภายใน" ตอนสร้างใหม่ — วันนี้ +N วัน (นับทุกวัน)
const RECENT_BRAND_CHIPS = 3;                 // ปุ่มแบรนด์ที่ใช้ล่าสุด (จำต่อคน ในเครื่อง · lib/recent-picks)
// วันที่สั่ง default = วันนี้ (แก้ได้)
const empty = (): FormState => ({ id: null, code: "", name: "", brand_id: "", detail: "", note: "", status: "design", order_date: todayStr(), deadline: "", appointment_date: "", drive_link: "", parent_sku_codes: [], parent_sku_drafts: [], cost_general_label: "" });

// บรรทัดตีราคา (เฟส 4) — row ฝั่งหน้าจอ = CostLine + key ชั่วคราว (+ group_code สำหรับเช็คชนิดชิ้น)
type CostRow = CostLine & { key: string; group_code?: string | null };
// บรรทัดตีราคาที่ "รวม = 0" ทั้งที่เริ่มกรอกแล้ว (มีวัสดุ/ตัวเลข) → เตือนสีแดง · บรรทัดว่างเปล่าที่เพิ่งเพิ่ม ไม่นับ
const isZeroCostRow = isZeroCostLine;   // ตัวจริง lib/design-sheet-cost-row (มือถือใช้ร่วม)
const methodLabel = (m: string): string | undefined => ({
  area_face: tr("พื้นที่÷หน้ากว้าง", "Area÷width"), area_100: tr("พื้นที่÷100", "Area÷100"), length: tr("ความยาว", "Length"),
  count: tr("นับชิ้น", "Count pcs"), manual: tr("พิมพ์เอง", "Manual"),
} as Record<string, string>)[m];

// หมายเหตุที่บรรทัด "ดึงจาก BOM" ใส่ไว้ = อ้างอิงชื่อวัสดุเดิม → ใช้เป็นคำค้นตั้งต้นตอนเลือกวัสดุ
const BOM_REF_NOTE_PREFIX = "อ้างอิง BOM: ";
function bomRefSearchSeed(note: string | null | undefined): string {
  const s = (note ?? "").trim();
  if (!s.startsWith(BOM_REF_NOTE_PREFIX)) return "";
  let name = s.slice(BOM_REF_NOTE_PREFIX.length).trim();
  const p = name.indexOf("(");   // ตัดวงเล็บรายละเอียด (เช่น "( 1 ม้วน = 50 หลา )") ออก เหลือชื่อหลัก
  if (p > 0) name = name.slice(0, p).trim();
  return name;
}
const fmtQty = (n: number | null) => (n == null ? "—" : n.toLocaleString("th-TH", { maximumFractionDigits: 4 }));
const fmtBaht = (n: number | null) => (n == null ? "—" : n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pkey = (s: string | null | undefined) => s ?? "";   // ข้อ 7: คีย์แท็บ Parent ของบรรทัดตีราคา ("" = ทั่วไป)

// ชนิด "ชิ้นสำเร็จขนาดตายตัว" + สูตรคิดบรรทัด อยู่ที่ lib/design-sheet-cost-row (ใช้ร่วมกับ API ส่งชิ้นจากสตูดิโอแพทเทิร์น)
const rowIsPiece = (r: CostRow) => isPieceGroup(r.group_code, r.group_name);
/** แถวที่เลือกวัสดุ (master) แล้วแต่ยังไม่มีชนิดหรือราคา — เช่น วัสดุที่เพิ่งพิมพ์สร้างจาก dropdown → โชว์ปุ่ม "ใส่รายละเอียด" */
const rowNeedsItemDetails = (r: CostRow) => !!r.item_id && (!r.group_name || r.unit_price == null);
const recomputeRow = recomputeCostLine;

// ช่องที่แต่ละชนิด (วิธีคำนวณ) ต้องกรอก — ช่องอื่นโชว์ "—"
const usesWidth  = (m: string | null) => m === "area_face" || m === "area_100";
const usesLength = (m: string | null) => m === "area_face" || m === "area_100" || m === "length";
const usesPieces = (m: string | null) => m === "area_face" || m === "area_100" || m === "count";
const usesWaste  = (m: string | null) => m === "area_face" || m === "area_100" || m === "length";   // เผื่อเสีย (รวมชนิดชิ้น)
const isManualM  = (m: string | null) => !m || m === "manual";

/** สร้างบรรทัดตีราคาจากวัสดุ (ใช้ทั้งเลือกใน dropdown และกด "ลงตะกร้า" จากการ์ด) */
function rowFromItem(it: PriceItem, idx: number): CostRow {
  return { key: `c${Date.now()}_${idx}`, ...costLineFromItem(it, idx) };
}

// patch "เลือกวัสดุ" ให้บรรทัดเดิม (costItemPatch) + จำวัสดุเดิม (withPrevItem / restorePrevItem) อยู่ที่ lib/design-sheet-cost-row (มือถือใช้ร่วม)

/**
 * เลือกวัตถุดิบ "จาก SKU คลังสินค้า" → เติมให้อัตโนมัติ: ประเภท(กลุ่ม) · สูตรคิด · ราคาซื้อมาตรฐาน · หน่วย · หน้ากว้าง · %เผื่อเสีย
 * กว้าง×ยาว ไม่เติม — เป็นขนาดชิ้นที่ตัดของงานนี้ ต้องกรอกเอง (ยกเว้นวัสดุที่ขายเป็นแผ่นซึ่งมีขนาดผืนติดมา)
 */
function costSkuPatch(c: BomComponent, groups: PriceGroup[], r: CostRow): Partial<CostRow> {
  const g = groups.find((x) => x.name === c.material_type);   // กลุ่มวัตถุดิบเดียวกันทั้งระบบ (ชื่อกลุ่มตรงกัน)
  const method = g?.calc_method ?? null;
  return {
    item_sku_id: c.id, item_sku_code: c.code,
    item_id: null, price_basis: null,                         // ไม่ได้มาจาก master วัสดุตีราคา
    item_name: c.name || c.code,
    group_name: c.material_type ?? r.group_name ?? null,
    group_code: g?.code ?? null,
    calc_method: method,
    unit_price: c.standard_price ?? r.unit_price ?? null,     // ราคาซื้อมาตรฐานของ SKU
    uom: c.uom_name ?? g?.uom_default ?? r.uom ?? null,
    face_width_cm: c.fabric_width_cm ?? r.face_width_cm ?? null,
    waste_percent: r.waste_percent ?? c.loss_percent ?? g?.loss_percent ?? null,
    divisor: g?.divisor ?? r.divisor ?? null,
    // วัสดุที่ขายเป็นแผ่น (มีขนาดผืนใน SKU) → เติมขนาดให้เป็นค่าตั้งต้น
    width_cm: r.width_cm ?? c.sheet_width_cm ?? null,
    length_cm: r.length_cm ?? c.sheet_length_cm ?? null,
  };
}

// ราคาฐานของกลุ่มตามที่เลือก (avg/set/latest) — ถ้าค่าที่เลือกไม่มี → ถอยใช้ค่าเฉลี่ย
function groupBasisPrice(g: PriceGroup, basis: string | null): number | null {
  if (basis === "set") return g.set_price ?? g.avg_price;
  if (basis === "latest") return g.latest_price ?? g.avg_price;
  return g.avg_price;
}
// ราคาฐานของ "วัสดุตีราคา" ตามที่เลือก (manual/latest/avg) — ดึงจาก SKU ที่ผูก, ถอยใช้ราคากรอกเองถ้าไม่มี
function itemBasisPrice(it: PriceItem, basis: string | null): number | null {
  if (basis === "latest") return it.sku_latest_price ?? it.price_per_unit;
  if (basis === "avg")    return it.sku_avg_price ?? it.price_per_unit;
  if (basis === "max")    return it.sku_max_price ?? it.price_per_unit;   // แพงสุดจากราคาซื้อจริง
  if (basis === "min")    return it.sku_min_price ?? it.price_per_unit;   // ถูกสุดจากราคาซื้อจริง
  if (basis === "used")   return it.last_used_price ?? it.price_per_unit; // ราคาที่เคยตีครั้งล่าสุด
  return it.price_per_unit;   // manual (ค่าเริ่มต้น)
}
// วันที่ของราคาฐานที่เลือก (ไว้บอก "ปรับตั้งแต่…") — manual/used = วันแก้ master · latest/avg/max/min = วันรับของล่าสุด
function itemBasisDate(it: PriceItem, basis: string | null): string | null {
  if (basis === "latest" || basis === "avg" || basis === "max" || basis === "min") return it.sku_latest_date;
  return it.price_updated_at;
}
const fmtShortDate = (d: string | null | undefined) => {
  if (!d) return "";
  const t = new Date(d); return Number.isNaN(t.getTime()) ? "" : t.toLocaleDateString(tr("th-TH", "en-GB"), { day: "numeric", month: "short", year: "2-digit" });
};
/**
 * ตรวจว่าราคาของบรรทัด "ตกยุค" ไหม — เจ้าของขอ: วัสดุปรับราคาแล้ว ให้เตือนในแถวตีราคา (พร้อมวันที่) แล้วเลือกเองว่าจะเปลี่ยนไหม
 * ลำดับเช็ก: (1) ราคาฐานที่บรรทัดใช้ (ตามปุ่ม 💰) เปลี่ยนไปจากที่เก็บไว้ (2) ฐาน "กรอกเอง" แต่มีราคาซื้อจริงล่าสุดต่างจากที่ตีไว้
 * คืน null = ไม่ต้องเตือน
 */
function priceDrift(r: CostRow, item: PriceItem | null, g: PriceGroup | null): { price: number; date: string | null; reason: string } | null {
  if (r.unit_price == null || rowIsPiece(r)) return null;
  const diff = (a: number | null | undefined) => a != null && Math.abs(a - (r.unit_price as number)) > 0.005;
  if (item) {
    const basis = r.price_basis ?? "manual";
    const cur = itemBasisPrice(item, basis);
    if (diff(cur)) return { price: cur as number, date: itemBasisDate(item, basis), reason: basis === "manual" ? tr("ราคาวัสดุ (master) ปรับ", "Material price (master) changed") : tr("ราคาฐานที่เลือกปรับ", "Selected base price changed") };
    if (basis === "manual" && item.sku_latest_price != null && (item.sku_latest_currency ?? "THB") === "THB" && diff(item.sku_latest_price))
      return { price: item.sku_latest_price, date: item.sku_latest_date, reason: tr("มีราคาซื้อจริงล่าสุดต่างจากที่ตีไว้", "Latest purchase price differs from costed price") };
    return null;
  }
  if (g) {
    const cur = groupBasisPrice(g, r.price_basis ?? "avg");
    if (diff(cur)) return { price: cur as number, date: g.latest_date, reason: tr("ราคากลุ่มปรับ", "Group price changed") };
  }
  return null;
}

const fmtSigned = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmtBaht(Math.abs(n))}`;
const pct = (from: number | null | undefined, to: number | null | undefined) =>
  from && to != null ? ` (${to >= from ? "+" : "−"}${(Math.abs(to - from) / from * 100).toFixed(1)}%)` : "";

// ฟิลด์บรรทัดเมื่อเลือกแบบ "กลุ่ม" (item_id = null = จับคู่วัสดุจริงทีหลัง)
function rowFieldsFromGroup(g: PriceGroup, basis: string): Partial<CostRow> {
  return {
    item_id: null, item_name: `[กลุ่ม] ${g.name}`, group_name: g.name, group_code: g.code,   // ชื่อบรรทัดถูกบันทึกเป็นข้อมูล → คงไทย
    price_basis: basis, calc_method: g.calc_method,
    waste_percent: g.loss_percent, divisor: g.divisor, uom: g.uom_default,
    unit_price: groupBasisPrice(g, basis),
  };
}

/** รูปย่อของรูปทรงที่วาด (ปุ่มในตารางตีราคา) */
function ShapeMini({ shape, holes = [] }: { shape: Shape; holes?: Shape[] }) {
  const b = shapeBox(shape); const pad = Math.max(b.w, b.h) * 0.1 || 1;
  return (
    <svg viewBox={`${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`} className="h-4 w-4" aria-hidden>
      <path d={shapePathD(shape) + holes.map((h) => shapePathD(h)).join("")} fillRule="evenodd" fill="currentColor" fillOpacity={0.25} stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** ข้อความ tooltip อธิบายวิธีคำนวณปริมาณของบรรทัด (+ บอกเมื่อใช้พื้นที่จริงของรูปทรงวาด) */
function calcTooltip(r: CostRow): string {
  const base = calcTooltipBase(r);
  const sa = lineShapeArea(r.shape);
  return sa != null ? base + tr(` · ใช้พื้นที่จริงของรูปทรงวาด ${sa} cm² แทน กว้าง×ยาว`, ` · uses the drawn shape's actual area ${sa} cm² instead of width×length`) : base;
}
function calcTooltipBase(r: CostRow): string {
  if (rowIsPiece(r)) {
    const a = pieceArea(r); const w = r.waste_percent || 0;
    const wasteTxt = w ? tr(` × (1+เผื่อเสีย ${w}%)`, ` × (1+waste ${w}%)`) : "";
    return a != null
      ? tr(`พื้นที่ใช้ ${r.width_cm}×${r.length_cm} = ${a} cm²${wasteTxt} × ${r.pieces ?? 1} ชิ้น × ${r.unit_price ?? 0} บ./cm² = ${fmtBaht(r.amount)}`, `Area used ${r.width_cm}×${r.length_cm} = ${a} cm²${wasteTxt} × ${r.pieces ?? 1} pcs × ${r.unit_price ?? 0} THB/cm² = ${fmtBaht(r.amount)}`)
      : tr("ใส่ กว้าง×ยาว + จำนวนชิ้น", "Enter width×length + pcs");
  }
  const m = r.calc_method; const w = r.waste_percent || 0; const d = r.divisor || 90;
  const fx = (n: number | null) => (n == null ? 0 : n);
  if (m === "count")     return tr(`จำนวนชิ้น = ${fx(r.pieces)} ${r.uom ?? ""}`, `Pcs = ${fx(r.pieces)} ${r.uom ?? ""}`);
  if (m === "length")    return tr(`ความยาว ${fx(r.length_cm)} ซม. × (1+เผื่อเสีย ${w}%) ÷ ${d} = ${fmtQty(r.qty)} ${r.uom ?? ""}`, `Length ${fx(r.length_cm)} cm × (1+waste ${w}%) ÷ ${d} = ${fmtQty(r.qty)} ${r.uom ?? ""}`);
  if (m === "area_100")  return tr(`พื้นที่ (${fx(r.width_cm)}×${fx(r.length_cm)}×${fx(r.pieces) || 1}) × (1+${w}%) ÷ ${d} = ${fmtQty(r.qty)} ${r.uom ?? ""}`, `Area (${fx(r.width_cm)}×${fx(r.length_cm)}×${fx(r.pieces) || 1}) × (1+${w}%) ÷ ${d} = ${fmtQty(r.qty)} ${r.uom ?? ""}`);
  if (m === "area_face") return tr(`พื้นที่ (${fx(r.width_cm)}×${fx(r.length_cm)}×${fx(r.pieces) || 1}) ซม.² × (1+เผื่อเสีย ${w}%) ÷ หน้ากว้าง ${fx(r.face_width_cm)} ÷ ${d} = ${fmtQty(r.qty)} ${r.uom ?? ""}`, `Area (${fx(r.width_cm)}×${fx(r.length_cm)}×${fx(r.pieces) || 1}) cm² × (1+waste ${w}%) ÷ width ${fx(r.face_width_cm)} ÷ ${d} = ${fmtQty(r.qty)} ${r.uom ?? ""}`);
  return tr("กรอกปริมาณเอง (ชนิดนี้ไม่มีสูตรคำนวณ)", "Enter qty manually (no formula for this type)");
}

// สถานะ (label/สี) ย้ายไปไว้ที่ lib/design-sheets-meta.ts — ใช้ร่วมกับหน้าพิมพ์
const OLD_STATUS_ZONE = "__old__";   // โซนรวมใบที่สถานะถูกลบออกจาก workflow แล้ว (กันงานตกหล่น)

/** สีจุดกำหนดเสร็จบนการ์ด Canvas: เลยกำหนด=แดง · ≤2วัน=ส้ม · ปกติ=เขียว · จบงานแล้ว=เทา */
function deadlineTone(deadline: string | null, status: string, finished: Set<string>): { dot: string; text: string } {
  if (!deadline || finished.has(status)) return { dot: "bg-slate-300", text: "text-slate-400" };
  const today = new Date().toISOString().slice(0, 10);
  if (deadline < today) return { dot: "bg-rose-500", text: "text-rose-600 font-semibold" };
  const diff = (new Date(deadline).getTime() - new Date(today).getTime()) / 86400000;
  if (diff <= 2) return { dot: "bg-amber-500", text: "text-amber-600 font-medium" };
  return { dot: "bg-emerald-500", text: "text-slate-500" };
}

// ปุ่มเลือก "ฐานราคา" แบบ compact (สัญลักษณ์ + ราคา) — แทน <select> ยาว ๆ ที่ทำให้ดูรก/ขึ้น 2 บรรทัด
type BasisOption = { value: string; symbol: string; label: string; price?: number | null; note?: string };
function BasisPicker({ value, options, onChange }: { value: string; options: BasisOption[]; onChange: (v: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  // ลอยแบบ portal + fixed (เทคนิคเดียวกับของกลาง SearchableSelect) → ทะลุกล่อง overflow ไม่โดนแถว/ตารางตัด
  const compute = useCallback(() => {
    const el = btnRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const PANEL = 230, spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < PANEL && r.top > spaceBelow;
    setPos({ left: Math.min(r.right - 230, window.innerWidth - 236), top: openUp ? r.top : r.bottom, openUp });
  }, []);
  useLayoutEffect(() => { if (open) compute(); }, [open, compute]);
  useEffect(() => {
    if (!open) return;
    const h = () => compute();
    window.addEventListener("scroll", h, true); window.addEventListener("resize", h);
    return () => { window.removeEventListener("scroll", h, true); window.removeEventListener("resize", h); };
  }, [open, compute]);
  const cur = options.find((o) => o.value === value) ?? options[0];
  return (
    <div className="relative inline-block shrink-0">
      <button ref={btnRef} type="button" onClick={() => setOpen((o) => !o)} title={t(`ฐานราคา: ${cur?.label ?? ""}`, `Price base: ${cur?.label ?? ""}`)} data-field-trigger
        className="h-7 px-1.5 inline-flex items-center gap-1 text-xs border border-slate-200 rounded bg-white hover:bg-slate-50 max-w-[120px]">
        <span>{cur?.symbol}</span>
        <span className="text-slate-500 truncate tabular-nums">{cur && cur.price != null ? fmtBaht(cur.price) : (cur?.note ?? cur?.label)}</span>
        <span className="text-slate-300">▾</span>
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[1000]" onClick={() => setOpen(false)} />
          <div className="fixed z-[1001] w-[230px] bg-white border border-slate-200 rounded-lg shadow-xl py-1"
            style={{ left: pos.left, top: pos.top, transform: pos.openUp ? "translateY(calc(-100% - 4px))" : "translateY(4px)" }}>
            <div className="px-2.5 py-1 text-[10px] text-slate-400">{t("ฐานราคาที่ใช้", "Price base used")}</div>
            {options.map((o) => (
              <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 hover:bg-blue-50 ${o.value === value ? "bg-blue-50/60 text-blue-700 font-medium" : "text-slate-700"}`}>
                <span className="w-4 text-center">{o.symbol}</span>
                <span className="flex-1 truncate">{o.label}</span>
                <span className="tabular-nums text-slate-500">{o.price != null ? fmtBaht(o.price) : (o.note ?? "—")}</span>
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

// chips รหัส SKU ที่ผูกกับวัสดุ (ตารางจัดการวัสดุตีราคา) — เยอะ→ยุบไว้ตั้งแต่เปิด กดปุ่มกางดู/ลบ (กันรก)
function LinkedSkuChips({ ids, codeOf, onRemove }: { ids: string[]; codeOf: (sid: string) => string; onRemove: (sid: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!ids || ids.length === 0) return null;
  if (!open && ids.length > 4) {
    return (
      <button type="button" onClick={() => setOpen(true)} title={t("กดดูรหัส SKU ที่ผูก", "Show linked SKU codes")}
        className="mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 border border-blue-200 text-blue-700 rounded hover:bg-blue-100">
        📎 {ids.length} {t("รหัส", "codes")} ▾
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {ids.map((sid) => (
        <span key={sid} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono bg-blue-50 border border-blue-200 text-blue-700 rounded">
          {codeOf(sid)}
          <button type="button" onClick={() => onRemove(sid)} className="text-blue-300 hover:text-rose-500 leading-none">✕</button>
        </span>
      ))}
      {ids.length > 4 && <button type="button" onClick={() => setOpen(false)} className="text-[10px] text-slate-400 hover:text-slate-600 ml-0.5">{t("ซ่อน", "Hide")} ▲</button>}
    </div>
  );
}

// detailOnly = โหมด "เฉพาะ popup" (ไม่เรนเดอร์ตาราง/canvas) — ให้หน้าอื่น (เช่น Design Dashboard) เปิด popup รายละเอียด
// ในตัวเองได้ โดย reuse popup เดิมทั้งหมด · openId = ใบที่จะเปิด · onDetailClose = เรียกตอนปิด popup
// onCreated = แจ้งหน้าแม่ทันทีที่ "สร้างใบงานใหม่" สำเร็จ (ป๊อปอัปยังค้างอยู่ให้แนบรูปต่อได้)
// ใช้โดยกระดานแคมเปญ: สร้างใบงานจากบนกระดาน → วางการ์ดให้เลย
// hideSendToBoard = ซ่อนปุ่ม "ส่งขึ้นกระดาน" (ส่งมาจากหน้ากระดานแคมเปญเอง — การ์ดอยู่บนกระดานแล้ว ปุ่มนี้ซ้ำซ้อน)
// prefill = ค่าตั้งต้นของฟอร์มสร้าง (createMode) เช่น เปิดใบงานจาก "กล่องงานจากไลน์" — lineInboxId ส่งไปกับการบันทึก
//           ให้ server แนบรูปจากไลน์เข้าใบงาน + ผูกร่าง (รูปจากไลน์ไม่อัปซ้ำ แค่ผูกไฟล์เดิม)
//           note = ข้อความดิบ (เช่น แชตลูกค้าที่ส่งต่อมาในไลน์) → ช่อง Note · มีค่า = กาง "ใส่ข้อมูลอื่น" ให้เห็นเลย
export type DesignSheetPrefill = {
  name?: string | null; brand_id?: string | null; deadline?: string | null; detail?: string | null; note?: string | null;
  lineInboxId?: string | null; images?: string[]; sourceLabel?: string | null;
};
export function DesignSheetsDetail({ detailOnly = false, openId = null, createMode = false, defaultBrandId = null, hideSendToBoard = false, prefill = null, onDetailClose, onCreated, onOpenPresentation }:
  { detailOnly?: boolean; openId?: string | null; createMode?: boolean; defaultBrandId?: string | null; hideSendToBoard?: boolean; prefill?: DesignSheetPrefill | null; onDetailClose?: () => void; onCreated?: (sheet: { id: string; code: string }) => void;
    /** เปิดแผง "📄 ใบนำเสนอ A4" ที่หน้าแม่ (เช่น Dashboard — แผงอยู่ต่อได้แม้ปิดป๊อปอัป) · ไม่ส่ง = ป๊อปอัปเปิดแผงเอง */
    onOpenPresentation?: (sheetId: string) => void } = {}) {
  const t = useT();
  const [presentOpen, setPresentOpen] = useState(false);   // แผงใบนำเสนอ (กรณีหน้าแม่ไม่รับไปทำเอง)
  const canSendToBoard = useCanSendToBoard();
  const [boardPick, setBoardPick] = useState(false);   // ป๊อปอัปเลือกแคมเปญปลายทาง
  const canView = usePermission("products.view");
  const canCreate = usePermission("products.create");
  const canEdit = usePermission("products.edit");
  const canSeeCost = usePermission("products.cost.view");   // เห็นตัวเลขต้นทุน/กำไรของ Section สั่งจากร้าน (ผู้บริหาร/จัดซื้อ)
  const canOrder = usePermission("so.create");               // ปุ่ม "ลงออเดอร์" (ใบสั่งขาย)
  const [orderSeed, setOrderSeed] = useState<import("@/components/order-batch-entry").BatchSeedLine[] | null>(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [supplierDirty, setSupplierDirty] = useState(false); // Section สั่งจากร้าน มีแก้ค้างไหม (เตือนก่อนปิด)
  const supplierSaveRef = useRef<(() => Promise<void>) | null>(null);   // ปุ่ม "บันทึกแล้วปิด" เรียกบันทึก Section นี้ได้ด้วย
  const { can, user } = useAuth();
  const toast = useToast();

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingForm, setLoadingForm] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [createMore, setCreateMore] = useState(false);   // ฟอร์มสร้างใหม่ (แบบสั้น): กาง "ใส่ข้อมูลอื่น" แล้วหรือยัง
  const [recentBrandIds, setRecentBrandIds] = useState<string[]>([]);   // แบรนด์ที่คนนี้ใช้สร้างใบงานล่าสุด (อ่านตอนเปิดฟอร์มสร้าง)
  const [archiveTarget, setArchiveTarget] = useState<DesignSheetListItem | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [hardDelTarget, setHardDelTarget] = useState<{ id: string; code: string; name: string } | null>(null);
  const [hardDeleting, setHardDeleting] = useState(false);

  // เตือนก่อนปิด เมื่อมีข้อมูลตีราคายังไม่บันทึก
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [closeSaving, setCloseSaving] = useState(false);

  // ---- เฟส 3: แท็บในป๊อปอัพ + comment ลูกค้า + รอบเสนอราคา ----
  const [modalTab, setModalTab] = useState<"info" | "spec" | "comments" | "cost" | "quotes" | "notice">("info");
  // แท็บรายละเอียดงาน: เปิดครั้งแรกแล้วคงไว้ (สลับแท็บไม่ทิ้งที่แก้ค้าง) · มีแก้ค้าง = เตือนก่อนปิด
  const [specMounted, setSpecMounted] = useState(false);
  const [specDirty, setSpecDirty] = useState(false);
  const specSaveRef = useRef<(() => Promise<boolean>) | null>(null);
  useEffect(() => { if (modalTab === "spec") setSpecMounted(true); }, [modalTab]);
  // 📣 แจ้งลูกค้า — คงไว้หลังเปิดครั้งแรก (เหมือนรายละเอียดงาน) · แก้ค้าง = เตือนก่อนปิดใบงาน
  const [noticeMounted, setNoticeMounted] = useState(false);
  const [noticeDirty, setNoticeDirty] = useState(false);
  const [noticeCount, setNoticeCount] = useState<number | null>(null);
  const noticeSaveRef = useRef<(() => Promise<boolean>) | null>(null);
  useEffect(() => { if (modalTab === "notice") setNoticeMounted(true); }, [modalTab]);
  // 📁 โฟลเดอร์ Drive ของใบ (ไฟล์งาน AI/PSD/PDF) — หาเฉพาะตอนเปิดแท็บข้อมูลงานของใบที่บันทึกแล้ว · ไม่เจอ = สร้างตอนอัปไฟล์แรก
  const [driveFolder, setDriveFolder] = useState<{ id: string; url: string | null } | null>(null);
  const driveSheetId = form?.id ?? null;
  const driveFolderUrl = driveFolder && driveFolder.id === driveSheetId ? driveFolder.url : null;
  useEffect(() => {
    if (!driveSheetId || modalTab !== "info" || driveFolder?.id === driveSheetId) return;   // หาแล้วของใบนี้ = ไม่ถามซ้ำตอนสลับแท็บ
    let alive = true;
    void fetchSheetDriveFolder(driveSheetId).then((url) => { if (alive) setDriveFolder({ id: driveSheetId, url }); });
    return () => { alive = false; };
  }, [driveSheetId, modalTab, driveFolder?.id]);
  // โหมดของป๊อปอัป: เปิดดูงานเดิม = readonly (ดูอย่างเดียว) จนกดปุ่ม "แก้ไข" · งานสร้างใหม่ = แก้ได้เลย
  const [editing, setEditing] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);   // 🕘 ป๊อปเวอร์ชันตีราคา (ข้อ C)
  const [versionsInit, setVersionsInit] = useState<{ a: string | null; b: string | null; parent: string } | null>(null);   // เปิดจากรอบเสนอราคา: เทียบเวอร์ชันก่อน↔รอบนี้
  const [driftOpen, setDriftOpen] = useState(false);       // แถบ ⚠ ราคาวัสดุปรับ — กดขยายดูรายละเอียดรายบรรทัด
  const [changedOpen, setChangedOpen] = useState(false);   // แถบ 🔁 เปลี่ยนวัสดุ — กดขยาย
  const [parentRefs, setParentRefs] = useState<Record<string, string>>({});   // รหัส Parent SKU → id (ทำ chip เป็นลิงก์)
  const [linkedSkus, setLinkedSkus] = useState<DesignSheetLinkedSku[]>([]);   // SKU ที่สร้างจากใบนี้ (+ พี่น้องใต้ Parent เดียวกัน)
  const [comments, setComments] = useState<DesignSheetComment[]>([]);
  const [quotes, setQuotes] = useState<DesignSheetQuote[]>([]);
  const [cqLoading, setCqLoading] = useState(false);
  // เพิ่ม/แก้ comment
  const [newCmDate, setNewCmDate] = useState("");
  const [newCmBody, setNewCmBody] = useState("");
  const [cmSaving, setCmSaving] = useState(false);
  const [editCid, setEditCid] = useState<string | null>(null);
  const [editCmDate, setEditCmDate] = useState("");
  const [editCmBody, setEditCmBody] = useState("");
  const [openImgCid, setOpenImgCid] = useState<string | null>(null);   // comment ที่กางช่องรูปอยู่
  const [delComment, setDelComment] = useState<DesignSheetComment | null>(null);
  // เพิ่ม/แก้รอบเสนอราคา

  // ---- เฟส 4: ตีราคา ----
  const [priceItems, setPriceItems] = useState<PriceItem[]>([]);
  const priceItemById = useMemo(() => new Map(priceItems.map((it) => [it.id, it])), [priceItems]);
  const [priceGroups, setPriceGroups] = useState<PriceGroup[]>([]);
  const [copyFromOpen, setCopyFromOpen] = useState(false);   // โมดอลคัดลอกตีราคาจากใบงานอื่น
  // ✏️ ตีราคาดูได้ 2 แบบ: ตาราง ↔ แบบวาด (กระดานชิ้นวัสดุ · แก้แล้วตารางเปลี่ยนตามทันที) — จำแบบที่เลือกไว้ในเครื่อง
  const [costView, setCostViewState] = useState<"table" | "draw">(() => { try { return localStorage.getItem("ds-cost-view") === "draw" ? "draw" : "table"; } catch { return "table"; } });
  const setCostView = (v: "table" | "draw") => { setCostViewState(v); try { localStorage.setItem("ds-cost-view", v); } catch { /* เก็บไม่ได้ก็ไม่เป็นไร */ } };
  const [board, setBoard] = useState<{ initial: EditorPiece[]; refs: RefImage[]; sel: string | null; nonce: number; basis: "box" | "area"; skipped: number } | null>(null);
  const boardOpened = useRef<Set<string>>(new Set());   // บรรทัดที่ขึ้นกระดานตอนเปิด
  const boardPids = useRef<Set<string>>(new Set());     // รหัสชิ้นที่เคยอยู่บนกระดานรอบนี้ (ลบชิ้น = ลบบรรทัดของชิ้นนั้น)
  const [costLoadTick, setCostLoadTick] = useState(0);   // โหลดบรรทัดจากฐานข้อมูลเสร็จ → กระดานแบบวาดอ่านใหม่
  // ผูก SKU เข้าวัสดุตีราคา — ทำในตารางจัดการวัสดุตีราคา (ต่อแถว)
  const [pmLinks, setPmLinks] = useState<Record<string, string[]>>({});   // item_id → sku_ids
  const [pmLinkSkus, setPmLinkSkus] = useState<Record<string, SkuLite>>({}); // sku_id → {code,name}
  const [pmLinkFor, setPmLinkFor] = useState<PmRow | null>(null);          // แถวที่กำลังเลือก SKU
  const [costLines, setCostLines] = useState<CostRow[]>([]);             // ทุก Parent รวมกัน (กรองด้วย parent_code ตอนแสดง)
  const [costDirty, setCostDirty] = useState(false);
  // แท็บตีราคา: กล่องกว้างพอ = ตารางซ้าย + การ์ดสรุปติดขวา (เจ้าของขอ 2026-11-07) · แคบ = สรุปใต้ตาราง + แถบปุ่มติดล่าง
  const [costBoxW, setCostBoxW] = useState(0);
  const costRoRef = useRef<ResizeObserver | null>(null);
  const costBoxRef = useCallback((el: HTMLDivElement | null) => {
    costRoRef.current?.disconnect(); costRoRef.current = null;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setCostBoxW(el.clientWidth));
    ro.observe(el); costRoRef.current = ro; setCostBoxW(el.clientWidth);
  }, []);
  const costSide = costBoxW >= 1250;
  const [costSaving, setCostSaving] = useState(false);
  const [costParent, setCostParent] = useState<string>("");
  const [verOpen, setVerOpen] = useState(false);          // ป๊อป "เพิ่มเวอร์ชันตีราคา"
  const [verName, setVerName] = useState("");
  const [verCopy, setVerCopy] = useState(true);           // คัดลอกรายการจากแท็บที่กำลังดู              // ข้อ 7: แท็บ Parent ที่กำลังดู ("" = ทั่วไป)
  const [verRename, setVerRename] = useState<string | null>(null);   // ป๊อป "เปลี่ยนชื่อเวอร์ชัน" (key แท็บที่จะเปลี่ยน)
  const [verRenameName, setVerRenameName] = useState("");
  const [verDel, setVerDel] = useState<string | null>(null);         // ยืนยัน "ลบเวอร์ชัน" (key แท็บ)
  const [verBusy, setVerBusy] = useState(false);
  const [supplierReload, setSupplierReload] = useState(0);           // บังคับ Section สั่งจากร้าน โหลดใหม่หลังเปลี่ยนชื่อ/ลบเวอร์ชัน
  const [costExtraMap, setCostExtraMap] = useState<Record<string, CostExtra[]>>({});   // ค่าใช้จ่ายเพิ่ม แยกตาม Parent
  // บรรทัด + ค่าใช้จ่าย ของ Parent ที่กำลังดู (ตีราคาแยกตาม Parent SKU)
  const curLines = useMemo(() => costLines.filter((r) => pkey(r.parent_code) === costParent), [costLines, costParent]);
  const costExtra = costExtraMap[costParent] ?? [];
  const setCurExtra = (updater: (l: CostExtra[]) => CostExtra[]) =>
    setCostExtraMap((m) => ({ ...m, [costParent]: updater(m[costParent] ?? []) }));
  // บรรทัดตีราคาว่าง 1 บรรทัด (ของแท็บ Parent ที่กำลังดู) — ใช้ทั้งปุ่มในตารางและปุ่มในกล่องว่าง
  const newCostRow = useCallback((): CostRow => ({
    key: `n${Date.now()}_${costLines.length}`,
    parent_code: costParent || null,
    item_id: null, item_name: null, group_name: null, calc_method: null,
    width_cm: null, length_cm: null, pieces: null, face_width_cm: null,
    waste_percent: null, divisor: null, qty: null, uom: null,
    unit_price: null, amount: null, note: null, sort_order: costLines.length + 1,
  }), [costLines.length, costParent]);
  const addCostRow = useCallback(() => { setCostLines((prev) => [...prev, newCostRow()]); setCostDirty(true); }, [newCostRow]);
  // ✏️ เปิด "แบบวาด" ของแท็บที่ดูอยู่: บรรทัดที่วาดไว้ = รูปทรงจริง (รวมบรรทัดชิ้นเดียวกันด้วย pid) · บรรทัดแบบเดิมที่มีกว้าง×ยาว = สี่เหลี่ยม
  //   บรรทัดที่ไม่มีกว้าง×ยาว (อะไหล่ นับชิ้น · สาย/เทป คิดตามยาว) ไม่ขึ้นกระดาน (บอกจำนวนไว้)
  const openBoard = useCallback((selKey?: string | null) => {
    const rows = costLines.filter((r) => pkey(r.parent_code) === costParent);
    const drawable = rows.filter((r) => !!r.shape || ((usesWidth(r.calc_method) || rowIsPiece(r) || !r.calc_method) && Number(r.width_cm) > 0 && Number(r.length_cm) > 0));
    const groups = new Map<string, CostRow[]>();
    for (const r of drawable) { const g = r.shape?.pid ? `pid:${r.shape.pid}` : `row:${r.key}`; (groups.get(g) ?? groups.set(g, []).get(g)!).push(r); }
    const matOf = (r: CostRow): PieceMat | null => r.item_id ? { id: r.item_id, name: r.item_name ?? tr("วัสดุ", "Material") }
      : r.item_sku_code || r.item_name ? { id: `row:${r.key}`, name: [r.item_sku_code, r.item_name].filter(Boolean).join(" ") } : null;
    const initial: EditorPiece[] = [...groups.values()].map((g) => {
      const r = g[0];
      const mats: PieceMat[] = [];
      for (const x of g) { const m = matOf(x); if (m && !mats.some((y) => y.id === m.id)) mats.push(m); }
      if (r.shape) return { shape: r.shape.shape, holes: r.shape.holes, count: r.pieces ?? 1, allow: r.shape.allow, allowEdges: r.shape.allowEdges, foldEdges: r.shape.foldEdges, name: r.shape.name, mats, pid: r.shape.pid ?? `pc${r.key.replace(/[^\w-]/g, "").slice(-38)}`, at: r.shape.at, src: g.map((x) => x.key), grain: r.shape.grain ?? null, notches: r.shape.notches ?? [] };
      return { shape: { k: "rect", x: 0, y: 0, w: Number(r.width_cm), h: Number(r.length_cm) }, count: r.pieces ?? 1, mats, pid: `pc${r.key.replace(/[^\w-]/g, "").slice(-38)}`, src: [r.key] };
    });
    const refMap = new Map<string, RefImage>();
    for (const r of drawable) for (const ref of r.shape?.refs ?? []) refMap.set(`${ref.url}|${ref.x}|${ref.y}|${ref.w}`, ref);
    const sel = selKey ? initial.find((p) => p.src?.includes(selKey))?.pid ?? null : null;
    boardOpened.current = new Set(drawable.map((r) => r.key));
    boardPids.current = new Set(initial.map((p) => p.pid!));
    setBoard({ initial, refs: [...refMap.values()].slice(0, 4), sel, nonce: Date.now(), basis: drawable.find((r) => r.shape)?.shape?.basis ?? "box", skipped: rows.length - drawable.length });
    setCostView("draw");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costLines, costParent]);
  const openBoardRef = useRef(openBoard); openBoardRef.current = openBoard;
  // ✏️ กระดานส่งค่ากลับ (ทุกครั้งที่แก้) → บรรทัดตีราคา: 1 ชิ้น × 1 วัสดุ = 1 บรรทัด
  //   บรรทัดเดิมของชิ้น (pid / บรรทัดที่มาจาก) ที่วัสดุตรงกัน = ใช้ต่อ (ราคา/ประวัติอยู่) · วัสดุ/ชิ้นที่เอาออก = บรรทัดนั้นหาย
  //   กว้าง×ยาว = ขนาดตัด (รวมเผื่อพับ) · at = ตำแหน่งบนกระดาน · refs = รูปอ้างอิง (เก็บซ้ำทุกบรรทัดของแท็บ)
  const applyBoard = useCallback((res: ShapeEditorResult) => {
    for (const p of res.pieces) boardPids.current.add(p.pid);
    setCostLines((prev) => {
      const isBoardRow = (r: CostRow) => pkey(r.parent_code) === costParent && (boardOpened.current.has(r.key) || (!!r.shape?.pid && boardPids.current.has(r.shape.pid)));
      const pool = prev.filter(isBoardRow);
      const made: CostRow[] = [];
      res.pieces.forEach((p, i) => {
        const mine = (r: CostRow) => r.shape?.pid === p.pid || p.src.includes(r.key);
        const take = (mid: string | null) => {
          const k = pool.findIndex((r) => mine(r) && (mid == null ? !r.item_id && !r.item_sku_code && !r.item_name : mid.startsWith("row:") ? r.key === mid.slice(4) : r.item_id === mid));
          return k >= 0 ? pool.splice(k, 1)[0] : undefined;
        };
        const norm = normalizePiece(p.shape, p.holes, { grain: p.grain, notches: p.notches });   // เส้นทางผ้า/รอยบาก เลื่อนไปพร้อมชิ้น
        const ls: LineShape = {
          v: 1, shape: norm.shape, basis: res.basis, pid: p.pid, at: p.at,
          ...(norm.holes.length ? { holes: norm.holes } : {}), ...(p.allow ? { allow: p.allow } : {}), ...(p.allowEdges ? { allowEdges: p.allowEdges } : {}), ...(p.foldEdges ? { foldEdges: p.foldEdges } : {}), ...(p.name ? { name: p.name } : {}), ...(res.refs.length ? { refs: res.refs } : {}),
          ...(norm.grain && norm.grain.length === 2 ? { grain: [norm.grain[0], norm.grain[1]] as NonNullable<LineShape["grain"]> } : {}),
          ...(norm.notches?.length ? { notches: norm.notches } : {}),
        };
        const size = { width_cm: Math.round(p.geo.cutBox.w * 100) / 100, length_cm: Math.round(p.geo.cutBox.h * 100) / 100, pieces: p.count };
        const mats: (string | null)[] = p.mats.length ? p.mats.map((m) => m.id) : [null];
        mats.forEach((mid) => {
          let row = take(mid);
          let fresh = false;
          if (!row) {
            fresh = true;
            const it = mid && !mid.startsWith("row:") ? priceItemById.get(mid) : undefined;
            row = { ...(it ? rowFromItem(it, i) : newCostRow()), parent_code: costParent || null };
          }
          made.push(recomputeRow({ ...row, ...(fresh ? { key: `pc_${p.pid}_${mid ?? "x"}`.slice(0, 90) } : {}), shape: ls, ...size }));
        });
      });
      const first = prev.findIndex(isBoardRow);
      const rest = prev.filter((r) => !isBoardRow(r));
      rest.splice(first < 0 ? rest.length : prev.slice(0, first).filter((r) => !isBoardRow(r)).length, 0, ...made);
      return rest;
    });
    setCostDirty(true);
    setEditing(true);   // แก้บนกระดาน = เข้าโหมดแก้ไข (กดบันทึกตีราคาเพื่อเก็บ) · ห้ามอ้าง fullEdit ตรงนี้ (ประกาศทีหลัง → จอพัง)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costParent, priceItemById, newCostRow]);
  // เปลี่ยนแท็บ Parent ระหว่างดูแบบวาด → เปิดกระดานของแท็บนั้น · เปิดป๊อปมาด้วยแบบวาด (จำไว้) → สร้างกระดาน
  useEffect(() => { if (costView === "draw" && form?.id) openBoardRef.current(null); }, [costParent, form?.id, costLoadTick]);   // eslint-disable-line react-hooks/exhaustive-deps

  const costTotal  = curLines.reduce((s, r) => s + (r.amount || 0), 0);   // ต้นทุนวัสดุของ Parent นี้
  const extraTotal = costExtra.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const grandTotal = costTotal + extraTotal;                              // ต้นทุนสินค้าของ Parent นี้ (รวมทั้งหมด)
  // ต้นทุนสินค้ารวม (วัสดุ+ค่าใช้จ่าย) ของไซส์/แท็บใด ๆ — ใช้เด้งราคาตอนเสนอราคาตามไซส์
  // qty = คิดค่าแบบ "หารจำนวนสั่ง" ตามจำนวนนั้น (ขั้นราคาตอนเสนอราคา) · ไม่ส่ง = ใช้จำนวนที่ตั้งไว้ในตีราคา
  const presetsRef = useRef<CostPreset[] | null>(null);   // ราคากลาง (ตั้งค่าหลังประกาศ presetsApi)
  const totalForParent = useCallback((key: string, qty?: number | null) => {
    const mat = costLines.filter((r) => pkey(r.parent_code) === key).reduce((s, r) => s + (r.amount || 0), 0);
    const pr = presetsRef.current;
    const ex = (costExtraMap[key] ?? []).reduce((s, c) => s + (qty != null && qty > 0 && pr && extraKindOf(c) === "overhead" && c.oh
      ? overheadTotal(overheadRows(c.oh, pr, qty)) : extraAmountAt(c, qty)), 0);
    return Math.round((mat + ex) * 100) / 100;
  }, [costLines, costExtraMap]);
  // จำนวนที่สั่ง — ใช้หารค่าแบบ "หารจำนวนสั่ง" (ค่าบล็อกสกรีน) ของแท็บที่ดูอยู่ (เจ้าของขอ 2026-11-03)
  // ลำดับ: จำนวนที่บันทึกในรายการ > ที่พิมพ์ค้าง > รอบเสนอราคาล่าสุดของแท็บนี้ (ขั้นจำนวนน้อยสุด = ต่อชิ้นสูงสุด ปลอดภัยไว้ก่อน)
  const quoteQtyFor = useCallback((key: string): number | null => {
    const withQty = quotes.filter((q) => (q.qty ?? 0) > 0);
    const mine = withQty.filter((q) => pkey(q.parent_code) === key);
    const pool = mine.length ? mine : withQty;
    if (!pool.length) return null;
    const batchOf = (q: DesignSheetQuote) => q.batch ?? q.round;
    const last = Math.max(...pool.map(batchOf));
    return Math.min(...pool.filter((q) => batchOf(q) === last).map((q) => q.qty as number));
  }, [quotes]);
  const [orderQtyDraft, setOrderQtyDraft] = useState<Record<string, number | null>>({});
  const [packRefs, setPackRefs] = useState<Record<string, PackRef>>({});   // ขนาดสินค้า/กล่องส่งของแต่ละรุ่น (GET ใบงาน pack_refs)
  const [extraOpen, setExtraOpen] = useState<Set<string>>(new Set());      // แถวค่าใช้จ่ายเพิ่มที่กางดูรายละเอียด (โหมดดู)
  const hasSplitExtra = costExtra.some((c) => c.mode === "split");
  const savedSplitQty = costExtra.find((c) => c.mode === "split" && c.split_qty)?.split_qty ?? null;
  const orderQty: number | null = savedSplitQty ?? (costParent in orderQtyDraft ? orderQtyDraft[costParent] : quoteQtyFor(costParent));
  const orderQtyFromQuote = !(costParent in orderQtyDraft) && orderQty != null && orderQty === quoteQtyFor(costParent);   // ยังไม่ได้พิมพ์เอง + ตรงกับรอบเสนอราคา
  const setOrderQty = (q: number | null) => {
    setOrderQtyDraft((m) => ({ ...m, [costParent]: q }));
    setCurExtra((l) => l.map((c) => (c.mode === "split" ? cleanExtra({ ...c, split_qty: q })
      : extraKindOf(c) === "overhead" && c.oh && presetsApi.loaded ? { ...c, amount: overheadTotal(overheadRows(c.oh, presetsApi.presets, q)) } : c)));
    setCostDirty(true); setEditing(true);   // จำนวนที่สั่งบันทึกพร้อมตีราคา (design_sheets.order_qty) · ห้ามอ้าง fullEdit ตรงนี้ (ประกาศทีหลัง)
  };
  // จำนวนในรอบเสนอราคาของแท็บนี้ (ปุ่มกดใช้บนแถบจำนวนที่สั่ง)
  const quoteQtyChips = useMemo(() => {
    const withQty = quotes.filter((q) => (q.qty ?? 0) > 0);
    const mine = withQty.filter((q) => pkey(q.parent_code) === costParent);
    const pool = mine.length ? mine : withQty;
    const byQty = new Map<number, number>();
    for (const q of pool) { const b = q.batch ?? q.round; const cur = byQty.get(q.qty as number); if (cur == null || b > cur) byQty.set(q.qty as number, b); }
    return [...byQty.entries()].sort((a, b) => a[0] - b[0]).map(([qty, b]) => ({ qty, label: t(`รอบ ${b}`, `Round ${b}`) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotes, costParent]);
  // สลับ "ต่อชิ้น" ↔ "หารจำนวนสั่ง" — ตัวเลขในช่องคงเดิม เปลี่ยนแค่ความหมาย (ต่อชิ้น ↔ ยอดรวมจ่ายครั้งเดียว)
  const setExtraMode = (i: number, split: boolean) => {
    setCurExtra((l) => l.map((c, xi) => (xi !== i ? c : split
      ? cleanExtra({ label: c.label, kind: c.kind, note: c.note, mode: "split", total: c.amount, split_qty: orderQty })
      : cleanExtra({ label: c.label, kind: c.kind, note: c.note, amount: c.total ?? 0 }))));
    setCostDirty(true);
  };
  /** แก้รายการค่าใช้จ่ายเพิ่มบางช่อง (ชนิด / ยอด / หมายเหตุ / ตั้งค่าโสหุ้ย) — ผ่าน cleanExtra ทุกครั้ง */
  const orderQtyFor = useCallback((key: string): number | null =>
    (costExtraMap[key] ?? []).find((c) => c.mode === "split" && c.split_qty)?.split_qty ?? orderQtyDraft[key] ?? quoteQtyFor(key),
  [costExtraMap, orderQtyDraft, quoteQtyFor]);
  // ขนาดที่ระบบรู้ของแท็บนี้ → ตัวเลือก "ขนาดสินค้าตอนแพ็ก" (ขนาดสินค้า · กล่องส่ง · ชิ้นใหญ่สุด)
  const packSugg = useMemo(() => {
    const code = costParent || (form?.parent_sku_codes?.[0] ?? "");
    return packSuggestions(code ? packRefs[code] : null, curLines, code || null);
  }, [packRefs, costParent, curLines, form?.parent_sku_codes]);
  const updExtra = (i: number, patch: Partial<SnapExtra>) => {
    setCurExtra((l) => l.map((c, xi) => (xi === i ? cleanExtra({ ...c, ...patch }) : c)));
    setCostDirty(true);
  };
  const splitFixedTotal = costExtra.reduce((s, c) => s + (c.mode === "split" ? c.total ?? 0 : 0), 0);
  // ราคาที่เสนอ (ผ่านแล้ว) ล่าสุด — ใช้เป็นราคาตั้งต้นใน Wizard สร้าง SKU
  const offeredPrice = useMemo<number | null>(() => {
    const val = (q: DesignSheetQuote) => (q.offered_price ?? q.price);
    const passed = quotes.filter((q) => q.status === "passed" && val(q) != null);
    const pool = passed.length > 0 ? passed : quotes.filter((q) => val(q) != null);
    if (pool.length === 0) return null;
    return val(pool.reduce((a, b) => (b.round > a.round ? b : a))) ?? null;
  }, [quotes]);
  // ต้นทุนวัสดุแยกตามชนิด (สำหรับการ์ดสรุป)
  const costByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of curLines) { const k = r.group_name || t("ไม่ระบุชนิด", "Unspecified type"); m.set(k, (m.get(k) ?? 0) + (r.amount || 0)); }
    return [...m.entries()].map(([label, amount]) => ({ label, amount }));
  }, [curLines, t]);
  // ชื่อแท็บ "ทั่วไป" ของใบนี้ (ตั้งเองได้ · ว่าง = ทั่วไป) — ของกลาง lib/design-sheet-cost-labels
  const generalLabel = generalLabelOf(form?.cost_general_label);
  // แท็บ Parent ในแท็บตีราคา: ทั่วไป + รหัสจริง + ร่าง + parent_code ที่มีบรรทัดแต่หลุดจากลิสต์ (กันงานหาย)
  const costParentTabs = useMemo(() => {
    const codes = form?.parent_sku_codes ?? [];
    const drafts = form?.parent_sku_drafts ?? [];
    const tabs: { key: string; label: string; kind: "general" | "code" | "draft" | "orphan" }[] = [{ key: "", label: generalLabel, kind: "general" }];
    for (const c of codes) tabs.push({ key: c, label: c, kind: "code" });
    for (const d of drafts) tabs.push({ key: d, label: d, kind: "draft" });
    for (const k of new Set(costLines.map((r) => pkey(r.parent_code)))) {
      if (k && !codes.includes(k) && !drafts.includes(k)) tabs.push({ key: k, label: k, kind: "orphan" });
    }
    return tabs;
  }, [form?.parent_sku_codes, form?.parent_sku_drafts, costLines, generalLabel]);
  // ป้ายไซส์ของรอบเสนอราคา (null = รอบเก่าไม่ระบุ · "" = ทั่วไป)
  // 📣 แจ้งลูกค้า: ส่ง "ใช้ต่อใบ" จากแท็บตีราคา + จำนวนสั่งจากรอบเสนอราคาล่าสุด ให้แท็บแจ้งลูกค้า (notice-tab.tsx)
  const noticeCostTabs = useMemo(() => costParentTabs.map((tb) => ({ key: tb.key, label: tb.label, kind: tb.kind })), [costParentTabs]);
  const noticeCostLines = useMemo(() => costLines.map((r) => ({
    parent_code: pkey(r.parent_code), item_id: r.item_id, item_sku_id: r.item_sku_id ?? null, item_name: r.item_name,
    group_name: r.group_name, qty: r.qty, uom: r.uom, piece: rowIsPiece(r), amount: r.amount,
  })), [costLines]);
  const noticeSheetOf = useCallback((id: string) => priceItemById.get(id), [priceItemById]);
  const noticeOrderOf = useCallback((key: string) => {
    const qs = quotes.filter((q) => (q.parent_code ?? "") === key && q.qty != null && q.qty > 0)
      .sort((a, b) => b.round - a.round || (a.qty ?? 0) - (b.qty ?? 0));
    return qs[0]?.qty ?? null;
  }, [quotes]);
  const quoteSizeLabel = (code: string | null) =>
    code == null ? "—" : code === "" ? generalLabel : (costParentTabs.find((tb) => tb.key === code)?.label ?? code);

  // ---- เฟส 5: ตั้ง Parent SKU + ตัวเช็ครหัส ----
  const [skuCheck, setSkuCheck] = useState<ParentSkuCheck | null>(null);
  const [skuChecking, setSkuChecking] = useState(false);
  const [skuInput, setSkuInput] = useState("");   // ช่องพิมพ์รหัส Parent SKU ที่กำลังจะเพิ่ม
  const [draftInput, setDraftInput] = useState("");   // ช่องพิมพ์ "ร่าง Parent" (ชื่อ ยังไม่มีรหัสจริง)

  // ---- ปุ่ม ＋ เพิ่มแบรนด์ใหม่จากในฟอร์ม ----
  const [brandModal, setBrandModal] = useState(false);
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandColor, setNewBrandColor] = useState("#3b82f6");
  const [brandSaving, setBrandSaving] = useState(false);

  const addBrand = async () => {
    if (!newBrandName.trim()) { toast.error(t("กรุณาใส่ชื่อแบรนด์", "Please enter a brand name")); return; }
    setBrandSaving(true);
    try {
      const res = await apiFetch("/api/brands", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newBrandName.trim(), color: newBrandColor }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      const b = j.data as Brand;
      setBrands((list) => [...list, b].sort((x, y) => x.name.localeCompare(y.name, "th")));
      patch({ brand_id: b.id });   // เลือกแบรนด์ใหม่ให้เลย
      setBrandModal(false);
      toast.success(t(`เพิ่มแบรนด์ "${b.name}" แล้ว`, `Added brand "${b.name}"`));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("เพิ่มแบรนด์ไม่สำเร็จ", "Failed to add brand")); }
    finally { setBrandSaving(false); }
  };

  // ---- popup จัดการวัสดุตีราคา (จากแท็บตีราคา — เพิ่ม/แก้/เก็บเข้ากรุ ได้เลยไม่ต้องออกไปหน้า master) ----
  type PmRow = { id: string; name: string; code: string | null; material_group_id: string | null; price_per_unit: number | null; uom: string | null; face_width_cm: number | null; width_cm: number | null; length_cm: number | null; cut_rate?: number | null };
  const [pmOpen, setPmOpen] = useState(false);
  const [pmLoading, setPmLoading] = useState(false);
  const [pmRows, setPmRows] = useState<PmRow[]>([]);
  const [mgList, setMgList] = useState<MaterialGroup[]>([]);
  const [pmName, setPmName] = useState("");
  const [pmGroup, setPmGroup] = useState("");
  const [pmPrice, setPmPrice] = useState("");
  const [pmUom, setPmUom] = useState("");
  const [pmFace, setPmFace] = useState("");
  const [pmWidth, setPmWidth] = useState("");
  const [pmLength, setPmLength] = useState("");
  const [pmCut, setPmCut] = useState("");   // ราคาตัด/ปลอก/วาด ต่อชิ้น (ว่าง = ราคากลาง)
  const [pmSaving, setPmSaving] = useState(false);
  const [pmEditId, setPmEditId] = useState<string | null>(null);
  const [pmEdit, setPmEdit] = useState({ name: "", material_group_id: "", price: "", uom: "", face: "", width: "", length: "", cut: "" });
  const [pmDel, setPmDel] = useState<PmRow | null>(null);
  const [pmSearch, setPmSearch] = useState("");                                  // ค้นหาในป๊อปจัดการวัสดุ
  const [pmSort, setPmSort] = useState<{ key: "name" | "group" | "price"; dir: "asc" | "desc" }>({ key: "name", dir: "asc" });
  const mgName = (id: string | null) => mgList.find((g) => g.id === id)?.name ?? "—";
  const mgOf = (id: string | null) => mgList.find((g) => g.id === id) ?? null;
  const groupUsesPiece = (id: string | null) => isPieceGroup(mgOf(id)?.code, mgOf(id)?.name);  // ชนิดชิ้น (กว้าง×ยาว)
  const groupUsesFace = (id: string | null) => mgOf(id)?.calc_method === "area_face" && !groupUsesPiece(id);  // ผ้าม้วน
  const groupHint = (id: string | null): string => {
    if (groupUsesPiece(id)) return t("ซื้อเป็นแผ่น — ใส่ขนาดแผ่น กว้าง×ยาว + ราคา/แผ่น → ระบบหารเป็นราคา/cm² · ตอนตีราคา = พื้นที่ที่ใช้ × ราคา/cm² × จำนวน", "Bought as sheets — enter sheet width×length + price/sheet → system divides into price/cm² · when costing = area used × price/cm² × qty");
    const m = mgOf(id)?.calc_method;
    if (m === "area_face") return t("ผ้าม้วน — ใส่หน้ากว้าง · ตอนตีราคาใส่ กว้าง × ยาว × จำนวน (พื้นที่ ÷ หน้ากว้าง)", "Fabric roll — enter roll width · when costing enter width × length × qty (area ÷ roll width)");
    if (m === "area_100")  return t("คิดตามพื้นที่ ÷ 100 — ตอนตีราคาใส่ กว้าง × ยาว × จำนวน", "By area ÷ 100 — when costing enter width × length × qty");
    if (m === "length")    return t("คิดตามความยาว — ตอนตีราคาใส่แค่ ยาว", "By length — when costing enter length only");
    if (m === "count")     return t("คิดตามจำนวนชิ้น — ตอนตีราคาใส่ จำนวนชิ้น", "By pcs — when costing enter pcs");
    return "";
  };
  // คัดลอกวัสดุที่มีอยู่ → เติมค่าลงช่องเพิ่มด้านบน (ชื่อ + " (copy)") ให้แก้นิดเดียวแล้วกดเพิ่ม
  const pmCopy = (r: PmRow) => {
    setPmEditId(null);
    setPmName(`${r.name} (copy)`); setPmGroup(r.material_group_id ?? "");
    setPmPrice(r.price_per_unit != null ? String(r.price_per_unit) : "");
    setPmUom(r.uom ?? ""); setPmFace(r.face_width_cm != null ? String(r.face_width_cm) : "");
    setPmWidth(r.width_cm != null ? String(r.width_cm) : ""); setPmLength(r.length_cm != null ? String(r.length_cm) : ""); setPmCut(r.cut_rate != null ? String(r.cut_rate) : "");
    toast.info(t("คัดลอกค่ามาที่ช่องเพิ่มด้านบนแล้ว — แก้ชื่อ/ค่าแล้วกด ＋ เพิ่ม", "Copied into the add row above — edit name/values then press ＋ Add"));
  };
  const pmToggleSort = (key: "name" | "group" | "price") =>
    setPmSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  // รายการที่แสดง = กรองด้วยค้นหา + เรียงตามหัวคอลัมน์
  const pmShown = useMemo(() => {
    const q = pmSearch.trim().toLowerCase();
    let rows = pmRows.filter((r) => !q || (r.name ?? "").toLowerCase().includes(q) || mgName(r.material_group_id).toLowerCase().includes(q));
    const dir = pmSort.dir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      if (pmSort.key === "price") return ((a.price_per_unit ?? 0) - (b.price_per_unit ?? 0)) * dir;
      const av = pmSort.key === "group" ? mgName(a.material_group_id) : (a.name ?? "");
      const bv = pmSort.key === "group" ? mgName(b.material_group_id) : (b.name ?? "");
      return av.localeCompare(bv, "th") * dir;
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pmRows, pmSearch, pmSort, mgList]);

  const loadPm = useCallback(async (): Promise<PmRow[]> => {
    setPmLoading(true);
    let rows: PmRow[] = [];
    try {
      const [ir, gr, ps] = await Promise.all([
        apiFetch("/api/master-v2/design-price-items?limit=500").then((r) => r.json()),
        apiFetch("/api/bom/material-groups").then((r) => r.json()),
        apiFetch("/api/design-sheets/price-item-skus").then((r) => r.json()),
      ]);
      rows = (ir.data ?? ir.rows ?? []) as PmRow[];
      setPmRows(rows);
      setMgList((gr.data ?? []) as MaterialGroup[]);
      if (!ps.error) { setPmLinks((ps.links ?? {}) as Record<string, string[]>); setPmLinkSkus((ps.skus ?? {}) as Record<string, SkuLite>); }
    } catch { /* ignore */ } finally { setPmLoading(false); }
    return rows;
  }, []);

  // ผูก/ปลด SKU ของวัสดุตีราคาแถวหนึ่ง
  const savePmLink = async (itemId: string, ids: string[]) => {
    setPmLinks((m) => ({ ...m, [itemId]: ids }));
    const j = await apiFetch("/api/design-sheets/price-item-skus", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item_id: itemId, sku_ids: ids }),
    }).then((r) => r.json());
    if (j.error) { toast.error(j.error); void loadPm(); } else toast.success(t("บันทึก SKU ที่ผูกแล้ว", "Linked SKUs saved"));
  };
  const onPmLinkPicked = (picked: SkuPickerValue[]) => {
    if (!pmLinkFor) return;
    setPmLinkSkus((m) => { const n = { ...m }; for (const s of picked) n[s.id] = { id: s.id, code: s.code, name: s.name }; return n; });
    const ids = [...new Set([...(pmLinks[pmLinkFor.id] ?? []), ...picked.map((s) => s.id)])];
    void savePmLink(pmLinkFor.id, ids);
    setPmLinkFor(null);
  };

  const openPm = () => { setPmOpen(true); setPmForItem(null); setPmSearch(""); setPmEditId(null); setPmName(""); setPmGroup(""); setPmPrice(""); setPmUom(""); setPmFace(""); setPmWidth(""); setPmLength(""); setPmCut(""); void loadPm(); };
  const closePm = () => { setPmOpen(false); setPmForItem(null); setPriceItems([]); setPriceGroups([]); };   // ปิดแล้ว dropdown วัสดุ/กลุ่มในตารางตีราคารีโหลดเอง

  // ปุ่ม "ใส่รายละเอียด" ในแถวตีราคา (เจ้าของขอ 2026-11-03) — วัสดุที่เพิ่งพิมพ์สร้างจาก dropdown ยังไม่มีชนิด/ราคา
  // → เปิดป๊อปจัดการวัสดุ กรองเหลือตัวนั้น + เปิดแก้ทันที · กดบันทึกแล้วเติมชนิด/ราคาให้แถวที่ยังขาด แล้วปิดป๊อปเอง
  const [pmForItem, setPmForItem] = useState<string | null>(null);
  const openPmFor = async (itemId: string, name: string) => {
    setPmOpen(true); setPmForItem(itemId); setPmSearch(name); setPmEditId(null);
    const rows = await loadPm();
    const r = rows.find((x) => x.id === itemId);
    if (r) pmStartEdit(r);
  };
  const openPmForRef = useRef(openPmFor);
  openPmForRef.current = openPmFor;
  // หลังบันทึกรายละเอียด: โหลดวัสดุใหม่ แล้วเติมให้แถวที่ใช้วัสดุนี้แต่ยังไม่มีชนิด/ราคา (แถวที่ครบแล้วไม่แตะ — ราคาเปลี่ยนมีตัวเตือนเดิมอยู่)
  const applyItemDetails = async (itemId: string) => {
    try {
      const pr = await apiFetch("/api/design-sheets/price-items").then((r) => r.json());
      if (pr.error) return;
      const items = (pr.data ?? []) as PriceItem[];
      setPriceItems(items); setPriceGroups((pr.groups ?? []) as PriceGroup[]);
      const it = items.find((p) => p.id === itemId);
      if (!it) return;
      const hit = costLines.filter((r) => r.item_id === itemId && rowNeedsItemDetails(r)).length;
      if (hit > 0) {
        setCostLines((ls) => ls.map((r) => (r.item_id === itemId && rowNeedsItemDetails(r) ? recomputeRow({ ...r, ...costItemPatch(it, r) }) : r)));
        setCostDirty(true);
        toast.success(t(`เติมรายละเอียด "${it.name}" ให้ ${hit} แถวแล้ว — อย่าลืมกดบันทึกราคา`, `Filled "${it.name}" details into ${hit} lines — remember to save the costing`));
      }
    } catch { /* ignore */ }
  };
  const numOrNull = (s: string) => (s === "" ? null : Number(s));

  const pmAdd = async () => {
    if (!pmName.trim()) { toast.error(t("กรุณาใส่ชื่อวัสดุ", "Please enter a material name")); return; }
    setPmSaving(true);
    const piece = groupUsesPiece(pmGroup);
    try {
      const res = await apiFetch("/api/master-v2/design-price-items", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pmName.trim(), material_group_id: pmGroup || null, price_per_unit: numOrNull(pmPrice), uom: pmUom.trim() || null,
          face_width_cm: piece ? null : numOrNull(pmFace), width_cm: piece ? numOrNull(pmWidth) : null, length_cm: piece ? numOrNull(pmLength) : null, cut_rate: numOrNull(pmCut) }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setPmName(""); setPmPrice(""); setPmUom(""); setPmFace(""); setPmWidth(""); setPmLength(""); setPmCut("");
      await loadPm(); toast.success(t("เพิ่มวัสดุแล้ว", "Material added"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("เพิ่มวัสดุไม่สำเร็จ", "Failed to add material")); }
    finally { setPmSaving(false); }
  };

  const pmStartEdit = (r: PmRow) => { setPmEditId(r.id); setPmEdit({ name: r.name ?? "", material_group_id: r.material_group_id ?? "", price: r.price_per_unit != null ? String(r.price_per_unit) : "", uom: r.uom ?? "", face: r.face_width_cm != null ? String(r.face_width_cm) : "", width: r.width_cm != null ? String(r.width_cm) : "", length: r.length_cm != null ? String(r.length_cm) : "", cut: r.cut_rate != null ? String(r.cut_rate) : "" }); };
  const pmSaveEdit = async () => {
    if (!pmEditId) return;
    if (!pmEdit.name.trim()) { toast.error(t("กรุณาใส่ชื่อวัสดุ", "Please enter a material name")); return; }
    const piece = groupUsesPiece(pmEdit.material_group_id);
    try {
      const res = await apiFetch(`/api/master-v2/design-price-items/${pmEditId}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pmEdit.name.trim(), material_group_id: pmEdit.material_group_id || null, price_per_unit: numOrNull(pmEdit.price), uom: pmEdit.uom.trim() || null,
          face_width_cm: piece ? null : numOrNull(pmEdit.face), width_cm: piece ? numOrNull(pmEdit.width) : null, length_cm: piece ? numOrNull(pmEdit.length) : null, cut_rate: numOrNull(pmEdit.cut) }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      const savedId = pmEditId;
      setPmEditId(null); toast.success(t("บันทึกวัสดุแล้ว", "Material saved"));
      // เปิดมาจากปุ่ม "ใส่รายละเอียด" ในแถว → เติมให้แถว แล้วกลับไปที่ตารางเลย
      if (pmForItem && savedId === pmForItem) { await applyItemDetails(savedId); setPmOpen(false); setPmForItem(null); }
      else await loadPm();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
  };

  const pmDelete = async () => {
    if (!pmDel) return;
    try {
      const res = await apiFetch(`/api/master-v2/design-price-items/${pmDel.id}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (j.error) throw new Error(j.error);
      setPmDel(null); await loadPm(); toast.success(t("เก็บวัสดุเข้ากรุแล้ว", "Material archived"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ลบไม่สำเร็จ", "Delete failed")); }
  };

  // ---- รูปก่อนบันทึก (ตอนสร้างใหม่): พักไว้ในเครื่อง → อัปโหลดอัตโนมัติตอนกดบันทึก ----
  const [pendImgs, setPendImgs] = useState<Array<{ file: File; url: string }>>([]);
  const [pendDragging, setPendDragging] = useState(false);
  const pendFileRef = useRef<HTMLInputElement>(null);

  const addPendFiles = (files: FileList | File[]) => {
    const ok = Array.from(files).filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (ok.length === 0) return;
    setPendImgs((list) => [...list, ...ok.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };
  const removePend = (i: number) => setPendImgs((list) => {
    URL.revokeObjectURL(list[i]?.url ?? "");
    return list.filter((_, x) => x !== i);
  });
  const clearPend = useCallback(() => {
    setPendImgs((list) => { list.forEach((p) => URL.revokeObjectURL(p.url)); return []; });
  }, []);

  // ---- เตือนก่อนปิด (มีข้อมูลตีราคายังไม่บันทึก) ----
  const doClose = useCallback(() => {
    setForm(null); clearPend(); setCloseConfirm(false);
    if (detailOnly) onDetailClose?.();   // โหมด popup-เดี่ยว: ปิด modal = แจ้งหน้าแม่ให้ถอด overlay
  }, [clearPend, detailOnly, onDetailClose]);
  const requestClose = () => {
    if (saving) return;
    if (costDirty || supplierDirty || specDirty || noticeDirty) setCloseConfirm(true);   // ตีราคา / ตีราคาสั่งจากร้าน / รายละเอียดงาน / ใบแจ้งลูกค้า มีแก้ค้าง
    else doClose();
  };
  // "บันทึกแล้วปิด" — บันทึกตีราคา + ตีราคาสั่งจากร้าน ที่ค้าง แล้วปิด
  const saveAndClose = async () => {
    setCloseSaving(true);
    try {
      if (costDirty) await saveCost();
      if (supplierDirty) await supplierSaveRef.current?.();
      if (specDirty && (await specSaveRef.current?.()) === false) return;   // บันทึกรายละเอียดงานไม่ผ่าน = ไม่ปิด
      if (noticeDirty && (await noticeSaveRef.current?.()) === false) return;   // บันทึกใบแจ้งลูกค้าไม่ผ่าน = ไม่ปิด
      doClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setCloseSaving(false); }
  };
  const discardAndClose = () => doClose();

  // Ctrl+V วางรูป — ทำงานเฉพาะตอนเปิดฟอร์มสร้างใหม่ (ยังไม่มี id)
  useEffect(() => {
    if (!form || form.id || !canEdit) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length > 0) { e.preventDefault(); addPendFiles(files); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [form, canEdit]);

  const loadCq = useCallback(async (sheetId: string) => {
    setCqLoading(true);
    try {
      const [cr, qr, lr] = await Promise.all([
        apiFetch(`/api/design-sheets/${sheetId}/comments`).then((r) => r.json()),
        apiFetch(`/api/design-sheets/${sheetId}/quotes`).then((r) => r.json()),
        apiFetch(`/api/design-sheets/${sheetId}/cost-lines`).then((r) => r.json()),
      ]);
      if (!cr.error) setComments((cr.data ?? []) as DesignSheetComment[]);
      if (!qr.error) setQuotes((qr.data ?? []) as DesignSheetQuote[]);
      if (!lr.error) { setCostLines(((lr.data ?? []) as CostLine[]).map((l, i) => ({ ...l, key: `db${i}_${l.id ?? ""}` }))); setCostDirty(false); setCostLoadTick((n) => n + 1); }
    } catch { /* ignore */ }
    finally { setCqLoading(false); }
  }, []);

  // โหลด master วัสดุตีราคาครั้งเดียว (ตอนเปิดใบที่บันทึกแล้ว)
  useEffect(() => {
    if (!form?.id || priceItems.length > 0) return;
    apiFetch("/api/design-sheets/price-items").then((r) => r.json())
      .then((j) => { if (!j.error) { setPriceItems((j.data ?? []) as PriceItem[]); setPriceGroups((j.groups ?? []) as PriceGroup[]); } }).catch(() => {});
  }, [form?.id, priceItems.length]);

  // เช็ครหัส Parent SKU (ตัวที่กำลังพิมพ์ในช่องเพิ่ม) แบบหน่วง 400ms
  useEffect(() => {
    const code = skuInput.trim();
    if (!code) { setSkuCheck(null); setSkuChecking(false); return; }
    setSkuChecking(true);
    const t = setTimeout(() => {
      apiFetch(`/api/design-sheets/parent-sku-check?code=${encodeURIComponent(code)}`).then((r) => r.json())
        .then((j) => { if (!j.error) setSkuCheck(j.data as ParentSkuCheck); })
        .catch(() => {})
        .finally(() => setSkuChecking(false));
    }, 400);
    return () => clearTimeout(t);
  }, [skuInput]);

  // เพิ่มรหัสที่พิมพ์เข้า "รายการ Parent SKU" (กันซ้ำในลิสต์ + ห้ามตัวที่มีอยู่ในระบบ)
  const addParentCode = () => {
    const code = skuInput.trim().toUpperCase();
    if (!code) return;
    if (skuCheck?.exists) { setFormErr(t(`รหัส ${code} มีอยู่ในระบบแล้ว — ห้ามตั้งซ้ำ`, `Code ${code} already exists — duplicates not allowed`)); return; }
    setForm((f) => (f && !f.parent_sku_codes.includes(code) ? { ...f, parent_sku_codes: [...f.parent_sku_codes, code] } : f));
    setSkuInput(""); setSkuCheck(null);
  };
  // เพิ่มรหัสตรง ๆ (ปุ่มลัด "ใช้รหัสถัดไป" ในกล่องสินค้าของงาน — กล่องเช็กแล้วว่าไม่ซ้ำ)
  const addParentCodeValue = (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    setForm((f) => (f && !f.parent_sku_codes.includes(code) ? { ...f, parent_sku_codes: [...f.parent_sku_codes, code] } : f));
  };
  const removeParentCode = (code: string) =>
    setForm((f) => (f ? { ...f, parent_sku_codes: f.parent_sku_codes.filter((c) => c !== code) } : f));

  // ข้อ 6: ร่าง Parent (ชื่อล้วน ยังไม่มีรหัสจริง)
  const addParentDraft = () => {
    const label = draftInput.trim();
    if (!label) return;
    setForm((f) => (f && !f.parent_sku_drafts.includes(label) ? { ...f, parent_sku_drafts: [...f.parent_sku_drafts, label] } : f));
    setDraftInput("");
  };
  const removeParentDraft = (label: string) =>
    setForm((f) => (f ? { ...f, parent_sku_drafts: f.parent_sku_drafts.filter((d) => d !== label) } : f));

  const saveCost = useCallback(async (linesOverride?: CostRow[]): Promise<boolean> => {
    if (!form?.id) return false;
    const src = linesOverride ?? costLines;
    setCostSaving(true);
    try {
      // บันทึกพร้อมกัน: บรรทัดวัสดุ (PUT cost-lines) + ค่าใช้จ่ายเพิ่ม (PATCH design-sheets)
      const [lr, er] = await Promise.all([
        apiFetch(`/api/design-sheets/${form.id}/cost-lines`, { method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines: src.map((row, i) => { const { key: _key, ...l } = row; void _key; return { ...l, sort_order: i + 1 }; }), cost_extra: costExtraMap }) }),
        apiFetch(`/api/design-sheets/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
          // ส่ง cost_extra ทั้ง map (แยกตาม Parent) + ชื่อเวอร์ชัน/ร่าง Parent (แท็บที่เพิ่มจากหน้านี้จะได้ไม่หายตอนรีโหลด)
          body: JSON.stringify({ cost_extra: costExtraMap, parent_sku_drafts: form.parent_sku_drafts, order_qty: cleanOrderQty(orderQtyDraft) }) }),
      ]);
      const lj = await lr.json(); if (lj.error) throw new Error(lj.error);
      const ej = await er.json(); if (ej.error) throw new Error(ej.error);
      setCostDirty(false);
      toast.success(t(`บันทึกตีราคาแล้ว (${lj.saved} บรรทัด)`, `Costing saved (${lj.saved} lines)`));
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกตีราคาไม่สำเร็จ", "Failed to save costing")); return false; }
    finally { setCostSaving(false); }
  }, [form?.id, form?.parent_sku_drafts, costLines, costExtraMap, orderQtyDraft, toast, t]);

  // เปลี่ยนชื่อ / ลบ "เวอร์ชันตีราคา" (แท็บ) — เซิร์ฟเวอร์แก้ให้ครบทุกตาราง (วัสดุ/สั่งจากร้าน/เสนอราคา/ค่าใช้จ่ายเพิ่ม/แบ่งกำไร/ชื่อ) แล้วหน้าจอรีโหลด
  const versionOp = async (action: "rename" | "delete", from: string, to?: string): Promise<boolean> => {
    if (!form?.id) return false;
    setVerBusy(true);
    try {
      // ของที่แก้ค้างบนหน้าจอต้องลงฐานข้อมูลก่อน — ไม่งั้นเซิร์ฟเวอร์เปลี่ยนชื่อไม่ครบ / ลบแล้วบรรทัดโผล่กลับตอนกดบันทึก
      if (costDirty && !(await saveCost())) return false;
      if (supplierDirty) await supplierSaveRef.current?.();
      const res = await apiFetch(`/api/design-sheets/${form.id}/versions`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, from, to }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      // รีโหลดบรรทัดวัสดุ + ปรับชื่อเวอร์ชัน/ค่าใช้จ่ายเพิ่มในหน้าจอให้ตรงกับที่เซิร์ฟเวอร์ทำ + Section สั่งจากร้านโหลดใหม่
      await loadCq(form.id);
      setForm((f) => {
        if (!f) return f;
        let drafts = f.parent_sku_drafts.filter((d) => d !== from);
        if (action === "rename" && to && !drafts.includes(to)) drafts = [...drafts, to];
        return { ...f, parent_sku_drafts: drafts };
      });
      setCostExtraMap((m) => {
        const out: Record<string, CostExtra[]> = {};
        for (const [k, v] of Object.entries(m)) { if (k === from) { if (action === "rename" && to) out[to] = v; } else out[k] = v; }
        return out;
      });
      setSupplierReload((n) => n + 1);
      setCostParent(action === "rename" && to ? to : "");
      const c = (j.counts ?? {}) as Record<string, number>;
      const n = (c.design_sheet_cost_lines ?? 0) + (c.design_sheet_supplier_lines ?? 0);
      toast.success(action === "rename" ? t(`เปลี่ยนชื่อ "${from}" → "${to}" แล้ว (${n} รายการตามไปด้วย)`, `Renamed "${from}" → "${to}" (${n} items updated too)`) : t(`ลบเวอร์ชัน "${from}" แล้ว (${n} รายการ)`, `Deleted version "${from}" (${n} items)`));
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ทำรายการไม่สำเร็จ", "Action failed")); return false; }
    finally { setVerBusy(false); }
  };

  // ตั้งชื่อแท็บ "ทั่วไป" เอง — เก็บที่ใบงาน (cost_general_label) บันทึกทันที · คีย์แท็บยังเป็น "" → รอบเสนอราคา/เวอร์ชัน/สั่งร้านที่ผูกไว้ไม่กระทบ
  const saveGeneralLabel = async (name: string): Promise<boolean> => {
    if (!form?.id) return false;
    const label = name.trim();
    if (label && costParentTabs.some((tb) => tb.key !== "" && tb.key === label)) { toast.error(t(`มีแท็บชื่อ "${label}" อยู่แล้ว — ตั้งชื่ออื่น`, `A tab named "${label}" already exists — choose another name`)); return false; }
    setVerBusy(true);
    try {
      const res = await apiFetch(`/api/design-sheets/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cost_general_label: label || null }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setForm((f) => (f ? { ...f, cost_general_label: label } : f));
      toast.success(label ? t(`ตั้งชื่อแท็บเป็น "${label}" แล้ว`, `Tab renamed to "${label}"`) : t('ใช้ชื่อ "ทั่วไป" ตามเดิมแล้ว', 'Back to the default "General" name'));
      return true;
    } catch (e) { toast.error(e instanceof Error ? e.message : t("เปลี่ยนชื่อไม่สำเร็จ", "Rename failed")); return false; }
    finally { setVerBusy(false); }
  };
  const doRename = async () => {
    if (verRename === "") { if (await saveGeneralLabel(verRenameName)) setVerRename(null); return; }
    const from = verRename ?? ""; const to = verRenameName.trim();
    if (!to) { toast.error(t("ตั้งชื่อใหม่ก่อน", "Enter a new name first")); return; }
    if (to === from) { setVerRename(null); return; }
    if (costParentTabs.some((tb) => tb.key === to)) { toast.error(t(`มีแท็บชื่อ "${to}" อยู่แล้ว — ตั้งชื่ออื่น`, `A tab named "${to}" already exists — choose another name`)); return; }
    if (await versionOp("rename", from, to)) setVerRename(null);
  };

  // 📐 รายละเอียดงาน → "ส่งไปตีราคา": วัตถุดิบจากหมุด = บรรทัดใหม่ในแท็บตีราคาที่ดูอยู่
  // ข้อมูลวัตถุดิบ (กลุ่ม/ราคา/หน้ากว้าง) ดึงจากคลังเหมือนเลือก SKU ในตาราง (costSkuPatch) · จำนวนจากหมุด = กรอกตรง (พิมพ์เอง)
  const sendSpecToCost = async (items: SpecMaterialItem[]) => {
    if (!items.length) return;
    const comps = await Promise.all(items.map((it) => it.sku_code
      ? apiFetch(`/api/bom/components?search=${encodeURIComponent(it.sku_code)}&limit=10`).then((r) => r.json())
          .then((j) => ((j.data ?? []) as BomComponent[]).find((c) => c.id === it.sku_id || c.code === it.sku_code) ?? null).catch(() => null)
      : Promise.resolve(null)));
    const ts = Date.now();
    const rows = items.map((it, i) => {
      const base: CostRow = { ...newCostRow(), key: `sp${ts}_${i}`, sort_order: costLines.length + i + 1 };
      const c = comps[i];
      let r: CostRow = c ? { ...base, ...costSkuPatch(c, priceGroups, base) }
        : { ...base, item_sku_id: it.sku_id, item_sku_code: it.sku_code, item_name: it.sku_name || it.sku_code };
      if (it.qty != null) r = { ...r, calc_method: "manual", qty: it.qty, uom: it.uom ?? r.uom };
      r = { ...r, note: "จากรายละเอียดงาน" };
      return recomputeRow(r);
    });
    setCostLines((prev) => [...prev, ...rows]);
    setCostDirty(true); setEditing(true); setModalTab("cost");
    const noInfo = comps.filter((c) => !c).length;
    toast.success(t(`เพิ่ม ${rows.length} บรรทัดในตีราคาแล้ว${noInfo ? ` (${noInfo} รายการหาข้อมูลวัตถุดิบไม่เจอ ใส่ราคาเอง)` : ""} — ตรวจแล้วกด 💾 บันทึกตีราคา`,
      `Added ${rows.length} costing lines${noInfo ? ` (${noInfo} without material info — enter prices)` : ""} — review, then save costing`));
  };

  // ส่งยอดต้นทุนสินค้ารวม (วัสดุ + ค่าใช้จ่ายเพิ่ม) ไปเป็นรอบเสนอราคาใหม่
  const sendCostToQuote = async () => {
    if (!form?.id) return;
    const total = Math.round(grandTotal * 100) / 100;
    if (!(total > 0)) { toast.error(t("ยังไม่มียอดตีราคา — ใส่บรรทัดวัสดุ/ค่าใช้จ่ายก่อน", "No costing total yet — add material/expense lines first")); return; }
    if (costDirty && !(await saveCost())) return;
    try {
      // price = ราคาจากตีราคา (อ้างอิง), offered_price = ตั้งต้นเท่ายอดตีราคา (แก้ทีหลังได้)
      const res = await apiFetch(`/api/design-sheets/${form.id}/quotes`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote_date: todayStr(), price: total, offered_price: total, status: "pending", note: "จากตีราคา", parent_code: costParent }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      await loadCq(form.id);
      setModalTab("quotes");
      toast.success(t(`ส่งยอด ${fmtBaht(total)} บาท ไปเสนอราคา ครั้งที่ ${j.round} แล้ว`, `Sent ${fmtBaht(total)} THB to quote round ${j.round}`));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ส่งยอดไม่สำเร็จ", "Failed to send total")); }
  };


  useEffect(() => {
    if (form?.id) void loadCq(form.id);
    else { setComments([]); setQuotes([]); }
  }, [form?.id, loadCq]);

  const addComment = async () => {
    if (!form?.id || cmSaving) return;
    if (!newCmBody.trim()) { toast.error(t("กรุณาใส่รายการ comment", "Please enter a comment")); return; }
    setCmSaving(true);
    try {
      const res = await apiFetch(`/api/design-sheets/${form.id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_date: newCmDate || todayStr(), body: newCmBody.trim() }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setNewCmBody(""); setNewCmDate(todayStr());
      await loadCq(form.id);
      setOpenImgCid(j.id);   // กางช่องรูปของ comment ใหม่ให้เลย เผื่อแนบรูปต่อ
      toast.success(t("เพิ่ม comment แล้ว — แนบรูปประกอบได้เลย", "Comment added — you can attach images now"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("เพิ่ม comment ไม่สำเร็จ", "Failed to add comment")); }
    finally { setCmSaving(false); }
  };

  const startEditComment = (c: DesignSheetComment) => { setEditCid(c.id); setEditCmDate(c.comment_date); setEditCmBody(c.body); };
  const saveEditComment = async () => {
    if (!form?.id || !editCid) return;
    if (!editCmBody.trim()) { toast.error(t("กรุณาใส่รายการ comment", "Please enter a comment")); return; }
    try {
      const res = await apiFetch(`/api/design-sheets/${form.id}/comments/${editCid}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_date: editCmDate, body: editCmBody.trim() }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setEditCid(null); await loadCq(form.id); toast.success(t("แก้ comment แล้ว", "Comment updated"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("แก้ comment ไม่สำเร็จ", "Failed to update comment")); }
  };

  const doDeleteComment = async () => {
    if (!form?.id || !delComment) return;
    try {
      const res = await apiFetch(`/api/design-sheets/${form.id}/comments/${delComment.id}`, { method: "DELETE" });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setDelComment(null); await loadCq(form.id); toast.success(t("ลบ comment แล้ว (รูปประกอบถูกลบออกจาก R2 ด้วย)", "Comment deleted (its images were removed from R2 too)"));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ลบ comment ไม่สำเร็จ", "Failed to delete comment")); }
  };

  // มุมมอง: ตาราง / Canvas (จำค่าล่าสุดไว้ในเครื่อง)
  const [view, setView] = useState<"table" | "canvas">(() =>
    typeof window !== "undefined" && window.localStorage.getItem("design-sheets-view") === "canvas" ? "canvas" : "table");
  const switchView = (v: "table" | "canvas") => { setView(v); try { window.localStorage.setItem("design-sheets-view", v); } catch { /* ignore */ } };
  const [canvasItems, setCanvasItems] = useState<DesignSheetListItem[]>([]);
  const [canvasLoading, setCanvasLoading] = useState(false);
  const [canvasErr, setCanvasErr] = useState<string | null>(null);

  // สถานะจากระบบ Workflow กลาง (แก้เองได้ที่ /admin/workflows หรือปุ่ม "จัดการสถานะงาน") — โหลดไม่ได้ = ใช้ชุดสำรองในโค้ด
  const [wfMeta, setWfMeta] = useState<StatusMeta>(() => buildStatusMeta(null));
  const [statusMgr, setStatusMgr] = useState(false);   // ป๊อปอัปจัดการสถานะงาน
  const [skuWizard, setSkuWizard] = useState(false);   // Wizard สร้าง SKU
  const [planOpen, setPlanOpen] = useState(false);     // ป๊อปใส่แผนงาน (จากเมนู ส่งต่อ)
  // 💼 ราคากลางค่าใช้จ่ายเพิ่ม (ค่าแรงตัด / โสหุ้ย / ถุง / กล่อง / ลังส่ง / ต้นทุนอื่นๆ) — โหลดเฉพาะคนเห็นต้นทุน ตอนเปิดแท็บตีราคา
  const presetsApi = useCostPresets(canSeeCost && modalTab === "cost");
  presetsRef.current = presetsApi.loaded ? presetsApi.presets : null;
  const [presetsOpen, setPresetsOpen] = useState<PresetKind | null | false>(false);
  const canEditPresets = canEdit && canSeeCost;
  // ✂ ค่าแรงตัด/ปลอก/วาด ตามจำนวนชิ้นวัตถุดิบของแท็บนี้ (ราคา: แก้ในใบ → ตามวัสดุ → ราคากลาง)
  const centralCutRate = presetsOf(presetsApi.presets, "cut_rate")[0]?.amount ?? null;
  const cutRows = useMemo(() => cutLaborRows(curLines, centralCutRate, (id) => priceItemById.get(id)?.cut_rate ?? null), [curLines, centralCutRate, priceItemById]);
  const cutTotal = cutLaborSummary(cutRows).total;
  const cutExtraIdx = costExtra.findIndex((c) => extraKindOf(c) === "labor_cut" && c.cut_by === "pieces");
  const setLineCut = (keys: string[], patch: { cut_skip?: boolean | null; cut_rate?: number | null }) => {
    if (!fullEdit) setEditing(true);
    const ks = new Set(keys);
    setCostLines((prev) => prev.map((l) => (ks.has(l.key) ? { ...l, ...patch } : l)));
    setCostDirty(true);
  };
  // ราคาตัดที่ใส่ในใบ → บันทึกเป็นราคาของวัสดุ (ทะเบียนวัสดุตีราคา) แล้วบรรทัดในใบกลับไปใช้ราคาวัสดุ
  const saveMaterialCutRate = async (itemId: string, rate: number, keys: string[]) => {
    try {
      const res = await apiFetch(`/api/master-v2/design-price-items/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cut_rate: rate }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setPriceItems((list) => list.map((p) => (p.id === itemId ? { ...p, cut_rate: rate } : p)));
      setLineCut(keys, { cut_rate: null });
      toast.success(t(`บันทึกราคาตัด ${fmtBaht(rate)} ให้วัสดุนี้แล้ว — ใบงานอื่นใช้ราคานี้อัตโนมัติ`, `Saved cut rate ${fmtBaht(rate)} for this material`));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกราคาวัสดุไม่สำเร็จ", "Failed to save material rate")); }
  };
  // ป๊อปราคากลาง แท็บค่าตัด: ตั้งค่าตัดรายวัตถุดิบ/ทั้งกลุ่ม (null = กลับไปใช้ค่ากลาง) → อัปเดตรายการในใบทันที
  const setMaterialCutRate = async (itemId: string, rate: number | null): Promise<string | null> => {
    try {
      const res = await apiFetch(`/api/master-v2/design-price-items/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cut_rate: rate }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j?.error) return String(j?.error ?? t("บันทึกไม่สำเร็จ", "Save failed"));
      setPriceItems((list) => list.map((p) => (p.id === itemId ? { ...p, cut_rate: rate } : p)));
      if (canEdit && cutExtraIdx >= 0 && cutRows.some((r) => r.itemId === itemId)) setEditing(true);   // ใบนี้ใช้วัสดุนี้ → ยอดค่าตัดในใบคิดใหม่ (กดบันทึกตีราคา)
      return null;
    } catch (e) { return e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed"); }
  };
  const [bomWizard, setBomWizard] = useState(false);   // Wizard ดึงตีราคา → สร้างสูตร BOM
  const [fabricCalc, setFabricCalc] = useState(false); // 🧵 คำนวณจำนวนผ้า (จากขนาดชิ้น × จำนวนผลิต)
  const [bomPull, setBomPull] = useState(false);       // Wizard ดึงโครงจาก BOM → ตีราคา (คู่กลับ)
  const [toQuote, setToQuote] = useState(false);       // ส่งไปใบเสนอราคา (ระบบขาย)
  const [quoteBatch, setQuoteBatch] = useState<PresetQuoteLine[] | null>(null);   // ส่งเป็นชุดจากตารางตีราคาจากร้าน
  const [cartId, setCartId] = useState<string | null>(null);   // ตะกร้าใบเสนอราคาปัจจุบัน
  const [cartLabel, setCartLabel] = useState<string | null>(null);
  const [cartRefresh, setCartRefresh] = useState(0);
  useEffect(() => { try { setCartId(localStorage.getItem(QUOTE_CART_KEY)); } catch { /* ignore */ } }, []);
  const setCart = useCallback((qid: string) => { setCartId(qid); try { localStorage.setItem(QUOTE_CART_KEY, qid); } catch { /* ignore */ } }, []);
  const clearCart = useCallback(() => { setCartId(null); try { localStorage.removeItem(QUOTE_CART_KEY); } catch { /* ignore */ } }, []);
  const bumpCart = useCallback(() => setCartRefresh((n) => n + 1), []);
  const statusOf = (key: string) => wfMeta.map[key] ?? { label: key, cls: UNKNOWN_STATUS_CLS };

  const reloadStatuses = useCallback(() => {
    apiFetch("/api/design-sheets/statuses").then((r) => r.json())
      .then((j) => { if (!j.error) setWfMeta(buildStatusMeta(j.data as WfStatusRow[])); }).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    apiFetch("/api/brands").then((r) => r.json()).then((j) => { if (alive && Array.isArray(j.data)) setBrands(j.data as Brand[]); }).catch(() => {});
    apiFetch("/api/design-sheets/statuses").then((r) => r.json())
      .then((j) => { if (alive && !j.error) setWfMeta(buildStatusMeta(j.data as WfStatusRow[])); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // โหลดข้อมูลทั้งหมดสำหรับ Canvas (เฉพาะที่ใช้งานอยู่ เรียงตาม Deadline) — กรองแบรนด์ได้
  useEffect(() => {
    if (detailOnly || view !== "canvas") return;   // โหมด popup-เดี่ยว ไม่ต้องโหลด canvas
    let alive = true;
    setCanvasLoading(true); setCanvasErr(null);
    const params = new URLSearchParams({ limit: "500", sort_by: "sort_order", sort_dir: "asc" });
    if (brandFilter) params.set("brand_id", brandFilter);
    apiFetch(`/api/design-sheets?${params}`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      if (j.error) { setCanvasErr(String(j.error)); setCanvasItems([]); }
      else setCanvasItems((j.data ?? []) as DesignSheetListItem[]);
    }).catch((e) => { if (alive) setCanvasErr(e instanceof Error ? e.message : tr("โหลดไม่สำเร็จ", "Failed to load")); })
      .finally(() => { if (alive) setCanvasLoading(false); });
    return () => { alive = false; };
  }, [view, brandFilter, refreshKey]);

  // โซน Canvas = สถานะจากระบบ Workflow กลาง (แก้ที่ /admin/workflows แล้วโซนเปลี่ยนตาม)
  // + โซน "สถานะเก่า" โผล่เฉพาะเมื่อมีใบที่ใช้สถานะที่ถูกลบไปแล้ว
  const knownStatus = useMemo(() => new Set(wfMeta.opts.map(([k]) => k)), [wfMeta]);
  const zones = useMemo<CanvasZone[]>(() => {
    const zs: CanvasZone[] = wfMeta.opts.map(([k, l]) => ({
      id: k, title: l, color: wfMeta.colorHex[k] ?? "#cbd5e1",
      hint: canEdit ? t("ลากการ์ดมาวาง = เปลี่ยนสถานะ", "Drop a card here = change status") : undefined,
    }));
    if (canvasItems.some((it) => !knownStatus.has(it.status))) {
      zs.push({ id: OLD_STATUS_ZONE, title: t("สถานะเก่า (ถูกลบจากรายการแล้ว — ลากออกได้)", "Old status (removed from list — drag out)"), color: "#cbd5e1" });
    }
    return zs;
  }, [wfMeta, knownStatus, canEdit, canvasItems, t]);

  // ลากการ์ดข้ามโซน = เปลี่ยนสถานะ (optimistic + บันทึกผ่าน API กลาง + audit)
  const moveStatus = async (item: DesignSheetListItem, toZoneId: string) => {
    if (toZoneId === OLD_STATUS_ZONE) return;   // โซนสถานะเก่าเป็นแค่ที่พัก ลากเข้าไม่ได้
    const prev = canvasItems;
    setCanvasItems((list) => list.map((it) => (it.id === item.id ? { ...it, status: toZoneId } : it)));
    try {
      const res = await apiFetch(`/api/design-sheets/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: toZoneId }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`${item.code} → ${statusOf(toZoneId).label}`);
    } catch (e) {
      setCanvasItems(prev);   // เปลี่ยนไม่สำเร็จ → ดึงการ์ดกลับที่เดิม
      toast.error(e instanceof Error ? e.message : t("เปลี่ยนสถานะไม่สำเร็จ", "Failed to change status"));
    }
  };

  // ลากสลับ/เรียงลำดับการ์ด → จำลำดับถาวร (sort_order)
  const reorderCards = async (orderedIds: string[]) => {
    const byId = new Map(canvasItems.map((it) => [it.id, it]));
    const next = orderedIds.map((id) => byId.get(id)).filter(Boolean) as DesignSheetListItem[];
    for (const it of canvasItems) if (!orderedIds.includes(it.id)) next.push(it);
    setCanvasItems(next);
    try {
      const res = await apiFetch("/api/design-sheets/reorder", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: next.map((x) => x.id) }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("บันทึกลำดับไม่สำเร็จ", "Failed to save order")); }
  };

  const serverFetch = useCallback(async (p: ServerFetchParams) => {
    const params = new URLSearchParams({ limit: String(p.pageSize), offset: String((p.page - 1) * p.pageSize) });
    if (p.search) params.set("search", p.search);
    if (p.sortBy) { params.set("sort_by", p.sortBy); params.set("sort_dir", p.sortDir ?? "asc"); }
    if (statusFilter) params.set("status", statusFilter);
    if (brandFilter) params.set("brand_id", brandFilter);
    if (showArchived) params.set("archived", "1");
    const res = await apiFetch(`/api/design-sheets?${params}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return { rows: json.data as DesignSheetListItem[], total: json.total as number };
  }, [statusFilter, brandFilter, showArchived]);

  const patch = (p: Partial<FormState>) => setForm((f) => (f ? { ...f, ...p } : f));
  // แก้ได้เต็มที่เมื่อ: มีสิทธิ์ + (กดแก้ไขอยู่ หรือเป็นงานสร้างใหม่) · ช่อง quick (สถานะ/Deadline/Note/รายละเอียด/ลิงก์) แก้ได้เสมอเมื่อมีสิทธิ์
  const fullEdit = canEdit && (editing || !form?.id);
  // โหมดแก้: แก้บรรทัดวัตถุดิบ/ราคาแล้ว ยอดค่าตัดตามไปเอง (ราคาวัสดุโหลดไม่เสร็จ = รอ)
  useEffect(() => {
    if (!fullEdit || cutExtraIdx < 0 || !presetsApi.loaded || priceItems.length === 0) return;
    const cur = costExtra[cutExtraIdx];
    if (Math.abs((cur.amount || 0) - cutTotal) > 0.005) updExtra(cutExtraIdx, { amount: cutTotal });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullEdit, cutExtraIdx, cutTotal, presetsApi.loaded, priceItems.length]);
  // ทำรายการจากแถบสรุป (เปลี่ยนราคา / กลับของเดิม / รับทราบ) — เจ้าของขอให้กดได้โดยไม่ต้องเข้าโหมดแก้ไข
  // โหมดแก้ไข: แก้ค้างไว้ให้กด 💾 เอง · โหมดดู: บันทึกลง DB ให้ทันที
  const quickApply = useCallback((mutate: (rows: CostRow[]) => CostRow[]) => {
    const next = mutate(costLines);
    setCostLines(next);
    if (fullEdit) setCostDirty(true); else void saveCost(next);
  }, [costLines, fullEdit, saveCost]);

  // อัปโหลดรูปในรายละเอียดงาน (Tiptap) → R2 ผ่านระบบแนบไฟล์กลาง (entity=design_sheet_detail)
  const uploadDetailImage = async (file: File): Promise<string> => {
    if (!form?.id) throw new Error(t("ต้องบันทึกใบงานก่อน", "Save the design sheet first"));
    const fd = new FormData();
    fd.append("file", file); fd.append("entity_type", "design_sheet_detail"); fd.append("entity_id", form.id);
    const an = user?.name ?? user?.email; if (an) fd.append("actor", an);
    const res = await apiFetch("/api/attachments", { method: "POST", body: fd });
    const j = await res.json(); if (j.error) throw new Error(j.error);
    const url = j.public_url ?? j.data?.public_url;
    if (!url) throw new Error(t("อัปโหลดรูปไม่สำเร็จ", "Image upload failed"));
    return url as string;
  };
  // ลบรูปในรายละเอียดที่ถูกเอาออกจากเนื้อหา → ลบจาก R2 (ย้าย trash) กันไฟล์ขยะ
  const reconcileDetailImages = async (sheetId: string, html: string) => {
    try {
      const res = await apiFetch(`/api/attachments?entity_type=design_sheet_detail&entity_id=${encodeURIComponent(sheetId)}`);
      const j = await res.json();
      const atts = (j.data ?? []) as Attachment[];
      const actor = encodeURIComponent(user?.name ?? user?.email ?? "");
      for (const a of atts) {
        if (a.public_url && !html.includes(a.public_url)) {
          await apiFetch(`/api/attachments/${a.id}?actor=${actor}`, { method: "DELETE" });
        }
      }
    } catch { /* ไม่ critical */ }
  };

  // โหลด "SKU ที่เชื่อม" ใหม่ (หลังสร้าง SKU จาก wizard) — อ่านจาก GET ใบงานตัวเดิม
  const reloadLinkedSkus = useCallback(async (sheetId: string) => {
    try {
      const j = await apiFetch(`/api/design-sheets/${sheetId}`).then((r) => r.json());
      if (!j.error) setLinkedSkus((j.data?.linked_skus ?? []) as DesignSheetLinkedSku[]);
    } catch { /* ไม่ critical */ }
  }, []);

  const openCreate = () => { setEditing(true); setCreateMore(false); setRecentBrandIds(loadRecent<{ id: string }>(RECENT_KEYS.designBrands).map((b) => b.id)); setParentRefs({}); setLinkedSkus([]); setForm(empty()); setFormErr(null); setModalTab("info"); setNewCmDate(todayStr()); setEditCid(null); setOpenImgCid(null); clearPend(); setCostParent(""); setCostExtraMap({ "": defaultCostExtra() }); };

  const openEdit = async (row: DesignSheetListItem, tab: "info" | "spec" | "comments" | "cost" | "quotes" | "notice" = "info") => {
    setLoadingForm(true); setFormErr(null); setForm(empty()); setEditing(false); setParentRefs({}); setLinkedSkus([]);
    setSpecMounted(tab === "spec"); setSpecDirty(false);
    setNoticeMounted(tab === "notice"); setNoticeDirty(false); setNoticeCount(null);
    setModalTab(tab); setNewCmDate(todayStr()); setEditCid(null); setOpenImgCid(null); clearPend();
    try {
      // ⚡ ชี้การ์ดใน Design Dashboard แล้ว = เริ่มโหลดไว้ก่อน (prefetch.ts) → ใช้ผลนั้นเลย · ไม่มี/ล้มเหลว = ดึงใหม่
      let j = await (takePrefetchedSheet(row.id) ?? apiFetch(`/api/design-sheets/${row.id}`).then((r) => r.json()));
      if (j?.error === "prefetch") j = await apiFetch(`/api/design-sheets/${row.id}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const d = j.data;
      // แสดงรหัส Parent SKU: ถ้า chips ว่างแต่มี parent_sku_code (ใบเก่า) → ใช้ตัวนั้น · เก็บ map code→id ทำลิงก์
      const pArr = Array.isArray(d.parent_sku_codes) ? (d.parent_sku_codes as string[]) : [];
      const pCodes = pArr.length ? pArr : (d.parent_sku_code ? [String(d.parent_sku_code)] : []);
      const refs: Record<string, string> = {};
      for (const r of (Array.isArray(d.parent_sku_refs) ? d.parent_sku_refs : []) as { code: string; id: string }[]) refs[r.code] = r.id;
      setParentRefs(refs);
      setLinkedSkus((Array.isArray(d.linked_skus) ? d.linked_skus : []) as DesignSheetLinkedSku[]);
      setForm({
        id: d.id, code: d.code ?? "", name: d.name ?? "", brand_id: d.brand_id ?? "",
        detail: d.detail ?? "", note: d.note ?? "", status: d.status ?? "design",
        order_date: d.order_date ?? "", deadline: d.deadline ?? "", appointment_date: d.appointment_date ?? "", drive_link: d.drive_link ?? "",
        parent_sku_codes: pCodes,
        parent_sku_drafts: Array.isArray(d.parent_sku_drafts) ? (d.parent_sku_drafts as string[]) : [],
        cost_general_label: d.cost_general_label ?? "",
      });
      setSkuInput("");
      // ค่าใช้จ่ายเพิ่ม: รองรับทั้ง array (เดิม → Parent ทั่วไป) และ object {parentKey: [...]} (ใหม่ แยก Parent)
      const normArr = (a: unknown): CostExtra[] => (Array.isArray(a) ? a : []).map(cleanExtra);
      const rawCe = d.cost_extra;
      let ceMap: Record<string, CostExtra[]>;
      if (rawCe && !Array.isArray(rawCe) && typeof rawCe === "object") {
        ceMap = {};
        for (const [k, v] of Object.entries(rawCe as Record<string, unknown>)) ceMap[k] = normArr(v);
      } else {
        const arr = normArr(rawCe);
        ceMap = { "": arr.length ? arr : defaultCostExtra() };
      }
      if (!(ceMap[""]?.length)) ceMap[""] = defaultCostExtra();   // แท็บทั่วไปโชว์ค่าแรงตั้งต้นเสมอถ้ายังว่าง
      setCostParent(""); setCostExtraMap(ceMap);
      setOrderQtyDraft(cleanOrderQty(d.order_qty));   // จำนวนที่สั่งที่บันทึกไว้ต่อแท็บ
      setPackRefs(d.pack_refs && typeof d.pack_refs === "object" ? (d.pack_refs as Record<string, PackRef>) : {});
    } catch (e) { setFormErr(e instanceof Error ? e.message : t("โหลดไม่ได้", "Could not load")); }
    finally { setLoadingForm(false); }
  };

  // คัดลอกลิงก์มาที่ใบงานนี้ (เปิดลิงก์แล้วเด้ง modal ใบนี้อัตโนมัติ ผ่าน ?open=<id> — มาตรฐานเดียวกับ Design Dashboard)
  const copySheetLink = async () => {
    if (!form?.id || typeof window === "undefined") return;
    const url = `${window.location.origin}${window.location.pathname}?open=${form.id}`;
    try { await navigator.clipboard.writeText(url); toast.success(t("คัดลอกลิงก์ใบงานนี้แล้ว — วางส่งให้คนอื่นเปิดได้เลย", "Design sheet link copied — paste it to share")); }
    catch { toast.error(t("คัดลอกลิงก์ไม่สำเร็จ", "Failed to copy link")); }
  };
  // เปิดหน้าด้วยลิงก์ ?open=<id> (หรือ ?sheet=<id> เดิม) → เปิด modal ใบงานนั้นอัตโนมัติ (ครั้งเดียวตอนเข้าหน้า)
  // ?open= = พารามิเตอร์มาตรฐาน (การ์ดบน Design Dashboard ใช้ตัวนี้) · ?sheet= คงไว้ให้ลิงก์เก่ายังเปิดได้
  const autoOpenRef = useRef(false);
  useEffect(() => {
    if (detailOnly || autoOpenRef.current || typeof window === "undefined") return;   // detailOnly = เปิดตาม prop แทน URL
    autoOpenRef.current = true;
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("open") || sp.get("sheet");
    if (id) void openEdit({ id } as DesignSheetListItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // โหมด popup-เดี่ยว: เปิด/เปลี่ยนใบตาม openId prop (หน้าแม่คุม)
  const openIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!detailOnly || !openId || openIdRef.current === openId) return;
    openIdRef.current = openId;
    void openEdit({ id: openId } as DesignSheetListItem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailOnly, openId]);
  // โหมด popup-เดี่ยว + สร้างงานใหม่: เปิดฟอร์มสร้าง (ครั้งเดียว) + ตั้งแบรนด์เริ่มต้นถ้าส่งมา
  const createdRef = useRef(false);
  useEffect(() => {
    if (!detailOnly || !createMode || createdRef.current) return;
    createdRef.current = true;
    openCreate();
    if (defaultBrandId) patch({ brand_id: defaultBrandId });
    if (prefill) {
      patch({
        ...(prefill.name ? { name: prefill.name } : {}),
        ...(prefill.brand_id ? { brand_id: prefill.brand_id } : {}),
        ...(prefill.deadline ? { deadline: prefill.deadline } : {}),
        ...(prefill.detail ? { detail: prefill.detail } : {}),
        ...(prefill.note ? { note: prefill.note } : {}),
      });
      if (prefill.note) setCreateMore(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailOnly, createMode]);

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) { setFormErr(t("กรุณาใส่ชื่องาน", "Please enter a job name")); return; }
    // รหัสที่ค้างพิมพ์ในช่องเพิ่ม (ยังไม่กด Enter) → ถ้าซ้ำห้ามบันทึก, ถ้าใช้ได้ให้รวมเข้าไปด้วย
    const pending = skuInput.trim().toUpperCase();
    if (pending && skuCheck?.exists) { setFormErr(t(`รหัส Parent SKU "${pending}" มีอยู่ในระบบแล้ว — ห้ามตั้งซ้ำ`, `Parent SKU code "${pending}" already exists — duplicates not allowed`)); return; }
    const parentCodes = [...form.parent_sku_codes];
    if (pending && !parentCodes.includes(pending)) parentCodes.push(pending);
    setSaving(true); setFormErr(null);
    const payload = {
      name: form.name.trim(), brand_id: form.brand_id || null, detail: form.detail || null, note: form.note || null,
      status: form.status, order_date: form.order_date || null, deadline: form.deadline || null, appointment_date: form.appointment_date || null, drive_link: form.drive_link || null,
      parent_sku_codes: parentCodes,
      parent_sku_drafts: form.parent_sku_drafts,
      ...(!form.id && prefill?.lineInboxId ? { line_inbox_id: prefill.lineInboxId } : {}),   // เปิดจากกล่องงานจากไลน์
    };
    try {
      const res = form.id
        ? await apiFetch(`/api/design-sheets/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await apiFetch("/api/design-sheets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      if (form.id) {
        await reconcileDetailImages(form.id, form.detail);   // ลบรูปในรายละเอียดที่ถูกเอาออก (→ R2 trash)
        // บันทึกแล้ว = ค้างป๊อปไว้ + กลับเป็นโหมดดูอย่างเดียว (เหมือนแท็บตีราคา · เจ้าของขอ 2026-11-07 "ล็อกด้วย")
        //   เดิมปิดป๊อปทันที · ตอนนี้กดปิดเอง (Dashboard รีเฟรชบอร์ดตอนปิดป๊อปอยู่แล้ว) · ตีราคา/สั่งจากร้านแก้ค้าง = คงโหมดแก้
        toast.success(t("บันทึกแล้ว — ดับเบิลคลิกช่องเพื่อแก้ต่อ", "Saved — double-click a field to edit again"));
        patch({ parent_sku_codes: parentCodes });
        if (pending) { setSkuInput(""); setSkuCheck(null); }
        if (!costDirty && !supplierDirty) setEditing(false);
      } else {
        // อัปโหลดรูปที่พักไว้ (ลาก/วาง/Ctrl+V ตอนยังไม่บันทึก) เข้าใบงานที่เพิ่งสร้าง
        if (pendImgs.length > 0) {
          let ok = 0, fail = 0;
          for (const p of pendImgs) {
            try {
              const fd = new FormData();
              fd.append("file", p.file); fd.append("entity_type", "design_sheet"); fd.append("entity_id", j.id);
              const an = user?.name ?? user?.email; if (an) fd.append("actor", an);
              const ur = await apiFetch("/api/attachments", { method: "POST", body: fd });
              const uj = await ur.json(); if (uj.error) throw new Error(uj.error);
              ok++;
            } catch { fail++; }
          }
          clearPend();
          if (fail > 0) toast.error(t(`อัปโหลดรูปไม่สำเร็จ ${fail} ไฟล์ (สำเร็จ ${ok})`, `${fail} image(s) failed to upload (${ok} done)`));
        }
        // สร้างเสร็จ → ค้างป๊อปอัพไว้ (กลายเป็นโหมดแก้) ให้แนบรูป/comment ต่อได้เลย
        toast.success(j.line_images
          ? t(`สร้างใบงานแล้ว: ${j.code} · แนบรูปจากไลน์ ${j.line_images} รูป`, `Design sheet created: ${j.code} · ${j.line_images} LINE image(s) attached`)
          : t(`สร้างใบงานแล้ว: ${j.code}`, `Design sheet created: ${j.code}`));
        if (form.brand_id) pushRecent(RECENT_KEYS.designBrands, { id: form.brand_id });   // ปุ่มแบรนด์ล่าสุดครั้งหน้า
        patch({ id: j.id, code: j.code });
        onCreated?.({ id: String(j.id), code: String(j.code ?? "") });   // เช่น กระดานแคมเปญ → วางการ์ดใบงานที่เพิ่งสร้าง
      }
      refresh();
    } catch (e) { setFormErr(e instanceof Error ? e.message : t("บันทึกไม่สำเร็จ", "Save failed")); }
    finally { setSaving(false); }
  };

  const doArchive = async () => {
    if (!archiveTarget) return; setArchiving(true);
    try {
      const res = await apiFetch(`/api/design-sheets/${archiveTarget.id}`, { method: "DELETE" });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(t("เก็บเข้ากรุแล้ว — ดูได้จากติ๊ก “แสดงที่เก็บเข้ากรุ”", "Archived — tick “Show archived” to see it")); setArchiveTarget(null); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("เก็บเข้ากรุไม่สำเร็จ", "Failed to archive")); }
    finally { setArchiving(false); }
  };

  const doHardDelete = async () => {
    if (!hardDelTarget) return; setHardDeleting(true);
    try {
      const res = await apiFetch(`/api/design-sheets/${hardDelTarget.id}?hard=1`, { method: "DELETE" });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(t("ลบใบงานถาวรแล้ว (รูปย้ายเข้าถังขยะ R2 สำรอง 30 วัน)", "Design sheet permanently deleted (images moved to R2 trash, kept 30 days)"));
      setHardDelTarget(null); setForm(null); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("ลบไม่สำเร็จ", "Delete failed")); }
    finally { setHardDeleting(false); }
  };

  const doRestore = async (row: DesignSheetListItem) => {
    try {
      const res = await apiFetch(`/api/design-sheets/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: true }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(t(`กู้คืน ${row.code} แล้ว`, `Restored ${row.code}`)); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("กู้คืนไม่สำเร็จ", "Restore failed")); }
  };

  const columns = useMemo<ColumnDef<DesignSheetListItem>[]>(() => [
    { id: "cover", header: t("รูป", "Image"), size: 56, enableSorting: false,
      cell: ({ row }) => <ImageThumbnail url={row.original.cover_url} size={40} alt={row.original.name} /> },
    { id: "code", accessorKey: "code", header: t("เลขที่", "No."), size: 120,
      cell: ({ getValue }) => <code className="text-xs text-slate-500">{getValue() as string}</code> },
    { id: "name", accessorKey: "name", header: t("ชื่องาน", "Job name"), size: 240,
      cell: ({ getValue }) => <span className="font-medium text-slate-700">{getValue() as string}</span> },
    { id: "brand", header: t("แบรนด์", "Brand"), size: 140, enableSorting: false,
      cell: ({ row }) => row.original.brand_name ? (
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
          <span className="w-2.5 h-2.5 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: row.original.brand_color ?? "#e2e8f0" }} />
          {row.original.brand_name}
        </span>
      ) : <span className="text-slate-300">—</span> },
    { id: "status", accessorKey: "status", header: t("สถานะ", "Status"), size: 130,
      cell: ({ getValue }) => { const s = statusOf(String(getValue() ?? "design")); return <span className={`text-xs px-2 py-0.5 rounded ${s.cls}`}>{s.label}</span>; } },
    { id: "order_date", accessorKey: "order_date", header: t("วันที่สั่ง", "Order date"), size: 105,
      cell: ({ getValue }) => <span className="text-sm text-slate-600">{formatDate(getValue())}</span> },
    { id: "deadline", accessorKey: "deadline", header: "Deadline", size: 105,
      cell: ({ row }) => {
        const d = row.original.deadline;
        if (!d) return <span className="text-slate-300">—</span>;
        const overdue = !wfMeta.finished.has(row.original.status) && d < new Date().toISOString().slice(0, 10);
        return <span className={`text-sm ${overdue ? "text-rose-600 font-semibold" : "text-slate-600"}`}>{formatDate(d)}{overdue ? " ⚠" : ""}</span>;
      } },
    { id: "drive", header: t("ไฟล์งาน", "Work files"), size: 80, enableSorting: false,
      cell: ({ row }) => row.original.drive_link
        ? <a href={row.original.drive_link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-blue-600 hover:underline">{t("📁 เปิด", "📁 Open")}</a>
        : <span className="text-slate-300">—</span> },
    { id: "note", accessorKey: "note", header: "Note", size: 180, enableSorting: false,
      cell: ({ getValue }) => <span className="block max-w-[180px] truncate text-sm text-slate-500">{(getValue() as string) || ""}</span> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [wfMeta, t]);

  // ข้อ 2: สร้างวัสดุตีราคาใหม่จาก dropdown (ค้นไม่เจอ) → POST + reload price-items + เลือกให้ทันที
  const createPriceItemInline = useCallback(async (name: string, onPicked: (it: PriceItem) => void) => {
    const nm = name.trim(); if (!nm) return;
    try {
      const res = await apiFetch("/api/master-v2/design-price-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nm }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      const newId = (j.data?.id as string | undefined) ?? undefined;
      const pr = await apiFetch("/api/design-sheets/price-items").then((r) => r.json());
      const items = (pr.data ?? []) as PriceItem[];
      setPriceItems(items); setPriceGroups((pr.groups ?? []) as PriceGroup[]);
      const it = items.find((p) => p.id === newId) ?? items.find((p) => p.name === nm);
      if (it) onPicked(it);
      toast.success(t(`เพิ่มวัสดุ "${nm}" แล้ว — กด "ใส่รายละเอียด" ใต้ชื่อวัสดุ เพื่อใส่ชนิด/ราคา`, `Added material "${nm}" — press "Add details" under its name to set type/price`));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("เพิ่มวัสดุไม่สำเร็จ", "Failed to add material")); }
  }, [toast, t]);

  // คอลัมน์ตารางตีราคา (ใช้ LineItemsGrid กลาง) — เลือกวัสดุ → เติมชนิด/สูตร/เผื่อเสีย/ราคาอัตโนมัติ แล้วคำนวณสด
  const numInputCls = "w-full h-8 px-1.5 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50";
  // โหมดดูอย่างเดียว: ล็อกช่องแก้ให้ตรงกับตาราง (เดิมพิมพ์ได้แต่บันทึกไม่ได้) + บอกเหตุผลเมื่อชี้เมาส์
  const roTip = !fullEdit ? t("อยู่ในโหมดดูอย่างเดียว — ดับเบิลคลิกที่แถวเพื่อแก้ไข (การจัดกลุ่ม/เรียงลำดับใช้ได้ตลอด)", "View-only mode — double-click a row to edit (grouping/sorting always works)") : undefined;
  const cellEdit = fullEdit;
  // ช่องตัวเลข: โหมดแก้ = ช่องกรอก · โหมดดู (บันทึกแล้ว) = ตัวเลขเรียบ แถวเตี้ยลง (เจ้าของขอ 2026-11-07 "บันทึกแล้วเป็น readonly + แคบลง")
  const numCell = (v: number | null | undefined, set: (v: number | null) => void, placeholder?: string) => (!cellEdit
    ? <span className="block truncate px-1 text-right text-sm tabular-nums text-slate-700" title={roTip}>{v ?? "—"}</span>
    : <input type="number" min={0} step="any" value={v ?? ""} placeholder={placeholder}
        onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value))} className={numInputCls} />);
  const textCell = (v: string | null | undefined, set: (v: string | null) => void, placeholder?: string) => (!cellEdit
    ? <span className="block truncate px-1 text-sm text-slate-600" title={v || roTip}>{v || "—"}</span>
    : <input value={v ?? ""} onChange={(e) => set(e.target.value || null)} placeholder={placeholder}
        className="w-full h-8 px-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />);
  // ความกว้างคอลัมน์: โหมดแก้ = กว้างพอให้ช่องกรอก · โหมดดู = แคบลงจนพอดีป๊อป ไม่ต้องเลื่อนซ้าย-ขวา
  const cw = (editW: number, viewW: number) => (fullEdit ? editW : viewW);
  const costCols = useMemo<LineColumn<CostRow>[]>(() => [
    { key: "item", header: t("วัสดุ / กลุ่ม", "Material / group"), minWidth: cw(220, 150), sortable: true, getValue: (r) => r.item_name,
      render: (r, u) => {
        const inGroupMode = !r.item_id && !!r.group_code;   // รายการเดิมที่เคยเลือกแบบกลุ่ม
        const g = inGroupMode ? priceGroups.find((x) => x.code === r.group_code) : undefined;
        const item = r.item_id ? priceItems.find((x) => x.id === r.item_id) : undefined;
        // เลือกวัสดุ: เก็บ group_code ไว้เป็นป้าย/ตรวจชนิดชิ้น · ราคาเริ่มต้น = กรอกเอง (manual)
        const applyItem = (it: PriceItem) => u(withPrevItem(r, costItemPatch(it, r)));
        if (!fullEdit) {
          // โหมดดู: ชื่อวัสดุบรรทัดเดียว (ไม่มีช่องเลือก/ปุ่มเสริม) — ดับเบิลคลิกแถวเพื่อแก้
          const name = r.item_sku_id ? [r.item_sku_code, r.item_name].filter(Boolean).join(" ") : (r.item_name || (inGroupMode ? `${t("กลุ่ม", "Group")}: ${r.group_name ?? r.group_code}` : ""));
          return <span className="block truncate text-sm text-slate-800" title={name || roTip}>{name || <span className="text-slate-300">{t("— ยังไม่เลือกวัสดุ —", "— No material yet —")}</span>}</span>;
        }
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <div className="flex-1 min-w-0">
                {/* แหล่งวัสดุ 2 ทาง: master "วัสดุตีราคา" (เดิม) หรือ "SKU คลังสินค้า" (ดึงประเภท/ราคา/หน่วย/หน้ากว้างมาให้) */}
                {r.item_sku_id ? (
                  <ComponentPicker sku={r.item_sku_code ?? ""} name={r.item_name ?? ""}
                    placeholder={t("— เลือก SKU วัตถุดิบ —", "— Select material SKU —")}
                    onPick={(c) => u(withPrevItem(r, costSkuPatch(c, priceGroups, r)))} />
                ) : (
                <SearchableSelect value={r.item_id ?? (inGroupMode ? `grp:${r.group_code}` : "")} disabled={!fullEdit} placeholder={t("— เลือกกลุ่ม / วัสดุ —", "— Select group / material —")}
                  initialQuery={!r.item_id ? bomRefSearchSeed(r.note) : undefined}
                  options={priceItems.map((p) => ({ value: p.id, label: p.name, sub: p.group_name ?? undefined }))}
                  onChange={(val) => {
                    const it = priceItems.find((p) => p.id === val);
                    if (!it) { u({ item_id: null, group_code: null, price_basis: null }); return; }
                    applyItem(it);
                  }}
                  onCreate={fullEdit ? (q) => void createPriceItemInline(q, applyItem) : undefined}
                  createLabel={t("เพิ่มวัสดุใหม่", "Add new material")} />
                )}
              </div>
              {/* สลับแหล่ง: 🏷️ = เลือกจาก SKU คลังสินค้า · 🧮 = กลับไปใช้ master วัสดุตีราคา */}
              {fullEdit && (
                <button type="button"
                  onClick={() => u(r.item_sku_id
                    ? { item_sku_id: null, item_sku_code: null }
                    : { item_sku_id: "", item_sku_code: "", item_id: null, price_basis: null })}
                  title={r.item_sku_id
                    ? t("กลับไปเลือกจาก “วัสดุตีราคา” (master)", "Back to picking from “Costing materials” (master)")
                    : t("เลือกวัตถุดิบจากคลังสินค้า (SKU) — ดึงประเภท ราคาซื้อ หน่วย หน้ากว้าง มาให้", "Pick material from inventory (SKU) — fills type, purchase price, unit, roll width")}
                  className={`h-7 shrink-0 rounded border px-1.5 text-xs ${r.item_sku_id ? "border-blue-300 bg-blue-50 text-blue-700" : "border-transparent text-slate-400 hover:border-blue-300 hover:text-blue-600"}`}>
                  🏷️
                </button>
              )}
              {/* ฐานราคาของวัสดุ (ปุ่ม compact มีสัญลักษณ์) จาก SKU ที่ผูก — ไม่โชว์กับชนิดชิ้น */}
              {item && !rowIsPiece(r) && fullEdit && (
                <BasisPicker value={r.price_basis ?? "manual"}
                  onChange={(v) => u({ price_basis: v, unit_price: itemBasisPrice(item, v) })}
                  options={[
                    { value: "manual", symbol: "✍️", label: t("กรอกเอง", "Manual"), price: item.price_per_unit },
                    { value: "latest", symbol: "🕐", label: t("ซื้อจริงล่าสุด", "Latest purchase"), price: item.sku_latest_price, note: item.sku_count > 0 ? t("ยังไม่มีราคาซื้อ", "No purchase price yet") : t("ยังไม่ผูก SKU", "No SKU linked") },
                    { value: "avg", symbol: "≈", label: t("เฉลี่ยจาก SKU", "Average from SKU"), price: item.sku_avg_price, note: t("ยังไม่มี", "None yet") },
                    { value: "max", symbol: "🔺", label: t("แพงสุดจาก SKU", "Highest from SKU"), price: item.sku_max_price, note: item.sku_count > 0 ? t("ยังไม่มีราคาซื้อ", "No purchase price yet") : t("ยังไม่ผูก SKU", "No SKU linked") },
                    { value: "min", symbol: "🔻", label: t("ถูกสุดจาก SKU", "Lowest from SKU"), price: item.sku_min_price, note: item.sku_count > 0 ? t("ยังไม่มีราคาซื้อ", "No purchase price yet") : t("ยังไม่ผูก SKU", "No SKU linked") },
                    { value: "used", symbol: "♻️", label: t("ที่ใช้ตีล่าสุด", "Last used in costing"), price: item.last_used_price, note: t("ยังไม่เคยใช้", "Never used") },
                  ]} />
              )}
              {inGroupMode && fullEdit && (
                <BasisPicker value={r.price_basis ?? "avg"}
                  onChange={(v) => u({ price_basis: v, unit_price: g ? groupBasisPrice(g, v) : r.unit_price })}
                  options={[
                    { value: "avg", symbol: "≈", label: t("เฉลี่ย", "Average"), price: g?.avg_price ?? null },
                    { value: "set", symbol: "📌", label: t("ตั้งไว้", "Set price"), price: g?.set_price ?? null, note: t("ยังไม่ตั้ง", "Not set") },
                    { value: "latest", symbol: "🕐", label: t("ซื้อจริงล่าสุด", "Latest purchase"), price: g?.latest_price ?? null },
                  ]} />
              )}
            </div>
            {/* ใส่รายละเอียดวัสดุ — ยังไม่มีชนิด/ราคา = ปุ่มเด่นสีส้ม · ครบแล้ว = ไอคอนดินสอโผล่ตอนชี้แถว */}
            {r.item_id && fullEdit && (rowNeedsItemDetails(r) ? (
              <button type="button" onClick={() => void openPmForRef.current(r.item_id as string, r.item_name ?? "")}
                title={t("ใส่ชนิด ราคา หน่วย หน้ากว้าง ของวัสดุนี้ — บันทึกแล้วแถวนี้คำนวณให้เอง", "Set this material's type, price, unit, roll width — the line recalculates after saving")}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:text-amber-800 hover:underline">
                <Icon name="edit" /> {t("ใส่รายละเอียด (ยังไม่มีชนิด/ราคา)", "Add details (no type/price yet)")}
              </button>
            ) : (
              <button type="button" onClick={() => void openPmForRef.current(r.item_id as string, r.item_name ?? "")}
                title={t("แก้รายละเอียดวัสดุนี้ (ชนิด ราคา หน่วย หน้ากว้าง)", "Edit this material's details (type, price, unit, roll width)")}
                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-blue-600 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 focus-visible:opacity-100">
                <Icon name="edit" /> {t("รายละเอียดวัสดุ", "Material details")}
              </button>
            ))}
            {item && !rowIsPiece(r) && r.price_basis === "latest" && item.sku_latest_currency && item.sku_latest_currency !== "THB" && (
              <div className="text-[10px] text-amber-600">{t(`⚠ ราคาเป็น ${item.sku_latest_currency} — ปรับเป็นบาทเองที่ช่อง “ราคา/หน่วย”`, `⚠ Price is in ${item.sku_latest_currency} — convert to THB yourself in “Price/unit”`)}</div>
            )}
          </div>
        );
      } },
    { key: "group", header: t("ชนิด / สูตร", "Type / formula"), width: cw(116, 88), sortable: true, getValue: (r) => r.group_name,
      groupLabel: (r) => r.group_name || t("ไม่ระบุชนิด", "Unspecified type"),
      render: (r) => (!fullEdit
        ? <span className="block truncate px-1 text-xs text-slate-500" title={methodLabel(r.calc_method ?? "manual") ?? r.calc_method ?? undefined}>{r.group_name ?? "—"}</span>
        : <span className="block px-1 text-xs text-slate-500 leading-tight">{r.group_name ?? "—"}<br />
          <span className="text-[10px] text-slate-300">{methodLabel(r.calc_method ?? "manual") ?? r.calc_method}</span></span>
      ) },
    { key: "width_cm", header: t("กว้าง (ซม.)", "Width (cm)"), width: cw(112, 70), align: "right", sortable: true, getValue: (r) => r.width_cm,
      render: (r, u) => {
        // ชิ้นที่วาดไว้ / ชนิดชิ้น = โชว์ช่องกว้างแยกเสมอ (เดิมรวม "กว้าง×ยาว" ไว้ช่องเดียว — เจ้าของขอให้แยก 2026-11-09)
        const showNum = usesWidth(r.calc_method) || rowIsPiece(r) || !!r.shape;
        const canDraw = fullEdit && (showNum || !r.calc_method);   // สาย/เทป (ยาว) / อะไหล่ (นับชิ้น) ไม่ต้องวาด
        // ✏️ ปุ่มวาดรูปทรงชิ้น — วาดแล้ว = รูปย่อสีฟ้า (กดแก้รูปได้)
        const btn = r.shape || canDraw ? (
          <button type="button" disabled={!canEdit}
            onClick={() => openBoardRef.current(r.key)}
            title={r.shape
              ? t(`รูปทรงวาด${r.shape.name ? ` "${r.shape.name}"` : ""}${r.shape.allow ? ` · เผื่อพับ ${r.shape.allow} ซม.` : ""}${r.shape.holes?.length ? ` · เจาะ ${r.shape.holes.length} รู` : ""} · พื้นที่ตัด ${Math.round(pieceGeometry(r.shape).cutArea)} cm² · คิดผ้าจาก${r.shape.basis === "area" ? "พื้นที่จริง" : "กรอบสี่เหลี่ยม"} — กดเพื่อแก้รูป`, `Drawn shape${r.shape.name ? ` "${r.shape.name}"` : ""}${r.shape.allow ? ` · allowance ${r.shape.allow} cm` : ""}${r.shape.holes?.length ? ` · ${r.shape.holes.length} holes` : ""} · cut area ${Math.round(pieceGeometry(r.shape).cutArea)} cm² · fabric from ${r.shape.basis === "area" ? "actual area" : "bounding box"} — click to edit`)
              : t("วาดรูปทรงชิ้นนี้ (สี่เหลี่ยม วงกลม ปากกา หรือวางจาก Illustrator)", "Draw this piece (rectangle, circle, pen, or paste from Illustrator)")}
            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border ${r.shape ? "border-blue-300 bg-blue-50 text-blue-700" : "border-transparent text-slate-400 hover:border-blue-300 hover:text-blue-600"} disabled:cursor-default`}>
            {r.shape ? <ShapeMini shape={r.shape.shape} holes={r.shape.holes} /> : <Icon value="i:vector-bezier" className="text-[14px]" />}
          </button>
        ) : null;
        if (!showNum && !btn) return <span className="block h-7" title={t("ชนิดนี้ไม่ใช้ความกว้าง", "This type doesn't use width")}></span>;
        return (
          <div className="flex items-center gap-1">
            {btn}
            {showNum && <div className="min-w-0 flex-1">{numCell(r.width_cm, (v) => u({ width_cm: v, ...(r.shape ? { shape: refitLineShape(r.shape, v, r.length_cm) } : {}) }))}</div>}
          </div>
        );
      } },
    { key: "length_cm", header: t("ยาว (ซม.)", "Length (cm)"), width: cw(84, 60), align: "right", sortable: true, getValue: (r) => r.length_cm,
      render: (r, u) => usesLength(r.calc_method) || rowIsPiece(r) || !!r.shape
        ? numCell(r.length_cm, (v) => u({ length_cm: v, ...(r.shape ? { shape: refitLineShape(r.shape, r.width_cm, v) } : {}) }))
        : <span className="block h-7" title={t("ชนิดนี้ไม่ใช้ความยาว", "This type doesn't use length")}></span> },
    { key: "pieces", header: t("จำนวนชิ้น", "Pcs"), width: cw(80, 56), align: "right", sortable: true, getValue: (r) => r.pieces,
      render: (r, u) => usesPieces(r.calc_method) || rowIsPiece(r) || !!r.shape   // ชิ้นที่วาด/ชนิดชิ้น = มีจำนวนชิ้นเหมือนบรรทัดปกติ
        ? numCell(r.pieces, (v) => u({ pieces: v }))
        : <span className="block h-7" title={t("ชนิดนี้ไม่ใช้จำนวนชิ้น", "This type doesn't use pcs")}></span> },
    { key: "waste_percent", header: t("เผื่อเสีย %", "Waste %"), width: cw(84, 60), align: "right", sortable: true, getValue: (r) => r.waste_percent,
      render: (r, u) => usesWaste(r.calc_method) || rowIsPiece(r) || !!r.shape   // ชิ้นที่วาด/ชนิดชิ้น = มีเผื่อเสียเหมือนบรรทัดปกติ
        ? numCell(r.waste_percent, (v) => u({ waste_percent: v }), "0")
        : <span className="block h-7" title={t("ชนิดนี้ไม่ใช้เผื่อเสีย", "This type doesn't use waste")}></span> },
    { key: "face_width_cm", header: t("หน้ากว้าง / พื้นที่", "Roll width / area"), width: cw(96, 72), align: "right", sortable: true, getValue: (r) => r.face_width_cm,
      render: (r, u) => rowIsPiece(r)
        // ชนิดชิ้น: ไม่ใช้หน้ากว้าง — โชว์พื้นที่ cm² (กว้าง×ยาว) แทนไว้อ้างอิง
        ? <span className="block px-1 text-right text-xs text-violet-600" title={t("พื้นที่ = กว้าง×ยาว (อ้างอิง ไม่ได้คูณราคา)", "Area = width×length (reference only, not multiplied by price)")}>{pieceArea(r) != null ? `${fmtQty(pieceArea(r))} cm²` : "—"}</span>
        : r.calc_method === "area_face"
        ? numCell(r.face_width_cm, (v) => u({ face_width_cm: v }))
        : <span className="block h-7"></span> },
    { key: "qty", header: t("ปริมาณ", "Qty"), width: cw(96, 72), align: "right", summable: true, sortable: true, getValue: (r) => r.qty,
      render: (r, u) => isManualM(r.calc_method) && fullEdit
        ? <input type="number" min={0} step="any" value={r.qty ?? ""} placeholder={t("พิมพ์เอง", "Type in")}
            onChange={(e) => u({ qty: e.target.value === "" ? null : Number(e.target.value) })} className={numInputCls} />
        : <span className="block px-1 text-right tabular-nums font-medium text-slate-700 cursor-help underline decoration-dotted decoration-slate-300" title={calcTooltip(r)}>{fmtQty(r.qty)}</span> },
    { key: "uom", header: t("หน่วย", "Unit"), width: cw(70, 52), sortable: true, getValue: (r) => r.uom,
      render: (r, u) => textCell(r.uom, (v) => u({ uom: v })) },
    { key: "unit_price", header: t("ราคา/หน่วย", "Price/unit"), width: cw(96, 80), align: "right", sortable: true, getValue: (r) => r.unit_price,
      render: (r, u) => numCell(r.unit_price, (v) => u({ unit_price: v })) },
    { key: "amount", header: t("รวม (บาท)", "Total (THB)"), width: cw(104, 92), align: "right", summable: true, sortable: true, getValue: (r) => r.amount,
      // รวม = 0 (มีวัสดุ/ตัวเลขแล้วแต่ยังไม่มียอด) = ตัวแดง + ไอคอนเตือน · แถวเป็นพื้นแดง (rowClassName) — เจ้าของขอ 2026-11-07
      render: (r) => (isZeroCostRow(r)
        ? <span className="flex items-center justify-end gap-1 px-1 tabular-nums font-semibold text-rose-600" title={t("บรรทัดนี้ยังไม่มียอด (รวม = 0) — เช็กปริมาณ/ราคา", "This line has no amount yet (total = 0) — check qty/price")}><Icon value="i:alert-triangle" className="text-[13px]" />{fmtBaht(r.amount ?? 0)}</span>
        : <span className="block px-1 text-right tabular-nums font-semibold text-emerald-700">{fmtBaht(r.amount)}</span>) },
    { key: "note", header: t("หมายเหตุ", "Note"), minWidth: cw(120, 80), getValue: (r) => r.note,
      render: (r, u) => textCell(r.note, (v) => u({ note: v }), "—") },
  ], [priceItems, priceGroups, canEdit, fullEdit, createPriceItemInline, t]);

  // ส่วนรูปภาพ (คอลัมน์ซ้ายของ modal — เห็นตลอดทุกแท็บ): บันทึกแล้ว=ImageManager แกลเลอรี · ยังไม่บันทึก=ที่พักรูป (อัปตอนกดบันทึก)
  const imageSection = !form ? null : form.id ? (
    <ImageManager entityType="design_sheet" entityId={form.id} actor={user?.name ?? user?.email ?? undefined} readonly={!canEdit} layout="gallery" />
  ) : (
    <div>
      {(prefill?.images?.length ?? 0) > 0 && (
        <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
          <p className="mb-1.5 text-xs text-emerald-800">
            <Icon name="chat" /> {t(`รูปจากไลน์ ${prefill!.images!.length} รูป — แนบให้ตอนกดบันทึก`, `${prefill!.images!.length} LINE image(s) — attached when you save`)}
            {prefill?.sourceLabel ? <span className="block text-[11px] text-emerald-700/80">{prefill.sourceLabel}</span> : null}
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {prefill!.images!.map((u) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={u} src={u} alt="" className="aspect-square w-full rounded-lg border border-emerald-200 object-cover" />
            ))}
          </div>
        </div>
      )}
      <div
        onDragOver={(e) => { e.preventDefault(); setPendDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setPendDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setPendDragging(false); if (e.dataTransfer.files.length) addPendFiles(e.dataTransfer.files); }}
        onClick={() => pendFileRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
          pendDragging ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"}`}>
        <input ref={pendFileRef} type="file" accept="image/*,application/pdf" multiple className="hidden"
          onChange={(e) => { if (e.target.files?.length) { addPendFiles(e.target.files); e.target.value = ""; } }} />
        <p className="text-sm text-slate-600">{pendDragging ? t("วางไฟล์ที่นี่", "Drop files here") : t("ลากรูปมาวาง · คลิกเลือก · หรือกด Ctrl+V", "Drag images here · click to pick · or press Ctrl+V")}</p>
        <p className="text-xs text-slate-400 mt-0.5">{t('อัปโหลดอัตโนมัติตอนกด "บันทึก"', 'Uploads automatically when you press "Save"')}</p>
      </div>
      {pendImgs.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5 mt-1.5">
          {pendImgs.map((p, i) => (
            <div key={p.url} className="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
              {p.file.type.startsWith("image/")
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.url} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full flex flex-col items-center justify-center text-slate-400"><span className="text-xl">📄</span><span className="text-[9px] px-0.5 truncate max-w-full">{p.file.name}</span></div>}
              <button type="button" onClick={(e) => { e.stopPropagation(); removePend(i); }} title={t("เอาออก", "Remove")}
                className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-[10px] text-rose-600 opacity-0 group-hover:opacity-100 border border-slate-200">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── ช่องในแท็บ "ข้อมูลงาน" (ชิ้นเดียวกัน) — ฟอร์มเต็ม (เปิดใบเดิม) กับฟอร์มสั้นตอนสร้างใหม่ หยิบไปจัดวางคนละแบบ ──
  const fld = !form ? null : {
    code: (
      <div>
        <span className="text-[11px] text-slate-500">{t("เลขที่", "No.")}</span>
        <div className="h-8 mt-0.5 px-2 flex items-center text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-500">
          {form.id ? <code>{form.code}</code> : t("ออกอัตโนมัติตอนบันทึก", "Assigned automatically on save")}</div>
      </div>
    ),
    status: (
      <label className="block">
        <span className="text-[11px] text-slate-500">{t("สถานะ", "Status")}</span>
        <select value={form.status} onChange={(e) => patch({ status: e.target.value })} disabled={!canEdit}
          className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50">
          {/* แบรนด์เรา (ไม่ได้ติ๊ก 👤 งานลูกค้า) = ไม่มีสถานะ "เฉพาะงานลูกค้า" (กฎกลาง statusOptsFor) */}
          {statusOptsFor(wfMeta, isOwnBrandJob(brands.find((b) => b.id === form.brand_id)), form.status).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          {/* สถานะเดิมของใบนี้ที่ถูกลบออกจาก workflow แล้ว — ยังโชว์ให้เลือกค้างไว้ได้ ไม่พัง */}
          {form.status && !wfMeta.map[form.status] && <option value={form.status}>{form.status} {t("(สถานะเก่า)", "(old status)")}</option>}
        </select>
      </label>
    ),
    name: (
      <label className="block">
        <span className="text-[11px] text-slate-500">{t("ชื่องาน *", "Job name *")}</span>
        {/* สร้างใหม่: ช่องใหญ่ขึ้น + เคอร์เซอร์รออยู่เลย (ช่องแรกที่ต้องกรอก) */}
        <input value={form.name} onChange={(e) => patch({ name: e.target.value })} disabled={!fullEdit} placeholder={t("เช่น กระเป๋าผ้าแคนวาสรุ่นใหม่", "e.g. New canvas tote bag")} autoFocus={!form.id}
          className={`w-full mt-0.5 px-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 ${form.id ? "h-8 text-sm" : "h-10 text-base"}`} />
      </label>
    ),
    brand: (() => {
      // สร้างใหม่: ปุ่มแบรนด์ที่คนนี้ใช้ล่าสุด 3 อัน (กดทีเดียว · กดซ้ำ = เอาออก) + ช่องเลือก "อื่น ๆ" สำหรับแบรนด์ที่เหลือ
      const chips = form.id ? [] : recentBrandIds.map((id) => brands.find((b) => b.id === id)).filter((b): b is Brand => !!b).slice(0, RECENT_BRAND_CHIPS);
      const onChip = chips.some((b) => b.id === form.brand_id);
      const addBtn = fullEdit && <button type="button" title={t("เพิ่มแบรนด์ใหม่", "Add new brand")}
        onClick={() => { setNewBrandName(""); setNewBrandColor("#3b82f6"); setBrandModal(true); }}
        className="h-8 w-8 shrink-0 inline-flex items-center justify-center border border-slate-200 rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-600">＋</button>;
      if (!chips.length) return (
        <label className="block">
          <span className="text-[11px] text-slate-500">{t("แบรนด์", "Brand")}</span>
          <div className="flex gap-1.5 mt-0.5">
            <select value={form.brand_id} onChange={(e) => patch({ brand_id: e.target.value })} disabled={!fullEdit}
              className="flex-1 min-w-0 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50">
              <option value="">{t("— ไม่ระบุ —", "— None —")}</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {addBtn}
          </div>
        </label>
      );
      return (
        <div>
          <span className="text-[11px] text-slate-500">{t("แบรนด์", "Brand")}</span>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {chips.map((b) => {
              const on = form.brand_id === b.id;
              return (
                <button key={b.id} type="button" aria-pressed={on} disabled={!fullEdit} onClick={() => patch({ brand_id: on ? "" : b.id })}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm ${on ? "border-blue-500 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: b.color ?? "#94a3b8" }} />{b.name}
                </button>
              );
            })}
            <select value={onChip ? "" : form.brand_id} onChange={(e) => patch({ brand_id: e.target.value })} disabled={!fullEdit} aria-label={t("แบรนด์อื่น", "Other brand")}
              className={`h-8 min-w-0 max-w-[12rem] rounded-lg border px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 ${!onChip && form.brand_id ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500"}`}>
              <option value="">{t("อื่น ๆ…", "Other…")}</option>
              {brands.filter((b) => !chips.some((c) => c.id === b.id)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {addBtn}
          </div>
        </div>
      );
    })(),
    orderDate: (
      <label className="block">
        <span className="text-[11px] text-slate-500">{t("วันที่สั่ง", "Order date")}</span>
        <input type="date" value={form.order_date} onChange={(e) => patch({ order_date: e.target.value })} disabled={!fullEdit}
          className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
      </label>
    ),
    deadline: form.id ? (
      <label className="block">
        <span className="text-[11px] text-slate-500">Deadline</span>
        <input type="date" value={form.deadline} onChange={(e) => patch({ deadline: e.target.value })} disabled={!canEdit}
          className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
      </label>
    ) : (
      // สร้างใหม่: ปุ่มลัด วันนี้ +1 / +3 / +7 วัน (นับทุกวันตามปฏิทิน · กดซ้ำ = เอาออก) หรือเลือกวันเองในปฏิทิน
      <div>
        <span className="text-[11px] text-slate-500">{t("ส่งงานภายใน (Deadline)", "Due within (Deadline)")}</span>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {DEADLINE_QUICK.map((n) => {
            const v = addDaysYmd(todayStr(), n);
            const on = form.deadline === v;
            return (
              <button key={n} type="button" aria-pressed={on} disabled={!canEdit} onClick={() => patch({ deadline: on ? "" : v })} title={formatDate(v)}
                className={`h-8 rounded-full border px-3 text-sm tabular-nums ${on ? "border-blue-500 bg-blue-50 font-medium text-blue-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{t(`+${n} วัน`, `+${n} days`)}</button>
            );
          })}
          <input type="date" value={form.deadline} onChange={(e) => patch({ deadline: e.target.value })} disabled={!canEdit} aria-label={t("วันส่งงาน", "Due date")}
            className="h-8 w-40 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
        </div>
        <p className="mt-0.5 text-[11px] text-slate-400">{t(`นับจากวันนี้ (${formatDate(todayStr())}) · เลือกวันเองในปฏิทินก็ได้`, `Counted from today (${formatDate(todayStr())}) · or pick a date in the calendar`)}</p>
      </div>
    ),
    appointment: (
      <label className="block">
        <span className="text-[11px] text-slate-500">{t("วันนัด / วันได้ตัวอย่าง", "Appointment / sample date")}</span>
        <input type="date" value={form.appointment_date} onChange={(e) => patch({ appointment_date: e.target.value })} disabled={!canEdit}
          className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
      </label>
    ),
    // ⏳ รออะไรอยู่ = เช็กลิสต์กลาง (บันทึกทันทีทีละข้อ ไม่ต้องกดบันทึกใบงาน) — โชว์บนการ์ด + กล่อง hover ของ Design Dashboard · ต้องมีเลขใบก่อน
    waiting: form.id ? (
      <RecordChecklist moduleKey={DESIGN_WAITING.moduleKey} recordType={DESIGN_WAITING.recordType} recordId={form.id} canEdit={canEdit}
        presetType={DESIGN_WAITING.presetType} autoNew label={t("⏳ รออะไรอยู่", "⏳ Waiting on")} emptyText={t("ไม่มีอะไรรอ", "Nothing pending")} />
    ) : null,
    drive: (
      <div className="block">
        <label className="block">
          <span className="text-[11px] text-slate-500">{t("ลิงก์ไฟล์งาน (Google Drive)", "Work file link (Google Drive)")}</span>
          <div className="flex gap-1.5 mt-0.5">
            <input value={form.drive_link} onChange={(e) => patch({ drive_link: e.target.value })} disabled={!canEdit} placeholder="https://drive.google.com/..."
              className="flex-1 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
            {form.drive_link && <a href={form.drive_link} target="_blank" rel="noreferrer"
              className="h-8 px-2.5 inline-flex items-center text-sm border border-slate-200 rounded-lg text-blue-600 hover:bg-blue-50">{t("↗ เปิด", "↗ Open")}</a>}
          </div>
        </label>
        {!form.id && <p className="mt-1 text-[10px] text-slate-400">{t("บันทึกใบงานก่อน แล้วจะลากไฟล์งาน (AI / PSD / PDF) ขึ้น Drive ได้", "Save the design sheet first, then you can drop work files (AI / PSD / PDF) to Drive")}</p>}
      </div>
    ),
    /* 📁 โยนไฟล์งาน AI / PSD / PDF ขึ้นโฟลเดอร์ Drive ของใบ (ของกลาง DriveUploadBox · ไฟล์ใหญ่ได้ถึง 5GB) — ใบที่บันทึกแล้วเท่านั้น
       อัปไฟล์แรก = ระบบสร้างโฟลเดอร์ + เติมลิงก์ช่องบนให้ (ถ้าช่องยังว่าง) → อัปเดตฟอร์มด้วย กันกด "บันทึก" ทีหลังแล้วลิงก์หาย */
    driveFiles: form.id ? (
      <DriveUploadBox key={form.id} folderUrl={driveFolderUrl} canUpload={canEdit}
        title={t("ไฟล์งานใน Drive", "Work files in Drive")}
        hint={t("หรือลากมาวาง · AI PSD PDF ฯลฯ ได้ถึง 5GB", "or drag here · AI PSD PDF etc. up to 5GB")}
        startUpload={(file) => startSheetDriveUpload(form.id!, file)}
        onUploaded={({ folderUrl }) => { setDriveFolder({ id: form.id!, url: folderUrl }); if (!form.drive_link.trim()) patch({ drive_link: folderUrl }); }} />
    ) : null,
    /* เฟส 5: ตั้ง Parent SKU ได้หลายตัว (chips) + เช็ครหัสสด (ซ้ำ=แดง ห้ามเพิ่ม · ข้ามเลข=เตือนแต่เพิ่มได้)
        ช่องนี้ (และร่าง Parent) เป็น "ช่อง quick" = เพิ่ม/เอาออกได้ในโหมดดูเลย ไม่ต้องกด ✏️ แก้ไขก่อน
        (เดิมผูก fullEdit → โหมดดูเห็นแค่หัวข้อเปล่า ๆ ไม่มีช่องให้พิมพ์ เจ้าของแจ้งว่า "ใช้ไม่ได้") · มีผลจริงตอนกดบันทึก */
    // 📦 สินค้าของงานนี้ (Parent SKU + SKU ที่เชื่อม + ร่าง) — components/design-sheet-detail/parent-sku-box.tsx (เจ้าของขอ 2026-11-07 "ดูง่าย ๆ")
    parent: (
      <ParentSkuBox canEdit={canEdit} codes={form.parent_sku_codes} drafts={form.parent_sku_drafts} refs={parentRefs} linkedSkus={linkedSkus}
        input={skuInput} setInput={setSkuInput} check={skuCheck} checking={skuChecking}
        onAddTyped={addParentCode} onAddCode={addParentCodeValue} onRemoveCode={removeParentCode}
        draftInput={draftInput} setDraftInput={setDraftInput} onAddDraft={addParentDraft} onRemoveDraft={removeParentDraft} />
    ),
    detail: (
      <div className="block">
        <span className="text-[11px] text-slate-500">{t("รายละเอียดงาน", "Job details")}</span>
        <div className="mt-0.5">
          <RichTextEditor value={form.detail} onChange={(html) => patch({ detail: html })} editable={canEdit}
            onUploadImage={form.id ? uploadDetailImage : undefined} minHeight={form.id ? 150 : 120} />
          {!form.id && <p className="text-[10px] text-slate-400 mt-0.5">{t("บันทึกใบงานก่อน แล้วจะวางรูปในรายละเอียดได้", "Save the design sheet first, then you can paste images into details")}</p>}
        </div>
      </div>
    ),
    note: (
      <label className="block">
        <span className="text-[11px] text-slate-500">Note</span>
        {/* สูงตามจำนวนบรรทัด (2–10) — แชตลูกค้าจากไลน์ยาวหลายบรรทัด อ่านได้โดยไม่ต้องเลื่อนในช่องเล็ก */}
        <textarea rows={Math.min(10, Math.max(2, form.note.split("\n").length))} value={form.note} onChange={(e) => patch({ note: e.target.value })} disabled={!canEdit}
          className="w-full mt-0.5 px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
      </label>
    ),
  };

  // ── ฟอร์มสร้างใบงานใหม่ (แบบสั้น · เจ้าของเลือก 2026-10-24): รูป + ชื่องาน + แบรนด์ + ส่งงานภายใน + รายละเอียด
  //    ช่องที่เหลือพับไว้ใต้ "＋ ใส่ข้อมูลอื่น" · บันทึกแล้วกลายเป็นฟอร์มเต็ม (แท็บ/รออะไรอยู่/Comment/ตีราคา) เหมือนเดิม
  //    บันทึกไม่ผ่าน → กางให้เองด้วย (เผื่อปัญหาอยู่ในช่องที่พับไว้)
  const createMoreFilled = !form ? 0 : [form.appointment_date, form.drive_link.trim(), form.note.trim()].filter(Boolean).length
    + form.parent_sku_codes.length + form.parent_sku_drafts.length;
  const createOpenMore = createMore || !!formErr;
  const createLayout = !form || !fld ? null : (
    <div className="mx-auto w-full max-w-2xl space-y-3">
      {formErr && <div className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>}
      <div>
        <span className="text-[11px] text-slate-500">{t("รูปภาพงานออกแบบ", "Design images")}</span>
        <div className="mt-0.5">{imageSection}</div>
      </div>
      {fld.name}
      {fld.brand}
      {fld.deadline}
      {fld.detail}
      <div>
        <button type="button" onClick={() => setCreateMore((v) => !v)} aria-expanded={createOpenMore}
          className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
          <span className="inline-block w-3 text-center">{createOpenMore ? "−" : "＋"}</span>
          {createOpenMore ? t("ซ่อนข้อมูลอื่น", "Hide other fields") : t("ใส่ข้อมูลอื่น", "Add other fields")}
          <span className="text-xs text-slate-400">{t("(สถานะ · วันสั่ง · วันนัด · Drive · Parent SKU · Note)", "(Status · order date · appointment · Drive · Parent SKU · Note)")}</span>
          {!createOpenMore && createMoreFilled > 0 && <span className="rounded-full bg-blue-50 px-1.5 text-[11px] text-blue-700">{t(`ใส่แล้ว ${createMoreFilled}`, `${createMoreFilled} filled`)}</span>}
        </button>
        {createOpenMore && (
          <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">{fld.status}{fld.orderDate}{fld.appointment}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{fld.drive}{fld.parent}</div>
            {fld.note}
          </div>
        )}
      </div>
      <p className="text-[11px] text-slate-400">{t("บันทึกแล้วจะเพิ่ม ⏳ รออะไรอยู่ · Comment ลูกค้า · ตีราคา · เสนอราคา ได้", "After saving you can add ⏳ Waiting on · Customer comments · Costing · Quotes")}</p>
    </div>
  );

  if (!canView) return <AccessDenied />;

  // ── แท็บตีราคา: ปุ่มบันทึก/ส่งยอด + การ์ดสรุปต้นทุน (components/design-sheet-detail/cost-summary-card) ──
  const costZeroCount = curLines.filter(isZeroCostRow).length;
  // บันทึกแล้ว = กลับเป็นโหมดดูอย่างเดียว (เจ้าของขอ 2026-11-07) · ส่วน "สั่งจากร้าน" ยังแก้ค้าง = คงโหมดแก้ไว้
  const costActions = (layout: "row" | "stack") => (
    <>
      <button onClick={() => void (async () => { if ((await saveCost()) && !supplierDirty) setEditing(false); })()} disabled={costSaving}
        className={`h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 shadow-sm ${layout === "stack" ? "w-full" : ""}`}>{costSaving ? t("กำลังบันทึก...", "Saving...") : t("บันทึกตีราคา", "Save costing")}</button>
      <button onClick={() => void sendCostToQuote()} disabled={costSaving || !(grandTotal > 0)}
        className={`h-9 px-4 text-sm border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 disabled:opacity-50 bg-white ${layout === "stack" ? "w-full" : ""}`}>{t("ส่งยอดไปเสนอราคา", "Send total to quote")}</button>
    </>
  );
  const costUsageText = (() => {
    // ใช้ต่อใบ (ผ้า/แผ่นคิดเป็นผืน + หน่วยอื่นรวมตามหน่วย) — ตัวเดียวกับหัวกลุ่มในตาราง (lib/cost-usage)
    const u = costUsagePerUnit(curLines.map((r) => ({ item_id: r.item_id, group_name: r.group_name, qty: r.qty, uom: r.uom, piece: rowIsPiece(r) })), (id) => priceItemById.get(id));
    const parts: string[] = [];
    if (u.sheets) parts.push(`${u.sheets.qty.toFixed(2)} ${u.sheets.unit}`);
    for (const x of u.byUom) parts.push(`${fmtQty(Math.round(x.qty * 1000) / 1000)} ${x.uom}`);
    return parts.length ? t(`ใช้ต่อใบ ≈ ${parts.join(" + ")}`, `Per unit ≈ ${parts.join(" + ")}`) : null;
  })();
  const costSummaryCard = (
    <CostSummaryCard grandTotal={grandTotal} materialTotal={costTotal} groups={costByGroup}
      extras={costExtra.filter((c) => (c.amount || 0) !== 0).map((c) => ({ label: c.label || t("ค่าใช้จ่าย", "Expense"), amount: c.amount || 0,
        note: c.mode === "split" && c.split_qty ? `(${fmtBaht(c.total ?? 0)} ÷ ${c.split_qty.toLocaleString("th-TH")})` : null }))}
      usage={costUsageText}
      tiers={splitFixedTotal > 0 ? SPLIT_TIERS.map((q) => ({ qty: q, total: totalForParent(costParent, q) })) : undefined}
      zeroCount={costZeroCount} dirty={costDirty}
      onVersions={form?.id ? () => { setVersionsInit(null); setVersionsOpen(true); } : undefined}
      actions={costSide && fullEdit ? costActions("stack") : undefined} />
  );

  return (
    <>
      {!detailOnly && (
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">{t("🎨 Design Sheets (ใบงานออกแบบ)", "🎨 Design Sheets")}</h1>
            <p className="text-sm text-slate-500 mt-0.5">{t("งานออกแบบสินค้าใหม่ ตั้งแต่รับโจทย์จนตั้งเป็นสินค้าจริง — คลิกแถวเพื่อเปิดดู/แก้", "New product design jobs, from brief to real product — click a row to view/edit")}</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/master/design-sheets/dashboard" className="h-9 px-3 text-sm font-medium border border-amber-200 bg-amber-50 text-amber-700 rounded-lg hover:bg-amber-100">{t("🗺️ แผนที่ภารกิจ", "🗺️ Mission map")}</a>
            <RecordTasksButton moduleKey="design_sheets" canEdit={canEdit} />
            {canCreate && <button onClick={openCreate} className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">{t("＋ สร้างใบงานออกแบบ", "＋ New design sheet")}</button>}
          </div>
        </div>

        {/* สลับมุมมอง + ตัวกรอง */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button onClick={() => switchView("table")}
              className={`h-7 px-3 text-sm rounded-md ${view === "table" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{t("📋 ตาราง", "📋 Table")}</button>
            <button onClick={() => switchView("canvas")}
              className={`h-7 px-3 text-sm rounded-md ${view === "canvas" ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>🎨 Canvas</button>
          </div>
          {view === "table" && (
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); refresh(); }}
              className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">{t("สถานะ: ทั้งหมด", "Status: all")}</option>
              {wfMeta.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
          {/* Canvas: โซน=สถานะอยู่แล้ว เหลือตัวกรองแบรนด์ (แบรนด์ดูจากสีเงา+ชื่อบนการ์ด) */}
          <select value={brandFilter} onChange={(e) => { setBrandFilter(e.target.value); refresh(); }}
            className="h-8 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">{t("แบรนด์: ทั้งหมด", "Brand: all")}</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {view === "table" && (
            <label className="inline-flex items-center gap-1.5 text-sm text-slate-500 cursor-pointer select-none">
              <input type="checkbox" checked={showArchived} onChange={(e) => { setShowArchived(e.target.checked); refresh(); }} className="rounded border-slate-300" />
              {t("แสดงที่เก็บเข้ากรุ", "Show archived")}
            </label>
          )}
          {view === "canvas" && canEdit && (
            <button onClick={() => setStatusMgr(true)} title={t("เพิ่ม/แก้ชื่อ/เปลี่ยนสี/เรียงลำดับสถานะงาน", "Add/rename/recolor/reorder job statuses")}
              className="h-8 px-3 text-sm border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 ml-auto">
              {t("⚙️ จัดการสถานะงาน", "⚙️ Manage job statuses")}
            </button>
          )}
        </div>

        {view === "table" ? (
          <DataTable
            tableId="design-sheets" data={[]} columns={columns}
            serverFetch={serverFetch} serverRefreshKey={refreshKey}
            searchableKeys={["code", "name"]}
            searchPlaceholder={t("ค้นหา เลขที่ DS / ชื่องาน...", "Search DS no. / job name...")}
            exportFilename="design-sheets" exportEntityType="design_sheet"
            canCheck={(p) => can(p as Parameters<typeof can>[0])}
            onRowClick={openEdit}
            rowActions={canEdit ? (showArchived ? [
              { label: t("กู้คืน", "Restore"), icon: "↩", onClick: doRestore },
            ] : [
              { label: t("แก้", "Edit"), icon: "✏", onClick: openEdit },
              { label: t("เก็บเข้ากรุ", "Archive"), icon: "🗑", variant: "danger", onClick: (r) => setArchiveTarget(r) },
            ]) : []}
            pageSize={20}
          />
        ) : canvasLoading ? (
          <div className="py-16 text-center text-slate-400">{t("กำลังโหลดกระดาน...", "Loading board...")}</div>
        ) : canvasErr ? (
          <div className="py-10 text-center">
            <p className="text-sm text-rose-600 mb-2">⚠ {canvasErr}</p>
            <button onClick={refresh} className="h-8 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">{t("ลองใหม่", "Retry")}</button>
          </div>
        ) : (
          <CanvasBoard<DesignSheetListItem>
            zones={zones} items={canvasItems}
            getItemId={(it) => it.id}
            getZoneId={(it) => (knownStatus.has(it.status) ? it.status : OLD_STATUS_ZONE)}
            canDrag={canEdit}
            onMove={canEdit ? moveStatus : undefined}
            onReorder={canEdit ? reorderCards : undefined}
            onCardClick={openEdit}
            cardWidth={184}
            emptyText={t("ยังไม่มีงานในสถานะนี้ — ลากการ์ดมาวางได้", "No jobs in this status yet — drag cards here")}
            renderCard={(it, dragging) => {
              const tone = deadlineTone(it.deadline, it.status, wfMeta.finished);
              const brandColor = it.brand_color ?? "#cbd5e1";
              // เฟส 8: ไฟสถานะขั้นตอน — เขียว=เสนอราคาแล้ว · เหลือง=ตีราคาแล้วยังไม่เสนอ · เทา=ยังไม่ตีราคา
              const step = it.has_quote ? { dot: "bg-emerald-500", label: t("เสนอราคาแล้ว", "Quoted") }
                : it.has_cost ? { dot: "bg-amber-500", label: t("ตีราคาแล้ว · ยังไม่เสนอ", "Costed · not quoted yet") }
                : { dot: "bg-slate-300", label: t("ยังไม่ตีราคา", "Not costed yet") };
              return (
                /* เงาทึบเหลื่อมขวา-ล่างสีแบรนด์ (ตามสเก็ตช์เจ้าของ) — ไม่ระบุแบรนด์ = เทาอ่อน */
                <div className={`bg-white rounded-lg border border-slate-200 overflow-hidden ${dragging ? "ring-2 ring-blue-300 rotate-1" : "hover:border-blue-300"}`}
                  style={{ boxShadow: `4px 4px 0 ${brandColor}` }}>
                  <div className="h-28 bg-slate-50 flex items-center justify-center">
                    {it.cover_url
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={it.cover_url} alt="" draggable={false} className="w-full h-full object-contain pointer-events-none" />
                      : <span className="text-slate-200 text-3xl">🎨</span>}
                  </div>
                  <div className="p-2 space-y-1">
                    <p className="text-[13px] font-medium text-slate-700 leading-snug line-clamp-2">{it.name}</p>
                    <div className="flex items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0 border border-slate-200" style={{ backgroundColor: brandColor }} />
                        <span className="truncate">{it.brand_name ?? t("ไม่ระบุแบรนด์", "No brand")}</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-300 shrink-0">{it.code.replace(/^DS-/, "")}</span>
                    </div>
                    <div className={`flex items-center gap-1.5 text-[11px] ${tone.text}`}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} />
                      {it.deadline ? t(`เสร็จ ${formatDate(it.deadline)}`, `Due ${formatDate(it.deadline)}`) : t("ไม่กำหนดเสร็จ", "No due date")}
                    </div>
                    {/* เฟส 8: ไฟสถานะขั้นตอน (ครบ/ขาด) */}
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500" title={step.label}>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${step.dot}`} />
                      <span className="truncate">{step.label}</span>
                    </div>
                    {it.note && <p className="text-[11px] text-slate-400 line-clamp-1">{it.note}</p>}
                    {/* เฟส 8: ปุ่มลัดบนการ์ด — กดแล้วไม่เปิดการ์ด (stopPropagation) */}
                    <div className="flex items-center gap-1 pt-1 mt-0.5 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                      <button type="button" title={t("ตีราคา", "Costing")} onClick={(e) => { e.stopPropagation(); void openEdit(it, "cost"); }}
                        className="flex-1 h-7 inline-flex items-center justify-center gap-1 text-[11px] rounded-md border border-slate-200 text-slate-600 hover:bg-amber-50 hover:border-amber-200">{t("🧮 ตีราคา", "🧮 Cost")}</button>
                      <button type="button" title={t("เสนอราคา", "Quote")} onClick={(e) => { e.stopPropagation(); void openEdit(it, "quotes"); }}
                        className="flex-1 h-7 inline-flex items-center justify-center gap-1 text-[11px] rounded-md border border-slate-200 text-slate-600 hover:bg-emerald-50 hover:border-emerald-200">{t("💰 เสนอ", "💰 Quote")}</button>
                      <a href={`/print/design-sheet-quote/${it.id}`} target="_blank" rel="noreferrer" title={t("พิมพ์ใบเสนอราคา", "Print quotation")} onClick={(e) => e.stopPropagation()}
                        className="h-7 px-2 inline-flex items-center justify-center text-[11px] rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">🖨</a>
                    </div>
                  </div>
                </div>
              );
            }}
          />
        )}
      </div>
      )}

      {/* สร้างใหม่ = ป๊อปขนาดปกติ ไม่เต็มจอ (ฟอร์มสั้น · เจ้าของขอ 2026-10-24 · ยังกด ⤢ ขยายเองได้) · เปิดใบเดิม = ใหญ่ตามเดิม */}
      <ERPModal open={form !== null} onClose={requestClose} size={form?.id ? "xl" : "lg"} defaultExpanded={form?.id ? undefined : false}
        title={form?.id ? t(`ใบงานออกแบบ: ${form.code}`, `Design sheet: ${form.code}`) : t("สร้างใบงานออกแบบใหม่", "New design sheet")}
        footer={<>
          {form?.id && (
            // ปุ่มล่าง = เมนูรวมตามประเภท เด้งขึ้นด้านบน (ของกลาง components/menu-bar · เจ้าของขอ 2026-11-07)
            <div className="mr-auto">
              <MenuBar placement="up" menus={(() => {
                const share: MenuItem[] = [
                  { key: "link", icon: "link", label: t("คัดลอกลิงก์", "Copy link"), title: t("คัดลอกลิงก์มาที่ใบงานนี้ (ส่งให้คนอื่นเปิดตรงนี้ได้เลย)", "Copy a link to this design sheet (others can open it directly)"), onSelect: () => void copySheetLink() },
                  // ส่งใบงานนี้ขึ้นกระดานวางแผนของแคมเปญ (ของกลาง) — ซ่อนตอนเปิดจากบนกระดานเอง (ซ้ำซ้อน)
                  ...(canSendToBoard && !hideSendToBoard ? [{ key: "board", icon: "presentation", label: t("ส่งขึ้นกระดาน", "Send to board"),
                    title: t("เลือกแคมเปญ แล้วไปวางการ์ดใบงานนี้บนกระดานวางแผน", "Pick a campaign, then place this design sheet card on its planning board"),
                    onSelect: () => { if (costDirty) { toast.error(t("มีข้อมูลตีราคายังไม่บันทึก — กดบันทึกก่อนออกจากใบงาน", "Unsaved costing — save before leaving the design sheet")); return; } setBoardPick(true); } }] : []),
                  // ใส่แผนงานทีม (ของกลาง team-plan) — ลิงก์กลับใบงานนี้
                  ...(can("tasks.create" as Parameters<typeof can>[0]) ? [{ key: "plan", icon: "calendar-event", label: t("ใส่แผนงาน", "Add to plan"),
                    title: t("เพิ่มเป็นงานในแผนงานทีม (มอบคน ตั้งกำหนด ตั้งเตือนได้)", "Add as a team plan task (assign, set due date, reminders)"), onSelect: () => setPlanOpen(true) }] : []),
                ];
                const create: MenuItem[] = [
                  // ลงออเดอร์ลูกค้าจากใบงานนี้ (กางทุกสีจาก Parent SKU · ยังไม่มี SKU = ลงชื่อไว้) → ป๊อปลงออเดอร์กลาง
                  ...(canOrder ? [{ key: "order", icon: "shopping-cart", label: orderLoading ? t("กำลังเตรียม…", "Preparing…") : t("ลงออเดอร์", "Add order"), disabled: orderLoading,
                    title: t("ลงใบงานนี้เป็นออเดอร์ลูกค้า (ใบสั่งขาย) + จับชุด", "Add this sheet as a customer order"),
                    onSelect: () => void (async () => {
                      if (!form.id) return;
                      setOrderLoading(true);
                      try { const { seedsFromDesignSheets } = await import("@/components/order-batch-entry"); setOrderSeed(await seedsFromDesignSheets([{ id: form.id, code: form.code, name: form.name }])); }
                      finally { setOrderLoading(false); }
                    })() }] : []),
                  ...(canCreate ? [{ key: "sku", icon: "wand", label: t("สร้าง SKU", "Create SKU"), title: t("สร้าง Parent SKU + SKU ลูก จากใบงานนี้", "Create Parent SKU + child SKUs from this design sheet"), onSelect: () => setSkuWizard(true) }] : []),
                ];
                const openTab = (url: string) => { window.open(url, "_blank", "noopener"); };
                const print: MenuItem[] = [
                  // ใบนำเสนอ A4 (เสนอลูกค้า) — แผงลอย จัดรูป/ข้อความ 1-2 หน้า แล้วพิมพ์ (ของกลาง design-sheet-present)
                  { key: "present", icon: "file-text", label: t("ใบนำเสนอ A4", "A4 presentation"),
                    title: t("จัดใบนำเสนอ A4 สำหรับเสนอลูกค้า (เลือกรูป + ข้อความ 1-2 หน้า แล้วพิมพ์/PDF)", "Build an A4 presentation for the customer (pick images + text, 1-2 pages, then print/PDF)"),
                    onSelect: () => { if (!form.id) return; if (onOpenPresentation) onOpenPresentation(form.id); else setPresentOpen(true); } },
                  { type: "divider", key: "d1" },
                  { key: "sample", icon: "printer", label: t("ใบสั่งตัวอย่าง", "Sample order"), onSelect: () => openTab(`/print/design-sheet/${form.id}`) },
                  { key: "quote", icon: "printer", label: t("ใบเสนอราคา", "Quotation"), onSelect: () => openTab(`/print/design-sheet-quote/${form.id}`) },
                  { key: "cost", icon: "printer", label: t("ใบตีราคา", "Cost sheet"), hint: costParent ? costTabLabel(costParent, generalLabel) : undefined,
                    title: costParent ? t(`พิมพ์เฉพาะไซส์ "${costParent}" (เปลี่ยนได้ในหน้าพิมพ์)`, `Print size "${costParent}" only (changeable on the print page)`) : t("พิมพ์ใบตีราคาต้นทุน", "Print cost sheet"),
                    onSelect: () => openTab(`/print/design-sheet-cost/${form.id}${costParent ? `?parent=${encodeURIComponent(costParent)}` : ""}`) },
                  // ✂ หน้าแพทเทิร์นจากตีราคา (ชิ้นขนาดจริง พิมพ์ A4 1:1 / DXF / วางบนผ้า) — app/print/design-sheet/[id]/pattern
                  { key: "pattern", icon: "scissors", label: t("แพทเทิร์นจากตีราคา", "Pattern from costing"), hint: costParent ? costTabLabel(costParent, generalLabel) : undefined,
                    title: t("ชิ้นแพทเทิร์นตามกว้าง×ยาวในตาราง — พิมพ์ขนาดจริงแบ่งหน้า A4 / ดาวน์โหลด DXF ให้เครื่องตัด / ดูการวางบนผ้า", "Pattern pieces from width×length — print true size on A4 / download DXF / see fabric layout"),
                    onSelect: () => openTab(`/print/design-sheet/${form.id}/pattern${costParent ? `?parent=${encodeURIComponent(costParent)}` : ""}`) },
                ];
                // ลบถาวร = ลบทั้งใบ + comment + ราคา (กู้ไม่ได้) → ต้องมีสิทธิ์ "ลบข้อมูลสินค้า" (server เช็กซ้ำ) · แยกไว้เมนู ⋯ กันกดพลาด
                const more: MenuItem[] = canEdit && can("products.delete" as Parameters<typeof can>[0]) ? [
                  { key: "del", icon: "trash", label: t("ลบใบงานถาวร", "Delete permanently"), danger: true, title: t("ลบใบงานถาวร + ย้ายรูปเข้าถังขยะ R2", "Permanently delete design sheet + move images to R2 trash"),
                    onSelect: () => { if (form?.id) setHardDelTarget({ id: form.id, code: form.code ?? "", name: form.name ?? "" }); } },
                ] : [];
                const menus: MenuDef[] = [
                  { key: "share", icon: "share", label: t("ส่งต่อ", "Share"), width: 210, items: share },
                  { key: "create", icon: "sparkles", label: t("สร้าง", "Create"), width: 200, items: create },
                  { key: "print", icon: "printer", label: t("พิมพ์", "Print"), width: 230, items: print },
                  { key: "more", icon: "dots-vertical", label: t("อื่น ๆ", "More"), iconOnly: true, width: 200, items: more },
                ];
                return menus.filter((m) => m.items.length > 0);
              })()} />
            </div>
          )}
          <button onClick={requestClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">{t("ปิด", "Close")}</button>
          {/* ไม่มีปุ่ม ✏️ แก้ไขแล้ว (เจ้าของขอ 2026-11-07) — ดับเบิลคลิกช่อง/แถวที่ล็อกเพื่อแก้ · บอกวิธีไว้ตรงที่ปุ่มเคยอยู่ */}
          {canEdit && form?.id && (modalTab === "info" || modalTab === "cost") && (editing ? (
            <span className="inline-flex h-9 items-center gap-1 px-1 text-xs font-medium text-blue-700"><Icon name="edit" /> {t("กำลังแก้ไข", "Editing")}</span>
          ) : (
            <span className="inline-flex h-9 items-center gap-1 px-1 text-xs text-slate-400"><Icon name="edit" /> {modalTab === "cost" ? t("ดับเบิลคลิกที่แถวเพื่อแก้ไข", "Double-click a row to edit") : t("ดับเบิลคลิกที่ช่องเพื่อแก้ไข", "Double-click a field to edit")}</span>
          ))}
          {canEdit && modalTab === "info" && <button onClick={save} disabled={saving} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button>}
        </>}>
        {loadingForm ? <div className="py-12 text-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</div> : form && !form.id ? createLayout : form && (
          <div className="flex flex-col lg:flex-row gap-4">
            {/* ซ้าย: รูปภาพงานออกแบบ — เห็นตลอดทุกแท็บ */}
            <div className="lg:w-[300px] lg:shrink-0">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t("รูปภาพงานออกแบบ", "Design images")}</span>
              <div className="mt-1">{imageSection}</div>
            </div>
            {/* ขวา: ข้อมูลงาน + แท็บ (สลับแท็บได้) */}
            <div className="flex-1 min-w-0 space-y-2">
            {formErr && <div className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {formErr}</div>}

            {/* แท็บ (โผล่เมื่อบันทึกแล้ว) */}
            {form.id && (
              <div className="flex items-center gap-1 border-b border-slate-200 pb-2">
                {([["info", t("📋 ข้อมูลงาน", "📋 Job info")], ["spec", t("📐 รายละเอียดงาน", "📐 Job details")], ["comments", t(`💬 Comment ลูกค้า (${comments.length})`, `💬 Customer comments (${comments.length})`)], ["cost", t(`🧮 ตีราคา (${costLines.length})`, `🧮 Costing (${costLines.length})`)], ["quotes", t(`💰 เสนอราคา (${quotes.length})`, `💰 Quotes (${quotes.length})`)], ["notice", t(`📣 แจ้งลูกค้า${noticeCount ? ` (${noticeCount})` : ""}`, `📣 Notify customer${noticeCount ? ` (${noticeCount})` : ""}`)]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setModalTab(k)}
                    className={`h-8 px-3 text-sm rounded-lg ${modalTab === k ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{l}</button>
                ))}
                {cqLoading && <span className="text-[11px] text-slate-300 ml-1">{t("กำลังโหลด...", "Loading...")}</span>}
              </div>
            )}

            {/* ข้อมูลงาน: ข้อมูลซ้าย · กล่องรายละเอียดงานขวา — กดฝั่งไหนฝั่งนั้นขยายดันอีกฝั่ง (ของกลาง SplitPanes · เจ้าของขอ 2026-11-07)
                ช่องฝั่งซ้ายจัดคอลัมน์ตามความกว้าง (ขยาย 3 · ครึ่ง 2 · แคบ 1) · ที่แคบ (มือถือ/ป๊อปไม่ขยาย) = เรียงบน-ล่างเหมือนเดิม */}
            {modalTab === "info" && fld && (
              <SplitPanes prefKey="ds_info_split"
                left={{ title: t("ข้อมูลงาน", "Job info"), icon: "document", content: (size: SplitSize) => {
                  const narrow = size === "narrow";
                  return (
                    /* โหมดดู: ดับเบิลคลิกช่องที่ล็อก = เข้าโหมดแก้ไข + เคอร์เซอร์ไปที่ช่องนั้น (แทนปุ่ม ✏️ แก้ไข · ของกลาง DblClickToEdit) */
                    <DblClickToEdit className="space-y-3" locked={!fullEdit} onEdit={canEdit ? () => setEditing(true) : undefined}>
                      <div className="grid grid-cols-2 gap-2">{fld.code}{fld.status}</div>
                      {fld.name}
                      <div className={`grid gap-2 ${narrow ? "grid-cols-1" : "grid-cols-2"}`}>{fld.brand}{fld.drive}</div>
                      {fld.driveFiles}
                      {/* 📅 วันสำคัญ — การ์ดกลาง DateCards (กดการ์ดเลือกวัน · ป้ายอีก/เลยกี่วัน · เส้นเวลา) · งานปิดแล้วไม่เตือนสี */}
                      <div>
                        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-slate-500"><Icon name="calendar" className="text-slate-400" /> {t("วันสำคัญ", "Key dates")}</div>
                        <DateCards compact={narrow} muted={wfMeta.finished.has(form.status)} timeline={{ from: "order", to: ["due", "appt"] }} items={[
                          { key: "order", label: t("วันที่สั่ง", "Order date"), icon: "cart", kind: "since", value: form.order_date, onChange: fullEdit ? (v) => patch({ order_date: v }) : undefined },
                          { key: "appt", label: t("วันนัด / ได้ตัวอย่าง", "Appointment / sample"), icon: "calendar", kind: "due", value: form.appointment_date, onChange: canEdit ? (v) => patch({ appointment_date: v }) : undefined },
                          { key: "due", label: t("Deadline ส่งงาน", "Deadline"), icon: "flag", kind: "due", value: form.deadline, onChange: canEdit ? (v) => patch({ deadline: v }) : undefined },
                        ]} />
                      </div>
                      {fld.parent}
                    </DblClickToEdit>
                  );
                } }}
                right={{ title: t("รายละเอียดงาน", "Job details"), icon: "note", content: (
                  <div className="space-y-3">
                    {fld.waiting}
                    {fld.detail}
                    {fld.note}
                    {/* 🎫 ตั๋วงาน Pattern ที่แนบใบนี้ (ของกลาง · ไม่มีสิทธิ์ดูตั๋ว = ไม่โชว์) */}
                    {form.id && <PatternTicketLinks sheetId={form.id} />}
                  </div>
                ) }} />
            )}

            {/* แท็บ Comment ลูกค้า (เฟส 3) */}
            {/* 📐 รายละเอียดงาน — คงไว้หลังเปิดครั้งแรก (ซ่อนตอนอยู่แท็บอื่น) */}
            {form.id && specMounted && (
              <div className={modalTab === "spec" ? "" : "hidden"}>
                <DesignSheetSpecTab key={form.id} sheetId={form.id} canEdit={canEdit} onDirtyChange={setSpecDirty} saveRef={specSaveRef}
                  onSendToCost={sendSpecToCost} costSkuIds={curLines.map((r) => r.item_sku_id).filter((v): v is string => !!v)} />
              </div>
            )}

            {/* 📣 แจ้งลูกค้า — คงไว้หลังเปิดครั้งแรก (ซ่อนตอนอยู่แท็บอื่น) · components/design-sheet-detail/notice-tab.tsx */}
            {form.id && noticeMounted && (
              <div className={modalTab === "notice" ? "" : "hidden"}>
                <DesignSheetNoticeTab key={form.id} sheetId={form.id} canEdit={canEdit}
                  sheet={{ code: form.code ?? "", name: form.name ?? "", brandName: brands.find((b) => b.id === form.brand_id)?.name ?? "" }}
                  costTabs={noticeCostTabs} costLines={noticeCostLines} sheetOf={noticeSheetOf} orderOf={noticeOrderOf}
                  onDirtyChange={setNoticeDirty} saveRef={noticeSaveRef} onCountChange={setNoticeCount} />
              </div>
            )}

            {modalTab === "comments" && form.id && <div className="space-y-2">
              {canEdit && (
                <div className="flex gap-1.5 items-start p-2 bg-slate-50 border border-slate-200 rounded-lg">
                  <input type="date" value={newCmDate} onChange={(e) => setNewCmDate(e.target.value)} className="h-8 px-2 text-sm border border-slate-200 rounded-lg w-36 shrink-0" />
                  <textarea rows={1} value={newCmBody} onChange={(e) => setNewCmBody(e.target.value)} placeholder={t("ลูกค้า comment ว่าอะไร...", "What did the customer say...")}
                    className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-lg resize-y" />
                  <button onClick={addComment} disabled={cmSaving} className="h-8 px-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0">{cmSaving ? "..." : t("＋ เพิ่ม", "＋ Add")}</button>
                </div>
              )}
              {comments.length === 0 && <div className="py-8 text-center text-sm text-slate-300">{t("— ยังไม่มี comment จากลูกค้า —", "— No customer comments yet —")}</div>}
              {comments.map((c, i) => (
                <div key={c.id} className="border border-slate-200 rounded-lg p-2.5">
                  {editCid === c.id ? (
                    <div className="flex gap-1.5 items-start">
                      <input type="date" value={editCmDate} onChange={(e) => setEditCmDate(e.target.value)} className="h-8 px-2 text-sm border border-slate-200 rounded-lg w-36 shrink-0" />
                      <textarea rows={2} value={editCmBody} onChange={(e) => setEditCmBody(e.target.value)} className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-lg" />
                      <button onClick={saveEditComment} className="h-8 px-2.5 text-sm bg-emerald-600 text-white rounded-lg shrink-0">✓</button>
                      <button onClick={() => setEditCid(null)} className="h-8 px-2.5 text-sm border border-slate-200 rounded-lg shrink-0">✕</button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <span className="text-[11px] text-slate-400 w-8 shrink-0 pt-0.5">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-400">{formatDate(c.comment_date)}</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.body}</p>
                        {c.images.length > 0 && (
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {c.images.map((u, xi) => <ImageThumbnail key={xi} url={u} size={44} enlargeable />)}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button title={t("รูปประกอบ", "Images")}
                          onClick={() => { const closing = openImgCid === c.id; setOpenImgCid(closing ? null : c.id); if (closing && form.id) void loadCq(form.id); }}
                          className="h-7 px-2 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">🖼 {c.images.length}</button>
                        {form.id && <AddToPlanButton label={t("แผนงาน", "Plan")}
                          title={`${form.code ? `${form.code} ` : ""}แก้ตาม Comment: ${c.body.replace(/\s+/g, " ").slice(0, 120)}`}
                          source={{ label: `${form.code || form.name} · Comment #${i + 1}`, href: `/master/design-dashboard?open=${encodeURIComponent(form.id)}` }}
                          className="h-7 px-2 inline-flex items-center gap-1 text-xs border border-violet-200 rounded-lg text-violet-700 hover:bg-violet-50" />}
                        {canEdit && <button onClick={() => startEditComment(c)} title={t("แก้", "Edit")} className="h-7 px-2 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">✏</button>}
                        {canEdit && <button onClick={() => setDelComment(c)} title={t("ลบ", "Delete")} className="h-7 px-2 text-xs border border-rose-200 rounded-lg text-rose-500 hover:bg-rose-50">🗑</button>}
                      </div>
                    </div>
                  )}
                  {openImgCid === c.id && (
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <ImageManager entityType="design_sheet_comment" entityId={c.id} actor={user?.name ?? user?.email ?? undefined} readonly={!canEdit} />
                      <p className="text-[10px] text-slate-300 mt-1">{t("ปิดช่องรูป (กด 🖼 อีกครั้ง) แล้วรูปย่อในแถวจะอัปเดตตาม", "Close the image panel (press 🖼 again) to refresh the thumbnails in the row")}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>}

            {/* แท็บตีราคา (เฟส 4) — สูตรเดียวกับ BOM, วัสดุจาก master /master/design-price-items */}
            {modalTab === "cost" && form.id && <div className="space-y-2">
              {/* ข้อ 7: แท็บย่อยตีราคาแยกตาม Parent SKU (ทั่วไป + รหัสจริง + ร่าง) + ปุ่ม Copy */}
              <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 pb-1">
                {costParentTabs.map((tb) => {
                  const n = costLines.filter((r) => pkey(r.parent_code) === tb.key).length;
                  const active = costParent === tb.key;
                  return (
                    <button key={tb.key || "__gen__"} onClick={() => setCostParent(tb.key)}
                      title={tb.kind === "draft" ? t("ร่าง Parent", "Draft Parent") : tb.kind === "orphan" ? t("Parent นี้ถูกเอาออกจากใบแล้ว (ยังมีบรรทัดค้าง)", "This Parent was removed from the sheet (lines still remain)") : undefined}
                      className={`h-7 px-2.5 text-xs rounded-md inline-flex items-center gap-1 border ${active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"} ${tb.kind === "draft" ? "border-dashed" : ""}`}>
                      {tb.kind === "draft" ? `✎ ${tb.label}` : tb.kind === "orphan" ? `⚠ ${tb.label}` : tb.label}
                      {n > 0 && <span className={`text-[10px] rounded-full px-1 ${active ? "bg-white/25" : "bg-slate-100 text-slate-500"}`}>{n}</span>}
                    </button>
                  );
                })}
                {/* เพิ่ม "เวอร์ชัน" ตีราคา = แท็บใหม่ (ลองราคาอีกแบบ / อีกไซส์) — โหมดดูก็กดได้ */}
                {canEdit && (
                  <button onClick={() => {
                    const n = costParentTabs.filter((tb) => tb.kind === "draft").length + 2;
                    setVerName(t(`เวอร์ชัน ${n}`, `Version ${n}`)); setVerCopy(true); setVerOpen(true);
                  }}
                    title={t("เพิ่มเวอร์ชันตีราคาใหม่ (แท็บใหม่) — คัดลอกจากแท็บที่ดูอยู่ได้", "Add a new costing version (new tab) — can copy from the current tab")}
                    className="ml-auto h-7 px-2.5 text-xs font-medium rounded-md border border-dashed border-blue-300 text-blue-700 bg-white hover:bg-blue-50">
                    {t("＋ เพิ่มเวอร์ชัน", "＋ Add version")}
                  </button>
                )}
              </div>
              {/* โหมดดู: ล็อกเฉพาะ "ช่อง/ปุ่มที่แก้ข้อมูล" (ทำที่ตัวมันเอง) — ห้ามใช้ fieldset disabled ครอบ
                  เพราะ fieldset disabled ล็อกทุกอย่างข้างในรวมของที่ควรใช้ได้ตลอด:
                  จัดกลุ่ม · เรียงลำดับหัวคอลัมน์ · ปุ่มคำนวณผ้า · ค้นหา */}
              <div className="contents space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] text-slate-400 inline-flex items-center gap-1.5">
                  {t("กำลังตีราคาของ:", "Costing for:")} <b className="text-slate-600">{costTabLabel(costParent, generalLabel)}</b>
                  {/* เปลี่ยนชื่อ/ลบ ได้เฉพาะแท็บที่เป็น "ชื่อ" (เวอร์ชัน ✎ / orphan ⚠) — รหัส Parent จริงไปจัดการที่แท็บข้อมูลงาน */}
                  {canEdit && costParent === "" && (
                    <button onClick={() => { setVerRenameName(form.cost_general_label); setVerRename(""); }} disabled={verBusy}
                      title={t("ตั้งชื่อแท็บนี้เอง (เปลี่ยนแค่ชื่อที่แสดง · ว่าง = ทั่วไป)", "Name this tab yourself (display name only · blank = General)")} className="h-5 px-1.5 rounded border border-slate-200 text-[10px] text-slate-500 hover:bg-slate-50 hover:text-blue-700 disabled:opacity-50">{t("✎ เปลี่ยนชื่อ", "✎ Rename")}</button>
                  )}
                  {canEdit && costParent !== "" && (() => {
                    const kind = costParentTabs.find((tb) => tb.key === costParent)?.kind;
                    if (kind === "code") return <span className="text-[10px] text-slate-300" title={t("รหัส Parent SKU จริง — เพิ่ม/เอาออกที่แท็บ ข้อมูลงาน", "Real Parent SKU code — add/remove in the Job info tab")}>{t("(รหัสจริง)", "(real code)")}</span>;
                    return (
                      <>
                        <button onClick={() => { setVerRenameName(costParent); setVerRename(costParent); }} disabled={verBusy}
                          title={t("เปลี่ยนชื่อเวอร์ชันนี้", "Rename this version")} className="h-5 px-1.5 rounded border border-slate-200 text-[10px] text-slate-500 hover:bg-slate-50 hover:text-blue-700 disabled:opacity-50">{t("✎ เปลี่ยนชื่อ", "✎ Rename")}</button>
                        <button onClick={() => setVerDel(costParent)} disabled={verBusy}
                          title={t("ลบเวอร์ชันนี้ทั้งแท็บ", "Delete this whole version tab")} className="h-5 px-1.5 rounded border border-slate-200 text-[10px] text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 disabled:opacity-50">{t("🗑 ลบเวอร์ชัน", "🗑 Delete version")}</button>
                      </>
                    );
                  })()}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                {/* ✏️ ดูได้ 2 แบบ: ตาราง ↔ แบบวาด (เจ้าของขอ 2026-11-09 "เชื่อมกันระหว่างรายการตีราคากับแบบวาด") */}
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("มุมมองตีราคา", "Costing view")}>
                  <button type="button" onClick={() => { setCostView("table"); setBoard(null); }} className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs ${costView === "table" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}><Icon value="i:table" className="text-[13px]" />{t("ตาราง", "Table")}</button>
                  <button type="button" onClick={() => openBoardRef.current(null)} className={`inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs ${costView === "draw" ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}><Icon value="i:vector-bezier" className="text-[13px]" />{t("แบบวาด", "Drawing")}</button>
                </div>
                {/* เครื่องมือตีราคา = เมนูรวมตามประเภท (ของกลาง components/menu-bar · เจ้าของขอ 2026-11-07) —
                    คำสั่งที่แก้ข้อมูลกดตอนดูอย่างเดียวได้ = เข้าโหมดแก้ให้เอง */}
                <MenuBar menus={(() => {
                  const ensureEdit = () => { if (!fullEdit) setEditing(true); };
                  const sources = costParentTabs.filter((tb) => tb.key !== costParent);   // แท็บอื่น = ต้นทางที่คัดลอกมาได้
                  const copyFrom = (source: string) => {
                    // คัดลอก "จาก" source → "มาใส่" แท็บปัจจุบัน (costParent) แทนที่ของเดิมในแท็บนี้
                    const src = costLines.filter((r) => pkey(r.parent_code) === source);
                    if (src.length === 0) { toast.info(t(`"${costTabLabel(source, generalLabel)}" ยังไม่มีบรรทัดให้คัดลอก`, `"${costTabLabel(source, generalLabel)}" has no lines to copy`)); return; }
                    ensureEdit();
                    const cloned = src.map((r, i) => recomputeRow({ ...r, key: `cp${Date.now()}_${i}`, parent_code: costParent || null }));
                    setCostLines((prev) => [...prev.filter((r) => pkey(r.parent_code) !== costParent), ...cloned]);
                    setCostExtraMap((m) => ({ ...m, [costParent]: (m[source] ?? []).map((c) => ({ ...c })) }));
                    setCostDirty(true);
                    toast.success(t(`คัดลอกตีราคาจาก "${costTabLabel(source, generalLabel)}" มาแล้ว (${cloned.length} บรรทัด) — กด บันทึกตีราคา`, `Copied costing from "${costTabLabel(source, generalLabel)}" (${cloned.length} lines) — press Save costing`));
                  };
                  // ล้างหมายเหตุทุกบรรทัดของแท็บที่ดูอยู่ (เช่น "อ้างอิง BOM: …" ที่ดึงมา) — โหมดแก้ไข: ค้างให้กดบันทึก · โหมดดู: บันทึกทันที
                  const noteCount = curLines.filter((r) => (r.note ?? "").trim()).length;
                  const clearNotes = async () => {
                    const ok = await askConfirm({ title: t(`ล้างหมายเหตุ ${noteCount} บรรทัด ในแท็บ "${costTabLabel(costParent, generalLabel)}"?`, `Clear notes on ${noteCount} lines in tab "${costTabLabel(costParent, generalLabel)}"?`),
                      message: t("ช่องหมายเหตุของทุกบรรทัดในแท็บนี้จะว่าง (วัสดุ/ขนาด/ราคา ไม่เปลี่ยน) — แท็บอื่นไม่โดน", "The note on every line in this tab will be cleared (material/size/price unchanged) — other tabs are not affected"), confirmText: t("ล้างหมายเหตุ", "Clear notes"), variant: "danger" });
                    if (!ok) return;
                    quickApply((rows) => rows.map((r) => (pkey(r.parent_code) === costParent && r.note ? { ...r, note: null } : r)));
                    toast.success(fullEdit ? t(`ล้างหมายเหตุ ${noteCount} บรรทัดแล้ว — กด บันทึกตีราคา`, `Cleared notes on ${noteCount} lines — press Save costing`) : t(`ล้างหมายเหตุ ${noteCount} บรรทัดแล้ว`, `Cleared notes on ${noteCount} lines`));
                  };
                  const pull: MenuItem[] = [
                    ...(canEdit && sources.length > 0 ? [{ type: "submenu" as const, key: "copy", icon: "copy", label: t("คัดลอกตีราคาจากแท็บอื่น", "Copy costing from another tab"), width: 240,
                      items: [
                        { type: "section" as const, key: "h", label: t("คัดลอกจากแท็บไหน (มาแทนที่แท็บนี้)", "Copy from which tab (replaces this tab)") },
                        ...sources.map((tb): MenuItem => {
                          const n = costLines.filter((r) => pkey(r.parent_code) === tb.key).length;
                          return { key: tb.key || "__gen__", label: tb.kind === "draft" ? `✎ ${tb.label}` : tb.label, disabled: n === 0,
                            hint: n > 0 ? t(`${n} บรรทัด`, `${n} lines`) : t("ว่าง", "Empty"), onSelect: () => copyFrom(tb.key) };
                        }),
                      ] }] : []),
                    ...(canEdit && form?.id ? [{ key: "other", icon: "file-import", label: t("ดึงจากใบงานอื่น", "Pull from another sheet"),
                      title: t("ดึงวัตถุดิบตีราคาจากใบงานออกแบบอื่น — เลือกแท็บต้นทาง + ติ๊กรายการได้", "Pull costing materials from another design sheet — pick the source tab + tick items"), onSelect: () => setCopyFromOpen(true) }] : []),
                    ...(canEdit ? [{ key: "bom", icon: "hierarchy-2", label: t("ดึงจาก BOM", "Pull from BOM"),
                      title: t("ดึงชนิด/กว้าง/ยาว/จำนวน จากสูตร BOM มาตีราคา (วัสดุ+ราคาเลือกเอง)", "Pull type/width/length/qty from a BOM into costing (choose material + price yourself)"), onSelect: () => { ensureEdit(); setBomPull(true); } }] : []),
                  ];
                  const tools: MenuItem[] = [
                    { key: "fabric", icon: "ruler-measure", label: t("คำนวณผ้า", "Fabric calc"),
                      title: t("คำนวณว่าต้องใช้ผ้ากี่หลา/กี่ผืน จากขนาดชิ้นในตาราง × จำนวนที่ผลิต (ใช้ได้ทั้งโหมดดู)", "Calculate how many yards/sheets of fabric are needed from piece sizes × production qty (works in view mode too)"), onSelect: () => setFabricCalc(true) },
                    ...(form?.id ? [{ key: "pattern", icon: "scissors", label: t("หน้าแพทเทิร์น", "Pattern sheet"),
                      title: t("ชิ้นแพทเทิร์นจากกว้าง×ยาวในตาราง — พิมพ์ขนาดจริง A4 / ดาวน์โหลด DXF / วางบนผ้า", "Pattern pieces from width×length — true-size A4 print / DXF / fabric layout"),
                      onSelect: () => { window.open(`/print/design-sheet/${form.id}/pattern${costParent ? `?parent=${encodeURIComponent(costParent)}` : ""}`, "_blank", "noopener"); } }] : []),
                    ...(canEdit ? [{ key: "mkbom", icon: "sitemap", label: t("สร้างสูตร BOM", "Create BOM"),
                      title: t("ดึงกว้าง/ยาว/จำนวนจากตีราคาไปสร้างสูตรการผลิต (วัตถุดิบใส่ทีหลัง)", "Use width/length/qty from costing to create a production BOM (add materials later)"), onSelect: () => setBomWizard(true) }] : []),
                  ];
                  const manage: MenuItem[] = [
                    ...(canEdit ? [{ key: "pm", icon: "packages", label: t("จัดการวัสดุตีราคา", "Manage costing materials"), onSelect: openPm }] : []),
                    ...(canEdit && noteCount > 0 ? [{ key: "clear", icon: "notes", label: t("ล้างหมายเหตุทุกบรรทัด", "Clear all notes"), hint: noteCount,
                      title: t("ลบข้อความในช่องหมายเหตุของทุกบรรทัดในแท็บนี้", "Clear the note text on every line in this tab"), onSelect: () => void clearNotes() }] : []),
                  ];
                  const menus: MenuDef[] = [
                    { key: "pull", icon: "download", label: t("ดึงข้อมูล", "Import"), width: 230, items: pull },
                    { key: "tools", icon: "tools", label: t("เครื่องมือ", "Tools"), width: 210, items: tools },
                    { key: "manage", icon: "settings", label: t("จัดการ", "Manage"), width: 230, align: "end", items: manage },
                  ];
                  return menus.filter((m) => m.items.length > 0);
                })()} />
                </div>
              </div>
              {priceItems.length === 0 && (
                <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                  {t('ยังไม่มีวัสดุตีราคาในระบบ — กดปุ่ม "🧮 จัดการวัสดุตีราคา" ด้านบน เพิ่มได้เลยไม่ต้องออกจากหน้านี้', 'No costing materials yet — press "🧮 Manage costing materials" above to add them without leaving this page')}
                </div>
              )}

              <div ref={costBoxRef} className={costSide ? "grid items-start gap-3" : "space-y-2"} style={costSide ? { gridTemplateColumns: "minmax(0, 1fr) 240px" } : undefined}>
              <div className="min-w-0 space-y-2">
              {/* แถบสรุป A+B (กดขยายดูรายบรรทัด): ⚠ ราคาวัสดุปรับ · 🔁 เปลี่ยนวัสดุ — ปุ่ม เปลี่ยน/ไม่เปลี่ยน/กลับของเดิม/รับทราบ กดได้เลยไม่ต้องเข้าโหมดแก้ไข (โหมดดู = บันทึกทันที) */}
              {(() => {
                const drifted = curLines.flatMap((r) => {
                  const g = !r.item_id && r.group_code ? priceGroups.find((x) => x.code === r.group_code) ?? null : null;
                  const item = r.item_id ? priceItems.find((x) => x.id === r.item_id) ?? null : null;
                  const d = priceDrift(r, item, g);
                  if (!d) return [];
                  // กด "ไม่เปลี่ยน" แล้ว (จำถาวรใน DB) — เงียบจนกว่าราคาฐานจะเปลี่ยนไปจากที่รับทราบอีกครั้ง
                  if (r.price_ack && Math.abs(r.price_ack.price - d.price) < 0.005) return [];
                  return [{ r, d }];
                });
                const changed = curLines.filter((r) => !!r.prev_item);
                if (!drifted.length && !changed.length) return null;
                const driftTotal = drifted.reduce((s, { r, d }) => s + (d.price - (r.unit_price ?? 0)) * (r.qty ?? 0), 0);
                const changedTotal = changed.reduce((s, r) => s + ((r.amount ?? 0) - (r.prev_item?.amount ?? 0)), 0);
                const signCls = (n: number) => (n > 0 ? "text-rose-700" : n < 0 ? "text-emerald-700" : "");
                const applyPrices = (m: Map<string, number>) =>
                  quickApply((rows) => rows.map((r) => (m.has(r.key) ? recomputeRow({ ...r, unit_price: m.get(r.key) ?? r.unit_price }) : r)));
                const offKeys = (pairs: [string, number][]) => { const m = new Map(pairs); const at = new Date().toISOString();
                  quickApply((rows) => rows.map((r) => (m.has(r.key) ? { ...r, price_ack: { price: m.get(r.key) as number, at } } : r))); };
                const ackKeys = (keys: Set<string>) => quickApply((rows) => rows.map((r) => (keys.has(r.key) ? { ...r, prev_item: null } : r)));
                const restoreKey = (key: string, p: PrevItem) => quickApply((rows) => rows.map((r) => (r.key === key ? recomputeRow({ ...r, ...restorePrevItem(p) }) : r)));
                const hint = !fullEdit && canEdit ? <span className="text-[10px] opacity-70">{t("· กดแล้วบันทึกให้ทันที", "· saves immediately when pressed")}</span> : null;
                const sm = "h-6 rounded px-2 text-[11px] font-medium";
                return (
                  <div className="space-y-1.5 text-xs">
                    {drifted.length > 0 && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
                        <button type="button" onClick={() => setDriftOpen((o) => !o)} className="flex w-full flex-wrap items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-amber-100/60 rounded-lg">
                          <span className="w-3 text-[10px]">{driftOpen ? "▼" : "▶"}</span>
                          <span>{t("⚠ ราคาวัสดุปรับ", "⚠ Material prices changed on")} <b>{drifted.length}</b> {t("บรรทัด — ถ้าใช้ราคาใหม่ ต้นทุนรวม", "lines — with new prices, total cost")} <b className={signCls(driftTotal)}>{fmtSigned(driftTotal)}</b> {t("บาท", "THB")}</span>
                          <span className="ml-auto text-[10px] text-amber-600">{driftOpen ? t("ซ่อน", "Hide") : t("กดดูรายละเอียด", "Show details")}</span>
                        </button>
                        {driftOpen && (
                          <div className="space-y-1 border-t border-amber-200 px-2.5 py-1.5">
                            {drifted.map(({ r, d }) => {
                              const diff = d.price - (r.unit_price ?? 0); const when = fmtShortDate(d.date);
                              return (
                                <div key={r.key} className="flex flex-wrap items-center gap-1.5" title={d.reason}>
                                  <span className="min-w-0 flex-1">
                                    <b>{r.item_name ?? "—"}</b> <span className="tabular-nums">{fmtBaht(r.unit_price)}</span> → <b className="tabular-nums">{fmtBaht(d.price)}</b>
                                    <span className={signCls(diff)}> {fmtSigned(diff)}{t("/หน่วย", "/unit")}{pct(r.unit_price, d.price)}{r.qty != null ? t(` · รวม ${fmtSigned(diff * r.qty)}`, ` · total ${fmtSigned(diff * r.qty)}`) : ""}</span>
                                    {when ? <span className="text-amber-600/80">{t(` · ตั้งแต่ ${when}`, ` · since ${when}`)}</span> : null}
                                  </span>
                                  {canEdit && (
                                    <>
                                      <button type="button" onClick={() => applyPrices(new Map([[r.key, d.price]]))} className={`${sm} bg-amber-600 text-white hover:bg-amber-700`}>{t("เปลี่ยน", "Update")}</button>
                                      <button type="button" onClick={() => offKeys([[r.key, d.price]])} className={`${sm} border border-amber-300 bg-white text-amber-700 hover:bg-amber-100`}>{t("ไม่เปลี่ยน", "Keep")}</button>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                            {canEdit && (
                              <div className="flex flex-wrap items-center gap-1.5 border-t border-amber-200/60 pt-1.5">
                                {drifted.length > 1 && (
                                  <>
                                    <button type="button" onClick={() => applyPrices(new Map(drifted.map(({ r, d }) => [r.key, d.price])))} className={`${sm} bg-amber-600 text-white hover:bg-amber-700`}>{t(`เปลี่ยนทั้งหมด (${drifted.length})`, `Update all (${drifted.length})`)}</button>
                                    <button type="button" onClick={() => offKeys(drifted.map(({ r, d }) => [r.key, d.price]))} className={`${sm} border border-amber-300 bg-white text-amber-700 hover:bg-amber-100`}>{t("ไม่เปลี่ยนทั้งหมด", "Keep all")}</button>
                                  </>
                                )}
                                {hint}
                                <span className="text-[10px] opacity-70">{t('· "ไม่เปลี่ยน" = จำไว้ถาวร จะเตือนอีกเมื่อราคาฐานเปลี่ยนอีกครั้ง', '· "Keep" is remembered — you will be warned again if the base price changes')}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {changed.length > 0 && (
                      <div className="rounded-lg border border-sky-200 bg-sky-50 text-sky-900">
                        <button type="button" onClick={() => setChangedOpen((o) => !o)} className="flex w-full flex-wrap items-center gap-1.5 px-2.5 py-1.5 text-left hover:bg-sky-100/60 rounded-lg">
                          <span className="w-3 text-[10px]">{changedOpen ? "▼" : "▶"}</span>
                          <span>{t("🔁 เปลี่ยนวัสดุ", "🔁 Material changed on")} <b>{changed.length}</b> {t("บรรทัด (ยังไม่รับทราบ) — ต้นทุนต่างจากเดิม", "lines (not acknowledged) — cost difference")} <b className={signCls(changedTotal)}>{fmtSigned(changedTotal)}</b> {t("บาท", "THB")}</span>
                          <span className="ml-auto text-[10px] text-sky-600">{changedOpen ? t("ซ่อน", "Hide") : t("กดดูรายละเอียด", "Show details")}</span>
                        </button>
                        {changedOpen && (
                          <div className="space-y-1 border-t border-sky-200 px-2.5 py-1.5">
                            {changed.map((r) => {
                              const p = r.prev_item as PrevItem;
                              const dUnit = r.unit_price != null && p.unit_price != null ? r.unit_price - p.unit_price : null;
                              const dLine = r.amount != null && p.amount != null ? r.amount - p.amount : null;
                              const when = fmtShortDate(p.changed_at);
                              return (
                                <div key={r.key} className="flex flex-wrap items-center gap-1.5" title={t(`เดิมฐานราคา ${p.price_basis ?? "กรอกเอง"} · ${p.uom ?? ""}`, `Previous price base ${p.price_basis ?? "manual"} · ${p.uom ?? ""}`)}>
                                  <span className="min-w-0 flex-1">
                                    {t("เดิม:", "Was:")} <b>{p.item_name ?? "—"}</b> <span className="tabular-nums">{fmtBaht(p.unit_price)}</span> → <b>{r.item_name ?? "—"}</b> <span className="tabular-nums">{fmtBaht(r.unit_price)}</span>
                                    {dUnit != null && <span className={signCls(dUnit)}> ({fmtSigned(dUnit)}{t("/หน่วย", "/unit")}{pct(p.unit_price, r.unit_price)}{dLine != null ? t(` · รวม ${fmtSigned(dLine)}`, ` · total ${fmtSigned(dLine)}`) : ""})</span>}
                                    {when ? <span className="text-sky-700/70"> · {when}</span> : null}
                                  </span>
                                  {canEdit && (
                                    <>
                                      <button type="button" onClick={() => restoreKey(r.key, p)} className={`${sm} border border-sky-300 bg-white text-sky-800 hover:bg-sky-100`}>{t("↶ กลับของเดิม", "↶ Revert")}</button>
                                      <button type="button" onClick={() => ackKeys(new Set([r.key]))} className={`${sm} bg-sky-600 text-white hover:bg-sky-700`}>{t("✓ รับทราบ", "✓ Acknowledge")}</button>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                            {canEdit && (
                              <div className="flex flex-wrap items-center gap-1.5 border-t border-sky-200/60 pt-1.5">
                                {changed.length > 1 && <button type="button" onClick={() => ackKeys(new Set(changed.map((r) => r.key)))} className={`${sm} bg-sky-600 text-white hover:bg-sky-700`}>{t(`✓ รับทราบทั้งหมด (${changed.length})`, `✓ Acknowledge all (${changed.length})`)}</button>}
                                {hint}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* จำนวนที่สั่ง — ใส่ครั้งเดียว ใช้ทุกที่ของแท็บนี้ (หารจำนวนสั่ง · ค่าตัดทั้งล็อต · ต้นทุนทั้งล็อต) */}
              <OrderQtyBar qty={orderQty} fromQuote={orderQtyFromQuote} quoteQtys={quoteQtyChips} readOnly={!canEdit}
                perUnit={grandTotal} splitPerUnit={costExtra.reduce((s, c) => s + (c.mode === "split" ? Number(c.amount) || 0 : 0), 0)}
                cutPiecesPerUnit={cutLaborSummary(cutRows).pieces} onChange={setOrderQty} />

              {costView === "draw" && board ? (
                <PatternStudio key={`board-${costParent}-${board.nonce}`} readonly={!canEdit}
                  initial={board.initial} initialRefs={board.refs} initialBasis={board.basis} initialSel={board.sel}
                  materials={priceItems.map((p) => ({ id: p.id, name: p.name, sub: p.group_name }))}
                  refPicker={form.id ? (pick) => <SheetImagePicker sheetId={form.id!} usedKeys={new Set<string>()} onPick={(im) => pick({ url: im.url, label: im.source_label })} /> : undefined}
                  onChange={applyBoard}
                  footerNote={<span className="text-slate-400">{t("แก้บนกระดาน = ตารางเปลี่ยนตามทันที · กด บันทึกตีราคา เพื่อเก็บ", "Edits here update the table instantly · press Save costing to keep")}{board.skipped > 0 ? t(` · ${board.skipped} บรรทัดไม่มีกว้าง×ยาว (อะไหล่/สาย) ดูในตาราง`, ` · ${board.skipped} lines without width×length (parts/tapes) are in the table`) : ""}</span>} />
              ) : (
              <LineItemsGrid<CostRow>
                variant="lines"
                rows={curLines}
                columns={costCols}
                onChange={(rows) => {
                  // เก็บบรรทัดของ Parent อื่นไว้ + แทนที่เฉพาะของ Parent ที่กำลังดู
                  const others = costLines.filter((r) => pkey(r.parent_code) !== costParent);
                  setCostLines([...others, ...rows.map(recomputeRow)]); setCostDirty(true);
                }}
                rowId={(r) => r.key}
                readonly={!fullEdit}
                dense={!fullEdit}
                rowClassName={(r) => (isZeroCostRow(r) ? "bg-rose-50 hover:bg-rose-100/70" : undefined)}
                // ดับเบิลคลิกแถวตอนดูอย่างเดียว → เข้าโหมดแก้ไข (เหมือนกด ✏️) แล้วเคอร์เซอร์ไปช่องที่คลิก (เจ้าของขอ 2026-11-03)
                onRequestEdit={canEdit ? () => setEditing(true) : undefined}
                groupByOptions={[{ key: "group", label: t("ชนิดวัสดุ", "Material type") }, { key: "item", label: t("วัสดุ", "Material") }, { key: "uom", label: t("หน่วย", "Unit") }]}
                groupNote={(rows) => {
                  // ใช้ต่อใบ (เจ้าของขอ 2026-10-26) — ผ้า/แผ่นที่คิดเป็น cm² → แปลงเป็นกี่ผืน จากขนาดผืนในทะเบียนวัสดุตีราคา (lib/cost-usage)
                  const u = costUsagePerUnit(rows.map((r) => ({ item_id: r.item_id, group_name: r.group_name, qty: r.qty, uom: r.uom, piece: rowIsPiece(r) })), (id) => priceItemById.get(id));
                  const parts: string[] = [];
                  if (u.sheets) parts.push(`${u.sheets.qty.toFixed(2)} ${u.sheets.unit}${u.sheets.size ? t(` (${u.sheets.unit}ละ ${u.sheets.size} ซม.)`, ` (${u.sheets.size} cm per ${u.sheets.unit})`) : ""}`);
                  for (const b of u.byUom) parts.push(`${fmtQty(Math.round(b.qty * 1000) / 1000)} ${b.uom}`);
                  const missing = priceItemById.size > 0 ? u.missingSize : 0;   // รายการวัสดุยังไม่โหลด = ไม่เตือน
                  if (!parts.length && !missing) return null;
                  const sheetHow = u.sheets
                    ? (() => {
                        const sh = u.sheets;
                        const area = fmtQty(Math.round(sh.area * 100) / 100);
                        const div = sh.size ? t(`พื้นที่${sh.unit} ${sh.size} ซม.`, `${sh.unit} area ${sh.size} cm`) : t(`พื้นที่${sh.unit}ของแต่ละวัสดุ`, `${sh.unit} area of each material`);
                        return t(`พื้นที่ที่ใช้รวม ${area} cm² (รวมเผื่อเสียแล้ว) ÷ ${div} = ${sh.qty.toFixed(2)} ${sh.unit}ต่อใบ · ประมาณจากพื้นที่ ยังไม่รวมการวางแบบจริง`, `Total area used ${area} cm² (incl. waste) ÷ ${div} = ${sh.qty.toFixed(2)} ${sh.unit} per sheet · area estimate, not actual nesting`);
                      })()
                    : undefined;
                  return (
                    <span className="text-emerald-700" title={sheetHow}>
                      {parts.length > 0 && <>{t("· ใช้ต่อใบ ≈", "· Per sheet ≈")} <span className="font-semibold tabular-nums">{parts.join(" + ")}</span></>}
                      {u.sheets?.perSheet ? <span className="text-slate-500">{t(` · 1 ${u.sheets.unit} ทำได้ ~${u.sheets.perSheet} ใบ`, ` · 1 ${u.sheets.unit} makes ~${u.sheets.perSheet} sheets`)}</span> : null}
                      {missing > 0 && <span className="text-amber-600">{t(` · ${missing} บรรทัดคิดเป็นผืนไม่ได้ (วัสดุไม่มีขนาดผืนในทะเบียนวัสดุตีราคา)`, ` · ${missing} lines can't be converted to sheets (material has no sheet size in the costing materials register)`)}</span>}
                    </span>
                  );
                }}
                onAdd={newCostRow}
                addLabel={t("＋ เพิ่มวัตถุดิบ", "＋ Add material")}
                addExtra={<button type="button" onClick={() => openBoardRef.current(null)} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-800"
                  title={t("วาดชิ้นวัสดุ (สี่เหลี่ยม วงกลม ปากกา) หรือก๊อปจาก Illustrator มาวาง → ได้บรรทัดใหม่พร้อมกว้าง×ยาว", "Draw pieces (rectangle, circle, pen) or paste from Illustrator → new lines with width×length")}>
                  <Icon value="i:vector-bezier" className="text-[14px]" />{t("วาดชิ้นวัสดุ", "Draw pieces")}</button>}
                emptyText={t("ยังไม่มีวัตถุดิบในรายการตีราคา", "No materials in the costing list yet")}
                // โหมดดูอย่างเดียว: ให้กด "เพิ่มวัตถุดิบ" ได้เลย (เข้าโหมดแก้ไข + เพิ่มบรรทัดให้ในคลิกเดียว)
                emptyAction={canEdit ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    {!fullEdit && <button type="button" onClick={() => { setEditing(true); addCostRow(); }}
                      className="h-9 px-4 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600">{t("＋ เพิ่มวัตถุดิบ", "＋ Add material")}</button>}
                    <button type="button" onClick={() => setCopyFromOpen(true)}
                      className="h-9 px-4 text-sm font-medium border border-blue-300 text-blue-700 bg-white rounded-lg hover:bg-blue-50">{t("📄 ดึงจากใบงานอื่น", "📄 Pull from another sheet")}</button>
                    <button type="button" onClick={() => openBoardRef.current(null)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"><Icon value="i:vector-bezier" className="text-[15px]" />{t("วาดชิ้นวัสดุ", "Draw pieces")}</button>
                  </div>
                ) : null}
                onDuplicate={(r) => recomputeRow({ ...r, key: `d${Date.now()}_${Math.round(Math.random() * 1e6)}`, shape: r.shape ? { ...r.shape, pid: undefined } : r.shape })}
                selectable={fullEdit}
                bulkBar={(sel, clear) => {
                  const keys = new Set(sel.map((r) => r.key));
                  // ตั้งวัสดุให้ทุกแถวที่เลือก — คงขนาด/จำนวนเดิม คำนวณ ชนิด/ปริมาณ/ราคา ใหม่ (คงการเลือกไว้ให้เห็นผล)
                  const applyBulkItem = (it: PriceItem) => {
                    setCostLines((prev) => prev.map((r) => (keys.has(r.key) ? recomputeRow({ ...r, ...withPrevItem(r, costItemPatch(it, r)) }) : r)));
                    setCostDirty(true);
                    toast.success(t(`ตั้งวัสดุ "${it.name}" ให้ ${keys.size} บรรทัดแล้ว`, `Set material "${it.name}" on ${keys.size} lines`));
                  };
                  return (
                    <>
                      <div className="w-56">
                        <SearchableSelect value="" placeholder={t("🧰 ตั้งวัสดุให้ที่เลือก…", "🧰 Set material for selected…")}
                          options={priceItems.map((p) => ({ value: p.id, label: p.name, sub: p.group_name ?? undefined }))}
                          onChange={(val) => { const it = priceItems.find((p) => p.id === val); if (it) applyBulkItem(it); }}
                          onCreate={(q) => void createPriceItemInline(q, applyBulkItem)} createLabel={t("เพิ่มวัสดุใหม่", "Add new material")} />
                      </div>
                      <button type="button"
                        onClick={() => {
                          if (!window.confirm(t(`ลบ ${keys.size} บรรทัดที่เลือก?`, `Delete ${keys.size} selected lines?`))) return;
                          setCostLines((prev) => prev.filter((r) => !keys.has(r.key)));
                          setCostDirty(true); clear();
                          toast.success(t(`ลบ ${keys.size} บรรทัดแล้ว`, `Deleted ${keys.size} lines`));
                        }}
                        className="h-8 px-3 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50">{t(`🗑 ลบที่เลือก (${sel.length})`, `🗑 Delete selected (${sel.length})`)}</button>
                    </>
                  );
                }}
              />
              )}


              {/* ค่าใช้จ่ายเพิ่ม (ค่าแรง/โสหุ้ย/อื่นๆ) — เพิ่ม/ลบ/ตั้งชื่อเองได้ */}
              <div className="border border-slate-200 rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-600">{t("💼 ค่าใช้จ่ายเพิ่ม (นอกจากวัสดุ)", "💼 Additional costs (besides materials)")}</span>
                  {/* จำนวนที่สั่ง — โผล่เมื่อมีรายการแบบ "หารจำนวนสั่ง" (ค่าบล็อก/แม่พิมพ์) */}
                  {hasSplitExtra && (
                    <span className="ml-auto text-xs text-slate-500" title={t("ใช้หารรายการแบบ “หารจำนวนสั่ง” (เช่น ค่าบล็อกสกรีน) — แก้ที่แถบ “จำนวนที่สั่ง” ด้านบน", "Divides “÷ order qty” items — change it in the Order qty bar above")}>
                      {t("หารด้วยจำนวนที่สั่ง", "Divided by order qty")} <b className="tabular-nums text-slate-700">{orderQty != null ? orderQty.toLocaleString("th-TH") : "—"}</b> {t("ใบ (แก้ที่แถบด้านบน)", "(edit in the bar above)")}
                    </span>
                  )}
                  {/* ต้นทุนอื่นๆ: ติ๊กเลือกจากรายการกลาง · ราคากลาง: ตั้งค่า/แก้ (เจ้าของขอ 2026-11-07) */}
                  {canEdit && canSeeCost && (
                    <OtherCostPicker presets={presetsApi.presets} onManage={canEditPresets ? () => setPresetsOpen("other") : undefined}
                      onAdd={(items) => {
                        if (!fullEdit) setEditing(true);
                        setCurExtra((l) => [...l, ...items.map((p) => (p.mode === "split"
                          ? cleanExtra({ label: p.label ?? "", kind: "other", mode: "split", total: p.amount, split_qty: orderQty })
                          : cleanExtra({ label: p.label ?? "", kind: "other", amount: p.amount })))]);
                        setCostDirty(true);
                      }} />
                  )}
                  {canEditPresets && (
                    <button type="button" onClick={() => setPresetsOpen(null)} title={t("ตั้งค่าราคากลาง (ใช้ร่วมทุกใบงาน)", "Central price settings (shared by all sheets)")}
                      className="inline-flex h-7 items-center gap-1 px-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"><Icon value="i:settings" className="text-[13px]" /> {t("ราคากลาง", "Central prices")}</button>
                  )}
                  {canEdit && <button onClick={() => { if (!fullEdit) setEditing(true); setCurExtra((l) => [...l, { label: "", amount: 0 }]); setCostDirty(true); }}
                    className="h-7 px-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">{t("＋ เพิ่มรายการ", "＋ Add item")}</button>}
                </div>
                {costExtra.length === 0 && <p className="text-xs text-slate-300">{t("— ยังไม่มีรายการ —", "— No items yet —")}</p>}
                {/* โหมดดู (บันทึกแล้ว) = แถวตัวอักษรเรียบ กระชับ · ดับเบิลคลิกเพื่อแก้ (เจ้าของขอ 2026-11-07) */}
                {!fullEdit && costExtra.length > 0 && (
                  <div className="divide-y divide-slate-100 rounded-lg border border-slate-100" onDoubleClick={canEdit ? () => setEditing(true) : undefined}
                    title={canEdit ? t("ดับเบิลคลิกเพื่อแก้", "Double-click to edit") : undefined}>
                    {costExtra.map((c, i) => {
                      // แบบ A (เจ้าของเลือก 2026-11-09): แถวเดียว + สรุปสั้น · กดเพื่อกางรายละเอียด
                      const k = extraKindOf(c);
                      const okey = `${costParent}|${i}`, opened = extraOpen.has(okey);
                      const toggleOpen = () => setExtraOpen((s) => { const n = new Set(s); if (n.has(okey)) n.delete(okey); else n.add(okey); return n; });
                      let sub: string | null = null;
                      let det: ReactNode = null;
                      // ยอดที่คิดได้ตอนนี้ (ราคาตัด/ราคากลาง/จำนวนสั่งอาจเปลี่ยนหลังบันทึก) — ไม่ตรงกับยอดในใบ = ให้กดอัปเดต
                      const liveAmt: number | null = k === "labor_cut" && c.cut_by === "pieces" && presetsApi.loaded && priceItems.length > 0 ? cutTotal
                        : k === "overhead" && c.oh && presetsApi.loaded ? overheadTotal(overheadRows(c.oh, presetsApi.presets, orderQty)) : null;
                      const stale = liveAmt != null && Math.abs(liveAmt - (c.amount || 0)) > 0.005;
                      if (k === "labor_cut" && c.cut_by === "pieces") {
                        const s = cutLaborSummary(cutRows);
                        sub = t(`${s.pieces} ชิ้น/ใบ`, `${s.pieces} pcs/unit`) + (s.byMaterial.length ? ` · ${s.byMaterial.map((m) => `${m.name} ${m.pieces}`).join(" · ")}` : "");
                        det = (
                          <div className="space-y-0.5">
                            {groupCutRows(cutRows).filter((g) => g.on !== "none").map((g) => (
                              <div key={g.key} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{g.name}</span><span className="text-slate-400 tabular-nums">{g.pieces} × {g.rate != null ? fmtBaht(g.rate) : t("หลายราคา", "mixed")}</span><span className="w-16 text-right tabular-nums text-slate-700">{fmtBaht(g.amount)}</span></div>
                            ))}
                            {orderQty ? <div className="text-slate-400">{t(`สั่ง ${orderQty.toLocaleString("th-TH")} ใบ = ${Math.round(s.pieces * orderQty).toLocaleString("th-TH")} ชิ้นงานตัด · ค่าตัดทั้งล็อต ${Math.round(s.total * orderQty).toLocaleString("th-TH")} ฿`, `${orderQty} units = ${Math.round(s.pieces * orderQty)} pcs to cut`)}</div> : null}
                          </div>
                        );
                      } else if (k === "overhead" && presetsApi.presets.length > 0) {
                        const cfg: OverheadCfg = c.oh ?? DEFAULT_OH;
                        const d = cfg.dims;
                        if (c.oh && d.w && d.l) {
                          const bag = pickBag(d, presetsOf(presetsApi.presets, "bag"))?.bag;
                          const ship = overheadRows(cfg, presetsApi.presets, orderQty).find((r) => r.key === "ship");
                          const opt = ship?.cartons?.find((o) => o.preset.id === ship.carton);
                          sub = [`${d.w}×${d.l}×${d.t ?? "?"}`, bag ? t(`ถุง ${bag.w_cm}×${bag.l_cm}`, `bag ${bag.w_cm}×${bag.l_cm}`) : null, opt && orderQty ? t(`${opt.cartons.toLocaleString("th-TH")} ลัง`, `${opt.cartons} cartons`) : null].filter(Boolean).join(" · ");
                        } else sub = c.oh ? t("ยังไม่ใส่ขนาดสินค้า", "No product size yet") : t("ใส่ยอดเอง — กดเพื่อแยกตามขนาดสินค้า", "Manual — click to break down by size");
                        det = (
                          <OverheadBreakdown cfg={cfg} presets={presetsApi.presets} tabLabel={costTabLabel(costParent, generalLabel)} readOnly={!canEdit}
                            qty={orderQty} suggestions={packSugg}
                            onChange={(next, total) => { updExtra(i, { kind: "overhead", oh: next, amount: total }); setEditing(true); }}
                            onManage={canEditPresets ? () => setPresetsOpen("oh_fixed") : undefined} />
                        );
                      } else if (c.mode === "split") {
                        sub = c.split_qty ? `${fmtBaht(c.total ?? 0)} ÷ ${c.split_qty.toLocaleString("th-TH")}` : t("หารจำนวนสั่ง — ยังไม่ใส่จำนวน", "÷ order qty — no qty yet");
                        det = c.split_qty ? <div>{t(`จ่ายครั้งเดียว ${fmtBaht(c.total ?? 0)} บาท ÷ สั่ง ${c.split_qty.toLocaleString("th-TH")} ใบ = ${fmtBaht(c.amount)} บาท/ใบ`, `One-off ${fmtBaht(c.total ?? 0)} ÷ ${c.split_qty} = ${fmtBaht(c.amount)}/unit`)}{c.note ? <div className="text-slate-400">{c.note}</div> : null}</div> : null;
                      } else if (c.note) {
                        sub = c.note;
                        det = <div className="whitespace-pre-wrap">{c.note}</div>;
                      }
                      // ไม่มีรายละเอียด → บอกว่าใส่ได้ที่ไหน (ทุกแถวกดขยายได้เหมือนกัน)
                      if (!det) det = (
                        <div className="text-slate-400">
                          {k === "labor" ? t("ใส่ยอดเอง — ตอนแก้กด “ดูเคยผลิต” เพื่อเลือกจากสินค้าที่เคยผลิต (จดอ้างอิงให้)", "Manual — when editing, use “past production” to pick a reference")
                            : k === "labor_cut" ? t("ใส่ยอดเอง — ตอนแก้กด “ตามจำนวนชิ้น” ให้คิดจากชิ้นวัตถุดิบ × ค่าตัด", "Manual — when editing, switch to “by pieces”")
                            : k === "other" ? t("ยังไม่มีรายการ — ตอนแก้กด “เลือกต้นทุนอื่นๆ” หรือเพิ่มรายการ", "No items — when editing, pick from other costs")
                            : t("ยังไม่มีรายละเอียด", "No details")}
                          {canEdit && <> · <button type="button" onClick={() => setEditing(true)} className="text-blue-600 underline">{t("แก้", "Edit")}</button></>}
                        </div>
                      );
                      return (
                        <div key={i}>
                          <div className={`flex items-center gap-1.5 px-2 py-1 text-[13px] ${det ? "cursor-pointer hover:bg-slate-50" : ""}`} onClick={det ? toggleOpen : undefined}
                            role={det ? "button" : undefined} aria-expanded={det ? opened : undefined} tabIndex={det ? 0 : undefined}
                            onKeyDown={det ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleOpen(); } } : undefined}>
                            <Icon value={opened ? "i:chevron-down" : "i:chevron-right"} className={`shrink-0 text-[12px] ${det ? "text-slate-400" : "invisible"}`} />
                            <span className="shrink-0 text-slate-600">{c.label || "—"}</span>
                            {sub && <span className="min-w-0 flex-1 truncate text-[11px] text-slate-400" title={sub}>{sub}</span>}
                            {stale && liveAmt != null && (canEdit ? (
                              <button type="button" onClick={(e) => { e.stopPropagation(); updExtra(i, { amount: liveAmt }); setEditing(true); }}
                                title={t(`ยอดในใบ ${fmtBaht(c.amount || 0)} ยังเป็นของเดิม — คิดใหม่ได้ ${fmtBaht(liveAmt)} (กดแล้วกดบันทึกตีราคา)`, `Saved ${fmtBaht(c.amount || 0)} is outdated — recalculated ${fmtBaht(liveAmt)}`)}
                                className="ml-auto shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800 hover:bg-amber-100">
                                {t(`คิดใหม่ได้ ${fmtBaht(liveAmt)} · อัปเดต`, `Recalc ${fmtBaht(liveAmt)} · update`)}
                              </button>
                            ) : <span className="ml-auto shrink-0 text-[11px] text-amber-700">{t(`คิดใหม่ได้ ${fmtBaht(liveAmt)}`, `Recalc ${fmtBaht(liveAmt)}`)}</span>)}
                            <span className={`${stale ? "line-through decoration-amber-500" : "ml-auto"} shrink-0 tabular-nums ${c.amount ? "text-slate-800" : "text-slate-300"}`}>{fmtBaht(c.amount || 0)}</span>
                          </div>
                          {opened && det && <div className="border-t border-slate-100 bg-slate-50/60 px-2 py-1.5 pl-6 text-[12px] text-slate-600" onDoubleClick={(e) => e.stopPropagation()}>{det}</div>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {fullEdit && costExtra.map((c, i) => {
                  const split = c.mode === "split";
                  return (
                  <div key={i} className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <input value={c.label} disabled={!canEdit} placeholder={split ? t("ชื่อรายการ เช่น ค่าบล็อกสกรีน", "Item name, e.g. screen block") : t("ชื่อรายการ เช่น ค่าแรงผลิต", "Item name, e.g. production labor")}
                      onChange={(e) => { setCurExtra((l) => l.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x))); setCostDirty(true); }}
                      className="flex-1 min-w-0 h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
                    {/* ตัวช่วยตามชนิด: ค่าแรงผลิต = ดูที่เคยผลิต · ค่าแรงตัด = ใส่ราคากลาง · โสหุ้ย = แยกรายการ (lib/design-cost-presets) */}
                    {canEdit && canSeeCost && (() => {
                      const k = extraKindOf(c);
                      if (k === "labor") return (
                        <LaborRefPicker sheetId={form?.id} onPick={(r) => updExtra(i, { kind: "labor", amount: r.amount,
                          note: `${t("อ้างอิง", "Ref")} ${r.code}${r.name && r.name !== r.code ? ` ${r.name}` : ""} · ${fmtBaht(r.amount)} (${r.source === "wo" ? t("จ่ายจริง", "actual paid") : r.source === "ds" ? t("ใบงาน", "sheet") : t("สูตรผลิต", "BOM")})` })} />
                      );
                      if (k === "labor_cut") {
                        const cp = presetsOf(presetsApi.presets, "labor_cut")[0];
                        const byPieces = c.cut_by === "pieces";
                        const piecesBtn = (
                          <button type="button" onClick={() => updExtra(i, byPieces ? { cut_by: null } : { kind: "labor_cut", cut_by: "pieces", amount: cutTotal, note: null })}
                            title={byPieces ? t("กลับไปใส่ยอดเอง / ราคากลางต่อใบ", "Back to manual / flat price") : t("คิดจากจำนวนชิ้นวัตถุดิบที่ไม่ใช่อะไหล่ × ราคาตัดต่อชิ้น", "Pieces of non-hardware materials × cut rate per piece")}
                            className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs ${byPieces ? "border-slate-200 bg-white text-slate-500 hover:bg-slate-50" : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"}`}>
                            <Icon value={byPieces ? "i:pencil" : "i:scissors"} className="text-[13px]" /> {byPieces ? t("ใส่ยอดเอง", "Manual") : t("ตามจำนวนชิ้น", "By pieces")}
                          </button>
                        );
                        if (byPieces) return piecesBtn;
                        return cp ? (<>
                          <button type="button" onClick={() => updExtra(i, { kind: "labor_cut", amount: cp.amount, note: null })} title={t("ใส่ราคากลางค่าแรงตัด/ปลอก/วาด", "Use the central price")}
                            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 text-xs text-blue-700 hover:bg-blue-100"><Icon value="i:arrow-forward-up" className="text-[13px]" /> {t("ราคากลาง", "Central")} {fmtBaht(cp.amount)}</button>
                          {piecesBtn}</>
                        ) : (<>
                          {canEditPresets && <button type="button" onClick={() => setPresetsOpen("labor_cut")} className="h-8 shrink-0 rounded-lg border border-dashed border-slate-300 px-2 text-xs text-slate-500 hover:bg-slate-50">{t("ตั้งราคากลาง", "Set central price")}</button>}
                          {piecesBtn}</>);
                      }
                      if (k === "overhead") return (
                        <button type="button" onClick={() => (c.oh
                          ? updExtra(i, { oh: null })
                          : updExtra(i, { kind: "overhead", oh: DEFAULT_OH, amount: overheadTotal(overheadRows(DEFAULT_OH, presetsApi.presets, orderQty)) }))}
                          title={c.oh ? t("กลับไปใส่ยอดเอง", "Back to manual amount") : t("แยกรายการ QC / แพ็ก / ถุง / กล่อง / ค่าส่ง จากขนาดสินค้า", "Break down QC / packing / bag / box / shipping from product size")}
                          className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs ${c.oh ? "border-slate-200 bg-white text-slate-500 hover:bg-slate-50" : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"}`}>
                          <Icon value={c.oh ? "i:pencil" : "i:list"} className="text-[13px]" /> {c.oh ? t("ใส่ยอดเอง", "Manual") : t("แยกรายการ", "Break down")}
                        </button>
                      );
                      return null;
                    })()}
                    {/* คิดแบบ: ต่อชิ้น (เดิม) / หารจำนวนสั่ง (จ่ายครั้งเดียวต่อการสั่ง เช่น ค่าบล็อก) — โสหุ้ยแบบแยกรายการไม่ใช้ */}
                    <div role="group" aria-label={t("คิดแบบ", "Charge as")} className={`${(extraKindOf(c) === "overhead" && c.oh) || (extraKindOf(c) === "labor_cut" && c.cut_by === "pieces") ? "hidden" : "inline-flex"} shrink-0 border border-slate-200 rounded-lg overflow-hidden text-xs`}>
                      {([false, true] as const).map((sp) => (
                        <button key={String(sp)} type="button" aria-pressed={split === sp} disabled={!canEdit}
                          onClick={() => { if (split !== sp) setExtraMode(i, sp); }}
                          title={sp ? t("จ่ายครั้งเดียวต่อการสั่ง (เช่น ค่าบล็อกสกรีน) → ระบบหารจำนวนที่สั่งให้", "Paid once per order (e.g. screen block) → divided by order qty") : t("ใส่ยอดต่อชิ้น", "Amount per piece")}
                          className={`h-8 px-2 whitespace-nowrap ${split === sp ? "bg-blue-50 text-blue-700 font-medium" : "bg-white text-slate-500 hover:bg-slate-50"} disabled:cursor-default`}>
                          {sp ? t("หารจำนวนสั่ง", "÷ Order qty") : t("ต่อชิ้น", "Per pc")}
                        </button>
                      ))}
                    </div>
                    <input type="number" min={0} step="any" value={(split ? c.total : c.amount) || ""} disabled={!canEdit || (extraKindOf(c) === "overhead" && !!c.oh) || (extraKindOf(c) === "labor_cut" && c.cut_by === "pieces")} placeholder="0.00"
                      title={split ? t("ยอดรวม (จ่ายครั้งเดียว)", "Total (paid once)") : t("ยอดต่อชิ้น", "Amount per piece")}
                      onChange={(e) => { const v = Number(e.target.value) || 0; setCurExtra((l) => l.map((x, xi) => (xi !== i ? x : split ? cleanExtra({ ...x, total: v }) : { ...x, amount: v }))); setCostDirty(true); }}
                      className="w-28 h-8 px-2 text-sm text-right tabular-nums border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50" />
                    <span className="text-xs text-slate-400">{t("บาท", "THB")}</span>
                    {canEdit && <button onClick={() => { setCurExtra((l) => l.filter((_, xi) => xi !== i)); setCostDirty(true); }}
                      title={t("ลบ", "Delete")} className="h-7 w-7 shrink-0 inline-flex items-center justify-center text-rose-500 border border-rose-200 rounded-lg hover:bg-rose-50">🗑</button>}
                  </div>
                  {split && (c.split_qty
                    ? <p className="pl-1 text-[11px] text-blue-600 tabular-nums">{t(`${fmtBaht(c.total ?? 0)} บาท ÷ ${c.split_qty.toLocaleString("th-TH")} ชิ้น = ${fmtBaht(c.amount)} บาทต่อชิ้น (จ่ายครั้งเดียวต่อการสั่ง)`, `${fmtBaht(c.total ?? 0)} THB ÷ ${c.split_qty.toLocaleString("en-US")} pcs = ${fmtBaht(c.amount)} THB per piece (paid once per order)`)}</p>
                    : <p className="pl-1 text-[11px] text-amber-600">{t("ใส่ “จำนวนที่สั่ง” ด้านบนก่อน — ตอนนี้ยังไม่ได้รวมในต้นทุน", "Enter the “Order qty” above first — not included in the cost yet")}</p>)}
                  {c.note && <p className="pl-1 text-[11px] text-slate-500">{c.note}</p>}
                  {extraKindOf(c) === "labor_cut" && c.cut_by === "pieces" && (
                    <CutLaborBreakdown rows={cutRows} orderQty={orderQty} onOrderQty={canEdit ? setOrderQty : undefined} readOnly={!canEdit}
                      onToggle={(keys, count) => setLineCut(keys, { cut_skip: count == null ? null : !count })}
                      onOverride={(keys, rate) => setLineCut(keys, { cut_rate: rate })}
                      onSaveMaterial={canEdit ? (itemId, rate, keys) => void saveMaterialCutRate(itemId, rate, keys) : undefined}
                      onManageMaterials={canEdit ? openPm : undefined}
                      onManageCentral={canEditPresets ? () => setPresetsOpen("cut_rate") : undefined} />
                  )}
                  {extraKindOf(c) === "overhead" && c.oh && (() => {
                    const live = presetsApi.loaded ? overheadTotal(overheadRows(c.oh, presetsApi.presets, orderQty)) : c.amount;
                    return (
                      <>
                        <OverheadBreakdown cfg={c.oh} presets={presetsApi.presets} tabLabel={costTabLabel(costParent, generalLabel)} readOnly={!canEdit}
                          qty={orderQty} suggestions={packSugg}
                          onChange={(cfg, total) => updExtra(i, { kind: "overhead", oh: cfg, amount: total })}
                          onManage={canEditPresets ? () => setPresetsOpen("oh_fixed") : undefined} />
                        {/* ราคากลางเปลี่ยนหลังใส่ไปแล้ว — ยอดในใบยังเป็นของเดิม (ไม่เปลี่ยนเอง) จนกว่าจะกดอัปเดต */}
                        {Math.abs(live - (c.amount || 0)) > 0.005 && (
                          <button type="button" onClick={() => updExtra(i, { amount: live })} className="ml-1 text-[11px] text-amber-700 underline">
                            {t(`ราคากลางเปลี่ยน — ยอดในใบ ${fmtBaht(c.amount || 0)} · กดอัปเดตเป็น ${fmtBaht(live)}`, `Central prices changed — update ${fmtBaht(c.amount || 0)} → ${fmtBaht(live)}`)}
                          </button>
                        )}
                      </>
                    );
                  })()}
                  </div>
                  );
                })}
              </div>

              </div>
              {/* การ์ดสรุปต้นทุน — จอกว้าง: ติดขวา (เลื่อนตารางแล้วยังเห็น) · จอแคบ: ใต้ตาราง */}
              {costSide && <aside className="sticky top-0 self-start">{costSummaryCard}</aside>}
              </div>
              {!costSide && costSummaryCard}

              {/* 🛒 Section: คำนวณจากซัพพลายเออร์ (สินค้าสั่งจากร้าน — ราคา+ค่าส่งตามคิว → กำไร → แบ่งกำไร) */}
              {form?.id && (
                <SupplierQuoteSection sheetId={form.id} parentCode={costParent} parentTabs={costParentTabs} reloadKey={supplierReload}
                  canEdit={fullEdit} canSeeCost={canSeeCost}
                  pushToast={(type, m) => (type === "error" ? toast.error(m) : type === "info" ? toast.info(m) : toast.success(m))}
                  onDirtyChange={setSupplierDirty} saveRef={supplierSaveRef}
                  onRequestEdit={() => setEditing(true)}
                  onSendToQuote={(lines) => {
                    if (!lines.length) { toast.error(t("ยังไม่มีรายการที่ใส่ราคาที่จะเสนอ", "No items with an offered price yet")); return; }
                    if (supplierDirty) { toast.error(t("มีรายการที่ยังไม่บันทึก — กด 💾 บันทึก ก่อนส่งไปใบเสนอราคา", "Unsaved items — press 💾 Save before sending to a quotation")); return; }
                    setQuoteBatch(lines); setToQuote(true);
                  }} />
              )}

              {/* แถบยอดรวม + ปุ่ม ติดล่าง — เฉพาะจอแคบ (จอกว้างมีการ์ดสรุปติดขวาที่มีปุ่มแล้ว) */}
              {!costSide && (
              <div className="sticky bottom-0 z-10 -mx-1 px-1 py-2 bg-white/95 backdrop-blur-sm border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-slate-600">{t("ต้นทุนสินค้า:", "Product cost:")} <b className="text-base text-emerald-700">{fmtBaht(grandTotal)}</b> {t("บาท", "THB")}
                  {costDirty && <span className="ml-2 text-[11px] text-amber-600">{t("● มีแก้ไขที่ยังไม่บันทึก", "● Unsaved changes")}</span>}
                  {costZeroCount > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-rose-600"><Icon value="i:alert-triangle" className="text-[12px]" />{t(`${costZeroCount} บรรทัดยังไม่มียอด (รวม = 0)`, `${costZeroCount} lines have no amount (total = 0)`)}</span>
                  )}
                </div>
                {fullEdit && <div className="flex gap-1.5">{costActions("row")}</div>}
              </div>
              )}
              </div>
            </div>}

            {/* แท็บรอบเสนอราคา (เฟส 3) */}
            {modalTab === "quotes" && form.id && (
              <>
              {/* ใบเสนอราคาของงานนี้ (ระบบขาย) ทุกเวอร์ชัน + ไม่ผ่าน/เปิดใบใหม่แทน — components/design-sheet-detail/sheet-quotations.tsx */}
              <SheetQuotations sheetId={form.id} canEdit={canEdit} refreshKey={cartRefresh} cartId={cartId}
                onUseAsCart={(qid) => { setCart(qid); bumpCart(); }} onChanged={bumpCart}
                onSend={canEdit ? () => setToQuote(true) : undefined} />
              {/* รอบเสนอราคาแบบ 1 ครั้ง = 1 การ์ด (ไซส์ × ขั้นจำนวน) — components/design-sheet-detail/quote-rounds.tsx */}
              <QuoteRounds sheetId={form.id} quotes={quotes} sizes={costParentTabs.map((tb) => ({ key: tb.key, label: tb.label }))} sizeLabel={quoteSizeLabel}
                currentCost={totalForParent} orderQtyFor={orderQtyFor} canEdit={canEdit} costDirty={costDirty} saveCost={saveCost} pricingHelper={canSeeCost}
                onReload={() => loadCq(form.id!)}
                onOpenVersions={(a, b, parent) => { setVersionsInit({ a, b, parent }); setVersionsOpen(true); }}
                onSendToQuotation={canEdit ? () => setToQuote(true) : undefined} />
              </>
            )}
            </div>
          </div>
        )}
      </ERPModal>

      {/* 🕘 เวอร์ชันตีราคา (ข้อ C) — เทียบเวอร์ชันที่เคยบันทึกกับปัจจุบัน / ใช้เวอร์ชันเก่ากลับมา */}
      {form?.id && (
        <CostVersionsModal open={versionsOpen} onClose={() => setVersionsOpen(false)} sheetId={form.id}
          initialA={versionsInit?.a ?? null} initialB={versionsInit?.b ?? null}
          parentKey={versionsInit?.parent ?? costParent} parentLabel={costTabLabel(versionsInit?.parent ?? costParent, generalLabel)}
          currentLines={costLines as SnapLine[]} currentExtra={costExtraMap} canEdit={canEdit}
          onRestore={(lines: SnapLine[], extra: SnapExtra[]) => {
            // ใส่บรรทัดของเวอร์ชันนั้นแทนของ Parent ที่ดูอยู่ (ยังไม่ลง DB — ต้องกด 💾 บันทึกตีราคา)
            const ts = Date.now();
            const rows: CostRow[] = lines.map((l, i) => ({ ...normalizeSnapLine(l), key: `v${ts}_${i}`, parent_code: costParent || null, sort_order: i + 1 } as CostRow));
            setCostLines((prev) => [...prev.filter((r) => pkey(r.parent_code) !== costParent), ...rows]);
            setCostExtraMap((m) => ({ ...m, [costParent]: extra.map(cleanExtra) }));
            setCostDirty(true); if (!editing) setEditing(true);
            setVersionsOpen(false);
            toast.success(t(`ใส่เวอร์ชันที่เลือกกลับเข้าตารางแล้ว (${rows.length} บรรทัด) — กด 💾 บันทึกตีราคา เพื่อยืนยัน`, `Selected version loaded into the table (${rows.length} lines) — press 💾 Save costing to confirm`));
          }} />
      )}
      <ConfirmDialog open={delComment !== null} onClose={() => setDelComment(null)} onConfirm={doDeleteComment}
        title={t("ลบ comment", "Delete comment")} variant="danger" confirmText={t("ลบ", "Delete")} cancelText={t("ยกเลิก", "Cancel")}
        message={t(`ลบ comment วันที่ ${delComment ? formatDate(delComment.comment_date) : ""} หรือไม่? รูปประกอบของ comment นี้จะถูกลบออกจาก R2 ด้วย`, `Delete the comment dated ${delComment ? formatDate(delComment.comment_date) : ""}? Its images will also be removed from R2.`)} />

{/* จัดการสถานะงาน (โซนบนกระดาน) — เปิดจากปุ่มบนหน้า Canvas */}
      <WorkflowStatusManager open={statusMgr} onClose={() => setStatusMgr(false)}
        entityType="design_sheet" actor={user?.email ?? null} onChanged={reloadStatuses} customerOnlyOption />

      {/* Wizard สร้าง Parent SKU + SKU ลูก จากใบงาน */}
        {presentOpen && form?.id && <DesignSheetPresentPanel sheetId={form.id} open={presentOpen} onClose={() => setPresentOpen(false)} />}
        {presetsOpen !== false && (
          <CostPresetsManager open api={presetsApi} initialKind={presetsOpen || null} onClose={() => setPresetsOpen(false)} materials={priceItems} onMaterialRate={setMaterialCutRate} />
        )}
        {planOpen && form?.id && (
          <AddToPlanModal open defaultTitle={`${form.code ? `${form.code} ` : ""}${form.name}`.trim()}
            source={{ label: form.code || form.name, href: `/master/design-dashboard?open=${encodeURIComponent(form.id)}` }} onClose={() => setPlanOpen(false)} />
        )}
        {orderSeed && form?.id && (
          <OrderBatchEntryModal open seedLines={orderSeed} title={`ลงออเดอร์จากใบงาน ${form.code}`} onClose={() => setOrderSeed(null)}
            brand={form.brand_id ? { id: form.brand_id, name: brands.find((b) => b.id === form.brand_id)?.name ?? null } : null} />
        )}
      {form?.id && (
        <SkuWizard open={skuWizard} onClose={() => setSkuWizard(false)}
          sheetId={form.id} sheetName={form.name} brandId={form.brand_id || null}
          parentCodeOptions={form.parent_sku_codes} parentCodeDefault={form.parent_sku_codes[0] || ""} defaultPrice={offeredPrice}
          onDone={() => { patch({ status: "sku_created" }); refresh(); if (form.id) void reloadLinkedSkus(form.id); }} />
      )}

      {/* Wizard ดึงตีราคา (แท็บที่กำลังดู) → สร้างสูตร BOM (วัตถุดิบใส่ทีหลัง) */}
      <BomFromCostWizard open={bomWizard} onClose={() => setBomWizard(false)}
        tabLabel={costTabLabel(costParent, generalLabel)}
        lines={curLines.map((r) => ({
          item_name: r.item_name, group_name: r.group_name,
          width_cm: r.width_cm, length_cm: r.length_cm, pieces: r.pieces,
          face_width_cm: r.face_width_cm, waste_percent: r.waste_percent, qty: r.qty, uom: r.uom,
        }))} />

      {/* 🧵 คำนวณจำนวนผ้า — จำลองวางชิ้นบนหน้าผ้า (ดูได้ทั้งโหมดดู/แก้ไข ไม่แก้ข้อมูล) */}
      {fabricCalc && (
        <FabricCalcModal onClose={() => setFabricCalc(false)}
          lines={curLines.map((r) => ({
            key: r.key, item_id: r.item_id, item_name: r.item_name,
            width_cm: r.width_cm, length_cm: r.length_cm, pieces: r.pieces,
            face_width_cm: r.face_width_cm, waste_percent: r.waste_percent, uom: r.uom,
          }))} />
      )}

      {/* Wizard คู่กลับ: ดึงโครงจาก BOM (ชนิด/กว้าง/ยาว/จำนวน) → ต่อท้ายบรรทัดตีราคาแท็บที่กำลังดู (วัสดุ+ราคาเลือกเอง) */}
      {form?.id && (
        <BomToCostWizard open={bomPull} onClose={() => setBomPull(false)} sheetId={form.id}
          tabLabel={costTabLabel(costParent, generalLabel)}
          onApply={(pulled: BomPulledLine[], srcLabel) => {
            if (pulled.length === 0) return;
            const rows = pulled.map((p, i) => recomputeRow({
              key: `bp${Date.now()}_${i}`,
              parent_code: costParent || null,
              item_id: null, item_name: null,
              group_name: p.material_type, group_code: null,
              calc_method: null,
              width_cm: p.width_cm, length_cm: p.length_cm, pieces: p.pieces,
              face_width_cm: p.face_width_cm, waste_percent: p.waste_percent, divisor: null,
              qty: null, uom: p.uom, unit_price: null, amount: null,
              note: p.ref_name ? `${BOM_REF_NOTE_PREFIX}${p.ref_name}` : null,
              sort_order: costLines.length + i + 1,
            } as CostRow));
            setCostLines((prev) => [...prev, ...rows]);
            setCostDirty(true);
            toast.success(t(`ดึงจาก BOM ${srcLabel} มา ${rows.length} บรรทัด — เลือกวัสดุ/ใส่ราคาต่อได้เลย`, `Pulled ${rows.length} lines from BOM ${srcLabel} — now pick materials/enter prices`));
          }} />
      )}

      {/* เพิ่มเวอร์ชันตีราคา = แท็บใหม่ (เก็บชื่อไว้ใน "ร่าง Parent" ของใบงาน) */}
      <ERPModal open={verOpen} onClose={() => setVerOpen(false)} size="sm"
        title={t("➕ เพิ่มเวอร์ชันตีราคา", "➕ Add costing version")}
        description={t("สร้างแท็บตีราคาใหม่ไว้ลองราคาอีกแบบ (คนละสูตร/คนละไซส์) โดยไม่ทับของเดิม", "Create a new costing tab to try another pricing (different formula/size) without overwriting the original")}
        footer={
          <div className="flex w-full justify-end gap-2">
            <button onClick={() => setVerOpen(false)} className="h-9 px-4 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
            <button
              onClick={() => {
                const name = verName.trim();
                if (!name) { toast.error(t("ตั้งชื่อเวอร์ชันก่อน", "Enter a version name first")); return; }
                const exists = costParentTabs.some((tb) => tb.key === name) || name === "";
                if (exists) { toast.error(t(`มีแท็บชื่อ "${name}" อยู่แล้ว`, `A tab named "${name}" already exists`)); return; }
                if (!fullEdit) setEditing(true);
                // ชื่อเวอร์ชันเก็บเป็น "ร่าง Parent" (แท็บโชว์ด้วยเส้นประ ✎) — บันทึกพร้อมตีราคา
                setForm((f) => (f ? { ...f, parent_sku_drafts: [...f.parent_sku_drafts, name] } : f));
                if (verCopy) {
                  const src = costLines.filter((r) => pkey(r.parent_code) === costParent);
                  if (src.length) {
                    const cloned = src.map((r, i) => recomputeRow({ ...r, key: `v${Date.now()}_${i}`, id: undefined, parent_code: name }));
                    setCostLines((prev) => [...prev, ...cloned]);
                  }
                  setCostExtraMap((m) => ({ ...m, [name]: (m[costParent] ?? []).map((c) => ({ ...c })) }));
                  setCostDirty(true);
                  toast.success(t(`เพิ่มเวอร์ชัน "${name}" + คัดลอก ${src.length} บรรทัดจาก "${costTabLabel(costParent, generalLabel)}" แล้ว`, `Added version "${name}" + copied ${src.length} lines from "${costTabLabel(costParent, generalLabel)}"`));
                } else {
                  setCostDirty(true);
                  toast.success(t(`เพิ่มเวอร์ชัน "${name}" แล้ว — เริ่มใส่วัตถุดิบได้เลย`, `Added version "${name}" — start adding materials`));
                }
                setCostParent(name);
                setVerOpen(false);
              }}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">{t("สร้างเวอร์ชัน", "Create version")}</button>
          </div>
        }>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-slate-500">{t("ชื่อเวอร์ชัน *", "Version name *")}</span>
            <input value={verName} onChange={(e) => setVerName(e.target.value)} autoFocus
              placeholder={t("เช่น เวอร์ชัน 2 · ผ้าถูกลง · ไซส์ L", "e.g. Version 2 · cheaper fabric · size L")}
              className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-2">
            <input type="checkbox" checked={verCopy} onChange={(e) => setVerCopy(e.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600" />
            <span className="text-[13px] leading-snug text-slate-700">
              {t("คัดลอกรายการจากแท็บ", "Copy items from tab")} <b>{costTabLabel(costParent, generalLabel)}</b> {t("มาตั้งต้น", "as a starting point")}
              <span className="block text-[11px] text-slate-400">
                {costLines.filter((r) => pkey(r.parent_code) === costParent).length} {t("บรรทัด + ค่าใช้จ่ายเพิ่ม — ก๊อปมาแล้วแก้ตัวเลขต่อได้เลย", "lines + additional costs — copy, then edit the numbers")}
              </span>
            </span>
          </label>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            {t("💡 อย่าลืมกด", "💡 Remember to press")} <b>{t("บันทึกตีราคา", "Save costing")}</b> {t("หลังแก้เสร็จ — เวอร์ชันใหม่จะถูกบันทึกไปพร้อมกัน", "when done — the new version is saved along with it")}
          </p>
        </div>
      </ERPModal>

      {/* เปลี่ยนชื่อเวอร์ชันตีราคา — เซิร์ฟเวอร์เปลี่ยน parent_code ให้ครบทุกตาราง (บันทึกทันที ไม่ต้องกดบันทึกตีราคาซ้ำ) */}
      <ERPModal open={verRename !== null} onClose={() => { if (!verBusy) setVerRename(null); }} size="sm"
        title={verRename === "" ? t("✎ เปลี่ยนชื่อแท็บ", "✎ Rename tab") : t("✎ เปลี่ยนชื่อเวอร์ชัน", "✎ Rename version")}
        description={verRename === ""
          ? t(`ตั้งชื่อแท็บ "${generalLabel}" ใหม่ — เปลี่ยนแค่ชื่อที่แสดง (แท็บ / รอบเสนอราคา / ใบพิมพ์เห็นชื่อใหม่) · เว้นว่าง = กลับเป็น "ทั่วไป"`, `Rename tab "${generalLabel}" — display name only (tab / quote rounds / printouts show the new name) · leave blank = back to "General"`)
          : t(`เปลี่ยนชื่อแท็บ "${verRename ?? ""}" — บรรทัดวัสดุ / ตีราคาสั่งจากร้าน / รอบเสนอราคา ของแท็บนี้จะย้ายตามชื่อใหม่ทั้งหมด`, `Rename tab "${verRename ?? ""}" — this tab's material lines / supplier costing / quote rounds all move to the new name`)}
        footer={
          <div className="flex w-full justify-end gap-2">
            <button onClick={() => setVerRename(null)} disabled={verBusy} className="h-9 px-4 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">{t("ยกเลิก", "Cancel")}</button>
            <button disabled={verBusy} onClick={() => void doRename()}
              className="h-9 px-4 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{verBusy ? t("กำลังเปลี่ยน…", "Renaming…") : t("เปลี่ยนชื่อ", "Rename")}</button>
          </div>
        }>
        <label className="block">
          <span className="text-xs text-slate-500">{verRename === "" ? t("ชื่อแท็บ (ว่าง = ทั่วไป)", "Tab name (blank = General)") : t("ชื่อใหม่ *", "New name *")}</span>
          <input value={verRenameName} placeholder={verRename === "" ? t("ทั่วไป", "General") : undefined} onChange={(e) => setVerRenameName(e.target.value)} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter" && !verBusy) void doRename(); }}
            className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        {verRename !== "" && (costDirty || supplierDirty) && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            {t("💡 มีข้อมูลที่ยังไม่บันทึก — ระบบจะ", "💡 There are unsaved changes — the system will ")}<b>{t("บันทึกให้ก่อน", "save them first")}</b>{t("แล้วค่อยเปลี่ยนชื่อ", " and then rename")}
          </p>
        )}
      </ERPModal>

      {/* ลบเวอร์ชันตีราคา — ลบบรรทัดวัสดุ + สั่งจากร้าน + ค่าใช้จ่ายเพิ่ม + แบ่งกำไร ของแท็บนี้ (รอบเสนอราคาเก็บไว้เป็นประวัติ) */}
      <ConfirmDialog open={verDel !== null} onClose={() => { if (!verBusy) setVerDel(null); }}
        onConfirm={async () => { if (verDel != null && (await versionOp("delete", verDel))) setVerDel(null); }}
        title={t("ลบเวอร์ชันตีราคา", "Delete costing version")} variant="danger" loading={verBusy}
        confirmText={t("ลบเวอร์ชัน", "Delete version")} cancelText={t("ยกเลิก", "Cancel")}
        message={(() => {
          const delN = costLines.filter((r) => pkey(r.parent_code) === (verDel ?? "")).length;
          const unsaved = (costDirty || supplierDirty) ? t("\n\n💡 มีข้อมูลที่ยังไม่บันทึก — ระบบจะบันทึกให้ก่อนแล้วค่อยลบ", "\n\n💡 There are unsaved changes — the system will save them first, then delete") : "";
          return t(`ต้องการลบเวอร์ชัน "${verDel ?? ""}" ทั้งแท็บหรือไม่?\n\nจะลบ: บรรทัดวัสดุ ${delN} บรรทัด + ตีราคาสั่งจากร้าน + ค่าใช้จ่ายเพิ่ม + แบ่งกำไร ของแท็บนี้ (ลบแล้วกู้คืนไม่ได้)\nรอบเสนอราคาที่เคยส่งจากแท็บนี้ยังเก็บไว้เป็นประวัติ${unsaved}`, `Delete the whole version "${verDel ?? ""}" tab?\n\nThis deletes: ${delN} material lines + supplier costing + additional costs + profit split for this tab (cannot be undone)\nQuote rounds already sent from this tab are kept as history${unsaved}`);
        })()} />

      {/* ส่งสินค้าไปใบเสนอราคา (ระบบขาย) — หย่อนเข้าตะกร้า หรือเริ่มใบใหม่ */}
      {form?.id && (
        <ToQuotationModal open={toQuote} onClose={() => { setToQuote(false); setQuoteBatch(null); }}
          sheetId={form.id} sheetName={form.name} defaultPrice={offeredPrice}
          presetLines={quoteBatch ?? undefined}
          quotes={quoteBatch ? undefined : quotes} sizeLabel={quoteSizeLabel}
          cartId={cartId} cartLabel={cartLabel} onCartSet={setCart} onAdded={bumpCart} />
      )}

      {/* ตะกร้าใบเสนอราคา (drawer ขอบขวา) — โผล่เมื่อมีรายการในตะกร้า */}
      <QuotationCartDrawer cartId={cartId} refreshKey={cartRefresh} onClear={clearCart} onLabel={setCartLabel} sheetId={form?.id ?? null} />

      {/* เตือนก่อนปิด เมื่อมีข้อมูลยังไม่บันทึก (กระดาน/ตีราคา) — 3 ทางเลือก */}
      {/* เลือกแคมเปญปลายทาง (ของกลาง) → ไปกระดานนั้นพร้อมวางการ์ดใบงานนี้ */}
      <CampaignBoardPicker open={boardPick} onClose={() => setBoardPick(false)} sheetIds={form?.id ? [form.id] : []} />

      <ERPModal open={closeConfirm} onClose={() => !closeSaving && setCloseConfirm(false)} size="sm" title={t("ยังไม่ได้บันทึก", "Not saved yet")}
        footer={<>
          <button onClick={() => setCloseConfirm(false)} disabled={closeSaving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">{t("อยู่ต่อ", "Stay")}</button>
          <button onClick={discardAndClose} disabled={closeSaving} className="h-9 px-4 text-sm border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 disabled:opacity-50">{t("ออกโดยไม่บันทึก", "Leave without saving")}</button>
          <button onClick={() => void saveAndClose()} disabled={closeSaving} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{closeSaving ? t("กำลังบันทึก...", "Saving...") : t("บันทึกแล้วปิด", "Save and close")}</button>
        </>}>
        <p className="text-sm text-slate-600">
          {noticeDirty && !specDirty && !costDirty && !supplierDirty
            ? t("มีใบแจ้งลูกค้าที่ยังไม่ได้บันทึก — ต้องการบันทึกก่อนปิดหรือไม่?", "There is an unsaved customer notice — save before closing?")
            : specDirty && !costDirty && !supplierDirty
            ? t("มีรายละเอียดงาน (รูป/หมุดวัตถุดิบ) ที่ยังไม่ได้บันทึก — ต้องการบันทึกก่อนปิดหรือไม่?", "There are unsaved job details (images/material pins) — save before closing?")
            : t("มีข้อมูลตีราคาที่ยังไม่ได้บันทึก — ต้องการบันทึกก่อนปิดหรือไม่?", "There is unsaved costing data — save before closing?")}
        </p>
      </ERPModal>

      {/* ป๊อปเพิ่มแบรนด์ใหม่ (ปุ่ม ＋ ข้าง dropdown แบรนด์) */}
      <ERPModal open={brandModal} onClose={() => !brandSaving && setBrandModal(false)} size="sm" title={t("เพิ่มแบรนด์ใหม่", "Add new brand")}
        footer={<>
          <button onClick={() => setBrandModal(false)} disabled={brandSaving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={() => void addBrand()} disabled={brandSaving} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{brandSaving ? t("กำลังบันทึก...", "Saving...") : t("เพิ่มแบรนด์", "Add brand")}</button>
        </>}>
        <div className="space-y-2">
          <label className="block">
            <span className="text-[11px] text-slate-500">{t("ชื่อแบรนด์ *", "Brand name *")}</span>
            <input value={newBrandName} onChange={(e) => setNewBrandName(e.target.value)} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") void addBrand(); }} placeholder={t("เช่น Good Goods", "e.g. Good Goods")}
              className="w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="block">
            <span className="text-[11px] text-slate-500">{t("สีประจำแบรนด์ (ใช้กับกรอบการ์ด + หัวโซน Canvas)", "Brand color (used for card frame + Canvas zone header)")}</span>
            <input type="color" value={newBrandColor} onChange={(e) => setNewBrandColor(e.target.value)}
              className="block w-16 h-8 mt-0.5 border border-slate-200 rounded-lg cursor-pointer" />
          </label>
        </div>
      </ERPModal>

      {/* เลือก SKU ผูกกับวัสดุตีราคาแถวที่กดในตารางจัดการวัสดุตีราคา */}
      <SkuMultiPickerModal open={pmLinkFor !== null} onClose={() => setPmLinkFor(null)}
        excludeIds={pmLinkFor ? (pmLinks[pmLinkFor.id] ?? []) : []} onConfirm={onPmLinkPicked} />

      {/* ป๊อปจัดการวัสดุตีราคา — CRUD ผ่าน API กลาง master-v2 (เหมือนหน้า /master/design-price-items) */}
      {/* คัดลอกตีราคาจากใบงานอื่น (ข้ามใบ) → มาใส่แท็บที่กำลังดู */}
      {form?.id && (
        <PullCostFromSheetModal open={copyFromOpen} excludeId={form.id} targetLabel={costTabLabel(costParent, generalLabel)} targetCount={curLines.length}
          onClose={() => setCopyFromOpen(false)}
          onApply={(srcLines, srcExtra, mode, label) => {
            const stamp = Date.now();
            // เป็นบรรทัดใหม่ของใบนี้: ไม่เอา id / ประวัติเปลี่ยนวัสดุ / การรับทราบราคา ของใบต้นทางมาด้วย
            const cloned = srcLines.map((r, i) => recomputeRow({ ...(r as CostRow), id: undefined, key: `cx${stamp}_${i}`, parent_code: costParent || null, prev_item: null, price_ack: null }));
            setCostLines((prev) => (mode === "replace" ? [...prev.filter((r) => pkey(r.parent_code) !== costParent), ...cloned] : [...prev, ...cloned]));
            if (srcExtra) setCostExtraMap((m) => ({ ...m, [costParent]: srcExtra.map((c) => ({ ...c })) }));
            if (!fullEdit) setEditing(true);   // ดึงมาแล้วตรวจ/แก้ต่อ แล้วกดบันทึกเอง (เหมือนปุ่ม ＋ เพิ่มวัตถุดิบ)
            setCostDirty(true); setCopyFromOpen(false);
            toast.success(t(`ดึงจาก "${label}" มา ${cloned.length} บรรทัด${srcExtra ? " + ค่าใช้จ่ายเพิ่ม" : ""} — ตรวจแล้วกด 💾 บันทึกตีราคา`, `Pulled ${cloned.length} lines from "${label}"${srcExtra ? " + additional costs" : ""} — review, then press 💾 Save costing`));
          }} />
      )}

      <ERPModal open={pmOpen} onClose={closePm} size="lg" title={t("🧮 จัดการวัสดุตีราคา", "🧮 Manage costing materials")}
        footer={<button onClick={closePm} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">{t("ปิด (รายการวัสดุในตารางจะอัปเดตเอง)", "Close (the material list in the table updates itself)")}</button>}>
        <div className="space-y-2">
          {/* เปิดมาจากปุ่ม "ใส่รายละเอียด" ในแถว — บอกว่ากำลังแก้ตัวไหน + บันทึกแล้วเติมให้แถวเอง */}
          {pmForItem && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <Icon name="edit" className="mt-0.5 shrink-0" />
              <span>{t(`กำลังใส่รายละเอียด "${pmRows.find((x) => x.id === pmForItem)?.name ?? pmSearch}" — เลือกชนิด ใส่ราคา/หน่วย แล้วกด ✓ ระบบจะเติมให้แถวในตารางตีราคาเอง`,
                `Adding details for "${pmRows.find((x) => x.id === pmForItem)?.name ?? pmSearch}" — choose a type, enter price/unit, then press ✓ and the costing line fills itself`)}</span>
            </div>
          )}
          <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
            <div className="flex flex-wrap gap-1.5 items-center">
              <input value={pmName} onChange={(e) => setPmName(e.target.value)} placeholder={t("ชื่อวัสดุ เช่น ผ้าแคนวาส *", "Material name, e.g. canvas fabric *")}
                onKeyDown={(e) => { if (e.key === "Enter") void pmAdd(); }}
                className="flex-1 min-w-[150px] h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <select value={pmGroup} onChange={(e) => {
                  const gid = e.target.value; setPmGroup(gid);
                  const g = mgOf(gid); const piece = isPieceGroup(g?.code, g?.name);
                  if (piece) { setPmFace(""); }                                   // ชนิดชิ้น → ขนาดแผ่น ไม่ใช้หน้ากว้าง/หน่วย
                  else { setPmWidth(""); setPmLength("");
                    if (g?.uom_default && !pmUom.trim()) setPmUom(g.uom_default); // เติมหน่วยให้ถ้ายังว่าง
                    if (g && g.calc_method !== "area_face") setPmFace(""); }
                }}
                className="h-8 px-2 text-sm border border-slate-200 rounded-lg w-36">
                <option value="">{t("— ชนิด —", "— Type —")}</option>
                {mgList.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <input type="number" min={0} step="any" value={pmPrice} onChange={(e) => setPmPrice(e.target.value)} placeholder={groupUsesPiece(pmGroup) ? t("ราคา/แผ่น", "Price/sheet") : t("ราคา/หน่วย", "Price/unit")}
                className="h-8 px-2 w-24 text-sm text-right border border-slate-200 rounded-lg" />
              {/* ค่าตัด/ปลอก/วาด ต่อชิ้น — ตัดยากตั้งสูง ตัดง่ายตั้งต่ำ · ว่าง = ใช้ราคากลาง */}
              <input type="number" min={0} step="any" value={pmCut} onChange={(e) => setPmCut(e.target.value)} placeholder={t("ค่าตัด/ชิ้น", "Cut/pc")}
                title={t("ค่าแรงตัด/ปลอก/วาด ต่อ 1 ชิ้นของวัสดุนี้ (ว่าง = ใช้ราคากลาง)", "Cut/skive/mark labor per piece of this material (blank = central price)")}
                className="h-8 px-2 w-24 text-sm text-right border border-slate-200 rounded-lg" />
              {/* ชนิดชิ้นไม่ต้องกรอกหน่วย (เป็น cm² อัตโนมัติ) */}
              {!groupUsesPiece(pmGroup) && (
                <input value={pmUom} onChange={(e) => setPmUom(e.target.value)} placeholder={t("หน่วย", "Unit")}
                  className="h-8 px-2 w-20 text-sm border border-slate-200 rounded-lg" />
              )}
              {/* ผ้าม้วน → หน้ากว้าง · ชนิดชิ้น → ขนาดแผ่น กว้าง+ยาว (โชว์พื้นที่ + ราคา/cm²) */}
              {groupUsesFace(pmGroup) && (
                <input type="number" min={0} step="any" value={pmFace} onChange={(e) => setPmFace(e.target.value)} placeholder={t("หน้ากว้าง", "Roll width")}
                  className="h-8 px-2 w-24 text-sm text-right border border-slate-200 rounded-lg" />
              )}
              {groupUsesPiece(pmGroup) && (<>
                <input type="number" min={0} step="any" value={pmWidth} onChange={(e) => setPmWidth(e.target.value)} placeholder={t("กว้างแผ่น(ซม.)", "Sheet width (cm)")}
                  className="h-8 px-2 w-24 text-sm text-right border border-slate-200 rounded-lg" />
                <span className="text-slate-400 text-xs">×</span>
                <input type="number" min={0} step="any" value={pmLength} onChange={(e) => setPmLength(e.target.value)} placeholder={t("ยาวแผ่น(ซม.)", "Sheet length (cm)")}
                  className="h-8 px-2 w-24 text-sm text-right border border-slate-200 rounded-lg" />
                {pmWidth && pmLength && (() => {
                  const area = Math.round(Number(pmWidth) * Number(pmLength) * 100) / 100;
                  const perCm2 = pmPrice && area ? Math.round((Number(pmPrice) / area) * 1e6) / 1e6 : null;
                  return <span className="text-[11px] text-violet-600 whitespace-nowrap">= {fmtQty(area)} cm²{perCm2 != null ? t(` · ${perCm2} บ./cm²`, ` · ${perCm2} THB/cm²`) : ""}</span>;
                })()}
              </>)}
              <button onClick={() => void pmAdd()} disabled={pmSaving}
                className="h-8 px-3 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{pmSaving ? "..." : t("＋ เพิ่ม", "＋ Add")}</button>
            </div>
            {pmGroup && <p className="text-[11px] text-slate-500 px-0.5">💡 {groupHint(pmGroup)}</p>}
          </div>

          {pmRows.length > 0 && (
            <input value={pmSearch} onChange={(e) => setPmSearch(e.target.value)} placeholder={t("ค้นหาวัสดุ (ชื่อ/ชนิด)...", "Search materials (name/type)...")}
              className="w-full h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          )}
          {pmLoading ? <div className="py-8 text-center text-sm text-slate-300">{t("กำลังโหลด...", "Loading...")}</div>
            : pmRows.length === 0 ? <div className="py-8 text-center text-sm text-slate-300">{t("— ยังไม่มีวัสดุ เพิ่มจากแถวด้านบน —", "— No materials yet, add from the row above —")}</div>
            : pmShown.length === 0 ? <div className="py-8 text-center text-sm text-slate-300">{t("ไม่พบวัสดุที่ค้นหา", "No matching materials")}</div>
            : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500">
                    {([["name", t("ชื่อวัสดุ", "Material name"), "text-left"], ["group", t("ชนิด", "Type"), "text-center w-32"], ["price", t("ราคา/หน่วย", "Price/unit"), "text-right w-28"]] as const).map(([k, label, cls]) => (
                      <th key={k} className={`border border-slate-200 px-2 py-1.5 cursor-pointer hover:bg-slate-100 select-none ${cls}`} onClick={() => pmToggleSort(k)}>
                        {label}{pmSort.key === k ? (pmSort.dir === "asc" ? " ▲" : " ▼") : ""}
                      </th>
                    ))}
                    <th className="border border-slate-200 px-2 py-1.5 w-20">{t("หน่วย", "Unit")}</th>
                    <th className="border border-slate-200 px-2 py-1.5 w-32 text-right">{t("หน้ากว้าง / ขนาดชิ้น", "Roll width / piece size")}</th>
                    <th className="border border-slate-200 px-2 py-1.5 w-24 text-right" title={t("ค่าตัด/ปลอก/วาด ต่อชิ้น (ว่าง = ราคากลาง)", "Cut labor per piece (blank = central)")}>{t("ค่าตัด/ชิ้น", "Cut/pc")}</th>
                    <th className="border border-slate-200 px-2 py-1.5 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {pmShown.map((r) => {
                    const editing = pmEditId === r.id;
                    return (
                      <tr key={r.id}>
                        <td className="border border-slate-200 px-2 py-1">
                          {editing ? <input value={pmEdit.name} onChange={(e) => setPmEdit({ ...pmEdit, name: e.target.value })} className="w-full h-7 px-1 text-sm border border-slate-200 rounded" />
                            : (<>
                              <span className="text-slate-700">{r.name}</span>
                              <LinkedSkuChips ids={pmLinks[r.id] ?? []}
                                codeOf={(sid) => pmLinkSkus[sid]?.code ?? sid.slice(0, 6)}
                                onRemove={(sid) => void savePmLink(r.id, (pmLinks[r.id] ?? []).filter((x) => x !== sid))} />
                            </>)}
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-center">
                          {editing ? (
                            <select value={pmEdit.material_group_id} onChange={(e) => {
                                const gid = e.target.value; const g = mgOf(gid); const piece = isPieceGroup(g?.code, g?.name);
                                setPmEdit((p) => ({ ...p, material_group_id: gid,
                                  uom: p.uom.trim() ? p.uom : (g?.uom_default ?? ""),                          // เติมหน่วยถ้ายังว่าง
                                  face: piece || (g && g.calc_method !== "area_face") ? "" : p.face,           // ชนิดชิ้น/ไม่ใช้ → เคลียร์หน้ากว้าง
                                  width: piece ? p.width : "", length: piece ? p.length : "" }));               // ไม่ใช่ชนิดชิ้น → เคลียร์กว้างยาว
                              }} className="w-full h-7 px-1 text-xs border border-slate-200 rounded">
                              <option value="">{t("— ชนิด —", "— Type —")}</option>
                              {mgList.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                          ) : <span className="text-xs text-slate-500">{mgName(r.material_group_id)}</span>}
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-right tabular-nums">
                          {editing ? <input type="number" min={0} step="any" value={pmEdit.price} onChange={(e) => setPmEdit({ ...pmEdit, price: e.target.value })} className="w-full h-7 px-1 text-sm text-right border border-slate-200 rounded" />
                            : (r.price_per_unit != null ? Number(r.price_per_unit).toLocaleString("th-TH", { minimumFractionDigits: 2 }) : "—")}
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-center">
                          {editing ? <input value={pmEdit.uom} onChange={(e) => setPmEdit({ ...pmEdit, uom: e.target.value })} className="w-full h-7 px-1 text-sm border border-slate-200 rounded" />
                            : <span className="text-slate-500">{r.uom ?? "—"}</span>}
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-right tabular-nums">
                          {editing
                            ? (groupUsesPiece(pmEdit.material_group_id)
                                ? <span className="inline-flex items-center gap-0.5 justify-end">
                                    <input type="number" min={0} step="any" value={pmEdit.width} onChange={(e) => setPmEdit({ ...pmEdit, width: e.target.value })} placeholder={t("ก", "W")} className="w-12 h-7 px-1 text-sm text-right border border-slate-200 rounded" />
                                    <span className="text-slate-400 text-xs">×</span>
                                    <input type="number" min={0} step="any" value={pmEdit.length} onChange={(e) => setPmEdit({ ...pmEdit, length: e.target.value })} placeholder={t("ย", "L")} className="w-12 h-7 px-1 text-sm text-right border border-slate-200 rounded" />
                                  </span>
                                : groupUsesFace(pmEdit.material_group_id)
                                ? <input type="number" min={0} step="any" value={pmEdit.face} onChange={(e) => setPmEdit({ ...pmEdit, face: e.target.value })} className="w-full h-7 px-1 text-sm text-right border border-slate-200 rounded" />
                                : <span className="text-slate-300" title={t("ชนิดนี้ไม่ใช้", "Not used for this type")}>—</span>)
                            : (r.width_cm != null && r.length_cm != null
                                ? <span className="text-violet-600 text-xs">{Number(r.width_cm).toLocaleString("th-TH")}×{Number(r.length_cm).toLocaleString("th-TH")} = {Math.round(r.width_cm * r.length_cm * 100) / 100} cm²</span>
                                : r.face_width_cm != null ? Number(r.face_width_cm).toLocaleString("th-TH") : "—")}
                        </td>
                        <td className="border border-slate-200 px-2 py-1 text-right">
                          {editing
                            ? <input type="number" min={0} step="any" value={pmEdit.cut} onChange={(e) => setPmEdit({ ...pmEdit, cut: e.target.value })} placeholder={t("กลาง", "Central")} className="w-full h-7 px-1 text-sm text-right border border-slate-200 rounded" />
                            : r.cut_rate != null ? <span className="tabular-nums">{Number(r.cut_rate).toLocaleString("th-TH", { maximumFractionDigits: 2 })}</span> : <span className="text-[11px] text-slate-300" title={t("ใช้ราคากลาง", "Uses central price")}>{t("กลาง", "central")}</span>}
                        </td>
                        <td className="border border-slate-200 px-1 py-1 text-center whitespace-nowrap">
                          {editing ? (<>
                            <button onClick={() => void pmSaveEdit()} title={t("บันทึก", "Save")} className="h-6 px-1.5 text-xs bg-emerald-600 text-white rounded mr-1">✓</button>
                            <button onClick={() => setPmEditId(null)} title={t("ยกเลิก", "Cancel")} className="h-6 px-1.5 text-xs border border-slate-200 rounded">✕</button>
                          </>) : (<>
                            <button onClick={() => setPmLinkFor(r)} title={t("ผูก SKU จัดซื้อ (ดึงราคาซื้อจริงล่าสุด/เฉลี่ย)", "Link purchase SKUs (pulls latest/average real purchase price)")}
                              className={`h-6 px-1.5 text-xs border rounded mr-1 ${(pmLinks[r.id]?.length ?? 0) > 0 ? "border-blue-300 text-blue-600 bg-blue-50" : "border-slate-200 text-slate-500"}`}>🔗 {pmLinks[r.id]?.length ?? 0}</button>
                            <button onClick={() => pmCopy(r)} title={t("คัดลอกเป็นตัวใหม่", "Copy as new")} className="h-6 px-1.5 text-xs border border-slate-200 rounded text-slate-500 mr-1">⧉</button>
                            <button onClick={() => pmStartEdit(r)} title={t("แก้", "Edit")} className="h-6 px-1.5 text-xs border border-slate-200 rounded text-slate-500 mr-1">✏</button>
                            <button onClick={() => setPmDel(r)} title={t("เก็บเข้ากรุ", "Archive")} className="h-6 px-1.5 text-xs border border-rose-200 rounded text-rose-500">🗑</button>
                          </>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          <p className="text-[11px] text-slate-400">{t("จัดการแบบเต็ม (Studio/นำเข้า/ส่งออก) อยู่ที่เมนู", "Full management (Studio/import/export) is in the menu")} <a href="/master/design-price-items" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{t("🧮 วัสดุตีราคา", "🧮 Costing materials")}</a></p>
        </div>
      </ERPModal>

      <ConfirmDialog open={pmDel !== null} onClose={() => setPmDel(null)} onConfirm={pmDelete}
        title={t("เก็บวัสดุเข้ากรุ", "Archive material")} variant="danger" confirmText={t("เก็บเข้ากรุ", "Archive")} cancelText={t("ยกเลิก", "Cancel")}
        message={t(`เก็บวัสดุ "${pmDel?.name ?? ""}" เข้ากรุหรือไม่? บรรทัดตีราคาเดิมที่เคยใช้วัสดุนี้ยังอยู่ครบ`, `Archive material "${pmDel?.name ?? ""}"? Existing costing lines that used it stay intact.`)} />

      <ConfirmDialog open={archiveTarget !== null} onClose={() => setArchiveTarget(null)} onConfirm={doArchive}
        title={t("เก็บเข้ากรุ", "Archive")} variant="danger" loading={archiving}
        confirmText={t("เก็บเข้ากรุ", "Archive")} cancelText={t("ยกเลิก", "Cancel")}
        message={t(`ต้องการเก็บใบงาน ${archiveTarget?.code ?? ""} (${archiveTarget?.name ?? ""}) เข้ากรุหรือไม่? ข้อมูลยังอยู่ กู้คืนได้ภายหลัง`, `Archive design sheet ${archiveTarget?.code ?? ""} (${archiveTarget?.name ?? ""})? The data is kept and can be restored later.`)} />

      <ConfirmDialog open={hardDelTarget !== null} onClose={() => setHardDelTarget(null)} onConfirm={doHardDelete}
        title={t("ลบใบงานถาวร", "Permanently delete design sheet")} variant="danger" loading={hardDeleting}
        confirmText={t("ลบถาวร", "Delete permanently")} cancelText={t("ยกเลิก", "Cancel")}
        message={t(`ต้องการลบใบงาน ${hardDelTarget?.code ?? ""} (${hardDelTarget?.name ?? ""}) ถาวรหรือไม่?\n\nระบบจะลบใบงาน + comment + ตีราคา + เสนอราคา และย้ายรูปทั้งหมดเข้าถังขยะ R2 (สำรอง 30 วัน) — ต่างจาก "เก็บเข้ากรุ" ที่ยังกู้คืนได้`, `Permanently delete design sheet ${hardDelTarget?.code ?? ""} (${hardDelTarget?.name ?? ""})?\n\nThis deletes the sheet + comments + costing + quotes and moves all images to the R2 trash (kept 30 days) — unlike "Archive", which can be restored`)} />
    </>
  );
}
