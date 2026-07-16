/**
 * ตัวคำนวณสูตรตาราง (spreadsheet) บนกระดาน — ปลอดภัย (ไม่ใช้ eval)
 * รองรับ: + − × ÷ ( ) · อ้างอิงช่อง (A1, B2) · ฟังก์ชันช่วง SUM/AVERAGE/MIN/MAX/COUNT (เช่น =SUM(A1:A5))
 * ช่องขึ้นต้นด้วย "=" = สูตร · ไม่งั้น = ค่า/ข้อความตรง ๆ
 */

export type Grid = string[][]; // เนื้อในช่องดิบต่อ [row][col]

/** "A"->0, "B"->1, "Z"->25, "AA"->26 */
export function colToIndex(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) { const d = ch.charCodeAt(0) - 64; if (d < 1 || d > 26) return -1; n = n * 26 + d; }
  return n - 1;
}
/** 0->"A", 25->"Z", 26->"AA" */
export function indexToCol(idx: number): string {
  let s = "", n = idx + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s || "A";
}
/** "A1" -> {c:0, r:0} · คืน null ถ้าไม่ใช่ ref */
export function parseRef(ref: string): { c: number; r: number } | null {
  const m = /^([A-Za-z]+)([0-9]+)$/.exec(ref.trim());
  if (!m) return null;
  const c = colToIndex(m[1]); const r = parseInt(m[2], 10) - 1;
  if (c < 0 || r < 0) return null;
  return { c, r };
}

const isNumericStr = (s: string) => /^-?[0-9]*\.?[0-9]+$/.test(s.trim());
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return "#ERR";
  // ตัดทศนิยมลอย ๆ (0.1+0.2) + คั่นหลักพัน
  const rounded = Math.round(n * 1e10) / 1e10;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

/**
 * คำนวณทั้งตาราง → คืนค่า "ที่จะแสดง" ต่อช่อง (สูตรถูกคำนวณแล้ว, error = #ERR, วนซ้ำ = #CYCLE)
 */
export function computeGrid(grid: Grid): string[][] {
  const R = grid.length;
  const C = grid.reduce((m, row) => Math.max(m, row?.length ?? 0), 0);
  const rawAt = (r: number, c: number): string => (grid[r]?.[c] ?? "").toString();

  const cache = new Map<string, number>();   // "r,c" -> ค่าตัวเลข (NaN=ไม่ใช่เลข)
  const visiting = new Set<string>();
  let cycle = false;

  // ค่าตัวเลขของช่อง (สำหรับใช้ในสูตร) — สูตร→ประเมิน, เลข→ค่า, ข้อความว่าง→0, ข้อความ→NaN
  function cellNum(r: number, c: number): number {
    const key = `${r},${c}`;
    const hit = cache.get(key); if (hit !== undefined) return hit;
    if (visiting.has(key)) { cycle = true; return NaN; }
    visiting.add(key);
    const s = rawAt(r, c).trim();
    let v: number;
    if (s.startsWith("=")) { try { v = parseFormula(s.slice(1)); } catch { v = NaN; } }
    else if (s === "") v = 0;
    else v = isNumericStr(s) ? parseFloat(s) : NaN;
    visiting.delete(key);
    cache.set(key, v);
    return v;
  }

  // ขยายช่วง "A1:B3" / "A1" / "A1,B2" → รายการ {r,c}
  function expandRange(arg: string): { r: number; c: number }[] {
    const out: { r: number; c: number }[] = [];
    for (const part of arg.split(",")) {
      const seg = part.trim(); if (!seg) continue;
      const range = seg.split(":");
      if (range.length === 2) {
        const a = parseRef(range[0]), b = parseRef(range[1]);
        if (a && b) {
          const r0 = Math.min(a.r, b.r), r1 = Math.max(a.r, b.r), c0 = Math.min(a.c, b.c), c1 = Math.max(a.c, b.c);
          for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push({ r, c });
        }
      } else { const p = parseRef(seg); if (p) out.push(p); }
    }
    return out;
  }

  function applyFunc(name: string, arg: string): number {
    const cells = expandRange(arg);
    const vals = cells.map(({ r, c }) => cellNum(r, c)).filter((v) => !Number.isNaN(v));
    switch (name) {
      case "SUM": return vals.reduce((a, b) => a + b, 0);
      case "AVERAGE": case "AVG": return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      case "MIN": return vals.length ? Math.min(...vals) : 0;
      case "MAX": return vals.length ? Math.max(...vals) : 0;
      case "COUNT": return vals.length;
      default: return NaN;
    }
  }

  // ── parser (recursive descent): expr = term (+/-) · term = factor (*/÷) · factor = unary primary ──
  function parseFormula(input: string): number {
    let pos = 0; const s = input;
    const ws = () => { while (pos < s.length && /\s/.test(s[pos])) pos++; };
    function expr(): number { let v = term(); ws(); while (s[pos] === "+" || s[pos] === "-") { const op = s[pos++]; const t = term(); v = op === "+" ? v + t : v - t; ws(); } return v; }
    function term(): number { let v = factor(); ws(); while (s[pos] === "*" || s[pos] === "/" || s[pos] === "×" || s[pos] === "÷") { const op = s[pos++]; const f = factor(); v = (op === "*" || op === "×") ? v * f : v / f; ws(); } return v; }
    function factor(): number { ws(); if (s[pos] === "+") { pos++; return factor(); } if (s[pos] === "-") { pos++; return -factor(); } return primary(); }
    function primary(): number {
      ws();
      if (s[pos] === "(") { pos++; const v = expr(); ws(); if (s[pos] === ")") pos++; return v; }
      // ตัวเลข
      const num = /^[0-9]*\.?[0-9]+/.exec(s.slice(pos));
      if (num && !/[A-Za-z]/.test(s[pos] ?? "")) { pos += num[0].length; return parseFloat(num[0]); }
      // ตัวอักษร → ฟังก์ชัน หรือ อ้างอิงช่อง
      const idm = /^[A-Za-z]+/.exec(s.slice(pos));
      if (idm) {
        const id = idm[0]; pos += id.length; ws();
        if (s[pos] === "(") { pos++; let depth = 1, start = pos; while (pos < s.length && depth > 0) { if (s[pos] === "(") depth++; else if (s[pos] === ")") depth--; if (depth > 0) pos++; } const arg = s.slice(start, pos); if (s[pos] === ")") pos++; return applyFunc(id.toUpperCase(), arg); }
        const dig = /^[0-9]+/.exec(s.slice(pos));
        if (dig) { pos += dig[0].length; const p = parseRef(id + dig[0]); return p ? cellNum(p.r, p.c) : NaN; }
        return NaN;
      }
      throw new Error("parse error");
    }
    const result = expr(); ws();
    return result;
  }

  // ── สร้างค่าที่จะแสดงต่อช่อง ──
  const out: string[][] = [];
  for (let r = 0; r < R; r++) {
    const row: string[] = [];
    for (let c = 0; c < C; c++) {
      const s = rawAt(r, c);
      if (!s.trim().startsWith("=")) { row.push(s); continue; }   // ค่า/ข้อความ → โชว์ตรง ๆ
      cycle = false;
      const n = cellNum(r, c);
      row.push(cycle ? "#CYCLE" : (Number.isNaN(n) ? "#ERR" : fmtNum(n)));
    }
    out.push(row);
  }
  return out;
}
