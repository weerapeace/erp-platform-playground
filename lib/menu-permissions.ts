/**
 * 🔑 สิทธิ์ตามเมนู (ของกลาง) — จับคู่ "เมนูบนแถบของแอป" กับ "สิทธิ์ที่เกี่ยวข้อง" ใช้จัดหน้าตั้งค่าสิทธิ์แยกตามเมนู
 * (ไฟล์ pure ห้ามใส่ "use client" — เทสต์ import ได้)
 *
 *   ลำดับการหา: กฎตาม href (ขึ้นต้นยาวสุดชนะ) → ไม่มีกฎ = เดาจาก permission_key ของเมนู (เช่น po.view → po.*)
 *               → ไม่เจอเลย = เมนูนี้ไม่มีสิทธิ์ย่อย (ใครเข้าแอปได้ก็เห็น — ซ่อนได้ที่ "ใครเห็นเมนูไหน")
 *   sameAs = หน้านี้ใช้สิทธิ์ชุดเดียวกับอีกหน้า (ไม่ต้องโชว์ซ้ำ)
 * สิทธิ์เป็นของกลาง — ติ๊กที่หน้านี้มีผลทุกแอปที่ใช้สิทธิ์เดียวกัน
 * ใช้ที่: components/menu-permissions (หน้า 🔑 สิทธิ์ใน /tasks/settings + แท็บใน ⚙️ ตั้งค่าแอป)
 * เพิ่มหน้าใหม่ที่มีสิทธิ์ของตัวเอง → เพิ่มกฎที่ MENU_PERMISSION_RULES ที่เดียว
 */

export type MenuPermRule = { href: string; prefixes?: string[]; keys?: string[]; sameAs?: string };
type CatalogPerm = { key: string; category?: string | null; sort_order?: number | null };

export const MENU_PERMISSION_RULES: MenuPermRule[] = [
  { href: "/tasks", prefixes: ["tasks.", "task_subtask.", "task_template."], keys: ["ai.caption", "product_media.sync", "sku_description.sync"] },
  { href: "/tasks/campaigns", sameAs: "/tasks" },
  { href: "/tasks/content-calendar", sameAs: "/tasks" },
  { href: "/tasks/plan", sameAs: "/tasks" },   // แผนงานทีม — ใช้สิทธิ์ tasks.view/create/edit/delete
  { href: "/marketing/content-plan", sameAs: "/tasks" },
  { href: "/tasks/nesting", prefixes: ["nesting."] },
  { href: "/master/skus", prefixes: ["products."], keys: ["attachments.upload", "attachments.delete"] },
  { href: "/master/parent-skus", sameAs: "/master/skus" },
  { href: "/master/assets", prefixes: ["assets."] },
  { href: "/master/storage-rules", sameAs: "/master/assets" },
  { href: "/master/storage-plan", sameAs: "/master/assets" },   // แผนผังการเก็บไฟล์ (กระดานวาดเอง)
  { href: "/admin/paid-services", keys: ["admin.paid_services"] },   // ศูนย์ AI / API ที่เสียเงิน
  { href: "/website", prefixes: ["website."] },
  { href: "/marketing/skus", prefixes: ["marketing.sku."] },
  // ผลิต → จ่ายงานเหมา: ดู/จ่าย/รับคืน ใช้สิทธิ์สินค้า (เหมือน /api/mo/piecework) · ตั้งรายชื่องานเหมากลาง = production.piecework
  { href: "/master/piecework-dispatch", keys: ["products.view", "products.edit", "production.piecework"] },
  { href: "/master/piecework-jobs", sameAs: "/master/piecework-dispatch" },
  { href: "/master/work-logs", sameAs: "/master/piecework-dispatch" },
  // ออฟฟิศทีม AI — ดูสถานะผู้ช่วยอัตโนมัติ (lib/ai-office.ts AI_OFFICE_PERM · ตอนนี้ = แอดมิน)
  { href: "/master/ai-office", keys: ["ai_office.view", "ai_office.edit"] },
  // ตั๋วงานช่าง Pattern — ดู / เปิดตั๋ว (ฝ่ายออกแบบ) / รับทำ (ช่าง) / จัดการทั้งหมด
  { href: "/design/pattern-tickets", prefixes: ["pattern."] },
  // สตูดิโอแพทเทิร์น (แอปหลัก) — ดู / สร้าง-แก้ / ลบแพทเทิร์น
  { href: "/pattern-studio", prefixes: ["pattern_studio."] },
];

/** หมวดสิทธิ์ของแอปที่ไม่ผูกกับเมนูไหน (โชว์เป็นกลุ่ม "อื่น ๆ ของแอปนี้" กันตกหล่น) */
export const APP_EXTRA_CATEGORIES: Record<string, string[]> = {
  tasks: ["tasks", "📋 งานจัดการ (Tasks)"],
};

const baseHref = (h: string) => h.split("?")[0].replace(/\/+$/, "") || "/";
const hrefMatches = (href: string, rule: string) => href === rule || href.startsWith(`${rule}/`);

/** กฎที่ตรงกับ href (ขึ้นต้นยาวสุดชนะ) */
export function findMenuPermRule(href: string, rules: MenuPermRule[] = MENU_PERMISSION_RULES): MenuPermRule | null {
  const h = baseHref(href);
  let best: MenuPermRule | null = null;
  for (const r of rules) if (hrefMatches(h, r.href) && (!best || r.href.length > best.href.length)) best = r;
  return best;
}

const byOrder = (a: CatalogPerm, b: CatalogPerm) => (a.sort_order ?? 100) - (b.sort_order ?? 100) || a.key.localeCompare(b.key);

function resolveRule(rule: MenuPermRule, catalog: CatalogPerm[]): string[] {
  const out: string[] = [];
  for (const p of rule.prefixes ?? []) for (const c of catalog.filter((x) => x.key.startsWith(p)).sort(byOrder)) if (!out.includes(c.key)) out.push(c.key);
  for (const k of rule.keys ?? []) if (!out.includes(k) && catalog.some((c) => c.key === k)) out.push(k);
  return out;
}

/** สิทธิ์ของเมนูนี้ — keys เรียงพร้อมโชว์ · sameAs = href ของหน้าที่ใช้สิทธิ์ชุดเดียวกัน */
export function menuPermissions(
  menu: { href: string; permission_key?: string | null },
  catalog: CatalogPerm[],
  rules: MenuPermRule[] = MENU_PERMISSION_RULES,
): { keys: string[]; sameAs?: string } {
  const rule = findMenuPermRule(menu.href, rules);
  let keys: string[] = [];
  let sameAs: string | undefined;
  if (rule?.sameAs) {
    const target = rules.find((r) => r.href === rule.sameAs);
    keys = target ? resolveRule(target, catalog) : [];
    sameAs = rule.sameAs;
  } else if (rule) {
    keys = resolveRule(rule, catalog);
  } else if (menu.permission_key && !menu.permission_key.startsWith("app.")) {
    const pk = menu.permission_key;
    const dot = pk.lastIndexOf(".");
    keys = dot > 0 ? catalog.filter((c) => c.key.startsWith(pk.slice(0, dot + 1))).sort(byOrder).map((c) => c.key) : [];
  }
  // สิทธิ์ที่เมนูนี้ใช้กันเข้า ต้องอยู่ในลิสต์เสมอ
  const own = menu.permission_key;
  if (own && !own.startsWith("app.") && !keys.includes(own) && catalog.some((c) => c.key === own)) keys = [own, ...keys];
  return sameAs ? { keys, sameAs } : { keys };
}

/** สิทธิ์ในหมวดของแอปที่ยังไม่อยู่ในเมนูไหน */
export function leftoverPermissions(usedKeys: Iterable<string>, catalog: CatalogPerm[], categories: string[]): string[] {
  const used = new Set(usedKeys);
  return catalog.filter((c) => !used.has(c.key) && !!c.category && categories.includes(c.category)).sort(byOrder).map((c) => c.key);
}
