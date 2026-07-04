/**
 * /api/parent-skus/[id]/delete-related
 *   GET  → นับ "สิ่งที่ผูกอยู่" กับ Parent SKU (ลูก/รูป/แท็ก/ลงขาย) + ตัวเลือกที่ลบพ่วงได้
 *   POST { images?, children?, mode? } → ลบพ่วง (เรียกก่อนลบ parent — กัน FK ตอนลบถาวร)
 *     images  = ลบรูปทั้งหมด (แกลเลอรี Parent+ลูก → R2 trash · Description assets → trashed)
 *     children= mode hard → ลบตัวลูกจริง · ไม่งั้น → ปิดใช้งานตัวลูก (is_active=false)
 * ของกลาง: guardApi products.edit/delete · supabaseAdmin · r2MoveToTrash
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { r2MoveToTrash, isR2Configured } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function galleryAttachments(admin: ReturnType<typeof supabaseAdmin>, parentId: string) {
  const { data: kids } = await admin.from("skus_v2").select("id").eq("parent_sku_id", parentId);
  const childIds = ((kids ?? []) as { id: string }[]).map((k) => k.id);
  const { data: pAtt } = await admin.from("erp_playground_attachments").select("id, file_path").eq("entity_type", "parent_skus_v2").eq("entity_id", parentId);
  let cAtt: { id: string; file_path: string | null }[] = [];
  if (childIds.length) {
    const { data } = await admin.from("erp_playground_attachments").select("id, file_path").eq("entity_type", "skus_v2").in("entity_id", childIds);
    cAtt = (data ?? []) as { id: string; file_path: string | null }[];
  }
  return { childIds, atts: [...((pAtt ?? []) as { id: string; file_path: string | null }[]), ...cAtt] };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();

  const { childIds, atts } = await galleryAttachments(admin, id);
  const [descRes, tagRes, pfRes] = await Promise.all([
    admin.from("asset_usages").select("asset_id", { count: "exact", head: true }).eq("module", "parent_sku_description").eq("record_id", id),
    admin.from("parent_skus_v2_product_family_m2m").select("tgt_id", { count: "exact", head: true }).eq("src_id", id),
    admin.from("platform_listing_drafts").select("id", { count: "exact", head: true }).eq("parent_sku_id", id),
  ]);
  const childCount = childIds.length;
  const descCount = descRes.count ?? 0;
  const imgCount = atts.length + descCount;
  const tagCount = tagRes.count ?? 0;
  const pfCount = pfRes.count ?? 0;

  const items = [
    { icon: "🏷️", label: "ตัวลูก (SKU)", count: childCount },
    { icon: "🖼️", label: "รูป (แกลเลอรี + Description)", count: imgCount },
    { icon: "🔖", label: "แท็ก", count: tagCount },
    { icon: "🏬", label: "ลงขายแพลตฟอร์ม", count: pfCount },
  ].filter((i) => i.count > 0);

  const options: { key: string; label: string }[] = [];
  if (imgCount > 0) options.push({ key: "images", label: `ลบรูปทั้งหมดด้วย (${imgCount} รูป · ย้ายเข้าถังขยะ กู้คืนได้ 30 วัน)` });
  if (childCount > 0) options.push({ key: "children", label: `ปิด/ลบตัวลูกด้วย (${childCount} ตัว)` });

  return NextResponse.json({ items, options, error: null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  let body: { images?: boolean; children?: boolean; mode?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const hard = body.mode === "hard";

  // 1) รูป — แกลเลอรี (parent+ลูก) → R2 trash · Description assets → trashed (เฉพาะที่ไม่ถูกใช้ที่อื่น)
  if (body.images) {
    const { atts } = await galleryAttachments(admin, id);
    const r2ok = await isR2Configured();
    for (const a of atts) {
      await admin.from("erp_playground_attachments").delete().eq("id", a.id);
      if (r2ok && a.file_path) { try { await r2MoveToTrash(a.file_path); } catch { /* ปล่อยไฟล์ค้าง ดีกว่าล้ม */ } }
    }
    const { data: usages } = await admin.from("asset_usages").select("asset_id").eq("module", "parent_sku_description").eq("record_id", id);
    const assetIds = [...new Set(((usages ?? []) as { asset_id: string }[]).map((u) => u.asset_id))];
    await admin.from("asset_usages").delete().eq("module", "parent_sku_description").eq("record_id", id);
    for (const aid of assetIds) {
      const { count } = await admin.from("asset_usages").select("id", { count: "exact", head: true }).eq("asset_id", aid);
      if ((count ?? 0) === 0) {   // ไม่ถูกใช้ที่อื่นแล้ว → ทิ้งเข้าถังขยะ
        const { data: a } = await admin.from("assets").select("r2_key").eq("id", aid).maybeSingle();
        await admin.from("assets").update({ status: "trashed", trashed_at: new Date().toISOString() }).eq("id", aid);
        if (r2ok && (a as { r2_key?: string } | null)?.r2_key) { try { await r2MoveToTrash((a as { r2_key: string }).r2_key); } catch { /* noop */ } }
      }
    }
  }

  // 2) ตัวลูก — ลบถาวร (hard) หรือ ปิดใช้งาน (soft) · ทำก่อนลบ parent เสมอ (กัน FK)
  if (body.children) {
    if (hard) {
      const { error } = await admin.from("skus_v2").delete().eq("parent_sku_id", id);
      if (error) return NextResponse.json({ error: `ลบตัวลูกไม่สำเร็จ: ${error.message} (อาจมีสต๊อก/ออเดอร์อ้างถึง)` }, { status: 400 });
    } else {
      const { error } = await admin.from("skus_v2").update({ is_active: false }).eq("parent_sku_id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, error: null });
}
