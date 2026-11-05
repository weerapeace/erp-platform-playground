/**
 * ปิด/เปิดคืนใบสั่งผลิตอัตโนมัติ (ฝั่งเซิร์ฟเวอร์) — กติกาที่ lib/mo-auto-close.ts (ตัดสินด้วยกฎปิดงานกลาง lib/mo-workflow)
 *
 * เรียกหลังเหตุการณ์ที่ทำให้ "ขายครบ + ช่างส่งคืนครบ" เปลี่ยน:
 *   ผูก/ถอดใบขาย (/api/mo/sales-match) · รับคืนงาน (/api/mo/work-orders/[id]) · ส่งงาน/ตรวจรับ (/api/mo/submissions) · คลัง QC (/api/qc-warehouse/items)
 * ไม่เคยโยน error — งานหลักของผู้เรียกต้องสำเร็จเสมอ (พลาดแค่ console.error)
 * ข้อเท็จจริงคิดแบบเดียวกับ /api/mo/bulk-status (ใบจ่ายงานที่ยังใช้งาน · ไม่นับยกเลิก · ค้าง = ยังไม่ done)
 * audit entity "mo" — ปิด = action "close" (metadata.auto) · เปิดคืน = "reopen" (กลับสถานะเดิมจาก audit ปิดครั้งล่าสุด)
 */
import { writeAuditMany } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseSkipped } from "@/lib/mo-skip";
import { AUTO_CLOSE_REASON, AUTO_REOPEN_REASON, autoCloseAction } from "@/lib/mo-auto-close";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

export async function syncAutoClose(
  admin: Admin,
  moNos: (string | null | undefined)[],
  actor: { id?: string | null; name?: string | null },
  via: string,
): Promise<{ closed: string[]; reopened: string[] }> {
  const out = { closed: [] as string[], reopened: [] as string[] };
  try {
    const nos = [...new Set(moNos.map((x) => String(x ?? "").trim()).filter(Boolean))].slice(0, 300);
    if (!nos.length) return out;

    const { data: moData } = await admin.from("manufacturing_orders")
      .select("id, mo_no, status, qty, is_active, skipped_stages").in("mo_no", nos);
    const mos = ((moData ?? []) as Row[]).filter((m) => m.is_active !== false);
    if (!mos.length) return out;
    const ids = mos.map((m) => String(m.id));

    const [{ data: links }, { data: wos }, { data: audits }] = await Promise.all([
      admin.from("mo_sales_links").select("mo_id, qty").in("mo_id", ids).eq("is_active", true),
      admin.from("mo_work_orders").select("mo_no, qty, received_qty, status").in("mo_no", nos).eq("is_active", true),
      // การปิด/เปิดคืนครั้งล่าสุดของแต่ละใบ (รู้ว่าใบที่ปิดอยู่ "ระบบปิดเอง" ไหม + สถานะก่อนปิด)
      admin.from("audit_logs").select("entity_id, action, metadata, created_at")
        .eq("entity_type", "mo").in("entity_id", ids).in("action", ["close", "reopen"])
        .order("created_at", { ascending: false }).limit(1000),
    ]);

    const sold = new Map<string, number>();
    for (const l of (links ?? []) as Row[]) sold.set(String(l.mo_id), (sold.get(String(l.mo_id)) ?? 0) + n(l.qty));
    const facts = new Map<string, { disp: number; recv: number; open: number }>();
    for (const w of (wos ?? []) as Row[]) {
      if (w.status === "cancelled") continue;
      const k = String(w.mo_no);
      const f = facts.get(k) ?? { disp: 0, recv: 0, open: 0 };
      f.disp += n(w.qty); f.recv += n(w.received_qty); if (w.status !== "done") f.open += 1;
      facts.set(k, f);
    }
    const lastClose = new Map<string, Row>();
    for (const a of (audits ?? []) as Row[]) if (!lastClose.has(String(a.entity_id))) lastClose.set(String(a.entity_id), a);

    const toClose: Row[] = [];
    const toReopen: { m: Row; back: string }[] = [];
    for (const m of mos) {
      const id = String(m.id), f = facts.get(String(m.mo_no)) ?? { disp: 0, recv: 0, open: 0 };
      const last = lastClose.get(id);
      const lastMeta = (last?.metadata ?? {}) as Row;
      const act = autoCloseAction({
        status: (m.status as string) ?? null, qty: n(m.qty), sold: sold.get(id) ?? 0,
        dispatched: f.disp, received: f.recv, openWorkOrders: f.open,
        receiveSkipped: !!parseSkipped(m.skipped_stages).receive,
        lastCloseAuto: last?.action === "close" && lastMeta.auto === true,
      });
      if (act === "close") toClose.push(m);
      if (act === "reopen") toReopen.push({ m, back: String(lastMeta.old_value || "confirmed") });
    }

    const now = new Date().toISOString();
    const audit: Parameters<typeof writeAuditMany>[1] = [];
    if (toClose.length) {
      // ตรวจสถานะซ้ำตอนเขียน — กันชนกับคนกดปิด/ยกเลิกพร้อมกัน
      const { data } = await admin.from("manufacturing_orders").update({ status: "done", updated_at: now })
        .in("id", toClose.map((m) => String(m.id))).not("status", "in", "(done,cancelled)").select("id, mo_no");
      const done = new Set(((data ?? []) as Row[]).map((r) => String(r.id)));
      for (const m of toClose) if (done.has(String(m.id))) {
        out.closed.push(String(m.mo_no));
        audit.push({ action: "close", entityType: "mo", entityId: String(m.id), actorId: actor.id ?? null, actorName: actor.name ?? null,
          metadata: { mo_no: m.mo_no, field: "status", old_value: (m.status as string) || "draft", new_value: "done",
            auto: true, via, reason: AUTO_CLOSE_REASON, sold: sold.get(String(m.id)) ?? 0, qty: n(m.qty) } });
      }
    }
    for (const { m, back } of toReopen) {
      const { data } = await admin.from("manufacturing_orders").update({ status: back, updated_at: now })
        .eq("id", String(m.id)).eq("status", "done").select("id");
      if (!(data ?? []).length) continue;
      out.reopened.push(String(m.mo_no));
      audit.push({ action: "reopen", entityType: "mo", entityId: String(m.id), actorId: actor.id ?? null, actorName: actor.name ?? null,
        metadata: { mo_no: m.mo_no, field: "status", old_value: "done", new_value: back, auto: true, via, reason: AUTO_REOPEN_REASON } });
    }
    if (audit.length) await writeAuditMany(admin, audit);
  } catch (e) {
    console.error("[mo auto-close] ข้าม:", e instanceof Error ? e.message : e);
  }
  return out;
}
