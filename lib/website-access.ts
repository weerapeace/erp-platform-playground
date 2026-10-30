/**
 * 🔐 สิทธิ์เว็บไซต์ — ของกลาง (pure · ใช้ทั้งหน้าเว็บ ERP และ API)
 *
 * 6 กลุ่มงาน × ระดับ (ไม่เห็น / ดูได้ / แก้ได้) + เลือกร้านที่เข้าได้
 *   คีย์สิทธิ์ (อยู่ในตารางสิทธิ์กลาง erp_permissions หมวด "เว็บไซต์"):
 *     website.<กลุ่ม>.view / website.<กลุ่ม>.edit   (สถิติมีแค่ view)
 *     website.access          = เห็นเมนู/หน้าเว็บไซต์ (ตั้งอัตโนมัติ: เห็นอย่างน้อย 1 กลุ่ม)
 *     website.shop.<slug>     = เข้าร้านนั้นได้
 *   ตั้งที่หน้า /website/access (ตามตำแหน่ง + ยกเว้นรายคน) → เขียน erp_role_permissions / erp_user_permissions เดิม
 *   บังคับ 3 ชั้น: เมนู (permission_key = website.access) · หน้า /website (ร้าน + แท็บ + แถบดูอย่างเดียว) · API /api/website/* (lib/website-api-guard)
 * admin มีทุกสิทธิ์เสมอ (erp_can)
 */

export type WebsiteGroup = "products" | "design" | "orders" | "promos" | "settings" | "stats";
export type WebsiteLevel = "none" | "view" | "edit";

export interface WebsiteGroupDef {
  key: WebsiteGroup;
  label: string;
  icon: string;
  /** แท็บในหน้าเว็บไซต์ที่อยู่ในกลุ่มนี้ (key แท็บของ manager-client) */
  tabs: string[];
  /** มีระดับ "แก้ได้" ไหม (สถิติ = ดูอย่างเดียว) */
  editable: boolean;
  hint: string;
}

export const WEBSITE_GROUPS: WebsiteGroupDef[] = [
  { key: "products", label: "สินค้าบนเว็บ", icon: "🛍", editable: true, tabs: ["listings", "categories", "collections", "newdrops", "sizeguides", "fieldmap", "imagesets"], hint: "สินค้า หมวด คอลเลกชัน มาใหม่ ตารางไซส์ ชุดรูป" },
  { key: "design", label: "หน้าตาเว็บ", icon: "🎨", editable: true, tabs: ["design", "layout", "pages", "webimages", "i18n"], hint: "ดีไซน์ หน้าแรก หน้าเว็บ รูปบนเว็บ แปลภาษา" },
  { key: "orders", label: "ออเดอร์และลูกค้า", icon: "🧾", editable: true, tabs: ["orders", "returns", "members", "reviews"], hint: "ออเดอร์ คืน/เปลี่ยน สมาชิก รีวิว (ข้อมูลส่วนตัวลูกค้า)" },
  { key: "promos", label: "โปรโมชัน", icon: "🏷", editable: true, tabs: ["coupons", "promotions"], hint: "คูปอง โปรโมชัน ระดับสมาชิก" },
  { key: "settings", label: "ตั้งค่าร้าน", icon: "🏪", editable: true, tabs: ["info", "shipping"], hint: "ข้อมูลร้าน การจัดส่ง การชำระเงิน การเข้าสู่ระบบสมาชิก" },
  { key: "stats", label: "สถิติ", icon: "📈", editable: false, tabs: ["stats"], hint: "ยอดเข้าชม คำค้นหา" },
];

export const WEBSITE_ACCESS_PERM = "website.access";
export const WEBSITE_LEVEL_LABEL: Record<WebsiteLevel, string> = { none: "ไม่เห็น", view: "ดูได้", edit: "แก้ได้" };

export const websitePerm = (g: WebsiteGroup, level: "view" | "edit") => `website.${g}.${g === "stats" ? "view" : level}`;
export const websiteShopPerm = (slug: string) => `website.shop.${slug}`;
export const websiteGroupDef = (g: WebsiteGroup) => WEBSITE_GROUPS.find((x) => x.key === g)!;

/** คีย์สิทธิ์ทั้งหมดของเว็บไซต์ (ไม่รวมร้าน) — ลำดับคงที่ */
export const WEBSITE_GROUP_PERMS: string[] = WEBSITE_GROUPS.flatMap((g) => (g.editable ? [websitePerm(g.key, "view"), websitePerm(g.key, "edit")] : [websitePerm(g.key, "view")]));

/** แท็บ → กลุ่ม (แท็บที่ไม่รู้จัก = null) */
export function websiteGroupOfTab(tab: string): WebsiteGroup | null {
  return WEBSITE_GROUPS.find((g) => g.tabs.includes(tab))?.key ?? null;
}

/** ระดับของกลุ่ม จากชุดสิทธิ์ (has = เช็กคีย์) */
export function websiteLevel(has: (key: string) => boolean, g: WebsiteGroup): WebsiteLevel {
  if (websiteGroupDef(g).editable && has(websitePerm(g, "edit"))) return "edit";
  return has(websitePerm(g, "view")) ? "view" : "none";
}

/** ระดับที่ตั้ง → คีย์ที่ต้องเปิด/ปิด (แก้ได้ = ดูได้ด้วยเสมอ) */
export function websiteLevelKeys(g: WebsiteGroup, level: WebsiteLevel): Record<string, boolean> {
  const out: Record<string, boolean> = { [websitePerm(g, "view")]: level !== "none" };
  if (websiteGroupDef(g).editable) out[websitePerm(g, "edit")] = level === "edit";
  return out;
}

/** ระดับถัดไปตอนกดสลับ (ไม่เห็น → ดูได้ → แก้ได้ → ไม่เห็น · สถิติ: ไม่เห็น ↔ ดูได้) */
export function nextWebsiteLevel(g: WebsiteGroup, level: WebsiteLevel): WebsiteLevel {
  if (level === "none") return "view";
  if (level === "view") return websiteGroupDef(g).editable ? "edit" : "none";
  return "none";
}

/**
 * API /api/website/<path> → กลุ่มที่ใช้ route นี้ (ผ่านเมื่อมีสิทธิ์ระดับนั้นในกลุ่มใดกลุ่มหนึ่ง)
 * route ที่หลายแท็บใช้ร่วม = หลายกลุ่ม เช่น แปลภาษา (หน้าตาเว็บ) เขียน field-map / collections / settings ด้วย
 * จับคู่ prefix ยาวสุดก่อน · ไม่อยู่ในรายการ = null (ใช้กฎเดิม products.view/edit)
 *   ไม่ใส่: tag-categories · product-png · listings/images · video-upload — ใช้จากแอปอื่นด้วย (Master Data / ตัวจัดรูป)
 */
const API_GROUPS: [string, WebsiteGroup[]][] = [
  ["shops", ["products", "design", "orders", "promos", "settings", "stats"]],
  ["listings", ["products"]],
  ["collections", ["products", "design"]],
  ["new-drops", ["products"]],
  ["size-guides", ["products"]],
  ["field-map", ["products", "design"]],
  ["image-sets", ["products", "design"]],
  ["site-images", ["design"]],
  ["category-rename", ["products"]],
  ["card-badges", ["products", "design"]],
  ["restock", ["products", "orders"]],
  ["theme", ["design"]],
  ["layout", ["design"]],
  ["pages", ["design"]],
  ["saved-themes", ["design"]],
  ["section-templates", ["design"]],
  ["canvas-templates", ["design"]],
  ["canvas-decor", ["design"]],
  ["frames", ["design"]],
  ["scrub-frames", ["design"]],
  ["menu-templates", ["design"]],
  ["translations", ["design"]],
  ["orders", ["orders"]],
  ["returns", ["orders"]],
  ["members/tiers", ["promos", "orders"]],
  ["members/login-settings", ["settings"]],
  ["members/test", ["settings"]],
  ["members", ["orders"]],
  ["customer-profile", ["orders"]],
  ["reviews", ["orders"]],
  ["contact-messages", ["orders", "settings"]],
  ["subscribers", ["orders", "settings"]],
  ["coupons", ["promos", "design"]],
  ["promotions", ["promos"]],
  ["product-groups", ["promos"]],
  ["settings", ["settings", "design"]],
  ["shipping", ["settings"]],
  ["gift-cards", ["settings", "orders"]],
  ["web-stats", ["stats"]],
  ["search-terms", ["stats", "settings"]],
];
const API_SHARED = ["tag-categories", "product-png", "listings/images", "video-upload"];
const API_GROUPS_SORTED = [...API_GROUPS].sort((a, b) => b[0].length - a[0].length);
const under = (rest: string, prefix: string) => rest === prefix || rest.startsWith(`${prefix}/`);

export function websiteApiGroups(pathname: string): WebsiteGroup[] | null {
  const m = /\/api\/website\/(.+?)\/?$/.exec(pathname);
  if (!m) return null;
  const rest = m[1];
  if (API_SHARED.some((p) => under(rest, p))) return null;
  for (const [prefix, groups] of API_GROUPS_SORTED) if (under(rest, prefix)) return groups;
  return null;
}

// ── 👷 หน้าดีไซน์แบบง่ายสำหรับพนักงาน: "หน้าตาเว็บ" ระดับดูได้ + เลือกหัวข้อที่แก้ได้ ──
/**
 * หัวข้อในหน้าดีไซน์ที่ให้พนักงานแก้ได้ (= หน้าใน lib/website-design-nav ยกเว้น ภาพรวม/ประวัติ · เทสต์ตรวจว่าตรงกัน)
 *   คีย์: website.design.topic.<หน้า> · website.design.publish (เผยแพร่เองได้) · website.design.advanced (โชว์การตั้งค่าละเอียด)
 *   มี website.design.edit = แก้ได้ทุกหัวข้อ + เผยแพร่ + ละเอียด (แบบเดิม) · API ธีมบังคับฝั่งเซิร์ฟเวอร์ (บันทึกเฉพาะค่าของหัวข้อที่มีสิทธิ์)
 */
export const DESIGN_TOPICS = ["colors", "fonts", "shape", "motion", "mobile", "logo", "header", "menu", "footer", "card", "listing", "product", "related", "cart", "checkout", "pages", "campaign"] as const;
export type DesignTopic = (typeof DESIGN_TOPICS)[number];
/**
 * 🗂 แท็บอื่นในกลุ่ม "หน้าตาเว็บ" ที่ติ๊กให้พนักงานแก้ได้ (นอกหน้าดีไซน์) — คีย์ชุดเดียวกัน website.design.topic.<x>
 *   home = แท็บหน้าแรก · webpages = แท็บหน้าเว็บ (สร้างหน้า/แก้ร่าง · ลบ/สลับลำดับ = แก้ได้ทั้งหมดเท่านั้น) · webimages = แท็บรูปบนเว็บ
 *   เผยแพร่เอง/ส่งหัวหน้า = website.design.publish ตัวเดียวกับหน้าดีไซน์ · แปลภาษายังไม่รวม (บันทึกลงหลายกลุ่มสิทธิ์)
 */
export const DESIGN_TAB_TOPICS = ["home", "webpages", "webimages"] as const;
export type DesignTabTopic = (typeof DESIGN_TAB_TOPICS)[number];
export const DESIGN_TAB_TOPIC_DEFS: Record<DesignTabTopic, { label: string; tab: string }> = {
  home: { label: "หน้าแรก", tab: "layout" },
  webpages: { label: "หน้าเว็บ", tab: "pages" },
  webimages: { label: "รูปบนเว็บ", tab: "webimages" },
};
/** แท็บในหน้าร้าน → หัวข้อแท็บ (ไม่ใช่แท็บที่ติ๊กได้ = null) */
export const designTabTopicOf = (tab: string): DesignTabTopic | null => DESIGN_TAB_TOPICS.find((t) => DESIGN_TAB_TOPIC_DEFS[t].tab === tab) ?? null;
export const designTopicPerm = (t: DesignTopic | DesignTabTopic) => `website.design.topic.${t}`;
export const DESIGN_PUBLISH_PERM = "website.design.publish";
export const DESIGN_ADVANCED_PERM = "website.design.advanced";
export const DESIGN_TOPIC_PERMS: string[] = [...DESIGN_TOPICS.map(designTopicPerm), ...DESIGN_TAB_TOPICS.map(designTopicPerm), DESIGN_PUBLISH_PERM, DESIGN_ADVANCED_PERM];
export const isDesignTopic = (k: unknown): k is DesignTopic => typeof k === "string" && (DESIGN_TOPICS as readonly string[]).includes(k);
export const isDesignTabTopic = (k: unknown): k is DesignTabTopic => typeof k === "string" && (DESIGN_TAB_TOPICS as readonly string[]).includes(k);

/** ชุดสำเร็จรูปในหน้าตั้งสิทธิ์ (กด = แทนหัวข้อ + แท็บทั้งหมด) */
export const DESIGN_TOPIC_PRESETS: { label: string; topics: DesignTopic[]; tabs?: DesignTabTopic[] }[] = [
  { label: "ดูแลเมนู/หัวเว็บ", topics: ["logo", "header", "menu", "footer"] },
  { label: "ดูแลหน้าสินค้า", topics: ["card", "listing", "product", "related"] },
  { label: "แคมเปญ/ป๊อปอัป", topics: ["campaign", "pages"] },
  { label: "ดูแลหน้าแรก/หน้าเว็บ", topics: [], tabs: ["home", "webpages", "webimages"] },
];

export interface DesignAccess {
  /** แก้ได้ทุกหัวข้อ (website.design.edit — แบบเดิม) */
  full: boolean;
  /** หัวข้อที่แก้ได้ (full = ทุกหัวข้อ · ว่าง = แก้ไม่ได้) */
  topics: DesignTopic[];
  /** 🗂 แท็บอื่นที่แก้ได้ (หน้าแรก/หน้าเว็บ/รูปบนเว็บ · full = ทุกแท็บ) */
  tabs: DesignTabTopic[];
  /** เผยแพร่เองได้ (ไม่ได้ = บันทึกร่างแล้วส่งให้หัวหน้า) */
  publish: boolean;
  /** โชว์การตั้งค่าละเอียด (ไม่ได้ = แบบง่าย) */
  advanced: boolean;
}

/** สิทธิ์หน้าดีไซน์ของคน (has = เช็กคีย์) — บางหัวข้อต้องมี "ดูได้" ด้วย */
export function designAccess(has: (key: string) => boolean): DesignAccess {
  if (has(websitePerm("design", "edit"))) return { full: true, topics: [...DESIGN_TOPICS], tabs: [...DESIGN_TAB_TOPICS], publish: true, advanced: true };
  const view = has(websitePerm("design", "view"));
  const topics = view ? DESIGN_TOPICS.filter((t) => has(designTopicPerm(t))) : [];
  const tabs = view ? DESIGN_TAB_TOPICS.filter((t) => has(designTopicPerm(t))) : [];
  return { full: false, topics, tabs, publish: topics.length + tabs.length > 0 && has(DESIGN_PUBLISH_PERM), advanced: topics.length > 0 && has(DESIGN_ADVANCED_PERM) };
}

/** ตั้งบางหัวข้อ → คีย์ที่ต้องเปิด/ปิดทั้งชุด (ไม่มีหัวข้อ/แท็บ = ปิดเผยแพร่/ละเอียดด้วย) */
export function designTopicKeys(topics: readonly DesignTopic[], publish: boolean, advanced: boolean, tabs: readonly DesignTabTopic[] = []): Record<string, boolean> {
  const on = topics.length + tabs.length > 0;
  const out: Record<string, boolean> = Object.fromEntries(DESIGN_TOPICS.map((t) => [designTopicPerm(t), topics.includes(t)]));
  for (const t of DESIGN_TAB_TOPICS) out[designTopicPerm(t)] = tabs.includes(t);
  out[DESIGN_PUBLISH_PERM] = on && publish;
  out[DESIGN_ADVANCED_PERM] = topics.length > 0 && advanced;
  return out;
}

/** ช่องที่บอกร้านในคำขอ API (query / body) */
export const WEBSITE_SHOP_FIELDS = { slug: ["shop", "shopSlug"], id: ["shopId", "shop_id"] } as const;
