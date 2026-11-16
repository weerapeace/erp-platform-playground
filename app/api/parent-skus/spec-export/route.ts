/**
 * 📤 ส่งออกรายละเอียดสินค้า (หลายรุ่น → Excel)
 *   GET  → { fields }  ช่องที่ผู้ใช้คนนี้เลือกได้ (ตัดช่องราคา/ต้นทุนถ้าไม่มีสิทธิ์)
 *   POST { ids[], fields[], lang, mode, purpose: "preview"|"export" } → { products }  ค่าจริงพร้อมโชว์ (ไฟล์ Excel สร้างที่เบราว์เซอร์)
 *        + purpose=export → บันทึกประวัติการส่งออก (audit action "export" · entity parent_skus_v2)
 *   สิทธิ์: products.view · ช่องอ่อนไหวตามทะเบียนฟิลด์ (sensitive_permission / view_roles)
 *   กฎกลาง: lib/spec-export · ดึงข้อมูล: lib/spec-export-server · คู่มือ: docs/spec-export.md
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { loadSpecCatalog, loadSpecProducts } from "@/lib/spec-export-server";
import { loadMarketingSkuList } from "@/lib/marketing/sku-list-db";
import type { SpecLang, SpecMode } from "@/lib/spec-export";

export const dynamic = "force-dynamic";

const MAX_IDS = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  // ?catalog=1 → รายการรุ่นให้ป๊อปเลือก (ตัวโหลดกลางเดียวกับหน้า SKU การตลาด · ไม่ต้องมีสิทธิ์การตลาด)
  if (request.nextUrl.searchParams.get("catalog") === "1") {
    const list = await loadMarketingSkuList(supabaseAdmin());
    if ("error" in list) return NextResponse.json({ error: list.error }, { status: 500 });
    return NextResponse.json({ data: list.data, error: null }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const fields = await loadSpecCatalog(request, supabaseAdmin());
    return NextResponse.json({ fields, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ fields: [], error: "โหลดรายการช่องไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  let body: { ids?: unknown; fields?: unknown; lang?: unknown; mode?: unknown; images?: unknown; purpose?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).filter((x): x is string => typeof x === "string" && UUID.test(x)))];
  const fields = (Array.isArray(body.fields) ? body.fields : []).filter((x): x is string => typeof x === "string" && /^[ps]:[a-z0-9_]+$/.test(x));
  if (!ids.length) return NextResponse.json({ error: "ยังไม่ได้เลือกสินค้า" }, { status: 400 });
  if (ids.length > MAX_IDS) return NextResponse.json({ error: `ส่งออกได้ครั้งละไม่เกิน ${MAX_IDS} รุ่น` }, { status: 400 });
  if (!fields.length) return NextResponse.json({ error: "ยังไม่ได้เลือกช่อง" }, { status: 400 });
  const lang: SpecLang = body.lang === "th" || body.lang === "both" ? body.lang : "en";
  const mode: SpecMode = body.mode === "parent" || body.mode === "summary" ? body.mode : "kids";

  const admin = supabaseAdmin();
  try {
    const catalog = await loadSpecCatalog(request, admin);
    const allowed = new Set(catalog.map((f) => f.key));
    const blocked = fields.filter((k) => !allowed.has(k));
    const products = await loadSpecProducts(admin, catalog, ids, fields, lang);
    // ดูตัวอย่าง (preview) ไม่บันทึก · กดดาวน์โหลดจริง (purpose=export) = บันทึกประวัติ
    if (body.purpose === "export") await writeAuditFor(request, admin, {
      action: "export", entityType: "parent_skus_v2",
      metadata: {
        feature: "spec_export", label: "ส่งออกรายละเอียดสินค้า (Excel)", format: "excel",
        total_rows: ids.length, exported_rows: products.length, codes: products.slice(0, 50).map((p) => p.code),
        columns: fields.filter((k) => allowed.has(k)), blocked_columns: blocked, lang, mode,
        images: typeof body.images === "string" ? body.images : null,
      },
    });
    return NextResponse.json({ products, blocked, error: null }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ" }, { status: 500 });
  }
}
