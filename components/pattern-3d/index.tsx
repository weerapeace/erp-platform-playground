"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- three.js โหลดจาก public/vendor ไม่มีไฟล์ชนิดข้อมูล (ดู lib/three-loader) */
/**
 * 🧊 Pattern3D — ตัวแสดงชิ้นแพทเทิร์นเป็นภาพ 3D (ของกลาง) · เจ้าของขอ 2026-11-10 "เวลาทำแบบมี Model 3D ให้ดูว่าเย็บแล้วเป็นยังไง"
 *   2 แบบ:
 *     mode="flat" = ชิ้นแบนวางบนโต๊ะตามตำแหน่งบนกระดานวาด (ชิ้นหนา มีรูเจาะจริง เส้นเย็บประ ป้ายชื่อ) · เลือกชิ้น = ยกขึ้น + สว่าง
 *     mode="bag"  = กระเป๋าที่ประกอบแล้วจากแม่แบบทรง (lib/bag-templates) · แถบ "แยกชิ้นดู" ดึงชิ้นออกจากกัน
 *     mode="assembly" = กระเป๋าที่ประกอบจากชิ้นจริง + ตะเข็บ (lib/pattern-assembly) · joined = เย็บทีละขั้น
 *     mode="sewn" = ภาพ "ตอนเย็บติดแล้ว" ของกระดานวาด (lib/pattern-sewn): ตัวกระเป๋า (ถ้าประกอบได้) + ชิ้นที่เย็บติด (แผ่นพับ / ห่วง / ห้อย) + ชิ้นที่ยังไม่เย็บวางข้างหน้า
 *   ลากเพื่อหมุน · ล้อเมาส์ซูม · ปุ่มมุมมอง · ชี้ = สว่าง · คลิกชิ้น = onSelect
 *   วาดใหม่เฉพาะตอนมีอะไรเปลี่ยน (ไม่วนวาดตลอด) · ไลบรารี 3D โหลดตอนเปิดครั้งแรก (lib/three-loader)
 *
 *   <Pattern3D mode="flat" pieces={[{ pid, name, cut, sew, holes }]} selected={pid} onSelect={(pid) => …} />
 *   <Pattern3D mode="bag" bag={bagGeometry(params)} explode={0.5} />
 *
 * ข้อจำกัด: ประกอบทรงตามกติกา (แผ่นหน้า/หลังขนานกัน + ผิวข้างลากข้ามความลึก) · ยังไม่จำลองวัสดุทิ้งตัว/ย่น
 * ใช้ที่: components/pattern-studio · คู่มือ: docs/pattern-studio.md
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n";
import { loadThree, type Three } from "@/lib/three-loader";
import { Icon } from "@/components/icon";
import type { BagSim } from "@/lib/pattern-sim";
import { BAG_HANDLE_ATTACH, BAG_PVC_MARGIN, bagWindowShape, type BagGeometry } from "@/lib/bag-templates";
import type { AssemblyOk } from "@/lib/pattern-assembly";
import type { SewnScene } from "@/lib/pattern-sewn";
import { flattenShape, offsetPolygon, type Pt } from "@/lib/pattern-shape";
import { buildGlb, type GlbMesh } from "@/lib/glb-export";

export type Flat3DPiece = { pid: string; name: string; cut: Pt[]; sew: Pt[]; holes: Pt[][]; color?: string };
/** ด้ายเย็บในโหมดชิ้นแบน: ขอบสองด้านของตะเข็บ (พิกัดกระดาน ซม. · y ลง) + สี */
export type Flat3DThread = { a: Pt[]; b: Pt[]; color: string };
export type Pattern3DView = "iso" | "front" | "side" | "top";
export type BagColors = { body: string; handle: string };
/** ลายผ้าขนาดจริงของชิ้น (รอบ G2): ชนิด + ขนาดลาย 1 ซ้ำ (ซม.) + สีที่สอง */
export type PieceTex = { kind: string; size: number; color2?: string };

const VIEWS: Record<Pattern3DView, [number, number]> = { iso: [0.62, 1.22], front: [0, 1.5], side: [Math.PI / 2, 1.5], top: [0, 0.1] };
const FLAT_VIEW: [number, number] = [0.25, 0.62];
const DEFAULT_COLORS: BagColors = { body: "#9a6a45", handle: "#4a3023" };
const PAPER = "#d8c08c";
const LINING = "#d9cdb4";         // ชั้นซับใน (สีตัวอย่าง — สีของวัสดุที่ตั้งไว้ทับได้)
const LINING_PATCH = "#c4b693";   // ชิ้นปะบนซับใน (ช่องใส่ของ / ถุงช่องซิป) เข้มกว่านิดให้แยกออก
/** ผ่าดูข้างใน: front = ตัดฝั่งหน้าออก · back = ตัดฝั่งหลังออก (มองจากด้านหลัง) */
export type Pattern3DCut = "none" | "front" | "back";
/** การแสดงผล (รอบ G): ทึบ · โครงเส้น · โปร่ง */
export type Pattern3DDisplay = "solid" | "wire" | "xray";
/** วัตถุเทียบขนาด (ขนาดจริง ซม.) */
export type Pattern3DRef = "none" | "a4" | "phone" | "bottle" | "card";
/** ลากเมาส์เพื่อ: หมุนมุมมอง · ย้ายชิ้นที่เลือก · หมุนชิ้นที่เลือก (ดูอย่างเดียว ไม่แก้แพทเทิร์น) */
export type Pattern3DDrag = "orbit" | "move" | "turn";
const REF_OBJ: Record<Exclude<Pattern3DRef, "none">, { w: number; h: number; d: number; color: string; cyl?: boolean; th: string; en: string }> = {
  a4: { w: 21, h: 29.7, d: 0.15, color: "#fafafa", th: "กระดาษ A4", en: "A4 paper" },
  phone: { w: 7.5, h: 15.5, d: 0.8, color: "#1f2937", th: "มือถือ", en: "Phone" },
  bottle: { w: 6.5, h: 21, d: 6.5, color: "#7dd3fc", cyl: true, th: "ขวดน้ำ 500 มล.", en: "500 ml bottle" },
  card: { w: 8.56, h: 5.4, d: 0.08, color: "#2563eb", th: "บัตรเครดิต", en: "Credit card" },
};

type V3 = [number, number, number];
type Part = { key: string; id: string; g: any; base: V3; dir: V3; carrier: string | null; mats: any[]; e: number; l: number; join: string; /** ย้าย/หมุนดูใน 3D (รอบ G) */ off: V3; rot: number; r0: number };
type Stage = {
  setFlat: (pieces: Flat3DPiece[], threads?: Flat3DThread[]) => void;
  setBag: (G: BagGeometry, colors: BagColors) => void;
  setSelected: (id: string | null) => void;
  setAssembly: (A: AssemblyOk, colors: BagColors) => void;
  /** ภาพเย็บติดของกระดานวาด — เรียกซ้ำได้ทุกครั้งที่ชิ้น/ตะเข็บเปลี่ยน (มุมกล้องไม่กระโดด) */
  setSewn: (sc: SewnScene, colors: BagColors, opt: { pieceColors?: Record<string, string>; seamColors?: string[]; pieceTex?: Record<string, PieceTex> }) => void;
  /** โหมดจำลองวัสดุทิ้งตัว: วาดตาข่ายของตัวจำลอง แล้วเดินหน้าทุกเฟรมจนนิ่ง */
  setSim: (sim: BagSim, colors: BagColors) => void;
  /** ปลุกให้วาดต่อ (หลังเปลี่ยนค่าตัวจำลอง / กดเริ่มใหม่) */
  wake: () => void;
  /** ผ่าดูข้างใน (โหมดเย็บติดที่มีตัวกระเป๋า/ซับใน) */
  setCut: (cut: Pattern3DCut) => void;
  /** โหมดประกอบ: ขั้นที่เย็บแล้ว (null = ใช้แถบแยกชิ้นแทน) */
  setJoined: (keys: string[] | null) => void;
  setExplode: (e: number) => void;
  setView: (v: Pattern3DView) => void;
  /** รอบ G: มุมกล้องตั้งฉาก · การแสดงผล · วัตถุเทียบขนาด · โหมดลาก · คืนตำแหน่งชิ้น · ส่งออก GLB */
  setOrtho: (on: boolean) => void;
  setDisplay: (d: Pattern3DDisplay) => void;
  setRef: (r: Pattern3DRef) => void;
  setDrag: (m: Pattern3DDrag) => void;
  resetMoves: () => void;
  exportGlb: () => ArrayBuffer | null;
  /** ถ่ายภาพฉากตอนนี้เป็นรูป JPG (พื้นขาว) — v = มุมที่ต้องการ ("back" = มุมเฉียงจากด้านหลัง · ไม่ส่ง = มุมที่ดูอยู่) · ไม่เปลี่ยนมุมบนจอ */
  snapshot: (v?: Pattern3DView | "back") => string | null;
  dispose: () => void;
};
/** สิ่งที่หน้าอื่นเรียกใช้ได้เมื่อภาพพร้อม (เช่น ใบสเปกถ่ายภาพไปวางในเอกสาร) */
export type Pattern3DApi = { snapshot: (v?: Pattern3DView | "back") => string | null };

const norm = (x: number, y: number): Pt => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
function lum(hex: string): number { const c = parseInt(hex.slice(1), 16); return (0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)) / 255; }

function createStage(THREE: Three, host: HTMLElement, onPick: (id: string | null) => void, t3: (r: { th: string; en: string }) => string = (r) => r.th): Stage {
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const el: HTMLCanvasElement = renderer.domElement;
  Object.assign(el.style, { position: "absolute", inset: "0", width: "100%", height: "100%", display: "block", touchAction: "pan-y", cursor: "grab" });
  host.appendChild(el);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 1, 1, 4000), ocam = new THREE.OrthographicCamera(-1, 1, 1, -1, -4000, 8000);
  const refG = new THREE.Group(); scene.add(refG);   // วัตถุเทียบขนาด — ไม่อยู่ใน root (ไม่ถูกล้างตอนสร้างฉากใหม่ · ไม่ออกไฟล์ GLB)
  const hemi = new THREE.HemisphereLight(0xffffff, 0x7d8580, 0.95); scene.add(hemi);
  const d1 = new THREE.DirectionalLight(0xffffff, 0.7); d1.position.set(40, 80, 70); scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.25); d2.position.set(-60, 30, -50); scene.add(d2);
  // ชิ้นแบนหงายรับแสงเต็ม ๆ → ลดแสงลง ไม่งั้นสีกระดาษขาวโพลน
  const lights = (flat: boolean) => { hemi.intensity = flat ? 0.55 : 0.95; d1.intensity = flat ? 0.42 : 0.7; d2.intensity = flat ? 0.12 : 0.25; };

  const softTex = (kind: "shadow" | "grain") => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d")!;
    if (kind === "shadow") {
      const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
      g.addColorStop(0, "rgba(0,0,0,.55)"); g.addColorStop(0.6, "rgba(0,0,0,.18)"); g.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    }
    x.fillStyle = "#808080"; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1400; i++) { const v = (90 + Math.random() * 90) | 0; x.fillStyle = `rgba(${v},${v},${v},.5)`; x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, 0.6 + Math.random() * 1.6, 0, 7); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.3, 0.3); return t;
  };
  const shadowTex = softTex("shadow"), bump = softTex("grain");
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.5 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -0.02; scene.add(shadow);

  const S = {
    root: new THREE.Group(), parts: [] as Part[], byKey: {} as Record<string, Part>, pick: [] as any[],
    az: 0.62, pol: 1.22, taz: 0.62, tpol: 1.22, zoom: 1, dist: 100, target: new THREE.Vector3(),
    dirty: true, hl: null as string | null, sel: null as string | null, explode: 0, depth: 0, cut: "none" as Pattern3DCut, mode: "bag" as "bag" | "flat" | "asm" | "sim" | "sewn", joined: null as string[] | null, dead: false,
    ortho: false, disp: "solid" as Pattern3DDisplay, dispFor: null as any, dispKey: "", ref: "none" as Pattern3DRef, refFor: null as any, refKey: "", drag: "orbit" as Pattern3DDrag, moves: {} as Record<string, { off: V3; rot: number }>,
  };
  scene.add(S.root);
  let simTick: (() => boolean) | null = null;   // โหมดจำลอง: เดินตัวจำลอง 1 เฟรม → true = ยังขยับ

  const paint = () => {
    // กระเป๋า: เรืองแสงทับสีวัสดุ · ชิ้นแบน (สีกระดาษอ่อน): เปลี่ยนสีพื้นแทน เพราะเรืองแสงบนสีอ่อนมองไม่ออก
    S.parts.forEach((p) => p.mats.forEach((m) => {
      if (S.mode === "flat") m.color.set(p.id === S.sel ? "#f0b040" : p.id === S.hl ? "#e8c877" : m.userData.base);
      else m.emissive?.setHex(p.id === S.sel ? 0x6b4a12 : p.id === S.hl ? 0x4a3410 : 0);
    }));
    S.dirty = true;
  };
  const dashed = (pts: V3[], col: number) => {
    const geo = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const l = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: col, dashSize: 0.4, gapSize: 0.26 }));
    l.computeLineDistances(); return l;
  };
  const label = (text: string, h: number) => {
    const c = document.createElement("canvas"), x = c.getContext("2d")!, font = '600 40px "IBM Plex Sans Thai","Leelawadee UI",Tahoma,sans-serif';
    x.font = font; const w = Math.ceil(x.measureText(text).width) + 36; c.width = w; c.height = 68; x.font = font;
    x.fillStyle = "rgba(20,30,26,.82)"; const r = 18;
    x.beginPath(); x.moveTo(r, 2); x.lineTo(w - r, 2); x.quadraticCurveTo(w - 2, 2, w - 2, r); x.lineTo(w - 2, 66 - r); x.quadraticCurveTo(w - 2, 66, w - r, 66); x.lineTo(r, 66); x.quadraticCurveTo(2, 66, 2, 66 - r); x.lineTo(2, r); x.quadraticCurveTo(2, 2, r, 2); x.fill();
    x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, w / 2, 36);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
    s.scale.set((h * w) / 68, h, 1); s.renderOrder = 10; return s;
  };
  /** ลายผ้า 1 ซ้ำ บนผืนผ้าใบ 128 px → ทำซ้ำตามขนาดจริง (UV ของชิ้น = ซม.) */
  const fabricTex = (kind: string, c1: string, c2: string, size: number) => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const x = c.getContext("2d")!; x.fillStyle = c1; x.fillRect(0, 0, 128, 128); x.fillStyle = c2; x.strokeStyle = c2;
    if (kind === "stripe") x.fillRect(0, 0, 64, 128);
    else if (kind === "check") { x.globalAlpha = 0.5; x.fillRect(0, 0, 64, 128); x.fillRect(0, 0, 128, 64); }
    else if (kind === "dot") { for (const [cx, cy] of [[32, 32], [96, 96]]) { x.beginPath(); x.arc(cx, cy, 15, 0, 7); x.fill(); } }
    else if (kind === "weave") { x.globalAlpha = 0.35; x.lineWidth = 3; for (let i = 4; i < 128; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); } }
    else if (kind === "grain") { x.globalAlpha = 0.22; for (let i = 0; i < 520; i++) { x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 0, 7); x.fill(); } }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / Math.max(0.2, size), 1 / Math.max(0.2, size)); return t;
  };
  /** สี/ลายของวัสดุบนชิ้น (ถ้ามี) — ลายผ้าใส่ map แล้วตั้งสีขาว (ลายมีสีอยู่แล้ว) */
  const dress = (m: any, color: string, tex?: PieceTex | null) => {
    if (!tex || tex.kind === "plain") return m;
    m.map = fabricTex(tex.kind, color, tex.color2 ?? "#ffffff", tex.size); m.userData.ownMap = true; m.color.set("#ffffff"); m.needsUpdate = true; return m;
  };
  const clear = () => {
    S.root.traverse((o: any) => { o.geometry?.dispose(); if (o.material) { if (o.isSprite || o.material.userData?.ownMap) o.material.map?.dispose(); o.material.dispose(); } });
    scene.remove(S.root); S.root = new THREE.Group(); scene.add(S.root); S.parts = []; S.byKey = {}; S.pick = []; simTick = null;
    renderer.clippingPlanes = []; S.depth = 0;                 // ผ่าดูข้างในใช้ได้เฉพาะโหมดเย็บติด (setSewn ตั้งใหม่เอง)
  };
  // ชิ้นควรอยู่ห่างจากตำแหน่งประกอบแค่ไหน (0 = ประกอบแล้ว · 1 = แยกออก)
  const target = (join: string) => (S.mode === "flat" ? 0 : (S.mode === "asm" || S.mode === "sewn") && S.joined ? (join === "front" || S.joined.includes(join) ? 0 : 1) : S.explode);
  const add = (key: string, id: string, grp: any, base: V3, dir: V3, mats: any[], carrier: string | null = null, join = "") => {
    const mv = S.moves[key], p: Part = { key, id, g: grp, base, dir, carrier, mats, e: target(join), l: 0, join, off: mv ? [...mv.off] as V3 : [0, 0, 0], rot: mv?.rot ?? 0, r0: grp.rotation.y };
    S.root.add(grp); S.parts.push(p); S.byKey[key] = p;
  };
  const view = (v: [number, number], snap = false) => {
    S.taz = v[0]; S.tpol = v[1];
    let d = S.az - v[0]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    S.az = snap ? v[0] : v[0] + d; if (snap) S.pol = v[1];
    S.zoom = 1; S.dirty = true;
  };

  // ── ชิ้นแบนบนโต๊ะ ──
  const setFlat = (pieces: Flat3DPiece[], threads: Flat3DThread[] = []) => {
    const was = S.mode; S.mode = "flat"; clear(); lights(true);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const ok = pieces.filter((pc) => pc.cut.length >= 3);
    for (const pc of ok) for (const [x, y] of pc.cut) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (!ok.length) { x0 = y0 = 0; x1 = y1 = 40; }
    const span = Math.max(x1 - x0, y1 - y0, 20), lh = clamp(span * 0.03, 1.6, 4.5);
    ok.forEach((pc, i) => {
      const shape = new THREE.Shape(pc.cut.map(([x, y]) => new THREE.Vector2(x, -y)));
      pc.holes.forEach((h) => { if (h.length >= 3) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, -y)))); });
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false });
      const m = new THREE.MeshStandardMaterial({ color: pc.color || PAPER, roughness: 0.86, metalness: 0 });
      m.userData.base = pc.color || PAPER;
      const mesh = new THREE.Mesh(geo, m); mesh.userData.piece = pc.pid; S.pick.push(mesh);
      const grp = new THREE.Group(); grp.rotation.x = -Math.PI / 2; grp.add(mesh);
      if (pc.sew.length >= 3) grp.add(dashed([...pc.sew, pc.sew[0]].map(([x, y]) => [x, -y, 0.2] as V3), 0x5b4a2e));
      let cx = 0, cy = 0; for (const [x, y] of pc.cut) { cx += x; cy += y; } cx /= pc.cut.length; cy /= pc.cut.length;
      const tag = label(pc.name || `P${i + 1}`, lh); tag.position.set(cx, -cy, 0.6); grp.add(tag);
      add(`${pc.pid}#${i}`, pc.pid, grp, [0, 0, 0], [0, 0, 0], [m]);
    });
    // ด้ายเย็บ (แบบ CLO): ขอบที่เย็บเป็นเส้นสี + เส้นด้ายโค้งโยงจากขอบหนึ่งไปอีกขอบ หลายเส้นตามความยาว
    if (threads.length) {
      const tg = new THREE.Group(); tg.rotation.x = -Math.PI / 2;
      const at = (P: Pt[], f: number): Pt => {
        let L = 0; for (let k = 1; k < P.length; k++) L += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
        let d = L * f;
        for (let k = 1; k < P.length; k++) { const l = Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); if (d <= l && l > 0) return [P[k - 1][0] + ((P[k][0] - P[k - 1][0]) * d) / l, P[k - 1][1] + ((P[k][1] - P[k - 1][1]) * d) / l]; d -= l; }
        return P[P.length - 1];
      };
      const line = (pts: V3[], col: string, op: number) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map((q) => new THREE.Vector3(q[0], q[1], q[2]))), new THREE.LineBasicMaterial({ color: col, transparent: op < 1, opacity: op })); tg.add(l); };
      for (const th of threads) {
        if (th.a.length < 2 || th.b.length < 2) continue;
        line(th.a.map(([x, y]) => [x, -y, 0.26] as V3), th.color, 1);
        line(th.b.map(([x, y]) => [x, -y, 0.26] as V3), th.color, 1);
        const n = 7;
        for (let k = 0; k < n; k++) {
          const f = (k + 0.5) / n, p = at(th.a, f), q = at(th.b, f), dist = Math.hypot(q[0] - p[0], q[1] - p[1]), up = clamp(dist * 0.28, 1.5, 14), arc: V3[] = [];
          for (let j = 0; j <= 14; j++) { const u = j / 14; arc.push([p[0] + (q[0] - p[0]) * u, -(p[1] + (q[1] - p[1]) * u), 0.26 + 4 * up * u * (1 - u)]); }
          line(arc, th.color, 0.7);
        }
      }
      S.root.add(tg);
    }
    const size = Math.ceil((span + 30) / 10) * 10, grid = new THREE.GridHelper(size, size / 5, 0x64748b, 0x94a3b8);
    grid.material.transparent = true; grid.material.opacity = 0.35; grid.position.set((x0 + x1) / 2, -0.02, (y0 + y1) / 2); S.root.add(grid);
    S.target.set((x0 + x1) / 2, 0, (y0 + y1) / 2);
    S.dist = Math.max(x1 - x0, (y1 - y0) * 1.25, 30) * 1.7;
    shadow.visible = false;
    if (was !== "flat") view(FLAT_VIEW, true);
    paint();
  };

  // ── กระเป๋าที่ประกอบแล้ว (จากแม่แบบทรง) ──
  const gussetGeo = (pts: Pt[], D: number, H: number) => {
    const n = pts.length - 1, pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], sn: Pt[] = [], cum = [0];
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[i + 1], e = norm(b[0] - a[0], b[1] - a[1]); sn.push([e[1], -e[0]]); cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const vn = (i: number, j: number): Pt => { if (j < 0 || j >= n) return sn[i]; const a = sn[i], b = sn[j]; return a[0] * b[0] + a[1] * b[1] < 0.86 ? a : norm(a[0] + b[0], a[1] + b[1]); };
    for (let i = 0; i < n; i++) {
      const A = pts[i], B = pts[i + 1], na = vn(i, i - 1), nb = vn(i, i + 1), h = D / 2;
      const V: [Pt, number, Pt, number][] = [[A, h, na, cum[i]], [A, -h, na, cum[i]], [B, -h, nb, cum[i + 1]], [A, h, na, cum[i]], [B, -h, nb, cum[i + 1]], [B, h, nb, cum[i + 1]]];
      for (const v of V) { pos.push(v[0][0], v[0][1], v[1]); nor.push(v[2][0], v[2][1], 0); uv.push(v[3], v[1]); const s = 0.38 + 0.62 * clamp(v[0][1] / H, 0, 1); col.push(s, s, s); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  };
  const setBag = (G: BagGeometry, colors: BagColors) => {
    const was = S.mode; S.mode = "bag"; clear(); lights(false);
    const { W, H, D } = G.p, fl = G.p.flare, U = G.U, Wt = G.Wt, ATT = BAG_HANDLE_ATTACH;
    const thread = lum(colors.body) < 0.5 ? 0xe9dfc8 : 0x4a3a2a, threadH = lum(colors.handle) < 0.5 ? 0xe9dfc8 : 0x4a3a2a;
    const outer = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0, bumpMap: bump, bumpScale: 0.03, side: THREE.FrontSide });
    const lining = () => new THREE.MeshStandardMaterial({ color: 0xb8ab8e, roughness: 0.95, side: THREE.BackSide, vertexColors: true });
    const shade = (geo: any) => { const ps = geo.attributes.position, c: number[] = []; for (let k = 0; k < ps.count; k++) { const s = 0.38 + 0.62 * clamp(ps.getY(k) / H, 0, 1); c.push(s, s, s); } geo.setAttribute("color", new THREE.Float32BufferAttribute(c, 3)); return geo; };
    const hy = G.p.hem > 0.2 ? H - Math.max(G.p.hem - 0.4, 0.5) : null, halfW = (y: number) => W / 2 + (fl * y) / H;
    const zOut = 5 + D * 0.5;
    const hole: Pt[] | null = G.win ? flattenShape(bagWindowShape(G.win.kind, -G.win.w / 2, -(G.win.cy + G.win.h / 2), G.win.w, G.win.h)).map(([x, y]) => [x, -y] as Pt) : null;
    // ตัวหน้า + ตัวหลัง
    const closed: Pt[] = [...U];
    const inset = offsetPolygon(closed, -0.45);
    [1, -1].forEach((sg) => {
      const grp = new THREE.Group(), shape = new THREE.Shape(U.map((p) => new THREE.Vector2(p[0], p[1])));
      if (sg > 0 && hole) shape.holes.push(new THREE.Path(hole.map((p) => new THREE.Vector2(p[0], p[1]))));
      const geo = shade(new THREE.ShapeGeometry(shape)), id = sg < 0 && G.win ? "back" : "front";
      const m = outer(colors.body), mesh = new THREE.Mesh(geo, m); mesh.userData.piece = id; S.pick.push(mesh);
      grp.add(mesh, new THREE.Mesh(geo, lining()));
      if (inset.length >= 3) grp.add(dashed([...inset, inset[0]].map((p) => [p[0], p[1], 0.05] as V3), thread));
      if (sg > 0 && hole) { const st = offsetPolygon(hole, 0.5); grp.add(dashed([...st, st[0]].map((p) => [p[0], p[1], 0.05] as V3), thread)); }
      if (hy !== null) grp.add(dashed([[-halfW(hy) + 0.5, hy, 0.05], [halfW(hy) - 0.5, hy, 0.05]], thread));
      if (sg < 0) grp.rotation.y = Math.PI;
      add(sg > 0 ? "front" : "back", id, grp, [0, 0, (sg * D) / 2], [0, 0, sg * zOut], [m]);
    });
    // แผ่น PVC ใส
    if (G.win) {
      // หน้าต่างโชว์ = แผ่นใสใหญ่กว่ารู · ช่องซิป/ช่องสอด = ถุงซับในห้อยจากเหนือช่องลงไป (ทึบ)
      const pk = G.win.pocket, key = pk ? "pocket" : "pvc";
      const pw = pk ? pk.w / 2 : G.win.w / 2 + BAG_PVC_MARGIN, top = pk ? G.win.cy + G.win.h / 2 + 1.5 : G.win.cy + G.win.h / 2 + BAG_PVC_MARGIN;
      const bot = pk ? G.win.cy - G.win.h / 2 - pk.depth : G.win.cy - G.win.h / 2 - BAG_PVC_MARGIN;
      const pg = new THREE.Group();
      const pgeo = new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-pw, bot), new THREE.Vector2(pw, bot), new THREE.Vector2(pw, top), new THREE.Vector2(-pw, top)]));
      const pm = pk ? new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.9, metalness: 0, side: THREE.DoubleSide })
        : new THREE.MeshStandardMaterial({ color: 0xd4ecf7, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false });
      const pmesh = new THREE.Mesh(pgeo, pm); pmesh.position.z = -0.18; pmesh.userData.piece = key; S.pick.push(pmesh); pg.add(pmesh);
      add(key, "pvc", pg, [0, 0, D / 2], [0, 0, -4.5], [pm], "front");
    }
    // ข้าง + ก้น
    const gusset = (key: string, id: string, pts: Pt[], dir: V3, hemL: boolean, hemR: boolean) => {
      const grp = new THREE.Group(), geo = gussetGeo(pts, D, H), m = outer(colors.body), mesh = new THREE.Mesh(geo, m);
      mesh.userData.piece = id; S.pick.push(mesh); grp.add(mesh, new THREE.Mesh(geo, lining()));
      const n = pts.length, nv = pts.map((_, k) => { const a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)], e = norm(b[0] - a[0], b[1] - a[1]); return [e[1], -e[0]] as Pt; });
      [D / 2 - 0.45, -(D / 2 - 0.45)].forEach((z) => grp.add(dashed(pts.map((p, k) => [p[0] + nv[k][0] * 0.05, p[1] + nv[k][1] * 0.05, z] as V3), thread)));
      if (hy !== null) {
        if (hemL) grp.add(dashed([[-halfW(hy) + nv[0][0] * 0.05, hy, -D / 2 + 0.5], [-halfW(hy) + nv[0][0] * 0.05, hy, D / 2 - 0.5]], thread));
        if (hemR) grp.add(dashed([[halfW(hy) + nv[n - 1][0] * 0.05, hy, -D / 2 + 0.5], [halfW(hy) + nv[n - 1][0] * 0.05, hy, D / 2 - 0.5]], thread));
      }
      add(key, id, grp, [0, 0, 0], dir, [m]);
    };
    if (G.strip) gusset("strip", "strip", U, [0, -8, 0], true, true);
    else { gusset("sideL", "side", [U[0], U[1]], [-8, 0, 0], true, false); gusset("bottom", "bottom", [U[1], U[2]], [0, -8, 0], false, false); gusset("sideR", "side", [U[2], U[3]], [8, 0, 0], false, true); }
    // หู
    const A = G.arch, a = A.a, path: Pt[] = [[-a, H - ATT], [-a, H - ATT / 2], [-a, H]];
    if (A.eb) { for (let i = 1; i < 48; i++) { const ph = Math.PI * (1 - i / 48); path.push([a * Math.cos(ph), H + A.eb * Math.sin(ph)]); } path.push([a, H]); }
    else {
      const nv2 = Math.max(2, Math.round(A.v / 2));
      for (let i = 1; i <= nv2; i++) path.push([-a, H + (A.v * i) / nv2]);
      for (let i = 1; i < 36; i++) { const ph = Math.PI * (1 - i / 36); path.push([a * Math.cos(ph), H + A.v + a * Math.sin(ph)]); }
      for (let i = 0; i <= nv2; i++) path.push([a, H + A.v * (1 - i / nv2)]);
    }
    path.push([a, H - ATT / 2], [a, H - ATT]);
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], hw = G.p.wh / 2, Lp: Pt[] = [], Rp: Pt[] = [];
    for (let i = 0; i < path.length; i++) {
      const p0 = path[Math.max(0, i - 1)], p1 = path[Math.min(path.length - 1, i + 1)], e = norm(p1[0] - p0[0], p1[1] - p0[1]);
      Lp.push([path[i][0] - e[1] * hw, path[i][1] + e[0] * hw]); Rp.push([path[i][0] + e[1] * hw, path[i][1] - e[0] * hw]);
    }
    let sl = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const dl = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
      const V: [Pt, number, number][] = [[Lp[i], sl, 0], [Rp[i], sl, 1], [Rp[i + 1], sl + dl, 1], [Lp[i], sl, 0], [Rp[i + 1], sl + dl, 1], [Lp[i + 1], sl + dl, 0]];
      for (const v of V) { pos.push(v[0][0], v[0][1], 0); nor.push(0, 0, 1); uv.push(v[1], v[2]); }
      sl += dl;
    }
    [1, -1].forEach((sg) => {
      const grp = new THREE.Group(), geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      const m = new THREE.MeshStandardMaterial({ color: colors.handle, roughness: 0.75, side: THREE.DoubleSide }), mesh = new THREE.Mesh(geo, m);
      mesh.position.z = 0.1; mesh.userData.piece = "handle"; S.pick.push(mesh); grp.add(mesh);
      [-a, a].forEach((cx) => {
        const xa = cx - hw + 0.3, xb = cx + hw - 0.3, ya = H - ATT + 0.3, yb = H - 0.4;
        grp.add(dashed([[xa, ya, 0.16], [xb, ya, 0.16], [xb, yb, 0.16], [xa, yb, 0.16], [xa, ya, 0.16], [xb, yb, 0.16]], threadH));
        grp.add(dashed([[xa, yb, 0.16], [xb, ya, 0.16]], threadH));
      });
      if (sg < 0) grp.rotation.y = Math.PI;
      add(sg > 0 ? "handleF" : "handleB", "handle", grp, [0, 0, (sg * D) / 2], [0, 7, 0], [m], sg > 0 ? "front" : "back");
    });
    const top = H + A.h;
    S.target.set(0, top * 0.47, 0); S.dist = Math.max(top, Wt * 1.05, D) * 2.15;
    shadow.visible = true; shadow.scale.set(Wt * 1.7, D * 2.6, 1);
    if (was !== "bag") view(VIEWS.iso, true);
    paint();
  };

  // ── หู: แถบโค้งจากจุดติด a ถึง b (ตั้งตรงแล้วโค้งครึ่งวงกลม · หูสั้น = โค้งแบน) ──
  const buildHandle = (a: Pt, b: Pt, len: number, w: number, tail: number, color: string, threadCol: number) => {
    const g = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, e: Pt = [(b[0] - a[0]) / g, (b[1] - a[1]) / g];
    let n: Pt = [-e[1], e[0]]; if (n[1] < 0) n = [-n[0], -n[1]];
    const r = g / 2, m0: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], hw = w / 2;
    const L = (s: number, h: number): Pt => [m0[0] + e[0] * s + n[0] * h, m0[1] + e[1] * s + n[1] * h];
    let v = (len - Math.PI * r) / 2, eb = 0;
    if (v < 0) {
      v = 0; let lo = 0.3, hi = r;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2; let l = 0, px = -r, py = 0;
        for (let k = 1; k <= 48; k++) { const ph = Math.PI * (1 - k / 48), x = r * Math.cos(ph), y = mid * Math.sin(ph); l += Math.hypot(x - px, y - py); px = x; py = y; }
        if (l > len) hi = mid; else lo = mid;
      }
      eb = Math.max(lo, 0.8);
    }
    const path: Pt[] = [L(-r, -tail), L(-r, -tail / 2), L(-r, 0)];
    if (eb) { for (let i = 1; i < 48; i++) { const ph = Math.PI * (1 - i / 48); path.push(L(r * Math.cos(ph), eb * Math.sin(ph))); } path.push(L(r, 0)); }
    else {
      const nv = Math.max(2, Math.round(v / 2));
      for (let i = 1; i <= nv; i++) path.push(L(-r, (v * i) / nv));
      for (let i = 1; i < 36; i++) { const ph = Math.PI * (1 - i / 36); path.push(L(r * Math.cos(ph), v + r * Math.sin(ph))); }
      for (let i = 0; i <= nv; i++) path.push(L(r, v * (1 - i / nv)));
    }
    path.push(L(r, -tail / 2), L(r, -tail));
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], Lp: Pt[] = [], Rp: Pt[] = [];
    for (let i = 0; i < path.length; i++) {
      const p0 = path[Math.max(0, i - 1)], p1 = path[Math.min(path.length - 1, i + 1)], t = norm(p1[0] - p0[0], p1[1] - p0[1]);
      Lp.push([path[i][0] - t[1] * hw, path[i][1] + t[0] * hw]); Rp.push([path[i][0] + t[1] * hw, path[i][1] - t[0] * hw]);
    }
    let sl = 0, top = -Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      const dl = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
      const V: [Pt, number, number][] = [[Lp[i], sl, 0], [Rp[i], sl, 1], [Rp[i + 1], sl + dl, 1], [Lp[i], sl, 0], [Rp[i + 1], sl + dl, 1], [Lp[i + 1], sl + dl, 0]];
      for (const q of V) { pos.push(q[0][0], q[0][1], 0); nor.push(0, 0, 1); uv.push(q[1], q[2]); top = Math.max(top, q[0][1]); }
      sl += dl;
    }
    const grp = new THREE.Group(), geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, side: THREE.DoubleSide }), mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = 0.1; grp.add(mesh);
    if (tail > 0.9 && hw > 0.5) [-r, r].forEach((cx) => {
      const c = [L(cx - hw + 0.3, -tail + 0.3), L(cx + hw - 0.3, -tail + 0.3), L(cx + hw - 0.3, -0.4), L(cx - hw + 0.3, -0.4)];
      grp.add(dashed([c[0], c[1], c[2], c[3], c[0], c[2]].map((q) => [q[0], q[1], 0.16] as V3), threadCol));
      grp.add(dashed([c[3], c[1]].map((q) => [q[0], q[1], 0.16] as V3), threadCol));
    });
    return { grp, mat, mesh, top };
  };

  // ── กระเป๋าที่ประกอบจากชิ้นจริง + ตะเข็บ (lib/pattern-assembly) ──
  const buildAsm = (A: AssemblyOk, colors: BagColors, L?: { k: number; lift: number }, look?: { colors?: Record<string, string>; tex?: Record<string, PieceTex> }): number => {
    const colOf = (pid: string) => look?.colors?.[pid] || colors.body;   // สีวัสดุของชิ้น (รอบ G2) — ไม่ตั้ง = สีตัวกระเป๋า
    const D = A.depth, H = Math.max(A.height, 1), zOut = 5 + D * 0.5;
    if (L) {
      // ซับใน: ถุงอีกใบสีซับใน (เห็นทั้งสองหน้า) ย่อเล็กน้อยซ้อนอยู่ข้างในตัวนอก · ขั้น "lining" = ยังไม่ใส่ = ลอยขึ้นทั้งใบ
      const lm = () => new THREE.MeshStandardMaterial({ color: LINING, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
      const up: V3 = [0, H + 8, 0];
      for (const pn of A.panels) {
        if (pn.outline.length < 3) continue;
        const grp = new THREE.Group(), shape = new THREE.Shape(pn.outline.map((q) => new THREE.Vector2(q[0], q[1])));
        pn.holes.forEach((h) => { if (h.length >= 3) shape.holes.push(new THREE.Path(h.map((q) => new THREE.Vector2(q[0], q[1])))); });
        const m = lm(), mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), m);
        mesh.userData.piece = pn.pid; S.pick.push(mesh); grp.add(mesh);
        if (pn.side < 0) grp.rotation.y = Math.PI;
        grp.scale.setScalar(L.k);
        add(pn.side > 0 ? "Lfront" : "Lback", pn.pid, grp, [0, L.lift, (pn.side * D * L.k) / 2], up, [m], null, "lining");
      }
      A.sweeps.forEach((sw, i) => {
        if (sw.pts.length < 2) return;
        const grp = new THREE.Group(), m = lm(), mesh = new THREE.Mesh(gussetGeo(sw.pts, D, H), m);
        mesh.userData.piece = sw.pid; S.pick.push(mesh); grp.add(mesh); grp.scale.setScalar(L.k);
        add(`Lsw${i}`, sw.pid, grp, [0, L.lift, 0], up, [m], null, "lining");
      });
      return H * L.k + L.lift;
    }
    const thread = lum(colors.body) < 0.5 ? 0xe9dfc8 : 0x4a3a2a, threadH = lum(colors.handle) < 0.5 ? 0xe9dfc8 : 0x4a3a2a;
    const outer = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, metalness: 0, bumpMap: bump, bumpScale: 0.03, side: THREE.FrontSide });
    const lining = () => new THREE.MeshStandardMaterial({ color: 0xb8ab8e, roughness: 0.95, side: THREE.BackSide, vertexColors: true });
    const shade = (geo: any) => { const ps = geo.attributes.position, c: number[] = []; for (let k = 0; k < ps.count; k++) { const s = 0.38 + 0.62 * clamp(ps.getY(k) / H, 0, 1); c.push(s, s, s); } geo.setAttribute("color", new THREE.Float32BufferAttribute(c, 3)); return geo; };
    const V2 = (P: Pt[]) => P.map((q) => new THREE.Vector2(q[0], q[1]));
    const loop = (P: Pt[], col: number) => dashed([...P, P[0]].map((q) => [q[0], q[1], 0.05] as V3), col);
    for (const pn of A.panels) {
      if (pn.outline.length < 3) continue;
      const grp = new THREE.Group(), shape = new THREE.Shape(V2(pn.outline));
      pn.holes.forEach((h) => { if (h.length >= 3) shape.holes.push(new THREE.Path(V2(h))); });
      const geo = shade(new THREE.ShapeGeometry(shape)), m = dress(outer(colOf(pn.pid)), colOf(pn.pid), look?.tex?.[pn.pid]), mesh = new THREE.Mesh(geo, m);
      mesh.userData.piece = pn.pid; S.pick.push(mesh); grp.add(mesh, new THREE.Mesh(geo, lining()));
      const inset = offsetPolygon(pn.outline, -0.45); if (inset.length >= 3) grp.add(loop(inset, thread));
      pn.holes.forEach((h) => { const st = offsetPolygon(h, 0.5); if (st.length >= 3) grp.add(loop(st, thread)); });
      if (pn.side < 0) grp.rotation.y = Math.PI;
      add(pn.side > 0 ? "front" : "back", pn.pid, grp, [0, 0, (pn.side * D) / 2], [0, 0, pn.side * zOut], [m], null, pn.side > 0 ? "front" : "back");
    }
    A.sweeps.forEach((sw, i) => {
      if (sw.pts.length < 2) return;
      const grp = new THREE.Group(), geo = gussetGeo(sw.pts, D, H), m = dress(outer(colOf(sw.pid)), colOf(sw.pid), look?.tex?.[sw.pid]), mesh = new THREE.Mesh(geo, m);
      mesh.userData.piece = sw.pid; S.pick.push(mesh); grp.add(mesh, new THREE.Mesh(geo, lining()));
      const n = sw.pts.length, nv = sw.pts.map((_, k) => { const a = sw.pts[Math.max(0, k - 1)], b = sw.pts[Math.min(n - 1, k + 1)], t = norm(b[0] - a[0], b[1] - a[1]); return [t[1], -t[0]] as Pt; });
      if (D > 1.6) [D / 2 - 0.45, -(D / 2 - 0.45)].forEach((z) => grp.add(dashed(sw.pts.map((q, k) => [q[0] + nv[k][0] * 0.05, q[1] + nv[k][1] * 0.05, z] as V3), thread)));
      add(`sw${i}`, sw.pid, grp, [0, 0, 0], [sw.dir[0] * 8, sw.dir[1] * 8, 0], [m], null, A.kind === "pouch" ? "back" : "gusset");
    });
    let top = H;
    A.handles.forEach((h, i) => {
      const hd = buildHandle(h.a, h.b, h.len, h.w, h.tail, colors.handle, threadH);
      top = Math.max(top, hd.top); hd.mesh.userData.piece = h.pid; S.pick.push(hd.mesh);
      if (h.side < 0) hd.grp.rotation.y = Math.PI;
      add(`h${i}`, h.pid, hd.grp, [0, 0, (h.side * D) / 2], [0, 7, 0], [hd.mat], h.side > 0 ? "front" : h.side < 0 ? "back" : null, "handle");   // side 0 = สายพาดข้างถึงข้าง อยู่กึ่งกลางความหนา
    });
    A.behind.forEach((bh, i) => {
      const pg = new THREE.Group(), pgeo = new THREE.ShapeGeometry(new THREE.Shape(V2([[bh.x, bh.y], [bh.x + bh.w, bh.y], [bh.x + bh.w, bh.y + bh.h], [bh.x, bh.y + bh.h]])));
      const pm = new THREE.MeshStandardMaterial({ color: 0xd4ecf7, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.38, side: THREE.DoubleSide, depthWrite: false });
      const pmesh = new THREE.Mesh(pgeo, pm); pmesh.position.z = -0.18; pmesh.userData.piece = bh.pid; S.pick.push(pmesh); pg.add(pmesh);
      if (bh.side < 0) pg.rotation.y = Math.PI;
      add(`b${i}`, bh.pid, pg, [0, 0, (bh.side * D) / 2], [0, 0, -4.5 * bh.side], [pm], bh.side > 0 ? "front" : "back", "behind");
    });
    return top;
  };
  const setAssembly = (A: AssemblyOk, colors: BagColors) => {
    const was = S.mode; S.mode = "asm"; clear(); lights(false);
    const top = buildAsm(A, colors), D = A.depth;
    const vt = Math.min(top, Math.max(A.height * 2.2, 20));   // สายสะพายยาวไม่ดึงกล้องถอยจนกระเป๋าเล็ก
    S.target.set(0, vt * 0.47, 0); S.dist = Math.max(vt, A.width * 1.05, D) * 2.15;
    shadow.visible = true; shadow.scale.set(A.width * 1.7, Math.max(D, 3) * 2.6, 1);
    if (was !== "asm") view(VIEWS.iso, true);
    paint();
  };

  // ผ่าดูข้างใน: ตัดทุกอย่างที่อยู่เลยระนาบใกล้แผ่นหน้า (หรือแผ่นหลัง) ออกจากภาพ — แผ่นนอก + ซับในฝั่งนั้น + หูฝั่งนั้น
  const applyCut = () => {
    const c = (S.depth / 2) * 0.9;
    renderer.clippingPlanes = S.mode !== "sewn" || S.cut === "none" || !(S.depth > 0) ? []
      : [S.cut === "front" ? new THREE.Plane(new THREE.Vector3(0, 0, -1), c) : new THREE.Plane(new THREE.Vector3(0, 0, 1), c)];
    S.dirty = true;
  };
  // ── ภาพเย็บติดของกระดานวาด (lib/pattern-sewn): ตัวกระเป๋าจากตะเข็บเต็มขอบ + ชิ้นที่เย็บติด + ชิ้นที่ยังไม่เย็บ ──
  const setSewn = (sc: SewnScene, colors: BagColors, opt: { pieceColors?: Record<string, string>; seamColors?: string[]; pieceTex?: Record<string, PieceTex> }) => {
    const was = S.mode; S.mode = "sewn"; clear(); lights(false);
    const asmTop = sc.asm ? buildAsm(sc.asm, colors, undefined, { colors: opt.pieceColors, tex: opt.pieceTex }) : 0;   // สูงสุดของตัวกระเป๋ารวมหูจากจุดติด
    if (sc.lining) buildAsm(sc.lining.asm, colors, sc.lining);
    S.depth = sc.asm?.depth ?? sc.lining?.asm.depth ?? 0;
    const tone: Record<string, string> = { base: colors.body, flap: colors.body, hang: colors.handle, loop: colors.handle, patch: colors.body, loose: PAPER };
    const w = 2 * Math.max(Math.abs(sc.min[0]), Math.abs(sc.max[0])), d = 2 * Math.max(Math.abs(sc.min[2]), Math.abs(sc.max[2])), top = Math.max(sc.max[1], asmTop, 1);
    const lh = clamp(Math.max(w, top, 20) * 0.035, Math.min(1.3, Math.max(0.6, Math.max(w, top) * 0.06)), 3);   // กระเป๋าใบเล็ก (เช่น ทรงกลม 12 ซม.) ป้ายชื่อเล็กลงตาม
    const LA = sc.lining?.asm;
    const carrierOf = (on?: string, back?: boolean): string | null => {
      if (!on) return null;
      if (sc.asm && on === sc.asm.front) return back ? "back" : "front";   // ชิ้นที่เป็นทั้งแผ่นหน้าและแผ่นหลัง: ของบนแผ่นหลังไปกับแผ่นหลัง
      if (sc.asm && on === sc.asm.back) return "back";
      if (LA && on === LA.back) return "Lback";               // แผ่นหน้า/หลังของซับในเป็นชิ้นเดียวกัน = เกาะแผ่นหลัง (ตรงกับ lib/pattern-sewn)
      if (LA && on === LA.front) return "Lfront";
      return null;
    };
    sc.parts.forEach((p, i) => {
      if (p.tri.length < 3) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(p.pos, 3)); geo.setIndex(p.tri); geo.computeVertexNormals();
      const lin = p.layer === "lining" && p.kind !== "loose";
      const pcol = opt.pieceColors?.[p.pid] || (lin ? (p.kind === "base" ? LINING : LINING_PATCH) : tone[p.kind]);
      const m = dress(new THREE.MeshStandardMaterial({ color: pcol, roughness: lin ? 0.95 : 0.84, metalness: 0, side: THREE.DoubleSide }), pcol, opt.pieceTex?.[p.pid]);
      const mesh = new THREE.Mesh(geo, m); mesh.userData.piece = p.pid; S.pick.push(mesh);
      const grp = new THREE.Group(); grp.add(mesh);
      if (p.name && (p.kind !== "base" || !sc.asm)) { const tag = label(p.name, lh); tag.position.set(p.label[0], p.label[1] + (p.kind === "loose" ? 1.5 : 0), p.label[2]); grp.add(tag); }
      // ชิ้นที่เย็บติด = ขั้น "extra" (ยังไม่เย็บ/แยกชิ้น = ลอยขึ้น) และขยับตามแผ่นที่เกาะ · ชิ้นหลัก/ชิ้นวางแบน อยู่กับที่
      // ชิ้นที่เกาะอยู่กับซับใน = ไปกับซับในเสมอ (ไม่มีขั้นของตัวเอง)
      const ext = p.kind === "flap" || p.kind === "hang" || p.kind === "loop" || p.kind === "patch", car = carrierOf(p.on), onLining = !!car && car.startsWith("L");
      add(`sp${i}`, p.pid, grp, [0, 0, 0], ext && !onLining ? [0, 7, 0] : [0, 0, 0], [m], ext ? car : null, ext && !onLining ? "extra" : "front");
    });
    // เส้นตะเข็บ: ท่อเล็ก ๆ สีเดียวกับบนกระดาน (ยาวไม่เท่ากันและไม่ได้ตั้งใจ = แดง)
    const nc = opt.seamColors?.length ?? 0;
    sc.lines.forEach((ln, li) => {
      if (ln.pts.length < 2) return;
      const vs = ln.pts.map((q) => new THREE.Vector3(q[0], q[1], q[2]));
      const curve = vs.length === 2 ? new THREE.LineCurve3(vs[0], vs[1]) : new THREE.CatmullRomCurve3(vs, false, "centripetal");
      const col = ln.bad ? "#dc2626" : nc ? opt.seamColors![ln.idx % nc] : "#2563eb";
      const lg = new THREE.Group();
      lg.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, vs.length * 3), ln.bad ? 0.22 : 0.16, 6, false), new THREE.MeshBasicMaterial({ color: col })));
      add(`sl${li}`, "", lg, [0, 0, 0], [0, 0, 0], [], carrierOf(ln.on), "front");   // เส้นตะเข็บอยู่บนแผ่นที่เกาะ → ขยับตามแผ่นนั้น
    });
    // ช่องเจาะ (ซิป): ท่อสีส้มตามแนวช่อง บนแผ่นที่มันอยู่
    sc.marks.forEach((mk, mi) => {
      if (mk.kind === "hw" && mk.pts[0] && mk.n) {
        // อะไหล่บนชิ้น: โลหะชิ้นเล็กหันตามผิวชิ้น — หมุด/ตาไก่/แม่เหล็ก = จานกลม · ห่วง = วงแหวน · ตัวล็อก = แผ่นเหลี่ยม
        const sz = Math.max(0.4, mk.size ?? 1), metal = new THREE.MeshStandardMaterial({ color: mk.hw === "magnet" ? "#cbd5e1" : "#e3b93c", roughness: 0.42, metalness: 0.3 });   // โลหะจัดเกินจะดำ (ฉากไม่มีภาพสะท้อน) จึงใช้ค่ากลาง ๆ ให้เห็นสี
        const geo = mk.hw === "ring" ? new THREE.TorusGeometry(sz / 2, Math.max(0.12, sz * 0.08), 10, 28)
          : mk.hw === "eyelet" ? new THREE.TorusGeometry(sz / 2, Math.max(0.1, sz * 0.14), 10, 24)
          : mk.hw === "lock" ? new THREE.BoxGeometry(sz, sz * 0.6, 0.35)
          : new THREE.CylinderGeometry(sz / 2, sz / 2, mk.hw === "magnet" ? 0.3 : 0.22, 24);
        const mesh = new THREE.Mesh(geo, metal), nrm = new THREE.Vector3(mk.n[0], mk.n[1], mk.n[2]).normalize();
        mesh.quaternion.setFromUnitVectors(mk.hw === "rivet" || mk.hw === "magnet" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1), nrm);   // จานกลมตั้งแกน y · วงแหวน/แผ่น ตั้งแกน z
        mesh.position.set(mk.pts[0][0], mk.pts[0][1], mk.pts[0][2]);
        const g = new THREE.Group(); g.add(mesh); g.userData.hw = mk.hw;
        add(`sm${mi}`, "", g, [0, 0, 0], [0, 0, 0], [], carrierOf(mk.on, mk.back), "front");
        return;
      }
      if (mk.pts.length < 2) return;
      const vs = mk.pts.map((q) => new THREE.Vector3(q[0], q[1], q[2]));
      const curve = vs.length === 2 ? new THREE.LineCurve3(vs[0], vs[1]) : new THREE.CatmullRomCurve3(vs, false, "centripetal");
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, vs.length * 3), 0.3, 6, false), new THREE.MeshStandardMaterial({ color: "#c2410c", roughness: 0.6 })));
      add(`sm${mi}`, "", g, [0, 0, 0], [0, 0, 0], [], carrierOf(mk.on, mk.back), "front");
    });
    // งานขอบ: กุ๊น = แถบฟ้าตามขอบ · ซิป = เทปเข้ม + ฟันซิปสีเงินเรียงตามแนว (ชิ้นเดียววาดทีเดียวด้วย InstancedMesh)
    sc.finishes.forEach((fin, fi) => {
      if (fin.pts.length < 2) return;
      const vs = fin.pts.map((q) => new THREE.Vector3(q[0], q[1], q[2]));
      const curve = vs.length === 2 ? new THREE.LineCurve3(vs[0], vs[1]) : new THREE.CatmullRomCurve3(vs, false, "centripetal");
      const g = new THREE.Group();
      if (fin.kind === "bind") g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, vs.length * 3), 0.34, 8, false), new THREE.MeshStandardMaterial({ color: "#0ea5e9", roughness: 0.75 })));
      else {
        g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, vs.length * 3), 0.3, 8, false), new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.8 })));
        const L = curve.getLength(), count = Math.max(2, Math.min(400, Math.round(L / 0.7)));
        const teeth = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.78, 0.78), new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.35, metalness: 0.55 }), count);
        const mtx = new THREE.Matrix4(), quat = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), nrm = new THREE.Vector3(fin.n[0], fin.n[1], fin.n[2]);
        for (let k = 0; k < count; k++) {
          const u = (k + 0.5) / count, pos = curve.getPointAt(u), tan = curve.getTangentAt(u).normalize();
          const side = new THREE.Vector3().crossVectors(nrm, tan).normalize(), up = new THREE.Vector3().crossVectors(tan, side).normalize();
          quat.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tan, up, side));
          teeth.setMatrixAt(k, mtx.compose(pos, quat, one));
        }
        teeth.instanceMatrix.needsUpdate = true;
        g.add(teeth);
      }
      g.userData.finish = fin.kind;
      add(`sf${fi}`, "", g, [0, 0, 0], [0, 0, 0], [], carrierOf(fin.on, fin.back), "front");
    });
    applyCut();
    // กล้อง: เปลี่ยนเฉพาะเมื่อขนาดฉากเปลี่ยนมาก (ลากตะเข็บแล้วภาพไม่ขยับเข้าออก)
    // กล้องจัดตามตัวกระเป๋า: สายสะพายยาว ๆ ไม่ดึงกล้องถอยจนกระเป๋าเล็ก (ส่วนบนของสายอาจเลยกรอบ — ซูมออกดูได้) · ฉากเล็กมาก = ถอยอย่างน้อยเท่าฉาก 16 ซม.
    const vt = sc.bodyH > 0 ? Math.min(top, Math.max(sc.bodyH * 2.2, 20)) : top;
    const dist = Math.max(vt, w * 1.05, d * 1.05, 16) * 2, ty = vt * 0.46;
    if (was !== "sewn" || dist > S.dist * 1.02 || dist < S.dist * 0.82 || Math.abs(ty - S.target.y) > S.dist * 0.1) { S.target.set(0, ty, 0); S.dist = dist; }
    shadow.visible = true; shadow.scale.set(Math.max(w, 10) * 1.5, Math.max(d, 4) * 2.2, 1);
    if (was !== "sewn") view(VIEWS.iso, true);
    paint();
  };

  // ── จำลองวัสดุทิ้งตัว: ตาข่ายเดียว ผิวนอกสีวัสดุ ผิวในสีซับใน · ตำแหน่งจุดอ่านจากตัวจำลองทุกเฟรม ──
  const setSim = (sim: BagSim, colors: BagColors) => {
    const was = S.mode; S.mode = "sim"; clear(); lights(false);
    const M = sim.mesh, geo = new THREE.BufferGeometry(), attr = new THREE.BufferAttribute(sim.pos, 3);
    geo.setAttribute("position", attr);
    geo.setIndex(new THREE.BufferAttribute(M.n < 65535 ? Uint16Array.from(M.tri) : M.tri, 1));
    geo.computeVertexNormals();
    const outer = new THREE.MeshStandardMaterial({ color: colors.body, roughness: 0.82, metalness: 0, side: THREE.FrontSide });
    const lining = new THREE.MeshStandardMaterial({ color: 0xb8ab8e, roughness: 0.95, side: THREE.BackSide });
    const grp = new THREE.Group(); grp.add(new THREE.Mesh(geo, outer)); grp.add(new THREE.Mesh(geo, lining)); S.root.add(grp);
    const top = Math.max(M.height, 1);
    S.target.set(0, top * 0.45, 0); S.dist = Math.max(top, M.width * 1.05, M.depth) * 2.15;
    shadow.visible = true; shadow.scale.set(M.width * 1.7, Math.max(M.depth, 3) * 2.6, 1);
    if (was !== "sim") view(VIEWS.iso, true);
    simTick = () => {
      if (sim.settled()) return false;
      const moving = sim.advance(reduce ? 60 : 6);
      attr.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
      return moving;
    };
    S.dirty = true;
  };

  // ── เมาส์/นิ้ว ──
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let drag: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;
  const hit = (e: PointerEvent): string | null => {
    const r = el.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, S.ortho ? ocam : cam); const h = ray.intersectObjects(S.pick, false);
    return h.length ? (h[0].object.userData.piece as string) : null;
  };
  const onDown = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false }; try { el.setPointerCapture(e.pointerId); } catch { /* บางเบราว์เซอร์ */ } };
  const onMove = (e: PointerEvent) => {
    if (drag) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
      const mine = S.drag !== "orbit" && S.sel ? S.parts.filter((p) => p.id === S.sel) : [];
      if (mine.length) {   // ย้าย / หมุนชิ้นที่เลือก (ดูอย่างเดียว · รอบ G)
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (S.drag === "move") {
          const upp = (2 * S.dist * S.zoom * Math.max(1, 0.95 / cam.aspect) * Math.tan((16 * Math.PI) / 180)) / Math.max(1, el.clientHeight);
          const R: V3 = [Math.cos(S.az), 0, -Math.sin(S.az)], U: V3 = [-Math.cos(S.pol) * Math.sin(S.az), Math.sin(S.pol), -Math.cos(S.pol) * Math.cos(S.az)];
          for (const p of mine) p.off = [p.off[0] + (R[0] * dx - U[0] * dy) * upp, p.off[1] + (R[1] * dx - U[1] * dy) * upp, p.off[2] + (R[2] * dx - U[2] * dy) * upp];
        } else for (const p of mine) p.rot += dx * 0.012;
        for (const p of mine) S.moves[p.key] = { off: p.off, rot: p.rot };
        drag.x = e.clientX; drag.y = e.clientY; S.dirty = true; return;
      }
      S.az -= (e.clientX - drag.x) * 0.008; S.pol = clamp(S.pol - (e.clientY - drag.y) * 0.008, 0.08, 1.72); S.taz = S.az; S.tpol = S.pol;
      drag.x = e.clientX; drag.y = e.clientY; S.dirty = true; return;
    }
    const id = hit(e); if (id !== S.hl) { S.hl = id; paint(); }
  };
  const onUp = (e: PointerEvent) => { const d = drag; drag = null; if (d && !d.moved) onPick(hit(e)); };
  const onCancel = () => { drag = null; };
  const onLeave = () => { if (!drag && S.hl) { S.hl = null; paint(); } };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); S.zoom = clamp(S.zoom * Math.exp(e.deltaY * 0.001), 0.4, 2.6); S.dirty = true; };
  el.addEventListener("pointerdown", onDown); el.addEventListener("pointermove", onMove); el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onCancel); el.addEventListener("pointerleave", onLeave); el.addEventListener("wheel", onWheel, { passive: false });
  const size = () => { const w = host.clientWidth || 600, h = host.clientHeight || 400; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); S.dirty = true; };
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(size) : null;
  ro?.observe(host); size();

  let raf = 0;
  const loop = () => {
    if (S.dead) return;
    raf = requestAnimationFrame(loop);
    if (simTick && simTick()) S.dirty = true;   // โหมดจำลอง: วาดทุกเฟรมที่ยังขยับ (นิ่งแล้วคืน false ทันที ไม่กินแรง)
    if (!S.dirty) return;
    S.dirty = false;
    if (drawFrame(reduce ? 1 : 0.16)) S.dirty = true;
  };
  /** วาด 1 เฟรม — k = ความเร็วเข้าหาเป้า (1 = ถึงทันที) · คืน true = ยังเคลื่อนไหวอยู่ */
  const drawFrame = (k: number): boolean => {
    let anim = false, maxE = 0;
    for (const p of S.parts) {
      const te = target(p.join), tl = S.mode === "flat" && p.id === S.sel ? 1 : 0;
      if (Math.abs(te - p.e) > 0.003) { p.e += (te - p.e) * k; anim = true; } else p.e = te;
      if (Math.abs(tl - p.l) > 0.003) { p.l += (tl - p.l) * k; anim = true; } else p.l = tl;
      if (p.e > maxE) maxE = p.e;
    }
    for (const p of S.parts) {
      const c = p.carrier ? S.byKey[p.carrier] : null, ce = c ? c.e : 0, cd: V3 = c ? c.dir : [0, 0, 0];
      p.g.position.set(p.base[0] + p.dir[0] * p.e + cd[0] * ce + p.off[0], p.base[1] + p.dir[1] * p.e + cd[1] * ce + p.l * 3 + p.off[1], p.base[2] + p.dir[2] * p.e + cd[2] * ce + p.off[2]);
      if (p.rot || p.g.rotation.y !== p.r0) p.g.rotation.y = p.r0 + p.rot;
    }
    if (Math.abs(S.taz - S.az) > 0.002 || Math.abs(S.tpol - S.pol) > 0.002) { S.az += (S.taz - S.az) * k; S.pol += (S.tpol - S.pol) * k; anim = true; } else { S.az = S.taz; S.pol = S.tpol; }
    shadow.material.opacity = 0.5 * (1 - maxE);
    const dist = S.dist * S.zoom * Math.max(1, 0.95 / cam.aspect) * (1 + 0.5 * maxE);
    cam.position.set(S.target.x + dist * Math.sin(S.pol) * Math.sin(S.az), S.target.y + dist * Math.cos(S.pol), S.target.z + dist * Math.sin(S.pol) * Math.cos(S.az));
    cam.lookAt(S.target);
    if (S.ortho) {   // มุมกล้องตั้งฉาก: ขนาดเท่ากันทุกระยะ (เหมาะวัด/เทียบสัดส่วน)
      const hh = dist * Math.tan((16 * Math.PI) / 180);
      ocam.left = -hh * cam.aspect; ocam.right = hh * cam.aspect; ocam.top = hh; ocam.bottom = -hh; ocam.updateProjectionMatrix();
      ocam.position.copy(cam.position); ocam.lookAt(S.target);
    }
    if (S.dispFor !== S.root || S.dispKey !== S.disp) applyDisplay();
    if (S.refFor !== S.root || S.refKey !== `${S.ref}:${S.mode}`) placeRef();
    renderer.render(scene, S.ortho ? ocam : cam);
    return anim;
  };
  /** การแสดงผล: ทึบ / โครงเส้น / โปร่ง — จำค่าเดิมของวัสดุไว้ใน userData.d0 แล้วสลับกลับได้ */
  const applyDisplay = () => {
    S.root.traverse((o: any) => {
      if (!o.isMesh || !o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!m.userData.d0) m.userData.d0 = { t: !!m.transparent, o: m.opacity ?? 1, w: !!m.wireframe, dw: m.depthWrite !== false };
        const d0 = m.userData.d0, x = S.disp === "xray";
        m.wireframe = S.disp === "wire" ? true : d0.w; m.transparent = x ? true : d0.t; m.opacity = x ? Math.min(d0.o, 0.32) : d0.o; m.depthWrite = x ? false : d0.dw; m.needsUpdate = true;
      }
    });
    S.dispFor = S.root; S.dispKey = S.disp;
  };
  /** วัตถุเทียบขนาด: ตั้งข้างกระเป๋า (ชิ้นแบน = วางนอนข้างชิ้น) ขนาดจริงหน่วย ซม. + ป้ายชื่อ */
  const placeRef = () => {
    refG.traverse((o: any) => { o.geometry?.dispose(); if (o.material) { o.material.map?.dispose(); o.material.dispose(); } });
    while (refG.children.length) refG.remove(refG.children[0]);
    S.refFor = S.root; S.refKey = `${S.ref}:${S.mode}`;
    if (S.ref === "none") return;
    const R = REF_OBJ[S.ref], box = new THREE.Box3().setFromObject(S.root);
    if (box.isEmpty()) return;
    const flat = S.mode === "flat", gap = Math.max(3, (box.max.x - box.min.x) * 0.06);
    const geo = R.cyl ? new THREE.CylinderGeometry(R.w / 2, R.w / 2, R.h, 28) : new THREE.BoxGeometry(R.w, R.h, R.d);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: R.color, roughness: R.cyl ? 0.15 : 0.55, metalness: 0, transparent: !!R.cyl, opacity: R.cyl ? 0.65 : 1 }));
    if (flat) { if (R.cyl) mesh.rotation.z = Math.PI / 2; else mesh.rotation.x = -Math.PI / 2; mesh.position.set(box.max.x + gap + (R.cyl ? R.h : R.w) / 2, (R.cyl ? R.w : R.d) / 2, box.min.z + (R.cyl ? R.w : R.h) / 2); }
    else mesh.position.set(box.max.x + gap + R.w / 2, R.h / 2, 0);
    refG.add(mesh);
    const lb = label(t3(R), clamp((box.max.y - box.min.y) * 0.06, 1.4, 3.5)); lb.position.set(mesh.position.x, (flat ? R.d : R.h) + 2.5, mesh.position.z); refG.add(lb);
  };
  /** ส่งออกฉากตอนนี้เป็น GLB (เมตร) — เฉพาะชิ้นในฉาก ไม่รวมวัตถุเทียบขนาด/เงา/ป้าย */
  const exportGlb = (): ArrayBuffer | null => {
    try {
      S.root.updateMatrixWorld(true);
      const out: GlbMesh[] = [];
      S.root.traverse((o: any) => {
        if (!o.isMesh || o.isInstancedMesh || !o.visible || !o.geometry?.attributes?.position) return;
        const g = o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
        const m = Array.isArray(o.material) ? o.material[0] : o.material, c = m?.color, d0 = m?.userData?.d0;
        out.push({ name: String(o.userData.piece ?? (o.name || "part")), positions: Float32Array.from(g.attributes.position.array), normals: g.attributes.normal ? Float32Array.from(g.attributes.normal.array) : null,
          indices: g.index ? Uint32Array.from(g.index.array) : null, color: [c?.r ?? 0.8, c?.g ?? 0.8, c?.b ?? 0.8, d0 ? d0.o : m?.opacity ?? 1], doubleSided: m?.side !== THREE.FrontSide });
        g.dispose();
      });
      return out.length ? buildGlb(out, { scale: 0.01 }) : null;
    } catch { return null; }
  };
  /** ถ่ายภาพ: ตั้งมุมชั่วคราว → วาดทันที → คัดลอกลงพื้นขาว → คืนมุมเดิม (บนจอไม่กระโดด) */
  const snapshot = (v?: Pattern3DView | "back"): string | null => {
    const keep = [S.az, S.pol, S.taz, S.tpol, S.zoom];
    try {
      if (v) { const a = v === "back" ? [Math.PI - VIEWS.iso[0], VIEWS.iso[1]] : VIEWS[v]; S.az = S.taz = a[0]; S.pol = S.tpol = a[1]; S.zoom = 1; }
      drawFrame(1);
      const src = renderer.domElement as HTMLCanvasElement, c = document.createElement("canvas");
      c.width = src.width; c.height = src.height;
      const g = c.getContext("2d");
      if (!g || !src.width || !src.height) return null;
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(src, 0, 0);
      return c.toDataURL("image/jpeg", 0.92);
    } catch { return null; }
    finally { [S.az, S.pol, S.taz, S.tpol, S.zoom] = keep; S.dirty = true; }
  };
  loop();

  return {
    setFlat, setBag, setAssembly, setSim, setSewn, snapshot, exportGlb,
    setOrtho: (on) => { S.ortho = on; S.dirty = true; },
    setDisplay: (d) => { S.disp = d; S.dirty = true; },
    setRef: (r) => { S.ref = r; S.dirty = true; },
    setDrag: (m) => { S.drag = m; el.style.cursor = m === "orbit" ? "grab" : "move"; },
    resetMoves: () => { S.moves = {}; for (const p of S.parts) { p.off = [0, 0, 0]; p.rot = 0; } S.dirty = true; },
    wake: () => { S.dirty = true; },
    setJoined: (keys) => { S.joined = keys; S.dirty = true; },
    setCut: (cut) => {
      const was = S.cut; S.cut = cut;
      if (S.mode === "sewn" && cut !== was) { if (cut === "back") view([Math.PI - VIEWS.iso[0], VIEWS.iso[1]]); else if (was === "back") view(VIEWS.iso); }   // ผ่าด้านหลัง = หมุนไปมองจากข้างหลัง
      applyCut();
    },
    setSelected: (id) => { if (S.sel !== id) { S.sel = id; paint(); } },
    setExplode: (e) => { S.explode = clamp(e, 0, 1); S.dirty = true; },
    setView: (v) => view(S.mode === "flat" && v === "iso" ? FLAT_VIEW : VIEWS[v]),
    dispose: () => {
      S.dead = true; cancelAnimationFrame(raf); ro?.disconnect();
      el.removeEventListener("pointerdown", onDown); el.removeEventListener("pointermove", onMove); el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel); el.removeEventListener("pointerleave", onLeave); el.removeEventListener("wheel", onWheel);
      clear(); shadowTex.dispose(); bump.dispose(); shadow.geometry.dispose(); shadow.material.dispose(); renderer.dispose(); el.remove();
    },
  };
}

export function Pattern3D({ mode, pieces, threads, bag, assembly, sim, sewn, pieceColors, pieceTex, seamColors, cut = "none", simWake = 0, joined = null, colors, selected = null, onSelect, explode = 0, height = 420, className = "", saveName, onReady, volume = null }: {
  /** ความจุโดยประมาณ (ลิตร · รอบ G) — แสดงมุมล่างขวา · ไม่ส่ง = ไม่แสดง */
  volume?: number | null;
  /** ชื่อไฟล์ของปุ่ม "บันทึกรูป" (ไม่ต้องมีนามสกุล) — ไม่ส่ง = "ภาพ 3 มิติ" */
  saveName?: string;
  /** เรียกเมื่อฉากถูกวางแล้ว (ทุกครั้งที่ฉากเปลี่ยน) — ไว้ถ่ายภาพไปใช้ที่อื่น เช่น ใบสเปก */
  onReady?: (api: Pattern3DApi) => void;
  mode: "flat" | "bag" | "assembly" | "sim" | "sewn";
  /** mode="sewn": ฉากจาก buildSewn() ของ lib/pattern-sewn (ภาพเย็บติดของกระดานวาด) */
  sewn?: SewnScene | null;
  /** mode="sewn": สีของชิ้น (รหัสชิ้น → สี) ทับสีตั้งต้น · seamColors = สีของตะเข็บตามลำดับ (ชุดเดียวกับบนกระดาน) */
  pieceColors?: Record<string, string>;
  /** mode="sewn": ลายผ้าขนาดจริงของชิ้น (รหัสชิ้น → ลาย · รอบ G2) */
  pieceTex?: Record<string, PieceTex>;
  seamColors?: string[];
  /** mode="sewn": ผ่าดูข้างใน — ตัดฝั่งหน้าหรือฝั่งหลังของกระเป๋าออกจากภาพ (เห็นซับใน ช่องใส่ของ ช่องซิป) */
  cut?: Pattern3DCut;
  /** mode="sim": ตัวจำลองวัสดุทิ้งตัว (lib/pattern-sim createBagSim) — ตัวแสดงเดินตัวจำลองเองทุกเฟรมจนนิ่ง */
  sim?: BagSim | null;
  /** mode="sim": เปลี่ยนค่า = ปลุกให้เดินต่อ (หลัง setParams / reset) */
  simWake?: number;
  /** mode="assembly": ผลจาก assemble() ของ lib/pattern-assembly (ประกอบจากชิ้นจริง + ตะเข็บ) */
  assembly?: AssemblyOk | null;
  /** mode="assembly": ขั้นที่เย็บแล้ว เช่น ["handle","gusset"] — ชิ้นของขั้นที่ยังไม่เย็บจะแยกออก · null = ใช้ explode */
  joined?: string[] | null;
  /** mode="flat": ชิ้นบนโต๊ะ (พิกัดกระดานวาด ซม. · y ลง) */
  pieces?: Flat3DPiece[];
  /** mode="flat": ด้ายเย็บระหว่างขอบของชิ้น (ตะเข็บ) */
  threads?: Flat3DThread[];
  /** mode="bag": เรขาคณิตจาก bagGeometry */
  bag?: BagGeometry;
  colors?: BagColors;
  /** รหัสชิ้นที่เลือก (flat = pid · bag = ชนิดชิ้น เช่น "front") */
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  /** mode="bag": 0 = ประกอบ · 1 = แยกชิ้น */
  explode?: number;
  height?: number;
  className?: string;
}) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stage = useRef<Stage | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const onSelectRef = useRef(onSelect); onSelectRef.current = onSelect;
  const onReadyRef = useRef(onReady); onReadyRef.current = onReady;
  const tRef = useRef(t); tRef.current = t;
  // ── ตั้งค่าภาพ (รอบ G): มุมกล้อง · การแสดงผล · วัตถุเทียบขนาด · โหมดลาก ──
  const [opts, setOpts] = useState(false);
  const [ortho, setOrtho] = useState(false);
  const [disp, setDisp] = useState<Pattern3DDisplay>("solid");
  const [refObj, setRefObj] = useState<Pattern3DRef>("none");
  const [drag, setDrag] = useState<Pattern3DDrag>("orbit");
  const [moved, setMoved] = useState(false);
  /** ส่งออกโมเดลที่เห็นอยู่เป็นไฟล์ GLB (เปิดใน Blender / โปรแกรมดูโมเดล / มือถือ) */
  const saveGlb = () => {
    const buf = stage.current?.exportGlb();
    if (!buf) return;
    const url = URL.createObjectURL(new Blob([buf], { type: "model/gltf-binary" })), a = document.createElement("a");
    a.href = url; a.download = `${(saveName || "โมเดล 3 มิติ").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80)}.glb`;
    document.body.appendChild(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  /** บันทึกภาพที่เห็นอยู่เป็นไฟล์ JPG (มุมและการซูมตามที่ดูอยู่) */
  const saveImage = () => {
    const url = stage.current?.snapshot();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url; a.download = `${(saveName || "ภาพ 3 มิติ").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80)}.jpg`;
    document.body.appendChild(a); a.click(); a.remove();
  };

  useEffect(() => {
    let dead = false;
    loadThree().then((THREE) => {
      if (dead || !hostRef.current) return;
      try { stage.current = createStage(THREE, hostRef.current, (id) => onSelectRef.current?.(id), (r) => tRef.current(r.th, r.en)); setState("ready"); }
      catch { setState("error"); }
    }).catch(() => { if (!dead) setState("error"); });
    return () => { dead = true; stage.current?.dispose(); stage.current = null; };
  }, []);

  const col = colors ?? DEFAULT_COLORS;
  useEffect(() => {
    const s = stage.current; if (state !== "ready" || !s) return;
    if (mode === "sewn" && sewn) s.setSewn(sewn, col, { pieceColors, seamColors, pieceTex });
    else if (mode === "sim" && sim) s.setSim(sim, col);
    else if (mode === "assembly" && assembly) s.setAssembly(assembly, col);
    else if (mode === "bag" && bag) s.setBag(bag, col);
    else s.setFlat(pieces ?? [], threads ?? []);
    onReadyRef.current?.({ snapshot: (v) => stage.current?.snapshot(v) ?? null });
  }, [state, mode, bag, pieces, threads, assembly, sim, sewn, pieceColors, pieceTex, seamColors, col.body, col.handle]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (state === "ready") stage.current?.setCut(mode === "sewn" ? cut : "none"); }, [state, cut, mode]);
  useEffect(() => { if (state === "ready") stage.current?.wake(); }, [state, simWake]);
  useEffect(() => { if (state === "ready") stage.current?.setSelected(selected); }, [state, selected, mode, bag, pieces, assembly, sewn]);
  const joinedKey = joined ? joined.join(",") : null;
  useEffect(() => { if (state === "ready") stage.current?.setJoined(joined); }, [state, joinedKey]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (state === "ready") stage.current?.setExplode(explode); }, [state, explode]);
  useEffect(() => { if (state === "ready") stage.current?.setOrtho(ortho); }, [state, ortho]);
  useEffect(() => { if (state === "ready") stage.current?.setDisplay(disp); }, [state, disp]);
  useEffect(() => { if (state === "ready") stage.current?.setRef(refObj); }, [state, refObj]);
  useEffect(() => { if (state === "ready") stage.current?.setDrag(onSelect && mode !== "sim" ? drag : "orbit"); }, [state, drag, onSelect, mode]);

  const views: [Pattern3DView, string][] = [["iso", t("มุมเฉียง", "Angled")], ["front", t("ด้านหน้า", "Front")], ["side", t("ด้านข้าง", "Side")], ["top", t("มองจากบน", "Top")]];
  return (
    <div className={`relative overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-200 ${className}`} style={{ height }}>
      <div ref={hostRef} className="absolute inset-0" />
      {state !== "ready" && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-slate-500">
          {state === "loading" ? t("กำลังเปิดภาพ 3D…", "Opening the 3D view…") : t("เครื่องนี้เปิดภาพ 3D ไม่ได้ ส่วนอื่นยังใช้ได้ตามปกติ", "This device cannot show 3D. Everything else still works.")}
        </div>
      )}
      {state === "ready" && (
        <>
          <div className="absolute right-2 top-2 flex flex-wrap justify-end gap-1">
            {views.map(([v, lb]) => (
              <button key={v} type="button" onClick={() => stage.current?.setView(v)} className="h-6 rounded-full border border-slate-200 bg-white/90 px-2 text-[11px] text-slate-600 hover:border-blue-300 hover:text-blue-700">{lb}</button>
            ))}
            <button type="button" data-save-3d onClick={saveImage} title={t("บันทึกภาพที่เห็นอยู่เป็นไฟล์รูป JPG (มุมและการซูมตามที่ดูอยู่)", "Save the current view as a JPG image")} aria-label={t("บันทึกรูป", "Save image")}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2 text-[11px] text-slate-600 hover:border-blue-300 hover:text-blue-700"><Icon value="i:camera" className="text-[12px]" />{t("บันทึกรูป", "Save image")}</button>
          </div>
          <div className="absolute left-2 top-2 flex flex-col items-start gap-1" data-3d-options>
            <div className="flex gap-1">
              <button type="button" data-3d-opts onClick={() => setOpts(!opts)} aria-expanded={opts} className="inline-flex h-6 items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2 text-[11px] text-slate-600 hover:border-blue-300 hover:text-blue-700"><Icon value="i:adjustments" className="text-[12px]" />{t("ตั้งค่าภาพ", "View options")}</button>
              <button type="button" data-save-glb onClick={saveGlb} title={t("ส่งออกโมเดลที่เห็นอยู่เป็นไฟล์ GLB (หน่วยเมตร) เปิดใน Blender / CLO / โปรแกรมดูโมเดล", "Export the model you see as a GLB file (metres) for Blender / CLO / model viewers")} className="inline-flex h-6 items-center gap-1 rounded-full border border-slate-200 bg-white/90 px-2 text-[11px] text-slate-600 hover:border-blue-300 hover:text-blue-700"><Icon value="i:download" className="text-[12px]" />GLB</button>
            </div>
            {opts && (() => { const seg = (on: boolean) => `h-6 rounded-full border px-2 text-[11px] ${on ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"}`; return (
              <div className="w-60 space-y-1.5 rounded-lg border border-slate-200 bg-white/95 p-2 text-[11px] text-slate-600 shadow">
                <div className="flex flex-wrap items-center gap-1" data-3d-camera><span className="w-full text-slate-500">{t("มุมกล้อง", "Camera")}</span>
                  <button type="button" onClick={() => setOrtho(false)} className={seg(!ortho)}>{t("มีมิติ", "Perspective")}</button>
                  <button type="button" onClick={() => setOrtho(true)} className={seg(ortho)}>{t("ตั้งฉาก (วัดสัดส่วน)", "Orthographic")}</button></div>
                <div className="flex flex-wrap items-center gap-1" data-3d-display><span className="w-full text-slate-500">{t("การแสดงผล", "Display")}</span>
                  {([["solid", "ทึบ", "Solid"], ["wire", "โครงเส้น", "Wireframe"], ["xray", "โปร่ง", "X-ray"]] as [Pattern3DDisplay, string, string][]).map(([k, th, en]) => <button key={k} type="button" data-3d-disp={k} onClick={() => setDisp(k)} className={seg(disp === k)}>{t(th, en)}</button>)}</div>
                <label className="block space-y-0.5" data-3d-ref><span className="text-slate-500">{t("วัตถุเทียบขนาด (ขนาดจริง)", "Size reference (real size)")}</span>
                  <select value={refObj} onChange={(e) => setRefObj(e.target.value as Pattern3DRef)} className="h-7 w-full rounded-md border border-slate-200 bg-white px-1 text-[11px]">
                    <option value="none">{t("ไม่แสดง", "None")}</option>
                    {(Object.keys(REF_OBJ) as Exclude<Pattern3DRef, "none">[]).map((k) => <option key={k} value={k}>{t(REF_OBJ[k].th, REF_OBJ[k].en)} · {REF_OBJ[k].w} × {REF_OBJ[k].h} {t("ซม.", "cm")}</option>)}
                  </select></label>
                {onSelect && mode !== "sim" && <div className="flex flex-wrap items-center gap-1" data-3d-drag><span className="w-full text-slate-500">{t("ลากเมาส์เพื่อ (เลือกชิ้นก่อน · ดูอย่างเดียว)", "Drag to (select a piece first · view only)")}</span>
                  {([["orbit", "หมุนมุมมอง", "Orbit"], ["move", "ย้ายชิ้น", "Move piece"], ["turn", "หมุนชิ้น", "Turn piece"]] as [Pattern3DDrag, string, string][]).map(([k, th, en]) => <button key={k} type="button" data-3d-drag-mode={k} onClick={() => { setDrag(k); if (k !== "orbit") setMoved(true); }} className={seg(drag === k)}>{t(th, en)}</button>)}
                  {moved && <button type="button" onClick={() => { stage.current?.resetMoves(); setMoved(false); setDrag("orbit"); }} className="h-6 rounded-full px-2 text-[11px] text-blue-700 hover:underline">{t("คืนตำแหน่งชิ้น", "Reset pieces")}</button>}</div>}
              </div>
            ); })()}
          </div>
          {volume != null && volume > 0 && <div className="pointer-events-none absolute bottom-1.5 right-2 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-medium text-slate-700" data-3d-volume>{t(`ความจุประมาณ ${volume} ลิตร`, `About ${volume} L capacity`)}</div>}
          <div className="pointer-events-none absolute bottom-1.5 left-2 text-[11px] text-slate-500">{t("ลากเพื่อหมุน · ล้อเมาส์เพื่อซูม", "Drag to rotate · scroll to zoom")}</div>
        </>
      )}
    </div>
  );
}
