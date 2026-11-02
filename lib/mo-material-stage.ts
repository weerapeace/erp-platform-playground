/**
 * ขั้นสถานะวัตถุดิบ 6 ขั้น (สำหรับแสดงผล) — ของกลาง pure ใช้ได้ทั้งหน้าเว็บและฝั่ง server
 *   ต้องซื้อ → ขอซื้อแล้ว → สั่งซื้อแล้ว (มี PO) → รับของแล้ว (บางส่วน) → ปิดงาน
 *   ทางลัด: มีของแล้ว (กดเอง / ใช้ของในสต๊อก / เตรียมแล้ว) → ปิดงาน เมื่อจ่ายงาน
 * เจ้าของสั่ง 2026-11-02 · "ปิดงาน" = แบบ A ระบบปิดให้เอง:
 *   รับครบ/ปิดยอดทุกบรรทัด PO แล้ว · หรือใบสั่งผลิตจ่ายงานแล้ว · หรือไม่ต้องซื้อ / แอดมินข้ามขั้นซื้อของ
 *
 * ไม่คิดกติกาสถานะซ้ำ: รับ status จาก lib/mo-material-status (computeMatStatus) แล้วแตกขั้นเพิ่มจาก links เท่านั้น
 * สี/ป้าย (Tailwind) อยู่ที่ components/mo-material-progress (MAT_STAGE_UI) · ใครใช้: material-progress API (แถบ 6 สี),
 *   หน้าขอซื้อ ระดับ 2 / รวมตามรุ่น, บอร์ดจ่ายงาน ช่อง "ซื้อของ" · ก่อนแก้: npm run where-used -- mo-materials
 */
import type { MatStatus, MatPurchaseLink } from "@/lib/mo-material-status";

export type MatStage = "buy" | "requested" | "ordered" | "receiving" | "have" | "closed";
/** ลำดับขั้น = ลำดับช่องในแถบสี (MoProgress.stages) */
export const MAT_STAGE_KEYS: MatStage[] = ["buy", "requested", "ordered", "receiving", "have", "closed"];
export const MAT_STAGE_LABEL: Record<MatStage, string> = {
  buy: "ต้องซื้อ", requested: "ขอซื้อแล้ว", ordered: "สั่งซื้อแล้ว (มี PO)", receiving: "รับของแล้ว (บางส่วน)",
  have: "มีของแล้ว (กดเอง/สต๊อก)", closed: "ปิดงาน",
};

type StageInput = { status: MatStatus; links: MatPurchaseLink[]; dispatched?: boolean };

/** ขั้นของวัตถุดิบ 1 บรรทัด · skippedBuy = แอดมินข้ามขั้นซื้อของทั้งใบ (lib/mo-skip) */
export function matStage(m: StageInput, opts?: { skippedBuy?: boolean }): MatStage {
  if (m.dispatched || opts?.skippedBuy) return "closed";
  switch (m.status) {
    case "buy": return "buy";
    case "requested": return "requested";
    case "ordered": return m.links.some((l) => l.qty_received > 0) ? "receiving" : "ordered";
    case "received": case "skip": return "closed";
    default: return "have";   // have / ready
  }
}

/** นับจำนวนบรรทัดต่อขั้น เรียงตาม MAT_STAGE_KEYS */
export function countStages(list: MatStage[]): number[] {
  return MAT_STAGE_KEYS.map((k) => list.filter((s) => s === k).length);
}

export type StepState = "done" | "now" | "todo";
export type MatStep = { key: "request" | "order" | "receive" | "have" | "close"; label: string; detail: string | null; state: StepState };

const thd = (d: string | null | undefined) => (d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : null);
const fq = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 });
const uniq = (a: (string | null | undefined)[]) => [...new Set(a.filter((x): x is string => !!x))];

/**
 * ขั้นตอนย่อยบนการ์ดวัตถุดิบ (ไทม์ไลน์เล็ก) — ทางซื้อ: ขอซื้อ → สั่งซื้อ → รับของ → ปิดงาน · ทางลัด: มีของแล้ว → ปิดงาน
 * ต้องซื้อแล้วยังไม่มีใบขอซื้อเลย = ไม่มีขั้นตอน (คืน [])
 */
export function matSteps(m: StageInput & { usedStock?: boolean; dispatchedAt?: string | null }, opts?: { skippedBuy?: boolean }): MatStep[] {
  const stage = matStage(m, opts);
  const closeDetail = m.dispatched ? `จ่ายงานแล้ว${thd(m.dispatchedAt) ? ` ${thd(m.dispatchedAt)}` : ""}` : opts?.skippedBuy ? "แอดมินข้ามขั้นซื้อของ" : m.status === "skip" ? "ไม่ต้องซื้อ" : null;
  const links = m.links;
  if (links.length === 0) {
    if (stage === "buy") return [];
    if (stage === "closed" && !m.dispatched) return [{ key: "close", label: "ปิดงาน", detail: closeDetail, state: "done" }];
    return [
      { key: "have", label: "มีของแล้ว", detail: m.status === "ready" ? "เตรียมแล้ว" : m.usedStock ? "ใช้ของในสต๊อก" : "กดมีของแล้ว (ไม่ได้ซื้อ)", state: "done" },
      { key: "close", label: "ปิดงาน", detail: closeDetail, state: stage === "closed" ? "done" : "todo" },
    ];
  }
  const prs = uniq(links.map((l) => l.pr_no));
  const pos = uniq(links.map((l) => l.po_no));
  const prDate = links.map((l) => l.pr_date).filter(Boolean).sort()[0] ?? null;
  const eta = links.map((l) => l.expected_date).filter(Boolean).sort()[0] ?? null;
  const lineQty = links.reduce((n, l) => n + (l.po_line_id ? l.line_qty : 0), 0);
  const rec = links.reduce((n, l) => n + l.qty_received, 0);
  const allClosed = links.every((l) => l.line_closed);
  const ordered = pos.length > 0;
  const recDetail = rec > 0 ? (allClosed ? `รับครบ ${fq(rec)}${lineQty > rec + 0.0001 ? ` (ปิดยอด ${fq(lineQty)})` : ""}` : `รับแล้ว ${fq(rec)}/${fq(lineQty)} · ค้าง ${fq(Math.max(0, lineQty - rec))}`) : null;
  return [
    { key: "request", label: ordered ? "ขอซื้อแล้ว" : "ขอซื้อแล้ว · รออนุมัติ", detail: [prs.join(", "), thd(prDate)].filter(Boolean).join(" · ") || null, state: ordered ? "done" : "now" },
    { key: "order", label: "สั่งซื้อแล้ว", detail: ordered ? [pos.join(", "), thd(eta) ? `ถึง ${thd(eta)}` : null].filter(Boolean).join(" · ") : null, state: ordered ? (rec > 0 || allClosed ? "done" : "now") : "todo" },
    { key: "receive", label: "รับของ", detail: recDetail, state: allClosed && ordered ? "done" : rec > 0 ? "now" : "todo" },
    { key: "close", label: "ปิดงาน", detail: closeDetail ?? (allClosed && ordered ? "รับครบ/ปิดยอดแล้ว" : null), state: stage === "closed" ? "done" : "todo" },
  ];
}
