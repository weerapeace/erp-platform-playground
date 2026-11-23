"use client";

/**
 * IconPicker — ชื่อเดิมของช่องเลือกไอคอน (เคยเป็นตัวเลือกอีโมจิ) · ตอนนี้ส่งต่อไป IconField (ไอคอนเส้นกลาง) ทั้งหมด
 * โค้ดเดิมที่เรียก <IconPicker value onChange /> ได้ไอคอนเส้นอัตโนมัติ · หน้าใหม่ให้ใช้ IconField จาก "@/components/icon/icon-field" ตรง ๆ
 * ค่าที่ได้ = "i:<key>" (อาจมี "#rrggbb" ต่อท้าย = สี) — จุดที่โชว์ต้องวาดด้วย <Icon value /> · อีโมจิเก่ายังอ่าน/โชว์ได้
 */
import { IconField } from "@/components/icon/icon-field";

export function IconPicker({ value, onChange, className, suggestFrom }: {
  value: string; onChange: (v: string) => void; className?: string;
  /** ข้อความไว้แนะนำไอคอน (เช่น ชื่อที่กำลังพิมพ์) */
  suggestFrom?: string;
}) {
  return <IconField value={value} onChange={onChange} suggestFrom={suggestFrom} className={className} />;
}
