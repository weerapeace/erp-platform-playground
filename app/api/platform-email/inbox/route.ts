/**
 * 📬 กล่องเมลแพลตฟอร์มที่ ERP อ่านแล้ว — /api/platform-email/inbox  (platform_orders.manage)
 * GET  ?status=done|ignored|unreadable|attention&q=&page=&size=&sort=&dir=   → รายการเมลทีละหน้า + ผลที่ระบบทำ (ไม่ส่งเนื้อเมล)
 * GET  ?view=pending&platform=&queue=&hide_cancelled=1&q=&page=&size=      → สินค้าจากเมลที่ยังไม่ได้จับคู่ SKU (รวมกลุ่มตาม สินค้า+ตัวเลือก) ทีละหน้า
 * POST { action: "reprocess", ids }                    → อ่านเมลใหม่ด้วยกฎล่าสุด (หลังปรับกฎ/เพิ่มร้านในตั้งค่า)
 * POST { action: "resolve", ids }                      → ปิดเรื่อง (คนตรวจแล้ว ไม่ต้องทำอะไร)
 * POST { action: "confirm_sku", platform_code, item_key, sku_id } → ยืนยันคู่สินค้า + จำไว้ + ผูกทุกรายการที่ค้างด้วยคู่นี้
 * POST { action: "confirm_many", groups: [{ platform_code, item_key, sku_id }] } → ยืนยันหลายการ์ดทีเดียว (≤100 · เช่น "ยืนยันตามที่ระบบเดา")
 * POST { action: "confirm_model", groups: [{ platform_code, item_key }] } → 🎨 นับเป็นรุ่น ไม่แยกสี (≤100 · เมลไม่บอกสี เช่น Lazada)
 * POST { action: "skip" | "unskip", groups: [{ platform_code, item_key }] } → ⏭ ข้ามไว้ก่อน / ↩ เอากลับมา (≤50)
 * กฎที่จำไว้ (ดู/แก้/ลบ) → /api/platform-email/rules
 * POST { action: "rematch" }                           → จับคู่สินค้าที่ค้างใหม่ด้วยกฎล่าสุด (หลังปรับตัวจับคู่ / เพิ่ม SKU)
 * POST { action: "reprocess_all", status? }           → อ่านใหม่ทั้งกลุ่ม เก่า→ใหม่ (≤150 ฉบับ/ครั้ง) เช่น เมลที่เคยข้ามหลังเพิ่มประเภทเมลใหม่
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { requestActor } from "@/lib/request-actor";
import { writeAudit } from "@/lib/audit";
import { loadEmailSettings, loadPlatformIds, processLines, rematchPendingItems } from "@/lib/platform-email/server";
import { bindPending, confirmModel, inboxPage, INBOX_STATUSES, pendingPage, skipGroups } from "@/lib/platform-email/review";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const STATUSES = INBOX_STATUSES;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  const admin = supabaseAdmin();
  const sp = new URL(request.url).searchParams;
  if (sp.get("view") === "pending") {
    try { return NextResponse.json(await pendingPage(admin, sp)); }
    catch { return NextResponse.json({ error: "โหลดสินค้ารอยืนยันไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 }); }
  }
  try { return NextResponse.json(await inboxPage(admin, sp)); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดรายการเมลไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 }); }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  let body: { action?: string; ids?: string[]; platform_code?: string; item_key?: string; sku_id?: string; groups?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x) => typeof x === "string").slice(0, 100);

  if (body.action === "rematch") {
    const r = await rematchPendingItems(admin);
    await writeAudit(admin, { action: "rematch", entityType: "platform_order_item", entityId: null, actorId: actor.id, actorName: actor.name, metadata: r });
    return NextResponse.json({ ok: true, ...r, error: null });
  }

  if (body.action === "reprocess" || body.action === "reprocess_all") {
    const all = body.action === "reprocess_all";
    if (!all && !ids.length) return NextResponse.json({ error: "ไม่ได้เลือกเมล" }, { status: 400 });
    const settings = await loadEmailSettings(admin);
    const ctx = { shops: settings.shops, platformIds: await loadPlatformIds(admin) };
    let sel = admin.from("platform_email_inbox").select("message_id, body_text, from_addr, subject, received_at").order("received_at", { ascending: true });
    if (all) {
      const st = String((body as { status?: string }).status ?? "");
      if (STATUSES.includes(st)) sel = sel.eq("status", st);
      sel = sel.limit(150);
    } else sel = sel.in("id", ids);
    const { data } = await sel;
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
    let n = 0;
    try { n = await bindPending(admin, pc, key, skuId, code); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "ผูกรายการสินค้าไม่สำเร็จ" }, { status: 500 }); }
    await writeAudit(admin, { action: "match", entityType: "platform_order_item", entityId: null, actorId: actor.id, actorName: actor.name, metadata: { platform_code: pc, item_key: key, sku_code: code, items: n } });
    return NextResponse.json({ ok: true, updated: n, sku_code: code, error: null });
  }

  if (body.action === "confirm_many") {
    type In = { platform_code: string; item_key: string; sku_id: string };
    const list = (Array.isArray(body.groups) ? body.groups : [])
      .filter((g): g is In => !!g && typeof g === "object" && ["platform_code", "item_key", "sku_id"].every((k) => typeof (g as Record<string, unknown>)[k] === "string" && (g as Record<string, string>)[k]))
      .slice(0, 100);
    if (!list.length) return NextResponse.json({ error: "ไม่ได้เลือกการ์ด" }, { status: 400 });
    const { data: skus } = await admin.from("skus_v2").select("id, code").in("id", [...new Set(list.map((g) => g.sku_id))]);
    const codeOf = new Map(((skus ?? []) as { id: string; code: string }[]).map((s) => [s.id, s.code]));
    const ok = list.filter((g) => codeOf.has(g.sku_id));
    if (!ok.length) return NextResponse.json({ error: "ไม่พบ SKU ที่เลือก" }, { status: 404 });
    const { error: ruleErr } = await admin.from("platform_email_sku_rules")
      .upsert(ok.map((g) => ({ platform_code: g.platform_code, item_key: g.item_key, sku_id: g.sku_id, created_by: actor.id })), { onConflict: "platform_code,item_key" });
    if (ruleErr) return NextResponse.json({ error: "บันทึกคู่สินค้าไม่สำเร็จ" }, { status: 500 });
    const done: { platform_code: string; item_key: string; sku_code: string; items: number }[] = [];
    let failed = 0;
    for (let i = 0; i < ok.length; i += 10) {
      await Promise.all(ok.slice(i, i + 10).map(async (g) => {
        const code = codeOf.get(g.sku_id)!;
        try { done.push({ platform_code: g.platform_code, item_key: g.item_key, sku_code: code, items: await bindPending(admin, g.platform_code, g.item_key, g.sku_id, code) }); }
        catch { failed++; }
      }));
    }
    const updated = done.reduce((a, d) => a + d.items, 0);
    await writeAudit(admin, { action: "match", entityType: "platform_order_item", entityId: null, actorId: actor.id, actorName: actor.name, metadata: { bulk: true, groups: done, items: updated, failed, skipped: list.length - ok.length } });
    return NextResponse.json({ ok: true, confirmed: done.length, updated, failed, skipped: list.length - ok.length, done: done.map((d) => ({ platform_code: d.platform_code, item_key: d.item_key })), error: null });
  }

  if (body.action === "skip" || body.action === "unskip") {
    const list = (Array.isArray(body.groups) ? body.groups : [])
      .filter((g): g is { platform_code: string; item_key: string } => !!g && typeof g === "object"
        && typeof (g as Record<string, unknown>).platform_code === "string" && typeof (g as Record<string, unknown>).item_key === "string")
      .slice(0, 50);
    if (!list.length) return NextResponse.json({ error: "ไม่ได้เลือกการ์ด" }, { status: 400 });
    let r: { items: number };
    try { r = await skipGroups(admin, actor.name, list, body.action === "unskip"); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 }); }
    await writeAudit(admin, { action: body.action, entityType: "platform_order_item", entityId: null, actorId: actor.id, actorName: actor.name, metadata: { groups: list, items: r.items } });
    return NextResponse.json({ ok: true, items: r.items, error: null });
  }

  if (body.action === "confirm_model") {
    const list = (Array.isArray(body.groups) ? body.groups : [])
      .filter((g): g is { platform_code: string; item_key: string } => !!g && typeof g === "object"
        && typeof (g as Record<string, unknown>).platform_code === "string" && typeof (g as Record<string, unknown>).item_key === "string")
      .slice(0, 100);
    if (!list.length) return NextResponse.json({ error: "ไม่ได้เลือกการ์ด" }, { status: 400 });
    let r: Awaited<ReturnType<typeof confirmModel>>;
    try { r = await confirmModel(admin, actor.id, list); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 }); }
    if (!r.done.length && r.skipped.length) return NextResponse.json({ error: "หารุ่นของสินค้านี้ใน ERP ไม่เจอ — ใช้ค้นหา SKU แทน" }, { status: 404 });
    const updated = r.done.reduce((a, d) => a + d.items, 0);
    await writeAudit(admin, { action: "match_model", entityType: "platform_order_item", entityId: null, actorId: actor.id, actorName: actor.name, metadata: { groups: r.done, items: updated, skipped: r.skipped, failed: r.failed } });
    return NextResponse.json({ ok: true, confirmed: r.done.length, updated, skipped: r.skipped.length, failed: r.failed, parent_code: r.done[0]?.parent_code ?? null, error: null });
  }

  return NextResponse.json({ error: "ไม่รู้จักคำสั่ง" }, { status: 400 });
}
