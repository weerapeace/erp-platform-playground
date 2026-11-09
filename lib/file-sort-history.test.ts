import { describe, expect, it } from "vitest";
import { cleanHistoryTerm, mergeFileSortUndo } from "@/lib/file-sort-history";
import { describeAudit, fileSortKindLabel } from "@/lib/audit-format";

const up = (id: string, run: string, at: string, extra: Record<string, unknown> = {}) => ({
  id, action: "file_sort.upload", entity_type: "assets", entity_id: null, created_at: at, actor_name: "ผู้ใช้ A",
  metadata: { run_id: run, name: "PIX39", model: "PIX39", profile: "product", variant: "new", status: "done", counts: { erp: 21, nas: 0, failed: 0 },
    moves: [
      { what: "raw", from: "Z:\\WIP\\PIX39\\[03] Rawfiles", to: "Z:\\Raw Files\\[04] Pixie Dustie\\PIX39_rawfiles", how: "rename", files: 165 },
      { what: "collection", from: "Z:\\WIP\\PIX39", to: "Z:\\Collection\\PIX\\PIX39", how: "rename", files: 82 },
    ], ...extra },
});
const undo = (id: string, run: string, at: string, by = "ผู้ใช้ B") => ({
  id, action: "file_sort.undo", entity_type: "assets", entity_id: null, created_at: at, actor_name: by,
  metadata: { run_id: run, name: "PIX39", model: "PIX39", profile: "product", variant: "new", undone: [{ what: "collection", from: "Z:\\WIP\\PIX39", to: "Z:\\Collection\\PIX\\PIX39" }], errors: [] },
});

describe("ประวัติตัวแยกไฟล์ (Task Manager › ประวัติไฟล์)", () => {
  it("ย้ายกลับที่เจอครั้งที่ลงไฟล์ของมัน → แนบเข้าแถวนั้น (เวลา · ใคร) แล้วซ่อนแถวย้ายกลับ · ไม่แก้ของเดิม", () => {
    const rows = [undo("u2", "R1", "2026-11-09T03:20:00Z"), undo("u1", "R1", "2026-11-09T03:10:00Z", "ผู้ใช้ C"), up("a1", "R1", "2026-11-09T03:00:00Z"), up("a2", "R2", "2026-11-08T09:00:00Z")];
    const out = mergeFileSortUndo(rows);
    expect(out.map((r) => r.id)).toEqual(["a1", "a2"]);
    expect(out[0].metadata).toMatchObject({ undone_at: "2026-11-09T03:20:00Z", undone_by: "ผู้ใช้ B" });   // ครั้งล่าสุด
    expect(rows[2].metadata).not.toHaveProperty("undone_at");
    expect(out[1].metadata).not.toHaveProperty("undone_at");
  });
  it("ย้ายกลับที่ไม่เจอครั้งที่ลงไฟล์ (อยู่หน้าก่อน) → โชว์เดี่ยว ๆ", () => {
    expect(mergeFileSortUndo([undo("u9", "R9", "2026-11-09T03:20:00Z")]).map((r) => r.action)).toEqual(["file_sort.undo"]);
  });
  it("แปลเป็นภาษาคน: ลงไฟล์ · รหัสรุ่น · ชนิดงาน · ย้ายอะไรจากไหนไปไหน · ลงกี่รูป · ย้ายกลับแล้ว", () => {
    const [row] = mergeFileSortUndo([undo("u1", "R1", "2026-11-09T03:20:00Z"), up("a1", "R1", "2026-11-09T03:00:00Z")]);
    const v = describeAudit(row);
    expect(v).toMatchObject({ verb: "ลงไฟล์", moduleLabel: "ตัวแยกไฟล์", page: "สินค้าใหม่", recordCode: "PIX39", group: "create" });
    expect(v.changes.map((c) => `${c.label}: ${c.old} → ${c.new}`)).toEqual([
      "Rawfiles 165 ไฟล์: Z:\\WIP\\PIX39\\[03] Rawfiles → Z:\\Raw Files\\[04] Pixie Dustie\\PIX39_rawfiles",
      "ทั้งโฟลเดอร์ → Collection 82 ไฟล์: Z:\\WIP\\PIX39 → Z:\\Collection\\PIX\\PIX39",
    ]);
    expect(v.extras.map((x) => x.label)).toEqual(["ลงระบบ", "ผล", "ย้ายกลับแล้ว"]);
    expect(v.extras[2].value).toContain("ผู้ใช้ B");
    const u = describeAudit(undo("u1", "R1", "2026-11-09T03:20:00Z"));
    expect(u).toMatchObject({ verb: "ย้ายกลับ", group: "status" });
    expect(u.changes[0]).toMatchObject({ old: "Z:\\Collection\\PIX\\PIX39", new: "Z:\\WIP\\PIX39" });   // ย้ายกลับ: ที่ที่เคยย้ายไป → ที่เดิม
  });
  it("รวมเข้าของเดิม / ก๊อปจากเครื่อง บอกในชื่อแถว · Content / โลโก้ บอกชนิดงาน", () => {
    const v = describeAudit(up("a1", "R1", "2026-11-09T03:00:00Z", { moves: [{ what: "collection", from: "C:\\x\\BSD15", to: "Z:\\Collection\\BSD\\BSD15", how: "merge", files: 7 }] }));
    expect(v.changes[0].label).toBe("ทั้งโฟลเดอร์ → Collection 7 ไฟล์ · รวมเข้าของเดิม ไม่ทับ");
    expect(fileSortKindLabel({ profile: "content" })).toBe("Content");
    expect(fileSortKindLabel({ profile: "product", variant: "color" })).toBe("เพิ่มสี");
    expect(fileSortKindLabel({})).toBe("โลโก้ / Artwork");
  });
  it("คำค้นตัดเครื่องหมายพิเศษ (กันตัวกรองฐานข้อมูลพัง)", () => {
    expect(cleanHistoryTerm(" PIX39,(x)*% ")).toBe("PIX39 x");
    expect(cleanHistoryTerm("กระเป๋า BSD-15")).toBe("กระเป๋า BSD-15");
  });
});
