import { describe, it, expect } from "vitest";
import { expandRows, normalizeSummaryDoc, renderSummaryBody, visibleColumns, type SummaryDoc, type SummarySheetInfo } from "@/lib/design-sheet-summary";

const ID1 = "9e4836c9-b718-46f3-84bf-07be383802f7";
const ID2 = "d0088189-a4da-447a-ba92-f1e822e16150";
const IMG = (n: number) => `/api/r2-image?key=design_sheet%2Fx%2F${n}.jpg`;
const sheet = (id: string, name: string): SummarySheetInfo => ({
  id, code: "DS-2026-0042", name, brand_name: "Good Goods", brand_color: "#123456", status: "sent_customer", status_label: "ส่งลูกค้าดู",
  status_color: "#3b82f6", closed: false, deadline: null, updated_at: new Date().toISOString(), note: "โน้ตภายใน", detail_excerpt: null,
});
const sheets = new Map([[ID1, sheet(ID1, "กระเป๋าแบรนด์คุณเต้ง 3 ใบ")], [ID2, sheet(ID2, "กระเป๋าคุณเต้งสีดำ")]]);

describe("design-sheet-summary", () => {
  it("หมายเหตุเก็บการขึ้นบรรทัด · ชื่อสรุปเป็นบรรทัดเดียว", () => {
    const r = normalizeSummaryDoc({ title: "  สรุป\nคุณเต้ง ", columns: ["name", "row_note"], note: "บรรทัด 1\r\nบรรทัด 2\n\n\n\nบรรทัด 3",
      items: [{ sheet_id: ID1, images: [IMG(1)], split: false, labels: [], notes: ["ใบใหญ่เสร็จแล้ว\nเหลือใบเล็ก  "] }] });
    if ("error" in r) throw new Error(r.error);
    expect(r.value.title).toBe("สรุป คุณเต้ง");
    expect(r.value.note).toBe("บรรทัด 1\nบรรทัด 2\n\nบรรทัด 3");
    expect(r.value.items[0].notes[0]).toBe("ใบใหญ่เสร็จแล้ว\nเหลือใบเล็ก");
  });

  it("แก้ชื่อสินค้าในสรุปได้ (ไม่แยก + แยกตามรูป) · ไม่แก้ = ชื่อใบงาน", () => {
    const doc: SummaryDoc = { title: "t", audience: "internal", columns: ["name"], note: "", items: [
      { sheet_id: ID2, images: [IMG(1)], split: false, title: "กระเป๋าสีดำ ใบใหญ่", labels: [], notes: [] },
      { sheet_id: ID1, images: [IMG(2), IMG(3)], split: true, title: "คุณเต้ง", labels: ["โท้ท", ""], notes: [] },
    ] };
    expect(expandRows(doc, sheets).map((r) => r.title)).toEqual(["กระเป๋าสีดำ ใบใหญ่", "คุณเต้ง — โท้ท", "คุณเต้ง — ชิ้นที่ 2"]);
    const plain = { ...doc, items: [{ ...doc.items[0], title: undefined }] };
    expect(expandRows(plain, sheets)[0].title).toBe("กระเป๋าคุณเต้งสีดำ");
  });

  it("ชื่อว่าง = ไม่เก็บ title (กลับไปใช้ชื่อใบงาน)", () => {
    const r = normalizeSummaryDoc({ title: "t", columns: ["name"], items: [{ sheet_id: ID1, images: [], split: false, title: "   ", labels: [], notes: [] }] });
    if ("error" in r) throw new Error(r.error);
    expect("title" in r.value.items[0]).toBe(false);
  });

  it("ฉบับลูกค้าซ่อนคอลัมน์ภายในเสมอ + หมายเหตุหลายบรรทัดโชว์ขึ้นบรรทัด", () => {
    const doc: SummaryDoc = { title: "t", audience: "customer", columns: ["name", "stale", "sheet_note", "row_note"], note: "", items: [
      { sheet_id: ID1, images: [], split: false, labels: [], notes: ["a\nb"] },
    ] };
    expect(visibleColumns(doc).map((c) => c.key)).toEqual(["name", "row_note"]);
    const html = renderSummaryBody(doc, sheets);
    expect(html).not.toContain("โน้ตภายใน");
    expect(html).toContain("white-space:pre-wrap;\">a\nb");
  });

  it("กันรูปนอกระบบ + ใบซ้ำ", () => {
    const r = normalizeSummaryDoc({ title: "t", columns: ["image"], items: [
      { sheet_id: ID1, images: ["https://evil.example/x.jpg", IMG(1)], split: true, labels: [], notes: [] },
      { sheet_id: ID1, images: [IMG(2)], split: false, labels: [], notes: [] },
    ] });
    if ("error" in r) throw new Error(r.error);
    expect(r.value.items).toHaveLength(1);
    expect(r.value.items[0].images).toEqual([IMG(1)]);
    expect(r.value.items[0].split).toBe(false);   // เหลือรูปเดียว แยกไม่ได้
  });
});
