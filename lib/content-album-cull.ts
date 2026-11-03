/**
 * ช่วยคัดรูปในอัลบั้ม Contents (ของกลาง · pure → ใช้ได้ทั้งหน้าจอและ test) — ไม่ใช้ AI ข้างนอก ไม่มีค่าใช้จ่าย
 *
 *   อาจเบลอ  = ความคม (variance ของ Laplacian บนรูปขาวดำย่อ) ต่ำกว่า BLUR_RATIO เท่าของค่ากลางในอัลบั้ม
 *              เทียบกันเองในอัลบั้ม (ถ่ายชุดเดียวกัน แสง/ฉากใกล้กัน) แทนเกณฑ์ตายตัว · รูปน้อยกว่า MIN_FOR_BLUR = ไม่ตัดสิน
 *   รูปคล้าย = ลายนิ้วมือหน้าตา (assets.phash · lib/image-hash) ห่างกันไม่เกิน LOOK_ALIKE_BITS บิต → จัดกลุ่ม (ถ่ายรัวท่าเดียวกัน)
 *   แนะนำเก็บ = ไม่เบลอ + กลุ่มละ 1 รูปที่คมที่สุด (เท่ากัน = รูปใหญ่กว่า)
 */
import { lookBitsApart } from "@/lib/image-hash";

export const BLUR_RATIO = 0.4;
export const MIN_FOR_BLUR = 4;
export const LOOK_ALIKE_BITS = 6;

/** ความคมของรูปขาวดำ (ค่าความสว่าง 0–255 ทีละพิกเซล) — ยิ่งมากยิ่งคม · รูปเล็กเกิน = 0 */
export function laplacianVariance(gray: ArrayLike<number>, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const v = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += v; sumSq += v * v; n++;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** รูปที่อาจเบลอ (id) — เทียบกับค่ากลางของอัลบั้ม */
export function flagBlurry(items: { id: string; score: number | null }[], ratio = BLUR_RATIO): Set<string> {
  const scored = items.filter((x): x is { id: string; score: number } => x.score != null && Number.isFinite(x.score));
  if (scored.length < MIN_FOR_BLUR) return new Set();
  const cut = median(scored.map((x) => x.score)) * ratio;
  return new Set(scored.filter((x) => x.score < cut).map((x) => x.id));
}

/** จัดกลุ่มรูปคล้าย (กลุ่มละ ≥ 2 รูป · เรียงตามลำดับที่ส่งมา) */
export function groupLookAlike(items: { id: string; phash: string | null }[], maxBits = LOOK_ALIKE_BITS): string[][] {
  const xs = items.filter((x): x is { id: string; phash: string } => !!x.phash && /^[0-9a-f]+$/i.test(x.phash));
  const parent = xs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < xs.length; i++)
    for (let j = i + 1; j < xs.length; j++)
      if (xs[i].phash.length === xs[j].phash.length && lookBitsApart(xs[i].phash, xs[j].phash) <= maxBits) parent[find(j)] = find(i);
  const groups = new Map<number, string[]>();
  xs.forEach((x, i) => { const r = find(i); (groups.get(r) ?? groups.set(r, []).get(r)!).push(x.id); });
  return [...groups.values()].filter((g) => g.length > 1);
}

export type CullItem = { id: string; score: number | null; phash: string | null; area: number };
export type CullResult = { blurry: string[]; groups: string[][]; keep: string[] };

/** ผลคัดรูปทั้งอัลบั้ม — keep = รูปที่แนะนำให้ "เลือกใช้" */
export function cullAlbum(items: CullItem[]): CullResult {
  const blurry = flagBlurry(items);
  const groups = groupLookAlike(items);
  const byId = new Map(items.map((x) => [x.id, x]));
  const better = (a: CullItem, b: CullItem) => ((b.score ?? -1) - (a.score ?? -1)) || (b.area - a.area);
  const drop = new Set<string>(blurry);
  for (const g of groups) {
    const members = g.map((id) => byId.get(id)!).filter((x) => !blurry.has(x.id)).sort(better);
    const best = members[0]?.id ?? [...g].map((id) => byId.get(id)!).sort(better)[0].id;
    for (const id of g) if (id !== best) drop.add(id);
  }
  return { blurry: [...blurry], groups, keep: items.filter((x) => !drop.has(x.id)).map((x) => x.id) };
}
