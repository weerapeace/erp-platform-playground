// กล่องฝังวิดีโอ (Pinterest/TikTok) บนกระดาน ต้อง "ลากเส้นมาวางกลางกล่องแล้วผูก" ได้เหมือนการ์ดอื่น
// ใช้ตัวตรวจผูกเส้นของ Excalidraw เอง (getHoveredElementForBinding) — เทียบกล่องโปร่ง (บั๊กเดิม) กับกล่องพื้นทึบ (bindableEmbed)
import { beforeAll, describe, expect, it } from "vitest";
import { bindableEmbed, EMBED_FILL, fullscreenEscAction } from "@/components/canvas-sketch/utils";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let X: any;
beforeAll(async () => {
  // ไฟล์ Excalidraw แตะ window/document ตอนโหลด → ใส่ของปลอมขั้นต่ำ (เทสต์รันบน node ไม่มี jsdom)
  const g = globalThis as Record<string, unknown>;
  g.window ??= globalThis;
  g.devicePixelRatio ??= 1;
  g.location ??= { origin: "http://localhost", href: "http://localhost/", hostname: "localhost", protocol: "http:" };
  g.document ??= { createElement: () => ({ getContext: () => null, style: {} }), documentElement: { style: {} }, addEventListener() {}, fonts: { add() {}, check: () => true } };
  // @ts-expect-error — chunk ภายในของ Excalidraw ไม่มี type (ชื่อไฟล์เปลี่ยนเมื่ออัปเกรด Excalidraw → หาไฟล์ที่ export getHoveredElementForBinding ใหม่)
  X = await import("../../node_modules/@excalidraw/excalidraw/dist/dev/chunk-4FTI6OG3.js");
});

const embed = (extra: Record<string, unknown> = {}) => ({
  id: "vid", type: "embeddable", x: 0, y: 0, width: 300, height: 500, angle: 0,
  strokeColor: "transparent", backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid",
  roughness: 1, opacity: 100, roundness: { type: 3 }, seed: 1, version: 3, versionNonce: 1, isDeleted: false,
  groupIds: [], frameId: null, boundElements: null, updated: 1, link: "https://www.pinterest.com/pin/123/", locked: false, index: "a0",
  ...extra,
});
const hover = (el: Record<string, unknown>, x: number, y: number) =>
  X.getHoveredElementForBinding({ x, y }, [el], X.arrayToMap([el]), { value: 1 }, false, false);

describe("กล่องฝังวิดีโอ ผูกเส้นได้", () => {
  it("บั๊กเดิม: กล่องโปร่ง ปล่อยปลายเส้นกลางกล่อง = ไม่ผูก (ต้องเล็งขอบ)", () => {
    expect(hover(embed(), 150, 250)).toBeNull();
    expect(hover(embed(), 2, 250)?.id).toBe("vid"); // ชิดขอบ = ผูก
  });
  it("หลังแก้: พื้นทึบ ปล่อยตรงไหนของกล่องก็ผูก", () => {
    const fixed = bindableEmbed(embed());
    expect(fixed).toMatchObject(EMBED_FILL);
    expect(hover(fixed, 150, 250)?.id).toBe("vid");
    expect(hover(fixed, 80, 400)?.id).toBe("vid");
  });
  it("ไม่แตะ version · ไม่แตะชิ้นอื่น · กล่องที่ทึบอยู่แล้วคืนตัวเดิม", () => {
    const e = embed({ fillStyle: "hachure" });
    expect(bindableEmbed(e).version).toBe(3);
    const rect = { ...embed(), type: "rectangle" };
    expect(bindableEmbed(rect)).toBe(rect);
    const solid = embed({ backgroundColor: "#ffc9c9" });
    expect(bindableEmbed(solid)).toBe(solid);
    expect(bindableEmbed(embed({ backgroundColor: "#ffffff00" }))).toMatchObject(EMBED_FILL);
  });
});

describe("Esc 2 จังหวะ ตอนกระดานเต็มจอ", () => {
  const idle = { selectedElementIds: {}, activeTool: { type: "selection" } };
  it("ว่าง = ออกเต็มจอ", () => {
    expect(fullscreenEscAction(idle)).toBe("exit");
    expect(fullscreenEscAction({ ...idle, activeTool: { type: "hand" } })).toBe("exit");
  });
  it("มีของถูกเลือก = ล้างการเลือกก่อน (Excalidraw ไม่ล้างเอง)", () => {
    expect(fullscreenEscAction({ ...idle, selectedElementIds: { a: true } })).toBe("deselect");
  });
  it("กำลังพิมพ์/วาด/เปิดเมนู/ถือเครื่องมืออื่น = ปล่อยให้กระดานจัดการ", () => {
    expect(fullscreenEscAction({ ...idle, editingTextElement: { id: "t" } })).toBe("pass");
    expect(fullscreenEscAction({ ...idle, activeTool: { type: "rectangle" } })).toBe("pass");
    expect(fullscreenEscAction({ ...idle, openMenu: "canvas" })).toBe("pass");
    expect(fullscreenEscAction({ ...idle, newElement: { id: "n" } })).toBe("pass");
    expect(fullscreenEscAction(null)).toBe("pass");
  });
});

describe("ตัวลากเส้นเชื่อม (จุดม่วง) รับการ์ดวิดีโอเป็นปลายทาง", () => {
  it("ปล่อยบนกล่องฝังวิดีโอ = เจอการ์ดวิดีโอ · รูปไม่แย่งกรอบการ์ด", async () => {
    const { shapeAt } = await import("@/components/canvas-sketch/line-tools");
    const vid = { id: "v", type: "embeddable", x: 0, y: 0, width: 300, height: 500, isDeleted: false };
    expect(shapeAt([vid], 150, 250, 0)?.id).toBe("v");
    const card = { id: "c", type: "rectangle", x: 400, y: 0, width: 200, height: 200, isDeleted: false };
    const img = { id: "i", type: "image", x: 410, y: 10, width: 100, height: 100, isDeleted: false };
    expect(shapeAt([card, img], 450, 50, 0)?.id).toBe("c");
  });
});
