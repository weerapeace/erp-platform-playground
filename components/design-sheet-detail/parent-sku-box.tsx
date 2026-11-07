"use client";

/**
 * 📦 "สินค้าของงานนี้" (Parent SKU ของใบงานออกแบบ) — เจ้าของขอ 2026-11-07 "ตรง Parent SKU ออกแบบใหม่ให้ดูง่าย ๆ"
 *
 *   • 1 Parent = 1 แถว: รหัส (กดเปิด Parent) · รูปเล็กของ SKU ลูก · "N SKU" · กดแถวกาง/พับรายการ SKU (รูป · รหัส · สี · ราคา)
 *     (มี Parent ตัวเดียว = กางให้เลย · หลายตัว = พับไว้ก่อน)
 *   • SKU ใต้ Parent เดียวกันที่ไม่ได้สร้างจากใบนี้ = พับเป็นบรรทัดเดียว "+ อีก N ตัว"
 *   • ร่าง Parent (ยังไม่มีรหัส) = แถวเส้นประสีส้มในกล่องเดียวกัน
 *   • ปุ่มเดียว "+ เพิ่ม Parent SKU" → เลือก "มีรหัสแล้ว" (เช็กรหัสซ้ำ/ข้ามเลขเหมือนเดิม + ปุ่มลัด "ใช้ XXX (ถัดไป)") หรือ "ยังไม่มีรหัส (ร่าง)"
 * สถานะช่องพิมพ์รหัส/ผลเช็ก อยู่ที่หน้าแม่ (index.tsx) เพราะตอนบันทึกใบงานต้องรวมรหัสที่ค้างพิมพ์ด้วย
 */
import { useEffect, useMemo, useState } from "react";
import { ImageThumbnail } from "@/components/image-manager";
import { RecordPeekLink } from "@/components/pickers/record-peek-link";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { ParentSkuCheck } from "@/app/api/design-sheets/parent-sku-check/route";
import type { DesignSheetLinkedSku } from "@/app/api/design-sheets/[id]/route";

const skuImg = (key: string) => `/api/r2-image?key=${encodeURIComponent(key)}`;

export function ParentSkuBox({
  canEdit, codes, drafts, refs, linkedSkus,
  input, setInput, check, checking, onAddTyped, onAddCode, onRemoveCode,
  draftInput, setDraftInput, onAddDraft, onRemoveDraft,
}: {
  canEdit: boolean;
  codes: string[];
  drafts: string[];
  /** รหัส → id ของ Parent (มี = กดเปิดดูได้) */
  refs: Record<string, string>;
  linkedSkus: DesignSheetLinkedSku[];
  input: string;
  setInput: (v: string) => void;
  check: ParentSkuCheck | null;
  checking: boolean;
  /** เพิ่มรหัสที่พิมพ์ในช่อง (หน้าแม่เช็กซ้ำให้) */
  onAddTyped: () => void;
  /** เพิ่มรหัสตรง ๆ (ปุ่มลัด "ใช้ XXX (ถัดไป)" — เช็กแล้วว่าไม่ซ้ำ) */
  onAddCode: (code: string) => void;
  onRemoveCode: (code: string) => void;
  draftInput: string;
  setDraftInput: (v: string) => void;
  onAddDraft: () => void;
  onRemoveDraft: (label: string) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [openRows, setOpenRows] = useState<Set<string> | null>(null);   // null = ตั้งต้นตามจำนวน
  const [showSibs, setShowSibs] = useState<Set<string>>(() => new Set());
  const [adding, setAdding] = useState<null | "code" | "draft">(null);
  const [suggest, setSuggest] = useState<string | null>(null);

  const isOpen = (c: string) => (openRows ? openRows.has(c) : codes.length === 1);
  const toggleRow = (c: string) => setOpenRows((prev) => {
    const next = new Set(prev ?? (codes.length === 1 ? codes : []));
    if (next.has(c)) next.delete(c); else next.add(c);
    return next;
  });

  // SKU แยกตาม Parent · ตัวที่ Parent ไม่อยู่ในรายการ (เช่น ลบรหัสออกแล้ว) รวมเป็นกลุ่ม "อื่น ๆ"
  const groups = useMemo(() => {
    const by = new Map<string, DesignSheetLinkedSku[]>();
    for (const s of linkedSkus) { const k = s.parent_code ?? ""; const a = by.get(k); if (a) a.push(s); else by.set(k, [s]); }
    const other = linkedSkus.filter((s) => !codes.includes(s.parent_code ?? "") && s.from_sheet);
    return { by, other };
  }, [linkedSkus, codes]);

  // ปุ่มลัด "ใช้รหัสถัดไป": ถามเลขถัดไปจากรหัส Parent ตัวล่าสุดของใบนี้ (ตอนเปิดช่องเพิ่มแบบมีรหัส + ยังไม่ได้พิมพ์)
  const lastCode = codes[codes.length - 1] ?? "";
  useEffect(() => {
    if (adding !== "code" || !lastCode || input.trim()) { if (!lastCode) setSuggest(null); return; }
    let cancel = false;
    apiFetch(`/api/design-sheets/parent-sku-check?code=${encodeURIComponent(lastCode)}`).then((r) => r.json())
      .then((j) => { if (!cancel && !j.error) setSuggest((j.data as ParentSkuCheck).suggested ?? null); })
      .catch(() => {});
    return () => { cancel = true; };
  }, [adding, lastCode, input]);
  const nextCode = (input.trim() ? check?.suggested : suggest) ?? null;
  const addNext = async (code: string) => {
    try {
      const j = await apiFetch(`/api/design-sheets/parent-sku-check?code=${encodeURIComponent(code)}`).then((r) => r.json());
      if ((j.data as ParentSkuCheck | undefined)?.exists) { toast.error(t(`รหัส ${code} มีอยู่ในระบบแล้ว`, `Code ${code} already exists`)); return; }
      onAddCode(code); setInput(""); setAdding(null);
    } catch { toast.error(t("เช็กรหัสไม่สำเร็จ ลองใหม่อีกครั้ง", "Could not check the code — try again")); }
  };
  const closeAdd = () => { setAdding(null); setInput(""); setDraftInput(""); };

  const skuRow = (s: DesignSheetLinkedSku, dim = false) => (
    <div key={s.id} className={`flex items-center gap-2 px-2.5 py-1.5 text-xs ${dim ? "opacity-60" : ""}`}
      title={s.from_sheet ? t("สร้างจากใบงานนี้", "Created from this design sheet") : t(`อยู่ใต้ Parent ${s.parent_code ?? ""} (ไม่ได้สร้างจากใบนี้)`, `Under Parent ${s.parent_code ?? ""} (not from this sheet)`)}>
      {s.image_key ? <ImageThumbnail url={skuImg(s.image_key)} size={22} /> : <span className="inline-block h-[22px] w-[22px] shrink-0 rounded bg-slate-100" />}
      <RecordPeekLink moduleKey="skus-v2" recordId={s.id} label={s.code} />
      <span className="min-w-0 truncate text-slate-500">{s.color || s.name_th || ""}</span>
      <span className="ml-auto shrink-0 tabular-nums text-slate-500">{s.standard_price != null ? `฿${s.standard_price.toLocaleString("th-TH")}` : ""}</span>
      {!s.is_active && <span className="shrink-0 text-[10px] text-slate-400">{t("ปิดใช้", "Inactive")}</span>}
    </div>
  );

  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-slate-500">
        <Icon name="package" className="text-slate-400" /> {t("สินค้าของงานนี้", "Products of this job")} <span className="text-slate-400">(Parent SKU)</span>
      </div>
      <div className="space-y-1.5">
        {codes.map((c) => {
          const mine = (groups.by.get(c) ?? []).filter((s) => s.from_sheet);
          const sibs = (groups.by.get(c) ?? []).filter((s) => !s.from_sheet);
          const open = isOpen(c);
          const pid = refs[c];
          return (
            <div key={c} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div role="button" tabIndex={0} onClick={() => toggleRow(c)} onKeyDown={(e) => { if (e.key === "Enter") toggleRow(c); }}
                className="flex cursor-pointer items-center gap-2 px-2.5 py-2 hover:bg-slate-50" aria-expanded={open}>
                <span className="w-3 text-center text-[10px] text-slate-400">{open ? "▼" : "▶"}</span>
                <span onClick={(e) => e.stopPropagation()}>
                  {pid ? <RecordPeekLink moduleKey="parent-skus-v2" recordId={pid} label={c} />
                    : <span className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono text-xs text-blue-700" title={t("ยังไม่ได้สร้าง Parent นี้ในระบบ", "This Parent is not created yet")}>{c}</span>}
                </span>
                {mine.length > 0 && (
                  <span className="flex -space-x-1">
                    {mine.slice(0, 4).map((s) => s.image_key
                      ? <span key={s.id} className="rounded ring-2 ring-white"><ImageThumbnail url={skuImg(s.image_key)} size={20} /></span>
                      : <span key={s.id} className="inline-block h-5 w-5 rounded bg-slate-100 ring-2 ring-white" />)}
                  </span>
                )}
                <span className="text-[11px] text-slate-500">{mine.length > 0 ? t(`${mine.length} SKU`, `${mine.length} SKUs`) : pid ? t("ยังไม่มี SKU จากใบนี้", "No SKUs from this sheet yet") : t("ยังไม่ได้สร้าง", "Not created yet")}</span>
                <span className="flex-1" />
                {canEdit && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); onRemoveCode(c); }} title={t("เอาออกจากใบงาน", "Remove from this sheet")}
                    className="h-6 w-6 shrink-0 rounded text-slate-300 hover:bg-rose-50 hover:text-rose-500">✕</button>
                )}
              </div>
              {open && (mine.length > 0 || sibs.length > 0) && (
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {mine.map((s) => skuRow(s))}
                  {sibs.length > 0 && (showSibs.has(c)
                    ? sibs.map((s) => skuRow(s, true))
                    : (
                      <button type="button" onClick={() => setShowSibs((p) => new Set(p).add(c))}
                        className="w-full px-2.5 py-1.5 text-center text-[11px] text-slate-400 hover:bg-slate-50 hover:text-slate-600">
                        {t(`+ อีก ${sibs.length} ตัวใต้ ${c} (ไม่ได้สร้างจากใบนี้)`, `+ ${sibs.length} more under ${c} (not from this sheet)`)}
                      </button>
                    ))}
                </div>
              )}
            </div>
          );
        })}

        {groups.other.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="px-2.5 py-1.5 text-[11px] text-slate-500">{t("SKU อื่นที่สร้างจากใบนี้", "Other SKUs created from this sheet")}</div>
            <div className="divide-y divide-slate-100 border-t border-slate-100">{groups.other.map((s) => skuRow(s))}</div>
          </div>
        )}

        {drafts.map((d) => (
          <div key={d} className="flex items-center gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-2.5 py-1.5 text-xs text-amber-800">
            <Icon name="edit" className="shrink-0 text-amber-500" />
            <span className="min-w-0 flex-1 truncate">{d}</span>
            <span className="shrink-0 text-[10.5px] text-amber-600">{t("ร่าง · ยังไม่มีรหัส", "Draft · no code yet")}</span>
            {canEdit && <button type="button" onClick={() => onRemoveDraft(d)} title={t("เอาออก", "Remove")} className="h-6 w-6 shrink-0 rounded text-amber-300 hover:bg-rose-50 hover:text-rose-500">✕</button>}
          </div>
        ))}

        {codes.length === 0 && drafts.length === 0 && groups.other.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-400">{t("ยังไม่มี Parent SKU — ตั้งรหัส หรือใส่ชื่อร่างไว้ก่อนก็ได้", "No Parent SKU yet — add a code or a draft name")}</p>
        )}
      </div>

      {canEdit && (adding ? (
        <div className="mt-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
              {([["code", t("มีรหัสแล้ว", "Has a code")], ["draft", t("ยังไม่มีรหัส (ร่าง)", "No code yet (draft)")]] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setAdding(k)}
                  className={`h-7 rounded-md px-2.5 text-xs ${adding === k ? "bg-blue-50 font-medium text-blue-700" : "text-slate-500 hover:text-slate-700"}`}>{l}</button>
              ))}
            </span>
            <span className="flex-1" />
            <button type="button" onClick={closeAdd} className="text-xs text-slate-400 hover:text-slate-600">{t("ยกเลิก", "Cancel")}</button>
          </div>
          {adding === "code" ? (
            <>
              <div className="mt-2 flex gap-1">
                <input autoFocus value={input} onChange={(e) => setInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAddTyped(); } }}
                  placeholder={t("เช่น CTL085 แล้วกด Enter", "e.g. CTL085 then press Enter")}
                  className={`h-8 min-w-0 flex-1 rounded-lg border px-2 font-mono text-sm focus:outline-none focus:ring-2 ${
                    check?.exists ? "border-rose-400 bg-rose-50 focus:ring-rose-400" : check?.skipped ? "border-amber-300 focus:ring-amber-400" : "border-slate-200 focus:ring-blue-500"}`} />
                <button type="button" onClick={onAddTyped} disabled={!input.trim() || check?.exists}
                  className="h-8 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">{t("เพิ่ม", "Add")}</button>
              </div>
              <div className="mt-1 flex min-h-[18px] flex-wrap items-center gap-1.5 text-[11px]">
                {checking ? <span className="text-slate-300">{t("กำลังเช็ครหัส...", "Checking code...")}</span>
                  : !input.trim() ? null
                  : check?.exists ? <span className="font-medium text-rose-600">{t("✕ รหัสนี้มีอยู่แล้ว — เพิ่มไม่ได้", "✕ This code already exists — can't add")}</span>
                  : check?.skipped ? <span className="text-amber-600">{t(`⚠ ตั้งข้ามเลข — ล่าสุดที่ตั้งคือ ${check.latest} (เพิ่มได้ แต่เช็คว่าตั้งใจ)`, `⚠ Skips numbers — latest set is ${check.latest}`)}</span>
                  : check?.latest ? <span className="text-slate-400">{t("✓ ใช้ได้ · ล่าสุดที่ตั้ง:", "✓ OK · latest:")} <b>{check.latest}</b>{check.max_code ? <> · {t("เลขสูงสุด:", "highest:")} {check.max_code}</> : null}</span>
                  : check ? <span className="text-emerald-600">{t("✓ ยังไม่มีรหัสกลุ่มนี้ ใช้ได้", "✓ No codes in this group yet — OK")}</span> : null}
                {nextCode && nextCode !== input.trim() && (
                  <button type="button" onClick={() => void addNext(nextCode)}
                    className="inline-flex h-6 items-center rounded-full bg-emerald-50 px-2 font-medium text-emerald-700 hover:bg-emerald-100">
                    {t(`ใช้ ${nextCode} (ถัดไป)`, `Use ${nextCode} (next)`)}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="mt-2 flex gap-1">
              <input autoFocus value={draftInput} onChange={(e) => setDraftInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAddDraft(); } }}
                placeholder={t("ตั้งชื่อร่าง เช่น พวงกุญแจ มะพร้าว แล้วกด Enter", "Draft name, e.g. Coconut keychain, then Enter")}
                className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
              <button type="button" onClick={onAddDraft} disabled={!draftInput.trim()}
                className="h-8 rounded-lg bg-amber-500 px-3 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-40">{t("เพิ่มร่าง", "Add draft")}</button>
            </div>
          )}
        </div>
      ) : (
        <button type="button" onClick={() => setAdding("code")}
          className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-xs text-slate-600 hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-700">
          <Icon name="add" /> {t("เพิ่ม Parent SKU", "Add Parent SKU")}
        </button>
      ))}
    </div>
  );
}
