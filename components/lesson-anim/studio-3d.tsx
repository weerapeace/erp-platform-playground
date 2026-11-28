"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- three.js โหลดจาก public/vendor ไม่มีไฟล์ชนิดข้อมูล (ดู lib/three-loader) */
/**
 * 🧊 จอกล้อง 3D ของสตูดิโอจำลอง (รอบ 2 · เจ้าของเลือกข้อ 6 · 2026-11-28)
 *   ใช้ตัวเลขเดียวกับจอ 2D (lib/studio-light → computeStudio) แต่ให้แสง/เงาเกิดจากรูปทรงจริง:
 *     - ไฟแต่ละดวง = สปอตไลต์ ณ ตำแหน่งจริง (มุมรอบ · มุมสูง · ระยะ) แสงจางตามระยะยกกำลังสอง → ฉากหลังมืดลงเองเมื่อตัวแบบห่างฉาก
 *     - ไฟนุ่ม = เงาฟุ้ง + แบ่งแสงไปจุดข้าง ๆ ตามขนาดตัวปรับแสง (แหล่งแสงใหญ่ "ห่อ" รอบตัวแบบ)
 *     - Flag = แผ่นบังจริง (กล้องมองไม่เห็น แต่บังแสงได้) · รีเฟล็ก = แสงสะท้อนจากทิศของแผ่น
 *     - แววตา / เงาสะท้อนบนกระเป๋าเงา = ภาพสะท้อนของตัวปรับแสงจริง (ทรงกลม / สี่เหลี่ยม / หน้าต่าง)
 *   วาดใหม่เฉพาะตอนค่าเปลี่ยน (ไม่วนวาดตลอด) · ไลบรารี 3D โหลดตอนเปิดครั้งแรก (lib/three-loader)
 *   เครื่องไม่รองรับ / โหลดไม่ได้ → onFail() ให้หน้าเรียกใช้สลับกลับไปจอ 2D
 * คู่มือ docs/studio-sim.md
 */
import { useEffect, useRef } from "react";
import { loadThree, type Three } from "@/lib/three-loader";
import { BACKDROPS, CONTROLS, MODIFIERS, SKIN, SUBJECTS, kelvinRgb, type StudioLight, type StudioResult, type StudioSetup } from "@/lib/studio-light";

type RGB = readonly number[];
const rad = (d: number) => (d * Math.PI) / 180;
const lin = (v: number) => Math.pow(Math.max(0, v) / 255, 2.2);
/** สีของแสงหลังหักไวต์บาลานซ์กล้อง (ค่าแบบเชิงเส้น · เกิน 1 ได้) */
const lightTint = (rgb: RGB, wb: RGB): [number, number, number] => [0, 1, 2].map((j) => lin(rgb[j]) / Math.max(0.02, lin(wb[j]))) as [number, number, number];
const MAX_SHADOWS = 4;

/** จุดเล็งไฟ + กรอบภาพตามชนิดตัวแบบ (เมตร) */
function framing(s: StudioSetup): { target: [number, number, number]; aim: [number, number, number]; frameH: number } {
  if (s.subject === "bag") {
    const h = s.bag.shape === "tote" ? 0.3 : s.bag.shape === "cross" ? 0.2 : 0.26;
    return { target: [0, h / 2, 0], aim: [0, h / 2, 0], frameH: h * 2.3 };
  }
  const head: [number, number, number] = [0, 1.62, 0];
  if (s.subject === "face") return { target: head, aim: head, frameH: 0.42 };
  if (s.subject === "half") return { target: [0, 1.32, 0], aim: head, frameH: 0.95 };
  return { target: [0, 0.96, 0], aim: head, frameH: 2.05 };
}

/** ตำแหน่งจริงของไฟ/แผ่น รอบจุดเล็ง (เหมือนผังบน + มุมมองด้านข้าง) */
const posAround = (aim: number[], a: number, h: number, d: number): [number, number, number] =>
  [aim[0] + d * Math.sin(rad(a)) * Math.cos(rad(h)), aim[1] + d * Math.sin(rad(h)), aim[2] + d * Math.cos(rad(a)) * Math.cos(rad(h))];

type Stage = { update: (s: StudioSetup, r: StudioResult) => void; resize: () => void; dispose: () => void };

function createStage(T: Three, canvas: HTMLCanvasElement, box: HTMLDivElement, onLost: () => void): Stage {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.physicallyCorrectLights = true;
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;   // PCF (ไม่ใช่ PCFSoft) เพื่อใช้ shadow.radius ทำเงาฟุ้งตามความนุ่มของไฟ
  const mobile = window.matchMedia?.("(pointer: coarse)").matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  const onCtxLost = (e: Event) => { e.preventDefault(); onLost(); };
  canvas.addEventListener("webglcontextlost", onCtxLost);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(30, 4 / 3, 0.05, 60);
  const PI = Math.PI;

  // ── ฉาก: พื้น + ผนังฉากหลัง (สีตามฉากที่เลือก)
  const sweepMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  const floor = new T.Mesh(new T.PlaneGeometry(14, 14), sweepMat);
  floor.rotation.x = -PI / 2; floor.receiveShadow = true; scene.add(floor);
  const wall = new T.Mesh(new T.PlaneGeometry(14, 7), sweepMat);
  wall.position.y = 3.5; wall.receiveShadow = true; scene.add(wall);

  // ── ภาพสะท้อนรอบตัวแบบ (สำหรับแววตา + ผิวเงา) — กล้อง 6 ทิศมองเห็นตัวปรับแสง (เลเยอร์ 1) ที่กล้องหลักมองไม่เห็น
  const cubeRT = new T.WebGLCubeRenderTarget(mobile ? 64 : 128, { generateMipmaps: true, minFilter: T.LinearMipmapLinearFilter });
  const cubeCam = new T.CubeCamera(0.05, 30, cubeRT);
  cubeCam.children.forEach((c: any) => c.layers.enable(1));
  scene.add(cubeCam);

  const ambient = new T.AmbientLight(0xffffff, 0);
  scene.add(ambient);

  // ── ตัวแบบ (สร้างใหม่เมื่อเปลี่ยนชนิด/ทรง/วัสดุ/สี)
  let subject: any = null; let subjectKey = "";
  const disposeTree = (o: any) => o.traverse((c: any) => {
    c.geometry?.dispose?.();
    const ms = Array.isArray(c.material) ? c.material : c.material ? [c.material] : [];
    ms.forEach((m: any) => { m.bumpMap?.dispose?.(); m.map?.dispose?.(); m.dispose?.(); });
  });
  const mesh = (g: any, m: any, x = 0, y = 0, z = 0) => { const o = new T.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o; };
  const srgb = (hex: string | number) => new T.Color(hex).convertSRGBToLinear();
  const rgbColor = (c: RGB) => new T.Color(c[0] / 255, c[1] / 255, c[2] / 255).convertSRGBToLinear();

  function weaveTexture() {
    const c = document.createElement("canvas"); c.width = c.height = 32;
    const x = c.getContext("2d")!;
    for (let i = 0; i < 32; i++) for (let j = 0; j < 32; j++) {
      const v = ((i >> 1) + (j >> 1)) % 2 ? 150 + ((i * 7 + j * 13) % 40) : 90 + ((i * 11 + j * 3) % 30);
      x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(i, j, 1, 1);
    }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(10, 10); return t;
  }

  function roundedBox(w: number, h: number, d: number, r: number) {
    const sh = new T.Shape(); const x = -w / 2 + r, y = -h / 2 + r, W = w - 2 * r, H = h - 2 * r;
    sh.moveTo(x, y - r); sh.lineTo(x + W, y - r); sh.quadraticCurveTo(x + W + r, y - r, x + W + r, y);
    sh.lineTo(x + W + r, y + H); sh.quadraticCurveTo(x + W + r, y + H + r, x + W, y + H + r);
    sh.lineTo(x, y + H + r); sh.quadraticCurveTo(x - r, y + H + r, x - r, y + H); sh.lineTo(x - r, y); sh.quadraticCurveTo(x - r, y - r, x, y - r);
    const bev = Math.min(r, d * 0.3);
    const g = new T.ExtrudeGeometry(sh, { depth: Math.max(0.005, d - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev * 0.8, bevelSegments: 5, curveSegments: 10 });
    g.translate(0, 0, -(d - bev * 2) / 2); g.computeVertexNormals();
    return g;
  }

  /** กล่องขอบมน + ด้านหน้า/หลังโป่งนิด ๆ (หนังกระเป๋าจริงไม่แบนเรียบ) → ผิวเงาสะท้อนตัวปรับแสงเป็นแถบไล่ระดับ */
  function softBox(w: number, h: number, d: number, r: number, bulge: number) {
    const g = new T.BoxGeometry(w, h, d, 28, 24, 8);
    const p = g.attributes.position, n = g.attributes.normal;
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const cl = (v: number, m: number) => Math.max(-m + r, Math.min(m - r, v));
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ix = cl(x, hw), iy = cl(y, hh), iz = cl(z, hd);
      let nx = x - ix, ny = y - iy, nz = z - iz; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
      const px = ix + nx * r, py = iy + ny * r;
      const ux = Math.max(0, 1 - (px / hw) ** 2), uy = Math.max(0, 1 - (py / hh) ** 2);
      const f = bulge * ux * uy;
      const pz = iz + nz * r + f * nz;
      const dfx = bulge * (-2 * px / (hw * hw)) * uy * nz, dfy = bulge * (-2 * py / (hh * hh)) * ux * nz;
      let mx = nx - dfx * Math.abs(nz), my = ny - dfy * Math.abs(nz), mz = nz; const M = Math.hypot(mx, my, mz) || 1; mx /= M; my /= M; mz /= M;
      p.setXYZ(i, px, py, pz); n.setXYZ(i, mx, my, mz);
    }
    p.needsUpdate = true; n.needsUpdate = true;
    return g;
  }

  function buildBag(s: StudioSetup) {
    const grp = new T.Group();
    const mat = s.bag.material;
    const base = { color: srgb(s.bag.color) };
    const body = mat === "gloss" ? new T.MeshPhysicalMaterial({ ...base, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, envMap: cubeRT.texture, envMapIntensity: 1.4 })
      : mat === "matte" ? new T.MeshStandardMaterial({ ...base, roughness: 0.62, metalness: 0, envMap: cubeRT.texture, envMapIntensity: 0.35 })
      : new T.MeshStandardMaterial({ ...base, roughness: 0.97, metalness: 0, bumpMap: weaveTexture(), bumpScale: 0.004 });
    const trim = new T.MeshStandardMaterial({ color: srgb(s.bag.color).multiplyScalar(0.55), roughness: mat === "gloss" ? 0.3 : 0.7 });
    const metal = new T.MeshStandardMaterial({ color: srgb("#d4b06a"), roughness: 0.25, metalness: 1, envMap: cubeRT.texture, envMapIntensity: 1.2 });
    if (s.bag.shape === "tote") {
      const w = 0.36, h = 0.3, d = 0.14;
      grp.add(mesh(softBox(w, h, d, 0.022, 0.03), body, 0, h / 2, 0));
      for (const sx of [-1, 1]) {
        const handle = mesh(new T.TorusGeometry(0.075, 0.009, 10, 32, PI), trim, sx * 0.0, h - 0.002, sx * 0.035);
        handle.position.x = 0; handle.position.z = sx * 0.04; grp.add(handle);
      }
    } else if (s.bag.shape === "cross") {
      const w = 0.27, h = 0.2, d = 0.08;
      grp.add(mesh(softBox(w, h, d, 0.018, 0.02), body, 0, h / 2, 0));
      const flap = mesh(roundedBox(w + 0.006, h * 0.58, 0.012, 0.02), body, 0, h * 0.7, d / 2 + 0.004); grp.add(flap);
      grp.add(mesh(new T.BoxGeometry(0.03, 0.022, 0.008), metal, 0, h * 0.44, d / 2 + 0.013));
      const strap = mesh(new T.TorusGeometry(0.3, 0.006, 8, 48, PI * 0.82), trim, 0, h, 0);
      strap.rotation.z = PI * 0.09; grp.add(strap);
    } else {
      const R = 0.13, d = 0.075;
      const cyl = new T.CylinderGeometry(R, R, d, 64, 1, false); cyl.rotateX(PI / 2);
      grp.add(mesh(cyl, body, 0, R, 0));
      const rim = mesh(new T.TorusGeometry(R, 0.006, 8, 64), trim, 0, R, d / 2); grp.add(rim);
      const rim2 = mesh(new T.TorusGeometry(R, 0.006, 8, 64), trim, 0, R, -d / 2); grp.add(rim2);
      grp.add(mesh(new T.TorusGeometry(0.07, 0.008, 10, 32, PI), trim, 0, R * 2 - 0.004, 0));
    }
    return grp;
  }

  function buildPerson(s: StudioSetup) {
    const grp = new T.Group();
    const skinRgb = SKIN[s.skin];
    const skin = new T.MeshStandardMaterial({ color: rgbColor(skinRgb), roughness: 0.52, metalness: 0, envMap: cubeRT.texture, envMapIntensity: 0.12 });
    const hairMat = new T.MeshStandardMaterial({ color: srgb("#2a1d16"), roughness: 0.45, metalness: 0 });
    const shirt = new T.MeshStandardMaterial({ color: srgb("#5b6472"), roughness: 0.85 });
    const pants = new T.MeshStandardMaterial({ color: srgb("#2d3440"), roughness: 0.9 });
    const lips = new T.MeshStandardMaterial({ color: rgbColor([skinRgb[0] * 0.86, skinRgb[1] * 0.68, skinRgb[2] * 0.68]), roughness: 0.4 });
    const sclera = new T.MeshPhysicalMaterial({ color: srgb("#cfc8bd"), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03, envMap: cubeRT.texture, envMapIntensity: 0.9 });
    const iris = new T.MeshPhysicalMaterial({ color: srgb("#24170f"), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02, envMap: cubeRT.texture, envMapIntensity: 1.6 });
    const browMat = new T.MeshStandardMaterial({ color: srgb("#2a1d16"), roughness: 0.8 });
    const head = new T.Group(); head.position.set(0, 1.62, 0); grp.add(head);
    // กะโหลก: ทรงไข่ คางแคบ
    const skull = new T.SphereGeometry(1, 56, 40);
    const p = skull.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const jaw = y < 0 ? 1 - 0.3 * y * y : 1;
      const flatBack = z < 0 ? 0.94 : 1;
      p.setXYZ(i, x * jaw * 0.078, y * 0.108, z * flatBack * (y < 0 ? 1 - 0.12 * y * y : 1) * 0.096);
    }
    skull.computeVertexNormals();
    head.add(mesh(skull, skin));
    const part = (sx: number, sy: number, sz: number, x: number, y: number, z: number, m = skin) => { const o = mesh(new T.SphereGeometry(1, 28, 20), m, x, y, z); o.scale.set(sx, sy, sz); head.add(o); return o; };
    part(0.011, 0.03, 0.02, 0, 0.0, 0.088);                            // สันจมูก
    part(0.016, 0.014, 0.017, 0, -0.026, 0.1);                         // ปลายจมูก
    for (const sx of [-1, 1]) {
      part(0.012, 0.024, 0.014, sx * 0.079, 0, -0.005);                // หู
      const eye = mesh(new T.SphereGeometry(0.0105, 24, 16), sclera, sx * 0.031, 0.012, 0.078); eye.scale.y = 0.62; head.add(eye);
      const ir = mesh(new T.SphereGeometry(0.0058, 20, 12), iris, sx * 0.031, 0.012, 0.0862); ir.scale.z = 0.45; head.add(ir);
      const brow = mesh(new T.SphereGeometry(1, 16, 8), browMat, sx * 0.032, 0.031, 0.093); brow.scale.set(0.018, 0.0032, 0.006); brow.rotation.z = sx * -0.12; head.add(brow);
    }
    part(0.02, 0.0055, 0.008, 0, -0.054, 0.088, lips);               // ปาก
    // ผม: ครอบด้านบน-หลัง
    const hairG = new T.SphereGeometry(1, 48, 24, 0, PI * 2, 0, PI * 0.6);
    const hair = mesh(hairG, hairMat, 0, 0.012, -0.014); hair.scale.set(0.085, 0.114, 0.103); hair.castShadow = false; hair.rotation.x = -0.62; head.add(hair);
    // คอ + ตัว (ทรงกลึง แบนหน้า-หลัง)
    grp.add(mesh(new T.CylinderGeometry(0.05, 0.058, 0.12, 24), skin, 0, 1.49, -0.012));
    const prof = [[0.0, 0.0], [0.15, 0.0], [0.16, 0.12], [0.15, 0.3], [0.165, 0.42], [0.2, 0.5], [0.19, 0.56], [0.06, 0.6], [0.0, 0.6]].map(([r, y]) => new T.Vector2(r, y));
    const torso = mesh(new T.LatheGeometry(prof, 40), shirt, 0, 0.86, 0); torso.scale.z = 0.62; grp.add(torso);
    for (const sx of [-1, 1]) {
      const sh = mesh(new T.SphereGeometry(0.055, 20, 14), shirt, sx * 0.175, 1.385, 0); grp.add(sh);
      const arm = mesh(new T.CylinderGeometry(0.042, 0.034, 0.58, 16), shirt, sx * 0.205, 1.09, 0); arm.rotation.z = sx * 0.08; grp.add(arm);
      grp.add(mesh(new T.SphereGeometry(0.038, 16, 12), skin, sx * 0.228, 0.77, 0));
      grp.add(mesh(new T.CylinderGeometry(0.075, 0.055, 0.86, 18), pants, sx * 0.085, 0.45, 0));
      grp.add(mesh(new T.BoxGeometry(0.09, 0.06, 0.24), pants, sx * 0.085, 0.03, 0.04));
    }
    return grp;
  }

  // ── ไฟ (เก็บไว้ตาม id เพื่อไม่สร้างเงาใหม่ทุกครั้งที่ลาก)
  type Rig = { spot: any; subs: any[]; panel: any; shapeKey: string };
  const rigs = new Map<string, Rig>();
  const extras = new T.Group(); scene.add(extras);   // รีเฟล็ก / V-flat / flag — สร้างใหม่ทุกครั้ง (เบา ไม่มีเงา)
  const panelMatCache: any[] = [];

  function panelGeometry(l: StudioLight) {
    const key = l.type === "window" && l.mod !== "diff" ? "window" : l.mod;
    const M = MODIFIERS[key]; const sz = M.size;
    if (M.shape === "rect") return new T.PlaneGeometry(sz * 0.75, sz * 1.1);
    if (M.shape === "strip") return new T.PlaneGeometry(sz * 0.45, sz * 2);
    if (M.shape === "round") return new T.CircleGeometry(sz / 2, key === "octa" ? 8 : 20);
    if (M.shape === "ring") return new T.RingGeometry(sz * 0.1, sz / 2, 32);
    if (M.shape === "window") {
      // หน้าต่าง 4 บาน (มีกรอบกลาง) → แววตาเห็นเป็นกรอบหน้าต่าง
      const w = sz * 0.36, h = sz * 0.5, gap = sz * 0.03; const parts: any[] = [];
      for (const ix of [-1, 1]) for (const iy of [-1, 1]) { const g = new T.PlaneGeometry(w, h); g.translate(ix * (w / 2 + gap), iy * (h / 2 + gap), 0); parts.push(g); }
      const merged = mergeGeoms(parts); parts.forEach((g) => g.dispose()); return merged;
    }
    return new T.CircleGeometry(Math.max(0.04, sz / 2), 16);
  }
  function mergeGeoms(gs: any[]) {
    const pos: number[] = []; const idx: number[] = []; let off = 0;
    for (const g of gs) {
      const p = g.attributes.position; for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
      const ix = g.index ? Array.from(g.index.array as ArrayLike<number>) : Array.from({ length: p.count }, (_, i) => i);
      ix.forEach((v) => idx.push(v + off)); off += p.count;
    }
    const out = new T.BufferGeometry(); out.setAttribute("position", new T.Float32BufferAttribute(pos, 3)); out.setIndex(idx); return out;
  }

  let raf = 0;
  const draw = () => {
    raf = 0;
    if (subject) subject.visible = false;
    cubeCam.update(renderer, scene);
    if (subject) subject.visible = true;
    renderer.render(scene, camera);
  };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

  function update(s: StudioSetup, r: StudioResult) {
    const fr = framing(s);
    const aim = fr.aim;
    const wb = r.wbRgb, ex = r.exposure;
    // ฉาก
    sweepMat.color.copy(rgbColor(BACKDROPS[s.backdrop].rgb));
    wall.position.z = -s.bgDist;
    // ตัวแบบ
    const sk = JSON.stringify([s.subject === "bag" ? s.bag : SUBJECTS[s.subject].person, s.skin]);
    if (sk !== subjectKey) {
      if (subject) { scene.remove(subject); disposeTree(subject); }
      subject = s.subject === "bag" ? buildBag(s) : buildPerson(s);
      scene.add(subject); subjectKey = sk;
    }
    cubeCam.position.set(aim[0], aim[1], aim[2] + (s.subject === "bag" ? 0.02 : 0.08));
    // กล้อง: เลนส์ (ฟูลเฟรม สูง 24 มม.) → มุมรับภาพ · ระยะถอยให้ตัวแบบเต็มกรอบเท่าเดิม (เลนส์ยาว = ถอยไกล ฉากหลังแคบลง)
    const fov = 2 * Math.atan(12 / s.lens);
    const dist = fr.frameH / 2 / Math.tan(fov / 2);
    camera.fov = (fov * 180) / PI;
    const t = fr.target;
    const cp = posAround(t, s.camA, s.camH, dist);
    camera.position.set(cp[0], Math.max(0.04, cp[1]), cp[2]);
    camera.lookAt(t[0], t[1], t[2]);
    camera.near = Math.max(0.03, dist * 0.05); camera.far = dist + 30;
    camera.updateProjectionMatrix();
    // ไฟห้อง/แสงสะท้อนรอบห้อง
    const amb = [0, 1, 2].map((j) => 1 / Math.max(0.02, lin(wb[j])) * lin(255));
    ambient.color.setRGB(amb[0], amb[1], amb[2]);
    ambient.intensity = r.fillFloor * ex * PI;

    // ไฟ: เรียงตามความแรง → 4 ดวงแรงสุดมีเงา (กันการ์ดจอมือถือเกินขีด)
    const lights = s.items.filter((i): i is StudioLight => i.kind === "light");
    const res = new Map(r.lights.map((l) => [l.id, l]));
    const rank = [...lights].sort((a, b) => (res.get(b.id)?.e ?? 0) - (res.get(a.id)?.e ?? 0)).map((l) => l.id);
    const alive = new Set(lights.map((l) => l.id));
    for (const [id, rg] of rigs) if (!alive.has(id)) {
      scene.remove(rg.spot, rg.spot.target, rg.panel, ...rg.subs); rg.spot.shadow.map?.dispose?.(); rg.panel.geometry.dispose(); rg.panel.material.dispose(); rigs.delete(id);
    }
    for (const l of lights) {
      const lr = res.get(l.id); if (!lr) continue;
      const key = l.type === "window" && l.mod !== "diff" ? "window" : l.mod;
      const M = MODIFIERS[key];
      let rg = rigs.get(l.id);
      const shapeKey = `${key}`;
      if (!rg) {
        const spot = new T.SpotLight(0xffffff, 1, 0, PI / 4, 0.5, 2);
        spot.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
        spot.shadow.bias = -0.0008; spot.shadow.normalBias = 0.02;
        spot.shadow.camera.near = 0.1; spot.shadow.camera.far = 20;
        scene.add(spot, spot.target);
        const subs = [0, 1].map(() => { const p = new T.PointLight(0xffffff, 0, 0, 2); scene.add(p); return p; });
        const pm = new T.MeshBasicMaterial({ color: 0xffffff, side: T.DoubleSide });
        panelMatCache.push(pm);
        const panel = new T.Mesh(panelGeometry(l), pm); panel.layers.set(1); scene.add(panel);
        rg = { spot, subs, panel, shapeKey }; rigs.set(l.id, rg);
      } else if (rg.shapeKey !== shapeKey) {
        rg.panel.geometry.dispose(); rg.panel.geometry = panelGeometry(l); rg.shapeKey = shapeKey;
      }
      const d = Math.max(0.3, l.d);
      const pos = posAround(aim, l.a, l.h, d);
      const tint = lightTint(lr.rgb, wb);
      const eU = lr.blocked ? lr.e / 0.06 : lr.e;          // flag บังด้วยรูปทรงจริงในภาพ 3D (ไม่หักซ้ำ)
      const I = eU * ex * d * d * PI;                       // ความแรงที่ทำให้ ณ ตัวแบบ = ค่าเดียวกับจอ 2D
      const softSplit = lr.soft > 0.22 ? Math.min(0.6, lr.soft * 0.7) : 0;
      rg.spot.color.setRGB(tint[0], tint[1], tint[2]);
      rg.spot.intensity = I * (1 - softSplit);
      rg.spot.position.set(...pos);
      rg.spot.target.position.set(aim[0], aim[1], aim[2]);
      rg.spot.angle = Math.min(rad(80), rad(M.spread));
      rg.spot.penumbra = key === "snoot" ? 0.25 : key === "grid" || key === "barn" ? 0.45 : 0.8;
      const shadowOn = rank.indexOf(l.id) < MAX_SHADOWS;
      rg.spot.castShadow = shadowOn;
      rg.spot.shadow.radius = 1 + lr.soft * 14;
      // แหล่งแสงใหญ่: แบ่งแสงไป 2 จุดที่ขอบตัวปรับแสง → เงาไล่นุ่ม แสงห่อรอบตัวแบบ
      const to = new T.Vector3(aim[0] - pos[0], aim[1] - pos[1], aim[2] - pos[2]).normalize();
      const vertical = M.shape === "rect" || M.shape === "strip" || M.shape === "window";
      const up = new T.Vector3(0, 1, 0);
      const side = new T.Vector3().crossVectors(to, up).normalize();
      const axis = vertical ? new T.Vector3().crossVectors(side, to).normalize() : side;
      const half = (M.shape === "strip" ? M.size : M.size * 0.55) * 0.5;
      rg.subs.forEach((p: any, i: number) => {
        const sg = i ? 1 : -1;
        p.position.set(pos[0] + axis.x * half * sg, pos[1] + axis.y * half * sg, pos[2] + axis.z * half * sg);
        p.color.setRGB(tint[0], tint[1], tint[2]);
        p.intensity = (I * softSplit) / 2;
      });
      // ตัวปรับแสง (เห็นในแววตา/ผิวเงา): หันหน้าเข้าหาตัวแบบ · สว่างตามความแรง
      rg.panel.position.set(...pos); rg.panel.lookAt(aim[0], aim[1], aim[2]);
      const glow = Math.min(1, 0.35 + eU * ex * 0.9) * (lr.blocked ? 0.5 : 1);
      const mx = Math.max(...tint);
      rg.panel.material.color.setRGB((tint[0] / mx) * glow, (tint[1] / mx) * glow, (tint[2] / mx) * glow);
    }

    // รีเฟล็ก / V-flat / flag
    while (extras.children.length) { const c = extras.children.pop(); disposeTree(c); }
    let bi = 0;
    for (const it of s.items) {
      if (it.kind === "light") continue;
      const p = posAround(aim, it.a, it.kind === "flag" ? 0 : -5, it.d);
      if (it.kind === "flag") {
        // แผ่นบัง: กล้องมองไม่เห็น (ไม่วาดสี) แต่บังแสงจริง
        const f = new T.Mesh(new T.PlaneGeometry(0.6, s.subject === "bag" ? 0.9 : 1.6), new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: T.DoubleSide }));
        f.position.set(p[0], s.subject === "bag" ? 0.45 : aim[1] - 0.2, p[2]); f.lookAt(aim[0], f.position.y, aim[2]); f.castShadow = true; extras.add(f);
        continue;
      }
      const C = CONTROLS[it.kind];
      const isV = it.kind === "vflat";
      const panel = new T.Mesh(isV ? new T.PlaneGeometry(1, 2) : new T.CircleGeometry(0.5, 32),
        new T.MeshBasicMaterial({ color: isV ? 0x000000 : rgbColor(C.k ? kelvinRgb(C.k) : [255, 255, 255]).multiplyScalar(it.kind === "refl-silver" ? 0.75 : 0.45), side: T.DoubleSide }));
      panel.position.set(p[0], isV ? Math.max(1, aim[1]) : p[1], p[2]); panel.lookAt(aim[0], panel.position.y, aim[2]); panel.layers.set(1); extras.add(panel);
      if (!isV) {
        const b = r.bounce[bi++];
        if (b && b.e > 0) {
          const dl = new T.DirectionalLight(0xffffff, b.e * ex * PI);
          const tt = lightTint(b.rgb, wb); dl.color.setRGB(tt[0], tt[1], tt[2]);
          dl.position.set(p[0], p[1], p[2]); dl.target.position.set(aim[0], aim[1], aim[2]);
          extras.add(dl, dl.target);
        }
      }
    }
    schedule();
  }

  function resize() {
    const w = box.clientWidth || 400;
    renderer.setSize(w, Math.round((w * 3) / 4), false);
    camera.aspect = 4 / 3; camera.updateProjectionMatrix();
    schedule();
  }

  function dispose() {
    if (raf) cancelAnimationFrame(raf);
    canvas.removeEventListener("webglcontextlost", onCtxLost);
    for (const rg of rigs.values()) { rg.spot.shadow.map?.dispose?.(); rg.panel.geometry.dispose(); }
    panelMatCache.forEach((m) => m.dispose());
    disposeTree(scene);
    cubeRT.dispose();
    renderer.dispose();
    renderer.forceContextLoss?.();
  }

  resize();
  return { update, resize, dispose };
}

/** มีการ์ดจอ 3D ไหม (ไม่ได้ = ใช้จอ 2D) */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

export function Studio3D({ s, r, onReady, onFail }: { s: StudioSetup; r: StudioResult; onReady?: () => void; onFail: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const latest = useRef({ s, r });
  latest.current = { s, r };
  const cbs = useRef({ onReady, onFail });
  cbs.current = { onReady, onFail };

  useEffect(() => {
    let alive = true; let ro: ResizeObserver | null = null;
    loadThree().then((T) => {
      if (!alive || !canvasRef.current || !boxRef.current) return;
      let st: Stage;
      try { st = createStage(T, canvasRef.current, boxRef.current, () => cbs.current.onFail()); }
      catch { cbs.current.onFail(); return; }
      stageRef.current = st;
      st.update(latest.current.s, latest.current.r);
      ro = new ResizeObserver(() => st.resize()); ro.observe(boxRef.current);
      requestAnimationFrame(() => alive && cbs.current.onReady?.());
    }).catch(() => alive && cbs.current.onFail());
    return () => { alive = false; ro?.disconnect(); stageRef.current?.dispose(); stageRef.current = null; };
  }, []);

  useEffect(() => { stageRef.current?.update(s, r); }, [s, r]);

  return (
    <div ref={boxRef} className="w-full overflow-hidden rounded-lg bg-slate-900">
      <canvas ref={canvasRef} className="block h-auto w-full" style={{ aspectRatio: "4 / 3" }} role="img" aria-label="ภาพจากกล้องแบบ 3 มิติ" />
    </div>
  );
}
