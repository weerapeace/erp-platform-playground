/**
 * ✂️ ภาพสรุป JPEG ของกระเป๋า 1 ใบ — ใช้ทั้งปุ่ม "โหลด JPEG" และหน้าพิมพ์ใบตัดผ้า (ตัววาดตัวเดียว)
 *   ส่วนบน: รูปกระเป๋า (ทรงที่จะตัดประกอบ) + ผ้าทั้งผืนพร้อมตำแหน่งชิ้น (ใบนี้มีสี+ป้าย A,B… · ใบอื่นเส้นประจาง)
 *   ส่วนกลาง: ชิ้นที่ตัดออกมาจากผ้าจริง (หมุนกลับตั้งตรงตามแบบ · สัดส่วนขนาดเท่ากันทุกชิ้น)
 *   ส่วนล่าง: คำอธิบายทีละชิ้น (ส่วนไหนของกระเป๋า · ขนาด · ตัดจากตรงไหนของผ้า) — lib/fabric-lay describePlaced
 *   รูป r2 ต้องโหลดแบบ crossOrigin (loadImageEl) ไม่งั้น toBlob พัง — docs/image-worker.md
 */
import { loadImageEl } from "@/components/image-crop-picker";
import { bagLetters, describePlaced, partLabel, polyBoxOf, sizeLabel, type LayPiece, type Placed, type M6 } from "@/lib/fabric-lay";
import type { Pt } from "@/lib/pattern-shape";

export type SummaryInput = {
  fabricUrl: string; W: number; H: number; fabricName: string; planName: string;
  bag: { key: string; label: string; color: string; name: string; image: string | null; note?: string | null; pieces: LayPiece[] };
  placed: Placed[];
};

const FONT = `"Sarabun", "Noto Sans Thai", Tahoma, sans-serif`;
const OUT_W = 2000, PAD = 48;

const mul = (A: M6, B: M6): M6 => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
const inv = (m: M6): M6 => { const [a, b, c, d, e, f] = m; const det = a * d - b * c || 1e-12; return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]; };
const ap = (m: M6, [u, v]: Pt): Pt => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]];

/** ตัดข้อความไทย/อังกฤษให้พอดีความกว้าง (ไทยไม่มีช่องว่าง → ตัดตามคำด้วย Intl.Segmenter ถ้ามี) */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const seg = typeof Intl !== "undefined" && "Segmenter" in Intl
    ? [...new (Intl as unknown as { Segmenter: new (l: string, o: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter("th", { granularity: "word" }).segment(text)].map((s) => s.segment)
    : [...text];
  const lines: string[] = [];
  let cur = "";
  for (const s of seg) {
    if (ctx.measureText(cur + s).width > maxW && cur) { lines.push(cur.trimEnd()); cur = s.trimStart(); }
    else cur += s;
  }
  if (cur) lines.push(cur);
  return lines;
}

function pathOf(ctx: CanvasRenderingContext2D, P: Pt[], m: (p: Pt) => Pt) {
  ctx.beginPath();
  P.forEach((p, i) => { const [x, y] = m(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.closePath();
}

/** กรอบแสดงชิ้น "ตั้งตรง แต่คงการพลิก" (ชิ้นคู่ที่พลิก = เห็นรูปทรงกลับด้าน ผ้าไม่กลับ — แบบที่ช่างเห็นตอนตัดจริง) */
function showFrame(p: Placed): { M: M6; shape: (q: Pt) => Pt } {
  const F: M6 = p.item.flip ? [-1, 0, 0, 1, p.local.w, 0] : [1, 0, 0, 1, 0, 0];
  return { M: mul(p.m, F), shape: (q) => ap(F, q) };
}

export async function renderBagSummary(inp: SummaryInput): Promise<HTMLCanvasElement> {
  const { W, H, bag } = inp;
  const mine = inp.placed.filter((p) => p.bag.key === bag.key);
  const letters = bagLetters(inp.placed, bag.key, bag.pieces);
  const order = [...mine].sort((a, b) => (letters.get(a.item.id) ?? "").localeCompare(letters.get(b.item.id) ?? "", "en", { numeric: true }));
  const [fab, bagImg] = await Promise.all([loadImageEl(inp.fabricUrl), bag.image ? loadImageEl(bag.image).catch(() => null) : Promise.resolve(null)]);

  // ── ขนาดส่วนต่าง ๆ ──
  const bagBox = 480;
  const fabW = OUT_W - PAD * 3 - bagBox, fabS = fabW / W, fabH = H * fabS;
  const top = 150, row1 = Math.max(bagBox + 40, fabH + 40);
  // ชิ้นที่ตัด: สเกลเดียวกันทุกชิ้น ให้ชิ้นใหญ่สุดสูง/กว้างไม่เกิน 520
  const maxSide = Math.max(1, ...order.map((p) => Math.max(p.local.w, p.local.h)));
  const pieceS = Math.min(520 / maxSide, 24);
  const cells: { p: Placed; x: number; y: number; w: number; h: number }[] = [];
  let cx = PAD, cy = 0, rowH = 0;
  for (const p of order) {
    const w = p.local.w * pieceS, h = p.local.h * pieceS;
    const cw = Math.max(w, 220);
    if (cx + cw > OUT_W - PAD && cx > PAD) { cx = PAD; cy += rowH + 70; rowH = 0; }
    cells.push({ p, x: cx, y: cy, w, h });
    cx += cw + 40; rowH = Math.max(rowH, h);
  }
  const piecesH = order.length ? cy + rowH + 70 : 0;

  const meas = document.createElement("canvas").getContext("2d")!;
  meas.font = `26px ${FONT}`;
  const descLines = order.flatMap((p) => wrap(meas, describePlaced(p, letters.get(p.item.id) ?? "", W, H), OUT_W - PAD * 2 - 20).map((t, i) => ({ t, first: i === 0 })));
  const noteLines = bag.note ? wrap(meas, `หมายเหตุแบบตัด: ${bag.note}`, OUT_W - PAD * 2) : [];
  const descH = (descLines.length + noteLines.length) * 38 + 90;

  const H_OUT = Math.round(top + row1 + 60 + piecesH + descH + PAD);
  const cv = document.createElement("canvas");
  cv.width = OUT_W; cv.height = H_OUT;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, OUT_W, H_OUT);
  ctx.textBaseline = "top";

  // ── หัว ──
  ctx.fillStyle = bag.color; ctx.fillRect(0, 0, 14, H_OUT);
  ctx.fillStyle = "#0f172a"; ctx.font = `bold 44px ${FONT}`;
  ctx.fillText(`${bag.label} · ${bag.name}`.slice(0, 80), PAD, 36);
  ctx.fillStyle = "#475569"; ctx.font = `28px ${FONT}`;
  ctx.fillText(`ผ้า: ${inp.fabricName} (${sizeLabel(W, H)}) · แผน: ${inp.planName} · ${mine.length} ชิ้น`, PAD, 94);

  // ── รูปกระเป๋า ──
  const by = top;
  ctx.fillStyle = "#f1f5f9"; ctx.fillRect(PAD, by, bagBox, bagBox);
  if (bagImg) {
    const k = Math.min(bagBox / bagImg.naturalWidth, bagBox / bagImg.naturalHeight);
    const w = bagImg.naturalWidth * k, h = bagImg.naturalHeight * k;
    ctx.drawImage(bagImg, PAD + (bagBox - w) / 2, by + (bagBox - h) / 2, w, h);
  } else { ctx.fillStyle = "#94a3b8"; ctx.font = `26px ${FONT}`; ctx.fillText("(ไม่มีรูปกระเป๋า)", PAD + 140, by + bagBox / 2 - 13); }
  ctx.fillStyle = "#334155"; ctx.font = `24px ${FONT}`;
  ctx.fillText("ทรงกระเป๋าที่จะตัดประกอบ", PAD, by + bagBox + 8);

  // ── ผ้าทั้งผืน + ตำแหน่งชิ้น ──
  const fx = PAD * 2 + bagBox, fy = top;
  ctx.drawImage(fab, fx, fy, fabW, fabH);
  ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
  for (let x = 10; x < W; x += 10) { ctx.beginPath(); ctx.moveTo(fx + x * fabS, fy); ctx.lineTo(fx + x * fabS, fy + fabH); ctx.stroke(); }
  for (let y = 10; y < H; y += 10) { ctx.beginPath(); ctx.moveTo(fx, fy + y * fabS); ctx.lineTo(fx + fabW, fy + y * fabS); ctx.stroke(); }
  const toFab = (q: Pt): Pt => [fx + q[0] * fabS, fy + q[1] * fabS];
  for (const p of inp.placed.filter((q) => q.bag.key !== bag.key)) {
    pathOf(ctx, p.cut, toFab); ctx.setLineDash([8, 6]); ctx.strokeStyle = "rgba(255,255,255,0.8)"; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
  }
  for (const p of mine) {
    pathOf(ctx, p.cut, toFab);
    ctx.fillStyle = `${bag.color}33`; ctx.fill();
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = bag.color; ctx.lineWidth = 3; ctx.stroke();
    const b = polyBoxOf(p.cut); const [lx, ly] = toFab([b.x + b.w / 2, b.y + b.h / 2]);
    const L = letters.get(p.item.id) ?? "";
    ctx.font = `bold 34px ${FONT}`; const tw = ctx.measureText(L).width;
    ctx.fillStyle = bag.color; ctx.beginPath(); ctx.arc(lx, ly, Math.max(24, tw / 2 + 12), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(L, lx, ly); ctx.textAlign = "left"; ctx.textBaseline = "top";
  }
  ctx.fillStyle = "#334155"; ctx.font = `24px ${FONT}`;
  ctx.fillText("ตำแหน่งชิ้นบนผ้า (เส้นตาราง = 10 ซม. · เส้นประขาว = ชิ้นของใบอื่น)", fx, fy + fabH + 8);

  // ── ชิ้นที่ตัดออกมา ──
  const py = top + row1 + 60;
  ctx.fillStyle = "#0f172a"; ctx.font = `bold 30px ${FONT}`;
  if (order.length) ctx.fillText("ชิ้นที่ตัดออกมา (ขนาดเทียบกันได้)", PAD, py - 44);
  const kx = W / fab.naturalWidth, ky = H / fab.naturalHeight;
  for (const c of cells) {
    const { M, shape } = showFrame(c.p);
    const ox = c.x, oy = py + c.y;
    ctx.save();
    pathOf(ctx, c.p.local.cut, (q) => { const [u, v] = shape(q); return [ox + u * pieceS, oy + v * pieceS]; });
    ctx.clip();
    // จุดภาพของรูปผ้า → ซม. บนผ้า → กรอบชิ้น (ย้อนการวาง) → จุดบนภาพสรุป
    const Mi = inv(M);
    const T = mul([pieceS, 0, 0, pieceS, ox, oy], mul(Mi, [kx, 0, 0, ky, 0, 0]));
    ctx.setTransform(T[0], T[1], T[2], T[3], T[4], T[5]);
    ctx.drawImage(fab, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.restore();
    const map = (q: Pt): Pt => { const [u, v] = shape(q); return [ox + u * pieceS, oy + v * pieceS]; };
    pathOf(ctx, c.p.local.cut, map); ctx.strokeStyle = bag.color; ctx.lineWidth = 3; ctx.stroke();
    if (c.p.piece.allow) { pathOf(ctx, c.p.local.sew, map); ctx.setLineDash([10, 6]); ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
    const L = letters.get(c.p.item.id) ?? "";
    ctx.fillStyle = "#0f172a"; ctx.font = `bold 28px ${FONT}`;
    ctx.fillText(`${L} · ${partLabel(c.p.piece.part)}`, ox, oy + c.h + 10);
    const sew = polyBoxOf(c.p.local.sew);
    ctx.fillStyle = "#475569"; ctx.font = `22px ${FONT}`;
    ctx.fillText(`${c.p.piece.name.slice(0, 26)} · ${sizeLabel(sew.w, sew.h)}`, ox, oy + c.h + 42);
  }

  // ── คำอธิบาย ──
  let ty = py + piecesH + 10;
  ctx.fillStyle = "#0f172a"; ctx.font = `bold 30px ${FONT}`;
  ctx.fillText("ชิ้นไหนคือตรงไหน", PAD, ty); ty += 50;
  ctx.font = `26px ${FONT}`;
  for (const l of descLines) { ctx.fillStyle = l.first ? "#0f172a" : "#334155"; ctx.fillText(l.t, PAD + (l.first ? 0 : 20), ty); ty += 38; }
  ctx.fillStyle = "#7c2d12";
  for (const l of noteLines) { ctx.fillText(l, PAD, ty); ty += 38; }
  return cv;
}

export const canvasToJpeg = (cv: HTMLCanvasElement, q = 0.9): Promise<Blob> =>
  new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("สร้างรูปไม่สำเร็จ"))), "image/jpeg", q));

/** รวมหลายภาพเป็นภาพยาวภาพเดียว (เว้นเส้นคั่น) */
export function stackCanvases(cvs: HTMLCanvasElement[]): HTMLCanvasElement {
  const gap = 24, w = Math.max(...cvs.map((c) => c.width)), h = cvs.reduce((s, c) => s + c.height, 0) + gap * (cvs.length - 1);
  const out = document.createElement("canvas"); out.width = w; out.height = h;
  const x = out.getContext("2d")!; x.fillStyle = "#e2e8f0"; x.fillRect(0, 0, w, h);
  let y = 0; for (const c of cvs) { x.drawImage(c, 0, y); y += c.height + gap; }
  return out;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
