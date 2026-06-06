"use client";

/**
 * SupplierWizard — ของกลาง: เพิ่มผู้จำหน่าย (partners_v2, is_supplier=true) แบบ wizard 2 หน้า ลงง่าย
 *   หน้า 1: ชื่อร้าน(Display) · ☑Taobao(→ประเทศ=จีน) · ประเทศร้าน · Website · Notes · สกุลเงินตั้งต้น(TH/RMB)
 *   หน้า 2: ชื่อ[TH] · ที่อยู่ · ชื่อบริษัท · เครดิต(วัน)
 * onCreated(partner) คืน { id, name } ของผู้จำหน่ายที่สร้าง
 */
import { useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";

const COUNTRIES = ["ไทย", "จีน", "ฮ่องกง", "อื่นๆ"];

export function SupplierWizard({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (p: { id: string; name: string }) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // หน้า 1
  const [displayName, setDisplayName] = useState("");
  const [isTaobao, setIsTaobao] = useState(false);
  const [shopCountry, setShopCountry] = useState("");
  const [website, setWebsite] = useState("");
  const [notes, setNotes] = useState("");
  const [currency, setCurrency] = useState("RMB");
  // หน้า 2
  const [nameTh, setNameTh] = useState("");
  const [address, setAddress] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [creditDays, setCreditDays] = useState("");

  const toggleTaobao = (v: boolean) => { setIsTaobao(v); if (v) { setShopCountry("จีน"); setCurrency("RMB"); } };

  const cls = "w-full h-9 px-3 text-sm border border-slate-200 rounded-md";
  const lbl = "block text-xs font-medium text-slate-600 mb-1";

  const save = async () => {
    if (!displayName.trim()) { setStep(1); setErr("กรุณาใส่ชื่อร้าน"); return; }
    setSaving(true); setErr(null);
    try {
      const body = {
        is_supplier: true, is_company: true, is_active: true,
        display_name: displayName.trim(),
        name_th: (nameTh.trim() || displayName.trim()),
        is_taobao: isTaobao,
        shop_country: shopCountry || null,
        website: website.trim() || null,
        notes: notes.trim() || null,
        default_currency: currency,
        address_line: address.trim() || null,
        company_name: companyName.trim() || null,
        payment_terms_days: creditDays ? Number(creditDays) : null,
      };
      const res = await apiFetch(`/api/master-v2/partners`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || j.error || !j.data?.id) { setErr("บันทึกไม่สำเร็จ: " + (j.error ?? `HTTP ${res.status}`)); return; }
      onCreated({ id: String(j.data.id), name: displayName.trim() });
    } catch (e) { setErr(String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[480px] max-w-[94vw] max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-800">➕ เพิ่มผู้จำหน่าย</h3>
            <div className="text-[11px] text-slate-400">ขั้นที่ {step}/2 — {step === 1 ? "ข้อมูลร้าน" : "ข้อมูลพื้นฐาน (ไม่ใส่ก็ได้)"}</div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
        </div>

        <div className="p-4 space-y-3">
          {step === 1 ? (
            <>
              <div><label className={lbl}>ชื่อร้าน (Display) *</label>
                <input value={displayName} autoFocus onChange={(e) => setDisplayName(e.target.value)} className={cls} placeholder="เช่น ร้านซิปเมืองจีน" /></div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={isTaobao} onChange={(e) => toggleTaobao(e.target.checked)} className="rounded border-slate-300" />
                เป็นร้าน Taobao (ติ๊กแล้วตั้งประเทศ = จีน, สกุลเงิน = RMB)
              </label>
              <div><label className={lbl}>ประเทศร้าน</label>
                <select value={shopCountry} onChange={(e) => setShopCountry(e.target.value)} className={cls + " bg-white"}>
                  <option value="">— เลือก —</option>
                  {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <div><label className={lbl}>Website</label>
                <input value={website} onChange={(e) => setWebsite(e.target.value)} className={cls} placeholder="https://…" /></div>
              <div><label className={lbl}>Notes</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className={cls} placeholder="(ถ้ามี)" /></div>
              <div><label className={lbl}>สกุลเงินตั้งต้น</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={cls + " bg-white"}>
                  <option value="RMB">RMB (หยวน)</option>
                  <option value="THB">THB (บาท)</option>
                </select></div>
            </>
          ) : (
            <>
              <div><label className={lbl}>ชื่อ (TH)</label>
                <input value={nameTh} onChange={(e) => setNameTh(e.target.value)} className={cls} placeholder="ถ้าเว้นว่าง = ใช้ชื่อร้าน" /></div>
              <div><label className={lbl}>ที่อยู่</label>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className={cls} placeholder="(ถ้ามี)" /></div>
              <div><label className={lbl}>ชื่อบริษัท</label>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={cls} placeholder="(ถ้ามี)" /></div>
              <div><label className={lbl}>เครดิต (วัน)</label>
                <input type="number" value={creditDays} onChange={(e) => setCreditDays(e.target.value)} className={cls} placeholder="เช่น 30" /></div>
            </>
          )}
          {err && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">{err}</div>}
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
          {step === 2 ? <button type="button" onClick={() => setStep(1)} className="h-9 px-3 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50">← ย้อนกลับ</button> : <span />}
          {step === 1 ? (
            <button type="button" onClick={() => { if (!displayName.trim()) { setErr("กรุณาใส่ชื่อร้าน"); return; } setErr(null); setStep(2); }}
              className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700">ถัดไป →</button>
          ) : (
            <button type="button" onClick={save} disabled={saving} className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "✓ บันทึกผู้จำหน่าย"}</button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
