/**
 * 🔄 ปลายทางซิงค์สต๊อก (stock_sync_channels)
 * GET            → ทุกปลายทาง + ชื่อแบรนด์/คลัง + นับรายการตามสถานะเทียบยอด
 * PATCH { id, buffer_qty?, mode?, note? } → แก้ตั้งค่า (เฟส 1 เปิดได้แค่ off/compare) + audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { fetchAllPages } from "@/lib/fetch-all";
import { loadChannel, PHASE1_MODES, type SyncChannel } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type SyncChannelRow = SyncChannel & {
  brand_name: string | null;
  warehouse_code: string | null;
  warehouse_name: string | null;
  counts: Record<string, number>;
  total: number;
};

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const admin = supabaseAdmin();

  const { data: chs, error } = await admin.from("stock_sync_channels").select("*").order("created_at", { ascending: true });
  if (error) return NextResponse.json({ channels: [], error: "โหลดปลายทางซิงค์ไม่สำเร็จ" }, { status: 500 });
  const channels = (chs ?? []) as SyncChannel[];

  const brandIds = [...new Set(channels.map((c) => c.brand_id))];
  const whIds = [...new Set(channels.map((c) => c.warehouse_id))];
  const [{ data: brands }, { data: whs }] = await Promise.all([
    brandIds.length ? admin.from("brands").select("id, name").in("id", brandIds) : Promise.resolve({ data: [] }),
    whIds.length ? admin.from("erp_playground_warehouses").select("id, code, name").in("id", whIds) : Promise.resolve({ data: [] }),
  ]);
  const brandName = new Map(((brands ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const wh = new Map(((whs ?? []) as { id: string; code: string; name: string }[]).map((w) => [w.id, w]));

  // นับตามสถานะ (มุมมองเทียบยอด) — ดึงครบทุกแถว (PostgREST ตัดที่ 1,000 เงียบ ๆ)
  const statusRows = await fetchAllPages<{ channel_id: string; status: string }>((from, to) =>
    admin.from("v_channel_stock_compare").select("channel_id, status").order("id", { ascending: true }).range(from, to));
  const counts = new Map<string, Record<string, number>>();
  for (const r of statusRows) {
    const c = counts.get(r.channel_id) ?? {};
    c[r.status] = (c[r.status] ?? 0) + 1;
    counts.set(r.channel_id, c);
  }

  const rows: SyncChannelRow[] = channels.map((c) => {
    const cnt = counts.get(c.id) ?? {};
    return {
      ...c,
      buffer_qty: Number(c.buffer_qty) || 0,
      brand_name: brandName.get(c.brand_id) ?? null,
      warehouse_code: wh.get(c.warehouse_id)?.code ?? null,
      warehouse_name: wh.get(c.warehouse_id)?.name ?? null,
      counts: cnt,
      total: Object.values(cnt).reduce((a, b) => a + b, 0),
    };
  });
  return NextResponse.json({ channels: rows, error: null });
}

export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "อ่านข้อมูลไม่ได้" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const ch = await loadChannel(admin, body.id);
  if (!ch) return NextResponse.json({ error: "ไม่พบปลายทางซิงค์" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (body.buffer_qty !== undefined) {
    const n = Number(body.buffer_qty);
    if (!isFinite(n) || n < 0 || n > 9999) return NextResponse.json({ error: "ยอดกันไว้ต้องเป็นตัวเลข 0–9,999" }, { status: 400 });
    patch.buffer_qty = Math.floor(n);
  }
  if (body.mode !== undefined) {
    const m = String(body.mode);
    if (!(PHASE1_MODES as readonly string[]).includes(m)) {
      return NextResponse.json({ error: "ตอนนี้ (เฟส 1) เลือกได้แค่ 'ปิด' หรือ 'เทียบอย่างเดียว' — การส่งยอดจริงจะเปิดในเฟส 2" }, { status: 400 });
    }
    patch.mode = m;
  }
  if (body.note !== undefined) patch.note = String(body.note ?? "").slice(0, 500) || null;
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีอะไรให้แก้" }, { status: 400 });
  patch.updated_at = new Date().toISOString();

  const { error } = await admin.from("stock_sync_channels").update(patch).eq("id", ch.id);
  if (error) return NextResponse.json({ error: "บันทึกตั้งค่าไม่สำเร็จ" }, { status: 500 });

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(patch)) if (k !== "updated_at") changes[k] = { from: (ch as Record<string, unknown>)[k] ?? null, to: patch[k] };
  await writeAudit(admin, {
    action: "setting_change", entityType: "stock_sync_channels", entityId: ch.id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { label: ch.label, changes },
  });
  return NextResponse.json({ error: null });
}
