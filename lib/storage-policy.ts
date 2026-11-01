/**
 * 🗄 กฎที่เก็บไฟล์กลาง (Storage Policy) — ไฟล์หมวดไหนเก็บที่ไหน: R2 / Supabase Storage / Google Drive
 *
 * กฎเก็บในตาราง erp_storage_rules (แก้ได้ที่หน้า /master/storage-rules) · ไฟล์นี้ = ชนิดข้อมูล + กฎตรวจ (pure)
 *   ไม่มี "use client" และไม่มี import ฝั่งเซิร์ฟเวอร์ → ใช้ได้ทั้งหน้าจอและ API
 *
 * หลักเลือกที่เก็บ:
 *   ต้องโชว์บนจอบ่อย → R2 · ลับ/ต้องผูกสิทธิ์ → Supabase · คนต้องเปิดแก้ในโปรแกรม → Drive
 * ล็อก = allowed_providers มีตัวเดียว (ฐานข้อมูลกันเปลี่ยนด้วย check constraint อีกชั้น)
 *
 * ⚠️ เฟส 1: กฎยังไม่บังคับทางอัปไฟล์ — ทางอัปแต่ละจุดยังส่งไฟล์ตามที่เขียนไว้ในโค้ด (STORAGE_WIRING)
 *   หน้าตั้งค่าจึงโชว์ "ตอนนี้ระบบส่งไปที่" ตามจริง ไม่ให้เข้าใจผิดว่าเปลี่ยนกฎแล้วมีผลทันที
 * คู่มือ: docs/storage-policy.md
 */

export type StorageProvider = "r2" | "supabase" | "drive";
export const STORAGE_PROVIDER_KEYS: StorageProvider[] = ["r2", "supabase", "drive"];

export type StorageProviderInfo = {
  label: string; en: string;
  /** เก่งเรื่อง (ภาษาคน) */
  goodAt: string; goodAtEn: string;
  /** ไม่เหมาะกับ */
  notFor: string; notForEn: string;
  /** ไอคอนเส้น (lib/erp-icons) */
  icon: string;
  /** สีป้าย (tailwind) */
  badge: string;
};

export const STORAGE_PROVIDERS: Record<StorageProvider, StorageProviderInfo> = {
  r2: {
    label: "R2", en: "R2",
    goodAt: "เปิดรูปเร็ว ไม่คิดค่าดึงไฟล์ ย่อรูปตอนแสดงได้", goodAtEn: "Fast images, no download fees, resized on the fly",
    notFor: "ไฟล์ลับ — ลิงก์เปิดได้โดยไม่ต้อง login", notForEn: "Private files — links open without login",
    icon: "photo", badge: "bg-orange-50 text-orange-700 border-orange-200",
  },
  supabase: {
    label: "Supabase", en: "Supabase",
    goodAt: "ไฟล์ลับ เปิดได้เฉพาะคนที่มีสิทธิ์ ลิงก์หมดอายุเอง", goodAtEn: "Private files, permission-checked, expiring links",
    notFor: "รูปที่โชว์บ่อย — คิดค่าดึงไฟล์เมื่อเกินโควตา", notForEn: "Frequently shown images — download fees over quota",
    icon: "lock", badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  drive: {
    label: "Google Drive", en: "Google Drive",
    goodAt: "ไฟล์ต้นฉบับที่ทีมเปิดแก้ในโปรแกรม พื้นที่เยอะ", goodAtEn: "Source files the team edits in desktop apps, lots of space",
    notFor: "รูปบนเว็บ — ช้าและจำกัดจำนวนครั้งที่เรียก", notForEn: "Web images — slow and rate-limited",
    icon: "folder", badge: "bg-sky-50 text-sky-700 border-sky-200",
  },
};

export const isStorageProvider = (v: unknown): v is StorageProvider =>
  typeof v === "string" && (STORAGE_PROVIDER_KEYS as string[]).includes(v);

export type StorageRule = {
  id: string;
  rule_key: string;
  label: string;
  label_en: string | null;
  description: string | null;
  file_types: string[];
  provider: StorageProvider;
  allowed_providers: StorageProvider[];
  lock_reason: string | null;
  max_bytes: number | null;
  sort_order: number;
  updated_by: string | null;
  updated_at: string;
};

export const STORAGE_RULE_SELECT =
  "id, rule_key, label, label_en, description, file_types, provider, allowed_providers, lock_reason, max_bytes, sort_order, updated_by, updated_at";

/** ล็อก = เลือกที่เก็บได้ทางเดียว */
export const isRuleLocked = (r: Pick<StorageRule, "allowed_providers">) => r.allowed_providers.length <= 1;

/**
 * ทางอัปจริงในโค้ดตอนนี้ส่งไฟล์หมวดนี้ไปที่ไหน — อัปเดตเมื่อแก้ทางอัป
 *   "rule" = ทางอัปของหมวดนี้อ่านกฎจากตารางแล้ว (เฟส 2) → เปลี่ยนกฎในหน้าตั้งค่ามีผลทันที
 */
export const STORAGE_WIRING: Record<string, StorageProvider | "rule"> = {
  product_images: "r2",          // /api/attachments
  storefront_media: "r2",        // /api/admin/upload + /api/website/video-upload
  library_uploads: "r2",         // /api/assets + /api/admin/upload (ลงคลังอัตโนมัติ)
  design_previews: "r2",         // รูปการ์ด Artwork/งานพิมพ์ (/api/assets)
  artwork_source: "drive",       // /api/drive/upload (uploadArtworkToDrive)
  print_files: "drive",          // lib/print-file-policy.ts กันไม่ให้ลง R2
  nesting_source_png: "r2",      // /api/nesting-jobs/print-files
  task_attachments: "r2",        // /api/admin/upload → /api/creative-tasks/[id]/attachments (+ ก๊อปขึ้น Drive ถ้าเปิดโฟลเดอร์)
  board_images: "r2",            // /api/canvas-sketch
  record_files: "supabase",      // bucket record-files (/api/record-files)
  supplier_bills: "r2",          // หน้ารับของ /api/purchasing/receive (bill_doc_r2_key) — กฎแนะนำ Supabase
  finance_private: "supabase",   // bucket invoices + payment-slips
  customer_print_uploads: "supabase", // bucket print-uploads
  customer_review_return: "r2",  // lib/website-reviews-server + website-returns-server
};

export type RuleStatus =
  | { kind: "follows" }                                 // ทางอัปอ่านกฎแล้ว
  | { kind: "matches"; actual: StorageProvider }        // ทางอัปตั้งไว้ในโค้ด ตรงกับกฎ
  | { kind: "mismatch"; actual: StorageProvider }       // ทางอัปยังส่งไปที่อื่น
  | { kind: "unwired" };                                // ยังไม่มีช่องอัปที่ใช้หมวดนี้

export function ruleStatus(rule: Pick<StorageRule, "rule_key" | "provider">, wiring: Record<string, StorageProvider | "rule"> = STORAGE_WIRING): RuleStatus {
  const actual = wiring[rule.rule_key];
  if (!actual) return { kind: "unwired" };
  if (actual === "rule") return { kind: "follows" };
  return actual === rule.provider ? { kind: "matches", actual } : { kind: "mismatch", actual };
}

export type StorageRulePatch = { provider?: unknown; max_bytes?: unknown };

/**
 * ตรวจค่าที่จะแก้ — ผ่าน = { patch } (เฉพาะช่องที่เปลี่ยนจริง) · ไม่ผ่าน = { error } ข้อความภาษาคน
 * ใช้ทั้งหน้าจอ (ก่อนกดบันทึก) และ API (ก่อนเขียนฐานข้อมูล)
 */
export function validateRulePatch(
  rule: Pick<StorageRule, "provider" | "allowed_providers" | "max_bytes" | "lock_reason">,
  input: StorageRulePatch,
): { patch: { provider?: StorageProvider; max_bytes?: number | null }; error?: undefined } | { error: string; patch?: undefined } {
  const patch: { provider?: StorageProvider; max_bytes?: number | null } = {};
  if (input.provider !== undefined && input.provider !== rule.provider) {
    if (!isStorageProvider(input.provider)) return { error: "ที่เก็บไม่ถูกต้อง (ต้องเป็น R2 / Supabase / Google Drive)" };
    if (isRuleLocked(rule)) return { error: `หมวดนี้ล็อกไว้ เปลี่ยนที่เก็บไม่ได้${rule.lock_reason ? ` — ${rule.lock_reason}` : ""}` };
    if (!rule.allowed_providers.includes(input.provider)) return { error: `หมวดนี้เลือกได้เฉพาะ ${rule.allowed_providers.map((p) => STORAGE_PROVIDERS[p].label).join(" / ")}` };
    patch.provider = input.provider;
  }
  if (input.max_bytes !== undefined) {
    const raw = input.max_bytes;
    const next = raw === null || raw === "" ? null : Number(raw);
    if (next !== null && (!Number.isFinite(next) || next <= 0)) return { error: "ขนาดสูงสุดต้องเป็นตัวเลขมากกว่า 0 (เว้นว่าง = ไม่กำหนด)" };
    const rounded = next === null ? null : Math.round(next);
    if (rounded !== rule.max_bytes) patch.max_bytes = rounded;
  }
  return { patch };
}

/** พื้นที่ที่ใช้นอก R2 (นับสดทุกครั้ง — ข้อมูลน้อย เร็ว) · R2 นับแยกเพราะไฟล์เยอะ (/api/assets/storage?refresh=1) */
export type OtherStorageUsage = {
  supabase: { buckets: { bucket_id: string; total_bytes: number; total_objects: number }[]; total_bytes: number; total_objects: number } | null;
  /** Drive วัดขนาดรวมจาก API ไม่ได้ง่าย → นับจำนวนที่ระบบผูกไว้แทน */
  drive: { asset_links: number; task_folders: number; task_files: number } | null;
};

/** ขนาดเป็น MB อ่านง่าย (null = ไม่กำหนด) */
export const maxBytesLabel = (n: number | null) => (n ? `${Math.round((n / 1024 / 1024) * 10) / 10} MB` : null);

/** นามสกุลที่รับ อ่านง่าย (ว่าง = ทุกชนิด) */
export const fileTypesLabel = (types: string[]) => (types.length ? types.map((x) => x.toUpperCase()).join(" · ") : null);
