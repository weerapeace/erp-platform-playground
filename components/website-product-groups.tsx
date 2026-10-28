"use client";

/**
 * 📦 กลุ่มสินค้าของเว็บร้าน (ใต้รายการโปรในแท็บ 🏷 โปรโมชัน) — ตั้งครั้งเดียว ใช้ซ้ำได้ทุกโปร
 *
 * รายการ = MiniTable กลาง · เพิ่ม/แก้ = ERPModal · ลบ = ConfirmDialog (กลุ่มที่โปรยังใช้อยู่ ลบไม่ได้ — API บอกชื่อโปร)
 * 2 แบบ: เลือกเอง (ตัวเลือกสินค้ากลาง WebsiteProductPicker) · อัตโนมัติ (หมวด / ช่วงราคา / มาใหม่ภายใน N วัน / รหัสขึ้นต้น)
 * ตัวอย่างสดว่า "ตอนนี้ตรงกี่รุ่น" ใช้ตัวตัดสินเดียวกับเว็บร้าน/ตอนรับออเดอร์ (groupMatches ใน lib/website-promotions)
 * กฎตรวจ lib/website-product-groups · API /api/website/product-groups
 */
import { useMemo, useState } from "react";
import { MiniTable } from "@/components/mini-table";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { WebsiteProductPicker } from "@/components/website-product-picker";
import { apiFetch } from "@/lib/api";
import { groupMatches, type GroupMatch, type ProductGroup } from "@/lib/website-promotions";
import { groupSummary, type ProductGroupRow } from "@/lib/website-product-groups";
import { webForm } from "@/lib/website-form-styles";

/** สินค้าบนเว็บร้าน (จาก API สาธารณะ — ข้อมูลเดียวกับที่ลูกค้าเห็น · ราคาเป็นบาท) */
export type ShopProduct = { code: string; name: string; price: number; categories: string[]; listedAt: string | null; image: string | null };

/** สินค้านี้ → ข้อมูลที่ตัวตัดสินกลุ่ม/ขอบเขตใช้ */
export const productLine = (p: ShopProduct) => ({ code: p.code, categories: p.categories, unitPrice: p.price, listedAt: p.listedAt });

/** รูปย่อ (รูปจาก ERP ขอขนาดเล็ก) */
export const thumbUrl = (u: string | null, w = 80) => (!u ? null : u.includes("/api/r2-image") && !u.includes("&w=") ? `${u}&w=${w}` : u);

const labelCls = webForm.label;
const inputCls = webForm.inputH9;

type Form = { id?: string; name: string; mode: ProductGroup["mode"]; codes: string[]; categories: string[]; priceMin: string; priceMax: string; newDays: string; prefixes: string; note: string };
const EMPTY: Form = { name: "", mode: "manual", codes: [], categories: [], priceMin: "", priceMax: "", newDays: "", prefixes: "", note: "" };

const matchOf = (f: Form): GroupMatch => ({
  categories: f.categories,
  priceMin: f.priceMin === "" ? null : Number(f.priceMin),
  priceMax: f.priceMax === "" ? null : Number(f.priceMax),
  newDays: f.newDays === "" ? null : Number(f.newDays),
  codePrefixes: f.prefixes.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean),
});

/** ป๊อปสร้าง/แก้กลุ่ม — ใช้ได้ทั้งจากตารางกลุ่ม และจากในป๊อปโปร (สร้างกลุ่มใหม่ระหว่างตั้งโปร) */
export function ProductGroupEditor({
  open,
  initial,
  shopSlug,
  shopId,
  products,
  cats,
  onClose,
  onSaved,
}: {
  open: boolean;
  initial: ProductGroupRow | null;
  shopSlug: string;
  shopId: string;
  products: ShopProduct[];
  cats: { key: string; label: string }[];
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<Form>(() =>
    initial
      ? {
          id: initial.id,
          name: initial.name,
          mode: initial.mode,
          codes: initial.codes,
          categories: initial.match.categories ?? [],
          priceMin: initial.match.priceMin == null ? "" : String(initial.match.priceMin),
          priceMax: initial.match.priceMax == null ? "" : String(initial.match.priceMax),
          newDays: initial.match.newDays == null ? "" : String(initial.match.newDays),
          prefixes: (initial.match.codePrefixes ?? []).join(", "),
          note: initial.note,
        }
      : { ...EMPTY },
  );
  const [saving, setSaving] = useState(false);
  const f = form;
  const set = (p: Partial<Form>) => setForm((x) => ({ ...x, ...p }));

  // ตัวอย่างสด: ตอนนี้ตรงกี่รุ่น (ตัวตัดสินเดียวกับเว็บร้าน)
  const matched = useMemo(() => {
    const g: ProductGroup = { id: "preview", name: f.name, mode: f.mode, codes: f.codes, match: matchOf(f) };
    return products.filter((p) => groupMatches(g, productLine(p)));
  }, [f, products]);

  const save = async () => {
    setSaving(true);
    try {
      const body = { name: f.name, mode: f.mode, codes: f.codes, match: matchOf(f), note: f.note, ...(f.id ? { id: f.id } : { shopId }) };
      const r = await apiFetch("/api/website/product-groups", { method: f.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) {
        toast.error(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      toast.success(f.id ? `บันทึกกลุ่ม "${f.name}" แล้ว — โปรที่ใช้กลุ่มนี้เปลี่ยนตามภายใน ~1 นาที` : `สร้างกลุ่ม "${f.name}" แล้ว`);
      onSaved(f.id ?? j.id);
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={f.id ? `แก้กลุ่ม ${initial?.name ?? ""}` : "สร้างกลุ่มสินค้า"}
      size="md"
      footer={
        <div className="flex items-center gap-2 w-full">
          <span className="flex-1 text-xs text-slate-500">ตอนนี้ตรง <b className="text-slate-800">{matched.length}</b> รุ่น{f.mode === "smart" ? " · สินค้าเข้าใหม่ที่ตรงเงื่อนไขเข้ากลุ่มเอง" : ""}</span>
          <button type="button" onClick={onClose} className="h-9 px-4 text-sm rounded-lg border border-slate-200">ยกเลิก</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="h-9 px-4 text-sm rounded-lg bg-orange-600 text-white disabled:opacity-50">{saving ? "กำลังบันทึก…" : "บันทึกกลุ่ม"}</button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className={labelCls}>ชื่อกลุ่ม (เห็นเฉพาะใน ERP)</label>
          <input className={inputCls} value={f.name} onChange={(e) => set({ name: e.target.value.slice(0, 60) })} placeholder="เช่น ของขวัญปีใหม่ / กระเป๋าราคากลาง / เคลียร์สต็อก" />
        </div>
        <div>
          <label className={labelCls}>แบบของกลุ่ม</label>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {(
              [
                ["manual", "✋ เลือกเอง", "หยิบรุ่นใส่กลุ่มทีละตัว"],
                ["smart", "✨ อัตโนมัติ", "ตามเงื่อนไข — ของเข้าใหม่ที่ตรง เข้ากลุ่มเอง"],
              ] as const
            ).map(([k, l, h]) => (
              <button key={k} type="button" onClick={() => set({ mode: k })} className={`text-left rounded-lg border px-3 py-2 ${f.mode === k ? "border-orange-500 bg-orange-50" : "border-slate-200 hover:border-slate-400"}`}>
                <span className="block text-sm font-medium text-slate-800">{l}</span>
                <span className="block text-[11px] text-slate-500">{h}</span>
              </button>
            ))}
          </div>
        </div>

        {f.mode === "manual" ? (
          <div>
            <label className={labelCls}>สินค้าในกลุ่ม</label>
            <WebsiteProductPicker shopSlug={shopSlug} value={f.codes} max={500} onChange={(codes) => set({ codes })} />
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <p className="text-[11px] text-slate-500">ทุกข้อที่ตั้งต้องตรง · ข้อที่เว้นว่าง = ไม่ใช้</p>
            <div>
              <label className={labelCls}>อยู่ในหมวด (หมวดใดหมวดหนึ่ง)</label>
              <div className="flex flex-wrap gap-1.5">
                {cats.map((c) => {
                  const on = f.categories.includes(c.key);
                  return (
                    <button key={c.key} type="button" onClick={() => set({ categories: on ? f.categories.filter((x) => x !== c.key) : [...f.categories, c.key] })} className={`h-7 px-2.5 rounded-full text-xs border ${on ? "border-orange-500 bg-orange-50 text-orange-800" : "border-slate-200 text-slate-600"}`}>
                      {c.label}
                    </button>
                  );
                })}
                {!cats.length && <span className="text-xs text-slate-400">ยังไม่มีหมวดเว็บ — ตั้งที่แท็บ 📂 หมวดหมู่</span>}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>ราคาตั้งแต่ (฿)</label>
                <input type="number" min={0} className={inputCls} value={f.priceMin} onChange={(e) => set({ priceMin: e.target.value })} placeholder="ไม่จำกัด" />
              </div>
              <div>
                <label className={labelCls}>ราคาไม่เกิน (฿)</label>
                <input type="number" min={0} className={inputCls} value={f.priceMax} onChange={(e) => set({ priceMax: e.target.value })} placeholder="ไม่จำกัด" />
              </div>
              <div>
                <label className={labelCls}>มาใหม่ภายใน (วัน)</label>
                <input type="number" min={1} max={365} className={inputCls} value={f.newDays} onChange={(e) => set({ newDays: e.target.value })} placeholder="ไม่ใช้" />
              </div>
            </div>
            <div>
              <label className={labelCls}>รหัสรุ่นขึ้นต้นด้วย (หลายแบบคั่นจุลภาค)</label>
              <input className={inputCls} value={f.prefixes} onChange={(e) => set({ prefixes: e.target.value.slice(0, 200) })} placeholder="เช่น PIX, LM" />
            </div>
          </div>
        )}

        <div>
          <label className={labelCls}>ตอนนี้ตรง {matched.length} รุ่น</label>
          {matched.length ? (
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {matched.slice(0, 60).map((p) => (
                <span key={p.code} title={p.name} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white pl-0.5 pr-2 py-0.5 text-[11px]">
                  {p.image ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={thumbUrl(p.image, 48) ?? ""} alt="" className="w-6 h-6 rounded object-cover bg-slate-100" />
                  ) : (
                    <span className="w-6 h-6 rounded bg-slate-100" />
                  )}
                  <span className="font-mono text-slate-700">{p.code}</span>
                </span>
              ))}
              {matched.length > 60 && <span className="text-[11px] text-slate-400 self-center">+{matched.length - 60} รุ่น</span>}
            </div>
          ) : (
            <p className="text-xs text-slate-400">{f.mode === "smart" ? "ยังไม่มีสินค้าบนเว็บที่ตรงเงื่อนไข — ลองขยายช่วงราคาหรือเลือกหมวดเพิ่ม" : "ยังไม่ได้เลือกสินค้า"}</p>
          )}
        </div>
        <div>
          <label className={labelCls}>บันทึกช่วยจำ (ไม่บังคับ)</label>
          <input className={inputCls} value={f.note} onChange={(e) => set({ note: e.target.value.slice(0, 200) })} placeholder="เช่น ใช้กับแคมเปญปลายปี" />
        </div>
      </div>
    </ERPModal>
  );
}

/** ตาราง 📦 กลุ่มสินค้า (ใต้รายการโปร) */
export function ProductGroupsPanel({
  shopSlug,
  shopId,
  groups,
  usedBy,
  products,
  cats,
  onChanged,
}: {
  shopSlug: string;
  shopId: string;
  groups: ProductGroupRow[];
  usedBy: Record<string, string[]>;
  products: ShopProduct[];
  cats: { key: string; label: string }[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState<ProductGroupRow | "new" | null>(null);
  const [del, setDel] = useState<ProductGroupRow | null>(null);
  const labelOf = (k: string) => cats.find((c) => c.key === k)?.label ?? k;
  const countOf = (g: ProductGroupRow) => products.filter((p) => groupMatches(g, productLine(p))).length;

  const remove = async () => {
    if (!del) return;
    const r = await apiFetch(`/api/website/product-groups?id=${encodeURIComponent(del.id)}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) toast.error(j.error ?? "ลบไม่สำเร็จ");
    else {
      toast.success(`ลบกลุ่ม "${del.name}" แล้ว`);
      onChanged();
    }
    setDel(null);
  };

  return (
    <>
      <MiniTable<ProductGroupRow>
        title="📦 กลุ่มสินค้า"
        rows={groups}
        rowKey={(g) => g.id}
        countUnit="กลุ่ม"
        searchText={(g) => `${g.name} ${g.codes.join(" ")} ${g.note}`}
        searchPlaceholder="ค้นหาชื่อกลุ่ม / รหัสรุ่น"
        onRowClick={(g) => setEditing(g)}
        actions={
          <button type="button" onClick={() => setEditing("new")} className="h-8 px-3 text-xs font-medium rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-50">
            + สร้างกลุ่ม
          </button>
        }
        emptyText={
          <div className="py-6 text-center">
            <p className="text-sm text-slate-600">ยังไม่มีกลุ่มสินค้า</p>
            <p className="text-xs text-slate-400 mt-1">จับกลุ่มไว้ครั้งเดียว แล้วเลือกใช้ในโปรไหนก็ได้ — เช่น "ของขวัญปีใหม่" (เลือกเอง) หรือ "กระเป๋า ฿800–1,500" (อัตโนมัติ)</p>
          </div>
        }
        columns={[
          { key: "name", header: "กลุ่ม", width: "1.4fr", cell: (g) => <span className="min-w-0"><span className="block text-sm font-medium text-slate-800">{g.mode === "smart" ? "✨ " : "✋ "}{g.name}</span>{g.note && <span className="block text-[11px] text-slate-400 truncate">{g.note}</span>}</span>, sortValue: (g) => g.name },
          { key: "rule", header: "สินค้าในกลุ่ม", width: "1.8fr", cell: (g) => <span className="text-xs text-slate-500">{groupSummary(g, labelOf)}</span> },
          { key: "count", header: "ตอนนี้", align: "right", width: "5rem", cell: (g) => <span className="text-xs tabular-nums">{countOf(g)} รุ่น</span>, sortValue: (g) => countOf(g) },
          { key: "used", header: "ใช้ในโปร", width: "1.2fr", cell: (g) => <span className="text-xs text-slate-500 line-clamp-2">{usedBy[g.id]?.join(", ") || "—"}</span> },
          {
            key: "act",
            header: "",
            width: "4rem",
            align: "right",
            cell: (g) => (
              <span onClick={(e) => e.stopPropagation()}>
                <button type="button" onClick={() => setDel(g)} className="h-7 px-2 text-[11px] rounded-md border border-slate-200 text-red-600 hover:border-red-300">ลบ</button>
              </span>
            ),
          },
        ]}
        footnote="✨ อัตโนมัติ = นับใหม่ทุกครั้งตามสินค้าบนเว็บตอนนั้น · แก้กลุ่มแล้วทุกโปรที่ใช้กลุ่มนี้เปลี่ยนตาม"
      />
      {editing && (
        <ProductGroupEditor
          open
          initial={editing === "new" ? null : editing}
          shopSlug={shopSlug}
          shopId={shopId}
          products={products}
          cats={cats}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => void remove()}
        variant="danger"
        title={`ลบกลุ่ม "${del?.name ?? ""}"?`}
        message={del && usedBy[del.id]?.length ? `กลุ่มนี้ยังใช้อยู่ในโปร: ${usedBy[del.id].join(", ")} — ต้องเอาออกจากโปรก่อน` : "ลบแล้วกู้คืนไม่ได้ (สินค้าไม่ได้ถูกลบ — แค่เลิกจับกลุ่ม)"}
        confirmText="ลบกลุ่ม"
      />
    </>
  );
}
