/**
 * ตั้งวันนัดส่งใบสั่งขาย (โดยไม่ต้องเข้าโหมดแก้ทั้งใบ) — /api/so-orders/due · เจ้าของเลือกแบบ B 2026-11-22
 * POST {
 *   items: [{ order_id, due_date?: "YYYY-MM-DD"|null (ไม่ส่ง = ไม่แตะ), lines?: { [line_id]: "YYYY-MM-DD"|null } }],
 *   sync_mo?: boolean          ติ๊ก "อัปเดตวันส่งในใบสั่งผลิตด้วย" (ไม่ล้างวันใบผลิต · ข้ามใบที่เสร็จ/ยกเลิก)
 *   mo_restore?: { [mo_id]: "YYYY-MM-DD"|null }   ใช้ตอนกด "ย้อนกลับ" เท่านั้น (เฉพาะใบผลิตของใบสั่งขายในคำขอนี้)
 * }
 * → { results: [{ order_id, order_no, before: { due_date, lines }, mo: [{ mo_id, mo_no, from, to }] }] }  (before + mo.from = ไว้ย้อนกลับ)
 * สิทธิ์: so.create (เท่ากับแก้ใบ) · ใบยกเลิก/ถูกรวมแล้ว = แก้ไม่ได้ · ลงประวัติค่าเดิม→ใหม่ทุกใบ · กติกา lib/so-due.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { moDueTargets, parseDue, type DueLine, type DueMo } from "@/lib/so-due";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = Record<string, unknown>;
type Item = { order_id?: unknown; due_date?: unknown; lines?: unknown };
const t = (v: unknown) => String(v ?? "").trim();
const UUID = /^[0-9a-f-]{36}$/i;
const MAX_ORDERS = 200;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "so.create"); if (denied) return denied;
  let body: { items?: unknown; sync_mo?: unknown; mo_restore?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const rawItems = Array.isArray(body.items) ? (body.items as Item[]) : [];
  if (!rawItems.length) return NextResponse.json({ error: "ยังไม่ได้เลือกใบ" }, { status: 400 });
  if (rawItems.length > MAX_ORDERS) return NextResponse.json({ error: `ตั้งได้ครั้งละไม่เกิน ${MAX_ORDERS} ใบ` }, { status: 400 });

  // อ่าน + ตรวจรูปแบบทั้งหมดก่อนเขียน (ผิดสักช่อง = ไม่เขียนอะไรเลย)
  let items: { orderId: string; due: string | null | undefined; lines: Map<string, string | null> }[];
  let moRestore: Map<string, string | null>;
  try {
    items = rawItems.map((it) => {
      const orderId = t(it.order_id);
      if (!UUID.test(orderId)) throw new Error("ข้อมูลไม่ถูกต้อง");
      const lines = new Map<string, string | null>();
      if (it.lines && typeof it.lines === "object") {
        for (const [k, v] of Object.entries(it.lines as Record<string, unknown>)) {
          if (!UUID.test(k)) throw new Error("ข้อมูลไม่ถูกต้อง");
          lines.set(k, parseDue(v ?? null) ?? null);
        }
      }
      return { orderId, due: parseDue(it.due_date), lines };
    });
    moRestore = new Map(Object.entries((body.mo_restore && typeof body.mo_restore === "object" ? body.mo_restore : {}) as Record<string, unknown>)
      .map(([k, v]) => { if (!UUID.test(k)) throw new Error("ข้อมูลไม่ถูกต้อง"); return [k, parseDue(v ?? null) ?? null]; }));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const syncMo = body.sync_mo === true;

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = { actorId: user?.id ?? null, actorName: user?.email ?? null };
  const admin = supabaseAdmin();
  const ids = [...new Set(items.map((i) => i.orderId))];
  const [{ data: os }, { data: ls }, { data: ms }] = await Promise.all([
    admin.from("so_orders").select("id,order_no,status,due_date,merged_into_id").in("id", ids),
    admin.from("so_order_lines").select("id,order_id,sku,qty,mo_id,due_date").in("order_id", ids),
    admin.from("manufacturing_orders").select("id,mo_no,product_sku,qty,status,due_date,so_order_id").in("so_order_id", ids).eq("is_active", true),
  ]);
  const orderOf = new Map(((os ?? []) as Row[]).map((o) => [t(o.id), o]));
  for (const id of ids) {
    const o = orderOf.get(id);
    if (!o) return NextResponse.json({ error: "ไม่พบใบสั่งขาย" }, { status: 404 });
    if (t(o.status) === "cancelled" || o.merged_into_id) return NextResponse.json({ error: `ใบ ${t(o.order_no) || ""} ยกเลิก/ถูกรวมแล้ว แก้วันนัดส่งไม่ได้` }, { status: 400 });
  }
  const linesOf = (oid: string) => ((ls ?? []) as Row[]).filter((l) => t(l.order_id) === oid);
  const mosOf = (oid: string) => ((ms ?? []) as Row[]).filter((m) => t(m.so_order_id) === oid);

  const results: { order_id: string; order_no: string; before: { due_date: string | null; lines: Record<string, string | null> }; mo: { mo_id: string; mo_no: string; from: string | null; to: string }[] }[] = [];
  for (const it of items) {
    const o = orderOf.get(it.orderId)!;
    const curLines = linesOf(it.orderId);
    const lineIds = new Set(curLines.map((l) => t(l.id)));
    for (const k of it.lines.keys()) if (!lineIds.has(k)) return NextResponse.json({ error: "รายการไม่อยู่ในใบนี้ (ใบอาจถูกแก้ไปแล้ว) — เปิดใบใหม่อีกครั้ง" }, { status: 409 });

    const beforeDue = t(o.due_date).slice(0, 10) || null;
    const beforeLines: Record<string, string | null> = {};
    const changes: Record<string, { from: string | null; to: string | null }> = {};
    if (it.due !== undefined && it.due !== beforeDue) {
      const { error } = await admin.from("so_orders").update({ due_date: it.due, updated_at: new Date().toISOString() }).eq("id", it.orderId);
      if (error) return NextResponse.json({ error: "บันทึกวันนัดส่งไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
      changes.due_date = { from: beforeDue, to: it.due };
    }
    for (const [lid, to] of it.lines) {
      const cur = curLines.find((l) => t(l.id) === lid)!;
      const from = t(cur.due_date).slice(0, 10) || null;
      beforeLines[lid] = from;
      if (from === to) continue;
      const { error } = await admin.from("so_order_lines").update({ due_date: to }).eq("id", lid);
      if (error) return NextResponse.json({ error: "บันทึกวันนัดส่งไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
      changes[`line:${t(cur.sku) || lid}`] = { from, to };
      cur.due_date = to;   // ใช้ค่าใหม่ตอนคิดวันใบผลิต
    }

    // ใบสั่งผลิต: ย้อนกลับ (mo_restore) หรือ อัปเดตตามวันใหม่ (sync_mo)
    const mos = mosOf(it.orderId);
    let moChanges: { mo_id: string; mo_no: string; from: string | null; to: string }[] = [];
    if (moRestore.size) {
      for (const m of mos) {
        if (!moRestore.has(t(m.id))) continue;
        const to = moRestore.get(t(m.id)) ?? null;
        const { error } = await admin.from("manufacturing_orders").update({ due_date: to }).eq("id", t(m.id));
        if (!error) changes[`mo:${t(m.mo_no)}`] = { from: t(m.due_date).slice(0, 10) || null, to };
      }
    } else if (syncMo && Object.keys(changes).length) {
      const newDue = it.due !== undefined ? it.due : beforeDue;
      moChanges = moDueTargets(
        curLines.map((l) => ({ id: t(l.id), sku: t(l.sku) || null, qty: Number(l.qty) || 0, mo_id: t(l.mo_id) || null, due_date: t(l.due_date).slice(0, 10) || null })) as DueLine[],
        mos.map((m) => ({ id: t(m.id), mo_no: t(m.mo_no), product_sku: t(m.product_sku) || null, qty: Number(m.qty) || 0, status: t(m.status) || null, due_date: t(m.due_date) || null })) as DueMo[],
        newDue, it.due !== undefined ? undefined : new Set(it.lines.keys()),
      );
      for (const c of moChanges) {
        const { error } = await admin.from("manufacturing_orders").update({ due_date: c.to }).eq("id", c.mo_id);
        if (!error) changes[`mo:${c.mo_no}`] = { from: c.from, to: c.to };
      }
    }

    if (Object.keys(changes).length) {
      await writeAudit(admin, {
        action: moRestore.size ? "so_due_undo" : "so_due_set", entityType: "so_order", entityId: it.orderId, ...actor,
        metadata: { order_no: t(o.order_no), changes, ...(syncMo ? { sync_mo: true } : {}) },
      });
    }
    results.push({ order_id: it.orderId, order_no: t(o.order_no), before: { due_date: beforeDue, lines: beforeLines }, mo: moChanges });
  }
  return NextResponse.json({ results, error: null });
}
