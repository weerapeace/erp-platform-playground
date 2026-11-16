"use client";

/**
 * 📝 ป๊อป "อ่านจากรูปโน้ต (AI)" ของตารางตีราคา (เจ้าของขอ 2026-11-16) — หน้าคอม + มือถือใช้ตัวเดียวกัน
 *   อัปรูปโน้ตขนาดชิ้นที่ช่างจดมือ → AI อ่าน (POST /api/design-sheets/read-note · เสียเงิน ai.note_dims)
 *   → ตารางยืนยัน: เลือกวัตถุดิบทีละกลุ่ม (AI เดาจากชื่อกลุ่มให้ก่อน) / เปลี่ยนรายบรรทัด · แก้ชื่อชิ้น กว้าง ยาว จำนวน · ติ๊กแถวที่จะเอา
 *   → onAdd(บรรทัดตีราคา) — หน้าแม่เติมลงตาราง แล้วผู้ใช้กดบันทึกตามปกติ (ป๊อปนี้ไม่เขียนฐานข้อมูลเอง)
 *   สูตร/ตัวตรวจ: lib/note-dims (costLineFromNote ใช้สูตรกลางของบรรทัดตีราคา)
 * ใช้ที่: components/design-sheet-detail/index.tsx (ตารางตีราคา) · components/design-sheet-mobile/cost-tab.tsx
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { Icon } from "@/components/icon";
import { SearchableSelect } from "@/components/searchable-select";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { toChatJpeg } from "@/lib/image-resize";
import { costLineFromNote, guessNoteItem, type NoteDimRow, type NoteDims } from "@/lib/note-dims";
import type { CostItemLike } from "@/lib/design-sheet-cost-row";
import type { CostLine } from "@/app/api/design-sheets/[id]/cost-lines/route";

type Row = NoteDimRow & { use: boolean; item: string | undefined };   // item: undefined = ตามกลุ่ม · "" = ไม่เลือก · id = เลือกเฉพาะบรรทัด

const fileToDataUrl = (f: File) => new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(r.error); r.readAsDataURL(f); });
const numIn = (s: string): number | null => { const n = Number(s.replace(",", ".")); return s.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null; };

export function NoteDimsModal<T extends CostItemLike>({ open, onClose, items, onCreateItem, parentCode, startIdx, onAdd }: {
  open: boolean; onClose: () => void;
  /** ทะเบียนวัสดุตีราคา (ตัวเดียวกับช่องเลือกวัสดุในตาราง) */
  items: readonly T[];
  /** ไม่มีในทะเบียน → เพิ่มวัสดุใหม่จากช่องเลือก (หน้าคอม) */
  onCreateItem?: (name: string, onPicked: (it: T) => void) => void;
  /** แท็บ Parent ที่กำลังตีราคา ("" / null = ทั่วไป) */
  parentCode: string | null;
  /** จำนวนบรรทัดที่มีอยู่ (ไว้เรียงลำดับต่อท้าย) */
  startIdx: number;
  onAdd: (lines: CostLine[]) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [groups, setGroups] = useState<string[]>([]);
  const [groupItem, setGroupItem] = useState<Record<string, string>>({});
  const [guessed, setGuessed] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [extraItems, setExtraItems] = useState<T[]>([]);   // วัสดุที่เพิ่งสร้างในป๊อปนี้ (หน้าแม่ยังไม่โหลดใหม่)
  const [showPhoto, setShowPhoto] = useState(false);       // มือถือ: รูปพับไว้

  useEffect(() => { if (!open) { setPhoto(null); setRows(null); setGroups([]); setGroupItem({}); setGuessed(new Set()); setNotes(""); setBusy(false); } }, [open]);

  const allItems = useMemo(() => [...extraItems, ...items.filter((i) => !extraItems.some((x) => x.id === i.id))], [items, extraItems]);
  const byId = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems]);
  const options = useMemo(() => allItems.map((p) => ({ value: p.id, label: p.name, sub: p.group_name ?? undefined })), [allItems]);

  const read = async (file: File) => {
    const jpg = await toChatJpeg(file, 1600, 0.85);
    if (!jpg) { toast.error(t("เปิดรูปนี้ไม่ได้ — ใช้ JPG / PNG / WebP (รูป HEIC จากไอโฟนให้แคปหน้าจอแทน)", "Can't open this image — use JPG / PNG / WebP")); return; }
    const url = await fileToDataUrl(jpg);
    setPhoto(url); setRows(null); setBusy(true);
    try {
      const j = await apiFetch("/api/design-sheets/read-note", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: url }) }).then((r) => r.json());
      if (j.error || !j.data) throw new Error(j.error || t("AI อ่านรูปไม่สำเร็จ", "AI couldn't read the photo"));
      const d = j.data as NoteDims;
      const gi: Record<string, string> = {}, gs = new Set<string>();
      for (const g of d.groups) { const it = guessNoteItem(g, items); if (it) { gi[g] = it.id; gs.add(g); } }
      setGroups(d.groups); setGroupItem(gi); setGuessed(gs); setNotes(d.notes);
      setRows(d.rows.map((r) => ({ ...r, use: true, item: undefined })));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("AI อ่านรูปไม่สำเร็จ", "AI couldn't read the photo")); }
    finally { setBusy(false); }
  };

  const itemOf = (r: Row) => (r.item !== undefined ? r.item : groupItem[r.group] ?? "");
  const setRow = (i: number, p: Partial<Row>) => setRows((rs) => rs && rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const create = (q: string, done: (it: T) => void) => onCreateItem?.(q, (it) => { setExtraItems((x) => [it, ...x]); done(it); });

  const picked = rows?.filter((r) => r.use) ?? [];
  const noItem = picked.filter((r) => !itemOf(r)).length;
  const add = () => {
    if (!picked.length) return;
    onAdd(picked.map((r, k) => costLineFromNote(r, byId.get(itemOf(r)) ?? null, startIdx + k, parentCode || null)));
  };

  const fileBtn = (label: string) => (
    <label className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-medium ${busy ? "border-slate-200 text-slate-400" : "border-blue-300 bg-white text-blue-700 hover:bg-blue-50"}`}>
      <Icon value="i:camera" className="text-[15px]" />{label}
      <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ""; }} />
    </label>
  );

  return (
    <ERPModal open={open} onClose={onClose} size="xl" storageKey="note-dims-modal" hasUnsavedChanges={!!rows?.length}
      title={t("อ่านขนาดจากรูปโน้ต (AI)", "Read sizes from a note photo (AI)")}
      description={t("ถ่ายรูปโน้ตที่ช่างจดขนาดชิ้น → AI อ่านเป็นตาราง → เลือกวัตถุดิบ ตรวจตัวเลข แล้วเพิ่มเป็นบรรทัดตีราคา", "Photo of the handwritten piece sizes → AI reads it into a table → pick materials, check the numbers, then add as costing lines")}
      footer={rows ? (
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className={`text-xs ${noItem ? "text-amber-700" : "text-slate-500"}`}>
            {noItem ? t(`${noItem} บรรทัดยังไม่เลือกวัตถุดิบ — เพิ่มได้ แต่ยอดจะเป็น 0 จนกว่าจะเลือก`, `${noItem} lines have no material — they'll show 0 until you pick one`) : t("หน่วย ซม. · ระบบคิดปริมาณ/ราคาจากวัตถุดิบให้", "Units in cm · quantity/price come from the material")}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button>
            <button type="button" onClick={add} disabled={!picked.length} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">{t(`เพิ่ม ${picked.length} บรรทัด`, `Add ${picked.length} lines`)}</button>
          </div>
        </div>
      ) : undefined}>
      {!photo ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 px-4 py-10 text-center">
          <Icon value="i:notes" className="text-3xl text-slate-300" />
          <p className="text-sm text-slate-500">{t("ถ่ายให้ตรง เห็นโน้ตเต็มแผ่น ตัวเลขชัด · รูปไม่ถูกเก็บ", "Shoot straight on with the whole note and clear numbers · the photo isn't stored")}</p>
          {fileBtn(t("เลือก / ถ่ายรูปโน้ต", "Choose / take a note photo"))}
          <p className="text-[11px] text-slate-400">{t("ใช้ AI แบบเสียเงิน (ไม่กี่สิบสตางค์ต่อรูป)", "Uses paid AI (a few satang per photo)")}</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
          {/* รูปที่อัป — ไว้ดูเทียบ (มือถือ: พับไว้ กดดู) */}
          <div className="space-y-2">
            <button type="button" onClick={() => setShowPhoto((v) => !v)} className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-600 md:hidden">
              <span><Icon value="i:photo" /> {t("รูปที่อัป", "Uploaded photo")}</span><Icon value={showPhoto ? "i:chevron-up" : "i:chevron-down"} />
            </button>
            <div className={`${showPhoto ? "block" : "hidden"} md:block md:sticky md:top-0`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <a href={photo} target="_blank" rel="noreferrer" title={t("เปิดรูปเต็ม", "Open full photo")}><img src={photo} alt="" className="w-full rounded-lg border border-slate-200" /></a>
            </div>
            {fileBtn(t("เปลี่ยนรูป", "Change photo"))}
          </div>

          <div className="min-w-0 space-y-3">
            {busy && <div className="rounded-lg bg-blue-50 px-3 py-6 text-center text-sm text-blue-700">{t("AI กำลังอ่านโน้ต… (ประมาณ 10–30 วินาที)", "AI is reading the note… (about 10–30 seconds)")}</div>}

            {rows && <>
              {notes && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("AI บอกว่า:", "AI says:")} {notes}</p>}

              {/* เลือกวัตถุดิบทีละกลุ่ม */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="mb-1.5 text-xs text-slate-500">{t("เลือกวัตถุดิบให้ทั้งกลุ่ม (จากทะเบียนวัสดุตีราคา) · เปลี่ยนรายบรรทัดได้ข้างล่าง", "Pick a material per group (from the costing materials register) · change per line below")}</p>
                <div className="space-y-1.5">
                  {groups.map((g) => (
                    <div key={g || "-"} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                      <span className="w-full truncate text-sm font-medium text-slate-700 sm:w-32 sm:shrink-0" title={g}>{g || t("(ไม่มีหัวกลุ่ม)", "(no group)")}</span>
                      <div className="min-w-0 flex-1">
                        <SearchableSelect value={groupItem[g] ?? ""} options={options} placeholder={t("— เลือกวัตถุดิบ —", "— Pick material —")}
                          onChange={(v) => { setGroupItem((m) => ({ ...m, [g]: v })); setGuessed((s) => { const n = new Set(s); n.delete(g); return n; }); }}
                          onCreate={onCreateItem ? (q) => create(q, (it) => { setGroupItem((m) => ({ ...m, [g]: it.id })); setGuessed((s) => { const n = new Set(s); n.delete(g); return n; }); }) : undefined}
                          createLabel={t("เพิ่มวัสดุใหม่", "Add new material")} initialQuery={groupItem[g] ? undefined : g.replace(/ชิ้น\s*\d*/g, "").trim()} />
                      </div>
                      {guessed.has(g) && <span className="shrink-0 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-700" title={t("AI เดาจากชื่อกลุ่ม — ตรวจให้ถูกก่อนเพิ่ม", "Guessed from the group name — check before adding")}>{t("AI เดา", "AI guess")}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* แถวที่อ่านได้ */}
              <div className="space-y-1.5">
                <div className="hidden grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_4.5rem_3.5rem_minmax(0,11rem)] gap-1.5 px-1 text-[11px] text-slate-500 sm:grid">
                  <span /><span>{t("ชื่อชิ้น (หมายเหตุ)", "Piece name (note)")}</span><span className="text-right">{t("กว้าง", "Width")}</span><span className="text-right">{t("ยาว", "Length")}</span><span className="text-right">{t("ชิ้น", "Pcs")}</span><span>{t("วัตถุดิบ", "Material")}</span>
                </div>
                {rows.map((r, i) => {
                  const warn = r.unsure ? "border-amber-400 bg-amber-50" : "border-slate-200";
                  const own = r.item !== undefined;
                  return (
                    <div key={i} className={`grid grid-cols-[1.5rem_minmax(0,1fr)] gap-1.5 rounded-lg border p-1.5 sm:grid-cols-[1.5rem_minmax(0,1fr)_4.5rem_4.5rem_3.5rem_minmax(0,11rem)] sm:items-center sm:border-0 sm:p-0.5 ${r.use ? "" : "opacity-50"} ${r.unsure ? "border-amber-200" : "border-slate-200"}`}>
                      <input type="checkbox" checked={r.use} onChange={(e) => setRow(i, { use: e.target.checked })} aria-label={t("เอาแถวนี้", "Use this row")} className="h-4 w-4 self-center" />
                      <div className="min-w-0">
                        <input value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder={r.group || t("ชื่อชิ้น", "Piece name")}
                          className="h-8 w-full rounded border border-slate-200 px-1.5 text-sm" />
                      </div>
                      <div className="col-span-2 grid grid-cols-3 gap-1.5 pl-7 sm:col-span-3 sm:pl-0">
                        {(["w", "h"] as const).map((k) => (
                          <label key={k} className="flex items-center gap-1 text-[11px] text-slate-400 sm:block">
                            <span className="sm:hidden">{k === "w" ? t("กว้าง", "W") : t("ยาว", "L")}</span>
                            <input inputMode="decimal" defaultValue={r[k] ?? ""} onChange={(e) => setRow(i, { [k]: numIn(e.target.value) })}
                              className={`h-8 w-full rounded border px-1.5 text-right text-sm text-slate-800 ${r[k] == null ? "border-amber-400 bg-amber-50" : warn}`} />
                          </label>
                        ))}
                        <label className="flex items-center gap-1 text-[11px] text-slate-400 sm:block">
                          <span className="sm:hidden">{t("ชิ้น", "Pcs")}</span>
                          <input inputMode="numeric" defaultValue={r.qty} onChange={(e) => setRow(i, { qty: Math.max(1, Math.round(numIn(e.target.value) ?? 1)) })}
                            className={`h-8 w-full rounded border px-1.5 text-right text-sm text-slate-800 ${warn}`} />
                        </label>
                      </div>
                      <div className="col-span-2 min-w-0 pl-7 sm:col-span-1 sm:pl-0">
                        <SearchableSelect value={itemOf(r)} options={options} placeholder={t("— ตามกลุ่ม / ไม่เลือก —", "— Group / none —")}
                          className={own ? "ring-1 ring-blue-300 rounded" : !itemOf(r) ? "ring-1 ring-rose-300 rounded" : undefined}
                          onChange={(v) => setRow(i, { item: v })}
                          onCreate={onCreateItem ? (q) => create(q, (it) => setRow(i, { item: it.id })) : undefined} createLabel={t("เพิ่มวัสดุใหม่", "Add new material")} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-amber-700"><Icon value="i:alert-triangle" /> {t("ช่องสีเหลือง = AI ไม่แน่ใจ หรือยังไม่มีค่า — เทียบกับรูปก่อนเพิ่ม", "Yellow = AI unsure or missing — compare with the photo before adding")}</p>
            </>}
          </div>
        </div>
      )}
    </ERPModal>
  );
}
