import { describe, it, expect } from "vitest";
import {
  parseFlowScene, toFlowScene, autoEdgeLabel, mergeFlowScenes, cloneFlowSceneAt, handlePoint, flowSceneBounds,
  splitFlowLabel, makeFlowNode, nodeColor, snap, copyFlowSelection, flowClipText, serializeFlowClip, parseFlowClip,
  placeFlowClip, textToFlowNode, nodesInsideZone, storageNodeSize, STORAGE_ICON_SIZE, type FlowScene, type FlowSceneNode, type FlowSceneEdge,
} from "../flowchart";

const th = (a: string) => a;
const N = (id: string, x = 0, label = id): FlowSceneNode => ({ id, type: "step", position: { x, y: 0 }, width: 160, height: 60, data: { label } });
const E = (id: string, s: string, t: string, label = ""): FlowSceneEdge => ({ id, source: s, target: t, sourceHandle: "r", targetHandle: "l", label });
const S = (nodes: FlowSceneNode[], edges: FlowSceneEdge[] = []): FlowScene => ({ kind: "flowchart", v: 1, nodes, edges });
const ids = (s: FlowScene) => s.nodes.map((n) => n.id).sort();

describe("parseFlowScene", () => {
  it("ไม่ใช่ flowchart (เช่นกระดาน Excalidraw) = null", () => {
    expect(parseFlowScene({ elements: [], files: {} })).toBeNull();
    expect(parseFlowScene(null)).toBeNull();
    expect(parseFlowScene("x")).toBeNull();
  });
  it("ตัดกล่องชนิดแปลก/id ซ้ำ + เส้นที่ปลายหาย · เติมขนาดตั้งต้น", () => {
    const s = parseFlowScene({
      kind: "flowchart",
      nodes: [
        { id: "a", type: "step", position: { x: 1, y: 2 }, data: { label: "A", color: "violet" } },
        { id: "a", type: "step", position: { x: 9, y: 9 }, data: { label: "dup" } },
        { id: "b", type: "hacker", position: { x: 0, y: 0 }, data: {} },
        { id: "c", type: "question", position: {}, data: { label: "C", color: "neon" } },
      ],
      edges: [
        { id: "e1", source: "a", target: "c", sourceHandle: "r", targetHandle: "zz", label: "ใช่" },
        { id: "e2", source: "a", target: "b" },
      ],
    })!;
    expect(s.nodes.map((n) => n.id)).toEqual(["a", "c"]);
    expect(s.nodes[0].width).toBe(170);            // ขนาดตั้งต้นของ step
    expect(s.nodes[1].data.color).toBeUndefined(); // สีที่ไม่รู้จัก ตัดทิ้ง
    expect(s.edges).toHaveLength(1);
    expect(s.edges[0].targetHandle).toBeNull();     // handle แปลก → null
  });
});

describe("toFlowScene", () => {
  it("ตัดค่าระหว่างใช้งาน (selected/measured) + ปัดตำแหน่ง", () => {
    const s = toFlowScene(
      [{ id: "a", type: "step", position: { x: 10.4, y: 20.6 }, measured: { width: 150, height: 50 }, data: { label: "A" }, selected: true } as never],
      [{ id: "e", source: "a", target: "a", label: "x", selected: true } as never],
    );
    expect(s.nodes[0]).toEqual({ id: "a", type: "step", position: { x: 10, y: 21 }, width: 150, height: 50, data: { label: "A" } });
    expect(JSON.stringify(s)).not.toContain("selected");
  });
});

describe("autoEdgeLabel", () => {
  it("กล่องคำถาม: ใช่ → ไม่ใช่ → ว่าง · กล่องอื่น = ว่าง", () => {
    expect(autoEdgeLabel("question", [], th)).toBe("ใช่");
    expect(autoEdgeLabel("question", ["ใช่"], th)).toBe("ไม่ใช่");
    expect(autoEdgeLabel("question", ["ไม่ใช่"], th)).toBe("ใช่");
    expect(autoEdgeLabel("question", ["ใช่", "ไม่ใช่"], th)).toBe("");
    expect(autoEdgeLabel("step", [], th)).toBe("");
  });
});

describe("mergeFlowScenes (มีคนบันทึกแทรก)", () => {
  const base = S([N("a"), N("b")], [E("e1", "a", "b")]);
  it("เขาเพิ่ม + เราเพิ่ม → ได้ทั้งคู่", () => {
    const m = mergeFlowScenes(base, S([...base.nodes, N("mine")], base.edges), S([...base.nodes, N("theirs")], base.edges));
    expect(ids(m)).toEqual(["a", "b", "mine", "theirs"]);
  });
  it("เราไม่ได้แตะ แต่เขาแก้ → เอาของเขา · เราแก้ → เอาของเรา", () => {
    const theirs = S([N("a", 0, "A-theirs"), N("b", 0, "B-theirs")], base.edges);
    const mine = S([N("a"), N("b", 0, "B-mine")], base.edges);
    const m = mergeFlowScenes(base, mine, theirs);
    expect(m.nodes.find((n) => n.id === "a")!.data.label).toBe("A-theirs");
    expect(m.nodes.find((n) => n.id === "b")!.data.label).toBe("B-mine");
  });
  it("เขาลบ (เราไม่ได้แก้) → ลบตาม และเส้นที่ต่อหายด้วย", () => {
    const m = mergeFlowScenes(base, base, S([N("a")]));
    expect(ids(m)).toEqual(["a"]);
    expect(m.edges).toHaveLength(0);
  });
  it("เราลบ → ไม่กลับมา แม้เขายังมีอยู่", () => {
    const m = mergeFlowScenes(base, S([N("a")]), base);
    expect(ids(m)).toEqual(["a"]);
  });
  it("เขาลบ แต่เราเพิ่งแก้กล่องนั้น → เก็บของเรา", () => {
    const m = mergeFlowScenes(base, S([N("a"), N("b", 40)], base.edges), S([N("a")]));
    expect(ids(m)).toEqual(["a", "b"]);
  });
});

describe("cloneFlowSceneAt (วางแม่แบบเพิ่ม)", () => {
  it("id ใหม่ทั้งหมด · เส้นชี้ id ใหม่ · วางทางขวาของของเดิม", () => {
    const tpl = S([N("a", 0), N("b", 200)], [E("e", "a", "b")]);
    const existing = S([N("x", 500)]);
    const c = cloneFlowSceneAt(tpl, existing);
    expect(c.nodes.map((n) => n.id)).not.toContain("a");
    expect(c.edges[0].source).toBe(c.nodes[0].id);
    expect(c.edges[0].target).toBe(c.nodes[1].id);
    expect(Math.min(...c.nodes.map((n) => n.position.x))).toBeGreaterThanOrEqual(500 + 160);
  });
  it("กระดานว่าง → ไม่เลื่อน", () => {
    const c = cloneFlowSceneAt(S([N("a", 40)]), S([]));
    expect(c.nodes[0].position.x).toBe(40);
  });
});

describe("เรขาคณิต / ตัวช่วย", () => {
  it("handlePoint 4 ด้าน", () => {
    const n = { position: { x: 100, y: 50 }, width: 200, height: 80 };
    expect(handlePoint(n, "t")).toEqual({ x: 200, y: 50, side: "t" });
    expect(handlePoint(n, "r")).toEqual({ x: 300, y: 90, side: "r" });
    expect(handlePoint(n, "b")).toEqual({ x: 200, y: 130, side: "b" });
    expect(handlePoint(n, "l")).toEqual({ x: 100, y: 90, side: "l" });
    expect(handlePoint(n, null).side).toBe("r");
  });
  it("flowSceneBounds ครอบทุกกล่อง + ขอบ", () => {
    expect(flowSceneBounds(S([N("a", 0), N("b", 300)]), 40)).toEqual({ x: -40, y: -40, w: 460 + 80, h: 60 + 80 });
  });
  it("splitFlowLabel: บรรทัดแรก = หัว", () => {
    expect(splitFlowLabel("R2\nรูปสินค้า\nรูปเว็บ")).toEqual({ title: "R2", sub: "รูปสินค้า\nรูปเว็บ" });
    expect(splitFlowLabel("")).toEqual({ title: "", sub: "" });
  });
  it("makeFlowNode ชิดตาราง + สีตั้งต้นตามชนิด", () => {
    const n = makeFlowNode("question", { x: 103, y: 57 }, th);
    expect(n.position.x % 20).toBe(0);
    expect(n.position.y % 20).toBe(0);
    expect(nodeColor(n.type, n.data)).toBe("amber");
    expect(snap(29)).toBe(20);
  });
});

describe("คัดลอก / วาง", () => {
  const scene = S([N("a", 0, "ไฟล์ใหม่\nเข้าระบบ"), N("b", 200, "ลับ?"), N("c", 400, "R2")], [E("e1", "a", "b"), E("e2", "b", "c", "ไม่ใช่")]);

  it("คัดลอกเฉพาะกล่องที่เลือก + เส้นที่ต่อระหว่างกล่องที่เลือก", () => {
    const clip = copyFlowSelection(scene, ["b", "c"])!;
    expect(clip.nodes.map((n) => n.id)).toEqual(["b", "c"]);
    expect(clip.edges.map((e) => e.id)).toEqual(["e2"]);   // e1 ปลายอีกข้าง (a) ไม่ได้เลือก → ไม่เอา
    expect(copyFlowSelection(scene, [])).toBeNull();
    expect(copyFlowSelection(scene, ["zz"])).toBeNull();
  });

  it("ข้อความอ่านง่าย: 1 กล่อง 1 บรรทัด · หลายบรรทัดในกล่องต่อด้วย ·", () => {
    expect(flowClipText(copyFlowSelection(scene, ["c", "a"])!)).toBe("ไฟล์ใหม่ · เข้าระบบ\nR2");
  });

  it("เก็บลงคลิปบอร์ดแล้วอ่านกลับได้ · ของแปลก/ข้อความธรรมดา = null", () => {
    const clip = copyFlowSelection(scene, ["a", "b", "c"])!;
    expect(parseFlowClip(serializeFlowClip(clip))).toEqual(clip);
    expect(parseFlowClip("สวัสดี")).toBeNull();
    expect(parseFlowClip('{"kind":"flowchart","nodes":[]}')).toBeNull();
    expect(parseFlowClip({ kind: "flowchart-clip", nodes: [{ id: "x", type: "hacker" }] })).toBeNull();
  });

  it("วาง: id ใหม่ทั้งหมด · เส้นตามไปด้วย · กลางก้อนไปอยู่ที่จุดวาง (ชิดตาราง)", () => {
    const clip = copyFlowSelection(scene, ["a", "b"])!;   // กรอบ x 0..360 · y 0..60 → กลาง (180, 30)
    const out = placeFlowClip(clip, { x: 1000, y: 500 });
    expect(out.nodes).toHaveLength(2);
    expect(out.nodes.some((n) => n.id === "a" || n.id === "b")).toBe(false);
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0].source).toBe(out.nodes[0].id);
    expect(out.edges[0].target).toBe(out.nodes[1].id);
    expect(out.nodes[0].position).toEqual({ x: 820, y: 480 });   // 500-30=470 → ชิดตาราง 480
    expect(out.nodes[0].data).toEqual({ label: "ไฟล์ใหม่\nเข้าระบบ" });
    // วางสองครั้ง id ไม่ชนกัน
    const again = placeFlowClip(clip, { x: 1000, y: 500 });
    expect(again.nodes[0].id).not.toBe(out.nodes[0].id);
  });

  it("ทำซ้ำ (ไม่ระบุจุด) = ที่เดิม + เลื่อนเฉียง", () => {
    const out = placeFlowClip(copyFlowSelection(scene, ["c"])!, null, 40);
    expect(out.nodes[0].position).toEqual({ x: 440, y: 40 });
  });

  it("ข้อความจากที่อื่น: สั้น = กล่องขั้นตอน · ยาว = โน้ต (สูงตามเนื้อหา) · ว่าง = ไม่สร้าง", () => {
    const s = textToFlowNode("  เช็กไฟล์ก่อนอัป  ", { x: 0, y: 0 }, th)!;
    expect(s.type).toBe("step");
    expect(s.data.label).toBe("เช็กไฟล์ก่อนอัป");
    const long = textToFlowNode("บรรทัด 1\r\nบรรทัด 2\nบรรทัด 3\nบรรทัด 4\nบรรทัด 5\nบรรทัด 6\nบรรทัด 7", { x: 0, y: 0 }, th)!;
    expect(long.type).toBe("note");
    expect(long.data.label).not.toContain("\r");
    expect(long.height).toBeGreaterThan(110);
    expect(long.height % 20).toBe(0);
    expect(textToFlowNode("   \n  ", { x: 0, y: 0 }, th)).toBeNull();
  });
});

describe("กล่องไฟล์ (ประเภทไฟล์)", () => {
  it("โหลด: เก็บนามสกุลที่ทำความสะอาดแล้ว · กล่องชนิด file ใช้ได้", () => {
    const s = parseFlowScene({ kind: "flowchart", nodes: [{ id: "f", type: "file", position: { x: 0, y: 0 }, data: { label: "รูปกล้อง", exts: ["CR2", "jpeg", "cr2", 9] } }], edges: [] })!;
    expect(s.nodes[0].type).toBe("file");
    expect(s.nodes[0].data.exts).toEqual(["cr2", "jpg"]);
    const plain = parseFlowScene({ kind: "flowchart", nodes: [{ id: "a", type: "step", position: { x: 0, y: 0 }, data: { label: "A", exts: [] } }], edges: [] })!;
    expect(plain.nodes[0].data).toEqual({ label: "A" });
  });
  it("สร้างกล่องไฟล์: ขนาดโตตามจำนวนไอคอน", () => {
    const one = makeFlowNode("file", { x: 0, y: 0 }, th, { label: "PDF", exts: ["pdf"] });
    const many = makeFlowNode("file", { x: 0, y: 0 }, th, { label: "งานออกแบบ", exts: ["psd", "ai", "eps", "svg", "indd", "pdf"] });
    expect(one.data.exts).toEqual(["pdf"]);
    expect(many.width).toBeGreaterThanOrEqual(one.width);
    expect(many.height).toBeGreaterThan(one.height);
    expect(many.height % 20).toBe(0);
  });
  it("คัดลอกเป็นข้อความ: ใส่นามสกุลในวงเล็บ", () => {
    const f = makeFlowNode("file", { x: 0, y: 0 }, th, { label: "รูปจากกล้อง", exts: ["cr2", "jpg"] });
    expect(flowClipText(copyFlowSelection(S([f]), [f.id])!)).toBe("รูปจากกล้อง (CR2, JPG)");
  });
});

describe("กรอบโซน + ที่เก็บแบบมีไอคอน", () => {
  it("โหลดกล่องโซนได้ · ที่เก็บเก็บ place เฉพาะค่าที่รู้จัก", () => {
    const s = parseFlowScene({ kind: "flowchart", nodes: [
      { id: "z", type: "zone", position: { x: 0, y: 0 }, width: 500, height: 300, data: { label: "บนคลาวด์" } },
      { id: "a", type: "storage", position: { x: 0, y: 0 }, data: { label: "Drive", place: "drive" } },
      { id: "b", type: "storage", position: { x: 0, y: 0 }, data: { label: "X", place: "hack<" } },
    ], edges: [] })!;
    expect(s.nodes.map((n) => n.type)).toEqual(["zone", "storage", "storage"]);
    expect(s.nodes[1].data.place).toBe("drive");
    expect(s.nodes[2].data.place).toBeUndefined();
  });
  it("กล่องที่อยู่ในโซนทั้งกล่องเท่านั้นที่ย้ายตาม", () => {
    const zone = { id: "z", position: { x: 0, y: 0 }, width: 400, height: 300 };
    const nodes = [
      zone,
      { id: "in", position: { x: 20, y: 60 }, width: 160, height: 60 },
      { id: "edge", position: { x: 300, y: 60 }, width: 160, height: 60 },   // ล้นขอบขวา
      { id: "out", position: { x: 500, y: 0 }, width: 100, height: 50 },
    ];
    expect(nodesInsideZone(zone, nodes)).toEqual(["in"]);
  });
  it("สร้างที่เก็บแบบมีไอคอน: ชื่อ = ชื่อที่เก็บ · ขนาดพอดีไอคอน · มีไฟล์ = สูงขึ้น", () => {
    const n = makeFlowNode("storage", { x: 0, y: 0 }, th, { place: "r2" });
    expect(n.data).toEqual({ label: "Cloudflare R2", place: "r2" });
    expect([n.width, n.height]).toEqual([STORAGE_ICON_SIZE.w, STORAGE_ICON_SIZE.h]);
    expect(storageNodeSize(true, 0)).toEqual({ w: 180, h: 120 });
    expect(storageNodeSize(true, 3).h).toBeGreaterThan(120);
    expect(storageNodeSize(false, 8).h).toBeGreaterThan(storageNodeSize(false, 3).h);
    const plain = makeFlowNode("zone", { x: 0, y: 0 }, th);
    expect([plain.width, plain.height, plain.data.label]).toEqual([480, 320, "กรอบโซน"]);
  });
});
