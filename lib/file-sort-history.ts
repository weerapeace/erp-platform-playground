/**
 * 📂 ประวัติตัวแยกไฟล์ (ของกลาง · pure) — ใช้ใน GET /api/file-sort/history
 *   ข้อมูลอยู่ที่ประวัติกลาง audit_logs: file_sort.upload (1 ครั้งที่ใช้) + file_sort.undo (กดย้ายกลับ · มี run_id ของครั้งนั้น)
 *   mergeFileSortUndo: ย้ายกลับที่เจอครั้งที่ลงไฟล์ของมันในชุดเดียวกัน → แนบ undone_at / undone_by เข้าแถวนั้น แล้วซ่อนแถวย้ายกลับ
 *   (ไม่เจอ = โชว์แถวย้ายกลับเดี่ยว ๆ) · หน้าจอแปลด้วย lib/audit-format (describeFileSort)
 *   cleanErpSlots / erpSlotText: ลงระบบ ERP รายช่อง (metadata.erp — โปรแกรม v1.13+) → กล่อง "ลงระบบ ERP" ในหน้าประวัติไฟล์
 */
export const FILE_SORT_ACTIONS = ["file_sort.upload", "file_sort.undo"] as const;
/** entity_type ที่ /api/file-sort/log จดเสมอ — ใช้กรองคู่กันเพื่อให้ฐานข้อมูลใช้ index (ตาราง audit_logs ไม่มี index ที่ action) */
export const FILE_SORT_ENTITY_TYPES = ["assets", "content_album"] as const;

type Row = { action: string; created_at: string; actor_name?: string | null; metadata: Record<string, unknown> | null };

const runIdOf = (r: Row): string => (r.metadata && typeof r.metadata.run_id === "string" ? r.metadata.run_id : "");

/** แถวเรียงใหม่ → เก่า (ตามที่ API ดึงมา) · คืนชุดใหม่ ไม่แก้ของเดิม */
export function mergeFileSortUndo<T extends Row>(rows: T[]): T[] {
  const uploads = new Map<string, number>();
  const out: T[] = rows.map((r) => ({ ...r, metadata: { ...(r.metadata ?? {}) } }));
  out.forEach((r, i) => { const id = runIdOf(r); if (r.action === "file_sort.upload" && id && !uploads.has(id)) uploads.set(id, i); });
  const drop = new Set<number>();
  out.forEach((r, i) => {
    if (r.action !== "file_sort.undo") return;
    const at = uploads.get(runIdOf(r));
    if (at === undefined) return;
    const up = out[at];
    // แถวใหม่สุดมาก่อน → ย้ายกลับครั้งล่าสุดถูกแนบก่อน (ครั้งเก่ากว่าไม่ทับ)
    if (!up.metadata!.undone_at) {
      up.metadata!.undone_at = r.created_at;
      up.metadata!.undone_by = r.actor_name ?? (typeof r.metadata?.actor === "string" ? r.metadata.actor : null);
      if (Array.isArray(r.metadata?.errors) && r.metadata!.errors.length) up.metadata!.undone_errors = r.metadata!.errors.length;
    }
    drop.add(i);
  });
  return out.filter((_, i) => !drop.has(i));
}

/** คำค้น (รหัสรุ่น/ชื่องาน) ที่ปลอดภัยสำหรับตัวกรอง PostgREST — ตัดเครื่องหมายพิเศษ */
//   \p{M} = วรรณยุกต์/สระบนล่างภาษาไทย (ไม่ใส่ = "กระเป๋า" กลายเป็น "กระเป า")
export const cleanHistoryTerm = (s: string | null | undefined): string =>
  String(s ?? "").replace(/[^\p{L}\p{M}\p{N}\s_\-#.]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60);

// ── ลงระบบ ERP รายช่อง (โปรแกรม v1.13+ ส่ง erp[] มากับ /api/file-sort/log) ──
//   หน้า Task Manager › ประวัติไฟล์ โชว์กล่อง "ลงระบบ ERP": ช่องไหน ลงกี่รูป เอารูปเดิมออกกี่รูป ข้ามกี่รูป · รูปย่อที่ลง · ลิงก์หน้าสินค้า · พลาดเพราะอะไร
//   ประวัติเก่า (ไม่มี erp) = ไม่มีกล่องนี้ โชว์แบบเดิม
export type FsErpSlotKind = "skuGallery" | "parentGallery" | "desc" | "png";
export type FsErpSlot = {
  kind: FsErpSlotKind;
  /** รหัส SKU / รุ่นที่โชว์ */
  code: string | null;
  /** หน้าสินค้าที่เปิดได้ (แกลเลอรี SKU = SKU · ที่เหลือ = Parent) */
  entity_type: "skus_v2" | "parent_skus_v2" | null;
  entity_id: string | null;
  mode: "replace" | "append" | "pick" | null;
  /** done ลงครบ · partial ลงได้บางรูป · failed ลงไม่ได้เลย · already รูปในระบบตรงกับโฟลเดอร์แล้ว · off ไม่ลง (ตามที่เลือก) */
  state: "done" | "partial" | "failed" | "already" | "off";
  up: number;
  removed: number;
  /** ข้ามเพราะหน้าตาเหมือนรูปในระบบ / เคยลงแล้ว */
  same: number;
  /** คนเลือกไม่ลงเอง (รูปยังอยู่บน Z:) */
  excluded: number;
  reordered: boolean;
  /** R2 key ของรูปที่ลง (ไว้ทำรูปย่อ · สูงสุด 12) */
  keys: string[];
  fails: { file: string; why: string }[];
};

const FS_ERP_KINDS: FsErpSlotKind[] = ["skuGallery", "parentGallery", "desc", "png"];
const FS_ERP_STATES: FsErpSlot["state"][] = ["done", "partial", "failed", "already", "off"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "") || null;
const cnt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(9999, Math.max(0, Math.round(v))) : 0);
/** R2 key ที่ปลอดภัยพอจะทำลิงก์รูปย่อ: ตัวอักษรปกติ · ไม่มีช่วง "." / ".." · ไม่ขึ้นต้นด้วย / */
const safeKey = (v: unknown): string | null => {
  const k = typeof v === "string" ? v.trim() : "";
  if (!k || k.length > 300 || k.startsWith("/") || !/^[\w\-./ ()%+@,=~]+$/.test(k)) return null;
  return k.split("/").some((s) => s === "." || s === ".." || s === "") ? null : k;
};

/** erp[] จากโปรแกรม → ใช้ได้เสมอ (ตัดของแปลก/ยาวเกิน · สูงสุด 40 ช่อง) */
export function cleanErpSlots(raw: unknown): FsErpSlot[] {
  if (!Array.isArray(raw)) return [];
  const out: FsErpSlot[] = [];
  for (const v of raw.slice(0, 40)) {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const kind = FS_ERP_KINDS.find((k) => k === o.kind);
    if (!kind) continue;
    const et = o.entity_type === "skus_v2" || o.entity_type === "parent_skus_v2" ? o.entity_type : null;
    const eid = typeof o.entity_id === "string" && UUID_RE.test(o.entity_id) ? o.entity_id.toLowerCase() : null;
    out.push({
      kind, code: txt(o.code, 80),
      entity_type: et && eid ? et : null, entity_id: et && eid ? eid : null,
      mode: o.mode === "replace" || o.mode === "append" || o.mode === "pick" ? o.mode : null,
      state: FS_ERP_STATES.find((s) => s === o.state) ?? "done",
      up: cnt(o.up), removed: cnt(o.removed), same: cnt(o.same), excluded: cnt(o.excluded),
      reordered: o.reordered === true,
      keys: [...new Set((Array.isArray(o.keys) ? o.keys : []).map(safeKey).filter((k): k is string => !!k))].slice(0, 12),
      fails: (Array.isArray(o.fails) ? o.fails : []).slice(0, 10).map((f) => {
        const x = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
        return { file: txt(x.file, 200) ?? "", why: txt(x.why, 200) ?? "" };
      }).filter((f) => f.file || f.why),
    });
  }
  return out;
}

const FS_ERP_SLOT_LABEL: Record<FsErpSlotKind, [string, string]> = {
  skuGallery: ["แกลเลอรี SKU", "SKU gallery"], parentGallery: ["แกลเลอรี Parent", "Parent gallery"],
  desc: ["รูป Description", "Description images"], png: ["รูปตัด PNG", "Cut-out PNG"],
};

/** ชื่อช่อง + ผลเป็นภาษาคน: "แกลเลอรี SKU TML10-01" · "ลง 5 · เอารูปเดิมออก 9 · ข้าม 2 (มีแล้ว)" — en = ภาษาอังกฤษ */
export function erpSlotText(s: FsErpSlot, en = false): { title: string; result: string } {
  const L = (th: string, eng: string) => (en ? eng : th);
  const title = `${FS_ERP_SLOT_LABEL[s.kind][en ? 1 : 0]}${s.code ? ` ${s.code}` : ""}`;
  if (s.state === "off") return { title, result: L("ไม่ลง (ตามที่เลือก)", "Not uploaded (as chosen)") };
  const parts: string[] = [];
  if (s.up) parts.push(L(`ลง ${s.up}`, `uploaded ${s.up}`));
  if (s.removed) parts.push(L(`เอารูปเดิมออก ${s.removed}`, `removed ${s.removed} old`));
  if (s.same) parts.push(L(`ข้าม ${s.same} (มีแล้ว)`, `skipped ${s.same} (already there)`));
  if (s.excluded) parts.push(L(`ไม่ลง ${s.excluded} (เลือกเอง)`, `left out ${s.excluded} (chosen)`));
  if (s.reordered) parts.push(L("จัดลำดับใหม่", "reordered"));
  if (!parts.length) parts.push(s.state === "already" ? L("ตรงกับโฟลเดอร์แล้ว ไม่ต้องลงซ้ำ", "already matches the folder") : s.state === "failed" ? L("ลงไม่สำเร็จ", "failed") : L("ไม่มีรูปให้ลง", "nothing to upload"));
  return { title, result: parts.join(" · ") };
}
