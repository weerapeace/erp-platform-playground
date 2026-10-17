"use client";
/**
 * 🧩 ทะเบียนหน้า "ดูรายละเอียด" ที่ออกแบบเฉพาะโมดูล (ของกลาง) — moduleKey → หน้าดู
 * --------------------------------------------------------------------------
 * กล่องดูข้อมูลกลาง (MasterCRUD drawer · MasterRecordDrawer) ใช้หน้าจากทะเบียนนี้แทนแท็บฟิลด์มาตรฐาน
 * เฉพาะตอน "ดู" ระเบียนที่บันทึกแล้ว — ฟอร์มแก้ไข/สร้างใหม่ + ปุ่มล่าง (ก่อนหน้า/ถัดไป/ลบ/แก้ไข) ยังเป็นของกลาง
 * → ได้ทุกทางที่เปิดโมดูลนั้น (หน้าตาราง /m/<module> · drawer ซ้อนจากป๊อปอื่น) โดยไม่ต้องแก้ทีละที่
 *
 * เพิ่มโมดูลใหม่: ทำหน้าดูที่รับ ctx: DetailViewCtx (บันทึกผ่าน ctx.save เท่านั้น — PATCH + audit ที่ API)
 *   แล้วลงทะเบียนที่นี่แบบ dynamic import (ไม่ให้โค้ดหน้าดูไปถ่วงโมดูลอื่น)
 * ใช้เมื่อ: โมดูลมีฟิลด์น้อยแต่ต้องเห็นภาพรวม/สถานะสำคัญทันที (เช่น วัสดุ: ขึ้นลิงก์บนเว็บแล้วหรือยัง)
 * ไม่ควรใช้: แค่อยากจัดลำดับ/ซ่อนฟิลด์ → ใช้ 🎨 ออกแบบฟิลด์ (Studio) แทน
 */
import nextDynamic from "next/dynamic";
import type { DetailViewCtx } from "@/components/master-crud";

const MaterialDetailView = nextDynamic(
  () => import("@/components/product-materials/material-view").then((m) => m.MaterialDetailView),
  { ssr: false, loading: () => <div className="py-10 text-center text-sm text-slate-400">⏳</div> },
);

export const RECORD_DETAIL_VIEWS: Record<string, (ctx: DetailViewCtx) => React.ReactNode> = {
  // 🧵 วัสดุ (หน้าวัสดุบนเว็บร้าน) — เจ้าของเลือกแบบร่าง 2026-10-17
  product_materials: (ctx) => <MaterialDetailView ctx={ctx} />,
};
