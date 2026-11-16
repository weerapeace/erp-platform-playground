import { describe, it, expect } from "vitest";
import {
  normalizePagePath, pathMatchesRoute, partsForPage, pagesForPart, flowNodesForPage,
  cleanParts, cleanFlowRefs, groupChanges,
} from "@/lib/app-change";
import { SHARED_PARTS, type SharedPart } from "@/lib/shared-parts-registry";
import { FLOW_NODES, FLOW_EDGES } from "@/lib/flow-map";
import usage from "@/lib/shared-parts-usage.json";

const parts: SharedPart[] = [
  { key: "tbl", label: "ตารางกลาง", code: "DataTable", category: "table", source: { path: "components/data-table" }, what: "" },
  { key: "pick", label: "ตัวเลือกลูกค้า", code: "CustomerPicker", category: "pick", source: { path: "components/pickers", names: ["CustomerPicker"] }, what: "" },
  { key: "old", label: "ของเก่า", code: "Old", category: "table", source: { path: "components/old" }, what: "", replacedBy: "tbl" },
];
const fakeUsage = {
  sources: {
    "components/data-table": { places: [{ label: "/quotations", href: "/quotations", kind: "page" }, { label: "/admin/module/[key]", href: null, kind: "page" }] },
    "components/pickers#CustomerPicker": { places: [{ label: "/quotations", href: "/quotations", kind: "page" }, { label: "/quotations", href: "/quotations", kind: "page" }, { label: "/api/x", href: null, kind: "api" }] },
    "components/old": { places: [{ label: "/quotations", href: "/quotations", kind: "page" }] },
  },
};

describe("normalizePagePath", () => {
  it("ตัด query / hash / ท้าย", () => {
    expect(normalizePagePath("/quotations/?tab=1#x")).toBe("/quotations");
    expect(normalizePagePath("/a//b/")).toBe("/a/b");
    expect(normalizePagePath("/")).toBe("/");
  });
  it("ค่าแปลก = null", () => {
    expect(normalizePagePath("https://evil.com")).toBeNull();
    expect(normalizePagePath("//evil.com")).toBeNull();
    expect(normalizePagePath(42)).toBeNull();
  });
});

describe("pathMatchesRoute", () => {
  it("ช่อง [id] ตรงอะไรก็ได้ แต่จำนวนช่องต้องเท่ากัน", () => {
    expect(pathMatchesRoute("/admin/module/products", "/admin/module/[key]")).toBe(true);
    expect(pathMatchesRoute("/admin/module", "/admin/module/[key]")).toBe(false);
    expect(pathMatchesRoute("/quotations/1", "/quotations")).toBe(false);
    expect(pathMatchesRoute("/docs/a/b", "/docs/[...slug]")).toBe(true);
  });
});

describe("partsForPage / pagesForPart", () => {
  it("หน้านี้ใช้ของกลางอะไร (ไม่รวมตัวที่ถูกแทนแล้ว)", () => {
    expect(partsForPage("/quotations", parts, fakeUsage).map((p) => p.key).sort()).toEqual(["pick", "tbl"]);
    expect(partsForPage("/admin/module/skus", parts, fakeUsage).map((p) => p.key)).toEqual(["tbl"]);
    expect(partsForPage("/nothing", parts, fakeUsage)).toEqual([]);
  });
  it("แก้ของกลางตัวนี้กระทบหน้าไหน — ไม่ซ้ำ ไม่รวม api", () => {
    expect(pagesForPart("pick", parts, fakeUsage)).toEqual([{ label: "/quotations", href: "/quotations" }]);
    expect(pagesForPart("nope", parts, fakeUsage)).toEqual([]);
  });
  it("ข้อมูลจริง: หน้าใบเสนอราคามีของกลางอย่างน้อย 1 ตัว", () => {
    expect(partsForPage("/quotations", SHARED_PARTS, usage as never).length).toBeGreaterThan(0);
  });
});

describe("flowNodesForPage", () => {
  it("จับคู่หน้า → กล่องแผนผังจริง", () => {
    expect(flowNodesForPage("/quotations", FLOW_NODES)).toContainEqual({ kind: "n", ref: "qt" });
    expect(flowNodesForPage("/master/work-board", FLOW_NODES).map((r) => r.ref)).toEqual(expect.arrayContaining(["prep", "wo"]));
    expect(flowNodesForPage("/quotationsX", FLOW_NODES)).toEqual([]);
  });
});

describe("cleanParts / cleanFlowRefs", () => {
  it("ตัดค่าที่ไม่มีในทะเบียน + ซ้ำ", () => {
    expect(cleanParts(["tbl", "tbl", "x", 3], new Set(["tbl"]))).toEqual(["tbl"]);
    expect(cleanParts("tbl", new Set(["tbl"]))).toEqual([]);
  });
  it("จุดในแผนผังต้องมีจริง", () => {
    const edge = Object.keys(FLOW_EDGES)[0];
    expect(cleanFlowRefs([{ kind: "n", ref: "qt" }, { kind: "n", ref: "qt" }, { kind: "n", ref: "zzz" }, { kind: "e", ref: edge }, { kind: "x", ref: "qt" }], FLOW_NODES, FLOW_EDGES))
      .toEqual([{ kind: "n", ref: "qt" }, { kind: "e", ref: edge }]);
  });
});

describe("groupChanges", () => {
  const rows = [
    { id: 1, page_path: "/a", parts: ["tbl", "pick"], status: "open" },
    { id: 2, page_path: "/a", parts: [], status: "resolved" },
    { id: 3, page_path: null, parts: ["tbl"], status: "in_progress" },
  ];
  it("ตามหน้า — ไม่ระบุหน้าอยู่ท้าย", () => {
    const g = groupChanges(rows, "page");
    expect(g.map((x) => [x.label, x.rows.length])).toEqual([["/a", 2], ["ไม่ระบุหน้า", 1]]);
  });
  it("ตามของกลาง — 1 งานอยู่หลายกลุ่มได้", () => {
    const g = groupChanges(rows, "part", (k) => k.toUpperCase());
    expect(g.map((x) => [x.label, x.rows.length])).toEqual([["TBL", 2], ["PICK", 1], ["ไม่ผูกของกลาง", 1]]);
  });
  it("ตามสถานะ — เรียง รอทำ → กำลังทำ → ขึ้นเว็บแล้ว", () => {
    expect(groupChanges(rows, "status").map((x) => x.label)).toEqual(["รอทำ", "กำลังทำ", "ขึ้นเว็บแล้ว"]);
  });
});

import { changeCode, codesInText, deployMarks, changeBadge, buildChangePrompt } from "@/lib/app-change";

describe("รหัสงานแก้ + ป้ายขึ้นเว็บ", () => {
  it("changeCode / codesInText", () => {
    expect(changeCode("AB12CD34-0000-0000-0000-000000000000")).toBe("CH-ab12cd");
    expect(codesInText("fix(x): ... [CH-AB12cd] [ch-00ff11] CH-xyz CH-1234567")).toEqual(["CH-ab12cd", "CH-00ff11"]);
  });
  it("รอขึ้นชนะอยู่บนเว็บ", () => {
    expect(deployMarks(["a [CH-aaaaaa]"], ["b [CH-aaaaaa] [CH-bbbbbb]"])).toEqual({ "CH-aaaaaa": "waiting", "CH-bbbbbb": "live" });
  });
  it("changeBadge", () => {
    expect(changeBadge("open", undefined).label).toBe("รอทำ");
    expect(changeBadge("in_progress", "waiting").label).toBe("รอขึ้นเว็บ");
    expect(changeBadge("open", "live").label).toBe("ขึ้นเว็บแล้ว");
    expect(changeBadge("resolved", undefined).label).toBe("ขึ้นเว็บแล้ว");
    expect(changeBadge("closed", "live").label).toBe("ปิด");
  });
  it("buildChangePrompt มีรหัส หน้า ของกลาง กติกา commit", () => {
    const p = buildChangePrompt([{ id: "ab12cd34-0", description: " ค้นเบอร์โทร ", page_path: "/quotations", parts: [{ key: "pick", label: "ตัวเลือกลูกค้า", pages: 6 }], flow: ["ใบเสนอราคา"], images: 2 }]);
    expect(p).toContain("1. [CH-ab12cd] ค้นเบอร์โทร");
    expect(p).toContain("หน้า: /quotations");
    expect(p).toContain("ตัวเลือกลูกค้า (pick · ใช้ 6 หน้า)");
    expect(p).toContain("แผนผังการทำงาน: ใบเสนอราคา");
    expect(p).toContain("[CH-…]");
  });
});
