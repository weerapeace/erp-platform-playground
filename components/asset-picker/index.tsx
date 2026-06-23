"use client";

/**
 * AssetPicker — ของกลาง "ตัวเลือกรูปจากคลังกลาง" (เสียบในโมดูลไหนก็ได้)
 *
 * 2 แท็บ: เลือกจากคลัง (ค้น/ฟิลเตอร์/เลือกหลายรูป) · อัปโหลดใหม่ (ลากวาง → เด้งเข้าคลัง + เลือกให้เลย)
 * คืนรายการ AssetRow ที่เลือกผ่าน onSelect — โมดูลเจ้าของเอาไปเก็บ + เรียก /api/assets/usages บันทึก "ถูกใช้ที่ไหน"
 *
 * ตัวอย่าง:
 *   <AssetPicker open={open} onClose={...} multiple typeFilter="image"
 *     contextLabel="ใบเสนอสินค้า OS-2026-0012"
 *     onSelect={(assets) => { ...เก็บ asset.id/asset.url... }} />
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type AssetType } from "@/lib/assets";
import { withImageWidth } from "@/lib/r2-image";
import { type AssetRow } from "@/app/api/assets/shared";

const TYPE_ICON: Record<AssetType, string> = { image: "🖼️", design: "🎨", document: "📄", video: "🎬", other: "📦" };
const TYPE_FILTERS: { key: string; label: string }[] = [
  { key: "", label: "ทั้งหมด" }, { key: "image", label: "🖼️ รูป" }, { key: "design", label: "🎨 ออกแบบ" },
  { key: "document", label: "📄 เอกสาร" }, { key: "video", label: "🎬 วิดีโอ" },
];

export type AssetPickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (assets: AssetRow[]) => void;
  multiple?: boolean;
  typeFilter?: AssetType;          // ล็อกให้เลือกได้เฉพาะชนิดนี้ (เช่น "image")
  title?: string;
  contextLabel?: string;           // ข้อความบอกว่าเลือกให้ record ไหน
};

export function AssetPicker({ open, onClose, onSelect, multiple = false, typeFilter, title, contextLabel }: AssetPickerProps) {
  const toast = useToast();
  const [tab, setTab] = useState<"library" | "upload">("library");
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState(typeFilter ?? "");
  const [selected, setSelected] = useState<Map<string, AssetRow>>(new Map());
  const [actor, setActor] = useState<string | null>(null);

  useEffect(() => { supabaseBrowser.auth.getUser().then(({ data }) => setActor(data.user?.email ?? null)).catch(() => {}); }, []);
  useEffect(() => { if (open) { setSelected(new Map()); setTab("library"); setSearch(""); setType(typeFilter ?? ""); } }, [open, typeFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ status: "active", limit: "120" });
      if (search) p.set("search", search);
      if (type) p.set("type", type);
      const res = await apiFetch(`/api/assets?${p.toString()}`);
      const j = await res.json();
      setRows(j.data ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [search, type]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const pick = (a: AssetRow) => {
    setSelected((m) => {
      const n = new Map(multiple ? m : []);
      if (n.has(a.id)) n.delete(a.id); else n.set(a.id, a);
      return n;
    });
  };

  const confirm = () => {
    const list = Array.from(selected.values());
    if (list.length === 0) { toast.error("ยังไม่ได้เลือกไฟล์"); return; }
    onSelect(list);
    onClose();
  };

  if (!open) return null;

  return (
    <ERPModal open onClose={onClose} title={title ?? "เลือกรูปจากคลัง"} description={contextLabel} size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-sm text-indigo-600 font-medium">{selected.size > 0 ? `เลือกแล้ว ${selected.size} รูป` : "ยังไม่ได้เลือก"}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={confirm} disabled={selected.size === 0}
              className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">ใช้รูปที่เลือก</button>
          </div>
        </div>
      }>
      {/* tabs */}
      <div className="flex gap-4 border-b border-slate-200 mb-3">
        <button onClick={() => setTab("library")}
          className={`pb-2 text-sm ${tab === "library" ? "border-b-2 border-indigo-500 text-indigo-700 font-medium" : "text-slate-500"}`}>📁 เลือกจากคลัง</button>
        <button onClick={() => setTab("upload")}
          className={`pb-2 text-sm ${tab === "upload" ? "border-b-2 border-indigo-500 text-indigo-700 font-medium" : "text-slate-500"}`}>⬆ อัปโหลดใหม่</button>
      </div>

      {tab === "library" ? (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="ค้นหา ชื่อไฟล์…"
              className="flex-1 min-w-[140px] h-8 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            {!typeFilter && TYPE_FILTERS.map((f) => (
              <button key={f.key} onClick={() => setType(f.key)}
                className={`h-8 px-2.5 text-[12px] rounded-lg border ${type === f.key ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-slate-200 text-slate-600"}`}>{f.label}</button>
            ))}
          </div>
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">กำลังโหลด…</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">ไม่พบไฟล์ — ลองเปลี่ยนคำค้น หรืออัปโหลดใหม่</div>
          ) : (
            <div className="grid gap-2 max-h-[360px] overflow-auto pr-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
              {rows.map((a) => {
                const on = selected.has(a.id);
                return (
                  <button key={a.id} onClick={() => pick(a)}
                    className={`relative rounded-lg border overflow-hidden text-left ${on ? "border-indigo-500 ring-2 ring-indigo-300" : "border-slate-200 hover:border-slate-300"}`}>
                    {on && <span className="absolute top-1 right-1 z-10 w-4 h-4 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center">✓</span>}
                    <div className="h-20 bg-slate-100 flex items-center justify-center overflow-hidden">
                      {a.asset_type === "image" ? <img src={withImageWidth(a.url, 240) ?? a.url} alt={a.title} loading="lazy" className="w-full h-full object-cover" />
                        : <span className="text-2xl">{TYPE_ICON[a.asset_type]}</span>}
                    </div>
                    <p className="text-[10px] px-1.5 py-1 truncate">{a.title}</p>
                  </button>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <UploadTab actor={actor} typeFilter={typeFilter}
          onUploaded={(assets) => {
            setSelected((m) => {
              const n = new Map(multiple ? m : []);
              for (const a of assets) { if (!multiple) n.clear(); n.set(a.id, a); if (!multiple) break; }
              return n;
            });
            setTab("library"); void load();
            toast.success(`อัปแล้ว ${assets.length} ไฟล์ — เลือกให้อัตโนมัติ`);
          }} />
      )}
    </ERPModal>
  );
}

function UploadTab({ actor, typeFilter, onUploaded }: {
  actor: string | null; typeFilter?: AssetType; onUploaded: (assets: AssetRow[]) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const imgDims = (file: File): Promise<{ w: number; h: number } | null> =>
    new Promise((res) => {
      if (!file.type.startsWith("image/")) return res(null);
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => { res(null); URL.revokeObjectURL(url); };
      img.src = url;
    });

  const handle = async (files: FileList | File[]) => {
    setBusy(true);
    const done: AssetRow[] = [];
    for (const file of Array.from(files)) {
      if (typeFilter === "image" && !file.type.startsWith("image/")) { toast.error(`${file.name} ไม่ใช่รูปภาพ — ข้าม`); continue; }
      try {
        const fd = new FormData();
        fd.append("file", file);
        if (actor) fd.append("actor", actor);
        const d = await imgDims(file);
        if (d) { fd.append("width", String(d.w)); fd.append("height", String(d.h)); }
        const res = await apiFetch("/api/assets", { method: "POST", body: fd });
        const j = await res.json();
        if (!res.ok || j.error) throw new Error(j.error || "อัปโหลดไม่สำเร็จ");
        if (j.data) done.push(j.data as AssetRow);
      } catch (e) { toast.error(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ"); }
    }
    setBusy(false);
    if (done.length) onUploaded(done);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) void handle(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center ${dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-slate-50"}`}
    >
      <div className="text-4xl mb-2">{busy ? "⏳" : "⬆️"}</div>
      <p className="text-sm font-medium text-slate-700">{busy ? "กำลังอัปโหลด…" : "ลากไฟล์มาวาง หรือ คลิกเลือก"}</p>
      <p className="text-[12px] text-slate-400 mt-1">อัปแล้วจะเข้าคลังกลาง + ถูกเลือกให้อัตโนมัติ</p>
      <input ref={inputRef} type="file" multiple={true} accept={typeFilter === "image" ? "image/*" : undefined}
        className="hidden" onChange={(e) => e.target.files && handle(e.target.files)} />
    </div>
  );
}
