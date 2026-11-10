/**
 * 🎨 บันทึกหน้าตาจุดสี 1 ชื่อลงพจนานุกรมสี (erp_color_dictionary) + audit — ฝั่ง server เท่านั้น
 * ใช้ร่วมกัน: /api/color-swatches (แท็บหน้าตาจุดสี) · /api/color-tones (แท็บสีหลัก ตั้ง/ยกเลิก "ไม่ใช่สี" = ชนิดไซส์)
 * มีชื่อนี้แล้ว (ไม่สนตัวพิมพ์/ช่องว่าง ตรงกับ unique index) = แก้ · ยังไม่มี = เพิ่มคำใหม่ (ต้องมีชื่ออังกฤษ)
 */
import { writeAudit } from "@/lib/audit";
import { normalizeSwatchInput, normColorName } from "@/lib/color-swatch";
import type { supabaseAdmin } from "@/lib/supabase-admin";

export type SwatchDbRow = { id: string; th: string; en: string | null; swatch_kind: string | null; swatch_colors: string[] | null; swatch_image_key: string | null };
export type SwatchInput = { id?: string; th?: string; en?: string; kind?: unknown; colors?: unknown; imageKey?: unknown };
export type SwatchActor = { id: string; email?: string | null } | null;
export type SwatchSaveResult = { ok: true; id: string | null } | { ok: false; error: string };
type Sb = ReturnType<typeof supabaseAdmin>;

/** ตั้งจุดสี 1 ชื่อ + audit · rows = พจนานุกรมที่โหลดไว้ (คำใหม่/ค่าที่แก้ อัปเดตใน rows ให้ตัวถัดไปในชุดเดียวกันเห็น) */
export async function saveSwatch(admin: Sb, rows: SwatchDbRow[], user: SwatchActor, b: SwatchInput, source?: string): Promise<SwatchSaveResult> {
  const th = (b.th ?? "").trim();
  const en = (b.en ?? "").trim();
  if (!th) return { ok: false, error: "ต้องมีชื่อสี" };
  const sw = normalizeSwatchInput(b);
  if (!sw.ok) return { ok: false, error: sw.error };

  const existing = rows.find((r) => (b.id ? r.id === b.id : normColorName(r.th) === normColorName(th)));

  const swatch = { swatch_kind: sw.kind, swatch_colors: sw.colors, swatch_image_key: sw.imageKey };
  const stamp = { updated_at: new Date().toISOString(), updated_by: user?.id ?? null };
  let id: string | null = existing?.id ?? null;
  const before = existing ? { kind: existing.swatch_kind, colors: existing.swatch_colors, imageKey: existing.swatch_image_key } : null;
  if (existing) {
    const { error } = await admin.from("erp_color_dictionary").update({ ...swatch, ...(en ? { en } : {}), ...stamp }).eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    Object.assign(existing, swatch, en ? { en } : {});
  } else {
    if (!en) return { ok: false, error: `"${th}" ยังไม่มีในพจนานุกรมสี — ใส่ชื่อภาษาอังกฤษด้วย (ใช้แปลชื่อสีด้วย)` };
    const { data, error } = await admin.from("erp_color_dictionary").insert({ th, en, ...swatch, ...stamp }).select("id").maybeSingle();
    if (error) return { ok: false, error: error.message };
    id = (data as { id: string } | null)?.id ?? null;
    if (id) rows.push({ id, th, en, ...swatch });
  }

  await writeAudit(admin, {
    action: existing ? "update" : "create",
    entityType: "color_dictionary",
    entityId: id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { th, field: "swatch", before, after: { kind: sw.kind, colors: sw.colors, imageKey: sw.imageKey }, ...(source ? { source } : {}) },
  });
  return { ok: true, id };
}
