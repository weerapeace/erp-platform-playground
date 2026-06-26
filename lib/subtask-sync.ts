// ============================================================
// Subtask -> Product sync engine (server-only)
// approve -> push images/text to Parent SKU/SKU; revise/cancel -> reverse via ledger (erp_subtask_sync)
// targets: product_image_slots (owner_type product_sku/parent_sku, image_group gallery/description)
//          + skus_v2/parent_skus_v2.cover_image_r2_key + *.description (field from config)
// best-effort + ledger every action (must not break approve)
// ============================================================
/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeAudit } from "@/lib/audit";

export type SubtaskForSync = { id: string; task_id: string; subtask_type?: string | null; config?: Record<string, unknown> | null; description?: string | null };
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

const ALLOWED_DESC_FIELDS = new Set(["description", "english_description", "platform_description"]);

/** อนุมัติแล้ว -> ส่งข้อมูลเข้าสินค้า + บันทึก ledger */
export async function applySubtaskSync(admin: any, subtask: SubtaskForSync, opts: { actorId?: string | null }): Promise<SyncResult> {
  const cfg = (subtask.config ?? {}) as Record<string, any>;
  const target = String(cfg.approve_target ?? "none");
  if (target === "none") return { pushed: 0, skipped: ["no_target"] };
  const appliesTo: string[] = Array.isArray(cfg.applies_to) && cfg.applies_to.length ? cfg.applies_to : ["parent", "sku"];
  const targets = await resolveTargets(admin, subtask.task_id, appliesTo);
  if (!targets.length) return { pushed: 0, skipped: ["no_products"] };

  const { data: atts } = await admin.from("erp_creative_attachments").select("r2_key").eq("subtask_id", subtask.id).eq("kind", "image");
  const imageKeys = ((atts ?? []) as { r2_key: string }[]).map((a) => a.r2_key).filter(Boolean);
  const text = (subtask.description ?? "").trim();

  let pushed = 0; const skipped: string[] = [];
  const ledger: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  const base = { subtask_id: subtask.id, task_id: subtask.task_id, type_key: subtask.subtask_type ?? null, created_by: opts.actorId ?? null, created_at: now, active: true };

  for (const tg of targets) {
    if (target === "sku_media" || target === "description_media") {
      if (!imageKeys.length) { skipped.push("no_images"); continue; }
      const group = target === "description_media" ? "description" : "gallery";
      const { data: mx } = await admin.from("product_image_slots").select("slot").eq("owner_type", tg.ownerType).eq("owner_id", tg.id).eq("image_group", group).order("slot", { ascending: false }).limit(1);
      let slot = (mx?.[0]?.slot as number) ?? -1;
      for (const key of imageKeys) {
        slot += 1;
        const { data: ins, error } = await admin.from("product_image_slots").insert({ owner_type: tg.ownerType, owner_id: tg.id, image_group: group, slot, r2_key: key }).select("id").single();
        if (!error && ins?.id) { ledger.push({ ...base, target_kind: "media", target_table: "product_image_slots", target_id: ins.id, ref: key, mode: group }); pushed++; }
      }
    } else if (target === "cover") {
      if (!imageKeys.length) { skipped.push("no_images"); continue; }
      const { data: cur } = await admin.from(tg.table).select("cover_image_r2_key").eq("id", tg.id).maybeSingle();
      const prev = (cur?.cover_image_r2_key as string | null) ?? null;
      await admin.from(tg.table).update({ cover_image_r2_key: imageKeys[0] }).eq("id", tg.id);
      ledger.push({ ...base, target_kind: "cover", target_table: tg.table, target_id: tg.id, ref: "cover_image_r2_key", prev_value: prev, new_value: imageKeys[0] }); pushed++;
    } else if (target === "sku_description") {
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
        await admin.from("product_image_slots").delete().eq("id", r.target_id);
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
