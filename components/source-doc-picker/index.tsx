"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";

/**
 * SourceDocPickerModal — ของกลาง: เลือกเอกสารต้นทางได้หลายใบ (ติ๊ก checkbox + ค้นหา)
 * ใช้ดึงข้อมูลจาก "ใบเสนอราคา" หรือ "ใบสั่งผลิต" เข้าสู่เอกสารปลายทาง (เช่น สร้าง SO)
 * - mode="quotation": โชว์เฉพาะใบที่ยังปิดได้ (ส่งแล้ว/ตอบรับแล้ว และยังไม่แปลงเป็น SO)
 * - mode="mo": โชว์ใบสั่งผลิตที่ใช้งานอยู่
 * คืนค่าเป็นแถวดิบที่เลือก ให้ผู้เรียกเอาไปดึงรายละเอียดต่อเอง
 */

export type SourceDocRow = Record<string, unknown> & { id: string };

const baht = (n: unknown) =>
  "฿" + Number(n ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

const QUOTE_STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง", sent: "ส่งแล้ว", accepted: "ตอบรับแล้ว",
};

type ModeConfig = {
  title: string;
  endpoint: string;
  /** กรองแถวที่ "เลือกได้" ฝั่ง client */
  eligible: (row: SourceDocRow) => boolean;
  /** ข้อความค้นหาเทียบกับแถว */
  searchText: (row: SourceDocRow) => string;
  columns: { key: string; label: string; align?: "right"; render: (row: SourceDocRow) => React.ReactNode }[];
};

const SO_STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง", confirmed: "ยืนยันแล้ว", in_production: "กำลังผลิต", ready: "พร้อมส่ง",
  shipped: "จัดส่งแล้ว", completed: "เสร็จสิ้น", cancelled: "ยกเลิก",
};

const CONFIGS: Record<"quotation" | "mo" | "so", ModeConfig> = {
  quotation: {
    title: "ดึงจากใบเสนอราคา",
    endpoint: "/api/quotations?limit=300",
    eligible: (r) => ["sent", "accepted"].includes(String(r.status)) && !r.converted_so_id,
    searchText: (r) => `${r.quote_number ?? ""} ${r.customer_name ?? ""} ${r.customer_code ?? ""}`,
    columns: [
      { key: "quote_number", label: "เลขที่", render: (r) => <code className="font-mono text-xs text-slate-700">{String(r.quote_number ?? "—")}</code> },
      { key: "customer_name", label: "ลูกค้า", render: (r) => <span className="text-slate-700">{String(r.customer_name ?? "—")}</span> },
      { key: "status", label: "สถานะ", render: (r) => <span className="text-xs text-slate-500">{QUOTE_STATUS_LABEL[String(r.status)] ?? String(r.status)}</span> },
      { key: "grand_total", label: "ยอดรวม", align: "right", render: (r) => <span className="font-mono tabular-nums text-slate-700">{baht(r.grand_total)}</span> },
    ],
  },
  mo: {
    title: "ดึงจากใบสั่งผลิต",
    endpoint: "/api/mo?limit=300",
    eligible: () => true,
    searchText: (r) => `${r.mo_no ?? ""} ${r.product_sku ?? ""} ${r.product_name ?? ""}`,
    columns: [
      { key: "mo_no", label: "เลขที่", render: (r) => <code className="font-mono text-xs text-slate-700">{String(r.mo_no ?? "—")}</code> },
      { key: "product_name", label: "สินค้า", render: (r) => (
        <div className="min-w-0">
          <div className="truncate text-slate-700">{String(r.product_name ?? r.product_sku ?? "—")}</div>
          {r.product_sku ? <code className="font-mono text-[11px] text-orange-600">{String(r.product_sku)}</code> : null}
        </div>
      ) },
      { key: "qty", label: "จำนวน", align: "right", render: (r) => <span className="font-mono tabular-nums text-slate-700">{Number(r.qty ?? 0).toLocaleString("th-TH")}</span> },
    ],
  },
  so: {
    title: "เลือกใบกำกับภาษี (ใบสั่งขาย)",
    endpoint: "/api/sales-orders?limit=300",
    // วางบิลได้ทุกสถานะ ยกเว้น "ยกเลิก" (รวมร่าง draft ด้วย — ธุรกิจนี้ออกบิลจาก SO ร่างได้)
    eligible: (r) => String(r.status) !== "cancelled",
    searchText: (r) => `${r.so_number ?? ""} ${r.customer_name ?? ""} ${r.customer_code ?? ""}`,
    columns: [
      { key: "so_number", label: "เลขที่บิล", render: (r) => <code className="font-mono text-xs text-slate-700">{String(r.so_number ?? "—")}</code> },
      { key: "customer_name", label: "ลูกค้า", render: (r) => <span className="text-slate-700">{String(r.customer_name ?? "—")}</span> },
      { key: "status", label: "สถานะ", render: (r) => <span className="text-xs text-slate-500">{SO_STATUS_LABEL[String(r.status)] ?? String(r.status)}</span> },
      { key: "grand_total", label: "ยอดรวม", align: "right", render: (r) => <span className="font-mono tabular-nums text-slate-700">{baht(r.grand_total)}</span> },
    ],
  },
};

export function SourceDocPickerModal({
  open, onClose, mode, onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  mode: "quotation" | "mo" | "so";
  onConfirm: (rows: SourceDocRow[]) => void;
}) {
  const cfg = CONFIGS[mode];
  const [rows, setRows] = useState<SourceDocRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch(cfg.endpoint);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const all = (json.data ?? []) as SourceDocRow[];
      setRows(all.filter(cfg.eligible));
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    } finally { setLoading(false); }
  }, [cfg]);

  useEffect(() => {
    if (open) { setSearch(""); setSelected(new Set()); load(); }
  }, [open, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => cfg.searchText(r).toLowerCase().includes(q));
  }, [rows, search, cfg]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const confirm = () => {
    const picked = rows.filter((r) => selected.has(r.id));
    if (picked.length === 0) return;
    onConfirm(picked);
    onClose();
  };

  return (
    <ERPModal open={open} onClose={onClose} size="lg" title={cfg.title}
      description="ติ๊กเลือกได้หลายใบ แล้วกดยืนยัน"
      footer={
        <>
          <span className="mr-auto text-xs text-slate-500">เลือกแล้ว {selected.size} รายการ</span>
          <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
          <button onClick={confirm} disabled={selected.size === 0}
            className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {mode === "so" ? "ดึงเข้าใบวางบิล" : "ดึงเข้าใบสั่งขาย"}
          </button>
        </>
      }>
      <div className="space-y-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาเลขที่ / ลูกค้า / สินค้า..."
          className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />

        {error && <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {error}</div>}

        <div className="max-h-[55vh] overflow-auto rounded-lg border border-slate-200">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">กำลังโหลด...</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">
              {rows.length === 0 ? "ไม่มีเอกสารที่ดึงได้" : "ไม่พบรายการที่ค้นหา"}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                <tr className="border-b border-slate-200">
                  <th className="w-10 px-3 py-2"></th>
                  {cfg.columns.map((c) => (
                    <th key={c.key} className={`px-3 py-2 font-semibold ${c.align === "right" ? "text-right" : "text-left"}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => {
                  const checked = selected.has(r.id);
                  return (
                    <tr key={r.id} onClick={() => toggle(r.id)}
                      className={`cursor-pointer ${checked ? "bg-blue-50/60" : "hover:bg-slate-50"}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={checked} readOnly className="rounded border-slate-300 pointer-events-none" />
                      </td>
                      {cfg.columns.map((c) => (
                        <td key={c.key} className={`px-3 py-2 ${c.align === "right" ? "text-right" : "text-left"}`}>{c.render(r)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ERPModal>
  );
}
