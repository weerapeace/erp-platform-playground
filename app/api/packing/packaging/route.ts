/**
 * 🎁 บรรจุภัณฑ์ตอนแพ็ค — /api/packing/packaging   (กติกา lib/packaging · ตาราง packaging_items + parent_skus_v2.pack_items/pack_note/pack_flags)
 *
 * GET                     (packing.pack) → { items, can_manage, can_edit_parent }   รายการบรรจุภัณฑ์ (รวมที่อยู่ในถัง: is_active=false)
 * GET ?parent=<id>        (packing.pack) → { parent: { id, code, name, pack_items, pack_note, pack_flags }, items, can_edit_parent }
 * GET ?matrix=1&q=&missing=1&offset=  (packing.pack) → { rows: [{ id, code, name, image_key, pack_items }], total }   หน้าตั้งหลายตัว (50 ต่อหน้า)
 * POST { action:"item_create", name, image_r2_key? }                  (packing.manage)
 * POST { action:"item_update", id, name?, image_r2_key?, sort? }      (packing.manage)
 * POST { action:"item_archive", id, archived: boolean }               (packing.manage) ลบ = เข้าถัง (กู้คืนได้) · รุ่นที่ผูกไว้ยังเก็บ id เดิม (กู้คืนแล้วกลับมาโชว์)
 * POST { action:"parent_set", parent_id, pack_items?, pack_note?, pack_flags? }   (packing.manage หรือ products.edit)
 * POST { action:"parent_toggle", parent_id, item_id, on }             (packing.manage หรือ products.edit) ตารางติ๊ก — เพิ่ม/เอาออกทีละช่อง
 * ทุกการแก้ลง audit พร้อม changes (ชื่อบรรจุภัณฑ์ ไม่ใช่ id)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { auditDiff, writeAudit } from "@/lib/audit";
import { cleanPackFlags, cleanPackItems, cleanPackNote, isUuid, togglePackItem, type PackagingItem } from "@/lib/packaging";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;
const ITEM_COLS = "id, name, image_r2_key, sort, is_active";
const PAGE = 50;
const noStore = { "Cache-Control": "no-store" };

async function whoAmI(request: Request, admin: Admin): Promise<{ id: string | null; name: string | null }> {
  try {
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    if (!user) return { id: null, name: null };
    const { data } = await admin.from("user_profiles").select("display_name, username, email").eq("id", user.id).maybeSingle();
    const p = data as { display_name?: string; username?: string; email?: string } | null;
    return { id: user.id, name: p?.display_name || p?.username || p?.email || user.email || null };
  } catch { return { id: null, name: null }; }
}

async function loadItems(admin: Admin): Promise<PackagingItem[]> {
  const { data } = await admin.from("packaging_items").select(ITEM_COLS).order("sort").order("name");
  return (data ?? []) as PackagingItem[];
}
const canEditParent = async (request: Request) => (await apiCan(request, "packing.manage")) || (await apiCan(request, "products.edit"));
const names = (ids: string[], items: PackagingItem[]) => ids.map((id) => items.find((i) => i.id === id)?.name ?? "(ลบแล้ว)").join(", ") || "-";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "packing.pack"); if (denied) return denied;
  const admin = supabaseAdmin();
  const sp = new URL(request.url).searchParams;

  if (sp.get("matrix") === "1") {
    const q = (sp.get("q") ?? "").trim().replace(/[,%()*]/g, " ").slice(0, 60);
    const offset = Math.max(0, Math.round(Number(sp.get("offset")) || 0));
    let query = admin.from("parent_skus_v2").select("id, code, name_th, sku_name, cover_image_r2_key, pack_items", { count: "exact" }).not("is_active", "is", false);
    if (q) query = query.or(`code.ilike.%${q}%,name_th.ilike.%${q}%,sku_name.ilike.%${q}%`);
    if (sp.get("missing") === "1") query = query.eq("pack_items", "{}");
    const { data, count, error } = await query.order("code").range(offset, offset + PAGE - 1);
    if (error) return NextResponse.json({ rows: [], total: 0, error: "โหลดรายการรุ่นไม่สำเร็จ" }, { status: 500 });
    const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), code: (r.code as string) ?? "", name: (r.name_th as string) || (r.sku_name as string) || "", image_key: (r.cover_image_r2_key as string) ?? null, pack_items: (r.pack_items as string[]) ?? [],
    }));
    return NextResponse.json({ rows, total: count ?? rows.length, page_size: PAGE, error: null }, { headers: noStore });
  }

  const items = await loadItems(admin);
  const parentId = sp.get("parent");
  if (parentId) {
    if (!isUuid(parentId)) return NextResponse.json({ error: "รหัสรุ่นไม่ถูกต้อง" }, { status: 400 });
    const { data, error } = await admin.from("parent_skus_v2").select("id, code, name_th, sku_name, pack_items, pack_note, pack_flags").eq("id", parentId).maybeSingle();
    if (error || !data) return NextResponse.json({ error: "ไม่พบรุ่นสินค้านี้" }, { status: 404 });
    const r = data as Record<string, unknown>;
    return NextResponse.json({
      parent: { id: r.id, code: r.code, name: (r.name_th as string) || (r.sku_name as string) || "", pack_items: (r.pack_items as string[]) ?? [], pack_note: r.pack_note ?? null, pack_flags: (r.pack_flags as string[]) ?? [] },
      items, can_edit_parent: await canEditParent(request), error: null,
    }, { headers: noStore });
  }
  return NextResponse.json({ items, can_manage: await apiCan(request, "packing.manage"), can_edit_parent: await canEditParent(request), error: null }, { headers: noStore });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "packing.pack"); if (denied) return denied;
  const admin = supabaseAdmin();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const me = await whoAmI(request, admin);
  const now = new Date().toISOString();

  // ── รายการบรรจุภัณฑ์ (หัวหน้า) ──
  if (action === "item_create" || action === "item_update" || action === "item_archive") {
    if (!(await apiCan(request, "packing.manage"))) return NextResponse.json({ error: "ต้องเป็นหัวหน้าแพ็คถึงจะแก้รายการบรรจุภัณฑ์ได้" }, { status: 403 });
    const name = body.name !== undefined ? String(body.name ?? "").trim().slice(0, 80) : undefined;
    if (name !== undefined && !name) return NextResponse.json({ error: "ใส่ชื่อบรรจุภัณฑ์ก่อน" }, { status: 400 });
    const image = body.image_r2_key !== undefined ? (body.image_r2_key ? String(body.image_r2_key).slice(0, 300) : null) : undefined;

    if (action === "item_create") {
      const items = await loadItems(admin);
      if (items.some((i) => i.is_active && i.name === name)) return NextResponse.json({ error: "มีชื่อนี้อยู่แล้ว" }, { status: 400 });
      const sort = Math.max(0, ...items.map((i) => i.sort)) + 1;
      const { data, error } = await admin.from("packaging_items").insert({ name, image_r2_key: image ?? null, sort, updated_by: me.id }).select(ITEM_COLS).single();
      if (error) return NextResponse.json({ error: "เพิ่มไม่สำเร็จ" }, { status: 500 });
      await writeAudit(admin, { action: "packing.packaging_item_create", entityType: "packaging_items", entityId: String(data.id), actorId: me.id, actorName: me.name, metadata: { name } });
      return NextResponse.json({ item: data, error: null });
    }
    if (!isUuid(body.id)) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 400 });
    const { data: cur } = await admin.from("packaging_items").select(ITEM_COLS).eq("id", body.id).maybeSingle();
    if (!cur) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
    const patch: Record<string, unknown> = {};
    if (action === "item_archive") patch.is_active = body.archived !== true;
    else {
      if (name !== undefined) patch.name = name;
      if (image !== undefined) patch.image_r2_key = image;
      if (body.sort !== undefined && Number.isFinite(Number(body.sort))) patch.sort = Math.round(Number(body.sort));
    }
    const changes = auditDiff(cur as Record<string, unknown>, patch);
    if (!changes.length) return NextResponse.json({ ok: true, unchanged: true, error: null });
    const { error } = await admin.from("packaging_items").update({ ...patch, updated_at: now, updated_by: me.id }).eq("id", body.id);
    if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
    await writeAudit(admin, { action: action === "item_archive" ? (patch.is_active ? "packing.packaging_item_restore" : "packing.packaging_item_archive") : "packing.packaging_item_update", entityType: "packaging_items", entityId: String(body.id), actorId: me.id, actorName: me.name, metadata: { name: (cur as { name: string }).name, changes } });
    return NextResponse.json({ ok: true, error: null });
  }

  // ── ตั้งค่าต่อรุ่น (หัวหน้าแพ็ค หรือคนแก้สินค้าได้) ──
  if (action === "parent_set" || action === "parent_toggle") {
    if (!(await canEditParent(request))) return NextResponse.json({ error: "ไม่มีสิทธิ์แก้การแพ็คของสินค้า" }, { status: 403 });
    if (!isUuid(body.parent_id)) return NextResponse.json({ error: "รหัสรุ่นไม่ถูกต้อง" }, { status: 400 });
    const { data: cur } = await admin.from("parent_skus_v2").select("id, code, pack_items, pack_note, pack_flags").eq("id", body.parent_id).maybeSingle();
    if (!cur) return NextResponse.json({ error: "ไม่พบรุ่นสินค้านี้" }, { status: 404 });
    const c = cur as { id: string; code: string; pack_items: string[] | null; pack_note: string | null; pack_flags: string[] | null };
    const items = await loadItems(admin);
    const known = new Set(items.map((i) => i.id));
    const patch: Record<string, unknown> = {};
    if (action === "parent_toggle") {
      if (!isUuid(body.item_id) || !known.has(body.item_id)) return NextResponse.json({ error: "ไม่พบบรรจุภัณฑ์นี้" }, { status: 400 });
      patch.pack_items = togglePackItem(c.pack_items, body.item_id, body.on === true);
    } else {
      // เก็บ id ที่ผูกไว้แล้วแม้อยู่ในถัง (กู้คืนแล้วกลับมา) — รับใหม่เฉพาะที่มีจริง
      if (body.pack_items !== undefined) patch.pack_items = cleanPackItems(body.pack_items, known);
      if (body.pack_note !== undefined) patch.pack_note = cleanPackNote(body.pack_note);
      if (body.pack_flags !== undefined) patch.pack_flags = cleanPackFlags(body.pack_flags);
    }
    const before = { บรรจุภัณฑ์: names(c.pack_items ?? [], items), โน้ตตอนแพ็ค: c.pack_note ?? "", ป้ายเตือน: (c.pack_flags ?? []).join(", ") };
    const after = {
      บรรจุภัณฑ์: names((patch.pack_items as string[] | undefined) ?? c.pack_items ?? [], items),
      โน้ตตอนแพ็ค: patch.pack_note !== undefined ? (patch.pack_note as string | null) ?? "" : before.โน้ตตอนแพ็ค,
      ป้ายเตือน: patch.pack_flags !== undefined ? (patch.pack_flags as string[]).join(", ") : before.ป้ายเตือน,
    };
    const changes = auditDiff(before, after);
    if (!changes.length) return NextResponse.json({ ok: true, unchanged: true, pack_items: c.pack_items ?? [], error: null });
    const { error } = await admin.from("parent_skus_v2").update(patch).eq("id", c.id);
    if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
    await writeAudit(admin, { action: "packing.parent_packaging", entityType: "parent_skus_v2", entityId: c.id, actorId: me.id, actorName: me.name, metadata: { code: c.code, changes } });
    return NextResponse.json({ ok: true, pack_items: (patch.pack_items as string[] | undefined) ?? c.pack_items ?? [], error: null });
  }

  return NextResponse.json({ error: "ไม่รู้จักคำสั่งนี้" }, { status: 400 });
}
