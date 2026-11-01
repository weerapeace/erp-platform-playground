/**
 * ตรวจ "ข้อมูลบนเว็บยังไม่ครบ" ของสินค้า 1 ตัว (pure — ใช้ได้ทั้งหน้าจอและ API)
 * ใช้ที่: หน้า "สินค้าบนเว็บ" (ป้ายเหลือง + ตัวกรอง "ต้องแก้") · เพิ่มกฎใหม่ที่นี่ที่เดียว ทุกหน้าที่ใช้จะเห็นตาม
 */
export interface ListingHealthInput {
  /** ราคาที่เว็บใช้จริง */
  price: number;
  /** จำนวนรูปบนเว็บ (แกลเลอรีของรุ่น) */
  imageCount: number;
  /** หมวดบนเว็บที่อยู่ */
  categories: string[];
  /** ตัวเลือก (สี) — swatch = จุดสีจากทะเบียนสี (null = ยังไม่ผูก) · hasImage = สีนี้มีรูปไหม */
  colors: HealthColor[];
  /** 📐 ร้านเปิด "เช็คขนาด" แต่รุ่นนี้ยังไม่ได้วัดช่องใส่ของ (lib/fit-check) */
  compartmentsMissing?: boolean;
}

/** img = รูปของสีบนเว็บมาจากไหน (web รูปเว็บรายสี · sku รูปปก SKU แทน · none ไม่มี) · skuId = SKU ตัวแทนของสี */
export type HealthColor = { label: string; swatch: string | null; hasImage: boolean; img?: "web" | "sku" | "none"; skuId?: string };

export interface ListingIssue {
  key: "no_price" | "no_image" | "no_category" | "swatch_missing" | "color_no_image" | "color_no_web_image" | "no_compartments";
  label: string;
  /** ชื่อสีที่เกี่ยว (ถ้ามี) — โชว์ใน tooltip */
  detail?: string;
  /** ชื่อสีที่เกี่ยว (แยกรายการ) — ปุ่ม 🎨 ผูกจุดสี เปิดทะเบียนสีโชว์เฉพาะสีเหล่านี้ */
  names?: string[];
  /** SKU ของสีแรกที่ต้องแก้ — กดป้ายแล้วเปิดหน้าแก้ไปที่แถวสีนั้น */
  skuId?: string;
}

/**
 * 🖼 รูปบนเว็บรายสี: ครบไหม · ใช้ร่วม ป้าย/จุดสี/ตัวกรองในหน้า "สินค้าบนเว็บ"
 *   missing = สีที่ไม่มีรูปเลย + (ถ้ารุ่นนี้ลงรูปเว็บไว้บางสีแล้ว) สีที่ยังใช้รูปปก SKU แทน
 *   allSku = ทุกสียังใช้รูปปก SKU (ไม่เคยลงรูปเว็บรายสี — อาจตั้งใจ จึงไม่นับเป็นเรื่องต้องแก้)
 */
export function colorWebImages(colors: HealthColor[]) {
  const known = colors.filter((c) => c.img);
  const webN = known.filter((c) => c.img === "web").length;
  const missing = known.filter((c) => c.img === "none" || (webN > 0 && c.img === "sku"));
  return { webN, total: known.length, missing, allSku: known.length > 0 && webN === 0 && known.some((c) => c.img === "sku") };
}

export function listingIssues(x: ListingHealthInput): ListingIssue[] {
  const out: ListingIssue[] = [];
  if (!(x.price > 0)) out.push({ key: "no_price", label: "ยังไม่มีราคา" });
  if (x.imageCount <= 0) out.push({ key: "no_image", label: "ยังไม่มีรูป" });
  if (!x.categories.length) out.push({ key: "no_category", label: "ยังไม่อยู่หมวดไหน" });
  const noSwatch = x.colors.filter((c) => !c.swatch);
  if (noSwatch.length)
    out.push({ key: "swatch_missing", label: `สียังไม่ผูกทะเบียนสี ${noSwatch.length}`, detail: noSwatch.map((c) => c.label).join(", "), names: noSwatch.map((c) => c.label) });
  const noImg = x.colors.filter((c) => !c.hasImage);
  if (noImg.length && x.colors.length > 1)
    out.push({ key: "color_no_image", label: `สีที่ยังไม่มีรูป ${noImg.length}`, detail: noImg.map((c) => c.label).join(", "), skuId: noImg.find((c) => c.skuId)?.skuId });
  // 🖼 ลงรูปเว็บไว้บางสีแล้ว แต่บางสียังใช้รูปปก SKU 1 รูปแทน (สีที่ไม่มีรูปเลยนับในป้ายด้านบนแล้ว)
  const web = colorWebImages(x.colors);
  const coverOnly = web.missing.filter((c) => c.img === "sku");
  if (coverOnly.length)
    out.push({
      key: "color_no_web_image",
      label: `รูปเว็บ ${web.webN}/${web.total} สี`,
      detail: `ยังไม่มีรูปบนเว็บ (ใช้รูปปก SKU แทน): ${coverOnly.map((c) => c.label).join(", ")}`,
      names: coverOnly.map((c) => c.label),
      skuId: coverOnly[0].skuId,
    });
  if (x.compartmentsMissing)
    out.push({ key: "no_compartments", label: "ยังไม่ได้วัดช่องใส่ของ", detail: "ไม่ขึ้นในหน้าเช็คขนาดตุ๊กตา — วัดขนาดด้านในของแต่ละช่อง หรือกด \"ไม่มีช่องใส่ของ\" ถ้าไม่ใช่กระเป๋า" });
  return out;
}

/** ปัญหาระดับร้าน (รวมทุกรุ่นที่ขึ้นเว็บ) สำหรับ "ตรวจก่อนเผยแพร่" — ไม่มีราคา = error · ไม่มีรูป/ไม่อยู่หมวด = warning */
export interface ShopPublishIssue {
  blockId: null;
  level: "error" | "warning";
  message: string;
  /** ลิงก์ไปแก้ (แท็บสินค้าบนเว็บ ตัวกรอง "ต้องแก้") */
  fix?: string;
}

export function shopPublishIssues(rows: { code: string; published: boolean; issues: ListingIssue[] }[], fixHref?: string): ShopPublishIssue[] {
  const live = rows.filter((r) => r.published);
  const codes = (key: ListingIssue["key"]) => live.filter((r) => r.issues.some((i) => i.key === key)).map((r) => r.code);
  const list = (cs: string[]) => cs.slice(0, 6).join(", ") + (cs.length > 6 ? ` และอีก ${cs.length - 6}` : "");
  const out: ShopPublishIssue[] = [];
  const noPrice = codes("no_price");
  if (noPrice.length) out.push({ blockId: null, level: "error", message: `สินค้า ${noPrice.length} รุ่นยังไม่มีราคา — ลูกค้าเห็น "สอบถามราคา" สั่งออนไลน์ไม่ได้: ${list(noPrice)}`, fix: fixHref });
  const noImg = codes("no_image");
  if (noImg.length) out.push({ blockId: null, level: "warning", message: `สินค้า ${noImg.length} รุ่นยังไม่มีรูป: ${list(noImg)}`, fix: fixHref });
  const noCat = codes("no_category");
  if (noCat.length) out.push({ blockId: null, level: "warning", message: `สินค้า ${noCat.length} รุ่นยังไม่อยู่หมวดไหน (ไม่ขึ้นตอนลูกค้าเลือกหมวด): ${list(noCat)}`, fix: fixHref });
  return out;
}
