/**
 * 📬 กล่องเมลแพลตฟอร์มที่ ERP อ่านแล้ว — /api/platform-email/inbox  (platform_orders.manage)
 * GET  ?status=done|ignored|unreadable|attention&q=   → รายการเมล + ผลที่ระบบทำ (ไม่ส่งเนื้อเมล)
 * GET  ?view=pending                                  → สินค้าจากเมลที่ยังไม่ได้จับคู่ SKU (รวมกลุ่มตาม สินค้า+ตัวเลือก)
 * POST { action: "reprocess", ids }                    → อ่านเมลใหม่ด้วยกฎล่าสุด (หลังปรับกฎ/เพิ่มร้านในตั้งค่า)
 * POST { action: "resolve", ids }                      → ปิดเรื่อง (คนตรวจแล้ว ไม่ต้องทำอะไร)
 * POST { action: "confirm_sku", platform_code, item_key, sku_id } → ยืนยันคู่สินค้า + จำไว้ + ผูกทุกรายการที่ค้างด้วยคู่นี้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { requestActor } from "@/lib/request-actor";
import { writeAudit } from "@/lib/audit";
import { fetchAllPages } from "@/lib/fetch-all";
import { loadEmailSettings, loadPlatformIds, processLines, SKU_MATCH_SELECT } from "@/lib/platform-email/server";
import type { SkuCandidate } from "@/lib/platform-email/match";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const STATUSES = ["done", "ignored", "unreadable", "attention"];
const LIST_COLS = "id, message_id, received_at, from_addr, subject, platform_code, kind, external_order_id, ref_no, shop_name, status, note, order_id, updated_at";

type ItemRow = { id: string; order_id: string; name: string | null; qty: number | null; raw: Record<string, unknown> | null };

async function pendingGroups(admin: ReturnType<typeof supabaseAdmin>) {
  const items = await fetchAllPages<ItemRow>((from, to) => admin.from("platform_order_items")
    .select("id, order_id, name, qty, raw").is("matched_sku_id", null).eq("raw->>source", "email").order("id").range(from, to), { maxRows: 5000 });

  const orderIds = [...new Set(items.map((i) => i.order_id))];
  const orderNo = new Map<string, { no: string; status: string }>();
  for (let i = 0; i < orderIds.length; i += 300) {
    const { data } = await admin.from("platform_orders").select("id, order_no, status").in("id", orderIds.slice(i, i + 300));
    for (const o of (data ?? []) as { id: string; order_no: string | null; status: string }[]) orderNo.set(o.id, { no: o.order_no ?? "", status: o.status });
  }

  type Group = { platform_code: string; item_key: string; title: string; variant: string | null; model_code: string | null; items: number; qty: number;
    orders: string[]; suggest: { id: string; code: string } | null; reason: string | null; candidates: { id: string; code: string; color: string | null; name: string | null }[] };
  const groups = new Map<string, Group>();
  for (const it of items) {
    const raw = it.raw ?? {};
    const pc = String(raw.platform_code ?? ""), key = String(raw.item_key ?? "");
    if (!pc || !key) continue;
    const g = groups.get(`${pc}|${key}`) ?? {
      platform_code: pc, item_key: key, title: it.name ?? "", variant: (raw.variant as string | null) ?? null,
      model_code: (raw.model_code as string | null) ?? null, items: 0, qty: 0, orders: [],
      suggest: raw.suggest_sku_id ? { id: String(raw.suggest_sku_id), code: String(raw.suggest_code ?? "") } : null,
      reason: (raw.reason as string | null) ?? null, candidates: [],
    };
    g.items++; g.qty += Number(it.qty ?? 0);
    const o = orderNo.get(it.order_id);
    if (o && g.orders.length < 5 && !g.orders.includes(o.no)) g.orders.push(o.status === "cancelled" ? `${o.no} (ยกเลิก)` : o.no);
    groups.set(`${pc}|${key}`, g);
  }

  const models = [...new Set([...groups.values()].map((g) => g.model_code).filter((m): m is string => !!m && /^[A-Z0-9-]{3,30}$/.test(m)))];
  if (models.length) {
    const or = models.flatMap((m) => [`code.eq.${m}`, `code.ilike.${m}-*`]).join(",");
    const { data } = await admin.from("skus_v2").select(SKU_MATCH_SELECT).or(or).eq("is_active", true).order("code").limit(2000);
    for (const g of groups.values()) {
      if (!g.model_code) continue;
      const m = g.model_code;
      g.candidates = ((data ?? []) as SkuCandidate[])
        .filter((s) => { const c = s.code.toUpperCase(); return c === m || c.startsWith(`${m}-`); })
        .slice(0, 30)
        .map((s) => ({ id: s.id, code: s.code, color: s.color_platform_th ?? s.color ?? null, name: s.name_th ?? null }));
    }
  }
  return [...groups.values()].sort((a, b) => b.qty - a.qty);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  const admin = supabaseAdmin();
  const sp = new URL(request.url).searchParams;
  if (sp.get("view") === "pending") return NextResponse.json({ groups: await pendingGroups(admin), error: null });

  const status = (sp.get("status") ?? "").trim();
  const q = (sp.get("q") ?? "").trim().replace(/[,()%*]/g, " ").slice(0, 60);
  let query = admin.from("platform_email_inbox").select(LIST_COLS).order("received_at", { ascending: false, nullsFirst: false }).limit(300);
  if (STATUSES.includes(status)) query = query.eq("status", status);
  if (q) query = query.or(`subject.ilike.%${q}%,external_order_id.ilike.%${q}%,ref_no.ilike.%${q}%,note.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "โหลดรายการเมลไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  return NextResponse.json({ rows: data ?? [], error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  let body: { action?: string; ids?: string[]; platform_code?: string; item_key?: string; sku_id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x) => typeof x === "string").slice(0, 100);

  if (body.action === "reprocess") {
    if (!ids.length) return NextResponse.json({ error: "ไม่ได้เลือกเมล" }, { status: 400 });
    const settings = await loadEmailSettings(admin);
    const ctx = { shops: settings.shops, platformIds: await loadPlatformIds(admin) };
    const { data } = await admin.from("platform_email_inbox").select("message_id, body_text, from_addr, subject, received_at").in("id", ids);
    const results: { message_id: string; status: string; note: string }[] = [];
    for (const r of (data ?? []) as { message_id: string; body_text: string | null; from_addr: string | null; subject: string | null; received_at: string | null }[]) {
      const lines = String(r.body_text ?? "").split("\n").filter(Boolean);
      const out = await processLines(admin, r.message_id, lines, { from: r.from_addr, subject: r.subject, receivedAt: r.received_at }, ctx);
      results.push({ message_id: r.message_id, status: out.status, note: out.note });
    }
    await writeAudit(admin, { action: "reprocess", entityType: "platform_email", entityId: null, actorId: actor.id, actorName: actor.name, metadata: { count: results.length } });
    return NextResponse.json({ ok: true, results, error: null });
  }

  if (body.action === "resolve") {
    if (!ids.length) return NextResponse.json({ error: "ไม่ได้เลือกเมล" }, { status: 400 });
    const { data } = await admin.from("platform_email_inbox").select("id, note").in("id", ids);
    for (const r of (data ?? []) as { id: string; note: string | null }[]) {
      await admin.from("platform_email_inbox").update({ status: "ignored", note: `ปิดเรื่องแล้วโดย ${actor.name ?? "ผู้ใช้"} · ${r.note ?? ""}`, updated_at: new Date().toISOString() }).eq("id", r.id);
    }
    await writeAudit(admin, { action: "resolve", entityType: "platform_email", entityId: null, actorId: actor.id, actorName: actor.name, metadata: { ids } });
    return NextResponse.json({ ok: true, error: null });
  }

  if (body.action === "confirm_sku") {
    const pc = String(body.platform_code ?? ""), key = String(body.item_key ?? ""), skuId = String(body.sku_id ?? "");
    if (!pc || !key || !skuId) return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
    const { data: sku } = await admin.from("skus_v2").select("id, code").eq("id", skuId).maybeSingle();
    if (!sku) return NextResponse.json({ error: "ไม่พบ SKU นี้" }, { status: 404 });
    const code = (sku as { code: string }).code;
    const { error: ruleErr } = await admin.from("platform_email_sku_rules")
      .upsert({ platform_code: pc, item_key: key, sku_id: skuId, created_by: actor.id }, { onConflict: "platform_code,item_key" });
    if (ruleErr) return NextResponse.json({ error: "บันทึกคู่สินค้าไม่สำเร็จ" }, { status: 500 });
    const { data: upd, error } = await admin.from("platform_order_items").update({ matched_sku_id: skuId, sku_code: code })
      .is("matched_sku_id", null).eq("raw->>source", "email").eq("raw->>platform_code", pc).eq("raw->>item_key", key).select("id");
    if (error) return NextResponse.json({ error: "ผูกรายการสินค้าไม่สำเร็จ" }, { status: 500 });
    const n = (upd ?? []).length;
    await writeAudit(admin, { action: "match", entityType: "platform_order_item", entityId: null, actorId: actor.id, actorName: actor.name, metadata: { platform_code: pc, item_key: key, sku_code: code, items: n } });
    return NextResponse.json({ ok: true, updated: n, sku_code: code, error: null });
  }

  return NextResponse.json({ error: "ไม่รู้จักคำสั่ง" }, { status: 400 });
}
