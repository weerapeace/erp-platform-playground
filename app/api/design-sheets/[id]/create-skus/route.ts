/**
 * Design Sheets — Wizard สร้าง Parent SKU + SKU ลูก จากใบงานออกแบบ
 *
 * POST /api/design-sheets/[id]/create-skus
 *   body {
 *     parent: { code, name_th, name_en?, product_family?, brand_id? },
 *     skus:  [{ code, name_th, color?, standard_price?, list_price? }, ...]
 *   }
 *
 * - Parent: มีรหัสนี้แล้ว → ใช้ตัวเดิม (ไม่สร้างซ้ำ) · ยังไม่มี → สร้างใหม่
 * - SKU ลูก: ผูก parent_sku_id, รหัสซ้ำ = error ทั้งใบ (กันสร้างครึ่งๆ)
 * - สำเร็จ: อัปเดตสถานะใบงาน = sku_created + เก็บ parent_sku_code · เขียน audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SkuInput = { code?: string; name_th?: string; color?: string; standard_price?: number | null; list_price?: number | null; cover_image_r2_key?: string | null; image_keys?: string[] };
type Body = {
  parent?: { code?: string; name_th?: string; name_en?: string; product_family?: string; brand_id?: string | null; cover_image_r2_key?: string | null; image_keys?: string[] };
  skus?: SkuInput[];
};

// แนบรูป (อ้าง R2 key เดิมจากรูปในใบงาน) เข้าแกลเลอรีของ parent/sku — รูปแรกใช้เป็น cover แยกต่างหาก
async function attachImages(admin: ReturnType<typeof supabaseAdmin>, entityType: string, entityId: string, keys: string[]) {
  for (const key of keys) {
    if (!key) continue;
    const fileName = key.split("/").pop() || key;
    const ext = (fileName.split(".").pop() || "").toLowerCase();
    const ct = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
    try {
      await admin.rpc("erp_playground_attachments_add", {
        p_entity_type: entityType, p_entity_id: entityId,
        p_file_name: fileName, p_file_path: key, p_public_url: `/api/r2-image?key=${encodeURIComponent(key)}`,
        p_content_type: ct, p_size_bytes: null, p_uploaded_by: null,
      });
    } catch { /* แนบรูปพลาด ไม่ให้ล้มทั้งการสร้าง SKU */ }
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.create"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const pCode = (body.parent?.code ?? "").trim();
  const pName = (body.parent?.name_th ?? "").trim();
  if (!pCode) return NextResponse.json({ error: "ต้องระบุรหัส Parent SKU" }, { status: 400 });
  if (!pName) return NextResponse.json({ error: "ต้องระบุชื่อสินค้า (Parent SKU)" }, { status: 400 });

  const skus = (body.skus ?? []).filter((s) => (s.code ?? "").trim());
  if (skus.length === 0) return NextResponse.json({ error: "ต้องมี SKU ลูกอย่างน้อย 1 ตัว" }, { status: 400 });

  // รหัส SKU ห้ามซ้ำกันเองในใบนี้
  const codes = skus.map((s) => s.code!.trim());
  const dupInForm = codes.find((c, i) => codes.indexOf(c) !== i);
  if (dupInForm) return NextResponse.json({ error: `รหัส SKU "${dupInForm}" ซ้ำกันในรายการ` }, { status: 400 });

  const admin = supabaseAdmin();

  // ---- 1) Parent: หาตัวเดิมจากรหัส ถ้าไม่มีค่อยสร้าง ----
  let parentId: string;
  let parentCreated = false;
  const { data: existPar } = await admin.from("parent_skus_v2").select("id").eq("code", pCode).maybeSingle();
  if (existPar?.id) {
    parentId = existPar.id as string;
  } else {
    const { data: newPar, error: pErr } = await admin.from("parent_skus_v2").insert({
      code: pCode, name_th: pName, name_en: body.parent?.name_en?.trim() || null,
      product_family: body.parent?.product_family || "general",
      brand_id: body.parent?.brand_id || null, is_active: true,
      cover_image_r2_key: body.parent?.image_keys?.[0] ?? body.parent?.cover_image_r2_key ?? null,
    }).select("id").single();
    if (pErr || !newPar) return NextResponse.json({ error: friendlyDbError(pErr?.message ?? "สร้าง Parent SKU ไม่สำเร็จ") }, { status: 400 });
    parentId = newPar.id as string; parentCreated = true;
    if (body.parent?.image_keys?.length) await attachImages(admin, "parent_skus_v2", parentId, body.parent.image_keys);
  }

  // ---- 2) SKU ลูก: เช็กรหัสซ้ำในระบบก่อน แล้วค่อย insert ทั้งชุด ----
  const { data: clash } = await admin.from("skus_v2").select("code").in("code", codes);
  if (clash && clash.length > 0) {
    return NextResponse.json({ error: `รหัส SKU มีอยู่ในระบบแล้ว: ${clash.map((c) => c.code).join(", ")}` }, { status: 400 });
  }

  const rows = skus.map((s) => ({
    code: s.code!.trim(), name_th: (s.name_th ?? pName).trim() || pName,
    parent_sku_id: parentId, color: s.color?.trim() || null,
    standard_price: s.standard_price != null ? Number(s.standard_price) : null,
    list_price: s.list_price != null ? Number(s.list_price) : null,
    cover_image_r2_key: s.image_keys?.[0] ?? s.cover_image_r2_key ?? null,
    is_active: true, sale_ok: true, purchase_ok: true,
  }));
  const { data: inserted, error: sErr } = await admin.from("skus_v2").insert(rows).select("id, code");
  if (sErr) {
    // ถ้าเพิ่งสร้าง Parent ใหม่แล้ว SKU พลาด → ลบ Parent คืน กันขยะค้าง
    if (parentCreated) await admin.from("parent_skus_v2").delete().eq("id", parentId);
    return NextResponse.json({ error: friendlyDbError(sErr.message) }, { status: 400 });
  }

  // แนบรูปที่เลือกเข้าแกลเลอรีของแต่ละ SKU ลูก (อ้าง R2 key เดิมจากรูปในใบงาน)
  const codeToId = new Map((inserted ?? []).map((r) => [String(r.code), String(r.id)]));
  for (const s of skus) {
    const sid = codeToId.get((s.code ?? "").trim());
    if (sid && s.image_keys?.length) await attachImages(admin, "skus_v2", sid, s.image_keys);
  }

  // ---- 3) อัปเดตสถานะใบงาน + เก็บรหัส parent ----
  // เติมรหัส Parent เข้า "Parent SKU ที่จะตั้ง" (chips) ของใบ + ตั้ง parent_sku_code หลัก + สถานะ
  const { data: cur } = await admin.from("design_sheets").select("parent_sku_codes").eq("id", id).maybeSingle();
  const curCodes: string[] = Array.isArray(cur?.parent_sku_codes) ? (cur!.parent_sku_codes as string[]) : [];
  const mergedCodes = curCodes.includes(pCode) ? curCodes : [...curCodes, pCode];
  await admin.from("design_sheets").update({ status: "sku_created", parent_sku_code: pCode, parent_sku_codes: mergedCodes, updated_at: new Date().toISOString() }).eq("id", id);

  await writeAudit(admin, {
    action: "create_skus", entityType: "design_sheet", entityId: id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { parent_code: pCode, parent_created: parentCreated, sku_codes: codes },
  });

  return NextResponse.json({
    parent_sku_id: parentId, parent_created: parentCreated,
    sku_ids: (inserted ?? []).map((r) => r.id), count: rows.length, error: null,
  });
}
