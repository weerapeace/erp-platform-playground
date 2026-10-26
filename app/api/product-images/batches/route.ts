/**
 * 🕘 ประวัติชุดอัปรูป (📂 จัดรูปหลายโฟลเดอร์ รอบ 2) — /api/product-images/batches
 * ใช้ที่ components/product-image-router · ของกลาง lib/image-batches (ตาราง erp_image_batches + erp_image_batch_items)
 *
 * GET  ?q=<รหัสรุ่น>&mine=1&limit=  → ชุดล่าสุด (ใคร · เมื่อไร · กี่รูป · รุ่นไหน · ย้อนแล้วหรือยัง · ย้อนได้ไหม)
 * POST { action:"create", mode, resize, shopIds, parentIds, actorName } → { id }   (ตอนกดยืนยันอัป)
 * POST { action:"items",  batchId, items:[…] }                                     (รูปที่อัปสำเร็จ · ทยอยส่ง)
 * POST { action:"finish", batchId, ok, failed, undoInfo, kind:"upload"|"retry" }   (จบรอบ · audit)
 * POST { action:"seen",   sigs:[…] } → { seen: { sig: [{ at, by, parentId, skuId, dest }] } }  (เคยอัปแล้ว)
 * POST { action:"undo",   batchId }  → ย้อนทั้งชุด · สิทธิ์: คนที่อัปชุดนั้นเอง หรือผู้มีสิทธิ์ลบรูป (attachments.delete)
 * สิทธิ์พื้นฐาน: ดู/เช็ก = products.view · บันทึก/ย้อน = products.edit · ชุดอัปแก้ได้เฉพาะเจ้าของชุด
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { emptyUndoInfo, findSeenImages, mergeUndoInfo, parseBatchItems, parseUndoInfo, undoImageBatch } from "@/lib/image-batches";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuids = (v: unknown, max: number) => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === "string" && UUID.test(s)))].slice(0, max) : []);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);

async function currentUser(request: NextRequest) {
  const { data } = await supabaseFromRequest(request).auth.getUser();
  return data.user;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 40);
  const mine = sp.get("mine") === "1";
  const limit = Math.min(50, Math.max(1, Number(sp.get("limit")) || 30));
  const user = await currentUser(request);
  const sb = supabaseAdmin();
  const canDeleteAll = !(await guardApi(request, "attachments.delete"));

  let query = sb.from("erp_image_batches").select("id, created_at, actor_id, actor_name, mode, parent_ids, ok_count, failed_count, status, undone_at, undone_by_name").order("created_at", { ascending: false }).limit(limit);
  if (mine && user) query = query.eq("actor_id", user.id);
  if (q) {
    const { data: ps } = await sb.from("parent_skus_v2").select("id").ilike("code", `%${q.replace(/[%_]/g, "")}%`).limit(50);
    const ids = ((ps ?? []) as { id: string }[]).map((p) => p.id);
    if (!ids.length) return NextResponse.json({ batches: [] });
    query = query.overlaps("parent_ids", ids);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "โหลดประวัติไม่สำเร็จ" }, { status: 500 });
  type B = { id: string; created_at: string; actor_id: string | null; actor_name: string | null; mode: string; parent_ids: string[]; ok_count: number; failed_count: number; status: string; undone_at: string | null; undone_by_name: string | null };
  const rows = (data ?? []) as B[];
  const pids = [...new Set(rows.flatMap((r) => r.parent_ids))];
  const codeOf = new Map<string, string>();
  if (pids.length) {
    const { data: ps } = await sb.from("parent_skus_v2").select("id, code").in("id", pids.slice(0, 600));
    for (const p of (ps ?? []) as { id: string; code: string | null }[]) codeOf.set(p.id, p.code ?? "");
  }
  const destCount = new Map<string, Record<string, number>>();
  if (rows.length) {
    const { data: its } = await sb.from("erp_image_batch_items").select("batch_id, dest").in("batch_id", rows.map((r) => r.id)).limit(10000);
    for (const it of (its ?? []) as { batch_id: string; dest: string }[]) {
      const m = destCount.get(it.batch_id) ?? {};
      m[it.dest] = (m[it.dest] ?? 0) + 1;
      destCount.set(it.batch_id, m);
    }
  }
  return NextResponse.json({
    batches: rows.map((r) => ({
      id: r.id,
      at: r.created_at,
      by: r.actor_name,
      mine: !!user && r.actor_id === user.id,
      mode: r.mode,
      codes: r.parent_ids.map((id) => codeOf.get(id)).filter(Boolean),
      ok: r.ok_count,
      failed: r.failed_count,
      dests: destCount.get(r.id) ?? {},
      status: r.status,
      undoneAt: r.undone_at,
      undoneBy: r.undone_by_name,
      canUndo: r.status === "done" && (canDeleteAll || (!!user && r.actor_id === user.id)),
    })),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const action = String(b.action ?? "");
  if (action === "seen") {
    const denied = await guardApi(request, "products.view");
    if (denied) return denied;
    const sigs = (Array.isArray(b.sigs) ? b.sigs : []).filter((s): s is string => typeof s === "string");
    return NextResponse.json({ seen: await findSeenImages(supabaseAdmin(), sigs) });
  }

  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
  const sb = supabaseAdmin();
  const actorName = (typeof b.actorName === "string" && b.actorName.trim() ? b.actorName.trim().slice(0, 80) : null) ?? user.email ?? null;

  if (action === "create") {
    const resize = b.resize && typeof b.resize === "object" ? (b.resize as Record<string, unknown>) : null;
    const { data, error } = await sb
      .from("erp_image_batches")
      .insert({
        actor_id: user.id,
        actor_name: actorName,
        mode: b.mode === "replace" ? "replace" : "append",
        resize: resize ? { mode: String(resize.mode ?? "").slice(0, 10), px: num(resize.px) } : null,
        shop_ids: uuids(b.shopIds, 20),
        parent_ids: uuids(b.parentIds, 200),
      })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: "เริ่มบันทึกประวัติชุดอัปไม่สำเร็จ" }, { status: 500 });
    return NextResponse.json({ id: (data as { id: string }).id });
  }

  const batchId = typeof b.batchId === "string" && UUID.test(b.batchId) ? b.batchId : "";
  if (!batchId) return NextResponse.json({ error: "ต้องระบุชุดอัป" }, { status: 400 });
  const { data: bd } = await sb.from("erp_image_batches").select("id, actor_id, status, undo_info, ok_count, failed_count, parent_ids").eq("id", batchId).maybeSingle();
  const batch = bd as { id: string; actor_id: string | null; status: string; undo_info: unknown; ok_count: number; failed_count: number; parent_ids: string[] } | null;
  if (!batch) return NextResponse.json({ error: "ไม่พบชุดอัปนี้" }, { status: 404 });
  const isOwner = batch.actor_id === user.id;

  if (action === "items" || action === "finish") {
    if (!isOwner) return NextResponse.json({ error: "แก้ได้เฉพาะชุดอัปของตัวเอง" }, { status: 403 });
    if (batch.status !== "done") return NextResponse.json({ error: "ชุดนี้ย้อนไปแล้ว" }, { status: 409 });
    if (action === "items") {
      const items = parseBatchItems(b.items);
      if (!items.length) return NextResponse.json({ ok: true, added: 0 });
      const { error } = await sb.from("erp_image_batch_items").insert(items.map((it) => ({ ...it, batch_id: batchId })));
      if (error) return NextResponse.json({ error: "บันทึกรูปในชุดไม่สำเร็จ" }, { status: 500 });
      return NextResponse.json({ ok: true, added: items.length });
    }
    const undoInfo = mergeUndoInfo(parseUndoInfo(batch.undo_info ?? emptyUndoInfo()), parseUndoInfo(b.undoInfo));
    const { error } = await sb.from("erp_image_batches").update({ ok_count: num(b.ok), failed_count: num(b.failed), undo_info: undoInfo }).eq("id", batchId);
    if (error) return NextResponse.json({ error: "บันทึกสรุปชุดอัปไม่สำเร็จ" }, { status: 500 });
    await writeAudit(sb, {
      action: `product_images:${b.kind === "retry" ? "retry" : "upload"}`,
      entityType: "product_images",
      entityId: batchId,
      actorId: user.id,
      actorName,
      metadata: { via: "product-image-router", parentIds: batch.parent_ids, ok: num(b.ok), failed: num(b.failed) },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "undo") {
    // คนที่อัปชุดนั้นเองย้อนได้ · คนอื่นต้องมีสิทธิ์ลบรูป (หัวหน้า/แอดมิน)
    if (!isOwner && (await guardApi(request, "attachments.delete"))) {
      return NextResponse.json({ error: "ย้อนได้เฉพาะคนที่อัปชุดนี้ หรือหัวหน้า/แอดมินที่มีสิทธิ์ลบรูป" }, { status: 403 });
    }
    const r = await undoImageBatch(sb, supabaseFromRequest(request), batchId, { id: user.id, name: actorName });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, result: r.result });
  }
  return NextResponse.json({ error: "ไม่รู้จักคำสั่งนี้" }, { status: 400 });
}
