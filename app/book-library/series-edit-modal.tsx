"use client";

/**
 * ⚙ จัดการชุด — แก้ทั้งชุดจากมุมมองชั้นหนังสือ (กดที่ชื่อชุด)
 *
 * ทำได้: เปลี่ยนชื่อชุด (ชื่อเล่มเปลี่ยนตาม) · ตั้งว่าชุดจบหรือยัง ·
 *        เพิ่ม/ลดจำนวนเล่ม (เติมเล่มที่ขาด, ตัดเล่มเกิน) · เพิ่มเล่มพิเศษ (25.5 / Official Book)
 *
 * ของกลาง: ERPModal · ConfirmDialog · useToast · API กลาง /api/master-v2/book_library
 * (แก้รายเล่มลึก ๆ เช่น ราคา/ปก ให้กดที่เลขเล่มเปิดฟอร์มของเล่มนั้นแทน)
 */

import { useEffect, useMemo, useState } from "react";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";

const MAX_TOTAL = 200;

type EditBook = {
  id: string; title: string; title_en: string; series: string; volume: string; status: string; series_status: string;
};

type SeriesStatus = "" | "ongoing" | "ended";
const STATUS_CHOICES: { key: SeriesStatus; label: string }[] = [
  { key: "",        label: "ยังไม่ระบุ" },
  { key: "ongoing", label: "ยังไม่จบ" },
  { key: "ended",   label: "จบแล้ว" },
];

const isNumericVolume = (v: string) => /^\d+(\.\d+)?$/.test(v.trim());
const volNum = (v: string) => { const n = parseFloat(String(v ?? "").replace(/[^\d.]/g, "")); return Number.isFinite(n) ? n : null; };
const titleFor = (seriesName: string, volume: string) =>
  isNumericVolume(volume) ? `${seriesName} เล่ม ${volume}` : `${seriesName} ${volume}`.trim();
/** ชื่ออังกฤษต่อเล่ม — "Demon Slayer Vol. 23" / "Demon Slayer Official Book" */
const enTitleFor = (nameEn: string, volume: string) =>
  !nameEn ? "" : isNumericVolume(volume) ? `${nameEn} Vol. ${volume}` : `${nameEn} ${volume}`;
/** ถอดชื่อชุดภาษาอังกฤษจากชื่อเล่ม (ตัด " Vol. 23" ท้ายออก) */
const seriesEnOf = (titleEn: string) => titleEn.replace(/\s*Vol\.?\s*[\d.]+\s*$/i, "").trim();

export function SeriesEditModal({ open, seriesName, books, onClose, onSaved }: {
  open: boolean;
  seriesName: string;
  books: EditBook[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(seriesName);
  const [nameEn, setNameEn] = useState("");
  const [status, setStatus] = useState<SeriesStatus>("");
  const [totalText, setTotalText] = useState("");
  const [addStatus, setAddStatus] = useState<"wishlist" | "owned">("wishlist");
  const [specials, setSpecials] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // เลขเล่มที่มีอยู่ตอนนี้
  const owned = useMemo(() => {
    const nums = books.map((b) => volNum(b.volume)).filter((n): n is number => n !== null);
    return [...new Set(nums)].sort((a, b) => a - b);
  }, [books]);
  const maxVol = owned.length ? Math.floor(owned[owned.length - 1]) : 0;

  /** ชื่อชุดภาษาอังกฤษที่ใช้อยู่ (ถอดจากชื่อเล่มแรกที่กรอกไว้) */
  const currentEn = useMemo(
    () => seriesEnOf(books.find((b) => (b.title_en ?? "").trim())?.title_en ?? ""),
    [books],
  );

  useEffect(() => {
    if (!open) return;
    setName(seriesName);
    setNameEn(currentEn);
    setStatus((books.find((b) => b.series_status)?.series_status ?? "") as SeriesStatus);
    setTotalText(String(maxVol || ""));
    setSpecials(""); setAddStatus("wishlist"); setSaving(false); setConfirmOpen(false);
  }, [open, seriesName, books, maxVol, currentEn]);

  const total = Math.min(MAX_TOTAL, Math.max(0, parseInt(totalText || "0", 10) || 0));
  const have = useMemo(() => new Set(owned), [owned]);

  /** เล่มที่จะเพิ่ม = เลข 1..total ที่ยังไม่มี (ทั้งช่องว่างตรงกลางและเล่มที่ต่อท้าย) */
  const toAdd = useMemo(() => {
    const out: number[] = [];
    for (let i = 1; i <= total; i++) if (!have.has(i)) out.push(i);
    return out;
  }, [total, have]);

  /** เล่มที่จะลบ = เล่มเลขเกิน total (เล่มพิเศษที่เป็นข้อความไม่ถูกแตะ) */
  const toRemove = useMemo(
    () => (total > 0 ? books.filter((b) => { const n = volNum(b.volume); return n !== null && n > total; }) : []),
    [books, total],
  );

  /** เล่มพิเศษที่พิมพ์เพิ่ม (ตัดตัวที่มีอยู่แล้วออก) */
  const specialsToAdd = useMemo(() => {
    const existing = new Set(books.map((b) => b.volume.trim().toLowerCase()));
    const out: string[] = [];
    for (const raw of specials.split(/[,\n]+/)) {
      const v = raw.trim();
      if (!v || existing.has(v.toLowerCase()) || out.some((x) => x.toLowerCase() === v.toLowerCase())) continue;
      out.push(v);
    }
    return out;
  }, [specials, books]);

  const renamed = name.trim() !== "" && name.trim() !== seriesName;
  const renamedEn = nameEn.trim() !== currentEn;
  const statusChanged = status !== ((books.find((b) => b.series_status)?.series_status ?? "") as SeriesStatus);
  const dirty = renamed || renamedEn || statusChanged || toAdd.length > 0 || toRemove.length > 0 || specialsToAdd.length > 0;

  const rangeText = (nums: number[]) => {
    if (nums.length === 0) return "";
    const parts: string[] = [];
    let start = nums[0], prev = nums[0];
    for (let i = 1; i <= nums.length; i++) {
      const cur = nums[i];
      if (cur !== prev + 1) { parts.push(start === prev ? String(start) : `${start}-${prev}`); start = cur; }
      prev = cur;
    }
    return parts.join(", ");
  };

  const doSave = async () => {
    if (!name.trim()) { toast.warning("ใส่ชื่อชุดก่อน"); return; }
    setSaving(true);
    try {
      const finalName = name.trim();

      // 1) เปลี่ยนชื่อชุด (ไทย/อังกฤษ) — ชื่อเล่มที่ขึ้นต้นด้วยชื่อชุดเดิมเปลี่ยนตาม (ชื่อที่ตั้งเองไว้ไม่ถูกแตะ)
      const finalEn = nameEn.trim();
      if (renamed || renamedEn) {
        for (const b of books) {
          const patch: Record<string, unknown> = {};
          if (renamed) {
            patch.series = finalName;
            if (b.title.startsWith(seriesName)) patch.title = finalName + b.title.slice(seriesName.length);
          }
          if (renamedEn) patch.title_en = enTitleFor(finalEn, b.volume);
          if (Object.keys(patch).length === 0) continue;
          const r = await apiFetch(`/api/master-v2/book_library/${b.id}`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
          });
          const j = await r.json();
          if (j.error) throw new Error(String(j.error));
        }
      }

      // 2) จบหรือยัง — แก้เล่มเดียวพอ ฐานข้อมูลกระจายให้ทั้งชุดเอง
      if (statusChanged && books[0]) {
        const r = await apiFetch(`/api/master-v2/book_library/${books[0].id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ series_status: status }),
        });
        const j = await r.json();
        if (j.error) throw new Error(String(j.error));
      }

      // 3) ลบเล่มเกิน
      for (const b of toRemove) {
        const r = await apiFetch(`/api/master-v2/book_library/${b.id}`, { method: "DELETE" });
        const j = await r.json().catch(() => ({}));
        if (j.error) throw new Error(String(j.error));
      }

      // 4) เพิ่มเล่มที่ขาด + เล่มพิเศษ
      const newVolumes = [...toAdd.map(String), ...specialsToAdd];
      if (newVolumes.length > 0) {
        const rows = newVolumes.map((v) => ({
          title: titleFor(finalName, v),
          series: finalName,
          volume: v,
          status: addStatus,
          ...(finalEn ? { title_en: enTitleFor(finalEn, v) } : {}),
          ...(status ? { series_status: status } : {}),
        }));
        const r = await apiFetch("/api/master-v2/book_library/import", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows, mode: "create" }),
        });
        const j = await r.json();
        if (j.error) throw new Error(String(j.error));
        const failed = (j.failed ?? []) as { error: string }[];
        if (failed.length > 0) toast.warning(`เพิ่มได้ ${j.created ?? 0} เล่ม · ไม่สำเร็จ ${failed.length} (${failed[0].error})`);
      }

      toast.success("บันทึกชุดแล้ว");
      onSaved();
      onClose();
    } catch (e) {
      toast.error((e as Error).message ?? "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); setConfirmOpen(false); }
  };

  const submit = () => { if (toRemove.length > 0) setConfirmOpen(true); else void doSave(); };

  const field = "h-9 w-full px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200";
  const label = "block text-xs font-medium text-slate-600 mb-1";

  return (
    <>
      <ERPModal
        open={open} onClose={onClose} size="md"
        title="⚙ จัดการชุด"
        description={`${seriesName} — มีในคลัง ${books.length} เล่ม`}
        hasUnsavedChanges={dirty && !saving}
        storageKey="book-library-series-edit"
        footer={
          <>
            <button onClick={onClose} disabled={saving}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ปิด</button>
            <button onClick={submit} disabled={saving || !dirty}
              className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
              {saving ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className={label}>ชื่อชุด</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
            {renamed && <p className="mt-1 text-[10px] text-amber-600">ชื่อเล่มทั้ง {books.length} เล่มจะเปลี่ยนตาม</p>}
          </div>

          <div>
            <label className={label}>ชื่อชุด (ภาษาอังกฤษ)</label>
            <input value={nameEn} onChange={(e) => setNameEn(e.target.value)}
              placeholder="เช่น Demon Slayer — ใส่ก็ได้ ไม่ใส่ก็ได้" className={field} />
            {renamedEn && nameEn.trim() && (
              <p className="mt-1 text-[10px] text-amber-600">ทุกเล่มจะได้ชื่ออังกฤษเป็น &quot;{enTitleFor(nameEn.trim(), "1")}&quot;, &quot;{enTitleFor(nameEn.trim(), "2")}&quot; …</p>
            )}
          </div>

          <div>
            <label className={label}>ชุดจบหรือยัง</label>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_CHOICES.map((c) => {
                const on = status === c.key;
                return (
                  <button key={c.key || "unset"} type="button" onClick={() => setStatus(c.key)}
                    className={`h-8 px-3 text-sm rounded-lg border transition-colors
                      ${on
                        ? c.key === "ended"   ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-medium"
                        : c.key === "ongoing" ? "bg-amber-50 border-amber-300 text-amber-700 font-medium"
                        :                       "bg-slate-100 border-slate-300 text-slate-600 font-medium"
                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                    {on ? "✓ " : ""}{c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className={label}>ชุดนี้มีทั้งหมดกี่เล่ม</label>
            <div className="flex items-center gap-2">
              <input value={totalText} onChange={(e) => setTotalText(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric" className={`${field} w-24`} />
              <span className="text-xs text-slate-400">ตอนนี้มีถึงเล่ม {maxVol || "—"}</span>
              {toAdd.length > 0 && (
                <select value={addStatus} onChange={(e) => setAddStatus(e.target.value as "wishlist" | "owned")}
                  className="h-9 px-2 text-sm border border-slate-200 rounded-lg">
                  <option value="wishlist">เล่มที่เพิ่ม = อยากได้</option>
                  <option value="owned">เล่มที่เพิ่ม = มีแล้ว</option>
                </select>
              )}
            </div>
            {toAdd.length > 0 && (
              <p className="mt-1 text-[11px] text-emerald-600">+ จะเพิ่มเล่ม {rangeText(toAdd)} ({toAdd.length} เล่ม)</p>
            )}
            {toRemove.length > 0 && (
              <p className="mt-1 text-[11px] text-rose-600">− จะลบเล่ม {rangeText(toRemove.map((b) => volNum(b.volume) as number).sort((a, b) => a - b))} ({toRemove.length} เล่ม)</p>
            )}
          </div>

          <div>
            <label className={label}>เพิ่มเล่มพิเศษ</label>
            <input value={specials} onChange={(e) => setSpecials(e.target.value)}
              placeholder="เช่น 25.5, Official Book, ตอนพิเศษ" className={field} />
            {specialsToAdd.length > 0 && (
              <p className="mt-1 text-[11px] text-emerald-600">+ {specialsToAdd.map((v) => titleFor(name.trim() || seriesName, v)).join(" · ")}</p>
            )}
          </div>

          <p className="text-[10px] text-slate-400 border-t border-slate-100 pt-2">
            อยากแก้ราคา / ปก / สถานะรายเล่ม → ปิดหน้านี้แล้วกดที่เลขเล่มในชั้นได้เลย
          </p>
        </div>
      </ERPModal>

      <ConfirmDialog
        open={confirmOpen} variant="danger" loading={saving}
        title={`ลบ ${toRemove.length} เล่มออกจากคลัง?`}
        message={<>ลดจำนวนเล่มเหลือ <b>{total}</b> เล่ม จะลบ <b>{rangeText(toRemove.map((b) => volNum(b.volume) as number).sort((a, b) => a - b))}</b> ทิ้งถาวร<br /><span className="text-xs text-slate-400">เล่มพิเศษที่เป็นข้อความจะไม่ถูกลบ</span></>}
        confirmText="ลบและบันทึก"
        onClose={() => !saving && setConfirmOpen(false)}
        onConfirm={() => void doSave()}
      />
    </>
  );
}
