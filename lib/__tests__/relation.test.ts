import { describe, it, expect, vi } from "vitest";
import {
  relationLabelKey, readRelationLabel, hasRelationLabel,
  buildRelationFilter, isDependentRelation,
  resolveRelationLabels, buildResolverUrl,
  type RelationConfig,
} from "@/lib/relation";

const supplierCfg: RelationConfig = {
  target_table: "suppliers",
  target_label_field: "name",
  secondary_label_field: "code",
};

// ============================================================
// relationLabelKey
// ============================================================

describe("relation — relationLabelKey", () => {
  it("supplier_id → supplier_label", () => {
    expect(relationLabelKey("supplier_id")).toBe("supplier_label");
  });
  it("category_id → category_label", () => {
    expect(relationLabelKey("category_id")).toBe("category_label");
  });
  it("field ที่ไม่ลงท้าย _id → null", () => {
    expect(relationLabelKey("owner")).toBeNull();
    expect(relationLabelKey("name")).toBeNull();
  });
});

// ============================================================
// readRelationLabel / hasRelationLabel
// ============================================================

describe("relation — readRelationLabel", () => {
  it("อ่านจาก {base}_label ก่อน", () => {
    const row = { supplier_id: "u1", supplier_label: "ACME", supplier_name: "ignore" };
    expect(readRelationLabel(row, "supplier_id")).toBe("ACME");
  });
  it("fallback ไป {base}_name ถ้าไม่มี _label", () => {
    const row = { category_id: "c1", category_name: "วัตถุดิบ" };
    expect(readRelationLabel(row, "category_id")).toBe("วัตถุดิบ");
  });
  it("ไม่มี label เลย → null", () => {
    expect(readRelationLabel({ supplier_id: "u1" }, "supplier_id")).toBeNull();
  });
  it("label ว่าง → null", () => {
    expect(readRelationLabel({ supplier_id: "u1", supplier_label: "" }, "supplier_id")).toBeNull();
  });
  it("field ไม่ใช่ _id → null", () => {
    expect(readRelationLabel({ owner: "x" }, "owner")).toBeNull();
  });
  it("hasRelationLabel สะท้อนผล", () => {
    expect(hasRelationLabel({ supplier_id: "u1", supplier_label: "ACME" }, "supplier_id")).toBe(true);
    expect(hasRelationLabel({ supplier_id: "u1" }, "supplier_id")).toBe(false);
  });
});

// ============================================================
// buildRelationFilter — static + dependent
// ============================================================

describe("relation — buildRelationFilter", () => {
  it("ไม่มี filter เลย → undefined", () => {
    expect(buildRelationFilter(supplierCfg, {})).toBeUndefined();
  });

  it("static filter → คืน column/value", () => {
    const cfg: RelationConfig = { ...supplierCfg, filter: { column: "country", value: "จีน" } };
    expect(buildRelationFilter(cfg, {})).toEqual({ column: "country", value: "จีน" });
  });

  it("dependent: พ่อมีค่า → กรองตามพ่อ", () => {
    const cfg: RelationConfig = {
      target_table: "locations", target_label_field: "name",
      depends_on: { parent_field: "warehouse_id", filter_column: "warehouse_id" },
    };
    expect(buildRelationFilter(cfg, { warehouse_id: "wh-1" }))
      .toEqual({ column: "warehouse_id", value: "wh-1" });
  });

  it("dependent: พ่อยังไม่เลือก → blocked", () => {
    const cfg: RelationConfig = {
      target_table: "locations", target_label_field: "name",
      depends_on: { parent_field: "warehouse_id", filter_column: "warehouse_id" },
    };
    expect(buildRelationFilter(cfg, {})).toEqual({ blocked: true });
    expect(buildRelationFilter(cfg, { warehouse_id: "" })).toEqual({ blocked: true });
  });

  it("dependent มาก่อน static เมื่อมีทั้งคู่", () => {
    const cfg: RelationConfig = {
      target_table: "locations", target_label_field: "name",
      filter: { column: "active", value: "true" },
      depends_on: { parent_field: "warehouse_id", filter_column: "warehouse_id" },
    };
    expect(buildRelationFilter(cfg, { warehouse_id: "wh-9" }))
      .toEqual({ column: "warehouse_id", value: "wh-9" });
  });

  it("isDependentRelation", () => {
    expect(isDependentRelation(supplierCfg)).toBe(false);
    expect(isDependentRelation({
      target_table: "x", target_label_field: "name",
      depends_on: { parent_field: "p", filter_column: "p" },
    })).toBe(true);
  });
});

// ============================================================
// buildResolverUrl
// ============================================================

describe("relation — buildResolverUrl", () => {
  it("table-based → /api/admin/picker พร้อม include_ids + secondary", () => {
    const url = buildResolverUrl(supplierCfg, ["a", "b"]);
    expect(url).toContain("/api/admin/picker?");
    expect(url).toContain("table=suppliers");
    expect(url).toContain("label=name");
    expect(url).toContain("include_ids=a%2Cb");   // comma encoded
    expect(url).toContain("secondary=code");
    expect(url).toContain("limit=2");
  });

  it("lookup_type → /api/lookups", () => {
    const cfg: RelationConfig = { target_table: "", target_label_field: "name", lookup_type: "uom" };
    const url = buildResolverUrl(cfg, ["x"]);
    expect(url).toContain("/api/lookups?");
    expect(url).toContain("type=uom");
    expect(url).toContain("include_ids=x");
  });
});

// ============================================================
// resolveRelationLabels — batch (mock fetch)
// ============================================================

function mockFetch(payload: unknown): typeof fetch {
  return vi.fn(async () => ({ json: async () => payload })) as unknown as typeof fetch;
}

describe("relation — resolveRelationLabels", () => {
  it("map หลาย id → label ในการเรียกครั้งเดียว", async () => {
    const fetcher = mockFetch({
      data: [
        { id: "a", name: "ACME", code: "AC", is_active: true },
        { id: "b", name: "Beta", code: "BT", is_active: false },
      ],
    });
    const map = await resolveRelationLabels(fetcher, supplierCfg, ["a", "b"]);
    expect(map.size).toBe(2);
    expect(map.get("a")?.label).toBe("ACME");
    expect(map.get("a")?.secondary).toBe("AC");
    expect(map.get("a")?.active).toBe(true);
    expect(map.get("b")?.active).toBe(false);
    // เรียก fetch ครั้งเดียว
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("ids ว่าง → ไม่เรียก fetch, คืน map ว่าง", async () => {
    const fetcher = mockFetch({ data: [] });
    const map = await resolveRelationLabels(fetcher, supplierCfg, []);
    expect(map.size).toBe(0);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("dedupe id ซ้ำก่อนเรียก", async () => {
    const fetcher = mockFetch({ data: [{ id: "a", name: "ACME" }] });
    const map = await resolveRelationLabels(fetcher, supplierCfg, ["a", "a", "a"]);
    expect(map.size).toBe(1);
    expect(map.get("a")?.label).toBe("ACME");
  });

  it("lookup_type: อ่าน label จาก row.name", async () => {
    const cfg: RelationConfig = { target_table: "", target_label_field: "name", lookup_type: "uom" };
    const fetcher = mockFetch({ data: [{ id: "u1", name: "ชิ้น", code: "PC", is_active: true }] });
    const map = await resolveRelationLabels(fetcher, cfg, ["u1"]);
    expect(map.get("u1")?.label).toBe("ชิ้น");
  });

  it("กรอง id ว่าง/null ออก", async () => {
    const fetcher = mockFetch({ data: [{ id: "a", name: "ACME" }] });
    const map = await resolveRelationLabels(fetcher, supplierCfg, ["a", "", "a"]);
    expect(map.size).toBe(1);
  });
});
