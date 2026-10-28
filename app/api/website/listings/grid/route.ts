/**
 * ▦ แก้ไขแบบตาราง (หน้า "สินค้าบนเว็บ") — /api/website/listings/grid
 *
 * GET  ?shopId=<id>&level=product|color&pcols=a,b&scols=c,d (คอลัมน์ที่เลือกในตาราง · ต้องอยู่ในทะเบียนฟิลด์) [&parentIds=x,y เฉพาะบางรุ่น]
 *      → listings: ค่าฝั่งเว็บของทุกรุ่นในร้าน (คอลัมน์ WEB_GRID_COLUMNS)
 *        parents: แถว Parent SKU · skus (level=color): SKU ลูกที่ใช้งานของรุ่นในร้าน — เฉพาะ id/code + คอลัมน์ที่ขอ
 *        อ่านผ่านตัวกลางชุดเดียวกับตาราง master (resolveEntity + ชื่อ relation + ซ่อนฟิลด์ตามสิทธิ์ + ปิดค่าความลับ)
 * POST { shopId, changes:[{ parentId, patch }] } → บันทึกช่องฝั่งเว็บหลายรุ่นในครั้งเดียว
 *      patch = ListingPatch เฉพาะ WEB_GRID_PATCH_KEYS → listingPatchToRow (ตัวกรองชุดเดียวกับตัวตั้งค่าเว็บของสินค้า)
 *      audit ทีละรุ่น (ค่าเดิม/ใหม่) + ล้างแคชเว็บร้านครั้งเดียว
 * ช่อง ERP (Parent SKU / SKU) หน้าจอบันทึกผ่าน PATCH /api/master-v2/<module>/<id> ตัวกลางเดิม (สิทธิ์ระดับฟิลด์ · ฟิลด์บังคับ · ประวัติ · audit)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { getFieldAccess, stripHidden } from "@/lib/field-permissions";
import { maskSecretRows } from "@/lib/settings-secrets";
import { resolveEntity, resolveRelationLabels } from "@/app/api/master-v2/[entity]/route";
import { listingPatchToRow, type ListingPatch } from "@/lib/website-listing-patch";
import { WEB_GRID_COLUMNS, sanitizeGridPatch, type WebGridRow } from "@/lib/website-listing-fields";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f-]{36}$/i;
const SAFE_COL = /^[a-z_][a-z0-9_]*$/;
const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
type Row = Record<string, unknown>;

/**
 * แถวของโมดูล master ตามตัวกลาง — เฉพาะคอลัมน์ที่หน้าจอขอ (ต้องอยู่ในทะเบียนฟิลด์ของโมดูลนั้น · กันโหลดทุกคอลัมน์ของ SKU นับพันแถว)
 * + ชื่อ relation (resolveRelationLabels) · ซ่อนฟิลด์ตามสิทธิ์ · ปิดค่าความลับ
 */
async function loadModuleRows(request: NextRequest, moduleKey: string, filterCol: "id" | "parent_sku_id", ids: string[], wanted: string[]): Promise<Row[] | null> {
  const cfg = await resolveEntity(moduleKey);
  if (!cfg) return null;
  const sb = supabaseAdmin();
  const accessP = getFieldAccess(request, sb, cfg.table);
  const { data: mod } = await sb.from("erp_modules").select("id").eq("module_key", moduleKey).maybeSingle();
  const { data: flds } = mod ? await sb.from("erp_module_fields").select("column_name").eq("module_id", (mod as { id: string }).id).eq("is_active", true) : { data: [] };
  const known = new Set(((flds ?? []) as { column_name: string | null }[]).map((f) => f.column_name).filter(Boolean) as string[]);
  const cols = [...new Set(["id", "code", ...(filterCol === "parent_sku_id" ? ["parent_sku_id"] : []), ...wanted.filter((c) => SAFE_COL.test(c) && known.has(c))])];
  const rows: Row[] = [];
  for (const part of chunk(ids, 150)) {
    let q = sb.from(cfg.table).select(cols.join(", ")).in(filterCol, part);
    if (cfg.softDeleteColumn && filterCol !== "id") q = q.eq(cfg.softDeleteColumn, true);
    const { data, error } = await q;
    if (error) return null;
    rows.push(...((data ?? []) as unknown as Row[]));
  }
  const labeled = await resolveRelationLabels(supabaseFromRequest(request), cfg, rows);
  const access = await accessP;
  return maskSecretRows(cfg.table, stripHidden(labeled, access.hiddenCols));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const url = new URL(request.url);
  const shopId = (url.searchParams.get("shopId") ?? "").trim();
  const level = url.searchParams.get("level") === "color" ? "color" : "product";
  if (!UUID.test(shopId)) return NextResponse.json({ error: "ต้องระบุ shopId" }, { status: 400 });

  const { data, error } = await supabaseAdmin().from("store_listings").select(WEB_GRID_COLUMNS).eq("shop_id", shopId);
  if (error) return NextResponse.json({ error: "โหลดรายการสินค้าไม่สำเร็จ" }, { status: 500 });
  // pcols / scols = คอลัมน์ Parent SKU / SKU ที่เลือกไว้ในตาราง (คั่นด้วย ,) · parentIds = เฉพาะบางรุ่น (▸ ขยาย SKU ย่อยในหน้าสินค้าบนเว็บ)
  const listOf = (k: string) => (url.searchParams.get(k) ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 200);
  const only = new Set(listOf("parentIds").filter((x) => UUID.test(x)));
  const listings = ((data ?? []) as unknown as WebGridRow[]).filter((r) => !only.size || only.has(r.parent_sku_id));
  const ids = listings.map((r) => r.parent_sku_id);
  if (!ids.length) return NextResponse.json({ listings: [], parents: [], skus: [] });

  const [parents, skus] = await Promise.all([
    loadModuleRows(request, "parent-skus-v2", "id", ids, listOf("pcols")),
    level === "color" ? loadModuleRows(request, "skus-v2", "parent_sku_id", ids, listOf("scols")) : Promise.resolve([] as Row[]),
  ]);
  if (!parents || !skus) return NextResponse.json({ error: "โหลดข้อมูลสินค้าไม่สำเร็จ" }, { status: 500 });
  skus.sort((a, b) => String(a.code ?? "").localeCompare(String(b.code ?? ""), "en", { numeric: true }));
  return NextResponse.json({ listings, parents, skus });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  let b: { shopId?: unknown; changes?: unknown };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const shopId = typeof b.shopId === "string" && UUID.test(b.shopId) ? b.shopId : "";
  const changes = (Array.isArray(b.changes) ? b.changes : [])
    .slice(0, 1000)
    .map((c) => {
      const o = (c ?? {}) as { parentId?: unknown; patch?: unknown };
      const patch = sanitizeGridPatch((o.patch && typeof o.patch === "object" ? o.patch : {}) as ListingPatch);
      return { parentId: typeof o.parentId === "string" ? o.parentId : "", patch, row: listingPatchToRow(patch) };
    })
    .filter((c) => UUID.test(c.parentId) && Object.keys(c.row).length);
  if (!shopId || !changes.length) return NextResponse.json({ error: "ต้องระบุร้าน + ช่องที่จะแก้" }, { status: 400 });

  const sb = supabaseAdmin();
  // ค่าเดิมของคอลัมน์ที่จะเปลี่ยน (เก็บใน audit — ย้อนได้)
  const before = new Map<string, Row>();
  for (const part of chunk(changes.map((c) => c.parentId), 150)) {
    const { data } = await sb.from("store_listings").select(WEB_GRID_COLUMNS).eq("shop_id", shopId).in("parent_sku_id", part);
    for (const r of (data ?? []) as unknown as Row[]) before.set(String(r.parent_sku_id), r);
  }
  const now = new Date().toISOString();
  const failed: { parentId: string; error: string }[] = [];
  let updated = 0;
  for (const batch of chunk(changes, 10)) {
    await Promise.all(
      batch.map(async (c) => {
        const old = before.get(c.parentId);
        if (!old) return failed.push({ parentId: c.parentId, error: "รุ่นนี้ไม่อยู่ในร้านนี้" });
        const { error } = await sb.from("store_listings").update({ ...c.row, updated_at: now }).eq("shop_id", shopId).eq("parent_sku_id", c.parentId);
        if (error) return failed.push({ parentId: c.parentId, error: "บันทึกไม่สำเร็จ" });
        updated++;
        await writeAudit(sb, {
          action: "update",
          entityType: "store_listing",
          entityId: c.parentId,
          actorId: user?.id ?? null,
          actorName: user?.email ?? null,
          metadata: { shopId, from: "grid_edit", before: Object.fromEntries(Object.keys(c.row).map((k) => [k, old[k] ?? null])), after: c.row },
        });
      }),
    );
  }
  const purged = updated ? await purgeStorefrontCache(sb, shopId) : true;
  return NextResponse.json({ ok: !failed.length, updated, failed, purged });
}
