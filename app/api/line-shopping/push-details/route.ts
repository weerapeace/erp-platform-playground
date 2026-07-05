/**
 * ส่งรายละเอียดสินค้า ERP → LINE SHOPPING (ชื่อ/รายละเอียด/แบรนด์/หมวด) — /api/line-shopping/push-details
 *  POST { brand_id, parent_sku_id? }  (products.platforms.edit)
 *   → สินค้า LINE ที่จับคู่ ERP + มีร่าง (platform_listing_drafts) → PATCH /products/{id} (lineUpdateProduct)
 *   หมายเหตุ: ยังไม่ส่งรูป/น้ำหนัก/บาร์โค้ด (เฟสย่อยถัดไป — รูปต้องเป็น URL สาธารณะ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { lineUpdateProduct } from "@/lib/line-shopping";
import { decryptSecret } from "@/lib/secret-box";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const baseUrl = () => (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "https://erp-platform-playground.vercel.app").replace(/\/$/, "");
// ฝังรูปประกอบรายละเอียด (Description) เป็น <img> ต่อท้าย — HTML valid: self-close + URL param เดียว (ไม่มี & ดิบ) + จำกัด ~2000 ตัวอักษร
function descWithImages(text: string, keys: string[]): string {
  let html = String(text || "");
  for (const k of keys) {
    const tag = `<p><img src="${baseUrl()}/api/r2-image?key=${encodeURIComponent(k)}"/></p>`;
    if (html.length + tag.length > 1990) break;
    html += tag;
  }
  return html;
}

// แยก categoryId จาก category_path ("42 · กระเป๋า" → "42" · หรือขึ้นต้นด้วยตัวเลข)
function catIdOf(path: unknown): string | null {
  const s = String(path ?? "").trim(); if (!s) return null;
  if (s.includes(" · ")) return s.split(" · ")[0].trim() || null;
  const m = s.match(/^(\d+)\b/); return m ? m[1] : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { brand_id?: string; parent_sku_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const brand_id = (body.brand_id ?? "").trim();
  if (!brand_id) return NextResponse.json({ error: "ต้องเลือกแบรนด์/ร้านก่อน" }, { status: 400 });
  const onlyParent = (body.parent_sku_id ?? "").trim();

  const admin = supabaseAdmin();
  const { data: pf } = await admin.from("erp_platforms").select("id").eq("code", "line_shopping").maybeSingle();
  const platform_id = (pf as { id?: string } | null)?.id;
  if (!platform_id) return NextResponse.json({ error: "ยังไม่มีแพลตฟอร์ม LINE SHOPPING" }, { status: 400 });

  const { data: cred } = await admin.from("platform_credentials").select("api_key").eq("brand_id", brand_id).eq("platform_id", platform_id).maybeSingle();
  const stored = (cred as { api_key?: string } | null)?.api_key;
  if (!stored) return NextResponse.json({ error: "ยังไม่ได้ใส่ API Key ของแบรนด์นี้" }, { status: 400 });
  let apiKey: string;
  try { apiKey = await decryptSecret(stored); } catch { return NextResponse.json({ error: "ถอดรหัสคีย์ไม่ได้ (กุญแจหลักไม่ตรง/หาย?)" }, { status: 400 }); }

  // สินค้า LINE ที่จับคู่แล้ว
  let lq = admin.from("platform_catalog_listings").select("external_product_id, title, matched_parent_sku_id").eq("platform_id", platform_id).eq("brand_id", brand_id).not("matched_parent_sku_id", "is", null);
  if (onlyParent) lq = lq.eq("matched_parent_sku_id", onlyParent);
  const { data: listings } = await lq;
  const rows = (listings ?? []) as { external_product_id: string; title: string | null; matched_parent_sku_id: string }[];
  if (rows.length === 0) return NextResponse.json({ ok: true, note: "ไม่มีสินค้าที่จับคู่ ERP แล้วให้ส่ง", total: 0, okCount: 0, results: [], error: null });

  // ร่างต่อ parent (ชื่อ/รายละเอียด/หมวด/extra) ของแพลตฟอร์ม LINE
  const parentIds = [...new Set(rows.map((r) => r.matched_parent_sku_id))];
  const draftByParent = new Map<string, { title?: string; description?: string; category_path?: string; extra?: Record<string, unknown>; description_image_keys?: string[] }>();
  for (let i = 0; i < parentIds.length; i += 300) {
    const { data: ds } = await admin.from("platform_listing_drafts").select("parent_sku_id, title, description, category_path, extra, description_image_keys").eq("platform_id", platform_id).in("parent_sku_id", parentIds.slice(i, i + 300));
    for (const d of ((ds ?? []) as Record<string, unknown>[])) draftByParent.set(String(d.parent_sku_id), { title: (d.title as string) ?? "", description: (d.description as string) ?? "", category_path: (d.category_path as string) ?? "", extra: (d.extra as Record<string, unknown>) ?? {}, description_image_keys: (d.description_image_keys as string[]) ?? [] });
  }

  const results: { product: string; ok: boolean; sent?: string[]; error?: string }[] = [];
  let okCount = 0;
  for (const r of rows) {
    const d = draftByParent.get(r.matched_parent_sku_id) ?? {};
    const fields = { name: d.title, description: descWithImages(d.description ?? "", d.description_image_keys ?? []), brand: (d.extra?.brand as string) ?? "", categoryId: catIdOf(d.category_path) ?? undefined };
    const res = await lineUpdateProduct(apiKey, r.external_product_id, fields);
    if (res.ok) okCount++;
    results.push({ product: r.title ?? r.external_product_id, ok: res.ok, sent: res.sent, error: res.ok ? undefined : res.error });
  }

  await writeAudit(admin, { action: "update", entityType: "platform_catalog", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { source: "line_push_details", brand_id, parent_sku_id: onlyParent || null, products: rows.length, ok: okCount } });
  return NextResponse.json({ ok: true, total: rows.length, okCount, results, error: null });
}
