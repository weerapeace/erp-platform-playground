/**
 * 👀 "ดูแบบคนนี้" (ของกลาง) — คนนี้/ตำแหน่งนี้ เห็นเมนูไหนบนแถบแอป และถ้าไม่เห็น เพราะอะไร
 * (ไฟล์ pure ห้ามใส่ "use client" — เทสต์ import ได้)
 *
 * รวมกฎ 3 ชั้นที่แถบเมนูแอปเดี่ยว (app/app/[appKey]/page.tsx) ใช้จริง ตามลำดับ:
 *   1) ซ่อนในแอปนี้     — app_overrides[appKey].place = "hidden" (เมนูย่อยหายตามเมนูแม่)   → lib/app-menu-layout
 *   2) ใครเห็นเมนู       — erp_menu_items.audience (ตำแหน่ง / รายคน / ซ่อนจากบางคน)       → lib/menu-audience
 *   3) สิทธิ์ของเมนู      — permission_key (ไม่มีสิทธิ์ = ไม่โชว์ และเข้าหน้าไม่ได้จริง)
 * แอดมินผ่านชั้น 2+3 เสมอ (เหมือน can() / menuVisibleTo) แต่ชั้น 1 ซ่อนจากทุกคน
 *
 * "ยังเข้าได้ถ้ามีลิงก์" = ซ่อนเมนูแล้ว (ชั้น 1 หรือ 2) แต่คนนี้ยังมีสิทธิ์ → ถ้ารู้ลิงก์ก็เปิดหน้านั้นได้ (ซ่อน ≠ ห้ามเข้า)
 * ใช้ที่: ⚙️ ตั้งค่าแอปเดี่ยว → แท็บ "เมนูและคนเห็น" (components/app-settings-panel/menus-tab.tsx)
 */
import { explainMenuFor } from "@/lib/menu-audience";
import { menuPlace, type AppMenuPlace } from "@/lib/app-menu-layout";

/** คนที่จะดูแทน — ดูแทน "ทั้งตำแหน่ง" ให้ id = null (รายชื่อรายคนไม่นับ) · perms = null ยังไม่รู้สิทธิ์ (ข้ามชั้น 3 ไว้ก่อน) */
export type MenuViewer = { id: string | null; role: string | null; perms: ReadonlySet<string> | null };

export type MenuHiddenReason =
  | "app_hidden"     // ซ่อนไว้ในแอปนี้ (ทุกคน)
  | "parent_hidden"  // เมนูแม่ถูกซ่อน
  | "user_hide"      // ซ่อนจากคนนี้
  | "role_no"        // ตำแหน่งนี้ไม่ได้ถูกเลือกให้เห็น
  | "list_only"      // เห็นเฉพาะคนในรายชื่อ
  | "no_perm";       // ยังไม่มีสิทธิ์ของเมนู

export type MenuVisibility = {
  visible: boolean;
  /** ที่อยู่บนแถบของแอปนี้ (เมนูย่อยใช้ของเมนูแม่) */
  place: AppMenuPlace;
  reason: MenuHiddenReason | null;
  /** ไม่มีสิทธิ์อะไร (เฉพาะ reason = no_perm) */
  missingPerm: string | null;
  /** ซ่อนอยู่ แต่คนนี้ยังมีสิทธิ์เปิดหน้านั้นถ้ารู้ลิงก์ */
  reachableByLink: boolean;
};

type MenuLike = { id: string; permission_key?: string | null; parent_id?: string | null; audience?: unknown; app_overrides?: unknown };

/** ตำแหน่งสมมติสำหรับ "ดูแทนทั้งตำแหน่ง" — ไม่ตรงกับ user id จริงคนไหน */
const ROLE_PREVIEW_ID = "__role_preview__";

export function hasMenuPerm(item: { permission_key?: string | null }, viewer: MenuViewer): boolean {
  if (!item.permission_key || viewer.role === "admin" || !viewer.perms) return true;
  return viewer.perms.has(item.permission_key);
}

/**
 * คนนี้เห็นเมนูนี้ไหม — items = เมนูทั้งหมดของแอป (ใช้หาเมนูแม่)
 * audienceOf / placeOf ส่งค่าร่าง (ยังไม่บันทึก) มาแทนค่าในฐานข้อมูลได้ เพื่อดูผลก่อนกดบันทึก
 */
export function menuVisibilityFor<T extends MenuLike>(
  item: T,
  appKey: string,
  viewer: MenuViewer,
  opts: {
    byId?: ReadonlyMap<string, T>;
    audienceOf?: (it: T) => unknown;
    placeOf?: (it: T) => AppMenuPlace;
  } = {},
): MenuVisibility {
  const aud = opts.audienceOf ?? ((it: T) => it.audience);
  const place = opts.placeOf ?? ((it: T) => menuPlace(it, appKey));
  const parent = item.parent_id ? opts.byId?.get(item.parent_id) ?? null : null;
  const where = parent ? place(parent) : place(item);
  const perm = hasMenuPerm(item, viewer);
  const hidden = (reason: MenuHiddenReason, reachable: boolean): MenuVisibility =>
    ({ visible: false, place: where, reason, missingPerm: reason === "no_perm" ? item.permission_key ?? null : null, reachableByLink: reachable });

  // 1) ซ่อนในแอปนี้ — มีผลกับทุกคน (รวมแอดมิน)
  if (place(item) === "hidden") return hidden("app_hidden", perm);
  if (parent && place(parent) === "hidden") return hidden("parent_hidden", perm);
  // 2) ใครเห็นเมนู
  const ex = explainMenuFor(aud(item), { id: viewer.id ?? ROLE_PREVIEW_ID, role: viewer.role });
  if (!ex.visible) {
    const reason: MenuHiddenReason = ex.reason === "user_hide" ? "user_hide" : ex.reason === "list_only" ? "list_only" : "role_no";
    return hidden(reason, perm);
  }
  // 3) สิทธิ์ของเมนู
  if (!perm) return hidden("no_perm", false);
  return { visible: true, place: where, reason: null, missingPerm: null, reachableByLink: false };
}

export type MenuPreview<T> = {
  /** เมนูหลักที่อยู่บนแถบ */
  bar: T[];
  /** เมนูหลักในปุ่ม "เพิ่มเติม ▾" */
  more: T[];
  /** เมนูที่ไม่เห็น (ทั้งเมนูหลักและเมนูย่อย) + เหตุผล */
  hidden: { item: T; vis: MenuVisibility }[];
  /** จำนวนเมนูย่อยที่เห็น ต่อเมนูแม่ */
  kidsShown: Record<string, number>;
  /** เห็นกี่เมนู จากทั้งหมดกี่เมนู */
  shown: number;
  total: number;
};

/** แถบเมนูแบบที่คนนี้เห็น — orderedTop = เมนูหลักเรียงตามลำดับแอป · items = ทั้งหมด (รวมเมนูย่อย) */
export function previewMenusFor<T extends MenuLike>(
  items: T[],
  orderedTop: T[],
  appKey: string,
  viewer: MenuViewer,
  opts: { audienceOf?: (it: T) => unknown; placeOf?: (it: T) => AppMenuPlace } = {},
): MenuPreview<T> {
  const byId = new Map(items.map((it) => [it.id, it]));
  const vis = new Map(items.map((it) => [it.id, menuVisibilityFor(it, appKey, viewer, { ...opts, byId })]));
  const isTop = (it: T) => !it.parent_id || !byId.has(it.parent_id);
  const bar: T[] = [], more: T[] = [];
  for (const it of orderedTop) {
    const v = vis.get(it.id);
    if (!v?.visible) continue;
    (v.place === "more" ? more : bar).push(it);
  }
  const kidsShown: Record<string, number> = {};
  for (const it of items) {
    if (isTop(it) || !vis.get(it.id)?.visible || !vis.get(it.parent_id!)?.visible) continue;
    kidsShown[it.parent_id!] = (kidsShown[it.parent_id!] ?? 0) + 1;
  }
  // ลำดับเมนูที่ไม่เห็น: ตามลำดับแอป (เมนูย่อยต่อท้ายเมนูแม่)
  const order = orderedTop.flatMap((p) => [p, ...items.filter((k) => k.parent_id === p.id)]);
  const hidden = order.filter((it) => !vis.get(it.id)!.visible).map((it) => ({ item: it, vis: vis.get(it.id)! }));
  const shown = order.filter((it) => vis.get(it.id)!.visible && (isTop(it) || vis.get(it.parent_id!)?.visible)).length;
  return { bar, more, hidden, kidsShown, shown, total: order.length };
}

/** คำอธิบายภาษาคน */
export function hiddenReasonText(v: MenuVisibility, permLabel: (key: string) => string = (k) => k): string {
  switch (v.reason) {
    case "app_hidden": return "ซ่อนไว้ในแอปนี้ (ทุกคน)";
    case "parent_hidden": return "เมนูแม่ถูกซ่อน";
    case "user_hide": return "ตั้งซ่อนจากคนนี้";
    case "role_no": return "ตำแหน่งนี้ไม่ได้ถูกเลือกให้เห็น";
    case "list_only": return "เห็นเฉพาะคนในรายชื่อ";
    case "no_perm": return `ยังไม่มีสิทธิ์ “${permLabel(v.missingPerm ?? "")}”`;
    default: return "";
  }
}
