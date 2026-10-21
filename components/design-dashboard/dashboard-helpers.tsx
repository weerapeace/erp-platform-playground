"use client";
// Design Dashboard: ชนิด/ค่าคงที่/ตัวช่วย (แบรนด์ · กำหนดส่ง · ประวัติ) + ชิ้นการ์ดเล็ก — แยกจาก index.tsx (Y1)
import type { ReactNode } from "react";
import type { AuditLogEntry } from "@/app/api/audit-logs/route";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import { tr } from "@/lib/lang";
import { useT } from "@/components/i18n";
import { isOwnBrandJob, type StatusMeta, type WfStatusRow } from "@/lib/design-sheets-meta";
import { withImageWidth } from "@/lib/r2-image";
import { HoverPreview } from "@/components/hover-image";

export const SUMMARY_MAX = 100;   // ใบงานต่อสรุป (ตรงกับกฎ normalizeSummaryDoc)

export type Tone = "danger" | "warn" | "good" | "done" | "normal";

export type ListResponse = { data: DesignSheetListItem[]; total: number; error: string | null };

export type StatusResponse = { data: WfStatusRow[]; error: string | null };

export type AuditResponse = { data: AuditLogEntry[]; total: number; error: string | null };

export type MoveMessage = { type: "success" | "error"; text: string };

export type BrandSummary = {
  key: string;
  id: string | null;
  name: string;
  color: string;
  total: number;
  active: number;
  urgent: number;
  own: boolean;   // แบรนด์เรา (ไม่ได้ติ๊ก 👤 งานลูกค้า ในหน้าแบรนด์)
};

export type StatusColumn = {
  key: string;
  label: string;
  color: string;
  old?: boolean;
  notForOwn?: boolean;   // สถานะเฉพาะงานลูกค้า แต่มีงานแบรนด์เราค้างอยู่ → โชว์พร้อมคำเตือน (งานไม่หายเงียบ ๆ)
};
// คอลัมน์บนบอร์ด = สถานะ + ใบงานในสถานะนั้น
export type BoardColumn = StatusColumn & { sheets: DesignSheetListItem[] };
// มุมมองต่อกลุ่มแบรนด์ (แถบแบรนด์): 4 อันดับแรกที่ไม่ซ่อน + ที่เหลือ ("แบรนด์อื่นๆ") + ยอดรวมของกลุ่ม
export type BrandGroupView = { top: BrandSummary[]; others: BrandSummary[]; othersSelected: BrandSummary | null; active: number; total: number; count: number };

// แถบแบรนด์แบ่ง 2 กลุ่ม (เจ้าของเลือก: ไม่ปนกัน) — งานลูกค้า = บอร์ดครบทุกสถานะ · แบรนด์เรา = ตัดสถานะ "เฉพาะงานลูกค้า"
export type BrandGroup = "customer" | "own";

export const GROUP_KEY: Record<BrandGroup, string> = { customer: "GROUP:customer", own: "GROUP:own" };

export const GROUP_LABEL: Record<BrandGroup, { title: string; all: string; icon: string }> = {
  customer: { get title() { return tr("งานลูกค้า", "Customer jobs"); }, get all() { return tr("ทั้งหมดงานลูกค้า", "All customer jobs"); }, icon: "👤" },
  own: { get title() { return tr("แบรนด์เรา", "Our brands"); }, get all() { return tr("ทั้งหมดแบรนด์เรา", "All our brands"); }, icon: "🏷️" },
};

export const BRAND_GROUPS: BrandGroup[] = ["customer", "own"];

export const DEFAULT_BRAND_COLOR = "#94a3b8";

// คอลัมน์สถานะที่ "ซ่อนเป็นค่าเริ่มต้น" บนบอร์ด (เจ้าของขอ: ยกเลิก + ทำตัวอย่างใบเดียว) — ผู้ใช้เปิดกลับได้ จำรายคน
export const DEFAULT_HIDDEN_COLS = ["cancelled", "state_8"];

export const DASHBOARD_LIMIT = 500;

export async function readApi<T extends { error: string | null }>(response: Response, fallbackMessage: string): Promise<T> {
  const json = await response.json() as T;
  if (!response.ok || json.error) throw new Error(json.error || fallbackMessage);
  return json;
}

export function safeColor(color: string | null | undefined): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_BRAND_COLOR;
}

export function brandKeyOf(sheet: DesignSheetListItem): string {
  return sheet.brand_id ?? "__no_brand__";
}

export function brandNameOf(sheet: DesignSheetListItem): string {
  return sheet.brand_name ?? tr("ไม่ระบุแบรนด์", "No brand");
}

// ใบงานนี้เป็นของแบรนด์เราไหม (กฎกลาง isOwnBrandJob) — ไม่ระบุแบรนด์ = งานลูกค้า
export function sheetIsOwn(sheet: DesignSheetListItem): boolean {
  return isOwnBrandJob(sheet.brand_id && sheet.brand_is_customer_job !== null ? { is_customer_job: sheet.brand_is_customer_job } : null);
}

export function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function isUrgent(sheet: DesignSheetListItem, statusMeta: StatusMeta): boolean {
  if (statusMeta.finished.has(sheet.status)) return false;
  const days = daysUntil(sheet.deadline);
  return days !== null && days <= 2;
}

export function deadlineTone(sheet: DesignSheetListItem, statusMeta: StatusMeta): Tone {
  if (statusMeta.finished.has(sheet.status)) return sheet.status === "sku_created" ? "done" : "good";
  const days = daysUntil(sheet.deadline);
  if (days === null) return "normal";
  if (days <= 0) return "danger";
  if (days <= 2) return "warn";
  return "normal";
}

export function deadlineLabel(sheet: DesignSheetListItem, statusMeta: StatusMeta): string {
  if (statusMeta.finished.has(sheet.status)) return tr("ปิดงาน", "Closed");
  const days = daysUntil(sheet.deadline);
  if (days === null) return tr("ไม่มีกำหนด", "No deadline");
  if (days < 0) return tr(`เกิน ${Math.abs(days)} วัน`, `${Math.abs(days)}d overdue`);
  if (days === 0) return tr("วันนี้", "Today");
  if (days === 1) return tr("พรุ่งนี้", "Tomorrow");
  return tr(`${days} วัน`, `${days}d`);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export function auditActionLabel(action: string): string {
  if (action === "create") return tr("สร้าง", "Created");
  if (action === "update") return tr("แก้ไข", "Edited");
  if (action === "delete") return tr("ลบ", "Deleted");
  if (action === "archive") return tr("เก็บเข้ากรุ", "Archived");
  if (action === "restore") return tr("กู้คืน", "Restored");
  return action;
}

export function auditText(row: AuditLogEntry): string {
  const metadata = row.metadata ?? {};
  const code = typeof metadata.code === "string" ? metadata.code : null;
  const name = typeof metadata.name === "string" ? metadata.name : null;
  const label = code || name || row.entity_id?.slice(0, 8) || tr("รายการ", "item");
  return `${auditActionLabel(row.action)} ${label}`;
}

export function sheetCoverUrl(sheet: DesignSheetListItem): string | null {
  return withImageWidth(sheet.cover_url, 220);
}

// ชี้ที่การ์ดเปิดอยู่ = รูปบนการ์ดไม่เด้งรูปใหญ่เอง (กันเด้งซ้อนกับกล่อง 🪟 ชี้ที่การ์ด) · ปิด = ชี้ที่รูปแบบเดิม
export function CoverPreview({ off, url, children }: { off: boolean; url: string | null; children: ReactNode }) {
  return off ? <>{children}</> : <HoverPreview url={url} previewW={640}>{children}</HoverPreview>;
}

export function CardDeadline({ tone, label }: { tone: Tone; label: string }) {
  const styles: Record<Tone, string> = {
    danger: "bg-rose-500 text-rose-700",
    warn: "bg-amber-500 text-amber-700",
    good: "bg-emerald-500 text-emerald-700",
    done: "bg-violet-500 text-violet-700",
    normal: "bg-slate-300 text-slate-500",
  };
  const [dot, text] = styles[tone].split(" ");
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

// ติ๊กมุมการ์ดตอนอยู่ในโหมด "ส่งขึ้นกระดาน" (ไม่รับคลิกเอง — ให้การ์ดทั้งใบเป็นตัวกด)
export function PickBadge({ checked }: { checked: boolean }) {
  return (
    <span className={`pointer-events-none absolute left-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-md border text-xs font-bold shadow-sm ${checked ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white/90 text-transparent"}`}>
      ✓
    </span>
  );
}

// ทับการ์ดที่เลือกไม่ได้ในโหมดสรุปงาน (ปิดงานแล้ว) — จางลง + บอกเหตุผล
export function NoPickVeil() {
  const t = useT();
  return (
    <span className="pointer-events-none absolute inset-0 z-10 flex items-start justify-end bg-white/60 p-1">
      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">{t("ปิดงานแล้ว", "Closed")}</span>
    </span>
  );
}

export function LoadingCard() {
  return (
    <div className="rounded-lg border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-8 w-14 animate-pulse rounded bg-slate-200" />
      <div className="mt-3 h-3 w-32 animate-pulse rounded bg-slate-100" />
    </div>
  );
}
