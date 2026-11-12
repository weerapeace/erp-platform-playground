/** ทะเบียนเครื่องมือ + ค้นหาด้วยไทย/อังกฤษ/คำใกล้เคียง (Bag CAD รอบ D) */
import { describe, expect, it } from "vitest";
import { LEVEL_NUM, PATTERN_TOOLS, searchTools, toolById, toolOfBoard, toolTitle, visibleAt } from "@/lib/pattern-tools";

const ids = (q: string) => searchTools(q).map((d) => d.id);

describe("ทะเบียนเครื่องมือ", () => {
  it("รหัสไม่ซ้ำ · มีชื่อสองภาษา คำอธิบาย ขั้นตอน", () => {
    expect(new Set(PATTERN_TOOLS.map((d) => d.id)).size).toBe(PATTERN_TOOLS.length);
    for (const d of PATTERN_TOOLS) { expect(d.th && d.en && d.desc.th && d.desc.en).toBeTruthy(); expect(d.steps.length).toBeGreaterThan(0); expect([1, 2, 3]).toContain(d.level); }
  });
  it("เครื่องมือบนกระดานทุกตัวมีในทะเบียน", () => {
    for (const t of ["move", "rect", "ellipse", "polygon", "pen", "hand", "measure", "inner", "sew", "sewpart", "sewmany", "sewedit"]) expect(toolOfBoard(t)?.target).toEqual({ kind: "tool", tool: t });
  });
  it("ชื่อเมื่อชี้ปุ่ม = ไทย · อังกฤษ + ปุ่มลัด + คำอธิบาย", () => {
    expect(toolTitle(toolById("sew")!, "th")).toMatch(/^เย็บขอบกับขอบ · Segment sewing \(N\)\n/);
  });
  it("โหมด: เริ่มต้นเห็นเครื่องมือหลัก · ขั้นสูงเห็นทั้งหมด", () => {
    const at = (l: 1 | 2 | 3) => PATTERN_TOOLS.filter((d) => visibleAt(d, l)).map((d) => d.id);
    expect(at(1)).toContain("sew"); expect(at(1)).not.toContain("sewpart"); expect(at(2)).not.toContain("v-sim");
    expect(at(3)).toHaveLength(PATTERN_TOOLS.length);
    expect(LEVEL_NUM.std).toBe(2);
  });
});

describe("ค้นหาเครื่องมือ", () => {
  it("ไทย / อังกฤษ / คำใกล้เคียง ได้ตัวเดียวกัน", () => {
    expect(ids("เผื่อเย็บ")[0]).toBe("allow");
    expect(ids("seam allowance")[0]).toBe("allow");
    expect(ids("offset")).toContain("allow");
    expect(ids("ตะเข็บ")).toEqual(expect.arrayContaining(["sew", "allow"]));
    expect(ids("วัด")[0]).toBe("measure");
    expect(ids("ruler")[0]).toBe("measure");
    expect(ids("มุมมน")[0]).toBe("round");
    expect(ids("dxf")).toEqual(expect.arrayContaining(["dxf", "print"]));
  });
  it("ปุ่มลัดตัวเดียว = เครื่องมือนั้นขึ้นก่อน", () => { expect(ids("n")[0]).toBe("sew"); expect(ids("b")[0]).toBe("sewedit"); });
  it("ว่าง = ไม่มีผล · ไม่เจอ = ว่าง", () => { expect(ids("")).toEqual([]); expect(ids("zzzqqq")).toEqual([]); });
  it("รอบ E: เครื่องมือใหม่ค้นเจอ", () => {
    expect(ids("หลายเหลี่ยม")[0]).toBe("polygon"); expect(ids("g")[0]).toBe("polygon");
    expect(ids("chamfer")[0]).toBe("corner"); expect(ids("แบ่งขอบ")[0]).toBe("edge-split");
    expect(ids("พับสองทบ")[0]).toBe("edge-fold2"); expect(ids("dimension")[0]).toBe("dim-pin");
    expect(ids("snap")).toContain("objsnap"); expect(ids("nap")).toContain("cut-marks");
  });
  it("รอบ F: เครื่องมือทรงกระเป๋าค้นเจอ", () => {
    expect(ids("เกล็ด")[0]).toBe("dart"); expect(ids("มุมกล่อง")[0]).toBe("box-corner"); expect(ids("จีบ")[0]).toBe("pleat");
    expect(ids("gusset")[0]).toBe("gusset"); expect(ids("ทากาว")[0]).toBe("band"); expect(ids("รูด")[0]).toBe("gather");
    expect(ids("slash")[0]).toBe("spread"); expect(ids("ความหนา")[0]).toBe("fold-comp");
  });
  it("รอบ F2: ตัวสร้างชิ้นกระเป๋าค้นเจอ", () => {
    expect(ids("หูหิ้ว")[0]).toBe("strap"); expect(ids("แถบกุ๊น")[0]).toBe("bind-pieces"); expect(ids("ช่องโชว์")[0]).toBe("window");
    expect(ids("แมว")).toContain("window"); expect(ids("เก็บงานแก้มือ")[0]).toBe("tpl-update");
  });
  it("รอบ G1: เครื่องมือภาพ 3D ค้นเจอ", () => {
    expect(ids("ortho")[0]).toBe("v-camera"); expect(ids("wireframe")[0]).toBe("v-display"); expect(ids("glb")[0]).toBe("v-glb");
    expect(ids("ลิตร")[0]).toBe("v-ref"); expect(ids("freeze")[0]).toBe("v-simctl"); expect(ids("ย้ายชิ้น")[0]).toBe("v-move");
  });
  it("รอบ G2: วัสดุค้นเจอ", () => {
    expect(ids("ชุดสี")[0]).toBe("v-colorway"); expect(ids("ลายผ้า")[0]).toBe("fabric-tex"); expect(ids("สอบเทียบ")[0]).toBe("mat-groups");
    expect(ids("โฟม")[0]).toBe("layer-foam"); expect(ids("เดินด้ายทับ")[0]).toBe("topstitch");
  });
  it("หลายคำ = ต้องเจอทุกคำ", () => { expect(ids("เย็บ บางช่วง")[0]).toBe("sewpart"); });
});
