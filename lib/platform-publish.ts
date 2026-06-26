// ============================================================
// platform-publish (server-only) — service กลางลงขายขึ้นแพลตฟอร์ม (เฟส 2)
// pipeline ในบ้าน: validate → หาร้านตามแบรนด์ → สร้าง job → connector → เก็บผล/สถานะ/audit
// ตอนนี้ใช้ mock connector (ยังไม่มี API key จริง) · ต่อ connector จริงทีละแพลตฟอร์มได้ทีหลัง
// ============================================================
/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeAudit } from "@/lib/audit";

type Admin = any;
type VariantFlag = { has_price: boolean; has_image: boolean };

/** ตรวจความพร้อมก่อน publish (ฝั่ง server — กันข้าม validation) */
export function validateForPublish(draft: any, variants: VariantFlag[]): { ok: boolean; reasons: string[] } {
  const r: string[] = [];
  if (!String(draft?.title ?? "").trim()) r.push("ยังไม่มีชื่อสินค้า");
  if (!String(draft?.description ?? "").trim()) r.push("ยังไม่มีรายละเอียด");
  if (!String(draft?.category_path ?? "").trim()) r.push("ยังไม่เลือกหมวดหมู่ปลายทาง");
  if (!Array.isArray(draft?.image_keys) || draft.image_keys.length === 0) r.push("ยังไม่เลือกรูป");
  if (variants.length === 0) r.push("ยังไม่มี SKU");
  else {
    if (!variants.every((v) => v.has_price)) r.push("SKU บางตัวไม่มีราคา");
    if (!variants.every((v) => v.has_image)) r.push("SKU บางตัวไม่มีรูป");
  }
  return { ok: r.length === 0, reasons: r };
}

// mock connector — แทน API จริงของแต่ละเจ้า (ต่อทีหลัง) คืนรหัสสินค้าบนแพลตฟอร์ม (จำลอง)
function mockConnector(platformCode: string): { platform_product_id: string; review_link: string | null } {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return { platform_product_id: `MOCK-${platformCode.toUpperCase()}-${rnd}`, review_link: null };
}

/** ลงขายสินค้า 1 ตัวขึ้น 1 แพลตฟอร์ม — โยน error เป็นภาษาคนถ้าไม่ผ่าน */
export async function publishOne(admin: Admin, parentSkuId: string, platformId: string, userId: string | null): Promise<{ platform_product_id: string; review_link: string | null }> {
  const [{ data: parent }, { data: platform }, { data: draft }, { data: skus }] = await Promise.all([
    admin.from("parent_skus_v2").select("id, code, brand_id").eq("id", parentSkuId).maybeSingle(),
    admin.from("erp_platforms").select("id, code, name_th").eq("id", platformId).maybeSingle(),
    admin.from("platform_listing_drafts").select("*").eq("parent_sku_id", parentSkuId).eq("platform_id", platformId).maybeSingle(),
    admin.from("skus_v2").select("list_price, cover_image_r2_key, is_active").eq("parent_sku_id", parentSkuId),
  ]);
  if (!parent) throw new Error("ไม่พบสินค้า");
  if (!platform) throw new Error("ไม่พบแพลตฟอร์ม");
  if (!draft) throw new Error("ยังไม่มีร่างสำหรับแพลตฟอร์มนี้");

  const variants = ((skus ?? []) as any[]).map((s) => ({ has_price: s.list_price != null && Number(s.list_price) > 0, has_image: !!s.cover_image_r2_key }));
  const v = validateForPublish(draft, variants);
  if (!v.ok) throw new Error("ข้อมูลยังไม่ครบ: " + v.reasons.join(", "));

  // ร้านตามแบรนด์ (แบรนด์ × แพลตฟอร์ม)
  const { data: acct } = await admin.from("platform_accounts").select("id, label").eq("brand_id", parent.brand_id).eq("platform_id", platformId).eq("is_active", true).maybeSingle();
  if (!acct) throw new Error(`แบรนด์นี้ยังไม่มีร้าน ${platform.name_th} — ตั้งค่าที่ จัดการร้าน/บัญชีแพลตฟอร์ม`);

  // ถ้ามีรหัสสินค้าบนแพลตฟอร์มอยู่แล้ว = ส่ง update (ไม่งั้น = publish ใหม่)
  const isUpdate = !!draft.platform_product_id;
  const jobType = isUpdate ? "update" : "publish";
  const { data: job } = await admin.from("platform_publish_jobs").insert({ parent_sku_id: parentSkuId, platform_id: platformId, account_id: acct.id, job_type: jobType, status: "processing", created_by: userId }).select("id").single();
  try {
    const res = isUpdate ? { platform_product_id: String(draft.platform_product_id), review_link: (draft.review_link as string) ?? null } : mockConnector(platform.code);
    await admin.from("platform_listing_drafts").update({ status: "published", platform_product_id: res.platform_product_id, review_link: res.review_link, last_sync_status: "success", last_synced_at: new Date().toISOString(), last_error: null, updated_by: userId }).eq("id", draft.id);
    await admin.from("platform_publish_jobs").update({ status: "success", result: res, finished_at: new Date().toISOString() }).eq("id", job!.id);
    await writeAudit(admin, { action: jobType, entityType: "platform_listing_draft", entityId: String(draft.id), actorId: userId, actorName: null, metadata: { parent_sku_id: parentSkuId, platform: platform.code, platform_product_id: res.platform_product_id, mock: true } });
    return res;
  } catch (e) {
    const msg = (e as Error).message;
    await admin.from("platform_listing_drafts").update({ last_sync_status: "failed", last_error: msg, last_synced_at: new Date().toISOString() }).eq("id", draft.id);
    await admin.from("platform_publish_jobs").update({ status: "failed", error_message: msg, finished_at: new Date().toISOString() }).eq("id", job!.id);
    throw e;
  }
}
