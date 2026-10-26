"use client";
/**
 * SilentBoundary (ของกลาง) — ครอบ "ของเสริม" ที่ลอยทั้งระบบ (เช่น การ์ดแจ้งเตือนลอย)
 * ถ้าของข้างในพัง → ซ่อนตัวเองเงียบ ๆ + console.error · หน้าหลักไม่พังตาม
 */
import { Component, type ReactNode } from "react";

export class SilentBoundary extends Component<{ name: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error(`[${this.props.name}] ซ่อนเพราะเกิดข้อผิดพลาด:`, error); }
  render() { return this.state.failed ? null : this.props.children; }
}
