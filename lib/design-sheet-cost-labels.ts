// ชื่อแท็บตีราคาของใบงานออกแบบ (ของกลาง)
// แท็บ "ทั่วไป" = คีย์ "" (บรรทัดที่ parent_code เป็น null) — ตั้งชื่อเองได้ต่อใบ (design_sheets.cost_general_label)
// คีย์ไม่เปลี่ยน (ยังเป็น "") → รอบเสนอราคา/เวอร์ชัน/ตีราคาสั่งร้าน ที่ผูกแท็บนี้ไว้ไม่กระทบ แค่ชื่อที่แสดงเปลี่ยน

import { tr } from "@/lib/lang";

export const DEFAULT_GENERAL_LABEL = "ทั่วไป";

/** ชื่อแท็บทั่วไปของใบ — ไม่ได้ตั้ง/ว่าง = "ทั่วไป" (โหมดอังกฤษ = "General") · ชื่อที่ตั้งเองคงตามที่พิมพ์ */
export const generalLabelOf = (custom: string | null | undefined): string => (custom ?? "").trim() || tr(DEFAULT_GENERAL_LABEL, "General");

/** ชื่อแสดงของแท็บตีราคา: "" = ชื่อแท็บทั่วไป · อื่น ๆ = รหัส Parent / ชื่อเวอร์ชันตามเดิม */
export const costTabLabel = (key: string | null | undefined, generalLabel: string): string => ((key ?? "") === "" ? generalLabel : String(key));
