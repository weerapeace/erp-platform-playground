// สร้างไอคอน Lottie มาตรฐาน 16 ตัว → public/lottie/library/*.json (ทะเบียน lib/lottie-library.ts) · รัน: node scripts/gen-lottie-library.cjs
// กติกา: 100x100 · 30fps · 2 วินาที · เส้นหนา 6 ปลายมน · เฟรมแรก = ไอคอนครบ (โหมดชี้แล้วขยับนิ่งที่เฟรมแรก)
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "..", "public", "lottie", "library");
fs.mkdirSync(OUT, { recursive: true });

const FR = 30, OP = 60;
const S = (k) => ({ a: 0, k });
const E = { i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } };
// คีย์เฟรม: [[t, value], ...]
const A = (frames) => ({ a: 1, k: frames.map(([t, v], idx) => ({ t, s: Array.isArray(v) ? v : [v], ...(idx < frames.length - 1 ? E : {}) })) });
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]; };

const stroke = (c, w = 6) => ({ ty: "st", c: S(hex(c)), o: S(100), w: S(w), lc: 2, lj: 2, ml: 4 });
const fill = (c, o = 100) => ({ ty: "fl", c: S(hex(c)), o: S(o), r: 1 });
const ell = (x, y, w, h = w) => ({ ty: "el", d: 1, p: S([x, y]), s: S([w, h]) });
const rect = (x, y, w, h, r = 0) => ({ ty: "rc", d: 1, p: S([x, y]), s: S([w, h]), r: S(r) });
// เส้นตรงหลายจุด (เปิด/ปิด)
const poly = (pts, closed = false) => ({ ty: "sh", ks: S({ c: closed, v: pts, i: pts.map(() => [0, 0]), o: pts.map(() => [0, 0]) }) });
// เส้นโค้ง: [{v,i,o}]
const curve = (nodes, closed = false) => ({ ty: "sh", ks: S({ c: closed, v: nodes.map((n) => n.v), i: nodes.map((n) => n.i ?? [0, 0]), o: nodes.map((n) => n.o ?? [0, 0]) }) });
const trim = (s, e) => ({ ty: "tm", s, e, o: S(0), m: 1 });
const tr = ({ p = [0, 0], a = [0, 0], s = [100, 100], r = 0, o = 100 } = {}) => ({
  ty: "tr",
  p: p.a !== undefined ? p : S(p), a: S(a),
  s: s.a !== undefined ? s : S(s), r: typeof r === "object" ? r : S(r), o: typeof o === "object" ? o : S(o), sk: S(0), sa: S(0),
});
const group = (items, t = {}) => ({ ty: "gr", it: [...items, tr(t)] });
let ind = 0;
const layer = (shapes, ks = {}) => ({
  ddd: 0, ind: ++ind, ty: 4, sr: 1, ip: 0, op: OP, st: 0, bm: 0,
  ks: { o: ks.o ?? S(100), r: ks.r ?? S(0), p: ks.p ?? S([50, 50, 0]), a: ks.a ?? S([50, 50, 0]), s: ks.s ?? S([100, 100, 100]) },
  shapes,
});
const anim = (nm, layers) => { ind = 0; return { v: "5.7.4", fr: FR, ip: 0, op: OP, w: 100, h: 100, nm, ddd: 0, assets: [], layers: layers.reverse() }; };

const C = { violet: "#534AB7", teal: "#0F6E56", coral: "#D85A30", pink: "#D4537E", amber: "#BA7517", blue: "#185FA5", green: "#3B6D11", slate: "#5F5E5A" };

const icons = {};

// กติกา: เฟรมแรก = ไอคอนครบ (โหมด "ชี้แล้วขยับ" นิ่งที่เฟรมแรก) · จบรอบกลับมาเหมือนเฟรมแรก
// H = คีย์เฟรมแบบกระโดด (ไม่ไล่) — ใช้ "ลบแล้ววาดใหม่"
const AH = (frames) => ({ a: 1, k: frames.map(([t, v, hold], idx) => ({ t, s: Array.isArray(v) ? v : [v], ...(hold ? { h: 1 } : idx < frames.length - 1 ? E : {}) })) });
const dash = (d, g) => ({ ty: "st", c: null, d: [{ n: "d", nm: "d", v: S(d) }, { n: "g", nm: "g", v: S(g) }] });
const strokeD = (c, w, d, g) => ({ ...stroke(c, w), d: [{ n: "d", nm: "d", v: S(d) }, { n: "g", nm: "g", v: S(g) }, { n: "o", nm: "o", v: S(0) }] });

// ── 8 ตัวตามประเภทงาน ──

// ทำแบบตัด — กรรไกรตัดฉับ 2 ครั้ง ขยับไปข้างหน้า
{
  const c = C.violet;
  const snip = (dir) => A([[0, 0], [7, 24 * dir], [14, 0], [21, 24 * dir], [28, 0], [60, 0]]);
  const blade = (hy, ty, dir) => group([ell(28, hy, 18), poly([[35, hy + (ty > 50 ? -5 : 5)], [80, ty]]), stroke(c)], { p: [50, 50], a: [50, 50], r: snip(dir) });
  icons.cut = anim("cut", [layer([blade(32, 74, 1), blade(68, 26, -1)], { p: A([[0, [50, 50, 0]], [28, [56, 50, 0]], [44, [50, 50, 0]]]) })]);
}

// ทำบล็อก — 4 ช่องเด้งทีละช่อง
{
  const c = C.teal;
  const cell = (x, y, d) => group([rect(0, 0, 28, 28, 6), stroke(c)], { p: [x, y], s: A([[d, [100, 100]], [d + 6, [72, 72]], [d + 14, [106, 106]], [d + 20, [100, 100]]]) });
  icons.block = anim("block", [layer([cell(33, 33, 0), cell(67, 33, 6), cell(67, 67, 12), cell(33, 67, 18)])]);
}

// ทำแบบเย็บ — ตะเข็บประวิ่งตามเข็ม
{
  const c = C.coral;
  const seam = layer([group([poly([[12, 70], [88, 70]]), strokeD(c, 5, 8, 7), trim(S(0), AH([[0, 100, true], [1, 0], [40, 100]]))])]);
  const needle = layer([group([poly([[0, 0], [16, -34]]), ell(18, -39, 9, 12), stroke(c)], {
    p: AH([[0, [70, 70], true], [1, [12, 70]], [40, [88, 70]], [50, [70, 70]]]),
  })], { p: A([[0, [50, 50, 0]], [6, [50, 56, 0]], [12, [50, 50, 0]], [18, [50, 56, 0]], [24, [50, 50, 0]], [30, [50, 56, 0]], [36, [50, 50, 0]]]) });
  icons.sew = anim("sew", [seam, needle]);
}

// ทำแบบสกรีน — ยางปาดลากผ่านกรอบ หมึกตามมา
{
  const c = C.pink;
  const frame = layer([group([rect(50, 50, 64, 46, 6), stroke(c)])]);
  const ink = layer([group([rect(29, 0, 58, 40, 3), fill(c, 35)], { p: [21, 50], s: AH([[0, [100, 100], true], [1, [0, 100]], [34, [100, 100]]]) })]);
  const squeegee = layer([group([rect(0, 0, 7, 56, 3), fill(c)], { p: AH([[0, [80, 50], true], [1, [20, 50]], [34, [80, 50]]]) })]);
  icons.screen = anim("screen", [ink, frame, squeegee]);
}

// ทำแบบเลเซอร์ — สายฟ้าวาดใหม่แล้วกระพริบ
{
  const c = C.amber;
  icons.laser = anim("laser", [layer([group([
    poly([[57, 14], [33, 54], [50, 54], [43, 86], [68, 44], [51, 44], [57, 14]], true),
    stroke(c), trim(S(0), AH([[0, 100, true], [1, 0], [18, 100]])),
  ])], {
    s: A([[18, [100, 100, 100]], [24, [114, 114, 100]], [30, [100, 100, 100]]]),
    o: A([[18, 100], [22, 40], [26, 100], [30, 55], [34, 100]]),
  })]);
}

// เกรดไซซ์ — กรอบ 3 ขนาด หดแล้วขยายเป็นคลื่น
{
  const c = C.blue;
  const ring = (sz, d) => group([rect(0, 0, sz, sz, 6), stroke(c, 5)], { p: [50, 50], s: A([[d, [100, 100]], [d + 8, [70, 70]], [d + 18, [104, 104]], [d + 24, [100, 100]]]) });
  icons.grade = anim("grade", [layer([ring(22, 0), ring(46, 6), ring(72, 12)])]);
}

// แบบปัก — ดอกไม้หมุนแล้วบาน
{
  const c = C.green;
  const petal = (deg) => group([ell(0, -20, 16, 26), stroke(c, 5)], { r: deg });
  icons.emb = anim("emb", [layer([petal(0), petal(72), petal(144), petal(216), petal(288), group([ell(0, 0, 12), fill(c)])], {
    p: S([50, 50, 0]), a: S([0, 0, 0]), r: A([[0, 0], [40, 72], [60, 72]]),
    s: A([[0, [100, 100, 100]], [14, [86, 86, 100]], [34, [106, 106, 100]], [44, [100, 100, 100]]]),
  })]);
}

// อื่นๆ — จุด 3 จุดเด้งเป็นคลื่น
{
  const c = C.slate;
  const dot = (x, d) => group([ell(0, 0, 13), fill(c)], { p: A([[d, [x, 50]], [d + 8, [x, 36]], [d + 16, [x, 50]], [60, [x, 50]]]) });
  icons.other = anim("other", [layer([dot(28, 0), dot(50, 6), dot(72, 12)], { a: S([0, 0, 0]), p: S([0, 0, 0]) })]);
}

// ── 8 ตัวทั่วไป (ไว้ใช้กับประเภทงานที่เพิ่มเอง) ──

// ตรวจ / อนุมัติ — วงกลม + เครื่องหมายถูกวาดใหม่
{
  const c = C.green;
  icons.check = anim("check", [layer([
    group([ell(50, 50, 72), stroke(c)]),
    group([poly([[34, 51], [45, 62], [67, 39]]), stroke(c, 7), trim(S(0), AH([[0, 100, true], [1, 0], [20, 100]]))]),
  ], { s: A([[20, [100, 100, 100]], [26, [110, 110, 100]], [32, [100, 100, 100]]]) })]);
}

// กล่อง / แพ็ก — ฝากล่องเด้ง
{
  const c = C.amber;
  const body = group([rect(50, 62, 60, 38, 4), poly([[50, 43], [50, 81]]), stroke(c)]);
  const lid = group([rect(0, 0, 68, 12, 4), stroke(c)], { p: A([[0, [50, 36]], [8, [50, 24]], [16, [50, 36]], [22, [50, 31]], [28, [50, 36]]]) });
  icons.box = anim("box", [layer([body, lid])]);
}

// วาด / สเก็ตช์ — ดินสอขีดเส้น
{
  const c = C.violet;
  const line = layer([group([curve([{ v: [16, 82], o: [14, -10] }, { v: [50, 76], i: [-12, 6], o: [12, -6] }, { v: [84, 80], i: [-12, -6] }]), stroke(c, 5), trim(S(0), AH([[0, 100, true], [1, 0], [36, 100]]))])]);
  const pencil = layer([group([poly([[0, 0], [-6, -14], [24, -44], [30, -38], [0, 0]], true), poly([[-6, -14], [4, -6]]), stroke(c)], {
    p: AH([[0, [84, 78], true], [1, [18, 80]], [18, [50, 74]], [36, [84, 78]]]),
  })]);
  icons.pencil = anim("pencil", [line, pencil]);
}

// ถ่ายรูป — กล้อง + แฟลช
{
  const c = C.blue;
  const cam = group([rect(50, 56, 70, 46, 8), poly([[36, 33], [42, 24], [58, 24], [64, 33]]), ell(50, 56, 22), stroke(c)]);
  const flash = group([ell(50, 56, 22), fill(c, 100)], { o: A([[0, 0], [6, 0], [9, 90], [16, 0]]), s: A([[6, [60, 60]], [16, [140, 140]]]), p: [0, 0] });
  icons.camera = anim("camera", [layer([flash, cam], { s: A([[6, [100, 100, 100]], [10, [94, 94, 100]], [16, [100, 100, 100]]]) })]);
}

// เอกสาร / สเปก — บรรทัดเขียนทีละบรรทัด
{
  const c = C.slate;
  const lineAt = (y, w, d) => group([poly([[34, y], [34 + w, y]]), stroke(c, 5), trim(S(0), AH([[0, 100, true], [d, 0, true], [d + 1, 0], [d + 10, 100]]))]);
  icons.doc = anim("doc", [layer([
    group([poly([[26, 14], [62, 14], [76, 28], [76, 86], [26, 86]], true), stroke(c)]),
    lineAt(40, 32, 0), lineAt(54, 32, 8), lineAt(68, 20, 16),
  ])]);
}

// ป้าย / แท็ก — แกว่ง
{
  const c = C.pink;
  icons.tag = anim("tag", [layer([group([
    poly([[50, 14], [74, 38], [74, 84], [26, 84], [26, 38]], true), ell(50, 36, 10), stroke(c),
  ])], { a: S([50, 14, 0]), p: S([50, 14, 0]), r: A([[0, 0], [8, 14], [18, -10], [28, 6], [36, -2], [42, 0]]) })]);
}

// สี / พาเลต — จุดสีเด้ง
{
  const c = C.coral;
  const spot = (x, y, d) => group([ell(0, 0, 11), fill(c)], { p: [x, y], s: A([[d, [100, 100]], [d + 6, [150, 150]], [d + 12, [100, 100]]]) });
  icons.palette = anim("palette", [layer([
    group([curve([{ v: [50, 14], i: [20, 0], o: [-20, 0] }, { v: [14, 50], i: [0, -20], o: [0, 20] }, { v: [50, 86], i: [-20, 0], o: [10, 0] }, { v: [58, 72], i: [0, 8], o: [0, -8] }, { v: [74, 62], i: [-8, 0], o: [8, 0] }, { v: [86, 48], i: [0, 8], o: [0, -20] }], true), stroke(c)]),
    spot(36, 40, 0), spot(52, 30, 6), spot(68, 40, 12), spot(34, 60, 18),
  ])]);
}

// ชั้นงาน / ซ้อนแบบ — 3 ชั้นซ้อนเลื่อน
{
  const c = C.teal;
  const layerShape = (y, d) => group([poly([[0, -14], [34, 0], [0, 14], [-34, 0]], true), stroke(c, 5)], { p: A([[d, [50, y]], [d + 8, [50, y - 8]], [d + 16, [50, y]]]) });
  icons.layers = anim("layers", [layer([layerShape(66, 12), layerShape(50, 6), layerShape(34, 0)])]);
}
for (const [k, v] of Object.entries(icons)) fs.writeFileSync(path.join(OUT, `${k}.json`), JSON.stringify(v));

console.log(Object.keys(icons).map((k) => `${k}:${fs.statSync(path.join(OUT, `${k}.json`)).size}B`).join(" "));
