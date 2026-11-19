"use client";

/**
 * ส่วน "ใบสั่งขายที่ยังไม่มีใบสั่งผลิต" ในป๊อปสร้างใบสั่งผลิต (เจ้าของสั่ง 2026-11-19) — ใช้ภายใน components/mo-create เท่านั้น
 *   ติ๊กรายการ → ป๊อปแม่เติมสินค้า/จำนวนที่ยังขาด/กำหนดส่ง + ผูกรายการใบสั่งขายนั้นให้ · ติ๊กหลายรายการ = สร้างหลายใบ
 *   รายการที่ยังไม่มีรหัสสินค้า (มาจากใบเสนอราคา) → เลือกรหัสในแถว = บันทึกรหัสกลับเข้าใบสั่งขาย (PATCH /api/mo/so-pending · audit)
 * ข้อมูล: GET /api/mo/so-pending (สั่ง > เปิดผลิตแล้ว · ไม่นับใบผลิตที่ยกเลิก)
 * ของกลางที่ใช้: ComponentPicker · HoverImage · Icon · useToast · apiFetch
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { HoverImage } from "@/components/hover-image";
import { ComponentPicker } from "@/components/material-picker";
import type { SoPendingLine } from "@/lib/mo-so-rule";

const num = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("th-TH");
const dayText = (s: string | null) => (s ? new Date(s.slice(0, 10) + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" }) : "");
const imgUrl = (k: string | null) => (k ? `/api/r2-image?key=${encodeURIComponent(k)}&w=120` : null);

export function SoPendingPicker({ selectedIds, onToggle, onClear }: {
  /** รายการที่ติ๊กอยู่ (line_id) */
  selectedIds: string[];
  onToggle: (line: SoPendingLine) => void;
  onClear: () => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<SoPendingLine[] | null>(null);
  const [err, setErr] = useState(false);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(true);
  const [skuEdit, setSkuEdit] = useState<string | null>(null);   // line_id ที่กำลังเลือกรหัส
  const [savingSku, setSavingSku] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(false);
    try {
      const r = await apiFetch("/api/mo/so-pending");
      const j = await r.json();
      if (!r.ok || j?.error) throw new Error();
      setItems((j.data ?? []) as SoPendingLine[]);
    } catch { setErr(true); setItems((p) => p ?? []); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!items || !t) return items ?? [];
    return items.filter((x) => [x.order_no, x.customer_name, x.customer_po_no, x.sku, x.product_name, x.note].some((v) => String(v ?? "").toLowerCase().includes(t)));
  }, [items, q]);

  const setSku = async (line: SoPendingLine, code: string, img: string | null) => {
    setSavingSku(line.line_id);
    try {
      const r = await apiFetch("/api/mo/so-pending", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line_id: line.line_id, sku: code }) });
      const j = await r.json();
      if (!r.ok || j?.error) throw new Error(j?.error || "บันทึกรหัสไม่สำเร็จ");
      const next = { ...line, sku: code, image_key: img };
      setItems((p) => (p ?? []).map((x) => (x.line_id === line.line_id ? next : x)));
      setSkuEdit(null);
      toast.success(`ใส่รหัส ${code} ให้รายการใน ${line.order_no ?? "ใบสั่งขาย"} แล้ว`);
      if (!selectedIds.includes(line.line_id)) onToggle(next);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกรหัสไม่สำเร็จ"); }
    finally { setSavingSku(null); }
  };

  if (items === null) return <div className="rounded-lg border border-slate-200 px-3 py-2 text-[11px] text-slate-400">กำลังโหลดใบสั่งขายที่ยังไม่มีใบสั่งผลิต…</div>;
  if (err && !items.length) return (
    <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
      <span className="flex-1">โหลดใบสั่งขายที่ยังไม่มีใบสั่งผลิตไม่สำเร็จ</span>
      <button type="button" onClick={() => void load()} className="h-7 px-2 rounded-md border border-rose-200 bg-white text-[11px]">ลองใหม่</button>
    </div>
  );
  if (!items.length) return null;   // ไม่มีงานค้าง = ไม่ต้องรกป๊อป

  const noSku = items.filter((x) => !x.sku).length;
  return (
    <div className="rounded-lg border border-blue-200 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-xs text-blue-800">
        <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 font-medium min-w-0">
          <Icon name="receipt" /> ใบสั่งขายที่ยังไม่มีใบสั่งผลิต <span className="rounded-full bg-white px-1.5 text-[11px]">{items.length}</span>
          <span className="text-[10px] text-blue-500">{open ? "▲" : "▼"}</span>
        </button>
        {open && (
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นเลขใบ / ลูกค้า / สินค้า"
            className="ml-auto h-7 w-40 min-w-0 px-2 text-[11px] border border-blue-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
        )}
      </div>
      {open && (<>
        <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
          {shown.length === 0 && <div className="px-3 py-3 text-center text-[11px] text-slate-400">ไม่พบรายการที่ตรงคำค้น</div>}
          {shown.map((x) => {
            const on = selectedIds.includes(x.line_id);
            const canTick = !!x.sku;
            return (
              <div key={x.line_id} className={`flex items-start gap-2 px-3 py-1.5 ${on ? "bg-blue-50/70" : "hover:bg-slate-50"}`}>
                <input type="checkbox" checked={on} disabled={!canTick} onChange={() => canTick && onToggle(x)}
                  title={canTick ? "ใช้รายการนี้สร้างใบสั่งผลิต" : "เลือกรหัสสินค้าก่อน"} className="mt-1 shrink-0 accent-blue-600" />
                <HoverImage url={imgUrl(x.image_key)} size={28} />
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => canTick && onToggle(x)}>
                  <div className="text-xs text-slate-800 leading-snug">
                    {x.sku
                      ? <span className="font-mono font-medium mr-1">{x.sku}</span>
                      : <span className="mr-1 rounded bg-amber-50 px-1 text-[10px] text-amber-800 border border-amber-200">ยังไม่มีรหัส</span>}
                    <span className="break-words">{x.product_name}</span>
                    {x.note && <span className="text-slate-400"> · {x.note}</span>}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    <span className="font-mono">{x.order_no ?? "—"}</span> · {x.customer_name ?? "—"}
                    {x.due_date && <span className="text-indigo-600"> · ส่ง {dayText(x.due_date)}</span>}
                  </div>
                  {skuEdit === x.line_id && (
                    <div className="mt-1 max-w-sm" onClick={(e) => e.stopPropagation()}>
                      <ComponentPicker sku="" name="" placeholder={savingSku === x.line_id ? "กำลังบันทึก…" : "— เลือกรหัสสินค้าของรายการนี้ —"}
                        onPick={(c) => void setSku(x, c.code, c.image_key ?? null)} />
                      <p className="mt-0.5 text-[10px] text-slate-400">รหัสที่เลือกจะบันทึกเข้าใบสั่งขาย {x.order_no} ด้วย (แก้ทีหลังได้ที่หน้าใบสั่งขาย)</p>
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs tabular-nums text-slate-700">{num(x.remaining)} <span className="text-[10px] text-slate-400">{x.unit || "ชิ้น"}</span></div>
                  {x.opened > 0 && <div className="text-[10px] text-amber-700">เปิดแล้ว {num(x.opened)}/{num(x.qty)}</div>}
                  <button type="button" onClick={() => setSkuEdit(skuEdit === x.line_id ? null : x.line_id)}
                    className={`mt-0.5 inline-flex items-center gap-0.5 text-[10px] ${x.sku ? "text-slate-400 hover:text-blue-600" : "text-blue-600 font-medium hover:underline"}`}>
                    <Icon name="edit" /> {x.sku ? "เปลี่ยนรหัส" : "เลือกรหัส"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-500">
          <span className="flex-1">
            {selectedIds.length
              ? <>เลือก <b className="text-slate-700">{selectedIds.length}</b> รายการ — {selectedIds.length > 1 ? "สร้างทีละใบ แต่ละใบผูกรายการของตัวเอง" : "เติมสินค้า/จำนวนที่ยังขาด/กำหนดส่ง และผูกรายการนี้ให้แล้ว"}</>
              : <>ติ๊กรายการ = เติมสินค้า/จำนวน/กำหนดส่ง และผูกใบสั่งขายให้เอง{noSku ? ` · ${noSku} รายการยังไม่มีรหัส กด “เลือกรหัส” ก่อน` : ""}</>}
          </span>
          {selectedIds.length > 0 && <button type="button" onClick={onClear} className="text-blue-600 hover:underline">ล้างที่เลือก</button>}
        </div>
      </>)}
    </div>
  );
}
