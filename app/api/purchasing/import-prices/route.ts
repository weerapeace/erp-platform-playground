/**
 * POST /api/purchasing/import-prices — นำเข้า "ราคาวัตถุดิบต่อร้าน" จาก Excel/CSV
 *
 * เข้ากับสัญญาของ ImportWizard กลาง: body { entity, rows, mode, actor } → { data: ImportResult }
 * แต่ละแถวต้องมี: sku_code (รหัสวัตถุดิบ) + shop (ชื่อร้าน) + price
 * ไม่บังคับ: currency (THB/RMB) · supplier_sku (รหัสของร้าน) · purchase_link · is_default (ร้านหลัก ★)
 *
 * เขียนเข้า supplier_items (ตารางร้านที่จำหน่ายกลาง) + supplier_price_history เมื่อราคาเปลี่ยน
 * จับคู่ร้านด้วยของกลาง lib/partner-match (ชื่อสลับคำ/วงเล็บ/เว้นวรรคต่างก็เจอ) — ไม่สร้างร้านใหม่ให้เอง
 *
 * mode: create = ข้ามคู่ที่มีราคาแล้ว · update = เฉพาะที่มีอยู่แล้ว · upsert = ทำทั้งสองอย่าง
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { buildPartnerMatcher } from "@/lib/partner-match";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type InRow = Record<string, unknown>;
type Failed = { row: number; sku?: string; code?: string; error: string };

const s = (v: unknown) => (v == null ? "" : String(v).trim());
const numOf = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[, ฿¥$]/g, ""));
  return isFinite(n) ? n : NaN;
};
const isTruthy = (v: unknown) => /^(1|true|yes|y|ใช่|ร้านหลัก|default|★|x)$/i.test(s(v));
/** ภายในเก็บ RMB เป็น "YUAN" สำหรับของจีน (ตามข้อมูลเดิม) แต่รับได้ทั้ง RMB/CNY/¥ */
const curOf = (v: unknown, chinaShop: boolean): string => {
  const t = s(v).toUpperCase().replace("¥", "RMB").replace("฿", "THB");
  if (["RMB", "CNY", "YUAN", "หยวน"].includes(t)) return "RMB";
  if (["THB", "BAHT", "บาท"].includes(t)) return "THB";
  return chinaShop ? "RMB" : "THB";
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await (await supabaseFromRequest(request)).auth.getUser();
  const admin = supabaseAdmin();

  let body: { rows?: InRow[]; mode?: string; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "อ่านข้อมูลไม่ได้" }, { status: 400 }); }
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const mode = body.mode === "update" || body.mode === "upsert" ? body.mode : "create";
  if (!rows.length) return NextResponse.json({ error: "ไม่มีข้อมูลให้นำเข้า" }, { status: 400 });
  if (rows.length > 5000) return NextResponse.json({ error: "นำเข้าได้สูงสุด 5,000 แถวต่อครั้ง" }, { status: 400 });

  // ---- โหลดทะเบียนร้าน + วัตถุดิบที่อ้างถึง (ครั้งเดียว ไม่ query ในลูป) ----
  const { data: pData } = await admin.from("partners_v2")
    .select("id, display_name, name_th, name_en, is_supplier, is_active, shop_country, is_taobao, default_currency").limit(5000);
  type P = { id: string; display_name: string | null; name_th: string | null; name_en: string | null; is_supplier: boolean | null; is_active: boolean | null; shop_country: string | null; is_taobao: boolean | null; default_currency: string | null };
  const partners = (pData ?? []) as unknown as P[];
  const matcher = buildPartnerMatcher(partners);
  const chinaById = new Map(partners.map((p) => [String(p.id),
    p.is_taobao === true || /จีน|china/i.test(String(p.shop_country ?? "")) || String(p.default_currency ?? "") === "RMB"]));

  const codes = [...new Set(rows.map((r) => s(r.sku_code)).filter(Boolean))];
  const skuByCode = new Map<string, string>();
  for (let i = 0; i < codes.length; i += 300) {
    const { data } = await admin.from("skus_v2").select("id, code").in("code", codes.slice(i, i + 300));
    for (const r of (data ?? []) as Record<string, unknown>[]) skuByCode.set(s(r.code), String(r.id));
  }

  // ---- ลุยทีละแถว ----
  const failed: Failed[] = [];
  let created = 0, updated = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNo = i + 2;                                   // +2 = นับหัวตาราง Excel ให้ตรงกับที่ผู้ใช้เห็น
    const code = s(r.sku_code), shopName = s(r.shop);
    const fail = (error: string) => failed.push({ row: rowNo, code, sku: shopName, error });

    const skuId = skuByCode.get(code);
    if (!code) { fail("ไม่ได้ใส่รหัสวัตถุดิบ"); continue; }
    if (!skuId) { fail(`ไม่พบรหัสวัตถุดิบ "${code}" ในระบบ`); continue; }
    const partner = shopName ? matcher.match(shopName) : undefined;
    if (!shopName) { fail("ไม่ได้ใส่ชื่อร้าน"); continue; }
    if (!partner) { fail(`ไม่พบร้าน "${shopName}" ในทะเบียนร้าน — เพิ่มร้านก่อนแล้วนำเข้าใหม่`); continue; }
    const price = numOf(r.price);
    if (!isFinite(price) || price <= 0) { fail(`ราคา "${s(r.price)}" ไม่ถูกต้อง (ต้องเป็นตัวเลขมากกว่า 0)`); continue; }

    const pid = String(partner.id);
    const currency = curOf(r.currency, chinaById.get(pid) === true);
    const supplierSku = s(r.supplier_sku) || null;
    const link = s(r.purchase_link) || null;

    try {
      const { data: exist } = await admin.from("supplier_items")
        .select("id, price").eq("item_sku_id", skuId).eq("supplier_partner_id", pid).maybeSingle();

      if (exist) {
        if (mode === "create") { fail("มีราคาของร้านนี้อยู่แล้ว (เลือกโหมด อัปเดต/ทั้งสองอย่าง ถ้าต้องการทับ)"); continue; }
        const ex = exist as Record<string, unknown>;
        const oldPrice = ex.price == null ? null : Number(ex.price);
        const patch: Record<string, unknown> = { price, currency, is_active: true };
        if (supplierSku) patch.supplier_sku = supplierSku;
        if (link) patch.purchase_link = link;
        const { error } = await admin.from("supplier_items").update(patch).eq("id", String(ex.id));
        if (error) { fail(error.message); continue; }
        if (oldPrice !== price) {
          await admin.from("supplier_price_history").insert({
            supplier_item_id: String(ex.id), item_sku_id: skuId, supplier_partner_id: pid,
            old_price: oldPrice, new_price: price, currency,
            changed_by: user?.id ?? null, changed_by_name: (user?.user_metadata?.name as string) ?? user?.email ?? null,
          });
        }
        updated++;
      } else {
        if (mode === "update") { fail("ยังไม่มีร้านนี้ในตารางร้านของวัตถุดิบ (เลือกโหมด เพิ่ม/ทั้งสองอย่าง)"); continue; }
        // ร้านแรกของวัตถุดิบ → ตั้งเป็นร้านหลัก ★ ให้เลย (หรือสั่งมาในไฟล์)
        const { count } = await admin.from("supplier_items").select("id", { count: "exact", head: true }).eq("item_sku_id", skuId);
        const wantDefault = isTruthy(r.is_default) || (count ?? 0) === 0;
        if (wantDefault && (count ?? 0) > 0) {
          await admin.from("supplier_items").update({ is_default: false }).eq("item_sku_id", skuId).eq("is_default", true);
        }
        const { error } = await admin.from("supplier_items").insert({
          item_sku_id: skuId, supplier_partner_id: pid, price, currency, is_active: true,
          is_default: wantDefault, supplier_sku: supplierSku, purchase_link: link,
        });
        if (error) { fail(error.message); continue; }
        created++;
      }
    } catch (e) { fail(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  }

  const audited = await writeAudit(admin, {
    action: "import", entityType: "supplier_items", entityId: null,
    actorId: user?.id ?? null, actorName: body.actor ?? user?.email ?? null,
    metadata: { source: "import-prices", mode, total: rows.length, created, updated, failed: failed.length },
  }).catch(() => false);

  return NextResponse.json({
    data: { total: rows.length, created, updated, failed, audit_id: audited ? "ok" : "" },
    error: null,
  });
}
