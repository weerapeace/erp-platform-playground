/**
 * ประวัติการแก้/ส่งขึ้นแพลตฟอร์ม ต่อสินค้า — /api/product-platforms/audit
 *  GET ?parent_sku_id=  (products.platforms.view)
 *   → รวม audit_logs ที่เกี่ยวกับสินค้านี้: อ้างด้วย entity_id (parent/SKU) หรือ metadata.parent_sku_id
 *   → คืน { entries: [{ at, actor, action, entity_type, source, metadata }] } เรียงใหม่สุดก่อน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const parentId = (new URL(request.url).searchParams.get("parent_sku_id") ?? "").trim();
  if (!parentId) return NextResponse.json({ error: "ต้องระบุ parent_sku_id" }, { status: 400 });
  const admin = supabaseAdmin();

  const { data: skus } = await admin.from("skus_v2").select("id").eq("parent_sku_id", parentId);
  const ids = [parentId, ...((skus ?? []) as { id: string }[]).map((s) => s.id)];

  const cols = "id, action, entity_type, entity_id, metadata, created_at";
  // 2 ทาง: (ก) entity_id = parent/SKU  (ข) metadata.parent_sku_id = parent (LINE push/create/display/ร่าง)
  const [{ data: byEntity }, { data: byMeta }] = await Promise.all([
    admin.from("audit_logs").select(cols).in("entity_id", ids).order("created_at", { ascending: false }).limit(80),
    admin.from("audit_logs").select(cols).eq("metadata->>parent_sku_id", parentId).order("created_at", { ascending: false }).limit(80),
  ]);

  const map = new Map<string, Record<string, unknown>>();
  for (const r of [...((byEntity ?? []) as Record<string, unknown>[]), ...((byMeta ?? []) as Record<string, unknown>[])]) map.set(String(r.id), r);
  const entries = [...map.values()]
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 80)
    .map((r) => {
      const meta = (r.metadata && typeof r.metadata === "object") ? r.metadata as Record<string, unknown> : {};
      return { at: r.created_at, actor: (meta.actor as string) ?? null, action: String(r.action ?? ""), entity_type: String(r.entity_type ?? ""), source: (meta.source as string) ?? null, metadata: meta };
    });

  return NextResponse.json({ entries, error: null });
}
