/**
 * POST /api/scan/resolve   body: { code: string }
 * ของกลาง — "สแกนอะไรมา แล้วมันคือใบไหน / ควรไปหน้าไหน"
 *
 * ทำไมเป็น POST ไม่ใช่ GET:
 *   รหัสสินค้าจริง 5,430 จาก 12,726 ตัว (43%) มีตัว "#" อยู่ในรหัส
 *   ถ้าส่งผ่าน query string จะโดน apiFetch แปลง %23 → %20 (กติกากันบั๊ก Cloudflare เดิม) → รหัสเพี้ยน
 *   ส่งใน body ปลอดภัยกว่า
 *
 * ปลายทางกำหนดที่นี่ที่เดียว → เปลี่ยนหน้าปลายทางทีหลังได้โดยไม่ต้องพิมพ์ QR ใหม่
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { parseScanned, type ScanKind } from "@/lib/scan-code";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type ScanHit = {
  kind: ScanKind;
  id: string;
  /** เลขเอกสาร / รหัสสินค้า ที่หาเจอจริง */
  code: string;
  title: string;
  subtitle: string;
  /** หน้าที่ควรเปิด */
  href: string;
  status: string | null;
};

type Row = Record<string, unknown>;
const str = (v: unknown): string => String(v ?? "").trim();

/** ค้นแบบ "ตรงเป๊ะก่อน" ตามมาตรฐานการค้นหาของระบบ */
async function findDoc(kind: ScanKind, code: string, byId: boolean): Promise<ScanHit | null> {
  const admin = supabaseAdmin();

  if (kind === "po") {
    const q = admin.from("purchase_orders_v2").select("id, po_no, seller_name, order_date, status, grand_total, currency");
    const { data } = byId ? await q.eq("id", code).maybeSingle() : await q.ilike("po_no", code).maybeSingle();
    if (!data) return null;
    const r = data as Row;
    return {
      kind: "po", id: str(r.id), code: str(r.po_no), status: str(r.status) || null,
      title: `ใบสั่งซื้อ ${str(r.po_no)}`,
      subtitle: [str(r.seller_name), str(r.order_date).slice(0, 10)].filter(Boolean).join(" · "),
      href: `/print/purchase-order/${str(r.id)}`,
    };
  }

  if (kind === "mo") {
    const q = admin.from("manufacturing_orders").select("id, mo_no, product_sku, product_name, qty, status, due_date");
    const { data } = byId ? await q.eq("id", code).maybeSingle() : await q.ilike("mo_no", code).maybeSingle();
    if (!data) return null;
    const r = data as Row;
    return {
      kind: "mo", id: str(r.id), code: str(r.mo_no), status: str(r.status) || null,
      title: `ใบสั่งผลิต ${str(r.mo_no)}`,
      subtitle: [str(r.product_sku), str(r.product_name)].filter(Boolean).join(" · "),
      href: `/print/work-order/${str(r.id)}`,
    };
  }

  if (kind === "pr") {
    const q = admin.from("purchase_requests_v2").select("id, pr_no, item_name, requester, status");
    const { data } = byId ? await q.eq("id", code).maybeSingle() : await q.ilike("pr_no", code).maybeSingle();
    if (!data) return null;
    const r = data as Row;
    return {
      kind: "pr", id: str(r.id), code: str(r.pr_no), status: str(r.status) || null,
      title: `ใบขอซื้อ ${str(r.pr_no)}`,
      subtitle: [str(r.item_name), str(r.requester)].filter(Boolean).join(" · "),
      href: `/print/purchase-request/${str(r.id)}`,
    };
  }

  return null;
}

/** สินค้า: ลอง SKU ลูก (barcode → code) แล้วค่อย Parent */
async function findSku(code: string, byId: boolean): Promise<ScanHit | null> {
  const admin = supabaseAdmin();
  const sel = "id, code, barcode, name_th, name_en, is_active";

  if (byId) {
    const { data } = await admin.from("skus_v2").select(sel).eq("id", code).maybeSingle();
    if (data) return skuHit(data as Row);
    const { data: p } = await admin.from("parent_skus_v2").select("id, code, name_th, sku_name, is_active").eq("id", code).maybeSingle();
    return p ? parentHit(p as Row) : null;
  }

  const { data: byBarcode } = await admin.from("skus_v2").select(sel).ilike("barcode", code).limit(1);
  if (byBarcode?.length) return skuHit(byBarcode[0] as Row);

  const { data: byCode } = await admin.from("skus_v2").select(sel).ilike("code", code).limit(1);
  if (byCode?.length) return skuHit(byCode[0] as Row);

  const { data: parents } = await admin.from("parent_skus_v2").select("id, code, name_th, sku_name, is_active").ilike("code", code).limit(1);
  if (parents?.length) return parentHit(parents[0] as Row);

  return null;
}

const skuHit = (r: Row): ScanHit => ({
  kind: "sku", id: str(r.id), code: str(r.code), status: r.is_active === false ? "inactive" : null,
  title: str(r.name_th) || str(r.name_en) || str(r.code),
  subtitle: `รหัส ${str(r.code)}`,
  href: `/master/skus?open=${encodeURIComponent(str(r.id))}`,
});

const parentHit = (r: Row): ScanHit => ({
  kind: "sku", id: str(r.id), code: str(r.code), status: r.is_active === false ? "inactive" : null,
  title: str(r.name_th) || str(r.sku_name) || str(r.code),
  subtitle: `สินค้าหลัก · รหัส ${str(r.code)}`,
  href: `/master/parent-skus?open=${encodeURIComponent(str(r.id))}`,
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;

  let body: { code?: string };
  try { body = await request.json(); }
  catch { return NextResponse.json({ data: null, error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }

  const raw = str(body.code);
  if (!raw) return NextResponse.json({ data: null, error: "ไม่ได้ส่งรหัสมา" }, { status: 400 });

  const parsed = parseScanned(raw);
  if (!parsed.code) {
    return NextResponse.json({ data: null, parsed, error: "อ่านรหัสไม่ออก" }, { status: 404 });
  }

  let hit: ScanHit | null = null;

  if (parsed.kind === "sku") {
    hit = await findSku(parsed.code, parsed.byId);
  } else if (parsed.kind === "unknown") {
    // uuid หรืออ่านชนิดไม่ออก → ไล่ลองทีละแบบ (QR รุ่นเก่าที่ฝัง id ไว้จะเข้าทางนี้)
    for (const k of ["mo", "po", "pr"] as ScanKind[]) {
      hit = await findDoc(k, parsed.code, parsed.byId);
      if (hit) break;
    }
    if (!hit) hit = await findSku(parsed.code, parsed.byId);
  } else {
    hit = await findDoc(parsed.kind, parsed.code, parsed.byId);
  }

  if (!hit) {
    return NextResponse.json(
      { data: null, parsed, error: `ไม่พบข้อมูลของรหัส "${parsed.code}" ในระบบ` },
      { status: 404 },
    );
  }

  return NextResponse.json({ data: hit, parsed, error: null });
}
