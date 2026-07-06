"use client";

// หน้าอนุมัติเล็ก (เปิดตรงด้วย path /a/<token>) — ใช้ ApproveView ร่วมกับ /a?token=
import { useParams } from "next/navigation";
import { ApproveView } from "../approve-view";

export default function ApproveTokenPage() {
  const token = String(useParams()?.token ?? "");
  return <ApproveView tokenProp={token} />;
}
