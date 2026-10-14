/**
 * อัลบั้ม "ของตกแต่งเว็บ" ของแต่ละร้าน (ผืนผ้าใบอิสระ → คลังของตกแต่ง → ของร้าน)
 *
 * POST { shopId, kind? } → คืน { albumId, albumName } — ยังไม่มีก็สร้างให้ใน "คลังไฟล์กลาง" (asset_collections)
 *   kind "decor" (ค่าเริ่มต้น) = ของตกแต่ง → store_settings key "canvas_decor_album"
 *   kind "frame" = กรอบรูป PNG ที่วางทับรูป → key "canvas_frame_album"
 *   (จำ id ไว้ที่ store_settings ของร้าน — เปลี่ยนชื่ออัลบั้มทีหลังได้ ไม่หลุด)
 *
 * ไฟล์ในอัลบั้ม: อัปโหลด/ดู/ลบ ผ่าน API คลังไฟล์เดิม (/api/assets?collection_id=… · POST /api/assets · DELETE /api/assets/[id])
 * → ได้กันไฟล์ซ้ำ · ถังขยะกู้คืนได้ · กันลบไฟล์ที่ยังถูกใช้ (asset_usages) · audit log ครบ โดยไม่ต้องเขียนซ้ำ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const KINDS = {
  decor: { key: "canvas_decor_album", name: "ของตกแต่งเว็บ", desc: "ของตกแต่งที่อัปโหลดสำหรับผืนผ้าใบอิสระ" },
  frame: { key: "canvas_frame_album", name: "กรอบรูปเว็บ", desc: "กรอบรูป PNG พื้นใสที่อัปโหลดไว้วางทับรูปบนผืนผ้าใบอิสระ" },
} as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;

  let body: { shopId?: string; kind?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.shopId) return NextResponse.json({ error: "ต้องระบุ shopId" }, { status: 400 });
  const kind = body.kind === "frame" ? KINDS.frame : KINDS.decor;
  const KEY = kind.key;

  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id, name, slug").eq("id", body.shopId).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as { id: string; name: string; slug: string };

  // มีอัลบั้มที่จำไว้และยังอยู่ → ใช้ตัวเดิม
  const { data: setting } = await sb.from("store_settings").select("value").eq("shop_id", s.id).eq("key", KEY).maybeSingle();
  const savedId = String((setting as { value?: string } | null)?.value ?? "").trim();
  if (savedId) {
    const { data: col } = await sb.from("asset_collections").select("id, name").eq("id", savedId).maybeSingle();
    if (col) return NextResponse.json({ albumId: (col as { id: string }).id, albumName: (col as { name: string }).name });
  }

  // ยังไม่มี (หรือถูกลบไป) → สร้างใหม่
  const albumName = `${kind.name} · ${s.name}`;
  const { data: created, error } = await sb
    .from("asset_collections")
    .insert({ name: albumName, description: `${kind.desc} ของร้าน ${s.name} (สร้างอัตโนมัติจากตัวจัดหน้าเว็บ)` })
    .select("id, name")
    .maybeSingle();
  if (error || !created) return NextResponse.json({ error: "สร้างอัลบั้มของตกแต่งไม่สำเร็จ" }, { status: 500 });
  const albumId = (created as { id: string }).id;
  await sb.from("store_settings").upsert({ shop_id: s.id, key: KEY, value: albumId, updated_at: new Date().toISOString() }, { onConflict: "shop_id,key" });

  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(sb, {
    action: "create",
    entityType: "asset_collection",
    entityId: albumId,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { name: albumName, shop: s.slug, purpose: kind.key === "canvas_frame_album" ? "canvas_frame" : "canvas_decor" },
  });

  return NextResponse.json({ albumId, albumName });
}
