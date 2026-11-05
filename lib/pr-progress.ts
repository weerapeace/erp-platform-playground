/**
 * ของกลาง (pure): "ใบขอซื้อ 1 ใบ ไปถึงไหนแล้ว" — คิดจากสถานะใบขอซื้อ + บรรทัดใบสั่งซื้อที่ผูก (pr_id) + สถานะใบสั่งซื้อ
 * เจ้าของสั่ง 2026-11-05: ประวัติการขอซื้อต้อง "มีสถานะที่สั่งด้วย" — เดิมใบขอซื้อมีแค่ waiting / rfq_created
 *   (ออกใบสั่งซื้อแล้วสถานะใบขอซื้อไม่ขยับอีก) → ความคืบหน้าจริงอยู่ที่ใบสั่งซื้อ/บรรทัด
 * 5 ขั้น: ขอซื้อ → ออกใบสั่งซื้อ (ร่าง ยังไม่สั่งร้าน) → สั่งร้านแล้ว → รับบางส่วน → รับครบ/ปิดยอด
 *   นอกเส้น: ไม่อนุมัติ / ยกเลิก
 * ใช้ที่: /api/purchasing/pr-history → components/pr-history · ก่อนแก้: npm run where-used -- purchasing
 */
import { PO_DRAFT } from "@/lib/po-status";

export type PrStage = "requested" | "po_draft" | "ordered" | "receiving" | "received" | "rejected" | "cancelled";

/** ขั้นบนเส้นหลัก (ลำดับ = ช่องในแถบ 5 ช่อง) */
export const PR_STAGE_STEPS: PrStage[] = ["requested", "po_draft", "ordered", "receiving", "received"];

export const PR_STAGE_LABEL: Record<PrStage, string> = {
  requested: "รออนุมัติ/รอสั่ง",
  po_draft: "ออกใบสั่งซื้อแล้ว ยังไม่สั่งร้าน",
  ordered: "สั่งร้านแล้ว รอของ",
  receiving: "รับของบางส่วน",
  received: "รับครบแล้ว",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิก",
};

/** สถานะบรรทัดใบสั่งซื้อที่ถือว่า "จบแล้ว" (ชุดเดียวกับ /api/purchasing/cancel-line · lib/mo-material-status) */
export const PO_LINE_CLOSED = ["received", "short_closed", "closed_short", "cancelled"];

const EPS = 0.0001;

export type PrProgressInput = {
  pr_status: string | null | undefined;
  /** บรรทัดใบสั่งซื้อที่ผูกใบขอซื้อนี้ (ไม่มี = ยังไม่ออกใบสั่งซื้อ) */
  line?: { qty: number; qty_received: number; line_status: string | null } | null;
  po_status?: string | null;
};

export type PrProgress = {
  stage: PrStage;
  /** ช่องที่ถึงแล้วบนแถบ 5 ช่อง (0-4) · นอกเส้น = -1 */
  step: number;
  label: string;
  /** ปิดยอดทั้งที่ได้ของไม่ครบ */
  short: boolean;
};

const mk = (stage: PrStage, short = false): PrProgress => ({
  stage, step: PR_STAGE_STEPS.indexOf(stage), short,
  label: short ? "ปิดยอดแล้ว (ได้ไม่ครบ)" : PR_STAGE_LABEL[stage],
});

export function prProgress(i: PrProgressInput): PrProgress {
  const st = String(i.pr_status ?? "");
  if (st === "rejected") return mk("rejected");
  if (st === "cancelled") return mk("cancelled");
  const ln = i.line;
  if (!ln) return mk("requested");
  const qty = Number(ln.qty) || 0;
  const rec = Number(ln.qty_received) || 0;
  const ls = String(ln.line_status ?? "");
  if (qty > 0 && rec >= qty - EPS) return mk("received");
  if (PO_LINE_CLOSED.includes(ls)) {
    if (ls === "cancelled" && rec <= EPS) return mk("cancelled");
    return mk("received", rec < qty - EPS);
  }
  if (rec > EPS) return mk("receiving");
  if (String(i.po_status ?? "") === PO_DRAFT) return mk("po_draft");
  if (String(i.po_status ?? "") === "cancelled") return mk("cancelled");
  return mk("ordered");
}
