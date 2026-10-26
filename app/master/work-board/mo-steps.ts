/**
 * 5 ขั้นของใบสั่งผลิตบนบอร์ด (ซื้อของ → เตรียม → ตัด → จ่ายงาน → รับคืน) — คิดที่เดียว ใช้ทั้งจุดในตาราง และแผง 🚦 ความคืบหน้า
 * ขั้นที่แอดมินข้าม (lib/mo-skip) = state "skip" เสมอ (ตัวเลขจริงยังเก็บไว้ใน sub ไม่ได้ลบ)
 */
import type { MoSkipStage, MoSkipped } from "@/lib/mo-skip";
import type { MoProgress } from "@/app/api/mo/material-progress/route";

export type StepState = "done" | "part" | "todo" | "na" | "skip";
export type MoStepRow = { key: MoSkipStage; label: string; short: string; state: StepState; sub: string };
export type MoStepInput = {
  has_bom: boolean; prep_total: number; prep_ready: number; cut_total: number; cut_ready: number;
  prep_done?: boolean; cut_done?: boolean; qty: number; dispatched: number; remaining: number; skipped_stages?: MoSkipped;
};

const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const lv = (a: number, b: number): StepState => (a >= b ? "done" : a > 0 ? "part" : "todo");

export function moSteps(m: MoStepInput, p: MoProgress | undefined, received: number): MoStepRow[] {
  const rows: MoStepRow[] = [
    { key: "buy", label: "ซื้อของ", short: "ซื้อ",
      state: p ? (p.buy + p.requested + p.ordered === 0 ? "done" : p.total - p.buy > 0 ? "part" : "todo") : "na",
      sub: p ? `ต้องซื้อ ${p.buy} · รออนุมัติ ${p.requested} · รอของ ${p.ordered} · ครบ ${p.done}/${p.total}` : "ยังไม่มีสูตร" },
    { key: "prep", label: "เตรียม", short: "เตรียม",
      state: m.has_bom ? lv(m.prep_ready, m.prep_total) : m.prep_done ? "done" : "todo",
      sub: m.has_bom ? `${m.prep_ready}/${m.prep_total}` : "เตรียมของ" },
    { key: "cut", label: "ตัด", short: "ตัด",
      state: m.has_bom ? lv(m.cut_ready, m.cut_total) : m.cut_done ? "done" : "todo",
      sub: m.has_bom ? (m.cut_total > 0 ? `${m.cut_ready}/${m.cut_total}` : "ไม่มีชิ้นต้องตัด") : "ตัด" },
    { key: "dispatch", label: "จ่ายงาน", short: "จ่าย",
      state: m.remaining <= 0.0001 ? "done" : m.dispatched > 0 ? "part" : "todo",
      sub: `${fmt(m.dispatched)}/${fmt(m.qty)} ชิ้น` },
    { key: "receive", label: "รับคืน", short: "รับคืน",
      state: received > 0 && received >= (m.qty || 0) - 0.0001 ? "done" : received > 0 ? "part" : "todo",
      sub: `${fmt(received)}/${fmt(m.qty)} ชิ้น` },
  ];
  const sk = m.skipped_stages ?? {};
  for (const r of rows) {
    const s = sk[r.key];
    if (s) { r.state = "skip"; r.sub = `ข้ามแล้ว${s.by_name ? ` · ${s.by_name}` : ""}`; }
  }
  return rows;
}

/** ขั้นปัจจุบัน = ขั้นแรกที่ยังไม่ครบ (−1 = ครบ/ข้ามหมดแล้ว) */
export const currentStep = (rows: MoStepRow[]) => rows.findIndex((r) => r.state === "todo" || r.state === "part");
