/**
 * ของกลาง — "ตรวจข้อมูล" ของใบรวมทั้งรุ่น: หาจุดที่ข้อมูลวัตถุดิบ/สินค้าไม่ครบ พร้อมค่าแนะนำให้แก้ด่วน
 *
 *   หน่วยไม่ตรง     วัตถุดิบชนิดเดียวกันในรุ่นส่วนใหญ่ใช้หน่วยหนึ่ง แต่ตัวนี้ต่าง (เช่น ซิป หลา ×3 แต่ G515 = Units) → รวมแถว/รวมยอดไม่ได้
 *   ไม่มีชนิด       ยังไม่ได้ตั้งชนิดวัตถุดิบ → ไปอยู่หมวด "อื่น ๆ" · แนะนำชนิดจากตัวที่ชื่อขึ้นต้นเหมือนกัน
 *   ชื่อเป็นรหัส     ชื่อวัตถุดิบ = รหัส → แนะนำชื่อตามแบบตัวอื่นชนิดเดียวกัน + สีในข้อมูลวัตถุดิบ
 *   ชื่อสีซ้ำ       สีของสินค้า 2 ตัวในรุ่นชื่อเดียวกัน → แนะนำจากสีวัตถุดิบหลักของสีนั้น
 *   BOM ไม่ใส่จำนวน  qty_per = 0 → เปิดตัวแก้ BOM (ไม่มีแก้ด่วน)
 *
 * ค่าวัตถุดิบถูกคัดลอกไว้ 3 ชั้น: ข้อมูลวัตถุดิบ (skus_v2) → บรรทัดสูตร (bom_lines) → ใบสั่งผลิต (mo_material_summary/mo_materials)
 * → ตรวจจากค่าที่ใบพิมพ์ใช้จริง (ชั้นใบสั่งผลิต) แล้วแก้ทุกชั้นพร้อมกันที่ POST /api/mo/family-print/fix
 * ไฟล์นี้ไม่ยิง DB (ทดสอบได้) · ข้อมูลจาก /api/mo/family-print (masters)
 */
import { buildFamilySheet, clusterByName, sharedLabel, type FamilyInput } from "@/lib/family-print";

export type FamilyIssueField = "uom" | "name" | "type" | "color";
export type FamilyIssue = {
  /** m:<รหัสวัตถุดิบ> · p:<รหัสสินค้า> · q:<รหัสวัตถุดิบ> */
  key: string;
  /** material = แก้ข้อมูลวัตถุดิบ (+ BOM + ใบสั่งผลิต) · product = แก้ข้อมูลสินค้า · bom = ต้องเปิดตัวแก้ BOM */
  target: "material" | "product" | "bom";
  code: string;
  sku_id: string | null;
  title: string;
  problems: string[];
  fields: Partial<Record<FamilyIssueField, { current: string | null; suggest: string }>>;
  /** รหัสวัตถุดิบที่ติดกรอบเหลืองบนเอกสาร (ไม่ส่ง = code) */
  flag_codes?: string[];
  /** id ของใบสั่งผลิตใน mos (ปุ่ม "อัปเดตใบตามสูตร") */
  mo_ids: string[];
  /** ใบสั่งผลิต / สูตร / สินค้า ที่เกี่ยว (ใช้ตอนแก้หลายชั้น + เปิดตัวแก้ BOM) */
  mos: string[];
  bom_codes: string[];
  products: string[];
};

const txt = (v: unknown) => String(v ?? "").trim();
const THAI = /[฀-๿]/;
const OTHER = "อื่น ๆ";
const uniq = <T,>(a: T[]) => [...new Set(a)];

/** สีในข้อมูลวัตถุดิบมักขึ้นต้นด้วยรหัสสี ("#515 เขียวทหาร") → เอาแค่ชื่อสี "สีเขียวทหาร" */
function colourText(color: string | null | undefined): string {
  const c = txt(color).replace(/^#?[A-Za-z0-9-]+\s+/, "").trim();
  if (!c) return "";
  return c.startsWith("สี") ? c : `สี${c}`;
}
/** ชื่อแนะนำ = ส่วนหน้าที่ชื่อชนิดเดียวกันใช้ร่วมกัน + รหัสท้าย (#G515) + สี — ไม่มีตัวอย่างให้เทียบ = ไม่แนะนำ */
function suggestName(code: string, color: string | null, siblings: string[]): string {
  if (siblings.length < 2) return "";   // ตัวอย่างเดียว = หาส่วนร่วมไม่ได้ (จะได้ชื่อทั้งชื่อของตัวอื่น)
  const base = sharedLabel(siblings, "", true);
  if (!base) return "";
  const tail = code.includes("#") ? `#${code.split("#").pop()}` : "";
  return [base, tail, colourText(color)].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function familyIssues(input: FamilyInput): FamilyIssue[] {
  const masters = input.masters;
  const moSku = new Map(input.mos.map((m) => [m.mo_no, m.product_sku]));
  const moId = new Map(input.mos.map((m) => [m.mo_no, m.id]));
  const idsOf = (mos: string[]) => mos.map((m) => moId.get(m) ?? "").filter(Boolean);
  // รวมบรรทัดต่อรหัส (ค่าที่ใบพิมพ์ใช้จริง = สำเนาในใบสั่งผลิต)
  type Agg = { code: string; name: string; type: string; uom: string; mos: string[]; zeroMos: string[] };
  const byCode = new Map<string, Agg>();
  for (const l of input.buy) {
    if (!l.code) continue;
    const a = byCode.get(l.code) ?? { code: l.code, name: txt(l.name), type: txt(l.type) || OTHER, uom: txt(l.uom), mos: [], zeroMos: [] };
    a.mos.push(l.mo_no);
    if (!(l.qty_per > 0)) a.zeroMos.push(l.mo_no);   // เฉพาะใบ/สูตรที่ใส่ 0 (สีอื่นอาจใส่ถูกแล้ว)
    byCode.set(l.code, a);
  }
  const aggs = [...byCode.values()];
  const issues = new Map<string, FamilyIssue>();
  const material = (a: Agg): FamilyIssue => {
    const k = `m:${a.code}`;
    let it = issues.get(k);
    if (!it) {
      const mos = uniq(a.mos);
      it = {
        key: k, target: "material", code: a.code, sku_id: masters?.components[a.code]?.id ?? null,
        title: a.name && a.name !== a.code ? `${a.name}` : a.code, problems: [], fields: {}, mos,
        bom_codes: uniq(mos.map((m) => masters?.bom_by_mo[m] ?? "").filter(Boolean)),
        products: uniq(mos.map((m) => moSku.get(m) ?? "").filter(Boolean)), mo_ids: idsOf(mos),
      };
      issues.set(k, it);
    }
    return it;
  };

  // 1) หน่วยไม่ตรงกับชนิดเดียวกันส่วนใหญ่ในรุ่น
  for (const type of uniq(aggs.map((a) => a.type))) {
    if (type === OTHER) continue;
    const same = aggs.filter((a) => a.type === type && a.uom);
    const count = new Map<string, number>();
    for (const a of same) count.set(a.uom, (count.get(a.uom) ?? 0) + 1);
    const [top, n] = [...count.entries()].sort((x, y) => y[1] - x[1])[0] ?? ["", 0];
    if (n < 2 || n / same.length < 0.6) continue;
    const majority = same.filter((x) => x.uom === top).map((x) => x.name);
    for (const a of same) {
      if (a.uom === top) continue;
      // ของคนละแบบในชนิดเดียวกันใช้หน่วยต่างได้จริง (กระดาษเป็นแผ่น · พลาสติกเป็นหลา) → จับเฉพาะตัวที่ชื่อคล้ายพวกส่วนใหญ่ หรือชื่อเป็นรหัสล้วน
      const looksSame = !THAI.test(a.name) || majority.some((m) => sharedLabel([a.name, m], "", true));
      if (!looksSame) continue;
      const it = material(a);
      it.problems.push(`หน่วยเป็น ${a.uom} แต่${type}ตัวอื่นในรุ่นเป็น${top}`);
      it.fields.uom = { current: a.uom, suggest: top };
    }
  }
  // 2) ยังไม่ได้ตั้งชนิด → แนะนำจากตัวที่ชื่อขึ้นต้นเหมือนกัน (ชนิดที่เจอบ่อยสุด)
  const typed = aggs.filter((a) => a.type !== OTHER);
  for (const a of aggs.filter((x) => x.type === OTHER)) {
    const votes = new Map<string, number>();
    for (const t of typed) if (sharedLabel([a.name, t.name], "", true)) votes.set(t.type, (votes.get(t.type) ?? 0) + 1);
    const best = [...votes.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? "";
    const it = material(a);
    it.problems.push("ยังไม่ได้ตั้งชนิดวัตถุดิบ → ไปอยู่หมวด \"อื่น ๆ\"");
    it.fields.type = { current: null, suggest: best };
  }
  // 3) ชื่อเป็นรหัสล้วน (ไม่มีชื่อไทย)
  for (const a of aggs) {
    if (a.name && a.name !== a.code && THAI.test(a.name)) continue;
    const siblings = aggs.filter((x) => x.code !== a.code && x.type === a.type && THAI.test(x.name)).map((x) => x.name);
    // เลือกตัวอย่างกลุ่มที่ชื่อขึ้นต้นเหมือนกันมากสุด (กันได้ชื่อกว้างเกิน เช่น ปนซิปโลหะกับซิปไนล่อน)
    const group = clusterByName(siblings, (x) => x, true).sort((x, y) => y.length - x.length)[0] ?? [];
    const it = material(a);
    it.problems.push("ชื่อวัตถุดิบเป็นรหัสล้วน (ไม่มีชื่อไทย)");
    it.fields.name = { current: a.name || null, suggest: suggestName(a.code, masters?.components[a.code]?.color ?? null, group) };
  }
  // 4) BOM ยังไม่ใส่จำนวน — แก้ด่วนไม่ได้ ต้องเปิดตัวแก้ BOM · รวม 1 การ์ดต่อสี (สูตร) ไม่ใช่ 1 การ์ดต่อบรรทัด
  const zeroByProduct = new Map<string, { codes: string[]; mos: string[] }>();
  for (const a of aggs) {
    for (const m of a.zeroMos) {
      const p = moSku.get(m); if (!p) continue;
      const z = zeroByProduct.get(p) ?? { codes: [], mos: [] };
      z.codes.push(a.code); z.mos.push(m);
      zeroByProduct.set(p, z);
    }
  }
  for (const [p, z] of zeroByProduct) {
    const codes = uniq(z.codes), mos = uniq(z.mos);
    issues.set(`q:${p}`, {
      key: `q:${p}`, target: "bom", code: p, sku_id: masters?.products[p]?.id ?? null,
      title: `BOM ของ ${p}`, problems: [`ใส่จำนวน 0 อยู่ ${codes.length} บรรทัด (ใบพิมพ์ขึ้น ?): ${codes.join(", ")}`], fields: {}, mos,
      bom_codes: uniq(mos.map((m) => masters?.bom_by_mo[m] ?? "").filter(Boolean)), products: [p], flag_codes: codes, mo_ids: idsOf(mos),
    });
  }
  // 5) ชื่อสีสินค้าซ้ำกันในรุ่น — ตัวที่ "(NN)" ในชื่อตรงกับท้ายรหัสถือว่าถูก ที่เหลือแนะนำจากสีวัตถุดิบหลัก
  const sheet = buildFamilySheet(input);
  const byColor = new Map<string, number[]>();
  sheet.columns.forEach((c, i) => { const v = txt(c.variant); if (v) byColor.set(v, [...(byColor.get(v) ?? []), i]); });
  for (const [color, cols] of byColor) {
    if (cols.length < 2) continue;
    const own = (i: number) => { const tail = sheet.columns[i].sku.split("-").pop() ?? ""; return !!tail && color.includes(`(${tail})`); };
    const wrong = cols.some(own) ? cols.filter((i) => !own(i)) : cols;
    for (const i of wrong) {
      const col = sheet.columns[i];
      const tail = col.sku.split("-").pop() ?? "";
      // สีของวัตถุดิบหลัก = แถวต่างสีที่ "สีละรหัส" มากสุด (ตัวกระเป๋า) แล้วค่อยดูลำดับใน BOM — ผ้าซับในมักใช้ร่วมกันหลายสี
      const main = [...sheet.buy.varies].sort((x, y) => y.codes.length - x.codes.length || x.seq - y.seq)
        .map((r) => r.cells[i]?.colour ?? "").find(Boolean) ?? "";
      issues.set(`p:${col.sku}`, {
        key: `p:${col.sku}`, target: "product", code: col.sku, sku_id: masters?.products[col.sku]?.id ?? null,
        title: `ชื่อสี ${col.sku}`, problems: [`"${color}" ซ้ำกับ ${cols.filter((x) => x !== i).map((x) => sheet.columns[x].sku).join(", ")}`],
        fields: { color: { current: color, suggest: main ? `${main}${tail ? ` (${tail})` : ""}` : "" } },
        mos: col.mos.map((m) => m.mo_no), bom_codes: [], products: [col.sku], mo_ids: col.mos.map((m) => m.id),
      });
    }
  }
  const order = { material: 0, product: 1, bom: 2 } as const;
  return [...issues.values()].sort((x, y) => order[x.target] - order[y.target] || x.code.localeCompare(y.code));
}

/** แผนที่ "รหัส → คีย์ปัญหา" ไว้ติดกรอบเหลือง/ปุ่มแก้บนเอกสาร (แบบ B) */
export function issueFlags(issues: FamilyIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) for (const c of [...(i.flag_codes ?? []), i.code]) if (!out[c]) out[c] = i.key;
  return out;
}

/** ข้อความสั้นของชั้นที่จะแก้ (ใช้ในแผง + กล่องยืนยัน) */
export const FIX_LAYER_LABEL = { sku: "ข้อมูลวัตถุดิบ / สินค้า (SKU)", bom: "สูตร BOM ที่ใช้", mo: "ใบสั่งผลิตที่เปิดอยู่" } as const;
export type FixLayer = keyof typeof FIX_LAYER_LABEL;
