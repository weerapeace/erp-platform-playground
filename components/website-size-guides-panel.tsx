"use client";

/**
 * 📏 แท็บ "ตารางไซส์" ของร้าน (เว็บไซต์ → 📏 ตารางไซส์)
 * 1 ตาราง = ใช้กับหลายหมวด → สินค้าในหมวดนั้นที่มีไซส์ได้: ลิงก์ 📏 ตารางไซส์ · ช่วงใต้ปุ่มไซส์ · ตัวช่วย "กรอกรอบเอว → แนะนำไซส์"
 * ทับรายรุ่นได้ที่ป๊อปตั้งค่าสินค้าบนเว็บ (🛒 ขายบนเว็บ → ตารางไซส์)
 * ของกลาง: SaveBar · ConfirmDialog · FieldChipsPicker · toast · API /api/website/size-guides (lib/website-size-guides)
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { SaveBar } from "@/components/save-bar";
import { FieldChipsPicker } from "@/components/field-chips-picker";
import { MAX_COLUMNS, MAX_ROWS, SIZE_GUIDE_TEMPLATES, parseFitRange, type SizeGuide, type SizeGuideColumn } from "@/lib/website-size-guides";

type Cat = { key: string; label: string; parent: string | null };

const inputCls = "w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-blue-400";
const cellCls = "w-full min-w-[5rem] rounded-md border border-slate-200 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-400";
const labelCls = "block text-xs text-slate-500 mb-1";
const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const unitMark = (u: string) => (/^(นิ้ว|in|inch|inches)$/i.test(u.trim()) ? "″" : u.trim() ? ` ${u.trim()}` : "");

export function WebsiteSizeGuidesPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();
  const [guides, setGuides] = useState<SizeGuide[]>([]);
  const [saved, setSaved] = useState("[]");
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<SizeGuide | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await apiFetch(`/api/website/size-guides?shop=${encodeURIComponent(shopSlug)}`)).json();
      setGuides(j.guides ?? []);
      setSaved(JSON.stringify(j.guides ?? []));
      setCats(j.categories ?? []);
    } catch {
      toast.error("โหลดตารางไซส์ไม่สำเร็จ");
    }
    setLoading(false);
  }, [shopSlug, toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const dirty = JSON.stringify(guides) !== saved;
  const save = async () => {
    setSaving(true);
    try {
      const r = await apiFetch("/api/website/size-guides", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId, guides }) });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error);
      setGuides(j.guides);
      setSaved(JSON.stringify(j.guides));
      toast.success("บันทึกตารางไซส์แล้ว — เว็บร้านเปลี่ยนตามทันที");
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "บันทึกไม่สำเร็จ");
    }
    setSaving(false);
  };

  const patch = (id: string, p: Partial<SizeGuide>) => setGuides((gs) => gs.map((g) => (g.id === id ? { ...g, ...p } : g)));
  const add = (tplKey: string) => {
    const tpl = SIZE_GUIDE_TEMPLATES.find((t) => t.key === tplKey) ?? SIZE_GUIDE_TEMPLATES[0];
    setGuides((gs) => [...gs, { id: newId("g"), ...tpl.make() }]);
    setAddOpen(false);
  };

  if (loading) return <div className="text-sm text-slate-400 py-10 text-center">กำลังโหลด…</div>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-600 max-w-2xl">
          ตั้งตารางไซส์ครั้งเดียวให้หมวดสินค้า (เช่น Belts) → สินค้าในหมวดนั้นที่มี<b>ไซส์</b>จะมีลิงก์ <b>📏 ตารางไซส์</b> · ช่วงใต้ปุ่มไซส์ · ช่องกรอกรอบเอวแนะนำไซส์ ·
          หมวดแม่ครอบหมวดย่อย (หมวดย่อยที่มีตารางของตัวเองชนะ) · เลือกตารางเฉพาะรุ่นได้ที่ป๊อปตั้งค่าสินค้าบนเว็บ
        </p>
        <div className="relative">
          <button type="button" onClick={() => setAddOpen((o) => !o)} className="rounded-lg bg-blue-600 text-white text-sm px-3 py-1.5 hover:bg-blue-700">
            ＋ เพิ่มตารางไซส์
          </button>
          {addOpen && (
            <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-slate-200 bg-white shadow-lg p-1">
              {SIZE_GUIDE_TEMPLATES.map((t) => (
                <button key={t.key} type="button" onClick={() => add(t.key)} className="block w-full text-left rounded-md px-3 py-2 text-sm hover:bg-slate-50">
                  {t.label}
                </button>
              ))}
              <p className="px-3 py-1.5 text-[11px] text-amber-700">ค่าในแม่แบบเป็นตัวอย่าง — แก้ให้ตรงสินค้าจริงก่อนเลือกหมวด</p>
            </div>
          )}
        </div>
      </div>

      {!guides.length && (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          ยังไม่มีตารางไซส์ — กด ＋ เพิ่มตารางไซส์ แล้วเลือกแม่แบบ &quot;เข็มขัด&quot; เพื่อเริ่ม
        </div>
      )}

      {guides.map((g) => (
        <GuideCard key={g.id} g={g} cats={cats} onChange={(p) => patch(g.id, p)} onDelete={() => setDel(g)} />
      ))}

      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => {
          if (del) setGuides((gs) => gs.filter((x) => x.id !== del.id));
          setDel(null);
        }}
        title="ลบตารางไซส์"
        message={`ลบ "${del?.name ?? ""}"? สินค้าที่ใช้ตารางนี้จะไม่มีตารางไซส์ (มีผลเมื่อกดบันทึก)`}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        variant="danger"
      />
      <SaveBar dirty={dirty} saving={saving} onSave={save} onDiscard={() => setGuides(JSON.parse(saved))} saveLabel="💾 บันทึกตารางไซส์" note="บันทึกแล้วเว็บร้านเปลี่ยนตามทันที" />
    </div>
  );
}

function GuideCard({ g, cats, onChange, onDelete }: { g: SizeGuide; cats: Cat[]; onChange: (p: Partial<SizeGuide>) => void; onDelete: () => void }) {
  const setCol = (i: number, p: Partial<SizeGuideColumn>) => onChange({ columns: g.columns.map((c, j) => (j === i ? { ...c, ...p } : c)) });
  const addCol = () => g.columns.length < MAX_COLUMNS && onChange({ columns: [...g.columns, { key: newId("c"), label: "คอลัมน์ใหม่" }] });
  const delCol = (key: string) =>
    onChange({
      columns: g.columns.filter((c) => c.key !== key),
      rows: g.rows.map((r) => ({ ...r, cells: Object.fromEntries(Object.entries(r.cells).filter(([k]) => k !== key)) })),
      fitColumn: g.fitColumn === key ? null : g.fitColumn,
    });
  const setRow = (i: number, size: string) => onChange({ rows: g.rows.map((r, j) => (j === i ? { ...r, size } : r)) });
  const setCell = (i: number, key: string, v: string) => onChange({ rows: g.rows.map((r, j) => (j === i ? { ...r, cells: { ...r.cells, [key]: v } } : r)) });
  const addRow = () => g.rows.length < MAX_ROWS && onChange({ rows: [...g.rows, { size: "", cells: {} }] });
  const delRow = (i: number) => onChange({ rows: g.rows.filter((_, j) => j !== i) });
  const fitCol = g.columns.find((c) => c.key === g.fitColumn) ?? null;
  // ช่วงในคอลัมน์ fit ที่อ่านเป็นตัวเลขไม่ได้ → ตัวช่วยแนะนำไซส์จะข้ามแถวนั้น
  const badFit = fitCol ? g.rows.filter((r) => r.size && !parseFitRange(r.cells[fitCol.key])).map((r) => r.size) : [];
  const enCount = [g.name_en, g.note_en, g.helperLabel_en, g.unit_en, ...g.columns.map((c) => c.label_en)].filter(Boolean).length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <label className={labelCls}>ชื่อตาราง</label>
          <input value={g.name} onChange={(e) => onChange({ name: e.target.value })} className={inputCls} placeholder="ตารางไซส์เข็มขัด" />
        </div>
        <button type="button" onClick={onDelete} className="mt-5 shrink-0 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50">
          🗑 ลบ
        </button>
      </div>

      <div>
        <span className={labelCls}>ใช้กับหมวด (หมวดแม่ = ครอบหมวดย่อยทั้งหมด)</span>
        <FieldChipsPicker
          value={g.categories}
          onChange={(next) => onChange({ categories: next })}
          fields={cats.map((c) => ({ key: c.key, label: c.label }))}
          title="ตารางนี้ใช้กับหมวดไหน"
          description="สินค้าในหมวดที่ติ๊ก (และหมวดย่อย) ที่มีไซส์ จะเห็นตารางนี้"
          addLabel="＋ เลือกหมวด"
          searchPlaceholder="ค้นหาหมวด…"
          unit="หมวด"
          showKeys={false}
          emptyText="ยังไม่ได้เลือกหมวด — ตารางนี้ยังไม่ขึ้นเว็บ"
        />
      </div>

      {/* ตารางไซส์: แถว = ไซส์ (ตรงกับปุ่มไซส์) · คอลัมน์ = ค่าที่วัด */}
      <div className="overflow-x-auto">
        <table className="text-sm border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="text-left text-xs font-normal text-slate-500 px-1">ไซส์</th>
              {g.columns.map((c, i) => (
                <th key={c.key} className="p-0">
                  <div className="flex items-center gap-1">
                    <input value={c.label} onChange={(e) => setCol(i, { label: e.target.value })} className={`${cellCls} font-medium`} aria-label="ชื่อคอลัมน์" />
                    <button type="button" onClick={() => delCol(c.key)} className="text-slate-400 hover:text-red-500 text-xs px-1" title="ลบคอลัมน์">
                      ✕
                    </button>
                  </div>
                </th>
              ))}
              <th className="p-0">
                {g.columns.length < MAX_COLUMNS && (
                  <button type="button" onClick={addCol} className="whitespace-nowrap rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50">
                    ＋ คอลัมน์
                  </button>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r, i) => (
              <tr key={i}>
                <td className="p-0">
                  <input value={r.size} onChange={(e) => setRow(i, e.target.value)} className={`${cellCls} min-w-[3.5rem] w-16 font-medium`} placeholder="S" aria-label="ไซส์" />
                </td>
                {g.columns.map((c) => (
                  <td key={c.key} className="p-0">
                    <input value={r.cells[c.key] ?? ""} onChange={(e) => setCell(i, c.key, e.target.value)} className={cellCls} placeholder={c.key === g.fitColumn ? "28–32" : ""} />
                  </td>
                ))}
                <td className="p-0">
                  <button type="button" onClick={() => delRow(i)} className="text-slate-400 hover:text-red-500 text-xs px-1" title="ลบแถว">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {g.rows.length < MAX_ROWS && (
          <button type="button" onClick={addRow} className="mt-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50">
            ＋ แถว (ไซส์)
          </button>
        )}
        <p className="mt-1 text-[11px] text-slate-500">ชื่อไซส์ต้องตรงกับปุ่มไซส์ของสินค้า (S, M, L …) · ไม่ตรง = แถวนั้นโชว์ในตารางอย่างเดียว</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className={labelCls}>ช่วงใต้ปุ่มไซส์ + ใช้แนะนำไซส์</span>
          <select value={g.fitColumn ?? ""} onChange={(e) => onChange({ fitColumn: e.target.value || null })} className={inputCls}>
            <option value="">— ไม่แสดง —</option>
            {g.columns.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>ให้ลูกค้ากรอก (ตัวช่วยแนะนำไซส์)</span>
          <input value={g.helperLabel} onChange={(e) => onChange({ helperLabel: e.target.value })} className={inputCls} placeholder="รอบเอว" disabled={!g.helper} />
        </label>
        <label className="block">
          <span className={labelCls}>หน่วย</span>
          <input value={g.unit} onChange={(e) => onChange({ unit: e.target.value })} className={inputCls} placeholder="นิ้ว" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
        <input type="checkbox" checked={g.helper} onChange={(e) => onChange({ helper: e.target.checked })} className="w-4 h-4 accent-blue-600" disabled={!fitCol} />
        เปิดตัวช่วย &quot;ไม่แน่ใจ? กรอก{g.helperLabel || "ขนาด"} → แนะนำไซส์&quot;
        {!fitCol && <span className="text-[11px] text-slate-400">(เลือกคอลัมน์ช่วงด้านบนก่อน)</span>}
      </label>
      {badFit.length > 0 && (
        <p className="text-[11px] rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1">
          ไซส์ {badFit.join(", ")}: ช่อง &quot;{fitCol?.label}&quot; อ่านเป็นตัวเลขไม่ได้ — พิมพ์แบบ 28–32 หรือ 34 ไม่งั้นตัวช่วยจะข้ามไซส์นี้
        </p>
      )}

      <label className="block">
        <span className={labelCls}>วิธีวัด / หมายเหตุ (โชว์ใต้ตาราง)</span>
        <textarea value={g.note} onChange={(e) => onChange({ note: e.target.value })} rows={3} className={inputCls} placeholder="วัดรอบเอวตรงตำแหน่งที่คาดเข็มขัดจริง…" />
      </label>

      {/* 🌐 ภาษาอังกฤษ (หน้าเว็บ /en) — ว่าง = ใช้ไทย */}
      <details className="rounded-lg border border-slate-200 px-3 py-2">
        <summary className="cursor-pointer text-xs text-slate-500">🌐 ภาษาอังกฤษ ({enCount} ช่อง) — ว่าง = ใช้ภาษาไทย</summary>
        <div className="grid gap-2 sm:grid-cols-2 mt-2">
          <label className="block">
            <span className={labelCls}>ชื่อตาราง (EN)</span>
            <input value={g.name_en ?? ""} onChange={(e) => onChange({ name_en: e.target.value })} className={inputCls} placeholder="Belt size guide" />
          </label>
          <label className="block">
            <span className={labelCls}>ให้ลูกค้ากรอก / หน่วย (EN)</span>
            <div className="flex gap-2">
              <input value={g.helperLabel_en ?? ""} onChange={(e) => onChange({ helperLabel_en: e.target.value })} className={inputCls} placeholder="Waist" />
              <input value={g.unit_en ?? ""} onChange={(e) => onChange({ unit_en: e.target.value })} className={`${inputCls} w-24`} placeholder="in" />
            </div>
          </label>
          {g.columns.map((c, i) => (
            <label key={c.key} className="block">
              <span className={labelCls}>คอลัมน์ &quot;{c.label}&quot; (EN)</span>
              <input value={c.label_en ?? ""} onChange={(e) => setCol(i, { label_en: e.target.value })} className={inputCls} />
            </label>
          ))}
          <label className="block sm:col-span-2">
            <span className={labelCls}>วิธีวัด / หมายเหตุ (EN)</span>
            <textarea value={g.note_en ?? ""} onChange={(e) => onChange({ note_en: e.target.value })} rows={2} className={inputCls} />
          </label>
        </div>
      </details>

      {/* ตัวอย่างบนเว็บ */}
      <div className="rounded-lg bg-slate-50 px-3 py-2">
        <div className="text-[11px] text-slate-500 mb-1.5">ตัวอย่างบนหน้าสินค้า</div>
        <div className="flex flex-wrap gap-2">
          {g.rows
            .filter((r) => r.size)
            .map((r, i) => (
              <div key={i} className="text-center">
                <span className="inline-flex min-w-[2.75rem] justify-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs">{r.size}</span>
                {fitCol && r.cells[fitCol.key] && (
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {r.cells[fitCol.key]}
                    {unitMark(g.unit)}
                  </div>
                )}
              </div>
            ))}
        </div>
        {g.helper && fitCol && (
          <div className="mt-2 text-xs text-slate-600">
            ไม่แน่ใจ? {g.helperLabel || "ขนาด"} <span className="inline-block w-12 rounded border border-slate-300 bg-white px-1 text-slate-400">34</span> {g.unit} → แนะนำไซส์ให้
          </div>
        )}
      </div>
    </div>
  );
}
