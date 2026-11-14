"use client";

/**
 * ป๊อป "เพิ่มแผ่น Swatch" — หลายรูป · ครอป/หมุน · ✨ อ่านจากรูป · ตรวจรหัส/สี/ชื่อ ก่อนบันทึก (เจ้าของขอ 2026-11-14)
 * บันทึก = อัปรูปที่ค้าง (ถามรูปซ้ำ + แถบความคืบหน้าของกลาง) → POST /api/sku-swatches (ระบบออกรหัสแผ่น/ชิ้นที่ API)
 */
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { TagGroupFilter, type TagFilterValue } from "@/components/tag-filter";
import { UploadProgress, type UploadProgressState } from "@/components/upload-progress";
import { cleanBoardCode } from "@/lib/sku-swatch";
import { BoardEditor, previewCodes, useBoardDraft } from "./board-editor";
import { chipsToApi, uploadPendingPhotos } from "./swatch-tools";

const EMPTY_FILTER: TagFilterValue = { tagIds: [], none: false };

export function CreateSwatchModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string, hasChips: boolean) => void }) {
  const toast = useToast();
  const draft = useBoardDraft();
  const [name, setName] = useState("");
  const [tags, setTags] = useState<TagFilterValue>(EMPTY_FILTER);
  const [autoCode, setAutoCode] = useState("SW-????");
  const [code, setCode] = useState<string | null>(null);   // null = ใช้เลขอัตโนมัติ
  const [saving, setSaving] = useState(false);
  const [up, setUp] = useState<UploadProgressState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/sku-swatches?next_code=1").then((r) => r.json()).then((j) => { if (j.code) setAutoCode(String(j.code)); }).catch(() => {});
  }, []);
  const boardCode = code ?? autoCode;
  const codeBad = code !== null && !cleanBoardCode(code);
  const codes = useMemo(() => previewCodes(draft.chips, draft.photos, cleanBoardCode(boardCode) ?? boardCode, 1), [draft.chips, draft.photos, boardCode]);

  const save = async () => {
    if (saving) return;
    if (!draft.photos.length) { setErr("เพิ่มรูปแผงอย่างน้อย 1 รูปก่อนบันทึก"); return; }
    if (codeBad) { setErr("รหัสแผ่นใช้ได้แค่ A-Z ตัวเลข และขีด (2–20 ตัว)"); return; }
    setErr(null); setSaving(true);
    try {
      const keys = await uploadPendingPhotos(draft.photos, { target: name.trim() ? `แผ่น swatch ${name.trim()}` : "แผ่น swatch ใหม่" }, setUp);
      if (!keys) return;   // กดยกเลิกตอนถามรูปซ้ำ
      const images = draft.photos.map((p) => ({ image_key: keys.get(p.key) ?? p.image_key, image_w: p.w, image_h: p.h }));
      const body = { name, family_tag_ids: tags.tagIds, code: code !== null ? cleanBoardCode(code) : undefined, images, spots: chipsToApi(draft.chips, draft.photos) };
      const j = await apiFetch("/api/sku-swatches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const n = draft.chips.length;
      toast.success(n ? `บันทึกแผ่น ${j.code} แล้ว · ${n} ชิ้น (ผูก SKU ทีหลังได้)` : `บันทึกแผ่น ${j.code} แล้ว — ลากสี่เหลี่ยมบนรูปเพื่อตั้งชิ้นได้เลย`);
      draft.setDirty(false);
      onCreated(j.id as string, n > 0);
    } catch (e) { setErr(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open onClose={onClose} title="🎨 เพิ่มแผ่น Swatch" size="xl" hasUnsavedChanges={draft.dirty || !!name.trim()} loading={saving}
      footer={
        <div className="flex items-center justify-between gap-3 w-full flex-wrap">
          <div className="min-w-0 flex-1 text-[12px] text-slate-500">
            {up ? <UploadProgress {...up} className="max-w-sm" />
              : err ? <span className="text-rose-600">⚠ {err}</span>
              : draft.chips.length ? `${draft.chips.length} ชิ้น · ยังไม่ต้องผูก SKU (ผูกทีหลังได้)` : "อ่านจากรูปไม่บังคับ — บันทึกแล้วไปตีกรอบเองแบบเดิมได้"}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => void save()} disabled={saving} className="h-9 px-4 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? "กำลังบันทึก…" : draft.chips.length ? `บันทึก ${draft.chips.length} ชิ้น` : "บันทึก แล้วไปตั้งชิ้น"}
            </button>
          </div>
        </div>
      }>
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px]">
          <label className="block text-sm min-w-0">
            <span className="text-slate-600">ชื่อแผ่น <span className="text-slate-400 text-xs">(ไม่ใส่ก็ได้ ระบบใช้รหัสแผ่นแทน)</span></span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น ผ้าแคนวาส Xin Ya ชุด 12 สี" className="mt-1 w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">รหัสแผ่น <span className="text-slate-400 text-xs">(อัตโนมัติ)</span></span>
            <input value={boardCode} onChange={(e) => setCode(e.target.value.toUpperCase())} onBlur={() => { if (code !== null && code.trim() === autoCode) setCode(null); }}
              className={`mt-1 w-full h-9 px-3 text-sm font-mono border rounded-lg focus:outline-none focus:ring-2 ${codeBad ? "border-rose-300 focus:ring-rose-200" : "border-slate-200 focus:ring-indigo-200"}`} />
          </label>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">หมวด (แท็กกลาง)</span>
          <TagGroupFilter value={tags} onChange={setTags} label="🏷️ เลือกแท็ก" showNone={false} />
          {tags.tagIds.length > 0 && <span className="text-xs text-slate-500">{tags.tagIds.length} แท็ก</span>}
        </div>
        <BoardEditor draft={draft} codes={codes} layout="modal" />
      </div>
    </ERPModal>
  );
}
