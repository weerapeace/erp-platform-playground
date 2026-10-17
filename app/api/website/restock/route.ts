/**
 * 🔔 รายชื่อ "แจ้งฉันเมื่อมีของ" ของร้าน — /api/website/restock (แท็บ "🏪 ข้อมูลร้าน" + drawer สินค้าบนเว็บ)
 *
 * GET    ?shop=<slug>|shopId=<uuid> [&status=pending|notified|cancelled|all] [&parent=<uuid>] [&countOnly=1]
 *        → { rows:[{…, product:{code,name}}], counts:{pending,notified,cancelled} }
 * PATCH  { ids:[uuid], status } → เปลี่ยนสถานะ (แจ้งแล้ว = บันทึกเวลา+คนแจ้ง) + audit
 * DELETE ?id=<uuid>             → ลบ 1 รายการ + audit
 *
 * ของกลาง: guardApi(products.view/edit) + writeAudit · ข้อมูลส่วนตัวลูกค้า (อีเมล/เบอร์) — อ่านได้เฉพาะคนมีสิทธิ์ดูสินค้า
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit, writeAuditMany } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["pending", "notified", "cancelled"] as const;
type Status = (typeof STATUSES)[number];

async function shopIdOf(sb: ReturnType<typeof supabaseAdmin>, p: URLSearchParams): Promise<string | null> {
  const id = (p.get("shopId") ?? "").trim();
  if (UUID.test(id)) return id;
  const slug = (p.get("shop") ?? "").trim();
  if (!slug) return null;
  const { data } = await sb.from("shops").select("id").eq("slug", slug).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const p = new URL(request.url).searchParams;
  const sb = supabaseAdmin();
  const shopId = await shopIdOf(sb, p);
  if (!shopId) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const parent = (p.get("parent") ?? "").trim();
  const status = (p.get("status") ?? "pending").trim();

  // นับตามสถานะ (ป้าย/แท็บ)
  const counts: Record<Status, number> = { pending: 0, notified: 0, cancelled: 0 };
  await Promise.all(
    STATUSES.map(async (st) => {
      let q = sb.from("store_restock_requests").select("id", { count: "exact", head: true }).eq("shop_id", shopId).eq("status", st);
      if (UUID.test(parent)) q = q.eq("parent_sku_id", parent);
      const { count } = await q;
      counts[st] = count ?? 0;
    }),
  );
  if (p.get("countOnly") === "1") return NextResponse.json({ rows: [], counts });

  let q = sb
    .from("store_restock_requests")
    .select("id, parent_sku_id, option_label, contact_type, contact, name, status, notified_at, notified_by, created_at, parent_skus_v2(code, name_th)")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (UUID.test(parent)) q = q.eq("parent_sku_id", parent);
  if ((STATUSES as readonly string[]).includes(status)) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: "โหลดรายชื่อไม่สำเร็จ", rows: [], counts }, { status: 500 });
  type Row = { parent_skus_v2: { code: string | null; name_th: string | null } | null } & Record<string, unknown>;
  const rows = ((data ?? []) as unknown as Row[]).map(({ parent_skus_v2: ps, ...r }) => ({ ...r, product: { code: ps?.code ?? "", name: ps?.name_th ?? "" } }));
  return NextResponse.json({ rows, counts });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  let body: { ids?: unknown; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  }
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 500);
  const status = (STATUSES as readonly string[]).includes(body.status as string) ? (body.status as Status) : null;
  if (!ids.length || !status) return NextResponse.json({ error: "ต้องระบุรายการและสถานะ" }, { status: 400 });

  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  const sb = supabaseAdmin();
  const patch =
    status === "notified"
      ? { status, notified_at: new Date().toISOString(), notified_by: user?.email ?? null }
      : { status, ...(status === "pending" ? { notified_at: null, notified_by: null } : {}) };
  const { data, error } = await sb.from("store_restock_requests").update(patch).in("id", ids).select("id, shop_id, parent_sku_id");
  if (error) {
    // กลับเป็น "รอแจ้ง" ซ้ำกับรายการที่รออยู่แล้ว (ช่องทาง/สินค้าเดิม)
    if (error.code === "23505") return NextResponse.json({ error: "มีรายการเดียวกันที่รอแจ้งอยู่แล้ว" }, { status: 409 });
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
  const done = (data ?? []) as { id: string; shop_id: string; parent_sku_id: string }[];
  // ทุกรายการมีประวัติของตัวเอง (1 แถวต่อรายการ)
  await writeAuditMany(
    sb,
    done.map((d) => ({
      action: status === "notified" ? "restock_notified" : status === "cancelled" ? "restock_cancelled" : "restock_reopen",
      entityType: "store_restock_request",
      entityId: d.id,
      actorId: user?.id ?? null,
      actorName: user?.email ?? null,
      metadata: { shop_id: d.shop_id, parent_sku_id: d.parent_sku_id, status },
    })),
  );
  return NextResponse.json({ ok: true, updated: done.length });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!UUID.test(id)) return NextResponse.json({ error: "ต้องระบุ id" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: row } = await sb.from("store_restock_requests").select("id, shop_id, parent_sku_id, contact_type").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
  const { error } = await sb.from("store_restock_requests").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 500 });
  const r = row as { id: string; shop_id: string; parent_sku_id: string; contact_type: string };
  await writeAudit(sb, {
    action: "delete",
    entityType: "store_restock_request",
    entityId: r.id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { shop_id: r.shop_id, parent_sku_id: r.parent_sku_id, contact_type: r.contact_type },
  });
  return NextResponse.json({ ok: true });
}
