/**
 * 📏 หน่วยความยาว (ของกลาง) — แปลง/แสดง/อ่านค่าความยาวที่พิมพ์ เช่น "7 mm" · "0.7 cm" · "1 in" · "260/2" · "(26+2)*2"
 *   ข้อมูลจริงเก็บเป็น ซม. เสมอ — หน่วยเป็นแค่ "การแสดง" เปลี่ยนหน่วยแล้วขนาดจริงไม่เปลี่ยน
 *   ตัวอ่านเขียนเอง (ไม่ใช้ eval / new Function) รับเฉพาะ ตัวเลข · หน่วย · + − × ÷ · วงเล็บ
 *   ตัวเลขที่ไม่มีหน่วย = หน่วยตั้งต้นของช่อง (หน่วยที่แสดงอยู่) · คูณ/หารด้วยตัวเลขเปล่า = ตัวคูณ (260/2 = ครึ่งหนึ่งของ 260)
 *
 *   parseLength("260/2", "mm") → { ok: true, cm: 13 }
 *   formatLength(13, "mm") → "130 มม." · formatLength(13, "mm", { label: false }) → "130"
 * ใช้ที่: สตูดิโอแพทเทิร์น (ShapeEditor · แผงตรวจแบบ) · คู่มือ docs/pattern-studio.md
 */
export type LengthUnit = "mm" | "cm" | "in";
export const LENGTH_UNITS: { key: LengthUnit; th: string; en: string }[] = [
  { key: "mm", th: "มม.", en: "mm" },
  { key: "cm", th: "ซม.", en: "cm" },
  { key: "in", th: "นิ้ว", en: "in" },
];
const CM_PER: Record<LengthUnit, number> = { mm: 0.1, cm: 1, in: 2.54 };
/** ทศนิยมที่แสดงต่อหน่วย (มม. 0.1 · ซม. 0.01 · นิ้ว 0.001 ≈ ละเอียดใกล้กันทุกหน่วย) */
const DIGITS: Record<LengthUnit, number> = { mm: 1, cm: 2, in: 3 };

export const isLengthUnit = (v: unknown): v is LengthUnit => v === "mm" || v === "cm" || v === "in";
export const toUnit = (cm: number, u: LengthUnit): number => cm / CM_PER[u];
export const fromUnit = (v: number, u: LengthUnit): number => v * CM_PER[u];
export const unitLabel = (u: LengthUnit, lang: "th" | "en" = "th"): string => { const x = LENGTH_UNITS.find((k) => k.key === u)!; return lang === "en" ? x.en : x.th; };

/** ตัวเลขในหน่วยที่เลือก (ไม่มีศูนย์ท้าย) — label: "th" | "en" = ต่อท้ายชื่อหน่วย · false = ตัวเลขล้วน (ใส่ในช่องพิมพ์) */
export function formatLength(cm: number, u: LengthUnit, opts: { label?: "th" | "en" | false; digits?: number } = {}): string {
  if (!Number.isFinite(cm)) return "—";
  const d = opts.digits ?? DIGITS[u];
  const v = Number(toUnit(cm, u).toFixed(d));
  const num = opts.label === false ? String(Object.is(v, -0) ? 0 : v) : v.toLocaleString("th-TH", { maximumFractionDigits: d });
  return opts.label === false ? num : `${num} ${unitLabel(u, opts.label ?? "th")}`;
}

export type LengthParse = { ok: true; cm: number } | { ok: false; th: string; en: string };
type Val = { v: number; len: boolean };   // len = มีหน่วยแล้ว (v เป็น ซม.) · false = ตัวเลขเปล่า
const UNIT_WORDS: [RegExp, LengthUnit][] = [[/^(mm|มม\.?|มิล(ลิเมตร)?)/, "mm"], [/^(cm|ซม\.?|เซน(ติเมตร)?)/, "cm"], [/^(in(ch(es)?)?|"|นิ้ว)/, "in"]];
const fail = (th: string, en: string): LengthParse => ({ ok: false, th, en });

/** อ่านค่าความยาวที่พิมพ์ → ซม. (ไม่ใช้ eval) · ผิดรูปแบบ = ข้อความบอกว่าผิดตรงไหน */
export function parseLength(text: string, defaultUnit: LengthUnit): LengthParse {
  const src = String(text ?? "").trim().toLowerCase().replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (!src) return fail("พิมพ์ความยาวก่อน", "Enter a length");
  if (src.length > 80) return fail("ข้อความยาวเกินไป", "Too long");
  // แยกคำ: ตัวเลข · หน่วย · เครื่องหมาย
  type Tok = { k: "num"; v: number } | { k: "unit"; u: LengthUnit } | { k: "op"; o: string };
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const sp = /^\s+/.exec(rest); if (sp) { i += sp[0].length; continue; }
    const num = /^(\d+(\.\d*)?|\.\d+)/.exec(rest); if (num) { toks.push({ k: "num", v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const uw = UNIT_WORDS.map(([re, u]) => [re.exec(rest), u] as const).find(([m]) => m);
    if (uw && uw[0]) { toks.push({ k: "unit", u: uw[1] }); i += uw[0][0].length; continue; }
    if ("+-*/()".includes(rest[0])) { toks.push({ k: "op", o: rest[0] }); i++; continue; }
    return fail(`อ่านไม่ออกตรง "${rest.slice(0, 6)}"`, `Can't read "${rest.slice(0, 6)}"`);
  }
  let p = 0;
  const peek = () => toks[p];
  const isOp = (o: string) => { const x = toks[p]; return !!x && x.k === "op" && x.o === o; };
  const err = (th: string, en: string) => { throw { th, en }; };
  const withUnit = (x: Val): Val => {
    const t = peek();
    if (t && t.k === "unit") { p++; if (x.len) err("ใส่หน่วยซ้ำ", "Unit given twice"); return { v: x.v * CM_PER[t.u], len: true }; }
    return x;
  };
  const primary = (): Val => {
    const t = toks[p++];
    if (!t) return err("ข้อความจบก่อนครบ", "Ends too early");
    if (t.k === "op" && t.o === "(") { const v = expr(); if (!isOp(")")) err("วงเล็บไม่ครบ", "Missing )"); p++; return withUnit(v); }
    if (t.k === "op" && t.o === "-") { const v = primary(); return { v: -v.v, len: v.len }; }
    if (t.k === "op" && t.o === "+") return primary();
    if (t.k !== "num") return err("ต้องเป็นตัวเลขตรงนี้", "Expected a number");
    return withUnit({ v: t.v, len: false });
  };
  const toLen = (x: Val): Val => (x.len ? x : { v: x.v * CM_PER[defaultUnit], len: true });
  const term = (): Val => {
    let a = primary();
    while (isOp("*") || isOp("/")) {
      const o = (toks[p++] as { o: string }).o, b = primary();
      if (o === "*") { if (a.len && b.len) err("คูณความยาวกับความยาวไม่ได้", "Can't multiply two lengths"); a = { v: a.v * b.v, len: a.len || b.len }; }
      else {
        if (b.v === 0) err("หารด้วยศูนย์ไม่ได้", "Can't divide by zero");
        if (b.len && !a.len) err("หารตัวเลขด้วยความยาวไม่ได้", "Can't divide a number by a length");
        a = a.len && b.len ? { v: a.v / b.v, len: false } : { v: a.v / b.v, len: a.len };
      }
    }
    return a;
  };
  const expr = (): Val => {
    let a = term();
    while (isOp("+") || isOp("-")) {
      const o = (toks[p++] as { o: string }).o, b = term();
      if (!a.len && !b.len) a = { v: o === "+" ? a.v + b.v : a.v - b.v, len: false };
      else { const A = toLen(a), B = toLen(b); a = { v: o === "+" ? A.v + B.v : A.v - B.v, len: true }; }
    }
    return a;
  };
  try {
    const r = expr();
    if (p < toks.length) return fail("มีส่วนเกินท้ายข้อความ", "Extra text at the end");
    const cm = toLen(r).v;
    if (!Number.isFinite(cm)) return fail("ค่าไม่ถูกต้อง", "Invalid value");
    return { ok: true, cm: Math.round(cm * 1e6) / 1e6 };
  } catch (e) {
    const m = e as { th?: string; en?: string };
    return fail(m.th ?? "อ่านไม่ออก", m.en ?? "Can't read this");
  }
}
