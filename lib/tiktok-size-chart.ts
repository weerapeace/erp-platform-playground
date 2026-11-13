/**
 * ตารางขนาดแบบ "แม่แบบ" บน TikTok (กรอกเป็นแถว/คอลัมน์) — pure (ไม่เรียก API) ใช้ได้ทั้งหน้าเว็บและหลังบ้าน + เทสต์
 * เจ้าของสั่ง 2026-11-13 "ทำ 1,2,4" (ข้อ 2 = ตารางขนาดแบบกรอกเป็นแถว)
 *
 * เอกสารทางการ (อ่าน 2026-11-13):
 *   Search Size Charts 202407 — POST /product/202407/sizecharts/search ?page_size(1–100)&page_token&locales
 *     body { size_chart_mode: REUSABLE_TEMPLATE | PRODUCT_SCOPED, keyword, ids[] }
 *     → data.size_chart[{ template_id, template_name, images[{ uri, url, locale }], related_category_ids[], size_chart_mode,
 *        size_chart_datas[{ locale, size_chart_data{ table{ headers[{ name, id }], rows[{ cells[{ value }] }] }, measurement_type, unit_system, is_one_size, size_types[] } }] }]
 *   Create Size Chart V2 202610 — POST /product/202610/size_charts (shop_cipher)
 *     body { category_id (หมวดปลายสุดที่รองรับตารางขนาด), size_chart_mode, template_name (บังคับเมื่อ REUSABLE_TEMPLATE),
 *            size_chart_data{ measurement_type, unit_system: METRIC | IMPERIAL, table{ headers 1–20 [{ id?, name ≤ 32 }], rows 1–45 [{ cells[{ value ≤ 32 }] }] } } }
 *     → data.size_chart_id (REUSABLE_TEMPLATE = ใช้เป็น size_chart.template.id ในสินค้าได้)
 *     header.id: คอลัมน์ไซซ์ = size_chart_size_system_size/us/uk/eu/… · คอลัมน์วัดมาตรฐาน = id จาก Get Category Rules · คอลัมน์ตั้งเอง = ไม่ใส่ id
 *   Get Category Rules → size_chart.measurement_and_options[{ measurement_type, size_systems[], options[{ id, name, role KEY/RECOMMEND, unit, metric_value_range }] }], size_types[], size_systems[]
 *   ใช้กับสินค้า: Partial Edit / Create → size_chart{ template{ id } } (ใส่แม่แบบ หรือ รูป อย่างใดอย่างหนึ่ง)
 *
 * ref ในฟอร์มตารางขนาด: "tpl:<id>" = แม่แบบบน TikTok · "tts:<uri>" = รูปบน TikTok · "r2:<key>" = รูปใหม่จากระบบ
 */

export const TTS_SIZE_MAX_HEADERS = 20;
export const TTS_SIZE_MAX_ROWS = 45;
export const TTS_SIZE_CELL_MAX = 32;
export const TTS_SIZE_NAME_MAX = 100;

export type TtsSizeHeader = { id: string | null; name: string };
export type TtsSizeTable = { headers: TtsSizeHeader[]; rows: string[][] };
export type TtsSizeTemplate = {
  id: string; name: string; image: string | null; categoryIds: string[]; mode: string | null;
  table: TtsSizeTable | null; measurementType: string | null; unitSystem: string | null;
};
export type TtsSizeOption = { id: string; name: string; role: string | null; unit: string | null; min: number | null; max: number | null };
export type TtsSizeMeasure = { type: string; sizeSystems: string[]; options: TtsSizeOption[] };
/** ข้อมูลตารางขนาดของหมวด (จาก Get Category Rules) */
export type TtsSizeMeta = { measures: TtsSizeMeasure[]; sizeTypes: string[]; sizeSystems: string[] };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Obj[] : []);
const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const num = (v: unknown): number | null => { const s = str(v); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };

export const tiktokSizeTemplateRef = (id: string): string => `tpl:${id}`;
export const tiktokTemplateIdOfRef = (ref: string | null | undefined): string | null => (ref && ref.startsWith("tpl:") ? ref.slice(4) || null : null);

/** ชื่อคอลัมน์ไซซ์มาตรฐาน (id ที่ TikTok กำหนด) */
export const TTS_SIZE_SYSTEM_LABEL: Record<string, string> = {
  size_chart_size_system_size: "ไซซ์", size_chart_size_system_us: "US", size_chart_size_system_uk: "UK",
  size_chart_size_system_eu: "EU", size_chart_size_system_jp: "JP", size_chart_size_system_mx: "MX",
};
export const TTS_MEASUREMENT_LABEL: Record<string, string> = {
  GENERIC_MEASUREMENTS: "ขนาดทั่วไป", BODY_MEASUREMENTS: "สัดส่วนผู้สวมใส่", PRODUCT_MEASUREMENTS: "ขนาดตัวสินค้า",
};
export const ttsSizeSystemLabel = (id: string): string => TTS_SIZE_SYSTEM_LABEL[id] ?? id.replace(/^size_chart_size_system_/, "").toUpperCase();

/** ตารางจาก size_chart_data (ช่องว่างในแถวที่สั้นกว่าหัว = "") */
function tableOf(v: unknown): TtsSizeTable | null {
  const t = obj(obj(v)?.table);
  if (!t) return null;
  const headers = arr(t.headers).map((h) => ({ id: str(h.id) || null, name: str(h.name) }));
  if (!headers.length) return null;
  const rows = arr(t.rows).map((r) => { const cells = arr(r.cells).map((c) => str(c.value)); return headers.map((_, i) => cells[i] ?? ""); });
  return { headers, rows };
}

/** คำตอบ Search Size Charts → แม่แบบ (เลือกภาษาไทยก่อน ไม่มีใช้ภาษาแรก) */
export function ttsSizeTemplatesOf(data: unknown): TtsSizeTemplate[] {
  return arr(obj(data)?.size_chart).map((s): TtsSizeTemplate | null => {
    const id = str(s.template_id);
    if (!id) return null;
    const datas = arr(s.size_chart_datas);
    const pick = datas.find((d) => /^th/i.test(str(d.locale))) ?? datas[0];
    const sd = obj(pick?.size_chart_data);
    const imgs = arr(s.images);
    const img = imgs.find((i) => /^th/i.test(str(i.locale))) ?? imgs[0];
    return {
      id, name: str(s.template_name) || `แม่แบบ #${id}`, image: str(img?.url) || null,
      categoryIds: strs(s.related_category_ids), mode: str(s.size_chart_mode) || null,
      table: tableOf(sd), measurementType: str(sd?.measurement_type) || null, unitSystem: str(sd?.unit_system) || null,
    };
  }).filter((x): x is TtsSizeTemplate => !!x);
}

/** กติกาของหมวด (Get Category Rules ดิบ) → ข้อมูลตารางขนาด · ไม่มีข้อมูล = null */
export function ttsSizeMetaOf(rulesRaw: unknown): TtsSizeMeta | null {
  const sc = obj(obj(rulesRaw)?.size_chart);
  if (!sc) return null;
  const measures = arr(sc.measurement_and_options).map((m): TtsSizeMeasure => ({
    type: str(m.measurement_type) || "GENERIC_MEASUREMENTS",
    sizeSystems: strs(m.size_systems),
    options: arr(m.options).map((o) => {
      const r = Array.isArray(o.metric_value_range) ? o.metric_value_range : [];
      return { id: str(o.id), name: str(o.name) || str(o.id), role: str(o.role) || null, unit: str(o.unit) || null, min: num(r[0]), max: num(r[1]) };
    }).filter((o) => o.id),
  }));
  const sizeTypes = strs(sc.size_types); const sizeSystems = strs(sc.size_systems);
  if (!measures.length && !sizeTypes.length && !sizeSystems.length) return null;
  return { measures, sizeTypes, sizeSystems };
}

/** แม่แบบที่ใช้กับหมวดนี้ได้ขึ้นก่อน (แม่แบบที่ไม่บอกหมวด = ถือว่าใช้ได้) */
export function sortSizeTemplatesFor(list: TtsSizeTemplate[], categoryId: string | null): (TtsSizeTemplate & { fits: boolean })[] {
  return list
    .map((t) => ({ ...t, fits: !categoryId || !t.categoryIds.length || t.categoryIds.includes(categoryId) }))
    .sort((a, b) => Number(b.fits) - Number(a.fits) || a.name.localeCompare(b.name, "th"));
}

/** ตารางตั้งต้นของหมวด: คอลัมน์ไซซ์ + คอลัมน์วัดหลัก (KEY) ของแบบวัดแรก · ไม่มีข้อมูลหมวด = ไซซ์ + รอบอก/ยาว (ตั้งเอง) */
export function starterSizeTable(meta: TtsSizeMeta | null, measurementType?: string | null): TtsSizeTable {
  const m = meta?.measures.find((x) => x.type === measurementType) ?? meta?.measures[0] ?? null;
  const keyOpts = (m?.options ?? []).filter((o) => o.role === "KEY");
  const unit = (o: TtsSizeOption) => (o.unit === "LENGTH" || o.unit === "HEIGHT" ? " (ซม.)" : o.unit === "WEIGHT" ? " (กก.)" : "");
  const headers: TtsSizeHeader[] = [
    { id: "size_chart_size_system_size", name: "ไซซ์" },
    ...(keyOpts.length ? keyOpts.slice(0, 4).map((o) => ({ id: o.id, name: `${o.name}${unit(o)}`.slice(0, TTS_SIZE_CELL_MAX) })) : [{ id: null, name: "กว้าง (ซม.)" }, { id: null, name: "ยาว (ซม.)" }]),
  ];
  return { headers, rows: [["S", ...headers.slice(1).map(() => "")], ["M", ...headers.slice(1).map(() => "")], ["L", ...headers.slice(1).map(() => "")]] };
}

/** วางจาก Excel (string[][] แถวแรก = หัวตาราง) → ตาราง · หัวที่ตรงชื่อวัดมาตรฐานของหมวด = ใส่ id ให้ */
export function sizeTableFromGrid(grid: string[][], meta: TtsSizeMeta | null): TtsSizeTable | null {
  const rows = grid.map((r) => r.map((c) => str(c))).filter((r) => r.some(Boolean));
  if (rows.length < 2) return null;
  const opts = (meta?.measures ?? []).flatMap((m) => m.options);
  const idOfName = (name: string): string | null => {
    const n = name.toLowerCase().replace(/\s*\(.*\)\s*$/, "").trim();
    if (/^(size|ไซซ์|ไซส์|ขนาด)$/i.test(n)) return "size_chart_size_system_size";
    const sys = Object.entries(TTS_SIZE_SYSTEM_LABEL).find(([, l]) => l.toLowerCase() === n);
    if (sys) return sys[0];
    return opts.find((o) => o.name.toLowerCase() === n)?.id ?? null;
  };
  const width = Math.min(TTS_SIZE_MAX_HEADERS, Math.max(...rows.map((r) => r.length)));
  const headers = Array.from({ length: width }, (_, i) => { const name = rows[0][i] ?? ""; return { id: name ? idOfName(name) : null, name }; });
  return { headers, rows: rows.slice(1).map((r) => headers.map((_, i) => r[i] ?? "")) };
}

export type TtsSizeTablePlan = { body: Record<string, unknown> | null; rows: number; errors: string[]; warnings: string[] };

/**
 * ตรวจตารางก่อนสร้างแม่แบบบน TikTok (หน้าเว็บกับ API ใช้ตัวเดียวกัน) → body ของ Create Size Chart V2
 * แถวว่างทั้งแถว = ตัดทิ้ง · หัว 1–20 ไม่ว่าง ไม่ซ้ำ ≤ 32 · แถว 1–45 · ช่อง ≤ 32 · คอลัมน์แรก (ไซซ์) ห้ามว่าง
 */
export function planTiktokSizeTable(input: { categoryId: string | null; name: string; measurementType: string | null; unitSystem?: string | null; table: TtsSizeTable }, meta: TtsSizeMeta | null): TtsSizeTablePlan {
  const errors: string[] = []; const warnings: string[] = [];
  const name = str(input.name);
  const headers = input.table.headers.map((h) => ({ id: h.id, name: str(h.name) }));
  const rows = input.table.rows.map((r) => headers.map((_, i) => str(r[i]))).filter((r) => r.some(Boolean));
  if (!input.categoryId) errors.push("ไม่รู้หมวดของสินค้า — ดึงตัวนี้จาก TikTok ก่อน");
  if (!name) errors.push("ตั้งชื่อแม่แบบก่อน (เช่น \"กระเป๋า สะพายข้าง\")");
  else if (name.length > TTS_SIZE_NAME_MAX) errors.push(`ชื่อแม่แบบยาวเกิน ${TTS_SIZE_NAME_MAX} ตัวอักษร`);
  if (!headers.length) errors.push("ต้องมีอย่างน้อย 1 คอลัมน์");
  if (headers.length > TTS_SIZE_MAX_HEADERS) errors.push(`คอลัมน์ได้ไม่เกิน ${TTS_SIZE_MAX_HEADERS}`);
  if (headers.some((h) => !h.name)) errors.push("หัวคอลัมน์ว่างไม่ได้");
  if (headers.some((h) => h.name.length > TTS_SIZE_CELL_MAX)) errors.push(`หัวคอลัมน์ยาวได้ไม่เกิน ${TTS_SIZE_CELL_MAX} ตัวอักษร`);
  const names = headers.map((h) => h.name.toLowerCase()).filter(Boolean);
  if (new Set(names).size !== names.length) errors.push("หัวคอลัมน์ซ้ำกัน");
  if (!rows.length) errors.push("ต้องมีอย่างน้อย 1 แถว");
  if (rows.length > TTS_SIZE_MAX_ROWS) errors.push(`แถวได้ไม่เกิน ${TTS_SIZE_MAX_ROWS} (ตอนนี้ ${rows.length})`);
  if (rows.some((r) => r.some((c) => c.length > TTS_SIZE_CELL_MAX))) errors.push(`ค่าในช่องยาวได้ไม่เกิน ${TTS_SIZE_CELL_MAX} ตัวอักษร`);
  if (rows.some((r) => !r[0])) errors.push(`คอลัมน์แรก (${headers[0]?.name || "ไซซ์"}) ห้ามว่าง`);
  const firstCol = rows.map((r) => r[0].toLowerCase()).filter(Boolean);
  if (new Set(firstCol).size !== firstCol.length) warnings.push(`มีค่าซ้ำในคอลัมน์ ${headers[0]?.name || "แรก"} — ตรวจว่าตั้งใจ`);
  const empties = rows.reduce((a, r) => a + r.filter((c) => !c).length, 0);
  if (empties) warnings.push(`มีช่องว่าง ${empties} ช่อง — ลูกค้าจะเห็นเป็นช่องว่าง`);

  // แบบวัด: ต้องเป็นแบบที่หมวดรองรับ (ไม่รู้ = ทั่วไป)
  const allowed = (meta?.measures ?? []).map((m) => m.type);
  const measurementType = input.measurementType && (!allowed.length || allowed.includes(input.measurementType)) ? input.measurementType : (allowed[0] ?? "GENERIC_MEASUREMENTS");
  if (input.measurementType && allowed.length && !allowed.includes(input.measurementType)) warnings.push(`หมวดนี้ไม่รองรับแบบวัด "${TTS_MEASUREMENT_LABEL[input.measurementType] ?? input.measurementType}" — ใช้ "${TTS_MEASUREMENT_LABEL[measurementType] ?? measurementType}" แทน`);
  // id ของหัว: เก็บเฉพาะ id ไซซ์มาตรฐาน / วัดมาตรฐานของแบบวัดนี้ (id ที่หมวดไม่รู้จัก = TikTok ไม่รับ → ทำเป็นคอลัมน์ตั้งเอง)
  const m = meta?.measures.find((x) => x.type === measurementType) ?? null;
  const okIds = new Set<string>([...Object.keys(TTS_SIZE_SYSTEM_LABEL), ...(m?.options.map((o) => o.id) ?? [])]);
  const outHeaders = headers.map((h) => (h.id && (okIds.has(h.id) || !m) ? { id: h.id, name: h.name } : { name: h.name }));
  // ค่าวัดมาตรฐานนอกช่วงที่หมวดกำหนด → เตือน (TikTok อาจไม่รับ)
  if (m) {
    for (const [i, h] of headers.entries()) {
      const o = h.id ? m.options.find((x) => x.id === h.id) : null;
      if (!o || o.min == null || o.max == null) continue;
      const bad = rows.filter((r) => { const n = Number(r[i]); return r[i] && Number.isFinite(n) && (n < o.min! || n > o.max!); }).length;
      if (bad) warnings.push(`"${h.name}" มี ${bad} ค่านอกช่วงที่ TikTok กำหนด (${o.min}–${o.max})`);
    }
  }
  const body = errors.length ? null : {
    category_id: input.categoryId,
    size_chart_mode: "REUSABLE_TEMPLATE",
    template_name: name,
    size_chart_data: { measurement_type: measurementType, unit_system: input.unitSystem === "IMPERIAL" ? "IMPERIAL" : "METRIC", table: { headers: outHeaders, rows: rows.map((r) => ({ cells: r.map((value) => ({ value })) })) } },
  };
  return { body, rows: rows.length, errors, warnings };
}
