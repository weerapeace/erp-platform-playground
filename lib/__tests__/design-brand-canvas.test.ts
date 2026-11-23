import { describe, it, expect } from "vitest";
import { layoutZones, diffZoneMoves, refsForSheet, zoneFrames, ZONE_HEAD, GAPX, CARD_W, type CanvasEl } from "@/lib/design-brand-canvas";

const frame = (id: string, status: string, x: number): CanvasEl => ({ id, type: "frame", x, y: 0, width: 512, height: 300, customData: { kind: "dd_zone", status } });
const card = (sid: string, x: number, y: number, frameId: string | null = null): CanvasEl[] => [
  { id: `${sid}-r`, type: "rectangle", x, y, width: 240, height: 120, groupIds: [`g-${sid}`], frameId, customData: { kind: "design_sheet", id: sid } },
  { id: `${sid}-t`, type: "text", x: x + 10, y: y + 10, width: 200, height: 40, groupIds: [`g-${sid}`], frameId, customData: { kind: "design_sheet", id: sid } },
];

describe("design brand canvas", () => {
  it("reads zone frames by customData", () => {
    expect([...zoneFrames([frame("f1", "design", 0), { id: "x", type: "frame" }]).entries()]).toEqual([["f1", "design"]]);
  });

  it("puts a card in the zone under its centre and snaps it into the first slot", () => {
    const els = [frame("f1", "design", 0), frame("f2", "quoted", 600), ...card("s1", 650, 100)];
    const L = layoutZones(els);
    expect(L.sheetZone.get("s1")).toBe("quoted");
    expect(L.adopts.map((a) => a.frameId)).toEqual(["f2", "f2"]);
    const r = L.moves.find((m) => m.id === "s1-r")!;
    expect(r).toEqual({ id: "s1-r", x: 600 + GAPX, y: ZONE_HEAD });
    const t = L.moves.find((m) => m.id === "s1-t")!;
    expect(t.x - r.x).toBe(10);
  });

  it("ignores cards outside every zone", () => {
    const L = layoutZones([frame("f1", "design", 0), ...card("s1", 2000, 2000)]);
    expect(L.sheetZone.has("s1")).toBe(false);
    expect(L.moves).toEqual([]);
  });

  it("lays two cards side by side and grows the frame", () => {
    const els = [frame("f1", "design", 0), ...card("a", 20, 50, "f1"), ...card("b", 300, 60, "f1"), ...card("c", 20, 250, "f1")];
    const L = layoutZones(els);
    const pos = (id: string) => L.moves.find((m) => m.id === id);
    expect(pos("b-r")?.x ?? 300).toBe(GAPX * 2 + CARD_W);
    expect(L.frames[0].cards).toBe(3);
    expect(L.frames[0].height).toBeGreaterThan(300);
  });

  it("diff only reports cards seen before that changed zone", () => {
    const seen = new Map([["a", "design"], ["b", "design"]]);
    const now = new Map([["a", "design"], ["b", "quoted"], ["c", "sent_customer"]]);
    expect(diffZoneMoves(now, seen)).toEqual([{ sheetId: "b", status: "quoted" }]);
  });

  it("finds refs tied to a sheet card by arrows", () => {
    const els: CanvasEl[] = [
      ...card("s1", 0, 0),
      { id: "img1", type: "image", fileId: "F1", x: 400, y: 0, width: 50, height: 50 },
      { id: "emb", type: "embeddable", link: "https://pin.it/x", x: 400, y: 100, width: 50, height: 50 },
      { id: "note", type: "text", text: "ใช้หนังวัว", x: 400, y: 200, width: 50, height: 20 },
      { id: "a1", type: "arrow", startBinding: { elementId: "img1" }, endBinding: { elementId: "s1-r" } },
      { id: "a2", type: "arrow", startBinding: { elementId: "s1-t" }, endBinding: { elementId: "emb" } },
      { id: "a3", type: "arrow", startBinding: { elementId: "note" }, endBinding: { elementId: "s1-r" } },
      { id: "a4", type: "arrow", startBinding: { elementId: "note" }, endBinding: { elementId: "img1" } },
    ];
    const refs = refsForSheet(els, "s1", (f) => (f === "F1" ? "/api/r2-image?key=x" : null));
    expect(refs).toEqual([
      { id: "img1", kind: "image", url: "/api/r2-image?key=x" },
      { id: "emb", kind: "link", url: "https://pin.it/x" },
      { id: "note", kind: "text", text: "ใช้หนังวัว" },
    ]);
    expect(refsForSheet(els, "zzz", () => null)).toEqual([]);
  });
});
