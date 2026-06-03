"use client";

/**
 * C2: Catch-all master page — /m/<module_key>
 * เปิดหน้า master ของ "module ใดก็ได้" ที่ลงทะเบียนใน erp_modules
 * → table ที่สร้างจากเว็บได้หน้าใช้งานทันที โดยไม่ต้องสร้างไฟล์ page
 */
import { useParams } from "next/navigation";
import { MasterPage, type MasterPageProps } from "@/components/master-page";
import { StatusBadge } from "@/components/data-table";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";

// หน้าจัดซื้อ v2 — แสดงคอลัมน์ status เป็นป้ายสถานะภาษาไทย (ของกลาง StatusBadge)
const PURCHASING_V2 = ["purchase-requests-v2", "purchase-orders-v2", "goods-receipts-v2"];
const STATUS_CELL: NonNullable<MasterPageProps["cellRenderers"]> = {
  status: (v: unknown) => <StatusBadge status={String(v ?? "")} />,
};

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

type BulkActions = NonNullable<MasterPageProps["extraBulkActions"]>;

/**
 * bulk action เฉพาะหน้าใบขอซื้อ (PR v2):
 *  - อนุมัติ / ไม่อนุมัติ (ขั้น 2 — เฉพาะผู้มีสิทธิ์ pr.approve / pr.reject)
 *  - สร้างใบสั่งซื้อ จากใบที่ "อนุมัติแล้ว" (แยกตามร้าน)
 */
function purchaseRequestActions(opts: { actor?: string; canApprove: boolean; canReject: boolean }): BulkActions {
  const { actor, canApprove, canReject } = opts;
  const actions: BulkActions = [];

  if (canApprove) {
    actions.push({
      label: "✅ อนุมัติ",
      onClick: async (selected) => {
        const usable = selected.filter((r) => r.status === "waiting");
        if (usable.length === 0) { alert("เลือกได้เฉพาะใบที่ยัง 'รออนุมัติ' (waiting)"); return; }
        if (!confirm(`อนุมัติใบขอซื้อ ${usable.length} ใบ?`)) return;
        const res = await apiFetch("/api/purchasing/pr-approve", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "approve", pr_ids: usable.map((r) => r.id), actor }),
        });
        const j = await res.json();
        if (j.error) { alert("อนุมัติไม่สำเร็จ: " + j.error); return; }
        alert(`✅ อนุมัติแล้ว ${j.updated} ใบ — สร้างใบสั่งซื้อได้แล้ว`);
      },
    });
  }

  if (canReject) {
    actions.push({
      label: "❌ ไม่อนุมัติ",
      variant: "danger",
      onClick: async (selected) => {
        const usable = selected.filter((r) => r.status === "waiting");
        if (usable.length === 0) { alert("เลือกได้เฉพาะใบที่ยัง 'รออนุมัติ' (waiting)"); return; }
        const reason = prompt(`ระบุเหตุผลที่ไม่อนุมัติ (${usable.length} ใบ):`);
        if (reason === null) return;               // กดยกเลิก
        if (!reason.trim()) { alert("ต้องระบุเหตุผล"); return; }
        const res = await apiFetch("/api/purchasing/pr-approve", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "reject", reason, pr_ids: usable.map((r) => r.id), actor }),
        });
        const j = await res.json();
        if (j.error) { alert("ไม่สำเร็จ: " + j.error); return; }
        alert(`ไม่อนุมัติแล้ว ${j.updated} ใบ`);
      },
    });
  }

  actions.push({
    label: "🧾 สร้างใบสั่งซื้อ",
    onClick: async (selected) => {
      // เฉพาะที่ "อนุมัติแล้ว" และยังไม่ถูกแปลงเป็น PO (ขั้น 2: ต้องผ่านอนุมัติก่อน)
      const usable = selected.filter((r) => r.status === "approved" && !r.po_id);
      if (usable.length === 0) { alert("สร้างใบสั่งซื้อได้เฉพาะใบที่ 'อนุมัติแล้ว' (approved) และยังไม่ถูกสั่งซื้อ"); return; }

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
        body: JSON.stringify({ pr_ids: usable.map((r) => r.id), actor }),
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
  });

  return actions;
}

export default function GenericModulePage() {
  const params = useParams();
  const { user, can } = useAuth();
  const moduleKey = String(params.module ?? "");

  const extraBulkActions = moduleKey === "purchase-requests-v2"
    ? purchaseRequestActions({ actor: user?.name, canApprove: can("pr.approve"), canReject: can("pr.reject") })
    : undefined;
  const cellRenderers = PURCHASING_V2.includes(moduleKey) ? STATUS_CELL : undefined;

  if (!moduleKey) return <div className="p-10 text-center text-slate-400">ไม่พบโมดูล</div>;
  return (
    <MasterPage
      apiPath={moduleKey}
      moduleKey={moduleKey}
      title={moduleKey}
      icon="🧩"
      description="โมดูลที่สร้างจากเว็บ — จัด field/layout ได้ที่ปุ่มด้านบน"
      extraBulkActions={extraBulkActions}
      cellRenderers={cellRenderers}
    />
  );
}
