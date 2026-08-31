"use client";

/**
 * ทะเบียนบริษัท (หัวบิลบนเอกสาร) — /admin/companies
 *
 * เดิมหัวบิลถูก "พิมพ์ฝังตาย" อยู่ในแม่แบบเอกสาร → ขายในนามบริษัทอื่นไม่ได้
 * หน้านี้ทำให้เพิ่มบริษัทที่ 3, 4 ได้เองจากเว็บ ไม่ต้องแก้โค้ด (กฎ CLAUDE.md ข้อ 35)
 *
 * มีตัวอย่างหัวบิลให้ดูสด ๆ ระหว่างกรอก — จะได้เห็นว่าพิมพ์ออกมาหน้าตาแบบไหน
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { ImageAttachKeys } from "@/components/image-attach";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { formatThaiAddress, formatTaxId } from "@/lib/thai-address";
import type { Company } from "@/app/api/admin/companies/route";

const BLANK: Partial<Company> = {
  company_code: "", name: "", name_th: "", name_en: "",
  address_line: "", sub_district: "", district: "", province: "", postal_code: "",
  tax_id: "", tax_branch: "00000", phone: "", fax: "", doc_pattern: "",
  vat_registered: true,
};

export default function CompaniesPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Company>>(BLANK);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/api/admin/companies");
      const j = (await r.json()) as { data?: Company[] };
      setRows(j.data ?? []);
    } catch { toast.error("โหลดรายชื่อบริษัทไม่ได้"); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const pick = (c: Company) => { setCreating(false); setSelId(c.id); setForm({ ...c }); };
  const startNew = () => { setCreating(true); setSelId(null); setForm({ ...BLANK }); };
  const set = (k: keyof Company, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const save = useCallback(async () => {
    if (!form.company_code?.trim()) { toast.error("ต้องใส่รหัสบริษัท"); return; }
    if (!(form.name?.trim() || form.name_th?.trim())) { toast.error("ต้องใส่ชื่อบริษัท"); return; }
    setSaving(true);
    try {
      const body = { ...form, name: form.name?.trim() || form.name_th?.trim() };
      const r = await apiFetch("/api/admin/companies", {
        method: creating ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creating ? body : { ...body, id: selId }),
      });
      const j = (await r.json()) as { data?: Company; error?: string };
      if (!r.ok || !j.data) { toast.error(j.error ?? "บันทึกไม่สำเร็จ"); return; }
      toast.success(creating ? `เพิ่ม "${j.data.name}" แล้ว` : "บันทึกแล้ว");
      setCreating(false); setSelId(j.data.id); setForm({ ...j.data });
      await load();
    } catch { toast.error("บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  }, [form, creating, selId, toast, load]);

  const setDefault = useCallback(async (c: Company) => {
    await apiFetch("/api/admin/companies", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, is_default: true }),
    });
    toast.success(`ตั้ง "${c.name}" เป็นบริษัทตั้งต้นแล้ว`);
    await load();
  }, [toast, load]);

  // ตัวอย่างหัวบิล — ให้เห็นสด ๆ ว่าพิมพ์ออกมาหน้าตาแบบไหน
  const preview = useMemo(() => ({
    th: form.name_th || form.name || "(ยังไม่ใส่ชื่อ)",
    en: form.name_en || "",
    addr: formatThaiAddress({
      address_line: form.address_line, sub_district: form.sub_district,
      district: form.district, province: form.province, postal_code: form.postal_code,
    }),
    tax: formatTaxId(form.tax_id, form.tax_branch),
    tel: [form.phone && `โทร/Tel: ${form.phone}`, form.fax && `แฟกซ์/Fax: ${form.fax}`].filter(Boolean).join(" "),
  }), [form]);

  const inp = "w-full h-9 px-3 text-sm border border-slate-200 rounded-md";
  const lbl = "block text-xs font-medium text-slate-600 mb-1";

  return (
    <PlaygroundShell>
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">🏢 ทะเบียนบริษัท (หัวบิล)</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              ข้อมูลตรงนี้จะไปขึ้นหัวใบกำกับภาษี / ใบสั่งซื้อ · เพิ่มบริษัทใหม่ได้เอง ไม่ต้องแก้โค้ด
            </p>
          </div>
          <button onClick={startNew} className="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
            + เพิ่มบริษัท
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
          {/* รายชื่อ */}
          <div className="space-y-2">
            {loading ? <div className="text-sm text-slate-400 py-6 text-center">กำลังโหลด…</div>
              : rows.length === 0 ? <div className="text-sm text-slate-400 py-6 text-center">ยังไม่มีบริษัท</div>
              : rows.map((c) => (
                <button key={c.id} onClick={() => pick(c)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border ${selId === c.id
                    ? "bg-blue-50 border-blue-300" : "bg-white border-slate-200 hover:border-slate-300"} ${c.status === "inactive" ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{c.company_code}</span>
                    {c.is_default && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">ตั้งต้น</span>}
                  {c.vat_registered === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">ไม่มี VAT</span>}
                  </div>
                  <div className="text-sm text-slate-800 mt-1 leading-snug">{c.name_th || c.name}</div>
                  {!c.tax_id && <div className="text-[11px] text-rose-500 mt-0.5">⚠️ ยังไม่มีเลขผู้เสียภาษี</div>}
                </button>
              ))}
          </div>

          {/* ฟอร์ม */}
          {(creating || selId) ? (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
              {/* ตัวอย่างหัวบิล */}
              <div className="border border-dashed border-slate-300 rounded-lg p-3 bg-slate-50">
                <div className="text-[11px] text-slate-400 mb-1.5">ตัวอย่างหัวบิลที่จะพิมพ์ออกมา</div>
                <div className="text-[13px] font-bold text-slate-900">{preview.th}</div>
                {preview.en && <div className="text-[13px] font-bold text-slate-900">{preview.en}</div>}
                {preview.addr && <div className="text-[11px] text-slate-600 mt-0.5">{preview.addr}</div>}
                {preview.tel && <div className="text-[11px] text-slate-600">{preview.tel}</div>}
                {preview.tax && <div className="text-[11px] text-slate-600">เลขประจำตัวผู้เสียภาษีอากร/TAX ID {preview.tax}</div>}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div><label className={lbl}>รหัสบริษัท *</label>
                  <input value={form.company_code ?? ""} onChange={(e) => set("company_code", e.target.value.toUpperCase())}
                    className={inp + " font-mono"} placeholder="ISG" disabled={!creating} /></div>
                <div className="col-span-2"><label className={lbl}>ชื่อย่อ (ใช้ในระบบ) *</label>
                  <input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} className={inp} placeholder="ไอ.เอส.จี. เทรดดิ้ง" /></div>
                <div><label className={lbl}>รูปแบบเลขเอกสาร</label>
                  <input value={form.doc_pattern ?? ""} onChange={(e) => set("doc_pattern", e.target.value)}
                    className={inp + " font-mono text-xs"} placeholder="ISG{BYYYY}-{MM}-{000}" /></div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div><label className={lbl}>ชื่อเต็มภาษาไทย (ขึ้นหัวบิล)</label>
                  <input value={form.name_th ?? ""} onChange={(e) => set("name_th", e.target.value)} className={inp}
                    placeholder="หจก.ไอ.เอส.จี. เทรดดิ้ง (สำนักงานใหญ่)" /></div>
                <div><label className={lbl}>ชื่อเต็มภาษาอังกฤษ</label>
                  <input value={form.name_en ?? ""} onChange={(e) => set("name_en", e.target.value)} className={inp}
                    placeholder="I.S.G.TRADING LTD.,PART (HEAD OFFICE)" /></div>
              </div>

              <div>
                <label className={lbl}>ที่อยู่</label>
                <input value={form.address_line ?? ""} onChange={(e) => set("address_line", e.target.value)} className={inp + " mb-2"}
                  placeholder="41/243, 41/244 ถนนกัลปพฤกษ์" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <input value={form.sub_district ?? ""} onChange={(e) => set("sub_district", e.target.value)} className={inp} placeholder="แขวง/ตำบล" />
                  <input value={form.district ?? ""} onChange={(e) => set("district", e.target.value)} className={inp} placeholder="เขต/อำเภอ" />
                  <input value={form.province ?? ""} onChange={(e) => set("province", e.target.value)} className={inp} placeholder="จังหวัด" />
                  <input value={form.postal_code ?? ""} onChange={(e) => set("postal_code", e.target.value)} className={inp} placeholder="รหัสไปรษณีย์" />
                </div>
                <div className="text-[11px] text-slate-400 mt-1">กรุงเทพฯ ระบบจะเติม "แขวง/เขต" ให้เอง · ต่างจังหวัดเติม "ตำบล/อำเภอ/จังหวัด"</div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="col-span-2"><label className={lbl}>เลขประจำตัวผู้เสียภาษี</label>
                  <input value={form.tax_id ?? ""} onChange={(e) => set("tax_id", e.target.value)} className={inp} placeholder="13 หลัก" /></div>
                <div><label className={lbl}>สาขา</label>
                  <input value={form.tax_branch ?? ""} onChange={(e) => set("tax_branch", e.target.value)} className={inp} placeholder="00000" /></div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div><label className={lbl}>โทรศัพท์</label>
                  <input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} className={inp} /></div>
                <div><label className={lbl}>แฟกซ์</label>
                  <input value={form.fax ?? ""} onChange={(e) => set("fax", e.target.value)} className={inp} /></div>
              </div>

              {/* ไม่จด VAT (เช่น ออกบิลในนามบุคคล) → เอกสารจะไม่คิด VAT และไม่ใช่ใบกำกับภาษี */}
              <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <input type="checkbox" className="mt-0.5" checked={form.vat_registered !== false}
                  onChange={(e) => set("vat_registered", e.target.checked)} />
                <span className="text-sm text-slate-700">
                  จดทะเบียน VAT (ออกใบกำกับภาษีได้)
                  <span className="block text-[11px] text-slate-500">
                    ติ๊กออก = ออกบิลในนามนี้จะ<strong>ไม่คิด VAT</strong> และเอกสารจะพิมพ์เป็น &ldquo;บิลเงินสด/ใบส่งของ&rdquo; ไม่ใช่ใบกำกับภาษี (เช่น ออกในนามบุคคล)
                  </span>
                </span>
              </label>

              <div><label className={lbl}>โลโก้บริษัท (ถ้ามี)</label>
                <ImageAttachKeys value={form.logo_key ? [form.logo_key] : []}
                  onChange={(k) => set("logo_key", k[0] ?? null)} folder="company-logos" /></div>

              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100">
                <button onClick={() => void save()} disabled={saving}
                  className="h-10 px-5 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50">
                  {saving ? "กำลังบันทึก…" : creating ? "✓ เพิ่มบริษัท" : "✓ บันทึก"}
                </button>
                {!creating && selId && !rows.find((c) => c.id === selId)?.is_default && (
                  <button onClick={() => { const c = rows.find((x) => x.id === selId); if (c) void setDefault(c); }}
                    className="h-10 px-4 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm">
                    ตั้งเป็นบริษัทตั้งต้น
                  </button>
                )}
                <div className="text-[11px] text-slate-400 ml-auto">
                  แก้รูปแบบเลขเอกสาร = ใบใหม่ใช้รูปแบบใหม่ · เลขที่ออกไปแล้วไม่เปลี่ยน
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-dashed border-slate-200 rounded-xl p-10 text-center text-slate-400 text-sm">
              เลือกบริษัทจากรายการซ้าย หรือกด "+ เพิ่มบริษัท"
            </div>
          )}
        </div>
      </div>
    </PlaygroundShell>
  );
}
