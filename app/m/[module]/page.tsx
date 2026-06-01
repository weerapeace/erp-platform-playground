"use client";

/**
 * C2: Catch-all master page — /m/<module_key>
 * เปิดหน้า master ของ "module ใดก็ได้" ที่ลงทะเบียนใน erp_modules
 * → table ที่สร้างจากเว็บได้หน้าใช้งานทันที โดยไม่ต้องสร้างไฟล์ page
 */
import { useParams } from "next/navigation";
import { MasterPage, type MasterPageProps } from "@/components/master-page";
import { apiFetch } from "@/lib/api";

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

/** bulk action เฉพาะหน้าใบขอซื้อ: เลือกหลายรายการ → สร้างใบสั่งซื้อ (แยกตามร้าน) */
function purchaseRequestActions(): NonNullable<MasterPageProps["extraBulkActions"]> {
  return [{
    label: "🧾 สร้างใบสั่งซื้อ",
    onClick: async (selected) => {
      // เฉพาะที่ยังรออยู่ (waiting) และยังไม่ถูกแปลงเป็น PO
      const usable = selected.filter((r) => r.status === "waiting" && !r.po_id);
      if (usable.length === 0) { alert("รายการที่เลือกถูกสั่งซื้อไปแล้ว หรือไม่อยู่ในสถานะ 'waiting'"); return; }

      // สรุปแยกตามร้าน + สกุลเงิน
      const groups = new Map<string, { seller: string; currency: string; count: number; total: number }>();
      for (const r of usable) {
        const seller = String(r.seller_name ?? "ไม่ระบุร้าน");
        const currency = String(r.currency ?? "THB");
        const key = `${seller}|||${currency}`;
        const g = groups.get(key) ?? { seller, currency, count: 0, total: 0 };
        g.count += 1;
        g.total += num(r.qty) * num(r.price_est);
        groups.set(key, g);
      }
      const lines = [...groups.values()].map(
        (g) => `• ${g.seller}: ${g.count} รายการ — รวม ${g.total.toLocaleString()} ${g.currency}`,
      );
      const summary =
        `จะสร้างใบสั่งซื้อ ${groups.size} ใบ (แยกตามร้าน) จาก ${usable.length} รายการ:\n\n` +
        lines.join("\n") +
        `\n\nยืนยันสร้างใบสั่งซื้อ?`;
      if (!confirm(summary)) return;

      const res = await apiFetch("/api/purchasing/create-po", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pr_ids: usable.map((r) => r.id) }),
      });
      const j = await res.json();
      if (j.error) { alert("สร้างไม่สำเร็จ: " + j.error); return; }
      const created = (j.created ?? []) as Array<{ po_no: string; seller_name: string; grand_total: number; currency: string }>;
      alert(
        `✅ สร้างใบสั่งซื้อสำเร็จ ${created.length} ใบ:\n\n` +
        created.map((c) => `${c.po_no} — ${c.seller_name} — ${c.grand_total.toLocaleString()} ${c.currency}`).join("\n") +
        `\n\nดูได้ที่หน้า "ใบสั่งซื้อ"`,
      );
    },
  }];
}

export default function GenericModulePage() {
  const params = useParams();
  const moduleKey = String(params.module ?? "");
  if (!moduleKey) return <div className="p-10 text-center text-slate-400">ไม่พบโมดูล</div>;
  const extraBulkActions = moduleKey === "purchase-requests-v2" ? purchaseRequestActions() : undefined;
  return (
    <MasterPage
      apiPath={moduleKey}
      moduleKey={moduleKey}
      title={moduleKey}
      icon="🧩"
      description="โมดูลที่สร้างจากเว็บ — จัด field/layout ได้ที่ปุ่มด้านบน"
      extraBulkActions={extraBulkActions}
    />
  );
}
