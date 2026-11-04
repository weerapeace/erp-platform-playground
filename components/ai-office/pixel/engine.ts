/**
 * ตัววาดฉากออฟฟิศพิกเซล (canvas 2D) ของ "ออฟฟิศทีม AI" — ไม่ใช้ React · ไม่โหลดไฟล์รูป (วาดจากแผนผังตัวอักษร)
 * ฉากจริง 200×150 พิกเซล แล้วขยายด้วย CSS `image-rendering: pixelated` → เบามาก คมทุกจอ
 *
 * ห้อง: ห้องทำงาน (โต๊ะ 20 ตัว) · มุมพัก · เคาน์เตอร์ · ห้องซ่อม — ตัวละครเดินผ่านทางเดิน+ประตูไปห้องตามท่าทาง (Pose)
 * ท่าทาง/ค่าตกแต่งมาจาก lib/ai-office-scene.ts · ใช้ที่ components/ai-office/pixel/index.tsx
 */
import { SCENE_DESKS, type CharacterLook, type Pose, type SceneTheme } from "@/lib/ai-office-scene";

export const SW = 200;
export const SH = 150;

// ───────────── ผังห้อง ─────────────
export const DESK_POS: [number, number][] = [];
for (const y of [30, 54, 78, 102, 126]) for (const x of [4, 31, 58, 85]) DESK_POS.push([x, y]);
if (DESK_POS.length !== SCENE_DESKS) console.warn("[ai-office] จำนวนโต๊ะในฉากไม่ตรงกับ SCENE_DESKS");

export const seatOf = (d: number): [number, number] => { const [x, y] = DESK_POS[d] ?? DESK_POS[0]; return [x + 3, y - 10]; };

type Room = "hall" | "lounge" | "counter" | "repair";
type SideRoom = Exclude<Room, "hall">;
const WALL_X = 120;
const AISLE_X = 110;
const DOOR_IN_X = 127;
const DOOR_Y: Record<SideRoom, number> = { lounge: 26, counter: 72, repair: 122 };
const DOOR_GAPS: [number, number][] = [[26, 40], [72, 86], [122, 136]];

export const ROOM_SLOTS: Record<SideRoom, [number, number][]> = {
  lounge: [[141, 18], [151, 18], [161, 18], [180, 30], [131, 34], [168, 34]],
  counter: [[136, 72], [148, 72], [160, 72], [172, 72], [142, 62], [154, 62], [166, 62]],
  repair: [[128, 116], [140, 116], [152, 116], [164, 116], [176, 116], [134, 130], [146, 130], [158, 130], [170, 130]],
};
export const POSE_ROOM: Record<Pose, Room> = { work: "hall", sleep: "hall", away: "hall", lounge: "lounge", counter: "counter", repair: "repair" };

export function roomAt(x: number, y: number): Room {
  if (x < WALL_X) return "hall";
  if (y < 46) return "lounge";
  if (y < 98) return "counter";
  return "repair";
}

/** ทางเดินจากจุดหนึ่งไปอีกจุด — ห้องทำงานเดินตามแถวโต๊ะ → ทางเดินขวา → ประตู → ห้องปลายทาง */
export function planPath(from: [number, number], to: [number, number]): [number, number][] {
  const ra = roomAt(from[0], from[1]), rb = roomAt(to[0], to[1]);
  const pts: [number, number][] = [];
  if (ra === rb) {
    if (ra === "hall" && Math.abs(from[1] - to[1]) > 1) pts.push([AISLE_X, from[1]], [AISLE_X, to[1]]);
    pts.push(to);
    return pts;
  }
  if (ra === "hall") pts.push([AISLE_X, from[1]]);
  else pts.push([DOOR_IN_X, DOOR_Y[ra]], [AISLE_X, DOOR_Y[ra]]);
  if (rb === "hall") pts.push([AISLE_X, to[1]]);
  else pts.push([AISLE_X, DOOR_Y[rb]], [DOOR_IN_X, DOOR_Y[rb]]);
  pts.push(to);
  return pts;
}

// ───────────── ตัวละคร ─────────────
export type Actor = {
  id: string; x: number; y: number; path: [number, number][];
  walking: boolean; pose: Pose; desk: number; look: CharacterLook;
};

/** เดินตามทาง — คืน true ถ้ายังเดินอยู่ */
export function stepActor(a: Actor, dt: number, speed = 30): boolean {
  let budget = speed * dt;
  while (budget > 0 && a.path.length) {
    const [tx, ty] = a.path[0];
    const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    if (d <= budget) { a.x = tx; a.y = ty; budget -= d; a.path.shift(); }
    else { a.x += (dx / d) * budget; a.y += (dy / d) * budget; budget = 0; }
  }
  a.walking = a.path.length > 0;
  return a.walking;
}

/** กรอบให้คลิก/ชี้ (พิกเซลฉาก) */
export const actorBox = (a: Actor) => ({ x0: a.x, y0: a.y - 2, x1: a.x + 10, y1: a.y + 12 });
export const deskBox = (d: number) => { const [x, y] = DESK_POS[d]; return { x0: x, y0: y - 12, x1: x + 24, y1: y + 9 }; };

const HEAD: Record<CharacterLook["species"], string[]> = {
  cat: [".F......F.", ".fF....Ff.", ".ffffffff.", ".ffeffeff.", ".fffnnfff.", "..ffffff.."],
  dog: ["..........", ".FffffffF.", "FFffffffFF", "FFfeffefFF", "..ffnnff..", "...ffff..."],
  human: ["..hhhhhh..", ".hhhhhhhh.", ".hffffffh.", ".hfeffefh.", "..ffffff..", "...ffff..."],
};
const BODY = ["..bbbbbb..", ".bbbbbbbb.", ".fbbbbbbf.", "..bbbbbb.."];
const LEGS = [["..pp..pp..", "..pp..pp.."], ["...pp.pp..", "..pp...pp."]];
const SKIN = "#E8B48F";

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `#${[f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// ───────────── ธีม ─────────────
type Pal = {
  hallA: string; hallB: string; seam: string; wall: string; stripe: string; base: string; div: string; divHi: string;
  lounge: string; rugA: string; rugB: string; cFloor: string; cLine: string; rFloor: string; rGrid: string;
  wLounge: string; wCounter: string; wRepair: string; line: string;
  deskTop: string; deskEdge: string; deskFront: string; deskLeg: string; glass: string; frame: string;
  shelf: string; shelfDark: string; sofa: string; sofaDark: string; table: string; cTop: string; cFront: string;
  rack: string; rackRow: string; plant: string; plantHi: string; pot: string; dark: boolean;
};
const PAL: Record<SceneTheme, Pal> = {
  day: {
    hallA: "#C68B59", hallB: "#BD8150", seam: "#A86E40", wall: "#EAD8B4", stripe: "#E0CA9E", base: "#8C6A4F", div: "#6B4F3A", divHi: "#8C6A4F",
    lounge: "#D9C7A3", rugA: "#5E8A6B", rugB: "#7FA88A", cFloor: "#E3C59A", cLine: "#D2B285", rFloor: "#A3ACBF", rGrid: "#8E97AB",
    wLounge: "#DCE8D9", wCounter: "#F0E2C4", wRepair: "#C9CFDB", line: "#5B4636",
    deskTop: "#A97448", deskEdge: "#C08A5A", deskFront: "#7A4E2C", deskLeg: "#5A3A20", glass: "#9FC9E8", frame: "#F4ECDC",
    shelf: "#7A5230", shelfDark: "#5A3A20", sofa: "#C8655C", sofaDark: "#9A3F38", table: "#8B5E3C", cTop: "#C9A06B", cFront: "#9E7446",
    rack: "#3A3F4B", rackRow: "#2A2E38", plant: "#4E8A3E", plantHi: "#6BAE53", pot: "#B85C38", dark: false,
  },
  night: {
    hallA: "#5A4A6E", hallB: "#54456A", seam: "#46395A", wall: "#3B3561", stripe: "#36305A", base: "#2A2448", div: "#231E3C", divHi: "#3A3360",
    lounge: "#4A4470", rugA: "#2F5A4A", rugB: "#3C6E5A", cFloor: "#5C5078", cLine: "#514670", rFloor: "#3E4560", rGrid: "#353B54",
    wLounge: "#33405A", wCounter: "#463C66", wRepair: "#2C3348", line: "#1A1530",
    deskTop: "#6E5A7E", deskEdge: "#7E6A8E", deskFront: "#4E3E5E", deskLeg: "#3A2E48", glass: "#1E2A55", frame: "#8C82B0",
    shelf: "#4A3A5A", shelfDark: "#352A44", sofa: "#8A4A6A", sofaDark: "#6A3450", table: "#5A4668", cTop: "#7A6890", cFront: "#5E4E74",
    rack: "#1E2230", rackRow: "#151824", plant: "#2F6A4A", plantHi: "#3F8A5E", pot: "#7A4A5A", dark: true,
  },
  minimal: {
    hallA: "#E6E4DE", hallB: "#DEDBD3", seam: "#CFCBC1", wall: "#F4F3EF", stripe: "#EDEBE5", base: "#B4B2A9", div: "#888780", divHi: "#A8A69E",
    lounge: "#ECEAE4", rugA: "#B9CDBF", rugB: "#C9D8CF", cFloor: "#EFEDE8", cLine: "#E2DFD8", rFloor: "#E3E5EA", rGrid: "#D3D6DE",
    wLounge: "#F1F4F1", wCounter: "#F6F2EA", wRepair: "#EEF0F4", line: "#888780",
    deskTop: "#D3D1C7", deskEdge: "#E2E0D8", deskFront: "#B4B2A9", deskLeg: "#888780", glass: "#CFE3F2", frame: "#FFFFFF",
    shelf: "#B4B2A9", shelfDark: "#888780", sofa: "#9CB4C8", sofaDark: "#7E98AE", table: "#C4C2B8", cTop: "#D3D1C7", cFront: "#B4B2A9",
    rack: "#5F5E5A", rackRow: "#444441", plant: "#7FAE6E", plantHi: "#9BC78A", pot: "#C4C2B8", dark: false,
  },
};

type Ctx = CanvasRenderingContext2D;
const rect = (g: Ctx, x: number, y: number, w: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
function sprite(g: Ctx, map: string[], pal: Record<string, string>, x: number, y: number) {
  const ox = Math.round(x), oy = Math.round(y);
  for (let r = 0; r < map.length; r++) {
    const row = map[r];
    for (let i = 0; i < row.length; i++) {
      const c = pal[row[i]];
      if (c) { g.fillStyle = c; g.fillRect(ox + i, oy + r, 1, 1); }
    }
  }
}

// ───────────── พื้นหลัง (วาดครั้งเดียวต่อธีม แล้วเก็บไว้) ─────────────
const bgCache = new Map<SceneTheme, HTMLCanvasElement>();
function background(theme: SceneTheme): HTMLCanvasElement {
  const hit = bgCache.get(theme);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = SW; c.height = SH;
  const g = c.getContext("2d")!;
  const P = PAL[theme];
  const r = (x: number, y: number, w: number, h: number, col: string) => rect(g, x, y, w, h, col);

  // ห้องทำงาน
  for (let y = 16; y < SH; y += 4) {
    r(0, y, WALL_X, 4, (y / 4) % 2 ? P.hallA : P.hallB);
    for (let x = ((y / 4) % 3) * 4; x < WALL_X; x += 12) r(x, y, 1, 4, P.seam);
  }
  r(0, 0, WALL_X, 16, P.wall);
  for (let x = 2; x < WALL_X; x += 4) r(x, 0, 1, 14, P.stripe);
  r(0, 14, WALL_X, 2, P.base);
  r(3, 1, 14, 13, P.shelf); r(4, 5, 12, 1, P.shelfDark); r(4, 9, 12, 1, P.shelfDark);
  ["#D85A30", "#378ADD", "#F4ECDC", "#1D9E75", "#EFB627", "#D4537E"].forEach((col, i) => { r(4 + i * 2, 2, 1, 3, col); r(5 + i * 2, 6, 1, 3, ["#534AB7", "#EFB627", "#D85A30", "#F4ECDC", "#378ADD", "#1D9E75"][i]); });
  r(4, 10, 3, 3, "#C9A06B"); r(9, 11, 5, 2, "#F4ECDC");
  const win = (x: number, y: number, w: number, h: number) => {
    r(x, y, w, h, P.frame); r(x + 1, y + 1, w - 2, h - 2, P.glass); r(x + (w >> 1), y + 1, 1, h - 2, P.frame); r(x + 1, y + (h >> 1), w - 2, 1, P.frame);
    if (P.dark) { r(x + 3, y + 2, 1, 1, "#FAC775"); r(x + w - 4, y + h - 3, 1, 1, "#FFFFFF"); } else r(x + 2, y + 2, 3, 1, "#FFFFFF");
  };
  win(24, 2, 18, 10);
  r(48, 2, 22, 11, "#F4ECDC"); r(48, 2, 22, 1, P.line); r(50, 4, 9, 1, "#378ADD"); r(50, 6, 14, 1, "#D85A30"); r(50, 8, 6, 1, "#1D9E75"); r(60, 8, 7, 3, "#EFB627");
  win(76, 2, 18, 10);
  r(99, 3, 7, 7, "#F4ECDC"); r(99, 3, 7, 1, P.line); r(102, 4, 1, 3, P.line); r(102, 6, 2, 1, P.line);
  r(111, 9, 5, 5, P.pot); r(110, 4, 7, 5, P.plant); r(112, 2, 3, 3, P.plantHi);

  // ผนังกั้น + ประตู
  r(WALL_X, 0, 3, SH, P.div); r(WALL_X, 0, 1, SH, P.divHi);
  for (const [a, b] of DOOR_GAPS) { r(WALL_X, a, 3, b - a, P.hallB); r(WALL_X, a, 3, 1, P.line); r(WALL_X, b - 1, 3, 1, P.line); }

  // มุมพัก
  r(123, 0, 77, 12, P.wLounge); r(123, 10, 77, 2, P.base); r(123, 12, 77, 34, P.lounge);
  r(133, 15, 60, 29, P.rugA); r(135, 17, 56, 25, P.rugB);
  win(150, 1, 18, 9);
  r(176, 2, 12, 8, "#B8860B"); r(177, 3, 10, 6, P.dark ? "#3C6E5A" : "#7FA88A"); r(179, 5, 3, 3, "#EFB627");
  r(126, 12, 7, 10, "#4A4A55"); r(127, 14, 5, 3, "#2E2E3A"); r(129, 19, 2, 2, "#F4ECDC");
  r(192, 14, 5, 6, P.pot); r(191, 8, 7, 6, P.plant); r(193, 6, 3, 3, P.plantHi);
  r(138, 22, 36, 4, P.sofa); r(138, 22, 36, 1, P.sofaDark); r(136, 23, 3, 9, P.sofaDark); r(173, 23, 3, 9, P.sofaDark);

  // เคาน์เตอร์ (ห้องกลาง)
  r(123, 46, 77, 1, P.line); r(123, 47, 77, 9, P.wCounter); r(123, 56, 77, 2, P.base);
  for (let y = 58; y < 98; y += 5) { r(123, y, 77, 5, P.cFloor); r(123, y, 77, 1, P.cLine); }
  r(138, 48, 22, 7, "#C9A06B"); r(140, 49, 4, 3, "#F4ECDC"); r(146, 50, 5, 3, "#FAC775"); r(153, 49, 4, 4, "#B5D4F4"); r(141, 49, 1, 1, "#E24B4A");
  r(186, 60, 5, 6, P.pot); r(185, 54, 7, 6, P.plant);

  // ห้องซ่อม
  r(123, 98, 77, 1, P.line); r(123, 99, 77, 9, P.wRepair); r(123, 108, 77, 2, P.base);
  r(123, 110, 77, 40, P.rFloor);
  for (let x = 123; x < SW; x += 6) r(x, 110, 1, 40, P.rGrid);
  for (let y = 110; y < SH; y += 6) r(123, y, 77, 1, P.rGrid);
  for (const x of [128, 141, 154, 167, 180]) { r(x, 100, 10, 17, P.rack); for (let k = 0; k < 6; k++) r(x + 1, 102 + k * 2, 8, 1, P.rackRow); }
  r(186, 140, 10, 6, "#D85A30"); r(188, 138, 6, 2, "#993C1D"); r(124, 146, 76, 1, "#EFB627");

  bgCache.set(theme, c);
  return c;
}

// ───────────── วาด 1 เฟรม ─────────────
export type FrameOpts = {
  theme: SceneTheme; t: number; rm: boolean;
  hover: string | null; sel: string | null;
  /** โหมดตกแต่ง: โต๊ะที่เมาส์ชี้ · โต๊ะที่กำลังจะย้าย (-1 = ไม่มี) */
  hoverDesk: number; swapFrom: number;
};

function drawChar(g: Ctx, a: Actor, t: number, rm: boolean) {
  const L = a.look;
  const f = L.species === "human" ? SKIN : L.fur;
  const pal: Record<string, string> = {
    f, F: shade(f, 0.78), e: "#2A1E18", n: "#E07A8A", h: L.fur, b: L.shirt, p: "#3E3E4A",
  };
  const asleep = a.pose === "sleep" && !a.walking;
  if (asleep) pal.e = shade(f, 0.6);
  const y = a.y + (asleep ? 1 : 0);
  sprite(g, HEAD[L.species], pal, a.x, y);
  sprite(g, BODY, pal, a.x, y + 6);
  sprite(g, LEGS[a.walking && !rm ? Math.floor(t * 7) % 2 : 0], pal, a.x, y + 10);
}

function bubble(g: Ctx, a: Actor, t: number, rm: boolean) {
  if (a.walking || a.pose === "work") return;
  const bx = Math.round(a.x + 1), by = Math.round(a.y - 9);
  if (a.pose === "sleep") {
    const k = rm ? 0 : Math.floor(t * 1.5) % 3;
    const c = "#B4B2A9";
    const z = (x: number, y: number) => { rect(g, x, y, 4, 1, c); rect(g, x + 2, y + 1, 1, 1, c); rect(g, x + 1, y + 2, 1, 1, c); rect(g, x, y + 3, 4, 1, c); };
    z(bx + 5, by + 4 - k); if (k > 0) z(bx + 7, by + 1 - k);
    return;
  }
  if (a.pose === "repair" && !rm && Math.floor(t * 2.5) % 2) return;
  rect(g, bx - 1, by - 1, 9, 8, "#3E2F25");
  rect(g, bx, by, 7, 6, a.pose === "repair" ? "#FFE1E1" : "#FFFFFF");
  const px = (x: number, y: number, c: string) => rect(g, bx + x, by + y, 1, 1, c);
  if (a.pose === "repair") { rect(g, bx + 3, by + 1, 1, 3, "#E24B4A"); px(3, 4, "#E24B4A"); }
  if (a.pose === "counter" || a.pose === "away") {
    const c = a.pose === "counter" ? "#BA7517" : "#888780";
    rect(g, bx + 2, by + 1, 3, 1, c); px(4, 2, c); px(3, 3, c); px(3, 4, c);
  }
  if (a.pose === "lounge") { rect(g, bx + 2, by + 2, 3, 3, "#F4ECDC"); rect(g, bx + 2, by + 2, 3, 1, "#8B5E3C"); px(5, 3, "#B4B2A9"); }
}

function drawDesk(g: Ctx, P: Pal, d: number, owner: Actor | undefined, t: number, rm: boolean) {
  const [x, y] = DESK_POS[d];
  const seated = owner && !owner.walking && owner.desk === d && (owner.pose === "work" || owner.pose === "sleep" || owner.pose === "away");
  rect(g, x, y, 24, 3, P.deskTop); rect(g, x, y, 24, 1, P.deskEdge); rect(g, x, y + 3, 24, 5, P.deskFront);
  rect(g, x + 1, y + 8, 2, 1, P.deskLeg); rect(g, x + 21, y + 8, 2, 1, P.deskLeg);
  rect(g, x + 14, y - 6, 9, 7, "#2E2E3A");
  const screen = seated && owner!.pose === "work" ? "#9FE1CB" : seated && owner!.pose === "sleep" ? "#1F2A44" : "#3A3A48";
  rect(g, x + 15, y - 5, 7, 4, screen);
  if (seated && owner!.pose === "work") {
    const k = rm ? 1 : Math.floor(t * 6 + d) % 4;
    rect(g, x + 16, y - 4 + (k % 3), 1 + k, 1, "#0F6E56");
  }
  if (seated && owner!.pose === "sleep") {
    const on = rm || Math.floor(t * 2) % 2 === 0;
    rect(g, x + 10, y - 3, 4, 3, "#E24B4A"); rect(g, x + 11, y - 2, 2, 1, "#FFE1E1");
    if (on) { rect(g, x + 9, y - 4, 1, 1, "#E24B4A"); rect(g, x + 14, y - 4, 1, 1, "#E24B4A"); }
  }
  rect(g, x + 18, y + 1, 1, 1, "#2E2E3A");
  rect(g, x + 3, y + 1, 5, 1, "#F4ECDC");
}

export function drawFrame(ctx: Ctx, actors: Actor[], deskOwner: string[], o: FrameOpts) {
  const P = PAL[o.theme];
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(background(o.theme), 0, 0);
  const byId = new Map(actors.map((a) => [a.id, a]));

  // ไฟตู้เซิร์ฟเวอร์ — มีคนในห้องซ่อม = ไฟแดงกะพริบ
  const trouble = actors.some((a) => a.pose === "repair");
  [128, 141, 154, 167, 180].forEach((x, j) => {
    for (let k = 0; k < 6; k++) {
      const on = o.rm ? 1 : Math.floor(o.t * 3 + k + j * 2) % 3;
      rect(ctx, x + 7, 102 + k * 2, 1, 1, trouble && k % 3 === 0 && on ? "#E24B4A" : on ? "#5DCAA5" : "#2E5F50");
    }
  });
  if (trouble && (o.rm || Math.floor(o.t * 2) % 2)) rect(ctx, 194, 100, 4, 2, "#E24B4A");
  if (actors.some((a) => a.pose === "counter") && (o.rm || Math.floor(o.t * 1.5) % 2)) rect(ctx, 170, 49, 4, 4, "#EFB627");

  const items: { z: number; f: () => void }[] = [];
  DESK_POS.forEach((_, d) => items.push({ z: DESK_POS[d][1] + 9, f: () => drawDesk(ctx, P, d, byId.get(deskOwner[d] ?? ""), o.t, o.rm) }));
  items.push({ z: 33, f: () => { rect(ctx, 138, 26, 36, 4, P.sofa); rect(ctx, 138, 30, 36, 2, P.sofaDark); } });
  items.push({ z: 42, f: () => { rect(ctx, 146, 38, 20, 3, P.table); rect(ctx, 146, 41, 20, 1, P.sofaDark); rect(ctx, 151, 36, 2, 2, "#F4ECDC"); } });
  items.push({ z: 91, f: () => { rect(ctx, 134, 84, 56, 2, P.cTop); rect(ctx, 134, 86, 56, 5, P.cFront); rect(ctx, 160, 82, 3, 2, "#EFB627"); rect(ctx, 161, 81, 1, 1, "#EFB627"); rect(ctx, 176, 83, 6, 1, "#F4ECDC"); } });
  for (const a of actors) items.push({ z: a.y + 12, f: () => drawChar(ctx, a, o.t, o.rm) });
  items.sort((p, q) => p.z - q.z).forEach((it) => it.f());

  // ตกแต่ง: กรอบโต๊ะที่ชี้ / กำลังย้าย
  const outline = (d: number, c: string) => {
    const b = deskBox(d);
    rect(ctx, b.x0, b.y0, b.x1 - b.x0, 1, c); rect(ctx, b.x0, b.y1, b.x1 - b.x0, 1, c);
    rect(ctx, b.x0, b.y0, 1, b.y1 - b.y0, c); rect(ctx, b.x1 - 1, b.y0, 1, b.y1 - b.y0 + 1, c);
  };
  if (o.swapFrom >= 0) outline(o.swapFrom, "#FFD34D");
  if (o.hoverDesk >= 0 && o.hoverDesk !== o.swapFrom) outline(o.hoverDesk, "#FFFFFF");

  for (const a of actors) bubble(ctx, a, o.t, o.rm);
  for (const a of actors) {
    if (a.id !== o.sel && a.id !== o.hover) continue;
    const c = a.id === o.sel ? "#FFD34D" : "#FFFFFF";
    const ax = Math.round(a.x), ay = Math.round(a.y) - (a.pose === "work" || a.walking ? 6 : 13);
    rect(ctx, ax + 3, ay, 5, 1, c); rect(ctx, ax + 4, ay + 1, 3, 1, c); rect(ctx, ax + 5, ay + 2, 1, 1, c);
  }
}
