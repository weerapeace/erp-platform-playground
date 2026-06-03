"use client";

/**
 * C2: Catch-all master page — /m/<module_key>
 * เปิดหน้า master ของ "module ใดก็ได้" ที่ลงทะเบียนใน erp_modules
 */
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { MasterPage, type MasterPageProps } from "@/components/master-page";
import { StatusBadge } from "@/components/data-table";
import { ERPModal } from "@/components/modal";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";

// หน้าจัดซื้อ v2 — แสดงคอลัมน์ status เป็นป้ายสถานะภาษาไทย (ของกลาง StatusBadge)
const PURCHASING_V2 = ["purchase-requests-v2", "purchase-orders-v2", "goods-receipts-v2"];
const STATUS_CELL: NonNullable<MasterPageProps["cellRenderers"]> = {
  status: (v: unknown) => <StatusBadge status={String(v ?? "")} />,
};

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

type BulkActions = NonNullable<MasterPageProps["extraBulkActions"]>;
type Row = Record<string, unknown>;
type Partner = { id: string; name: string };

function purchaseRequestActions(opts: {
  actor?: string; canApprove: boolean; canReject: boolean;
  onSetSeller: (rows: Row[]) => Promise<void>;
}): BulkActions {
  const { actor, canApprove, canReject, onSetSeller } = opts;
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
        if (reason === null) return;
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

  // 🏪 ลงร้านค้า → เปิด dialog เลือกคู่ค้า แล้ว mass edit ร้านที่ซื้อ
  actions.push({
    label: "🏪 ลงร้านค้า",
    onClick: (selected) => onSetSeller(selected),
  });

  actions.push({
    label: "🧾 สร้างใบสั่งซื้อ",
    onClick: async (selected) => {
      const usable = selected.filter((r) => r.status === "approved" && !r.po_id);
      if (usable.length === 0) { alert("สร้างใบสั่งซื้อได้เฉพาะใบที่ 'อนุมัติแล้ว' (approved) และยังไม่ถูกสั่งซื้อ"); return; }
      const groups = new Map<string, { seller: string; currency: string; count: number; total: number }>();
      for (const r of usable) {
        const seller = String(r.seller_name ?? "ไม่ระบุร้าน");
        const currency = String(r.currency ?? "THB");
        const key = `${seller}|||${currency}`;
        const g = groups.get(key) ?? { seller, currency, count: 0, total: 0 };
        g.count += 1; g.total += num(r.qty) * num(r.price_est); groups.set(key, g);
      }
      const lines = [...groups.values()].map((g) => `• ${g.seller}: ${g.count} รายการ — รวม ${g.total.toLocaleString()} ${g.currency}`);
      if (!confirm(`จะสร้างใบสั่งซื้อ ${groups.size} ใบ (แยกตามร้าน) จาก ${usable.length} รายการ:\n\n${lines.join("\n")}\n\nยืนยัน?`)) return;
      const res = await apiFetch("/api/purchasing/create-po", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pr_ids: usable.map((r) => r.id), actor }),
      });
      const j = await res.json();
      if (j.error) { alert("สร้างไม่สำเร็จ: " + j.error); return; }
      const created = (j.created ?? []) as Array<{ po_no: string; seller_name: string; grand_total: number; currency: string }>;
      alert(`✅ สร้างใบสั่งซื้อสำเร็จ ${created.length} ใบ:\n\n` +
        created.map((c) => `${c.po_no} — ${c.seller_name} — ${c.grand_total.toLocaleString()} ${c.currency}`).join("\n"));
    },
  });

  return actions;
}

// ค้นหา/เลือกคู่ค้า (ร้าน) — ใช้ในกล่อง "ลงร้านค้า"
function PartnerPicker({ value, onChange }: { value: Partner | null; onChange: (p: Partner | null) => void }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      apiFetch(`/api/master-v2/partners?limit=30${q ? `&search=${encodeURIComponent(q)}` : ""}`).then(r => r.json())
        .then(j => setRows(((j.data ?? []) as Row[]).map(p => ({ id: String(p.id), name: String(p.name_th || p.name_en || p.code || p.id) }))))
        .catch(() => setRows([])).finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div>
      {value && (
        <div className="mb-2 flex items-center gap-2 text-sm">
          เลือก: <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded">{value.name}</span>
          <button onClick={() => onChange(null)} className="text-xs text-slate-400 hover:text-red-500">ล้าง</button>
        </div>
      )}
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาร้าน/คู่ค้า..."
        className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md mb-2" />
      <div className="max-h-60 overflow-auto border border-slate-100 rounded-md">
        {loading ? <div className="p-3 text-sm text-slate-400">กำลังโหลด…</div>
          : rows.length === 0 ? <div className="p-3 text-sm text-slate-300">ไม่พบ</div>
          : rows.map(p => (
            <button key={p.id} onClick={() => onChange(p)}
              className={`block w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${value?.id === p.id ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700"}`}>{p.name}</button>
          ))}
      </div>
    </div>
  );
}

export default function GenericModulePage() {
  const params = useParams();
  const { user, can } = useAuth();
  const moduleKey = String(params.module ?? "");

  // 🏪 ลงร้านค้า dialog (resolve → ให้ master-crud รีเฟรชตารางหลังปิด)
  const [sellerDlg, setSellerDlg] = useState<{ rows: Row[]; resolve: () => void } | null>(null);
  const [sellerPick, setSellerPick] = useState<Partner | null>(null);
  const [savingSeller, setSavingSeller] = useState(false);

  const closeSellerDlg = () => { sellerDlg?.resolve(); setSellerDlg(null); setSellerPick(null); };
  const applySeller = async () => {
    if (!sellerPick || !sellerDlg) return;
    setSavingSeller(true);
    try {
      const res = await apiFetch(`/api/master-v2/purchase-requests-v2/bulk-update`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edits: sellerDlg.rows.map(r => ({ id: String(r.id), changes: { seller_name: sellerPick.name } })),
          actor: user?.name,
        }),
      });
      const j = await res.json();
      if (j.error) { alert("ลงร้านค้าไม่สำเร็จ: " + j.error); return; }
      alert(`🏪 ลงร้านค้า "${sellerPick.name}" ให้ ${sellerDlg.rows.length} รายการแล้ว`);
    } catch (e) { alert(String((e as Error).message ?? e)); }
    finally { setSavingSeller(false); closeSellerDlg(); }
  };

  const extraBulkActions = moduleKey === "purchase-requests-v2"
    ? purchaseRequestActions({
        actor: user?.name, canApprove: can("pr.approve"), canReject: can("pr.reject"),
        onSetSeller: (rows) => new Promise<void>(resolve => { setSellerPick(null); setSellerDlg({ rows, resolve }); }),
      })
    : undefined;
  const cellRenderers = PURCHASING_V2.includes(moduleKey) ? STATUS_CELL : undefined;

  if (!moduleKey) return <div className="p-10 text-center text-slate-400">ไม่พบโมดูล</div>;
  return (
    <>
      <MasterPage
        apiPath={moduleKey}
        moduleKey={moduleKey}
        title={moduleKey}
        icon="🧩"
        description="โมดูลที่สร้างจากเว็บ — จัด field/layout ได้ที่ปุ่มด้านบน"
        extraBulkActions={extraBulkActions}
        cellRenderers={cellRenderers}
      />
      {sellerDlg && (
        <ERPModal open onClose={closeSellerDlg} size="md"
          title={`🏪 ลงร้านค้า (${sellerDlg.rows.length} รายการ)`}
          description="เลือกร้าน/คู่ค้า แล้วระบบจะตั้ง 'ร้านที่ซื้อ' ให้ทุกรายการที่เลือก"
          footer={
            <>
              <button onClick={closeSellerDlg} disabled={savingSeller} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
              <button onClick={applySeller} disabled={!sellerPick || savingSeller} className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {savingSeller ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </>
          }>
          <PartnerPicker value={sellerPick} onChange={setSellerPick} />
        </ERPModal>
      )}
    </>
  );
}
