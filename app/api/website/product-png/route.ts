/**
 * 🖼 รูปตัดพื้น (PNG) ของรุ่น — /api/website/product-png
 *
 * POST { parentId, key: r2 key | null }  → บันทึกลง parent_skus_v2.png_image_r2_key + audit + ล้างแคชเว็บร้าน (ทุกร้านที่เปิดอยู่)
 * ใช้โดยของกลาง components/png-slot (ช่องใหญ่ใส่ PNG): Parent SKU คอลัมน์ซ้าย · ตัวจัดหน้า แผง "🖼 รูป PNG ของสินค้า" (การ์ดบนฉาก)
 * สิทธิ์ products.edit + สิทธิ์ระดับฟิลด์ (ฟิลด์นี้ห้ามแก้สำหรับ role นี้ = 403) · ไฟล์เก่าไม่ลบ (อาจใช้ที่อื่นอยู่)
 * ล้างแคชทันที → เว็บ/พรีวิวในตัวจัดหน้าเห็นรูปใหม่เลย ไม่ต้องรอ 60 วิ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { getFieldAccess } from "@/lib/field-permissions";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COLUMN = "png_image_r2_key";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_RE = /^[\w\-./%()]{1,300}$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  let body: { parentId?: unknown; key?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parentId = String(body.parentId ?? "");
  if (!UUID_RE.test(parentId)) return NextResponse.json({ error: "ไม่พบรุ่นสินค้า" }, { status: 400 });
  const key = body.key == null || body.key === "" ? null : String(body.key).trim();
  if (key !== null && !KEY_RE.test(key)) return NextResponse.json({ error: "ไฟล์รูปไม่ถูกต้อง" }, { status: 400 });

  const sb = supabaseAdmin();
  const access = await getFieldAccess(request, sb, "parent_skus_v2");
  if (access.readonlyCols.includes(COLUMN)) return NextResponse.json({ error: "คุณไม่มีสิทธิ์แก้รูปตัดพื้น (PNG)" }, { status: 403 });

  const { data: before } = await sb.from("parent_skus_v2").select(`id, code, ${COLUMN}`).eq("id", parentId).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบรุ่นสินค้า" }, { status: 404 });
  const prev = before as unknown as { id: string; code: string | null } & Record<string, string | null>;
  const old = prev[COLUMN] ?? null;
  if (old === key) return NextResponse.json({ ok: true, key, unchanged: true });

  const { error } = await sb.from("parent_skus_v2").update({ [COLUMN]: key }).eq("id", parentId);
  if (error) {
    console.error("[website/product-png] update", error.message);
    return NextResponse.json({ error: "บันทึกรูปไม่สำเร็จ" }, { status: 500 });
  }
  await writeAudit(sb, {
    action: "update",
    entityType: "parent_skus_v2",
    entityId: parentId,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { code: prev.code, field: COLUMN, old_value: old, new_value: key, via: "png-slot" },
  });
  // รูปเป็นของรุ่น (ใช้ได้ทุกร้าน) → ล้างแคชทุกร้านที่เปิดอยู่
  const { data: shops } = await sb.from("shops").select("id").eq("status", "active");
  const purged = (await Promise.all(((shops ?? []) as { id: string }[]).map((s) => purgeStorefrontCache(sb, s.id)))).some(Boolean);
  return NextResponse.json({ ok: true, key, purged });
}
