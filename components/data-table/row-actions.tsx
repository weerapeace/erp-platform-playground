"use client";

import React from "react";

export type RowActionPlacement = "inline" | "menu" | "hidden";

export type StandardRowActionIconKey =
  | "eye"
  | "printer"
  | "list"
  | "edit"
  | "send"
  | "check"
  | "convert"
  | "x"
  | "ban"
  | "more";

export type RowActionSetting = {
  placement: RowActionPlacement;
  iconKey: StandardRowActionIconKey;
};

export type RowActionMeta = {
  id: string;
  label: string;
  group?: string;
  description?: string;
  defaultPlacement?: RowActionPlacement;
  defaultIconKey?: StandardRowActionIconKey;
};

export const STANDARD_ROW_ACTION_ICONS: { key: StandardRowActionIconKey; label: string }[] = [
  { key: "eye", label: "ดูรายละเอียด" },
  { key: "printer", label: "พิมพ์" },
  { key: "list", label: "รายการ" },
  { key: "edit", label: "แก้ไข" },
  { key: "send", label: "ส่ง" },
  { key: "check", label: "อนุมัติ/ตอบรับ" },
  { key: "convert", label: "แปลงเอกสาร" },
  { key: "x", label: "ปฏิเสธ" },
  { key: "ban", label: "ยกเลิก" },
  { key: "more", label: "อื่น ๆ" },
];

export const QUOTATION_ROW_ACTIONS: RowActionMeta[] = [
  { id: "detail", group: "เปิดดู", label: "ดูรายละเอียด", description: "เปิดหน้ารายละเอียดใบเสนอราคา", defaultPlacement: "inline", defaultIconKey: "eye" },
  { id: "toggle-lines", group: "เปิดดู", label: "เปิด/พับรายการสินค้า", description: "แสดงหรือซ่อนรายการสินค้าใต้แถว", defaultPlacement: "menu", defaultIconKey: "list" },
  { id: "print", group: "เอกสาร", label: "พิมพ์ใบเสนอราคา", description: "เปิดหน้าพิมพ์/ดาวน์โหลดใบเสนอราคา", defaultPlacement: "inline", defaultIconKey: "printer" },
  { id: "edit", group: "แก้ไข", label: "แก้ไข", description: "แก้ไขได้เฉพาะใบเสนอราคาสถานะร่าง", defaultPlacement: "menu", defaultIconKey: "edit" },
  { id: "send", group: "Workflow", label: "ส่งให้ลูกค้า", description: "เปลี่ยนสถานะจากร่างเป็นส่งแล้ว", defaultPlacement: "menu", defaultIconKey: "send" },
  { id: "accept", group: "Workflow", label: "ลูกค้าตอบรับ", description: "บันทึกว่าลูกค้าตอบรับใบเสนอราคา", defaultPlacement: "menu", defaultIconKey: "check" },
  { id: "convert-so", group: "Workflow", label: "แปลงเป็น SO", description: "สร้างใบสั่งขายจากใบเสนอราคา", defaultPlacement: "menu", defaultIconKey: "convert" },
  { id: "reject", group: "Workflow", label: "ปฏิเสธ", description: "บันทึกว่าลูกค้าปฏิเสธใบเสนอราคา", defaultPlacement: "menu", defaultIconKey: "x" },
  { id: "cancel", group: "อันตราย", label: "ยกเลิก", description: "ยกเลิกใบเสนอราคาที่เป็นร่างหรือส่งแล้ว", defaultPlacement: "menu", defaultIconKey: "ban" },
];

export function getModuleRowActionMetas(moduleKey: string): RowActionMeta[] {
  if (moduleKey === "quotations") return QUOTATION_ROW_ACTIONS;
  return [];
}

export function getRowActionStorageKey(tableId?: string, exportEntityType?: string, exportFilename?: string) {
  return `erp-datatable-action-layout:${tableId || exportEntityType || exportFilename || "default"}`;
}

export function getDefaultRowActionSettings(actions: RowActionMeta[]) {
  return Object.fromEntries(actions.map((action) => [
    action.id,
    {
      placement: action.defaultPlacement ?? "menu",
      iconKey: action.defaultIconKey ?? "more",
    },
  ])) as Record<string, RowActionSetting>;
}

export function loadRowActionSettings(storageKey: string, actions: RowActionMeta[]) {
  const defaults = getDefaultRowActionSettings(actions);
  if (typeof window === "undefined") return defaults;
  try {
    const raw = JSON.parse(window.localStorage.getItem(storageKey) || "{}") as Record<string, Partial<RowActionSetting> | RowActionPlacement>;
    const normalized = Object.fromEntries(Object.entries(raw).map(([id, value]) => {
      if (typeof value === "string") {
        return [id, { placement: value, iconKey: defaults[id]?.iconKey ?? "more" }];
      }
      return [id, { placement: value.placement ?? defaults[id]?.placement ?? "menu", iconKey: value.iconKey ?? defaults[id]?.iconKey ?? "more" }];
    })) as Record<string, RowActionSetting>;
    return { ...defaults, ...normalized };
  } catch {
    return defaults;
  }
}

export function saveRowActionSettings(storageKey: string, settings: Record<string, RowActionSetting>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(settings));
}

export function resetRowActionSettings(storageKey: string, actions: RowActionMeta[]) {
  const defaults = getDefaultRowActionSettings(actions);
  if (typeof window !== "undefined") window.localStorage.removeItem(storageKey);
  return defaults;
}

export function renderStandardRowActionIcon(iconKey?: StandardRowActionIconKey, className = "h-3.5 w-3.5") {
  const key = iconKey ?? "more";
  const common = { className, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (key) {
    case "eye":
      return <svg {...common}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>;
    case "printer":
      return <svg {...common}><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></svg>;
    case "list":
      return <svg {...common}><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></svg>;
    case "edit":
      return <svg {...common}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
    case "send":
      return <svg {...common}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>;
    case "check":
      return <svg {...common}><path d="M20 6 9 17l-5-5" /></svg>;
    case "convert":
      return <svg {...common}><path d="M7 7h11l-3-3" /><path d="M17 17H6l3 3" /><path d="M18 7l-3 3" /><path d="M6 17l3-3" /></svg>;
    case "x":
      return <svg {...common}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>;
    case "ban":
      return <svg {...common}><circle cx="12" cy="12" r="10" /><path d="m4.9 4.9 14.2 14.2" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" /></svg>;
  }
}
