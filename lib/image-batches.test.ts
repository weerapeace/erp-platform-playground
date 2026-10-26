import { describe, expect, it } from "vitest";
import { emptyUndoInfo, mergeUndoInfo, parseBatchItems, parseUndoInfo, SIG_RE } from "./image-batches";

const P = "11111111-1111-1111-1111-111111111111";
const S = "22222222-2222-2222-2222-222222222222";
const A = "33333333-3333-3333-3333-333333333333";
const SHOP = "44444444-4444-4444-4444-444444444444";

describe("parseBatchItems", () => {
  it("รับเฉพาะแถวที่ถูกรูปแบบ", () => {
    const sig = "123456:" + "ab".repeat(16);
    expect(SIG_RE.test(sig)).toBe(true);
    const r = parseBatchItems([
      { source_sig: sig, source_name: "BCG11-01/1.jpg", source_bytes: 123456, parent_id: P, sku_id: S, dest: "skuMain", attachment_id: A, r2_key: "skus_v2/x/1.jpg" },
      { source_sig: "bad", parent_id: P, dest: "sku" },
      { source_sig: sig, parent_id: "nope", dest: "sku" },
      { source_sig: sig, parent_id: P, dest: "hack" },
      { source_sig: sig, parent_id: P, dest: "heroD", r2_key: "../../etc'" },
    ]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ dest: "skuMain", sku_id: S, attachment_id: A, source_bytes: 123456 });
    expect(r[1]).toMatchObject({ dest: "heroD", r2_key: null, sku_id: null });
  });
});

describe("parseUndoInfo / mergeUndoInfo", () => {
  it("กรองค่าแปลกปลอม + รวมรอบอัปซ้ำ (ปกเดิมของรอบแรกชนะ)", () => {
    const a = parseUndoInfo({
      prevPrimary: { [S]: A, bad: A },
      png: [{ parentId: P, before: null, after: "parent-skuspng/x.png" }, { parentId: "x", after: "k" }],
      web: [{ shopId: SHOP, parentId: P, before: {}, after: {} }, { shopId: "x", parentId: P, before: {}, after: {} }],
      replaced: [{ table: "skus_v2", entityId: S, key: "skus_v2/old.jpg" }, { table: "users", entityId: S, key: "k" }],
    });
    expect(Object.keys(a.prevPrimary)).toEqual([S]);
    expect(a.png).toHaveLength(1);
    expect(a.web).toHaveLength(1);
    expect(a.replaced).toEqual([{ table: "skus_v2", entityId: S, key: "skus_v2/old.jpg" }]);
    const b = parseUndoInfo({ prevPrimary: { [S]: P }, png: [{ parentId: P, before: "parent-skuspng/x.png", after: "parent-skuspng/y.png" }] });
    const m = mergeUndoInfo(a, b);
    expect(m.prevPrimary[S]).toBe(A);
    expect(m.png).toHaveLength(2);
    expect(parseUndoInfo(null)).toEqual(emptyUndoInfo());
  });
});
