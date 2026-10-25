"use client";

/**
 * ของกลาง — "เลือกวัตถุดิบจากใบสั่งผลิต (BOM)" (MoBomPicker)
 *
 * ขั้น 1: ใบสั่งผลิตที่ยังมีวัตถุดิบต้องซื้อ (/api/mo/purchase-needs — ตัวเดียวกับแท็บใบสั่งผลิตหน้าขอซื้อ) + ค้นเลขใบงานอื่นได้
 * ขั้น 2: วัตถุดิบทั้ง BOM ของใบนั้น + สถานะซื้อ (/api/mo/material-status) → กดเลือก 1 ตัว → onPick
 * ใช้กับ: คำสั่งซื้อจากไลน์ (จับคู่รายการที่ซื้อกับวัตถุดิบของใบงาน) · ที่อื่นที่ต้อง "เลือกของจากใบงาน" ใช้ตัวนี้ได้เลย
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { HoverImage } from "@/components/hover-image";
import { apiFetch } from "@/lib/api";
import type { PurchaseNeedRow } from "@/app/api/mo/purchase-needs/route";
import type { MoMaterialStatus, MoMaterialStatusResult } from "@/app/api/mo/material-status/route";

export type MoBomPick = {
  mo_no: string;
  product_label: string | null;
  code: string | null;
  name: string | null;
  uom: string | null;
  image: string | null;
  /** ยอดที่ยังต้องซื้อของใบนี้ (ตามสูตรเดียวกับหน้าขอซื้อ) */
  remaining: number;
};

type MoEntry = { mo_no: string; product_label: string; product_image: string | null; due_date: string | null; mats: number };

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  buy: { label: "ต้องซื้อ", cls: "bg-rose-50 text-rose-700" },
  requested: { label: "ขอซื้อแล้ว", cls: "bg-amber-50 text-amber-700" },
  ordered: { label: "สั่งแล้ว", cls: "bg-blue-50 text-blue-700" },
  received: { label: "รับแล้ว", cls: "bg-emerald-50 text-emerald-700" },
  have: { label: "มีของ", cls: "bg-emerald-50 text-emerald-700" },
  ready: { label: "เตรียมแล้ว", cls: "bg-emerald-50 text-emerald-700" },
  skip: { label: "ไม่ต้องซื้อ", cls: "bg-slate-100 text-slate-500" },
};
const STATUS_ORDER = ["buy", "requested", "ordered", "received", "have", "ready", "skip"];
const fmt = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

export function MoBomPicker({ open, onClose, onPick, hint }: {
  open: boolean;
  onClose: () => void;
  onPick: (p: MoBomPick) => void;
  /** ข้อความช่วยจำ เช่น ชื่อสินค้าที่กำลังจับคู่ */
  hint?: string;
}) {
  const [needs, setNeeds] = useState<PurchaseNeedRow[] | null>(null);
  const [needsErr, setNeedsErr] = useState(false);
  const [q, setQ] = useState("");
  const [moNo, setMoNo] = useState<string | null>(null);
  const [bom, setBom] = useState<MoMaterialStatusResult | null>(null);
  const [bomErr, setBomErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || needs) return;
    apiFetch("/api/mo/purchase-needs").then((r) => r.json())
      .then((j) => setNeeds((j.data ?? []) as PurchaseNeedRow[]))
      .catch(() => { setNeeds([]); setNeedsErr(true); });
  }, [open, needs]);

  useEffect(() => {
    setBom(null); setBomErr(null);
    if (!moNo) return;
    let alive = true;
    apiFetch(`/api/mo/material-status?mo_no=${encodeURIComponent(moNo)}`).then((r) => r.json())
      .then((j) => { if (!alive) return; if (j.data) setBom(j.data as MoMaterialStatusResult); else setBomErr(j.error || "โหลดวัตถุดิบไม่สำเร็จ"); })
      .catch(() => { if (alive) setBomErr("โหลดวัตถุดิบไม่สำเร็จ"); });
    return () => { alive = false; };
  }, [moNo]);

  // วัตถุดิบที่ต้องซื้อ (ทุกใบ) → รายการใบสั่งผลิต
  const mos = useMemo<MoEntry[]>(() => {
    const map = new Map<string, MoEntry>();
    for (const r of needs ?? []) for (const m of r.mos) {
      if (m.is_ready) continue;
      const g = map.get(m.mo_no) ?? { mo_no: m.mo_no, product_label: m.product_label, product_image: m.product_image, due_date: m.due_date, mats: 0 };
      g.mats++; map.set(m.mo_no, g);
    }
    return [...map.values()].sort((a, b) => b.mo_no.localeCompare(a.mo_no));
  }, [needs]);
  const term = q.trim().toLowerCase();
  const shown = term ? mos.filter((m) => `${m.mo_no} ${m.product_label}`.toLowerCase().includes(term)) : mos;
  const typedMo = /^MO-\d{4}-\d+$/i.test(q.trim()) && !mos.some((m) => m.mo_no.toLowerCase() === term) ? q.trim().toUpperCase() : null;

  const items = useMemo(() => {
    const list = [...(bom?.items ?? [])];
    list.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
    return list;
  }, [bom]);
  const productLabel = mos.find((m) => m.mo_no === moNo)?.product_label ?? null;

  const pick = (it: MoMaterialStatus) => {
    if (!moNo) return;
    onPick({ mo_no: moNo, product_label: productLabel, code: it.code, name: it.name, uom: it.uom, image: it.image, remaining: it.remaining });
    setMoNo(null); setQ("");
    onClose();
  };

  return (
    <ERPModal open={open} onClose={() => { setMoNo(null); onClose(); }} size="lg" storageKey="mo-bom-picker" defaultExpanded={false} zIndex={60}
      title={moNo ? `🏭 ${moNo} — เลือกวัตถุดิบ` : "🏭 เลือกจากใบสั่งผลิต (BOM)"}
      description={hint ? `จับคู่กับ: ${hint}` : undefined}
      footer={moNo
        ? <button onClick={() => setMoNo(null)} className="h-9 px-4 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50">← กลับไปเลือกใบสั่งผลิต</button>
        : <button onClick={onClose} className="h-9 px-4 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm hover:bg-slate-50">ปิด</button>}
    >
      {!moNo ? (
        <div className="space-y-2">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นเลขใบสั่งผลิต / รุ่นสินค้า (หรือพิมพ์เลข MO-2026-00123)"
            className="h-9 px-3 text-sm border border-slate-200 rounded-lg w-full focus:outline-none focus:ring-1 focus:ring-blue-400" />
          {typedMo && (
            <button onClick={() => setMoNo(typedMo)} className="w-full text-left rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              เปิด {typedMo} (ใบที่ไม่มีของต้องซื้อแล้วก็เปิดได้)
            </button>
          )}
          {needs === null ? <div className="py-8 text-center text-sm text-slate-400">กำลังโหลด…</div>
            : needsErr ? <div className="py-8 text-center text-sm text-rose-600">โหลดใบสั่งผลิตไม่สำเร็จ</div>
            : shown.length === 0 ? <div className="py-8 text-center text-sm text-slate-400">{term ? "ไม่พบใบสั่งผลิตที่ค้นหา" : "ไม่มีใบสั่งผลิตที่ยังต้องซื้อวัตถุดิบ"}</div>
            : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[55vh] overflow-y-auto">
                {shown.map((m) => (
                  <button key={m.mo_no} onClick={() => setMoNo(m.mo_no)} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-slate-50">
                    <HoverImage url={m.product_image} size={36} previewSize={280} alt={m.product_label} fallback="🏭" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800">{m.mo_no}</div>
                      <div className="text-[11px] text-slate-500 truncate">{m.product_label}{m.due_date ? ` · ส่ง ${new Date(m.due_date).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}` : ""}</div>
                    </div>
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 shrink-0">ต้องซื้อ {m.mats} อย่าง</span>
                  </button>
                ))}
              </div>
            )}
        </div>
      ) : (
        <div className="space-y-2">
          {productLabel && <div className="text-xs text-slate-500">ผลิต: {productLabel}{bom ? ` · ${fmt(bom.mo_qty)} ชิ้น` : ""}</div>}
          {bomErr ? <div className="py-8 text-center text-sm text-rose-600">⚠️ {bomErr}</div>
            : !bom ? <div className="py-8 text-center text-sm text-slate-400">กำลังโหลดวัตถุดิบ…</div>
            : items.length === 0 ? <div className="py-8 text-center text-sm text-slate-400">ใบนี้ยังไม่มีวัตถุดิบในสูตร</div>
            : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-[55vh] overflow-y-auto">
                {items.map((it) => {
                  const ui = STATUS_UI[it.status] ?? STATUS_UI.skip;
                  return (
                    <button key={it.summary_id} onClick={() => pick(it)} disabled={!it.code}
                      title={it.code ? "เลือกตัวนี้" : "วัตถุดิบนี้ยังไม่มีรหัส SKU — เลือกไม่ได้"}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-blue-50 disabled:opacity-50 disabled:hover:bg-transparent">
                      <HoverImage url={it.image} size={36} previewSize={280} alt={it.name ?? ""} fallback="🧵" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-slate-800 truncate">{it.name ?? "—"}</div>
                        <div className="text-[11px] text-slate-500">
                          {it.code ? <span className="font-mono">{it.code}</span> : "ไม่มีรหัส"} · ใช้ {fmt(it.required)}{it.uom ? ` ${it.uom}` : ""}
                          {it.remaining > 0 && <span className="text-rose-600"> · ต้องซื้อ {fmt(it.remaining)}</span>}
                        </div>
                      </div>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded shrink-0 ${ui.cls}`}>{ui.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
        </div>
      )}
    </ERPModal>
  );
}
