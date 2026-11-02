/**
 * ถามบอร์ดจ่ายงาน — ใบสั่งผลิตนี้ "จ่ายงานแล้ว" / "ช่างส่งงานครบ (เข้าคิว QC)" หรือยัง (ของกลาง · server-side ใช้ supabaseAdmin)
 *
 * เจ้าของสั่ง 2026-11-02: หน้าขอซื้อต้องถามบอร์ดจ่ายงานก่อน
 *   - จ่ายงานแล้ว (มีใบจ่ายงานที่ยังใช้อยู่ หรือแอดมินข้ามขั้น "จ่ายงาน") → วัตถุดิบนับว่า "มีของแล้ว" ไม่ต้องซื้อ
 *   - ช่างส่งงานครบ (ส่งงาน ≥ จำนวนสั่ง หรือข้ามขั้น "รับคืน") → ส่งเข้า QC แล้ว
 *   ทั้งสองกรณี = ไม่ขึ้นในรายการ "ต้องซื้อ" อีก
 * คำนวณสดจาก mo_work_orders ทุกครั้ง ไม่เขียนข้อมูล — ยกเลิกใบจ่ายงาน (is_active=false) → กลับเป็นต้องซื้อเอง
 *
 * ใครใช้ (ต้องตรงกันทุกที่ — แก้กติกาที่ไฟล์นี้):
 *   /api/mo/purchase-needs (ไม่นับใบ) · /api/mo/material-demand (ไม่นับใบ)
 *   /api/mo/material-progress (นับทุกบรรทัดเป็นของครบ) · /api/mo/material-status (บรรทัดเป็น "มีของแล้ว · จ่ายงานแล้ว")
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/fetch-all";
import { parseSkipped } from "@/lib/mo-skip";

export type MoDispatchInfo = {
  /** จ่ายงานแล้ว (รวมกรณีส่งงานครบ) */
  dispatched: boolean;
  /** ช่างส่งงานครบแล้ว = เข้าคิว QC */
  submitted: boolean;
  /** วันจ่ายงานแรก (dispatch_date) */
  dispatched_at: string | null;
  /** ช่าง / โต๊ะที่รับงาน */
  assignees: string[];
  /** ส่งงานแล้วรวม · จำนวนสั่งผลิต */
  received: number; qty: number;
  /** มาจากแอดมินข้ามขั้น (ไม่มีใบจ่ายงานจริง) */
  by_skip: boolean;
};

type Row = Record<string, unknown>;
const CHUNK = 200;

/** mos = ใบที่จะถาม (ต้องมี mo_no + qty · ส่ง skipped_stages มาด้วยถ้ามี) → mo_no → สถานะจากบอร์ดจ่ายงาน (เฉพาะใบที่จ่ายงานแล้ว) */
export async function loadMoDispatch(admin: SupabaseClient, mos: Row[]): Promise<Map<string, MoDispatchInfo>> {
  const out = new Map<string, MoDispatchInfo>();
  const moNos = [...new Set(mos.map((m) => String(m.mo_no ?? "")).filter(Boolean))];
  if (moNos.length === 0) return out;
  const wos: Row[] = [];
  for (let i = 0; i < moNos.length; i += CHUNK) {
    const part = moNos.slice(i, i + CHUNK);
    wos.push(...await fetchAllPages<Row>((from, to) => admin.from("mo_work_orders")
      .select("id, mo_no, received_qty, dispatch_date, assignee_name")
      .in("mo_no", part).eq("is_active", true)
      .order("id", { ascending: true }).range(from, to)));
  }
  const byMo = new Map<string, Row[]>();
  for (const w of wos) byMo.set(String(w.mo_no), [...(byMo.get(String(w.mo_no)) ?? []), w]);

  for (const m of mos) {
    const moNo = String(m.mo_no ?? ""); if (!moNo) continue;
    const qty = Number(m.qty) || 0;
    const list = byMo.get(moNo) ?? [];
    const skip = parseSkipped(m.skipped_stages);
    const received = list.reduce((n, w) => n + (Number(w.received_qty) || 0), 0);
    const submitted = (qty > 0 && received >= qty) || !!skip.receive;
    const dispatched = list.length > 0 || !!skip.dispatch || submitted;
    if (!dispatched) continue;
    const dates = list.map((w) => (w.dispatch_date as string) ?? null).filter((d): d is string => !!d).sort();
    out.set(moNo, {
      dispatched, submitted, dispatched_at: dates[0] ?? null,
      assignees: [...new Set(list.map((w) => String(w.assignee_name ?? "").trim()).filter(Boolean))],
      received, qty, by_skip: list.length === 0,
    });
  }
  return out;
}
