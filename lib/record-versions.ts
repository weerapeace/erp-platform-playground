/**
 * 🕘 ของกลาง — เก็บเวอร์ชันเก่าของ Parent SKU / SKU (คำอธิบาย/ชื่อ + รูป)
 *
 * ทุกจุดที่ "เปลี่ยน" ข้อมูลสินค้าเรียกตัวนี้ → จดค่าเก่าลง entity_field_history (migration 202610240100_record_versions)
 *   - แก้ฟิลด์ในตัวแก้สินค้ากลาง (master-v2 PATCH)       → captureFieldVersions   (kind=field + รูปปก kind=image field_key=cover)
 *   - ลบรูปออกจากแกลเลอรี (DELETE /api/attachments/[id]) → captureImageVersion    (field_key=gallery)
 *   - เอารูปออกจาก Description (DELETE /api/assets/description) → captureImageVersion (field_key=description_images)
 * ไฟล์รูปที่อยู่ในเวอร์ชัน = "ยังมีคนใช้" (lib/r2-refs นับ entity_field_history.r2_key) → ไม่ถูกย้ายเข้าถังขยะ R2
 * เก็บย้อนหลังจำกัดจำนวนต่อช่อง (KEEP) — เวอร์ชันที่เกินถูกลบ + ไฟล์รูปที่ไม่มีใครใช้แล้วค่อยย้ายเข้าถัง
 * ทุกฟังก์ชัน best-effort: จดไม่สำเร็จ ห้ามทำให้การบันทึกสินค้าพัง (log อย่างเดียว)
 * ไฟล์นี้ใช้ฝั่ง server เท่านั้น (ห้ามใส่ "use client")
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { r2MoveToTrash } from "@/lib/r2";
import { r2KeyStillReferenced } from "@/lib/r2-refs";
import { r2ImageUrl } from "@/lib/r2-image";

type Admin = ReturnType<typeof supabaseAdmin>;

const TABLE = "entity_field_history";

/** ตารางที่เก็บเวอร์ชัน → คอลัมน์ข้อความที่จด (ชื่อ/คำอธิบายที่ทีมแก้บ่อยและขึ้นเว็บ) */
export const VERSIONED_TEXT_FIELDS: Record<string, readonly string[]> = {
  parent_skus_v2: [
    "name_th", "name_en", "name_platform", "name_platform_en",
    "introduction", "introduction_en",
    "description", "platform_description", "platform_description_en", "english_description",
  ],
  skus_v2: ["name_th", "name_en", "description"],
};
/** รูปปก — จดเป็น kind=image field_key=cover */
export const COVER_COLUMN = "cover_image_r2_key";
export const VERSIONED_TABLES = Object.keys(VERSIONED_TEXT_FIELDS);

export type ImageFieldKey = "cover" | "gallery" | "description_images";
/** เก็บย้อนหลังกี่เวอร์ชันต่อช่อง · แกลเลอรี/รูป Description นับรวมทั้งกล่อง (กด "ล้างทั้งหมด" ครั้งเดียวก็หลายรูป) */
const KEEP_TEXT = 10;
const KEEP_IMAGE: Record<ImageFieldKey, number> = { cover: 10, gallery: 30, description_images: 30 };

export type VersionSource = "master_edit" | "gallery_delete" | "description_image_remove" | "restore";
export type VersionActor = { actorId?: string | null; actorName?: string | null; taskId?: string | null };

export type FieldChange =
  | { kind: "field"; field_key: string; old_value: string | null; new_value: string | null }
  | { kind: "image"; field_key: "cover"; old_key: string; new_key: string | null };

const norm = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = typeof v === "string" ? v : String(v);
  return s.trim() === "" ? null : s;
};

/** ฟิลด์ที่ต้องอ่านค่าเดิมก่อนบันทึก (เฉพาะที่ patch แตะ) — ว่าง = ตารางนี้/patch นี้ไม่ต้องจดเวอร์ชัน */
export function versionedColumnsIn(table: string, patch: Record<string, unknown>): string[] {
  const text = VERSIONED_TEXT_FIELDS[table];
  if (!text) return [];
  const cols = text.filter((c) => c in patch);
  if (COVER_COLUMN in patch) cols.push(COVER_COLUMN);
  return cols;
}

/** เทียบค่าเดิม vs ค่าใหม่ → รายการที่เปลี่ยนจริง (ช่องว่าง/null ถือว่าเท่ากัน · รูปปกว่างเดิม = ไม่มีอะไรให้เก็บ) */
export function diffVersionedFields(table: string, before: Record<string, unknown>, patch: Record<string, unknown>): FieldChange[] {
  const out: FieldChange[] = [];
  for (const col of versionedColumnsIn(table, patch)) {
    const oldV = norm(before[col]);
    const newV = norm(patch[col]);
    if (oldV === newV) continue;
    if (col === COVER_COLUMN) {
      if (oldV) out.push({ kind: "image", field_key: "cover", old_key: oldV, new_key: newV });
      continue;
    }
    out.push({ kind: "field", field_key: col, old_value: oldV, new_value: newV });
  }
  return out;
}

/** จดเวอร์ชันจากการแก้ฟิลด์ (เรียกหลัง update สำเร็จ แต่ "ก่อน" เช็ก/ย้ายรูปปกเก่าเข้าถัง) */
export async function captureFieldVersions(
  admin: Admin,
  args: { table: string; id: string; changes: FieldChange[]; source?: VersionSource } & VersionActor,
): Promise<number> {
  if (!args.changes.length) return 0;
  const rows = args.changes.map((c) => ({
    entity_type: args.table, entity_id: args.id, field_key: c.field_key, kind: c.kind,
    old_value: c.kind === "field" ? c.old_value : { r2_key: c.old_key },
    new_value: c.kind === "field" ? c.new_value : { r2_key: c.new_key },
    r2_key: c.kind === "image" ? c.old_key : null,
    source: args.source ?? "master_edit",
    changed_by: args.actorId ?? null, actor_name: args.actorName ?? null, task_id: args.taskId ?? null,
  }));
  try {
    const { error } = await admin.from(TABLE).insert(rows);
    if (error) { console.error("[record-versions] insert field versions", error.message); return 0; }
    for (const c of args.changes) await pruneVersions(admin, args.table, args.id, c.field_key);
    return rows.length;
  } catch (e) {
    console.error("[record-versions] captureFieldVersions", e);
    return 0;
  }
}

/** จดรูปที่ถูกลบ/เอาออก (เรียกหลังลบสำเร็จ แต่ "ก่อน" เช็ก/ย้ายไฟล์เข้าถัง → ไฟล์จะถูกเก็บไว้) */
export async function captureImageVersion(
  admin: Admin,
  args: { table: string; id: string; fieldKey: ImageFieldKey; r2Key: string; meta?: Record<string, unknown>; source: VersionSource } & VersionActor,
): Promise<boolean> {
  const key = norm(args.r2Key);
  if (!key || !VERSIONED_TEXT_FIELDS[args.table]) return false;
  try {
    const { error } = await admin.from(TABLE).insert({
      entity_type: args.table, entity_id: args.id, field_key: args.fieldKey, kind: "image",
      old_value: { r2_key: key, ...(args.meta ?? {}) }, new_value: null, r2_key: key, source: args.source,
      changed_by: args.actorId ?? null, actor_name: args.actorName ?? null, task_id: args.taskId ?? null,
      meta: args.meta ?? {},
    });
    if (error) { console.error("[record-versions] insert image version", error.message); return false; }
    await pruneVersions(admin, args.table, args.id, args.fieldKey);
    return true;
  } catch (e) {
    console.error("[record-versions] captureImageVersion", e);
    return false;
  }
}

/** ตัดเวอร์ชันเก่าที่เกินจำนวนเก็บ — รูปที่ตัดทิ้งแล้วไม่มีใครใช้ → ย้ายเข้าถังขยะ R2 (กู้ได้ 30 วัน) */
async function pruneVersions(admin: Admin, table: string, id: string, fieldKey: string): Promise<void> {
  const keep = (KEEP_IMAGE as Record<string, number>)[fieldKey] ?? KEEP_TEXT;
  const { data } = await admin.from(TABLE).select("id, r2_key")
    .eq("entity_type", table).eq("entity_id", id).eq("field_key", fieldKey)
    .order("changed_at", { ascending: false }).range(keep, keep + 200);
  const extra = (data ?? []) as { id: string; r2_key: string | null }[];
  if (!extra.length) return;
  const { error } = await admin.from(TABLE).delete().in("id", extra.map((x) => x.id));
  if (error) { console.error("[record-versions] prune", error.message); return; }
  for (const k of new Set(extra.map((x) => x.r2_key).filter((x): x is string => !!x))) {
    try { if (!(await r2KeyStillReferenced(admin, k))) await r2MoveToTrash(k); } catch { /* best-effort */ }
  }
}

export type RecordVersion = {
  id: string; kind: "field" | "image"; field_key: string;
  old_value: unknown; new_value: unknown; r2_key: string | null; image_url: string | null;
  source: string | null; task_id: string | null; actor_name: string | null; changed_at: string;
};

const GALLERY_MAX = 9;   // เท่ากับ maxItems ของแกลเลอรีสินค้าในตัวแก้สินค้ากลาง
const DESC_MODULE = "parent_sku_description";

const ctFromKey = (key: string): string => {
  const ext = (key.split(".").pop() ?? "").toLowerCase();
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : ext === "svg" ? "image/svg+xml" : "image/jpeg";
};

/** สถานะ "ตอนนี้" ของสินค้า ใช้บอกว่าเวอร์ชันไหนตรงกับปัจจุบัน/รูปไหนอยู่ในสินค้าแล้ว */
export type CurrentState = { text: Record<string, string | null>; cover: string | null; gallery: Set<string>; description: Set<string> };

export async function loadCurrentState(admin: Admin, table: string, id: string): Promise<CurrentState> {
  const textCols = VERSIONED_TEXT_FIELDS[table] ?? [];
  const [{ data: row }, { data: att }, { data: use }] = await Promise.all([
    admin.from(table).select([...textCols, COVER_COLUMN].join(",")).eq("id", id).maybeSingle(),
    admin.from("erp_playground_attachments").select("file_path").eq("entity_type", table).eq("entity_id", id),
    table === "parent_skus_v2"
      ? admin.from("asset_usages").select("asset_id").eq("module", DESC_MODULE).eq("record_id", id)
      : Promise.resolve({ data: [] as { asset_id: string }[] }),
  ]);
  const r = (row as unknown as Record<string, unknown>) ?? {};
  const assetIds = ((use ?? []) as { asset_id: string }[]).map((u) => u.asset_id);
  const { data: assets } = assetIds.length ? await admin.from("assets").select("r2_key").in("id", assetIds) : { data: [] };
  return {
    text: Object.fromEntries(textCols.map((c) => [c, norm(r[c])])),
    cover: norm(r[COVER_COLUMN]),
    gallery: new Set(((att ?? []) as { file_path: string | null }[]).map((a) => a.file_path).filter((x): x is string => !!x)),
    description: new Set(((assets ?? []) as { r2_key: string | null }[]).map((a) => a.r2_key).filter((x): x is string => !!x)),
  };
}

/** เวอร์ชันนี้ "ตรงกับตอนนี้" ไหม (ข้อความเท่ากัน / ปกเดียวกัน / รูปอยู่ในแกลเลอรี-Description แล้ว) → ย้อนไม่จำเป็น */
export function isVersionCurrent(v: Pick<RecordVersion, "kind" | "field_key" | "old_value" | "r2_key">, cur: CurrentState): boolean {
  if (v.kind === "field") return norm(v.old_value) === (cur.text[v.field_key] ?? null);
  if (!v.r2_key) return false;
  if (v.field_key === "cover") return cur.cover === v.r2_key;
  if (v.field_key === "gallery") return cur.gallery.has(v.r2_key);
  if (v.field_key === "description_images") return cur.description.has(v.r2_key);
  return false;
}

export type RestoreResult = { ok: true; already: boolean; table: string; entityId: string; fieldKey: string; kind: string } | { ok: false; error: string; status: number };

/**
 * ย้อนกลับ/กู้คืนเวอร์ชัน — ค่าปัจจุบันก่อนย้อนถูกจดเป็นเวอร์ชันใหม่ (source=restore) → ย้อนกลับได้อีก
 *   ข้อความ → เขียนค่าเก่ากลับ · รูปปก → ตั้งปกเป็นรูปเก่า · แกลเลอรี → ใส่รูปกลับต่อท้าย · รูป Description → ผูกรูปกลับต่อท้าย
 * สิทธิ์ (products.edit + สิทธิ์ระดับฟิลด์) + audit ตรวจ/เขียนที่ API
 */
export async function restoreVersion(admin: Admin, versionId: string, actor: VersionActor): Promise<RestoreResult> {
  const { data: vd } = await admin.from(TABLE).select("id, entity_type, entity_id, field_key, kind, old_value, r2_key, meta").eq("id", versionId).maybeSingle();
  const v = vd as { id: string; entity_type: string; entity_id: string; field_key: string | null; kind: string; old_value: unknown; r2_key: string | null; meta: Record<string, unknown> | null } | null;
  if (!v || !v.field_key) return { ok: false, error: "ไม่พบเวอร์ชันนี้ (อาจถูกตัดออกเพราะเก่าเกินจำนวนที่เก็บ)", status: 404 };
  const table = v.entity_type, id = v.entity_id, fk = v.field_key;
  if (!VERSIONED_TEXT_FIELDS[table]) return { ok: false, error: "ข้อมูลนี้ไม่รองรับการย้อนเวอร์ชัน", status: 400 };
  const done = (already: boolean): RestoreResult => ({ ok: true, already, table, entityId: id, fieldKey: fk, kind: v.kind });
  const cur = await loadCurrentState(admin, table, id);
  if (isVersionCurrent({ kind: v.kind as "field" | "image", field_key: fk, old_value: v.old_value, r2_key: v.r2_key }, cur)) return done(true);

  if (v.kind === "field") {
    if (!VERSIONED_TEXT_FIELDS[table].includes(fk)) return { ok: false, error: "ช่องนี้ไม่รองรับการย้อนเวอร์ชัน", status: 400 };
    const target = norm(v.old_value);
    const { error } = await admin.from(table).update({ [fk]: target }).eq("id", id);
    if (error) return { ok: false, error: "ย้อนกลับไม่สำเร็จ กรุณาลองใหม่", status: 400 };
    await captureFieldVersions(admin, { table, id, source: "restore", ...actor, changes: [{ kind: "field", field_key: fk, old_value: cur.text[fk] ?? null, new_value: target }] });
    return done(false);
  }

  const key = norm(v.r2_key);
  if (!key) return { ok: false, error: "เวอร์ชันนี้ไม่มีไฟล์รูป", status: 400 };

  if (fk === "cover") {
    const { error } = await admin.from(table).update({ [COVER_COLUMN]: key }).eq("id", id);
    if (error) return { ok: false, error: "ตั้งรูปปกกลับไม่สำเร็จ กรุณาลองใหม่", status: 400 };
    if (cur.cover) await captureFieldVersions(admin, { table, id, source: "restore", ...actor, changes: [{ kind: "image", field_key: "cover", old_key: cur.cover, new_key: key }] });
    return done(false);
  }

  if (fk === "gallery") {
    if (cur.gallery.size >= GALLERY_MAX) return { ok: false, error: `แกลเลอรีเต็มแล้ว (${GALLERY_MAX} รูป) — ลบรูปที่ไม่ใช้ก่อน แล้วค่อยกู้รูปนี้กลับ`, status: 409 };
    const { data: mx } = await admin.from("erp_playground_attachments").select("sort_order")
      .eq("entity_type", table).eq("entity_id", id).order("sort_order", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    const meta = v.meta ?? {};
    const { error } = await admin.from("erp_playground_attachments").insert({
      entity_type: table, entity_id: id, file_name: (meta.file_name as string) || key.split("/").pop() || "image",
      file_path: key, public_url: `/api/r2-image?key=${encodeURIComponent(key)}`, content_type: ctFromKey(key),
      is_primary: cur.gallery.size === 0, sort_order: ((mx?.sort_order as number | null) ?? -1) + 1, uploaded_by: actor.actorId ?? null,
    });
    if (error) return { ok: false, error: "กู้รูปกลับเข้าแกลเลอรีไม่สำเร็จ กรุณาลองใหม่", status: 400 };
    return done(false);
  }

  if (fk === "description_images") {
    if (table !== "parent_skus_v2") return { ok: false, error: "รูป Description มีเฉพาะ Parent SKU", status: 400 };
    // ใช้ asset เดิมถ้ายังอยู่ (ปลุกจากถังขยะคลัง) · ไม่มีแล้ว → สร้าง asset ใหม่จากไฟล์เดิม (ไม่อัปซ้ำ)
    let assetId = (v.meta?.asset_id as string) || null;
    if (assetId) {
      const { data: a } = await admin.from("assets").select("id, r2_key, status").eq("id", assetId).maybeSingle();
      if (!a || (a.r2_key as string) !== key) assetId = null;
      else if (a.status !== "active") await admin.from("assets").update({ status: "active", trashed_at: null }).eq("id", assetId);
    }
    if (!assetId) {
      const name = key.split("/").pop() ?? "image";
      const { data: na } = await admin.from("assets").insert({
        title: name, file_name: name, r2_key: key, asset_type: "image", content_type: ctFromKey(key),
        ext: (key.split(".").pop() ?? "").toLowerCase() || null, status: "active", source: "upload",
      }).select("id").single();
      assetId = (na?.id as string) ?? null;
    }
    if (!assetId) return { ok: false, error: "กู้รูป Description ไม่สำเร็จ กรุณาลองใหม่", status: 400 };
    const { data: mx } = await admin.from("asset_usages").select("sort_order")
      .eq("module", DESC_MODULE).eq("record_id", id).order("sort_order", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    const { error } = await admin.from("asset_usages").insert({
      asset_id: assetId, module: DESC_MODULE, record_id: id, record_label: null, field: null, sort_order: ((mx?.sort_order as number | null) ?? -1) + 1,
    });
    if (error) return { ok: false, error: "กู้รูป Description ไม่สำเร็จ กรุณาลองใหม่", status: 400 };
    return done(false);
  }

  return { ok: false, error: "เวอร์ชันนี้ย้อนกลับไม่ได้", status: 400 };
}

/** รายการเวอร์ชันของสินค้า (ใหม่ → เก่า) — fieldKey ว่าง = ทุกช่อง */
export async function listVersions(admin: Admin, table: string, id: string, opts?: { fieldKey?: string | null; limit?: number }): Promise<RecordVersion[]> {
  let q = admin.from(TABLE)
    .select("id, kind, field_key, old_value, new_value, r2_key, source, task_id, actor_name, changed_at")
    .eq("entity_type", table).eq("entity_id", id).not("field_key", "is", null)
    .order("changed_at", { ascending: false }).limit(Math.min(Math.max(opts?.limit ?? 100, 1), 300));
  if (opts?.fieldKey) q = q.eq("field_key", opts.fieldKey);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Omit<RecordVersion, "image_url">[]).map((r) => ({ ...r, image_url: r.r2_key ? r2ImageUrl(r.r2_key) : null }));
}
