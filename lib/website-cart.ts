/**
 * 🛒 ดีไซน์ตะกร้า (theme.cart) — ตั้งในแท็บดีไซน์ → 🛒 ตะกร้า · pure · ไม่มี import
 *   ⚠️ มิเรอร์ทั้งไฟล์ไป storefront src/lib/cart-config.ts — แก้ที่นี่แล้วคัดลอก
 * เว็บร้านวาดที่ components/cart/* (ลิ้นชัก + หน้า /cart ใช้ตัววาดเดียวกัน)
 * ค่าเริ่มต้น = หน้าตาเดิมของตะกร้า (ลิ้นชักขวา · ปุ่มดำเนินการสั่งซื้อ · แถบส่งฟรี · ล้างตะกร้า) — ฟังก์ชันใหม่ปิดไว้
 */
export type CartStyle = "drawer-right" | "drawer-left" | "modal";
export type CartRecsSource = "auto" | "featured" | "manual";
/** ตำแหน่งสินค้าแนะนำ: บนสุด · ต่อจากรายการสินค้า · ท้ายรายการ (เดิม) · ติดเหนือยอดรวม (เห็นตลอด) */
export type CartRecsPos = "top" | "afterItems" | "bottom" | "footer";
export interface CartTrustItem {
  icon: string;
  text: string;
}
export interface CartConfig {
  /* ── หน้าตา ── */
  /** ลิ้นชักขวา (เดิม) · ลิ้นชักซ้าย · หน้าต่างกลางจอ */
  style: CartStyle;
  /** ความกว้างลิ้นชัก/หน้าต่าง */
  width: "sm" | "md" | "lg";
  title: string;
  /** กดไอคอนตะกร้าที่หัวเว็บ: เปิดลิ้นชัก (เดิม) / ไปหน้า /cart */
  openMode: "drawer" | "page";
  /* ── รายการสินค้า ── */
  imageSize: "sm" | "md" | "lg";
  imageShape: "rounded" | "square" | "circle";
  imageFit: "cover" | "contain";
  showOptions: boolean;
  /** ราคาต่อชิ้น (ใต้ชื่อ) */
  showUnitPrice: boolean;
  /** ราคาเต็มขีดฆ่า + "ประหยัด ฿X" */
  showCompare: boolean;
  /** ♡ ย้ายไปรายการโปรด (เอาออกจากตะกร้า + เก็บในรายการโปรด) */
  wishlist: boolean;
  /* ── ตอนว่าง ── */
  emptyText: string;
  emptyButton: string;
  /* ── ท้ายตะกร้า ── */
  checkoutText: string;
  /** ปุ่ม "เลือกซื้อต่อ" ("" = ไม่โชว์) */
  continueText: string;
  showClear: boolean;
  noteText: string;
  freeShip: boolean;
  /** {amount} = ยอดที่ขาด */
  freeShipText: string;
  freeShipDone: string;
  /* ── 🛍 สินค้าแนะนำ ── */
  recs: boolean;
  recsTitle: string;
  /** auto = หมวดเดียวกับในตะกร้า + แนะนำ/ขายดี · featured = เฉพาะที่ติ๊กแนะนำ · manual = เลือกเอง (codes) */
  recsSource: CartRecsSource;
  recsCodes: string[];
  recsLimit: number;
  /** ยอดยังไม่ถึงส่งฟรี → ดันสินค้าที่ราคาพอดีให้ถึงส่งฟรีขึ้นก่อน */
  recsFreeShip: boolean;
  /** อยู่ตรงไหนในตะกร้า (ลิ้นชัก + หน้า /cart) */
  recsPos: CartRecsPos;
  /* ── ฟังก์ชันเพิ่ม ── */
  /** ช่องโค้ดส่วนลด (จำไปใช้ตอนชำระเงิน) */
  coupon: boolean;
  /** สมาชิก: "จะได้ N แต้ม" */
  points: boolean;
  /** 🎀 ห่อของขวัญ (ต้องเปิดห่อของขวัญในข้อมูลร้านด้วย) */
  gift: boolean;
  /** 📝 หมายเหตุถึงร้าน (ไปต่อหน้าชำระเงิน) */
  note: boolean;
  /** แถบความมั่นใจใต้ปุ่มสั่งซื้อ */
  trust: boolean;
  trustItems: CartTrustItem[];
  /** 🚚 วันที่คาดว่าได้รับ (นับวันทำการ จ.–ศ.) */
  eta: boolean;
  etaMin: number;
  etaMax: number;
  /** {from} {to} = วันที่ */
  etaText: string;
}

export const DEFAULT_TRUST_ITEMS: CartTrustItem[] = [
  { icon: "🔒", text: "ชำระเงินปลอดภัย" },
  { icon: "🚚", text: "จัดส่งไว" },
  { icon: "↩️", text: "เปลี่ยนสินค้าได้" },
];

export const DEFAULT_CART: CartConfig = {
  style: "drawer-right",
  width: "md",
  title: "ตะกร้า",
  openMode: "drawer",
  imageSize: "md",
  imageShape: "rounded",
  imageFit: "cover",
  showOptions: true,
  showUnitPrice: false,
  showCompare: false,
  wishlist: false,
  emptyText: "ยังไม่มีสินค้าในตะกร้า",
  emptyButton: "",
  checkoutText: "ดำเนินการสั่งซื้อ",
  continueText: "",
  showClear: true,
  noteText: "ยังไม่รวมค่าจัดส่ง · คำนวณตอนชำระเงิน",
  freeShip: true,
  freeShipText: "อีก {amount} ส่งฟรี",
  freeShipDone: "🎉 ได้ส่งฟรีแล้ว",
  recs: false,
  recsTitle: "คุณอาจชอบ",
  recsSource: "auto",
  recsCodes: [],
  recsLimit: 6,
  recsFreeShip: true,
  recsPos: "bottom",
  coupon: false,
  points: false,
  gift: false,
  note: false,
  trust: false,
  trustItems: DEFAULT_TRUST_ITEMS,
  eta: false,
  etaMin: 2,
  etaMax: 4,
  etaText: "ได้รับประมาณ {from} – {to}",
};

export const CART_STYLES: { value: CartStyle; label: string }[] = [
  { value: "drawer-right", label: "ลิ้นชักขวา (เดิม)" },
  { value: "drawer-left", label: "ลิ้นชักซ้าย" },
  { value: "modal", label: "หน้าต่างกลางจอ" },
];
export const CART_WIDTHS: { value: CartConfig["width"]; label: string; px: number }[] = [
  { value: "sm", label: "แคบ", px: 380 },
  { value: "md", label: "กลาง (เดิม)", px: 448 },
  { value: "lg", label: "กว้าง", px: 560 },
];
export const CART_IMAGE_SIZES: { value: CartConfig["imageSize"]; label: string; px: number }[] = [
  { value: "sm", label: "เล็ก", px: 52 },
  { value: "md", label: "กลาง (เดิม)", px: 64 },
  { value: "lg", label: "ใหญ่", px: 88 },
];
export const CART_RECS_POSITIONS: { value: CartRecsPos; label: string; hint: string }[] = [
  { value: "top", label: "บนสุด", hint: "เห็นก่อนรายการสินค้า — ตะกร้าว่างก็ขึ้นบนสุด" },
  { value: "afterItems", label: "ต่อจากรายการสินค้า", hint: "อยู่ก่อนโค้ดส่วนลด / หมายเหตุ / ห่อของขวัญ" },
  { value: "bottom", label: "ท้ายรายการ (แบบเดิม)", hint: "ต่อจากโค้ดส่วนลด / หมายเหตุ — ต้องเลื่อนลงถึงจะเห็น" },
  { value: "footer", label: "ติดเหนือยอดรวม", hint: "เห็นตลอดไม่ต้องเลื่อน (การ์ดเล็กลง) · หน้า /cart = ใต้กล่องยอดรวม" },
];

export const CART_RECS_SOURCES: { value: CartRecsSource; label: string; hint: string }[] = [
  { value: "auto", label: "อัตโนมัติ", hint: "หมวดเดียวกับของในตะกร้า + ที่ติ๊กแนะนำ/ขายดี (ไม่ซ้ำของในตะกร้า)" },
  { value: "featured", label: "เฉพาะที่ติ๊กแนะนำ", hint: "สินค้าที่ติ๊ก ⭐ แนะนำในหน้าสินค้าบนเว็บ" },
  { value: "manual", label: "เลือกเอง", hint: "เลือกรุ่นที่จะโชว์ (เรียงตามที่เลือก)" },
];

const one = <T extends string>(v: unknown, all: readonly T[], fb: T): T => (typeof v === "string" && (all as readonly string[]).includes(v) ? (v as T) : fb);
const str = (v: unknown, fb: string, max: number) => (typeof v === "string" ? v.slice(0, max) : fb);
const bool = (v: unknown, fb: boolean) => (typeof v === "boolean" ? v : fb);
const int = (v: unknown, fb: number, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : fb;
};

export function normalizeCart(raw: unknown): CartConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CART;
  const etaMin = int(r.etaMin, d.etaMin, 0, 60);
  const trustRaw = Array.isArray(r.trustItems) ? (r.trustItems as unknown[]) : null;
  const trustItems = trustRaw
    ? trustRaw
        .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
        .map((x) => ({ icon: str(x.icon, "", 8).trim(), text: str(x.text, "", 60).trim() }))
        .filter((x) => x.text)
        .slice(0, 4)
    : d.trustItems.map((x) => ({ ...x }));
  return {
    style: one(r.style, ["drawer-right", "drawer-left", "modal"] as const, d.style),
    width: one(r.width, ["sm", "md", "lg"] as const, d.width),
    title: str(r.title, d.title, 40).trim() || d.title,
    openMode: one(r.openMode, ["drawer", "page"] as const, d.openMode),
    imageSize: one(r.imageSize, ["sm", "md", "lg"] as const, d.imageSize),
    imageShape: one(r.imageShape, ["rounded", "square", "circle"] as const, d.imageShape),
    imageFit: one(r.imageFit, ["cover", "contain"] as const, d.imageFit),
    showOptions: bool(r.showOptions, d.showOptions),
    showUnitPrice: bool(r.showUnitPrice, d.showUnitPrice),
    showCompare: bool(r.showCompare, d.showCompare),
    wishlist: bool(r.wishlist, d.wishlist),
    emptyText: str(r.emptyText, d.emptyText, 120).trim() || d.emptyText,
    emptyButton: str(r.emptyButton, d.emptyButton, 40).trim(),
    checkoutText: str(r.checkoutText, d.checkoutText, 40).trim() || d.checkoutText,
    continueText: str(r.continueText, d.continueText, 40).trim(),
    showClear: bool(r.showClear, d.showClear),
    noteText: str(r.noteText, d.noteText, 120),
    freeShip: bool(r.freeShip, d.freeShip),
    freeShipText: str(r.freeShipText, d.freeShipText, 80).trim() || d.freeShipText,
    freeShipDone: str(r.freeShipDone, d.freeShipDone, 80).trim() || d.freeShipDone,
    recs: bool(r.recs, d.recs),
    recsTitle: str(r.recsTitle, d.recsTitle, 40).trim() || d.recsTitle,
    recsSource: one(r.recsSource, ["auto", "featured", "manual"] as const, d.recsSource),
    recsCodes: Array.isArray(r.recsCodes) ? [...new Set((r.recsCodes as unknown[]).map((c) => String(c ?? "").trim().toUpperCase()).filter((c) => /^[A-Z0-9._-]{1,40}$/.test(c)))].slice(0, 24) : [],
    recsLimit: int(r.recsLimit, d.recsLimit, 2, 12),
    recsFreeShip: bool(r.recsFreeShip, d.recsFreeShip),
    recsPos: one(r.recsPos, ["top", "afterItems", "bottom", "footer"] as const, d.recsPos),
    coupon: bool(r.coupon, d.coupon),
    points: bool(r.points, d.points),
    gift: bool(r.gift, d.gift),
    note: bool(r.note, d.note),
    trust: bool(r.trust, d.trust),
    trustItems,
    eta: bool(r.eta, d.eta),
    etaMin,
    etaMax: Math.max(etaMin, int(r.etaMax, d.etaMax, 0, 90)),
    etaText: str(r.etaText, d.etaText, 80).trim() || d.etaText,
  };
}

/** ข้อความส่งฟรี: แทน {amount} */
export const freeShipLine = (tpl: string, amount: string) => tpl.split("{amount}").join(amount);

/** บวกวันทำการ (ข้ามเสาร์-อาทิตย์) */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d;
}
/** "ได้รับประมาณ 20 ต.ค. – 22 ต.ค." */
export function etaLine(cfg: Pick<CartConfig, "etaMin" | "etaMax" | "etaText">, now = new Date()): string {
  const fmt = (d: Date) => d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  return cfg.etaText.split("{from}").join(fmt(addBusinessDays(now, cfg.etaMin))).split("{to}").join(fmt(addBusinessDays(now, cfg.etaMax)));
}

/**
 * 🛍 เลือกสินค้าแนะนำในตะกร้า (pure — เว็บร้านเรียกฝั่งเซิร์ฟเวอร์)
 *   ไม่ซ้ำของในตะกร้า · ข้ามสินค้าหมด/ไม่มีราคา · recsFreeShip: ยอดยังไม่ถึงส่งฟรี → ตัวที่ราคา ≥ ยอดที่ขาด (ใกล้สุด) ขึ้นก่อน
 *   remain = ยอดที่ขาดถึงส่งฟรี (หน่วยเดียวกับ price — เว็บร้านเป็นสตางค์)
 */
export interface RecProduct {
  id: string;
  code?: string;
  price: number;
  category?: string;
  categories?: string[];
  featured?: boolean;
  salesRank?: number | null;
  stock?: string;
}
export function pickCartRecs<P extends RecProduct>(all: P[], inCart: string[], cfg: Pick<CartConfig, "recsSource" | "recsCodes" | "recsLimit" | "recsFreeShip">, remain = 0): P[] {
  const cartSet = new Set(inCart);
  const pool = all.filter((p) => !cartSet.has(p.id) && p.price > 0 && p.stock !== "out");
  let list: P[];
  if (cfg.recsSource === "manual") {
    const byCode = new Map(pool.map((p) => [String(p.code ?? "").toUpperCase(), p]));
    list = cfg.recsCodes.map((c) => byCode.get(c)).filter((p): p is P => !!p);
  } else if (cfg.recsSource === "featured") {
    list = pool.filter((p) => p.featured);
  } else {
    const cartCats = new Set(all.filter((p) => cartSet.has(p.id)).flatMap((p) => [p.category ?? "", ...(p.categories ?? [])]).filter(Boolean));
    const score = (p: P) =>
      ((p.categories ?? [p.category ?? ""]).some((c) => cartCats.has(c)) ? 3 : 0) + (p.featured ? 2 : 0) + (p.salesRank != null ? 1 + 1 / (1 + p.salesRank) : 0);
    list = pool
      .map((p, i) => ({ p, i, s: score(p) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)
      .map((x) => x.p);
  }
  if (cfg.recsFreeShip && remain > 0) {
    // ราคาพอดีให้ถึงส่งฟรี (≥ ที่ขาด) ใกล้สุดขึ้นก่อน — ที่เหลือคงลำดับเดิม
    const hit = list.filter((p) => p.price >= remain).sort((a, b) => a.price - b.price);
    const rest = list.filter((p) => p.price < remain);
    list = [...hit, ...rest];
  }
  return list.slice(0, cfg.recsLimit);
}
