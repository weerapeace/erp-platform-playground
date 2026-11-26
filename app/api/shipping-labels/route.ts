/**
 * 🏷 ใบปะหน้าจริงจากแพลตฟอร์ม — /api/shipping-labels  (platform_orders.view · 2026-11-26)
 *   GET  ?ids=a,b,c   → ตรวจก่อนพิมพ์: ต่อออเดอร์ ดึงได้ไหม (แพลตฟอร์ม/สถานะ) + พิมพ์ไปแล้วกี่ครั้ง ล่าสุดเมื่อไร โดยใคร (เตือนพิมพ์ซ้ำ)
 *   POST { ids: string[] (≤10) } → ขอไฟล์ใบปะหน้าจากแพลตฟอร์ม → { results: LabelFetchResult[] } (pdf = base64 ต่อใบ)
 *     - ไม่เปลี่ยนสถานะออเดอร์บนแพลตฟอร์ม · ไม่เก็บไฟล์ (มีข้อมูลลูกค้า) · ลงประวัติ audit "shipping_label_fetch"
 *     - "พิมพ์แล้ว" บันทึกที่หน้าพิมพ์ (usePrintLog po_label) ตอนเปิดไฟล์ — ไม่ใช่ตอนดึง
 *   ตัวดึงต่อแพลตฟอร์ม = ./adapters.ts · กติกา/ข้อความ = lib/shipping-label · คู่มือ docs/shipping-label.md
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { LABEL_FETCH_BATCH, labelFailureText, labelSourceSupported, type LabelCheckRow, type LabelFetchResult } from "@/lib/shipping-label";
import { LABEL_ADAPTERS, type LabelOrderRow } from "./adapters";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const COLS = "id, order_no, external_order_id, package_no, tracking_no, brand_id, platform_id, status, platform_status, source";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERM = "platform_orders.view";
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
const idsOf = (raw: unknown, max: number): string[] =>
  [...new Set((Array.isArray(raw) ? raw : String(raw ?? "").split(",")).map((x) => String(x).trim()).filter((x) => UUID_RE.test(x)))].slice(0, max);

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  const ids = idsOf(new URL(request.url).searchParams.get("ids"), 200);
  if (!ids.length) return bad("ไม่ได้เลือกออเดอร์");
  const admin = supabaseAdmin();
  const [{ data: os, error }, { data: logs }] = await Promise.all([
    admin.from("platform_orders").select(COLS).in("id", ids),
    admin.from("print_logs").select("doc_id, printed_at, printed_by_name").eq("doc_type", "po_label").in("doc_id", ids).order("printed_at", { ascending: false }),
  ]);
  if (error) return bad("โหลดออเดอร์ไม่สำเร็จ กรุณาลองใหม่", 500);
  const printed = new Map<string, { n: number; last: string; by: string | null }>();
  for (const l of (logs ?? []) as { doc_id: string; printed_at: string; printed_by_name: string | null }[]) {
    const p = printed.get(l.doc_id);
    if (p) p.n += 1; else printed.set(l.doc_id, { n: 1, last: l.printed_at, by: l.printed_by_name });
  }
  const rows: LabelCheckRow[] = ((os ?? []) as LabelOrderRow[]).map((o) => {
    const supported = labelSourceSupported(o.source);
    const reason = !supported ? labelFailureText("unsupported") : o.status === "cancelled" ? labelFailureText("cancelled") : null;
    return { id: o.id, order_no: o.order_no ?? o.external_order_id, supported: supported && !reason, reason, printed: printed.get(o.id) ?? null };
  });
  rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return NextResponse.json({ orders: rows, error: null }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, PERM); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const body = await request.json().catch(() => null) as { ids?: unknown } | null;
  const ids = idsOf(body?.ids, LABEL_FETCH_BATCH);
  if (!ids.length) return bad("ไม่ได้เลือกออเดอร์");
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("platform_orders").select(COLS).in("id", ids);
  if (error) return bad("โหลดออเดอร์ไม่สำเร็จ กรุณาลองใหม่", 500);
  const rows = (data ?? []) as LabelOrderRow[];

  // แยกตามแหล่ง + ร้าน (แบรนด์ × แพลตฟอร์ม) — ตัวดึงรับทีละร้าน
  const results: LabelFetchResult[] = [];
  const groups = new Map<string, LabelOrderRow[]>();
  for (const r of rows) {
    if (!labelSourceSupported(r.source) || !LABEL_ADAPTERS[r.source ?? ""]) { results.push({ id: r.id, order_no: r.order_no, ok: false, code: "unsupported", reason: labelFailureText("unsupported") }); continue; }
    const k = `${r.source}|${r.brand_id}|${r.platform_id}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  for (const [k, list] of groups) {
    try { results.push(...await LABEL_ADAPTERS[k.split("|")[0]](admin, list, user?.id ?? null)); }
    catch (e) { list.forEach((r) => results.push({ id: r.id, order_no: r.order_no, ok: false, code: "error", reason: `ดึงใบปะหน้าไม่สำเร็จ: ${(e as Error).message}` })); }
  }
  for (const id of ids) if (!results.some((r) => r.id === id)) results.push({ id, order_no: null, ok: false, code: "not_found", reason: "ไม่พบออเดอร์นี้" });
  results.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

  const okN = results.filter((r) => r.ok).length;
  await writeAudit(admin, {
    action: "export", entityType: "platform_orders", entityId: ids.length === 1 ? ids[0] : null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: {
      source: "shipping_label_fetch", ok: okN, failed: results.length - okN,
      orders: results.map((r) => ({ id: r.id, order_no: r.order_no, ok: r.ok, ...(r.ok ? { doc_type: r.doc_type } : { code: r.code, reason: r.reason }) })),
    },
  });
  return NextResponse.json({ results, error: null }, { headers: { "Cache-Control": "no-store" } });
}
