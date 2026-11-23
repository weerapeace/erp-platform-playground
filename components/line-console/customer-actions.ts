"use client";
/**
 * ปุ่มจัดการลูกค้าที่ผูกไลน์บริษัท (ของกลางในศูนย์ LINE) — ถอนผูก (ย้อนได้) · ระงับ · คืนสิทธิ์ · ชื่อเรียก · ยืนยัน/ปฏิเสธคำขอผูกร้าน (ย้อนได้)
 * ใช้ที่: ส่วนคนที่ผูกไลน์ (company-section) · แท็บร้านค้าในไลน์ (company-shops) — แก้ข้อความ/การยืนยันที่นี่ที่เดียว
 * API: POST /api/admin/line-company (link_id+action · decide) · ผู้เรียกส่งตัวยิง post ของตัวเอง (โหลดใหม่หลังสำเร็จ)
 */
import { useToast } from "@/components/toast";
import { askConfirm, askText } from "@/components/modal/ask-dialog";

export type LineCustomerRef = { id: string; contact_name: string; line_name: string; partner_name: string };
export type LineCustomerAction = "unlink" | "block" | "unblock" | "rename";
type Post = (body: Record<string, unknown>) => Promise<Record<string, unknown> | null>;

export function useLineCustomerActions(post: Post) {
  const toast = useToast();

  const customerAction = async (c: LineCustomerRef, action: LineCustomerAction) => {
    const who = c.contact_name || c.line_name || "คนนี้";
    if (action === "rename") {
      const v = await askText({ title: "ชื่อเรียก (เช่น คุณนก ฝ่ายจัดซื้อ)", initial: c.contact_name });
      if (v === null || v.trim() === c.contact_name) return;
      if (await post({ link_id: c.id, action, contact_name: v })) toast.success("เปลี่ยนชื่อเรียกแล้ว");
      return;
    }
    if (action === "block") {
      const ok = await askConfirm({ title: `ระงับ ${who}?`, message: `ไลน์นี้จะดูข้อมูลของร้าน ${c.partner_name} ไม่ได้จนกว่าจะคืนสิทธิ์ (ยังทักแชทหาพนักงานได้)`, confirmText: "ระงับ", variant: "danger" });
      if (!ok) return;
    }
    if (!(await post({ link_id: c.id, action }))) return;
    if (action === "unlink") toast.undo(`ถอนผูก ${who} แล้ว`, async () => { if (await post({ link_id: c.id, action: "relink" })) toast.success("ย้อนการถอนผูกแล้ว"); });
    else toast.success(action === "block" ? "ระงับแล้ว" : "คืนสิทธิ์แล้ว");
  };

  /** คำขอผูกร้านจาก QR ลูกค้ารวม — ยืนยัน (ต้องเลือกร้าน) / ปฏิเสธ · ย้อนกลับได้จากแจ้งผลมุมจอ */
  const decide = async (c: { id: string; requested_shop: string }, action: "approve" | "reject", pick: { id: string; name: string } | null) => {
    if (action === "approve" && !pick) { toast.warning("เลือกร้านในระบบก่อน"); return; }
    if (action === "reject" && !(await askConfirm({ title: "ปฏิเสธคำขอนี้?", message: `"${c.requested_shop}" จะถูกปฏิเสธ (เก็บประวัติไว้ ย้อนกลับได้)`, confirmText: "ปฏิเสธ" }))) return;
    if (!(await post({ decide: { link_id: c.id, action, partner_id: pick?.id ?? null } }))) return;
    toast.undo(action === "approve" ? `ผูกกับ ${pick?.name} แล้ว` : "ปฏิเสธคำขอแล้ว", async () => { if (await post({ decide: { link_id: c.id, action: "undo" } })) toast.success("ย้อนกลับเป็นรอยืนยันแล้ว"); });
  };

  return { customerAction, decide };
}
