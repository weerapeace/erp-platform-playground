/**
 * หน้าแบรนด์ — รายการหมวดเครื่องมือ + ลิงก์ (แก้ที่นี่ที่เดียว หน้าแบรนด์ทุกแบรนด์เปลี่ยนตาม)
 * ทุกลิงก์ = หน้าเดิมที่มีอยู่แล้ว (ไม่สร้างหน้าใหม่ซ้ำ) · brandAware = หน้านั้นรับ ?brand=<id> แล้วกรองแบรนด์ให้เอง
 * perm = สิทธิ์ที่ต้องมี (null = ใครเข้าแอปได้ก็เห็น — ตรงกับ permission_key ของเมนูหน้านั้น) · ไม่มีสิทธิ์ = ไม่โชว์ลิงก์
 * เพิ่มหน้าที่รับแบรนด์ได้แล้ว → เปลี่ยน href ให้ส่ง brand + ตั้ง brandAware: true
 */
export type HubLink = { label: string; href: (brandId: string) => string; perm: string | null; brandAware?: boolean };
export type HubToolGroup = { key: string; label: string; icon: string; links: HubLink[] };

const q = (id: string) => encodeURIComponent(id);

export const HUB_TOOL_GROUPS: HubToolGroup[] = [
  {
    key: "shops", label: "ร้านค้าออนไลน์", icon: "store", links: [
      { label: "หน้าร้าน (ภาพรวมทุกร้าน)", href: (id) => `/master/platform-catalog?brand=${q(id)}&view=shop`, perm: "products.platforms.view", brandAware: true },
      { label: "จับคู่สินค้าบนร้าน", href: (id) => `/master/platform-catalog?brand=${q(id)}`, perm: "products.platforms.view", brandAware: true },
      { label: "ลงสินค้าขึ้นร้าน", href: () => "/master/platform-listing", perm: "products.platforms.view" },
      { label: "สินค้าบนเว็บร้าน", href: () => "/website", perm: "website.access" },
    ],
  },
  {
    key: "orders", label: "ออเดอร์ + ส่งของ", icon: "truck", links: [
      { label: "ศูนย์ออเดอร์ออนไลน์", href: (id) => `/master/platform-orders?brand=${q(id)}`, perm: "platform_orders.view", brandAware: true },
      { label: "สินค้าที่ขายได้", href: () => "/master/platform-sales", perm: "platform_orders.view" },
      { label: "แดชบอร์ดแพลตฟอร์ม", href: () => "/master/platform-dashboard", perm: "products.platforms.view" },
    ],
  },
  {
    key: "products", label: "สินค้า", icon: "package", links: [
      { label: "Parent SKU (รุ่นสินค้า)", href: () => "/master/parent-skus", perm: null },
      { label: "SKU (สี / ตัวเลือก)", href: () => "/master/skus", perm: null },
      { label: "หมวดกลาง + จับคู่หมวดร้าน", href: () => "/master/platform-categories", perm: "products.platforms.view" },
      { label: "คลังรูป / ไฟล์", href: () => "/master/assets", perm: "assets.view" },
    ],
  },
  {
    key: "content", label: "คอนเทนต์ + การตลาด", icon: "campaign", links: [
      { label: "คอนเทนต์ + คิวโพสต์", href: () => "/tasks/content", perm: null },
      { label: "ปฏิทินคอนเทนต์", href: () => "/tasks/content-calendar", perm: null },
      { label: "วางแผนคอนเทนต์", href: () => "/marketing/content-plan", perm: "tasks.view" },
      { label: "แดชบอร์ดการตลาด", href: () => "/marketing/dashboard", perm: "marketing.dashboard.view" },
    ],
  },
  {
    key: "design", label: "ออกแบบ + ผลิต", icon: "design", links: [
      { label: "Design Dashboard", href: () => "/master/design-dashboard", perm: null },
      { label: "ใบงานออกแบบ (Design Sheets)", href: () => "/master/design-sheets", perm: null },
      { label: "งานทั้งหมด (ทีมครีเอทีฟ)", href: () => "/tasks", perm: null },
      { label: "ใบสั่งผลิต", href: () => "/master/manufacturing-orders", perm: null },
    ],
  },
  {
    key: "settings", label: "ตั้งค่าแบรนด์", icon: "settings", links: [
      { label: "บัญชีร้าน + การเชื่อมต่อ", href: (id) => `/admin/platform-accounts?brand=${q(id)}`, perm: "products.platforms.manage_accounts", brandAware: true },
      { label: "โลโก้ / สีแบรนด์ / ลูกค้าประจำ", href: () => "/master/brands", perm: null },
    ],
  },
];

/** ลิงก์ของชิปช่องทาง: เชื่อมแล้ว (ร้านขาย) = หน้าร้านของร้านนั้น · Facebook = คอนเทนต์ · ยังไม่เชื่อม/หมดอายุ = หน้าเชื่อมต่อ */
export function channelHref(brandId: string, code: string, connected: boolean, selling: boolean): string {
  if (!connected) return `/admin/platform-accounts?brand=${q(brandId)}`;
  if (!selling) return "/tasks/content";
  return `/master/platform-catalog?brand=${q(brandId)}&platform=${q(code)}&view=shop`;
}
