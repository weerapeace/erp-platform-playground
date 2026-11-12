/**
 * ไอเดียงานออกแบบ — ฝั่งเซิร์ฟเวอร์ (อ่านแถว · จองตอนเริ่มทำงานจริง · ย้ายรูปเข้าใบงาน)
 * ค่ากลาง/ตัวทำความสะอาด = lib/design-ideas.ts · API /api/design-ideas · เริ่มงานจริงผ่าน POST /api/design-sheets { idea_id }
 * ลำดับเริ่มงานจริง (แบบเดียวกับเปิดใบงานจากกล่องงานจากไลน์): จองไอเดีย (promoting) → ออกเลข DS → แนบรูป + ปิดไอเดีย (promoted) · สร้างใบพลาด = คืนสถานะเดิม
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { cleanIdeaImageKeys, cleanIdeaLinks, cleanIdeaPoints, ideaImageUrl, isIdeaStatus, IDEA_PROMOTABLE, type DesignIdea } from "@/lib/design-ideas";

type Admin = ReturnType<typeof supabaseAdmin>;
type Rec = Record<string, unknown>;
type Actor = { id: string | null; name: string | null };

export const IDEA_TABLE = "design_ideas";
export const IDEA_SELECT = "id, name, brand_id, points, links, image_keys, status, source, sender_name, created_by, created_by_name, created_at, updated_at, promoted_sheet_id, brand:brands!brand_id(name, color)";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

export function toDesignIdea(r: Rec): DesignIdea {
  const b = (Array.isArray(r.brand) ? r.brand[0] : r.brand) as { name?: string | null; color?: string | null } | null;
  return {
    id: String(r.id), name: String(r.name ?? ""), brand_id: str(r.brand_id),
    brand_name: b?.name ?? null, brand_color: b?.color ?? null,
    points: cleanIdeaPoints(r.points), links: cleanIdeaLinks(r.links), image_keys: cleanIdeaImageKeys(r.image_keys),
    status: isIdeaStatus(r.status) ? r.status : "open", source: r.source === "line" ? "line" : "manual",
    sender_name: str(r.sender_name), created_by: str(r.created_by), created_by_name: str(r.created_by_name),
    created_at: String(r.created_at ?? ""), updated_at: String(r.updated_at ?? ""), promoted_sheet_id: str(r.promoted_sheet_id),
  };
}

/** จองไอเดียก่อนออกเลข DS (กันสองคนกดพร้อมกัน / กดซ้ำได้ใบงานซ้ำ) — คืนแถวเดิม (สถานะก่อนจอง) ไว้คืนถ้าสร้างใบไม่สำเร็จ */
export async function claimIdeaForSheet(admin: Admin, id: string): Promise<{ ok: true; row: Rec } | { ok: false; error: string }> {
  const { data: cur } = await admin.from(IDEA_TABLE).select("*").eq("id", id).maybeSingle();
  if (!cur) return { ok: false, error: "ไม่พบไอเดียนี้" };
  const prev = String((cur as Rec).status ?? "");
  if (!(IDEA_PROMOTABLE as readonly string[]).includes(prev)) {
    return { ok: false, error: prev === "archived" ? "ไอเดียนี้ถูกเก็บอยู่ — กู้คืนก่อนแล้วค่อยเริ่มงาน" : "ไอเดียนี้เริ่มทำงานจริงไปแล้ว" };
  }
  const { data: won } = await admin.from(IDEA_TABLE).update({ status: "promoting", updated_at: new Date().toISOString() })
    .eq("id", id).eq("status", prev).select("id").maybeSingle();
  if (!won) return { ok: false, error: "มีคนกำลังเริ่มงานจากไอเดียนี้อยู่ — ลองโหลดใหม่" };
  return { ok: true, row: cur as Rec };
}

/** สร้างใบงานไม่สำเร็จ → คืนสถานะเดิม */
export async function releaseIdeaClaim(admin: Admin, row: Rec): Promise<void> {
  await admin.from(IDEA_TABLE).update({ status: String(row.status ?? "open"), updated_at: new Date().toISOString() })
    .eq("id", String(row.id)).eq("status", "promoting");
}

const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic" };

/** ใบงานสร้างแล้ว → แนบรูปไอเดียเข้าไฟล์แนบของใบงาน (key เดิม ไม่อัปซ้ำ · รูปแรก = รูปหลัก) + ปิดไอเดีย (promoted) · คืนจำนวนรูปที่แนบ */
export async function finishIdeaPromote(admin: Admin, row: Rec, sheet: { id: string; code: string }, actor: Actor): Promise<number> {
  const id = String(row.id);
  const keys = cleanIdeaImageKeys(row.image_keys);
  let attached = 0;
  if (keys.length) {
    const rows = keys.map((k, i) => {
      const ext = (k.split(".").pop() || "jpg").toLowerCase();
      return {
        entity_type: "design_sheet", entity_id: sheet.id, file_name: `idea-${i + 1}.${ext}`, file_path: k, public_url: ideaImageUrl(k),
        content_type: MIME[ext] ?? "image/jpeg", size_bytes: null, uploaded_by: actor.name ?? "idea",
        is_primary: i === 0, sort_order: i,
      };
    });
    const { error } = await admin.from("erp_playground_attachments").insert(rows);
    if (error) console.error("[design-ideas] attach", error.message);
    else attached = rows.length;
  }
  const now = new Date().toISOString();
  await admin.from(IDEA_TABLE).update({ status: "promoted", promoted_sheet_id: sheet.id, promoted_at: now, promoted_by: actor.name ?? null, updated_at: now }).eq("id", id);
  await writeAudit(admin, {
    action: "promote", entityType: "design_idea", entityId: id, actorId: actor.id, actorName: actor.name,
    metadata: { name: row.name, sheet_id: sheet.id, code: sheet.code, images: attached, changes: [{ field: "status", old: row.status, new: "promoted" }] },
  });
  if (attached) {
    await writeAudit(admin, {
      action: "attach", entityType: "design_sheet", entityId: sheet.id, actorId: actor.id, actorName: actor.name,
      metadata: { from: "design_idea", idea_id: id, count: attached },
    });
  }
  return attached;
}
