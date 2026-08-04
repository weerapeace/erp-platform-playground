"use client";

/**
 * ของกลาง — "สร้างใบสั่งผลิต (MO) ใหม่" ป๊อปเดียวใช้ได้ทุกหน้า
 *
 *   <MoCreateModal open onClose={…} onCreated={(id, moNo) => …} />
 *
 * ใช้ที่: หน้าใบสั่งผลิต (/master/manufacturing-orders) · บอร์ดจ่ายงาน (/master/work-board)
 * ⚠️ มีตัวสร้าง MO ที่เดียวคือที่นี่ — ยิง POST /api/mo ตัวเดิม (เลขใบ/กางสูตร/audit ทำฝั่งเซิร์ฟเวอร์)
 *    ส่วน "แก้" ใบที่มีแล้ว ยังอยู่ที่หน้าใบสั่งผลิต (ฟอร์มใหญ่ที่มีวัตถุดิบ/ขอซื้อ/จ่ายงาน)
 * ของกลางที่ใช้: ERPModal · useToast · apiFetch · ComponentPicker · WorkInstructionPanel
 */
import { useCallback, useEffect, useState } from "react";
import dynamicImport from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { ComponentPicker } from "@/components/material-picker";

// วิธีทำ/รูปสินค้า — โหลดตอนเลือกสินค้าแล้วเท่านั้น (หนัก ไม่ควรถ่วงหน้าที่เรียกใช้)
const WorkInstructionPanel = dynamicImport(
  () => import("@/components/work-instruction").then((m) => m.WorkInstructionPanel), { ssr: false });

type Version = { id: string; bom_code: string; version: string; is_default: boolean };
type SizeRow = { label: string; sort?: number };

const STATUS_OPTS: [string, string][] = [
  ["draft", "ร่าง"], ["confirmed", "ยืนยันแล้ว"], ["in_progress", "กำลังผลิต"],
];
const fmt = (n: number) => (Math.round(n * 100) / 100).toLocaleString("th-TH");
const lblCls = "text-[11px] text-slate-500";
const inCls = "w-full h-8 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500";

export function MoCreateModal({ open, onClose, onCreated, defaultProductSku, defaultProductName, defaultProductImage }: {
  open: boolean;
  onClose: () => void;
  /** เรียกหลังสร้างสำเร็จ — หน้าที่เรียกใช้ควรรีเฟรชรายการของตัวเอง */
  onCreated?: (id: string, moNo: string) => void;
  defaultProductSku?: string | null;
  defaultProductName?: string | null;
  defaultProductImage?: string | null;
}) {
  const toast = useToast();
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [due, setDue] = useState("");
  const [status, setStatus] = useState("draft");
  const [note, setNote] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [verId, setVerId] = useState("");
  const [bomCode, setBomCode] = useState<string | null>(null);
  const [bomVersion, setBomVersion] = useState<string | null>(null);
  const [sizes, setSizes] = useState<SizeRow[]>([]);
  const [sizeQty, setSizeQty] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadingBom, setLoadingBom] = useState(false);

  // เปิดใหม่ = ล้างฟอร์ม (เผื่อสร้างต่อหลายใบ)
  useEffect(() => {
    if (!open) return;
    setSku(defaultProductSku ?? ""); setName(defaultProductName ?? ""); setImage(defaultProductImage ?? null);
    setQty(1); setDue(""); setStatus("draft"); setNote("");
    setVersions([]); setVerId(""); setBomCode(null); setBomVersion(null); setSizes([]); setSizeQty({}); setErr(null);
  }, [open, defaultProductSku, defaultProductName, defaultProductImage]);

  /** โหลดไซส์ของสูตร (ถ้าสูตรนั้นมีไซส์ → จำนวนรวมคิดจากผลบวกต่อไซส์) */
  const loadSizes = useCallback(async (bomId: string): Promise<SizeRow[]> => {
    try {
      const j = await apiFetch(`/api/bom/${bomId}`).then((r) => r.json());
      return ((j?.data?.sizes ?? []) as SizeRow[]);
    } catch { return []; }
  }, []);

  /** เลือกสินค้า → หาสูตรของสินค้านั้น แล้วเลือกสูตรหลักให้อัตโนมัติ */
  const pickProduct = async (code: string, label: string, img: string | null) => {
    setSku(code); setName(label); setImage(img);
    setVersions([]); setVerId(""); setBomCode(null); setBomVersion(null); setSizes([]); setSizeQty({});
    setLoadingBom(true);
    try {
      const j = await apiFetch(`/api/bom/versions?product_sku=${encodeURIComponent(code)}`).then((r) => r.json());
      const vers = (j.data ?? []) as Version[];
      setVersions(vers);
      const def = vers.find((v) => v.is_default) ?? vers[0];
      if (def) {
        setVerId(def.id); setBomCode(def.bom_code); setBomVersion(def.version);
        const sz = await loadSizes(def.id);
        setSizes(sz); setSizeQty({}); if (sz.length > 0) setQty(0);
      }
    } catch { setVersions([]); }
    finally { setLoadingBom(false); }
  };

  const selectVersion = async (vid: string) => {
    const v = versions.find((x) => x.id === vid); if (!v) return;
    setVerId(v.id); setBomCode(v.bom_code); setBomVersion(v.version);
    setLoadingBom(true);
    const sz = await loadSizes(v.id);
    setSizes(sz); setSizeQty({}); setQty(sz.length > 0 ? 0 : qty || 1);
    setLoadingBom(false);
  };

  const setOneSize = (label: string, val: number) => {
    const next = { ...sizeQty, [label]: Math.max(0, val || 0) };
    setSizeQty(next);
    setQty(sizes.reduce((a, s) => a + (next[s.label] || 0), 0));
  };

  const save = async () => {
    if (!sku) { setErr("กรุณาเลือกสินค้าที่จะผลิต"); return; }
    if (!(qty > 0)) { setErr(sizes.length > 0 ? "ใส่จำนวนอย่างน้อย 1 ไซส์" : "จำนวนต้องมากกว่า 0"); return; }
    setSaving(true); setErr(null);
    const payload: Record<string, unknown> = {
      product_sku: sku, product_name: name || null, qty,
      due_date: due || null, bom_code: bomCode, bom_version: bomVersion,
      status, note: note || null,
    };
    // สูตรมีไซส์ → ส่งจำนวนต่อไซส์ (เซิร์ฟเวอร์คิดจำนวนรวม + แตกวัตถุดิบตามไซส์เอง)
    if (sizes.length > 0) payload.size_breakdown = sizes.map((s) => ({ label: s.label, qty: sizeQty[s.label] || 0 }));
    try {
      const res = await apiFetch("/api/mo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || "สร้างไม่สำเร็จ");
      toast.success(`สร้างใบสั่งผลิตแล้ว: ${j.mo_no ?? ""}`);
      onCreated?.(String(j.id), String(j.mo_no ?? ""));
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : "สร้างไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open={open} onClose={() => !saving && onClose()} size="lg" storageKey="mo-create" title="🏭 สร้างใบสั่งผลิตใหม่"
      footer={<>
        <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
        <button onClick={() => void save()} disabled={saving || !sku}
          className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {saving ? "กำลังสร้าง…" : "สร้างใบสั่งผลิต"}
        </button>
      </>}>
      <div className="space-y-2">
        {err && <div className="px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">⚠ {err}</div>}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className={lblCls}>เลขที่ใบสั่งผลิต</span>
            <div className="h-8 mt-0.5 px-2 flex items-center text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-400">ออกอัตโนมัติตอนบันทึก</div>
          </div>
          <label className="block">
            <span className={lblCls}>กำหนดส่ง <span className="text-slate-400">(ใส่ไว้ ระบบจะเตือนเมื่อใกล้ครบ)</span></span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inCls} />
          </label>
        </div>

        <div>
          <span className={lblCls}>สินค้าที่ผลิต</span>
          <div className="mt-0.5">
            <ComponentPicker sku={sku} name={name} imageKey={image} placeholder="— เลือกสินค้าที่ผลิต —"
              onPick={(c) => void pickProduct(c.code, c.name, c.image_key ?? null)} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className={lblCls}>จำนวนผลิต{sizes.length > 0 ? " (รวมไซส์)" : ""}</span>
            <input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(Number(e.target.value))}
              readOnly={sizes.length > 0} title={sizes.length > 0 ? "คิดจากผลบวกจำนวนต่อไซส์ด้านล่าง" : undefined}
              className={`${inCls} text-right ${sizes.length > 0 ? "bg-slate-50 text-slate-500" : ""}`} />
          </label>
          <div>
            <span className={lblCls}>สูตร (BOM)</span>
            <select value={verId} onChange={(e) => e.target.value && void selectVersion(e.target.value)} className={inCls}>
              {versions.length === 0 && <option value="">{sku ? "— ไม่มีสูตร —" : "— เลือกสินค้าก่อน —"}</option>}
              {versions.map((v) => <option key={v.id} value={v.id}>{v.version}{v.is_default ? " ★" : ""}</option>)}
            </select>
          </div>
          <label className="block">
            <span className={lblCls}>สถานะ</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inCls}>
              {STATUS_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>

        {sku && versions.length === 0 && !loadingBom && (
          <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            สินค้านี้ยังไม่มีสูตร — สร้างใบได้ แต่ระบบจะยังไม่รู้ว่าต้องเตรียม/ตัดอะไร (เสนอสูตรได้จากปุ่ม “⚠ ไม่มีสูตร” บนการ์ดในช้อปจ่ายงาน)
          </div>
        )}

        {/* จำนวนต่อไซส์ — เฉพาะสูตรที่มีไซส์ */}
        {sizes.length > 0 && (
          <div className="rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2">
            <div className="text-[11px] font-medium text-slate-600 mb-1.5">📏 จำนวนต่อไซส์ <span className="text-slate-400 font-normal">(สูตรนี้มีไซส์ — กรอกจำนวนที่จะผลิตแต่ละไซส์)</span></div>
            <div className="flex flex-wrap gap-2">
              {sizes.map((s) => (
                <label key={s.label} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1">
                  <span className="text-xs font-medium text-slate-600 min-w-[2rem]">{s.label}</span>
                  <input type="number" min={0} step="any" value={sizeQty[s.label] ?? ""} onChange={(e) => setOneSize(s.label, Number(e.target.value))} placeholder="0"
                    className="w-16 h-7 px-1.5 text-sm text-right border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </label>
              ))}
            </div>
            <div className="text-[11px] text-slate-500 mt-1.5">รวม <b className="text-slate-700">{fmt(qty)}</b> ชิ้น</div>
          </div>
        )}

        <label className="block">
          <span className={lblCls}>หมายเหตุ</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inCls} />
        </label>

        {/* วิธีทำ/สเปกจากสินค้าแม่ — ช่วยคนเปิดใบเช็กว่าเลือกถูกตัว */}
        {sku && <WorkInstructionPanel sku={sku} defaultOpen={false} />}
      </div>
    </ERPModal>
  );
}
