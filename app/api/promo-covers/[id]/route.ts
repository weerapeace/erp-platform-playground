/**
 * 🖼 ชุดโปร 1 ชุด — ดู / แก้ / ลบ (ลงถังขยะ) / กู้คืน
 *  GET    → { campaign, items: [{ ...item, code, name, cover_key }], targets }        (products.platforms.view)
 *  PATCH  { name?, note?, starts_at?, ends_at?, auto_revert?, early_hours?, platforms?, frame_key?,
 *           add_parent_ids?, remove_item_ids?, set_items?: [{ id, promo_key, source }], album_name?, restore? }   (products.platforms.publish)
 *     album = อัลบั้มปกโปรในคลังรูป (ชื่อตามชื่อชุด · เก็บปกที่ใช้ให้เอง — lib/promo-cover-album) · album_name = แก้ชื่ออัลบั้ม (แก้ได้ทุกสถานะ)
 *     ร่าง/รอเริ่ม = แก้ได้ทุกอย่าง (รอเริ่ม + แก้รุ่น/รูป/ร้าน/เวลาเริ่ม → กลับเป็นร่าง ต้องกดยืนยันใหม่)
 *     กำลังใช้ = แก้ได้แค่ ชื่อ/โน้ต/เวลาจบ/ย้อนอัตโนมัติ (จะเปลี่ยนรูป ต้องย้อนปกเดิมก่อน)
 *  DELETE → ลงถังขยะ (ยังมีปกโปรค้างบนร้าน = 409 ต้องย้อนก่อน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { auditDiff, writeAudit } from "@/lib/audit";
import { isPromoPlatform, validateCampaign } from "@/lib/promo-cover";
import { hasOnShop, loadCampaignFull } from "@/lib/promo-cover-server";
import { findPromoAlbum, renamePromoAlbum, syncPromoAlbum } from "@/lib/promo-cover-album";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const NO_STORE = { "Cache-Control": "no-store" };
const UUID = /^[0-9a-f-]{36}$/i;
const KEY_RE = /^[\w\-./%()]+$/;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "ไม่พบชุดโปร" }, { status: 404 });
  const full = await loadCampaignFull(supabaseAdmin(), id);
  if (!full) return NextResponse.json({ error: "ไม่พบชุดโปร (อาจถูกลบไปแล้ว)" }, { status: 404, headers: NO_STORE });
  const album = await findPromoAlbum(supabaseAdmin(), full.campaign).catch(() => null);
  return NextResponse.json({ ...full, album }, { headers: NO_STORE });
}

export async function PATCH(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { id } = await ctx.params;
  let b: Record<string, unknown>;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const full = await loadCampaignFull(admin, id);
  if (!full) return NextResponse.json({ error: "ไม่พบชุดโปร" }, { status: 404 });
  const c = full.campaign;
  const actor = { actorId: user?.id ?? null, actorName: user?.email ?? null };

  if (b.restore === true) {
    if (!c.deleted_at) return NextResponse.json({ ok: true, ...full }, { headers: NO_STORE });
    await admin.from("promo_cover_campaigns").update({ deleted_at: null, updated_at: new Date().toISOString() }).eq("id", id);
    await writeAudit(admin, { action: "restore", entityType: "promo_cover_campaign", entityId: id, ...actor, metadata: { name: c.name } });
    return NextResponse.json({ ok: true, ...(await loadCampaignFull(admin, id)), album: await findPromoAlbum(admin, c).catch(() => null) }, { headers: NO_STORE });
  }
  if (c.deleted_at) return NextResponse.json({ error: "ชุดนี้อยู่ในถังขยะ — กู้คืนก่อนแก้" }, { status: 400 });

  // แก้ชื่ออัลบั้มปกโปร (ไม่แตะเนื้อหาชุด — แก้ได้ทุกสถานะ)
  if (typeof b.album_name === "string") {
    try {
      const r = await renamePromoAlbum(admin, c, b.album_name);
      if (r.before !== r.album.name) await writeAudit(admin, { action: "update", entityType: "asset_collection", entityId: r.album.id, ...actor, metadata: { kind: "promo_cover_album", campaign_id: id, campaign: c.name, changes: auditDiff({ name: r.before }, { name: r.album.name }) } });
      // สร้างอัลบั้มใหม่ (ชุดเก่าที่ยังไม่มีอัลบั้ม) → เก็บปกที่มีอยู่ลงไปด้วย
      const album = (await syncPromoAlbum(admin, c, full.items)) ?? r.album;
      return NextResponse.json({ ok: true, ...full, album }, { headers: NO_STORE });
    } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  }

  const locked = c.status === "live" || c.status === "ended" || c.status === "cancelled";
  const contentKeys = ["starts_at", "early_hours", "platforms", "frame_key", "add_parent_ids", "remove_item_ids", "set_items"];
  const touchesContent = contentKeys.some((k) => k in b);
  if (locked && touchesContent) return NextResponse.json({ error: c.status === "live" ? "ชุดนี้กำลังใช้อยู่ — แก้ได้แค่ชื่อ/เวลาจบ · จะเปลี่ยนรูป/รุ่น/ร้าน ให้กด \"ย้อนปกเดิมเดี๋ยวนี้\" ก่อน" : "ชุดนี้จบแล้ว — สร้างชุดใหม่แทน (กดทำซ้ำได้)" }, { status: 409 });
  if (c.status === "ended" && ("ends_at" in b || "auto_revert" in b)) return NextResponse.json({ error: "ชุดนี้จบแล้ว — แก้เวลาไม่ได้" }, { status: 409 });

  const next = {
    name: "name" in b ? String(b.name ?? "").trim() : c.name,
    note: "note" in b ? (String(b.note ?? "").trim() || null) : c.note,
    starts_at: "starts_at" in b ? (b.starts_at ? String(b.starts_at) : null) : c.starts_at,
    ends_at: "ends_at" in b ? (b.ends_at ? String(b.ends_at) : null) : c.ends_at,
    auto_revert: "auto_revert" in b ? b.auto_revert !== false : c.auto_revert,
    early_hours: "early_hours" in b ? Number(b.early_hours) : c.early_hours,
    platforms: "platforms" in b && Array.isArray(b.platforms) ? [...new Set((b.platforms as unknown[]).map(String).filter(isPromoPlatform))] : c.platforms,
    frame_key: "frame_key" in b ? (typeof b.frame_key === "string" && KEY_RE.test(b.frame_key) ? b.frame_key : null) : c.frame_key,
  };
  const errors = validateCampaign(next);
  if (errors.length) return NextResponse.json({ error: errors.join(" · ") }, { status: 400 });

  // รุ่น: เพิ่ม / เอาออก / ตั้งรูป
  const now = new Date().toISOString();
  const itemChanges: Record<string, unknown> = {};
  const add = (Array.isArray(b.add_parent_ids) ? b.add_parent_ids : []).map(String).filter((x) => UUID.test(x));
  const have = new Set(full.items.map((i) => i.parent_sku_id));
  const fresh = [...new Set(add)].filter((p) => !have.has(p)).slice(0, 500 - full.items.length);
  if (fresh.length) {
    const base = full.items.length;
    const { error } = await admin.from("promo_cover_items").insert(fresh.map((p, i) => ({ campaign_id: id, parent_sku_id: p, source: next.frame_key ? "frame" : "upload", sort_order: base + i })));
    if (error) return NextResponse.json({ error: `เพิ่มรุ่นไม่สำเร็จ: ${error.message}` }, { status: 500 });
    itemChanges.added = fresh.length;
  }
  const remove = (Array.isArray(b.remove_item_ids) ? b.remove_item_ids : []).map(String).filter((x) => UUID.test(x));
  if (remove.length) {
    const busy = full.targets.filter((t) => remove.includes(t.item_id) && (t.status === "applied" || t.status === "review" || t.status === "revert_failed"));
    if (busy.length) return NextResponse.json({ error: "รุ่นที่ปกโปรยังอยู่บนร้าน เอาออกไม่ได้ — ย้อนปกเดิมก่อน" }, { status: 409 });
    await admin.from("promo_cover_items").delete().eq("campaign_id", id).in("id", remove);
    itemChanges.removed = remove.length;
  }
  const sets = Array.isArray(b.set_items) ? (b.set_items as Record<string, unknown>[]) : [];
  let setCount = 0;
  for (const s of sets.slice(0, 500)) {
    const iid = String(s.id ?? "");
    const cur = full.items.find((i) => i.id === iid);
    if (!cur) continue;
    const key = s.promo_key == null || s.promo_key === "" ? null : String(s.promo_key);
    if (key && !KEY_RE.test(key)) return NextResponse.json({ error: "รูปปกโปรไม่ถูกต้อง" }, { status: 400 });
    const source = s.source === "library" || s.source === "frame" ? s.source : "upload";
    if (cur.promo_key === key && cur.source === source) continue;
    await admin.from("promo_cover_items").update({ promo_key: key, source, updated_at: now }).eq("id", iid);
    setCount++;
  }
  if (setCount) itemChanges.images = setCount;

  const before = { name: c.name, note: c.note, starts_at: c.starts_at, ends_at: c.ends_at, auto_revert: c.auto_revert, early_hours: c.early_hours, platforms: c.platforms, frame_key: c.frame_key };
  const changes = auditDiff(before, next);
  const reconfirm = c.status === "scheduled" && (touchesContent && (changes.some((x) => contentKeys.includes(x.field)) || Object.keys(itemChanges).length > 0));
  const patch: Record<string, unknown> = { ...next, updated_at: now };
  if (reconfirm) { patch.status = "draft"; patch.confirmed_at = null; patch.confirmed_by = null; }
  if (changes.length || reconfirm) {
    const { error } = await admin.from("promo_cover_campaigns").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: `บันทึกไม่สำเร็จ: ${error.message}` }, { status: 500 });
  }
  if (changes.length || Object.keys(itemChanges).length) {
    await writeAudit(admin, { action: "update", entityType: "promo_cover_campaign", entityId: id, ...actor, metadata: { name: next.name, changes, items: itemChanges, back_to_draft: reconfirm } });
  }
  const after = await loadCampaignFull(admin, id);
  // เก็บปกโปรลงอัลบั้ม (ชื่อตามชุด) · ชื่อชุดเปลี่ยน = อัลบั้มเปลี่ยนตาม
  const album = after ? await syncPromoAlbum(admin, after.campaign, after.items, { prevName: c.name }) : null;
  return NextResponse.json({ ok: true, back_to_draft: reconfirm, ...after, album }, { headers: NO_STORE });
}

export async function DELETE(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.publish"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { id } = await ctx.params;
  const admin = supabaseAdmin();
  const full = await loadCampaignFull(admin, id);
  if (!full) return NextResponse.json({ error: "ไม่พบชุดโปร" }, { status: 404 });
  if (hasOnShop(full.targets)) return NextResponse.json({ error: "ยังมีปกโปรค้างอยู่บนร้าน — กด \"ย้อนปกเดิมเดี๋ยวนี้\" ให้ครบก่อนลบ" }, { status: 409 });
  const now = new Date().toISOString();
  // ชุดที่ยังไม่ส่งอะไร = ยกเลิก (ไม่ให้ตัวตั้งเวลาหยิบไปทำ) · กู้คืนแล้วกลับมาเป็นร่าง
  const status = full.campaign.status === "scheduled" ? "draft" : full.campaign.status;
  await admin.from("promo_cover_campaigns").update({ deleted_at: now, status, confirmed_at: status === "draft" ? null : full.campaign.confirmed_at, updated_at: now }).eq("id", id);
  await writeAudit(admin, { action: "delete", entityType: "promo_cover_campaign", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { name: full.campaign.name, soft: true } });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
