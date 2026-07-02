// ============================================================
// Subtask -> Product sync engine (server-only)
// approve -> push images/text to Parent SKU/SKU; revise/cancel -> reverse via ledger (erp_subtask_sync)
// targets: erp_playground_attachments (แกลเลอรีสินค้าที่ผู้ใช้เห็นจริง — entity_type skus_v2/parent_skus_v2)
//          + skus_v2/parent_skus_v2.cover_image_r2_key + *.description (field from config)
// best-effort + ledger every action (must not break approve)
// ============================================================
/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeAudit } from "@/lib/audit";

// replace_map: targetKey ("parent:<id>" / "sku:<id>") → { attachmentR2Key → slotId ที่จะแทน (หรือ "new" = เพิ่มรูปใหม่) }
// product_images: targetKey ("parent:<id>" / "sku:<id>") → รูป (r2_key) เฉพาะสินค้านั้น (กล่องต่อสินค้า) · ใช้ replace_map[tk] เพื่อเลือกแทน/เพิ่ม
// product_labels: tk → รหัสสินค้า (เช่น "BSAC007") ใช้โชว์ป้ายบนการ์ด (denormalize, engine ไม่ใช้)
export type ImageSyncTargets = { parent_ids?: string[]; sku_ids?: string[]; sku_images?: Record<string, string[]>; product_images?: Record<string, string[]>; product_labels?: Record<string, string>; image_order?: string[]; replace_map?: Record<string, Record<string, string>> } | null;
export type SubtaskForSync = { id: string; task_id: string; subtask_type?: string | null; config?: Record<string, unknown> | null; description?: string | null; image_sync_targets?: ImageSyncTargets };
export type SyncResult = { pushed: number; skipped: string[] };

// ประกอบ description ปลายทาง (append/replace) — ฟังก์ชันบริสุทธิ์ (เทสต์ได้)
export function composeDescription(prev: string | null | undefined, text: string, mode: "append" | "replace"): string {
  if (mode === "replace") return text.trim();
  return [(prev ?? "").trim(), text.trim()].filter(Boolean).join("\n\n");
}

type Target = { table: "skus_v2" | "parent_skus_v2"; ownerType: "product_sku" | "parent_sku"; id: string };

async function resolveTargets(admin: any, taskId: string, appliesTo: string[]): Promise<Target[]> {
  const out: Target[] = [];
  if (appliesTo.includes("sku")) {
    const { data } = await admin.from("erp_creative_task_skus").select("sku_id").eq("task_id", taskId);
    for (const r of (data ?? []) as { sku_id: string }[]) if (r.sku_id) out.push({ table: "skus_v2", ownerType: "product_sku", id: r.sku_id });
  }
  if (appliesTo.includes("parent")) {
    const { data } = await admin.from("erp_creative_task_parent_skus").select("parent_sku_id").eq("task_id", taskId);
    for (const r of (data ?? []) as { parent_sku_id: string }[]) if (r.parent_sku_id) out.push({ table: "parent_skus_v2", ownerType: "parent_sku", id: r.parent_sku_id });
  }
  const seen = new Set<string>();
  return out.filter((x) => { const k = `${x.table}:${x.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// ปลายทางรูปจาก "การติ๊กเลือก" ในป๊อปอัปส่งงาน (Parent SKU/SKU ที่ผู้ส่งเลือกเอง)
export function buildSelectedTargets(sel: ImageSyncTargets): Target[] {
  const out: Target[] = [];
  for (const id of sel?.parent_ids ?? []) if (id) out.push({ table: "parent_skus_v2", ownerType: "parent_sku", id });
  for (const id of sel?.sku_ids ?? []) if (id) out.push({ table: "skus_v2", ownerType: "product_sku", id });
  const seen = new Set<string>();
  return out.filter((x) => { const k = `${x.table}:${x.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

const ALLOWED_DESC_FIELDS = new Set(["description", "english_description", "platform_description"]);

// เดา content_type จากนามสกุลของ r2 key (แกลเลอรีกรองด้วย content_type startsWith "image/")
function ctFromKey(key: string): string {
  const ext = (key.split(".").pop() ?? "").toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "svg") return "image/svg+xml";
  return "image/jpeg";
}

const DESC_MODULE = "parent_sku_description";
// ผูกรูป (r2Key ที่มีอยู่แล้ว) เป็น "รูป Description" ของ Parent SKU ผ่านคลังกลาง (assets) + asset_usages
// replaceAssetId != null → แทนช่องนั้น (ใส่ที่ sort_order เดิม + ถอดลิงก์เก่า, asset เก่ายังอยู่ในคลัง)
async function linkDescriptionImage(admin: any, parentId: string, r2Key: string, replaceAssetId: string | null, baseLedger: Record<string, unknown>, ledger: Record<string, unknown>[]): Promise<boolean> {
  const ext = (r2Key.split(".").pop() ?? "").toLowerCase();
  const name = r2Key.split("/").pop() ?? "image";
  const { data: asset } = await admin.from("assets").insert({
    title: name, file_name: name, r2_key: r2Key, asset_type: "image",
    content_type: ctFromKey(r2Key), ext: ext || null, status: "active", source: "upload",
  }).select("id").single();
  const assetId = asset?.id as string | undefined;
  if (!assetId) return false;
  if (replaceAssetId) {
    const { data: oldU } = await admin.from("asset_usages").select("id, sort_order").eq("module", DESC_MODULE).eq("record_id", parentId).eq("asset_id", replaceAssetId).is("field", null).maybeSingle();
    const ord = (oldU?.sort_order as number | null) ?? null;
    await admin.from("asset_usages").insert({ asset_id: assetId, module: DESC_MODULE, record_id: parentId, record_label: null, field: null, sort_order: ord });
    if (oldU?.id) await admin.from("asset_usages").delete().eq("id", oldU.id);
    ledger.push({ ...baseLedger, target_kind: "desc_media_replace", target_table: "asset_usages", target_id: assetId, ref: r2Key, prev_value: replaceAssetId, new_value: assetId, mode: "description" });
  } else {
    const { data: mx } = await admin.from("asset_usages").select("sort_order").eq("module", DESC_MODULE).eq("record_id", parentId).order("sort_order", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    const ord = ((mx?.sort_order as number | null) ?? -1) + 1;
    await admin.from("asset_usages").insert({ asset_id: assetId, module: DESC_MODULE, record_id: parentId, record_label: null, field: null, sort_order: ord });
    ledger.push({ ...baseLedger, target_kind: "desc_media", target_table: "asset_usages", target_id: assetId, ref: r2Key, mode: "description" });
  }
  return true;
}

/** อนุมัติแล้ว -> ส่งข้อมูลเข้าสินค้า + บันทึก ledger */
export async function applySubtaskSync(admin: any, subtask: SubtaskForSync, opts: { actorId?: string | null }): Promise<SyncResult> {
  const cfg = (subtask.config ?? {}) as Record<string, any>;
  const target = String(cfg.approve_target ?? "none");
  const sel = subtask.image_sync_targets ?? null;
  const selTargets = buildSelectedTargets(sel);
  // รูปร่างต่อ SKU (กล่อง dropzone ใต้ SKU — โครงเดิม, append อย่างเดียว) → เข้าแกลเลอรีของ SKU นั้นตอนอนุมัติ
  const skuImageEntries = Object.entries((sel?.sku_images ?? {})).filter(([, keys]) => Array.isArray(keys) && keys.length) as [string, string[]][];
  // รูปเฉพาะต่อสินค้า (กล่องต่อ Parent/SKU แบบใหม่ — เลือกแทน/เพิ่มได้) key = "parent:<id>"/"sku:<id>"
  const productImageEntries = Object.entries((sel?.product_images ?? {})).filter(([, keys]) => Array.isArray(keys) && keys.length) as [string, string[]][];
  const isMediaType = target === "sku_media" || target === "description_media" || target === "cover";

  let pushed = 0; const skipped: string[] = [];
  const ledger: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  const base = { subtask_id: subtask.id, task_id: subtask.task_id, type_key: subtask.subtask_type ?? null, created_by: opts.actorId ?? null, created_at: now, active: true };

  // helper: เพิ่มรูปเข้า "แกลเลอรีสินค้าที่ผู้ใช้เห็น" = erp_playground_attachments (entity_type skus_v2/parent_skus_v2)
  const pushGallery = async (ownerType: "product_sku" | "parent_sku", table: "skus_v2" | "parent_skus_v2", ownerId: string, keys: string[], setCoverIfEmpty: boolean) => {
    const entityType = ownerType === "parent_sku" ? "parent_skus_v2" : "skus_v2";
    const { data: ex } = await admin.from("erp_playground_attachments").select("id, sort_order, is_primary").eq("entity_type", entityType).eq("entity_id", ownerId).order("sort_order", { ascending: false });
    const rows = (ex ?? []) as { id: string; sort_order: number; is_primary: boolean }[];
    let ord = rows.length ? Number(rows[0].sort_order ?? rows.length - 1) : -1;
    const hasPrimary = rows.length > 0 && rows.some((r) => r.is_primary);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]; ord += 1;
      const makePrimary = setCoverIfEmpty && rows.length === 0 && !hasPrimary && i === 0;
      const { data: ins, error } = await admin.from("erp_playground_attachments").insert({ entity_type: entityType, entity_id: ownerId, file_name: key.split("/").pop() ?? "image", file_path: key, public_url: `/api/r2-image?key=${encodeURIComponent(key)}`, content_type: ctFromKey(key), is_primary: makePrimary, sort_order: ord, uploaded_by: opts.actorId ?? null }).select("id").single();
      if (!error && ins?.id) { ledger.push({ ...base, target_kind: "media", target_table: "erp_playground_attachments", target_id: ins.id, ref: key, mode: "gallery" }); pushed++; }
    }
    // ตั้ง cover_image_r2_key ของสินค้าด้วย (การ์ด/รายการใช้) ถ้ายังไม่มี
    if (setCoverIfEmpty && keys[0]) {
      const { data: cur } = await admin.from(table).select("cover_image_r2_key").eq("id", ownerId).maybeSingle();
      if (!(cur?.cover_image_r2_key as string | null)) {
        await admin.from(table).update({ cover_image_r2_key: keys[0] }).eq("id", ownerId);
        ledger.push({ ...base, target_kind: "cover", target_table: table, target_id: ownerId, ref: "cover_image_r2_key", prev_value: null, new_value: keys[0] });
      }
    }
  };

  // helper: ดันรูป "keys" เข้าสินค้าเป้าหมายหนึ่ง ตาม m (replace map ของ tk นั้น) — แทนช่องเดิม/เพิ่มใหม่ + จด ledger
  // ค่า m[k]: "new"=เพิ่มแกลเลอรี · "<attId>"=แทนแกลเลอรี · "desc:new"=เพิ่ม Description · "desc:<assetId>"=แทน Description (Parent เท่านั้น)
  const applyKeysToTarget = async (ownerType: "product_sku" | "parent_sku", table: "skus_v2" | "parent_skus_v2", ownerId: string, keys: string[], m: Record<string, string>) => {
    const entityType = ownerType === "parent_sku" ? "parent_skus_v2" : "skus_v2";
    // Description (Parent เท่านั้น)
    if (ownerType === "parent_sku") {
      const descKeys = keys.filter((k) => (m[k] ?? "").startsWith("desc"));
      for (const imgKey of descKeys) {
        const val = m[imgKey]; const replaceAssetId = val === "desc:new" ? null : val.slice("desc:".length) || null;
        if (await linkDescriptionImage(admin, ownerId, imgKey, replaceAssetId, base, ledger)) pushed++; else skipped.push("desc_fail");
      }
    }
    const galleryKeys = keys.filter((k) => !(m[k] ?? "").startsWith("desc"));
    const replaceKeys = galleryKeys.filter((k) => m[k] && m[k] !== "new");
    const appendKeys = galleryKeys.filter((k) => !m[k] || m[k] === "new");
    for (const imgKey of replaceKeys) {
      const attId = m[imgKey];
      const { data: attRow } = await admin.from("erp_playground_attachments").select("id, file_path").eq("id", attId).eq("entity_type", entityType).eq("entity_id", ownerId).maybeSingle();
      if (!attRow) { skipped.push("slot_gone"); continue; }
      const prevKey = String(attRow.file_path ?? "");
      await admin.from("erp_playground_attachments").update({ file_path: imgKey, public_url: `/api/r2-image?key=${encodeURIComponent(imgKey)}`, file_name: imgKey.split("/").pop() ?? "image", content_type: ctFromKey(imgKey) }).eq("id", attId);
      const { data: cur } = await admin.from(table).select("cover_image_r2_key").eq("id", ownerId).maybeSingle();
      if ((cur?.cover_image_r2_key ?? null) === prevKey && prevKey) {
        await admin.from(table).update({ cover_image_r2_key: imgKey }).eq("id", ownerId);
        ledger.push({ ...base, target_kind: "cover", target_table: table, target_id: ownerId, ref: "cover_image_r2_key", prev_value: prevKey, new_value: imgKey });
      }
      ledger.push({ ...base, target_kind: "media_replace", target_table: "erp_playground_attachments", target_id: attId, ref: imgKey, prev_value: prevKey, new_value: imgKey, mode: "gallery" }); pushed++;
    }
    if (appendKeys.length) await pushGallery(ownerType, table, ownerId, appendKeys, false);
  };

  // ===== รูป → สินค้า : (1) รูปงานตามการติ๊กเลือก  (2) รูปร่างต่อ SKU =====
  if (isMediaType || selTargets.length || skuImageEntries.length || productImageEntries.length) {
    // (1) รูปงานที่แนบ → ปลายทางที่ติ๊ก (ถ้ามีติ๊ก + มีรูปงาน)
    if (selTargets.length) {
      const { data: atts } = await admin.from("erp_creative_attachments").select("r2_key").eq("subtask_id", subtask.id).eq("kind", "image");
      let imageKeys = ((atts ?? []) as { r2_key: string }[]).map((a) => a.r2_key).filter(Boolean);
      // เรียงตามลำดับที่ผู้ตรวจจัดไว้ (image_order) — คีย์ที่ไม่อยู่ใน order ต่อท้าย
      const order = sel?.image_order;
      if (order && order.length) imageKeys = imageKeys.slice().sort((a, b) => { const ia = order.indexOf(a), ib = order.indexOf(b); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); });
      if (imageKeys.length) {
        if (target === "cover") {
          for (const tg of selTargets) {
            const { data: cur } = await admin.from(tg.table).select("cover_image_r2_key").eq("id", tg.id).maybeSingle();
            const prev = (cur?.cover_image_r2_key as string | null) ?? null;
            await admin.from(tg.table).update({ cover_image_r2_key: imageKeys[0] }).eq("id", tg.id);
            ledger.push({ ...base, target_kind: "cover", target_table: tg.table, target_id: tg.id, ref: "cover_image_r2_key", prev_value: prev, new_value: imageKeys[0] }); pushed++;
          }
        } else if (!productImageEntries.length) {
          // legacy: ไม่มีกล่องรูปต่อสินค้า (product_images) → ใช้รูป "แนบงาน" ดันเข้าสินค้าที่ติ๊ก
          // ถ้ามี product_images (โหมดใหม่) ให้ข้าม เพื่อกันรูปแนบงานเข้าสินค้าซ้ำโดยไม่ตั้งใจ
          const rmap = sel?.replace_map ?? {};
          for (const tg of selTargets) {
            const tk = `${tg.ownerType === "parent_sku" ? "parent" : "sku"}:${tg.id}`;
            await applyKeysToTarget(tg.ownerType, tg.table, tg.id, imageKeys, rmap[tk] ?? {});
          }
        }
      }
    }
    // (2) รูปเฉพาะต่อสินค้า (กล่องต่อ Parent/SKU) → แทน/เพิ่ม ตาม replace_map ของ tk นั้น
    {
      const rmap = sel?.replace_map ?? {};
      for (const [tk, keys] of productImageEntries) {
        const [pfx, id] = tk.split(":");
        if (!id) continue;
        const ownerType = pfx === "parent" ? "parent_sku" : "product_sku";
        const table = pfx === "parent" ? "parent_skus_v2" : "skus_v2";
        await applyKeysToTarget(ownerType, table, id, keys.filter(Boolean), rmap[tk] ?? {});
      }
    }
    // (3) รูปร่างต่อ SKU (โครงเดิม sku_images, append อย่างเดียว) → แกลเลอรีของ SKU นั้น + ตั้งปกถ้าว่าง
    for (const [skuId, keys] of skuImageEntries) await pushGallery("product_sku", "skus_v2", skuId, keys.filter(Boolean), true);

    if (ledger.length) await admin.from("erp_subtask_sync").insert(ledger);
    if (!pushed) skipped.push("no_images");
    await writeAudit(admin, { action: "subtask:sync", entityType: "creative_subtask", entityId: subtask.id, actorId: opts.actorId ?? null, actorName: null, metadata: { target, mode: "selection", pushed, sku_image_skus: skuImageEntries.length, skipped } });
    return { pushed, skipped };
  }

  // ===== คำอธิบาย → สินค้า : ตาม type config + สินค้าที่ผูกกับงาน (เหมือนเดิม) =====
  if (target === "none") return { pushed: 0, skipped: ["no_target"] };
  const appliesTo: string[] = Array.isArray(cfg.applies_to) && cfg.applies_to.length ? cfg.applies_to : ["parent", "sku"];
  const targets = await resolveTargets(admin, subtask.task_id, appliesTo);
  if (!targets.length) return { pushed: 0, skipped: ["no_products"] };
  const text = (subtask.description ?? "").trim();

  for (const tg of targets) {
    if (target === "sku_description") {
      if (!text) { skipped.push("no_text"); continue; }
      const field = ALLOWED_DESC_FIELDS.has(String(cfg.description_field)) ? String(cfg.description_field) : "description";
      const mode = cfg.desc_mode === "replace" ? "replace" : "append";
      const { data: cur } = await admin.from(tg.table).select(field).eq("id", tg.id).maybeSingle();
      const prev = (cur?.[field] as string | null) ?? null;
      const next = composeDescription(prev, text, mode);
      await admin.from(tg.table).update({ [field]: next }).eq("id", tg.id);
      ledger.push({ ...base, target_kind: "description", target_table: tg.table, target_id: tg.id, ref: field, prev_value: prev, new_value: next, mode }); pushed++;
    }
  }
  if (ledger.length) await admin.from("erp_subtask_sync").insert(ledger);
  await writeAudit(admin, { action: "subtask:sync", entityType: "creative_subtask", entityId: subtask.id, actorId: opts.actorId ?? null, actorName: null, metadata: { target, pushed, skipped } });
  return { pushed, skipped };
}

/** revise/cancel -> ถอดข้อมูลที่เคยส่งเข้าสินค้าออก (อ่าน ledger active) — ไม่ลบไฟล์ R2 */
export async function reverseSubtaskSync(admin: any, subtaskId: string, opts: { actorId?: string | null; reason?: string | null }): Promise<number> {
  const { data: rows } = await admin.from("erp_subtask_sync").select("*").eq("subtask_id", subtaskId).eq("active", true);
  let reversed = 0; const now = new Date().toISOString();
  for (const r of (rows ?? []) as Record<string, any>[]) {
    try {
      if (r.target_kind === "media") {
        // ลบรูปที่เคยเพิ่ม (target_table = erp_playground_attachments ของใหม่ / product_image_slots ของเก่า)
        await admin.from(r.target_table ?? "erp_playground_attachments").delete().eq("id", r.target_id);
      } else if (r.target_kind === "media_replace") {
        // คืนรูปเก่าเข้าช่องเดิม (เฉพาะถ้ายังเป็นรูปที่เราแทนไว้ กันทับการแก้มือภายหลัง)
        if (r.target_table === "erp_playground_attachments") {
          // public_url = NOT NULL → คืนได้เฉพาะเมื่อมีรูปเก่า (prev_value) จริง
          const { data: cur } = await admin.from("erp_playground_attachments").select("file_path").eq("id", r.target_id).maybeSingle();
          if (r.prev_value && (cur?.file_path ?? null) === r.new_value) await admin.from("erp_playground_attachments").update({ file_path: r.prev_value, public_url: `/api/r2-image?key=${encodeURIComponent(r.prev_value)}`, file_name: String(r.prev_value).split("/").pop() ?? "image" }).eq("id", r.target_id);
        } else {
          const { data: cur } = await admin.from("product_image_slots").select("r2_key").eq("id", r.target_id).maybeSingle();
          if ((cur?.r2_key ?? null) === r.new_value) await admin.from("product_image_slots").update({ r2_key: r.prev_value ?? null }).eq("id", r.target_id);
        }
      } else if (r.target_kind === "desc_media") {
        // ถอดรูป Description ที่เพิ่ม → ลบลิงก์ (asset_id ที่สร้างใหม่ ไม่ซ้ำใคร ลบตรงได้)
        await admin.from("asset_usages").delete().eq("asset_id", r.target_id).eq("module", DESC_MODULE);
      } else if (r.target_kind === "desc_media_replace") {
        // คืนรูป Description เก่า: ถ้าลิงก์ใหม่ยังอยู่ → ใส่ลิงก์เก่ากลับที่ตำแหน่งเดิม แล้วลบลิงก์ใหม่
        const { data: newU } = await admin.from("asset_usages").select("id, record_id, sort_order").eq("asset_id", r.target_id).eq("module", DESC_MODULE).maybeSingle();
        if (newU?.id && r.prev_value) {
          await admin.from("asset_usages").insert({ asset_id: r.prev_value, module: DESC_MODULE, record_id: newU.record_id, record_label: null, field: null, sort_order: newU.sort_order ?? null });
          await admin.from("asset_usages").delete().eq("id", newU.id);
        }
      } else if (r.target_kind === "cover") {
        const { data: cur } = await admin.from(r.target_table).select("cover_image_r2_key").eq("id", r.target_id).maybeSingle();
        if ((cur?.cover_image_r2_key ?? null) === r.new_value) await admin.from(r.target_table).update({ cover_image_r2_key: r.prev_value ?? null }).eq("id", r.target_id);
      } else if (r.target_kind === "description") {
        const field = String(r.ref);
        if (ALLOWED_DESC_FIELDS.has(field)) {
          const { data: cur } = await admin.from(r.target_table).select(field).eq("id", r.target_id).maybeSingle();
          // ถอดเฉพาะถ้าค่าปัจจุบันยังเป็นค่าที่เราใส่ (กันทับการแก้ด้วยมือภายหลัง)
          if ((cur?.[field] ?? null) === r.new_value) await admin.from(r.target_table).update({ [field]: r.prev_value ?? null }).eq("id", r.target_id);
        }
      }
      await admin.from("erp_subtask_sync").update({ active: false, reversed_at: now }).eq("id", r.id);
      reversed++;
    } catch { /* ข้ามอันที่พลาด ทำต่อ */ }
  }
  if (reversed) await writeAudit(admin, { action: "subtask:sync_reverse", entityType: "creative_subtask", entityId: subtaskId, actorId: opts.actorId ?? null, actorName: null, metadata: { reversed, reason: opts.reason ?? null } });
  return reversed;
}

/**
 * ใส่รูปเข้าสินค้า "ทันที" (ปุ่ม 'ใส่เข้าสินค้าเลย' ในป๊อปอัปส่งงาน — ไม่รออนุมัติ)
 * items: { r2_key, slot }  · slot = attachment id (แทนช่องนั้น) หรือ "new"/ว่าง (เพิ่มรูปใหม่)
 * เก็บ ledger (media/media_replace) ไว้ดู/กู้เวอร์ชันเก่าได้ แต่ active:false → ไม่ถูกถอดตอน revise/ย้อนงานย่อย
 * ต้อง guard สิทธิ์ products.edit จากฝั่ง route ก่อนเรียก
 */
export async function applyProductImagesNow(
  admin: any,
  input: { ownerType: "parent_sku" | "product_sku"; ownerId: string; items: { r2_key: string; slot?: string | null }[]; subtaskId?: string | null; taskId?: string | null; actorId?: string | null },
): Promise<SyncResult> {
  const table = input.ownerType === "parent_sku" ? "parent_skus_v2" : "skus_v2";
  const entityType = table;
  const now = new Date().toISOString();
  const base = { subtask_id: input.subtaskId ?? null, task_id: input.taskId ?? null, type_key: null, created_by: input.actorId ?? null, created_at: now, active: false };
  const ledger: Record<string, unknown>[] = [];
  let pushed = 0; const skipped: string[] = [];
  const items = (input.items ?? []).filter((it) => it && it.r2_key);
  // Description (Parent เท่านั้น): slot ขึ้นต้น "desc"
  if (input.ownerType === "parent_sku") {
    const descItems = items.filter((it) => (it.slot ?? "").startsWith("desc"));
    for (const it of descItems) {
      const replaceAssetId = it.slot === "desc:new" ? null : String(it.slot).slice("desc:".length) || null;
      if (await linkDescriptionImage(admin, input.ownerId, it.r2_key, replaceAssetId, base, ledger)) pushed++; else skipped.push("desc_fail");
    }
  }
  const galleryItems = items.filter((it) => !(it.slot ?? "").startsWith("desc"));
  const replaceItems = galleryItems.filter((it) => it.slot && it.slot !== "new");
  const appendKeys = galleryItems.filter((it) => !it.slot || it.slot === "new").map((it) => it.r2_key);

  // แทนช่องเดิม
  for (const it of replaceItems) {
    const attId = String(it.slot);
    const { data: attRow } = await admin.from("erp_playground_attachments").select("id, file_path").eq("id", attId).eq("entity_type", entityType).eq("entity_id", input.ownerId).maybeSingle();
    if (!attRow) { skipped.push("slot_gone"); continue; }
    const prevKey = String(attRow.file_path ?? "");
    await admin.from("erp_playground_attachments").update({ file_path: it.r2_key, public_url: `/api/r2-image?key=${encodeURIComponent(it.r2_key)}`, file_name: it.r2_key.split("/").pop() ?? "image", content_type: ctFromKey(it.r2_key) }).eq("id", attId);
    const { data: cur } = await admin.from(table).select("cover_image_r2_key").eq("id", input.ownerId).maybeSingle();
    if ((cur?.cover_image_r2_key ?? null) === prevKey && prevKey) await admin.from(table).update({ cover_image_r2_key: it.r2_key }).eq("id", input.ownerId);
    ledger.push({ ...base, target_kind: "media_replace", target_table: "erp_playground_attachments", target_id: attId, ref: it.r2_key, prev_value: prevKey, new_value: it.r2_key, mode: "apply_now" }); pushed++;
  }
  // เพิ่มรูปใหม่ (ต่อท้าย + ตั้งปกถ้าแกลเลอรีว่าง)
  if (appendKeys.length) {
    const { data: ex } = await admin.from("erp_playground_attachments").select("id, sort_order, is_primary").eq("entity_type", entityType).eq("entity_id", input.ownerId).order("sort_order", { ascending: false });
    const rows = (ex ?? []) as { sort_order: number; is_primary: boolean }[];
    let ord = rows.length ? Number(rows[0].sort_order ?? rows.length - 1) : -1;
    const hasPrimary = rows.length > 0 && rows.some((r) => r.is_primary);
    for (let i = 0; i < appendKeys.length; i++) {
      const key = appendKeys[i]; ord += 1;
      const makePrimary = rows.length === 0 && !hasPrimary && i === 0;
      const { data: ins, error } = await admin.from("erp_playground_attachments").insert({ entity_type: entityType, entity_id: input.ownerId, file_name: key.split("/").pop() ?? "image", file_path: key, public_url: `/api/r2-image?key=${encodeURIComponent(key)}`, content_type: ctFromKey(key), is_primary: makePrimary, sort_order: ord, uploaded_by: input.actorId ?? null }).select("id").single();
      if (!error && ins?.id) { ledger.push({ ...base, target_kind: "media", target_table: "erp_playground_attachments", target_id: ins.id, ref: key, mode: "apply_now" }); pushed++; }
    }
    const { data: cur } = await admin.from(table).select("cover_image_r2_key").eq("id", input.ownerId).maybeSingle();
    if (!(cur?.cover_image_r2_key as string | null)) await admin.from(table).update({ cover_image_r2_key: appendKeys[0] }).eq("id", input.ownerId);
  }
  if (ledger.length) await admin.from("erp_subtask_sync").insert(ledger);
  await writeAudit(admin, { action: "product:apply_images_now", entityType: table, entityId: input.ownerId, actorId: input.actorId ?? null, actorName: null, metadata: { pushed, skipped, subtask_id: input.subtaskId ?? null } });
  return { pushed, skipped };
}
