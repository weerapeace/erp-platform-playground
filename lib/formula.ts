/**
 * formula.ts — ตัวคำนวณสูตรกลางสำหรับ "Computed Field" (ช่องคำนวณอัตโนมัติ)
 *
 * รองรับสูตรง่าย ๆ ที่ผู้ใช้พิมพ์เอง เช่น  qty * price_est  หรือ  (subtotal - discount) * 1.07
 * - อ้างอิงชื่อ field (column) ในระเบียนเดียวกันได้ตรง ๆ
 * - ตัวดำเนินการ: +  -  *  /  %  วงเล็บ ( )  และเครื่องหมายลบหน้า (unary -)
 * - ฟังก์ชัน: round(x[,n])  abs(x)  min(...)  max(...)  ceil(x)  floor(x)
 *
 * ปลอดภัย: เป็น parser เฉพาะทาง (recursive-descent) ไม่ใช้ eval/Function
 * จึงรันสตริงจากผู้ใช้ไม่ได้นอกจาก arithmetic ที่อนุญาตไว้เท่านั้น
 */

export type ComputeFormat = "number" | "currency" | "percent";

type Tok =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "lp" }
  | { t: "rp" }
  | { t: "comma" };

const FUNCS = new Set(["round", "abs", "min", "max", "ceil", "floor"]);

function tokenize(src: string): Tok[] | null {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    if (c >= "0" && c <= "9") {
      let j = i + 1;
      while (j < src.length && ((src[j] >= "0" && src[j] <= "9") || src[j] === ".")) j++;
      const num = Number(src.slice(i, j));
      if (!isFinite(num)) return null;
      toks.push({ t: "num", v: num });
      i = j; continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      toks.push({ t: "id", v: src.slice(i, j) });
      i = j; continue;
    }
    if (c === "(") { toks.push({ t: "lp" }); i++; continue; }
    if (c === ")") { toks.push({ t: "rp" }); i++; continue; }
    if (c === ",") { toks.push({ t: "comma" }); i++; continue; }
    if ("+-*/%".includes(c)) { toks.push({ t: "op", v: c }); i++; continue; }
    return null; // อักขระที่ไม่อนุญาต
  }
  return toks;
}

/** parse + evaluate ในรอบเดียว โดยใช้ค่าจาก row */
function makeEvaluator(toks: Tok[], resolve: (name: string) => number) {
  let p = 0;
  const peek = () => toks[p];
  const eat = () => toks[p++];

  function parseExpr(): number {
    let val = parseTerm();
    for (;;) {
      const tk = peek();
      if (tk && tk.t === "op" && (tk.v === "+" || tk.v === "-")) {
        eat();
        const rhs = parseTerm();
        val = tk.v === "+" ? val + rhs : val - rhs;
      } else break;
    }
    return val;
  }

  function parseTerm(): number {
    let val = parseFactor();
    for (;;) {
      const tk = peek();
      if (tk && tk.t === "op" && (tk.v === "*" || tk.v === "/" || tk.v === "%")) {
        eat();
        const rhs = parseFactor();
        if (tk.v === "*") val = val * rhs;
        else if (tk.v === "/") val = rhs === 0 ? NaN : val / rhs;
        else val = rhs === 0 ? NaN : val % rhs;
      } else break;
    }
    return val;
  }

  function parseFactor(): number {
    const tk = peek();
    if (!tk) throw new Error("unexpected end");
    if (tk.t === "op" && tk.v === "-") { eat(); return -parseFactor(); }
    if (tk.t === "op" && tk.v === "+") { eat(); return parseFactor(); }
    if (tk.t === "num") { eat(); return tk.v; }
    if (tk.t === "lp") {
      eat();
      const v = parseExpr();
      const close = eat();
      if (!close || close.t !== "rp") throw new Error("missing )");
      return v;
    }
    if (tk.t === "id") {
      eat();
      const next = peek();
      // function call: id ( args )
      if (next && next.t === "lp" && FUNCS.has(tk.v.toLowerCase())) {
        eat(); // lp
        const args: number[] = [];
        if (peek() && peek().t !== "rp") {
          args.push(parseExpr());
          while (peek() && peek().t === "comma") { eat(); args.push(parseExpr()); }
        }
        const close = eat();
        if (!close || close.t !== "rp") throw new Error("missing )");
        return applyFunc(tk.v.toLowerCase(), args);
      }
      // field reference
      return resolve(tk.v);
    }
    throw new Error("unexpected token");
  }

  function applyFunc(name: string, a: number[]): number {
    switch (name) {
      case "round": { const n = a[1] ?? 0; const m = Math.pow(10, n); return Math.round((a[0] ?? 0) * m) / m; }
      case "abs":   return Math.abs(a[0] ?? 0);
      case "ceil":  return Math.ceil(a[0] ?? 0);
      case "floor": return Math.floor(a[0] ?? 0);
      case "min":   return a.length ? Math.min(...a) : 0;
      case "max":   return a.length ? Math.max(...a) : 0;
      default:      return NaN;
    }
  }

  const result = parseExpr();
  if (p < toks.length) throw new Error("trailing tokens"); // มี token เหลือ = สูตรผิด
  return result;
}

/** คำนวณค่าจากสูตร + ข้อมูลแถว → number หรือ null ถ้าคำนวณไม่ได้ */
export function computeField(formula: string | undefined | null, row: Record<string, unknown>): number | null {
  if (!formula || !formula.trim()) return null;
  const toks = tokenize(formula);
  if (!toks || toks.length === 0) return null;
  const resolve = (name: string): number => {
    const raw = row[name];
    const n = typeof raw === "number" ? raw : Number(raw);
    return isFinite(n) ? n : 0; // field ว่าง/ไม่ใช่ตัวเลข → 0 (ให้คำนวณบางส่วนได้)
  };
  try {
    const v = makeEvaluator(toks, resolve);
    return isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/** ตรวจสูตรว่า syntax ถูกไหม (สำหรับ field-creator) → null = ผ่าน, string = ข้อความ error */
export function validateFormula(formula: string): string | null {
  if (!formula.trim()) return "กรอกสูตร";
  const toks = tokenize(formula);
  if (!toks) return "มีอักขระที่ไม่อนุญาต (ใช้ได้: ตัวเลข, ชื่อ field, + - * / % ( ) )";
  if (toks.length === 0) return "สูตรว่าง";
  try {
    // ลองคำนวณด้วยค่า dummy = 1 ทุก field เพื่อเช็ค syntax
    makeEvaluator(toks, () => 1);
    return null;
  } catch {
    return "สูตรไม่ถูกต้อง — ตรวจวงเล็บ/เครื่องหมาย";
  }
}

/** ดึงชื่อ field ทั้งหมดที่ถูกอ้างในสูตร (ยกเว้นชื่อฟังก์ชัน) */
export function formulaRefs(formula: string): string[] {
  const toks = tokenize(formula);
  if (!toks) return [];
  const out: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i];
    if (tk.t === "id") {
      const next = toks[i + 1];
      const isFunc = next && next.t === "lp" && FUNCS.has(tk.v.toLowerCase());
      if (!isFunc && !out.includes(tk.v)) out.push(tk.v);
    }
  }
  return out;
}

/** จัดรูปแบบตัวเลขผลลัพธ์ตาม format ที่ตั้งไว้ */
export function formatComputed(n: number | null, format: ComputeFormat = "number", decimals = 2): string {
  if (n == null) return "—";
  const opts: Intl.NumberFormatOptions = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  if (format === "percent") return (n).toLocaleString("th-TH", opts) + "%";
  // currency + number ใช้รูปแบบเดียวกัน (เลขไทยมีคอมมา) — เงินไม่ผูกสัญลักษณ์เพื่อรองรับหลายสกุล
  return n.toLocaleString("th-TH", opts);
}
