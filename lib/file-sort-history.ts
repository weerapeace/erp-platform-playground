/**
 * 📂 ประวัติตัวแยกไฟล์ (ของกลาง · pure) — ใช้ใน GET /api/file-sort/history
 *   ข้อมูลอยู่ที่ประวัติกลาง audit_logs: file_sort.upload (1 ครั้งที่ใช้) + file_sort.undo (กดย้ายกลับ · มี run_id ของครั้งนั้น)
 *   mergeFileSortUndo: ย้ายกลับที่เจอครั้งที่ลงไฟล์ของมันในชุดเดียวกัน → แนบ undone_at / undone_by เข้าแถวนั้น แล้วซ่อนแถวย้ายกลับ
 *   (ไม่เจอ = โชว์แถวย้ายกลับเดี่ยว ๆ) · หน้าจอแปลด้วย lib/audit-format (describeFileSort)
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
