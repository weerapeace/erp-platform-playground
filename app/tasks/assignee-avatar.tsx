"use client";

// ============================================================
// อวตาร/ชิป/รูปซ้อน ผู้รับผิดชอบ (ของกลางในโมดูลงาน Creative)
// แยกเป็นไฟล์เบา ๆ → หน้า /tasks ใช้ได้โดยไม่ต้องลาก chunk subtask-manager (ใหญ่) มาทั้งก้อน
// ============================================================

import { avatarSrc } from "@/lib/r2-image";
import type { SubtaskAssignee } from "./data";

// อวตารคนเดียว — รูปจริงที่ตั้งไว้ ไม่มี → วงกลมตัวอักษร + สีธีม
export function AssigneeAvatar({ a, size = 20 }: { a: SubtaskAssignee; size?: number }) {
  const src = avatarSrc(a.avatar_url, size * 2);
  if (src) return <img src={src} alt={a.label} title={a.label} className="rounded-full object-cover border border-white shrink-0" style={{ width: size, height: size }} />;
  return <span title={a.label} className="rounded-full flex items-center justify-center border border-white font-medium shrink-0" style={{ width: size, height: size, fontSize: size * 0.5, background: a.color || "#ede9fe", color: a.color ? "#fff" : "#6d28d9" }}>{(a.label || "?").slice(0, 1)}</span>;
}

// ชิปอ่านอย่างเดียว (รูป + ชื่อ + ธีมสีจาง)
export function AssigneeChip({ a }: { a: SubtaskAssignee }) {
  return <span className="inline-flex items-center gap-1 text-xs rounded-full pl-0.5 pr-2 py-0.5" style={{ background: (a.color || "#8b5cf6") + "1f" }}><AssigneeAvatar a={a} size={18} /><span className="text-slate-700">{a.label}</span></span>;
}

// รูปซ้อนผู้รับผิดชอบหลายคน + "+k" ถ้าเกิน max (ใช้ในตาราง/การ์ด/หัวงาน)
export function AssigneeStack({ list, size = 22, max = 4 }: { list?: SubtaskAssignee[] | null; size?: number; max?: number }) {
  const arr = list ?? [];
  if (arr.length === 0) return <span className="text-slate-300">—</span>;
  const shown = arr.slice(0, max);
  const rest = arr.length - shown.length;
  return (
    <span className="inline-flex items-center" title={arr.map((a) => a.label).filter(Boolean).join(", ")}>
      <span className="flex -space-x-1.5">{shown.map((a) => <AssigneeAvatar key={a.id} a={a} size={size} />)}</span>
      {rest > 0 && <span className="ml-1 text-[11px] text-slate-400">+{rest}</span>}
    </span>
  );
}
