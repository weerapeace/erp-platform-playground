// ============================================================
// calc-expression — ตัวคำนวณสูตรเลขแบบปลอดภัย (ของกลาง)
// ใช้กับช่องจำนวนเงิน: พิมพ์ "1200*3+50" แล้วได้ 3650
// รองรับ: + - * / ( ) ทศนิยม · ลูกน้ำคั่นหลักพัน (ตัดทิ้ง) · ×/÷ และ x (คูณ)
// ⚠️ ห้ามใช้ eval / new Function — ตัวนี้อ่านทีละตัวอักษรเอง ไม่รันโค้ดใด ๆ
// ============================================================

/** ข้อความนี้ "ดูเป็นสูตร" ไหม (มีเครื่องหมายคำนวณ ไม่ใช่แค่เลขติดลบ) */
export function looksLikeFormula(text: string): boolean {
  const s = String(text ?? "").replace(/[,\s]/g, "");
  if (!s) return false;
  if (/[+*/()×÷xX]/.test(s)) return true;
  return /\d-/.test(s); // ลบกลางสูตร เช่น 100-20 (ไม่ใช่ -100)
}

/** คำนวณสูตร คืน null ถ้าสูตรผิด/หารศูนย์ */
export function evalExpression(text: string): number | null {
  const src = String(text ?? "")
    .replace(/,/g, "")
    .replace(/[×xX]/g, "*")
    .replace(/÷/g, "/")
    .replace(/\s+/g, "");
  if (!src || src.length > 200) return null;
  let i = 0;
  const peek = () => src[i];

  function parseNumber(): number | null {
    const start = i;
    while (i < src.length && /[0-9.]/.test(src[i])) i++;
    const t = src.slice(start, i);
    if (!t || (t.match(/\./g)?.length ?? 0) > 1 || t === ".") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  function parseFactor(): number | null {
    const c = peek();
    if (c === "+") { i++; return parseFactor(); }
    if (c === "-") { i++; const v = parseFactor(); return v == null ? null : -v; }
    if (c === "(") {
      i++;
      const v = parseExpr();
      if (v == null || peek() !== ")") return null;
      i++;
      return v;
    }
    return parseNumber();
  }
  function parseTerm(): number | null {
    let v = parseFactor();
    while (v != null && (peek() === "*" || peek() === "/")) {
      const op = src[i++];
      const r = parseFactor();
      if (r == null) return null;
      if (op === "/") { if (r === 0) return null; v = v / r; } else v = v * r;
    }
    return v;
  }
  function parseExpr(): number | null {
    let v = parseTerm();
    while (v != null && (peek() === "+" || peek() === "-")) {
      const op = src[i++];
      const r = parseTerm();
      if (r == null) return null;
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  const out = parseExpr();
  if (out == null || i !== src.length || !Number.isFinite(out)) return null;
  // ปัดเศษทศนิยมลอย (0.1+0.2) ให้เหลือ 6 ตำแหน่ง
  return Math.round(out * 1e6) / 1e6;
}
