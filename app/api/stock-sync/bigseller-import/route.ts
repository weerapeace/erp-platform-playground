/**
 * POST /api/stock-sync/bigseller-import?channel_id=<uuid>&warehouse=<ชื่อคลังใน BigSeller (ไม่ใส่ = รวมทุกคลัง)>
 *
 * เข้ากับสัญญาของ ImportWizard กลาง: body { entity, rows, mode, actor } → { data: ImportResult }
 * แถวที่ได้ (จับคู่คอลัมน์แล้ว): merchant_sku · name · qty_available · qty_on_hand · warehouse · sku_type
 *
 * ทำอะไร: รวมยอดหลายคลัง (lib/stock-sync/bigseller) → จับคู่รหัสกับ SKU ใน ERP ครั้งเดียวทั้งไฟล์
 *   (RPC erp_stock_sync_find_skus: รหัสไม่สนตัวพิมพ์ → บาร์โค้ด) → บันทึกลงทะเบียนจับคู่ marketplace_sku_mappings
 *   (platform='bigseller' + channel_id) พร้อมยอดของ BigSeller ณ ตอนนี้
 * ไม่ทำ: ไม่แตะสต๊อกใน ERP (ยอดตั้งต้นทำผ่านรอบนับสต๊อก) · ไม่ส่งอะไรไป BigSeller
 * แถวที่ผู้ใช้ "จับคู่เอง" ไว้แล้ว → คงการจับคู่เดิม อัปเดตแค่ยอด
 * mode ของ wizard ไม่มีผล — นำเข้าซ้ำ = อัปเดตยอดล่าสุดเสมอ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { fetchAllPages } from "@/lib/fetch-all";
import { normalizeBigSellerRows, codeKey, compareQtyOf, type BigSellerInRow } from "@/lib/stock-sync/bigseller";
import { loadChannel } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const MAX_ROWS = 20000;

type Existing = { id: string; marketplace_sku: string; sku_id: string | null; match_method: string | null };

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const admin = supabaseAdmin();
  const ch = await loadChannel(admin, sp.get("channel_id"));
  if (!ch) return NextResponse.json({ error: "ไม่พบปลายทางซิงค์" }, { status: 404 });
  if (ch.provider !== "bigseller") return NextResponse.json({ error: "ปลายทางนี้ไม่ใช่ BigSeller" }, { status: 400 });

  let body: { rows?: BigSellerInRow[]; actor?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "อ่านข้อมูลไม่ได้" }, { status: 400 }); }
  const inRows = Array.isArray(body.rows) ? body.rows : [];
  if (!inRows.length) return NextResponse.json({ error: "ไม่มีข้อมูลให้นำเข้า" }, { status: 400 });
  if (inRows.length > MAX_ROWS) return NextResponse.json({ error: `นำเข้าได้สูงสุด ${MAX_ROWS.toLocaleString()} แถวต่อครั้ง` }, { status: 400 });

  const warehouse = (sp.get("warehouse") ?? "").trim() || null;
  const { items, skipped } = normalizeBigSellerRows(inRows, { warehouse });
  if (!items.length) {
    return NextResponse.json({ data: { total: inRows.length, created: 0, updated: 0, failed: skipped.map((s) => ({ row: s.row, code: s.code, error: s.reason })), audit_id: "" } });
  }

  // ---- จับคู่รหัส → SKU (เรียกเป็นชุด · RPC คืนได้สูงสุด 1,000 แถวต่อครั้ง) ----
  const found = new Map<string, { sku_id: string; sku_code: string; matched_by: string }>();
  const codes = items.filter((i) => !i.isCombo).map((i) => i.code);
  for (let i = 0; i < codes.length; i += 900) {
    const { data, error } = await admin.rpc("erp_stock_sync_find_skus", { p_codes: codes.slice(i, i + 900) });
    if (error) return NextResponse.json({ error: "จับคู่รหัสสินค้าไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 500 });
    for (const r of (data ?? []) as { input_code: string; sku_id: string; sku_code: string; matched_by: string }[]) {
      found.set(codeKey(r.input_code), { sku_id: r.sku_id, sku_code: r.sku_code, matched_by: r.matched_by });
    }
  }

  // ---- แถวเดิมของปลายทางนี้ (นำเข้าซ้ำ = อัปเดตแถวเดิม แม้ตัวพิมพ์ในไฟล์ใหม่ต่างไป) ----
  const existing = await fetchAllPages<Existing>((from, to) =>
    admin.from("marketplace_sku_mappings").select("id, marketplace_sku, sku_id, match_method")
      .eq("channel_id", ch.id).order("id", { ascending: true }).range(from, to));
  const exByKey = new Map(existing.map((e) => [codeKey(e.marketplace_sku), e]));

  // รหัสเดียวกันที่เป็นของ "ปลายทางอื่น" (เช่น BigSeller อีกบัญชี) — ห้าม upsert ทับ (จะย้ายแถวข้ามปลายทาง)
  const others = await fetchAllPages<{ marketplace_sku: string }>((from, to) =>
    admin.from("marketplace_sku_mappings").select("marketplace_sku")
      .eq("platform", "bigseller").neq("channel_id", ch.id).order("id", { ascending: true }).range(from, to));
  const otherKeys = new Set(others.map((o) => codeKey(o.marketplace_sku)));
  const failed = skipped.map((s) => ({ row: s.row, code: s.code, error: s.reason }));
  const ownItems = items.filter((it) => {
    if (!otherKeys.has(codeKey(it.code))) return true;
    failed.push({ row: it.rows[0], code: it.code, error: "รหัสนี้ผูกกับปลายทางซิงค์อื่นอยู่แล้ว" });
    return false;
  });

  const now = new Date().toISOString();
  let created = 0, updated = 0, matched = 0, unmatched = 0, combos = 0;
  const upserts = ownItems.map((it) => {
    const ex = exByKey.get(codeKey(it.code));
    const keepManual = ex?.match_method === "manual";
    const hit = it.isCombo ? undefined : found.get(codeKey(it.code));
    const skuId = keepManual ? ex!.sku_id : (hit?.sku_id ?? null);
    if (ex) updated++; else created++;
    if (it.isCombo) combos++; else if (skuId) matched++; else unmatched++;
    return {
      platform: "bigseller",
      marketplace_sku: ex?.marketplace_sku ?? it.code,
      channel_id: ch.id,
      brand_id: ch.brand_id,
      listing_name: it.name,
      external_qty: compareQtyOf(it),
      external_on_hand: it.onHand,
      external_qty_at: now,
      external_warehouse: it.warehouses.join(", ") || null,
      is_combo: it.isCombo,
      is_active: true,
      source: "bigseller_file",
      updated_at: now,
      ...(keepManual ? {} : {
        sku_id: skuId,
        internal_sku: hit?.sku_code ?? null,
        match_method: hit ? hit.matched_by : null,
      }),
    };
  });

  // แยกชุด: แถวที่ "จับคู่เอง" ไม่ส่งช่อง sku_id → ต้อง upsert คนละก้อน (ทุกแถวในก้อนเดียวต้องมีช่องเหมือนกัน)
  const withMatch = upserts.filter((u) => "sku_id" in u);
  const manualKept = upserts.filter((u) => !("sku_id" in u));
  for (const group of [withMatch, manualKept]) {
    for (let i = 0; i < group.length; i += 500) {
      const { error } = await admin.from("marketplace_sku_mappings")
        .upsert(group.slice(i, i + 500), { onConflict: "platform,marketplace_sku" });
      if (error) return NextResponse.json({ error: `บันทึกไม่สำเร็จ (บันทึกไปแล้ว ${i} รายการในชุดนี้) — ลองนำเข้าใหม่อีกครั้ง` }, { status: 500 });
    }
  }

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const actor = body.actor ?? user?.email ?? null;
  const inFile = new Set(ownItems.map((it) => codeKey(it.code)));
  const notInFile = existing.filter((e) => !inFile.has(codeKey(e.marketplace_sku))).length;
  const summary = {
    rows: inRows.length, items: ownItems.length, created, updated, matched, unmatched, combos,
    skipped: failed.length, not_in_file: notInFile, warehouse,
  };
  await admin.from("stock_sync_channels").update({
    last_import_at: now, last_import_by: actor, last_import_summary: summary, updated_at: now,
  }).eq("id", ch.id);
  await writeAudit(admin, {
    action: "import", entityType: "stock_sync_channels", entityId: ch.id,
    actorId: user?.id ?? null, actorName: actor,
    metadata: { source: "bigseller_file", label: ch.label, ...summary },
  });

  return NextResponse.json({
    data: {
      total: inRows.length, created, updated,
      failed,
      audit_id: "",
      summary,
    },
    error: null,
  });
}
