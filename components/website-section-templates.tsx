"use client";

/**
 * ⭐ แม่แบบ Section — ของกลางของตัวจัดหน้าเว็บ (หน้าแรก + หน้าอื่น ใช้ตัวเดียวกันผ่าน WebsiteBuilder)
 *
 * SaveSectionTemplateDialog = ป๊อปตั้งชื่อ → บันทึก Section ที่เลือก (เนื้อหา + รูปลักษณ์ + ชิ้นย่อย) เป็นแม่แบบ
 * SectionTemplateGroup      = กลุ่ม "⭐ แม่แบบที่บันทึกไว้" ในคลัง Section: กด = ใส่สำเนาท้ายหน้า · ✏️ แก้ชื่อ · 🗑 ลบ (ยืนยันก่อน)
 * ข้อมูล: /api/website/section-templates · ตัวทำความสะอาด lib/website-section-templates
 * ใช้แล้วได้ "สำเนา" — แก้ Section ทีหลังไม่กระทบแม่แบบ และกลับกัน
 */
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog, ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { SECTION_SCHEMAS } from "@/lib/website-schema";
import { defaultTemplateName, type SectionTemplate } from "@/lib/website-section-templates";
import { useT } from "@/components/i18n";
import { labelEn } from "@/lib/website-schema-en";

const API = "/api/website/section-templates";

/** ป๊อปตั้งชื่อแม่แบบ — โหมดบันทึกใหม่ (block) หรือแก้ชื่อ (rename) */
export function SaveSectionTemplateDialog({
  open,
  onClose,
  shopId,
  block,
  rename,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  shopId?: string | null;
  /** Section ที่จะบันทึก (โหมดบันทึกใหม่) */
  block?: Record<string, unknown> | null;
  /** แม่แบบที่จะแก้ชื่อ (โหมดแก้ชื่อ) */
  rename?: SectionTemplate | null;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const tx = useT();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setName(rename ? rename.name : block ? defaultTemplateName(block) : "");
  }, [open, rename, block]);

  const save = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      const r = await apiFetch(API, {
        method: rename ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rename ? { id: rename.id, name: n } : { shopId: shopId ?? null, name: n, block }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? tx("บันทึกไม่สำเร็จ", "Save failed"));
        return;
      }
      toast.success(rename ? tx("แก้ชื่อแม่แบบแล้ว", "Template renamed") : tx(`บันทึกแม่แบบ “${n}” แล้ว — หาได้ใน "+ เพิ่ม Section" กลุ่ม ⭐ แม่แบบที่บันทึกไว้`, `Template “${n}” saved — find it in "+ Add section" under ⭐ Saved templates`));
      onSaved?.();
      onClose();
    } catch {
      toast.error(tx("เชื่อมต่อไม่ได้", "Can't connect"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={rename ? tx("แก้ชื่อแม่แบบ", "Rename template") : tx("บันทึก Section เป็นแม่แบบ", "Save section as template")}
      description={rename ? undefined : tx("เก็บทั้งเนื้อหา รูปลักษณ์ และชิ้นย่อย ไว้ใช้ซ้ำกับหน้าอื่น/ร้านอื่น (ใช้แล้วได้สำเนา แก้แยกกันได้)", "Keeps content, style and items to reuse on other pages/shops (using it makes a copy you can edit separately)")}
      size="sm"
      defaultExpanded={false}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button type="button" onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
            {tx("ยกเลิก", "Cancel")}
          </button>
          <button type="button" disabled={busy || !name.trim()} onClick={() => void save()} className="h-9 px-4 text-sm font-medium text-white rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
            {busy ? tx("กำลังบันทึก…", "Saving…") : rename ? tx("บันทึกชื่อ", "Save name") : tx("💾 บันทึกแม่แบบ", "💾 Save template")}
          </button>
        </div>
      }
    >
      <label className="block text-[11px] font-medium text-slate-500 mb-1">{tx("ชื่อแม่แบบ", "Template name")}</label>
      <input
        autoFocus
        className="w-full h-9 rounded-lg border border-slate-200 px-3 text-sm"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
        }}
        placeholder={tx("เช่น แบนเนอร์โปรปีใหม่", "e.g. New Year promo banner")}
      />
    </ERPModal>
  );
}

/** กลุ่มแม่แบบในคลัง Section — โหลดเองตอนเปิดคลัง */
export function SectionTemplateGroup({
  shopId,
  query,
  allowedTypes,
  onUse,
}: {
  shopId?: string | null;
  query: string;
  /** ชนิด Section ที่ร้านนี้ใช้ได้ (Section ทดลองที่ยังไม่เปิด = ใส่ไม่ได้) */
  allowedTypes: Set<string>;
  onUse: (block: Record<string, unknown>, tpl: SectionTemplate) => void;
}) {
  const toast = useToast();
  const [list, setList] = useState<SectionTemplate[] | null>(null);
  const [renaming, setRenaming] = useState<SectionTemplate | null>(null);
  const [deleting, setDeleting] = useState<SectionTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const tx = useT();

  const load = useCallback(() => {
    apiFetch(API)
      .then((r) => r.json())
      .then((j) => setList(j.templates ?? []))
      .catch(() => setList([]));
  }, []);
  useEffect(() => load(), [load]);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const r = await apiFetch(`${API}?id=${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      const j = await r.json();
      if (!j.ok) toast.error(j.error ?? tx("ลบไม่สำเร็จ", "Delete failed"));
      else {
        toast.success(tx("ลบแม่แบบแล้ว — Section ที่เคยใช้ไปแล้วไม่กระทบ", "Template deleted — sections that already used it are unaffected"));
        setDeleting(null);
        load();
      }
    } catch {
      toast.error(tx("เชื่อมต่อไม่ได้", "Can't connect"));
    } finally {
      setBusy(false);
    }
  };

  if (!list || !list.length) return null;
  const q = query.trim().toLowerCase();
  const shown = list
    .filter((t) => !q || t.name.toLowerCase().includes(q) || (SECTION_SCHEMAS[t.type]?.meta.label ?? "").toLowerCase().includes(q) || labelEn(SECTION_SCHEMAS[t.type]?.meta.label ?? "").toLowerCase().includes(q))
    // ร้านนี้ก่อน แล้วร้านอื่น
    .sort((a, b) => Number(b.shopId === shopId) - Number(a.shopId === shopId));
  if (!shown.length) return null;

  return (
    <div>
      <p className="text-[10px] font-medium text-slate-500 mb-1">{tx("⭐ แม่แบบที่บันทึกไว้", "⭐ Saved templates")}</p>
      <div className="grid gap-1">
        {shown.map((t) => {
          const meta = SECTION_SCHEMAS[t.type]?.meta;
          const ok = allowedTypes.has(t.type);
          const other = t.shopId !== shopId;
          return (
            <div key={t.id} className={`group flex items-center gap-2 rounded-lg border px-2 py-1.5 ${ok ? "border-amber-200 bg-amber-50/40 hover:border-amber-400" : "border-slate-200 opacity-60"}`}>
              <button
                type="button"
                disabled={!ok}
                onClick={() => onUse(t.block, t)}
                title={ok ? tx(`ใส่ "${t.name}" ต่อท้ายหน้า (ได้สำเนา แก้แยกกันได้)`, `Add "${t.name}" at the end of the page (as an editable copy)`) : tx("Section ชนิดนี้ยังไม่เปิดในร้านนี้ (Section ทดลอง)", "This section type isn't enabled in this shop (beta section)")}
                className="flex-1 min-w-0 flex items-center gap-2 text-left disabled:cursor-not-allowed"
              >
                <span className="text-base leading-none">{meta?.icon ?? "⭐"}</span>
                <span className="min-w-0">
                  <span className="block text-xs text-slate-800 truncate">{t.name}</span>
                  <span className="block text-[10px] text-slate-400 truncate">
                    {labelEn(meta?.label) ?? t.type}
                    {other && tx(` · จากร้าน ${t.shopName ?? "อื่น"}`, ` · from shop ${t.shopName ?? "other"}`)}
                  </span>
                </span>
              </button>
              <button type="button" onClick={() => setRenaming(t)} title={tx("แก้ชื่อ", "Rename")} className="w-6 h-6 text-[11px] text-slate-400 hover:text-slate-800 opacity-0 group-hover:opacity-100 focus:opacity-100">
                ✏️
              </button>
              <button type="button" onClick={() => setDeleting(t)} title={tx("ลบแม่แบบ", "Delete template")} className="w-6 h-6 text-[11px] text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100">
                🗑️
              </button>
            </div>
          );
        })}
      </div>
      <SaveSectionTemplateDialog open={!!renaming} onClose={() => setRenaming(null)} rename={renaming} onSaved={load} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => !busy && setDeleting(null)}
        onConfirm={() => void remove()}
        loading={busy}
        variant="danger"
        title={tx(`ลบแม่แบบ “${deleting?.name ?? ""}”?`, `Delete template “${deleting?.name ?? ""}”?`)}
        message={tx("Section ที่เคยใส่จากแม่แบบนี้ไปแล้วจะไม่หาย (เป็นสำเนาแยก) — ลบแล้วแม่แบบนี้จะหายจากคลังทุกร้าน", "Sections already added from this template stay (they're separate copies) — deleting removes it from every shop's library")}
        confirmText={tx("ลบแม่แบบ", "Delete template")}
      />
    </div>
  );
}
