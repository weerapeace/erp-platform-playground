"use client";

/**
 * 📚 Design Library — ติดแท็กแผงผ้าจากป๊อปเลือกวัสดุ (รอบ 8 · เจ้าของเลือก 2026-11-15)
 * ปัญหาเดิม: จุดซิป/เทปเปิดแท็บแผงแล้วว่าง เพราะแผงยังไม่ติดแท็กของหมวด → ต้องไปตั้งที่หน้า SKU แท็บ Swatch
 * ตั้งแต่ 2026-11-15 (แผงผ้ารอบ 10 · D2): ป๊อปนี้ย้ายไปเป็นของกลางในโฟลเดอร์แผงผ้า — SwatchTagModal
 *   (ไฟล์นี้ส่งต่อชื่อเดิม BoardTagModal ไว้ให้หน้าที่ import อยู่แล้วใช้ต่อได้ · แก้หน้าตา/การทำงาน = แก้ที่ components/sku-swatch-browser/tag-modal.tsx)
 */
export { SwatchTagModal as BoardTagModal } from "@/components/sku-swatch-browser/tag-modal";
