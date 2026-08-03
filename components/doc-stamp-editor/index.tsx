"use client";

/**
 * ของกลาง — ลายเซ็น / ตราประทับ บนเอกสารพิมพ์ (ลากวาง + ย่อขยายได้)
 *
 * ใช้กับเอกสารชนิดไหนก็ได้ (ใบสั่งซื้อ / ใบเสนอราคา / ใบวางบิล / ใบส่งของ) แค่ส่ง entityType ต่างกัน
 *
 * ทำไมพิกัดเป็น "มิลลิเมตร": หน้ากระดาษในตัวอย่างพิมพ์กว้างคงที่ 210mm (A4)
 * และ 1mm = 96/25.4 px เสมอในเบราว์เซอร์ → วางตรงไหนบนจอ พิมพ์ออกมาตรงนั้นเป๊ะ
 * (ไม่ผูกกับขนาดจอ/การซูม เพราะไม่ได้ใช้ % ของความกว้างกรอบ)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { uploadResizedImage } from "@/components/image-attach";
import type { DocStamp } from "@/lib/doc-stamps";

/** 1 มม. = กี่ CSS px (คงที่ตามมาตรฐานเบราว์เซอร์) */
export const MM_PX = 96 / 25.4;

// ---------------------------------------------------------------- data hook
export function useDocStamps(entityType: string) {
  const [stamps, setStamps] = useState<DocStamp[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/admin/doc-stamps?entity_type=${encodeURIComponent(entityType)}`);
      const j = (await r.json()) as { data?: DocStamp[] };
      setStamps(j.data ?? []);
    } catch { /* โหลดไม่ได้ = ไม่มีตรา ใบยังพิมพ์ได้ */ }
    finally { setLoading(false); }
  }, [entityType]);

  useEffect(() => { void reload(); }, [reload]);

  /** อัปเดตในจอทันที แล้วค่อยบันทึกเบื้องหลัง (ลากแล้วไม่กระตุก) */
  const patch = useCallback(async (id: string, body: Partial<DocStamp>, save = true) => {
    setStamps((ss) => ss.map((s) => (s.id === id ? { ...s, ...body } : s)));
    if (!save) return;
    await apiFetch("/api/admin/doc-stamps", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    }).catch(() => {});
  }, []);

  const add = useCallback(async (kind: "signature" | "stamp", file: File) => {
    const up = await uploadResizedImage(file, { folder: "doc-stamps", max: 1200 });
    const r = await apiFetch("/api/admin/doc-stamps", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: entityType, kind, image_key: up.r2_key }),
    });
    const j = (await r.json()) as { data?: DocStamp; error?: string };
    if (!r.ok || !j.data) throw new Error(j.error ?? "เพิ่มไม่สำเร็จ");
    setStamps((ss) => [...ss, j.data as DocStamp]);
  }, [entityType]);

  const remove = useCallback(async (id: string) => {
    setStamps((ss) => ss.filter((s) => s.id !== id));
    await apiFetch(`/api/admin/doc-stamps?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }, []);

  return { stamps, loading, reload, patch, add, remove };
}

// ---------------------------------------------------------------- overlay (ลาก/ขยาย)
type DragState =
  | { mode: "move"; id: string; startX: number; startY: number; ox: number; oy: number }
  | { mode: "resize"; id: string; startX: number; startY: number; ow: number; oh: number; ratio: number }
  | null;

export function DocStampOverlay({ stamps, onPatch, onSelect, selectedId }: {
  stamps: readonly DocStamp[];
  onPatch: (id: string, body: Partial<DocStamp>, save?: boolean) => void;
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const drag = useRef<DragState>(null);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dxMm = (e.clientX - d.startX) / MM_PX;
      const dyMm = (e.clientY - d.startY) / MM_PX;
      if (d.mode === "move") {
        onPatch(d.id, { x_mm: Math.round((d.ox + dxMm) * 10) / 10, y_mm: Math.round((d.oy + dyMm) * 10) / 10 }, false);
      } else {
        // ย่อ/ขยายคงสัดส่วนภาพ (ลากมุมขวาล่าง)
        const w = Math.max(5, d.ow + dxMm);
        onPatch(d.id, { w_mm: Math.round(w * 10) / 10, h_mm: Math.round((w / d.ratio) * 10) / 10 }, false);
      }
    };
    const up = () => {
      const d = drag.current;
      if (!d) return;
      const s = stamps.find((x) => x.id === d.id);
      if (s) onPatch(s.id, { x_mm: s.x_mm, y_mm: s.y_mm, w_mm: s.w_mm, h_mm: s.h_mm });   // บันทึกตอนปล่อยมือ
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [stamps, onPatch]);

  return (
    <div className="absolute inset-0 z-20" style={{ pointerEvents: "none" }}>
      {stamps.filter((s) => s.is_active).map((s) => {
        const sel = s.id === selectedId;
        return (
          <div key={s.id}
            onPointerDown={(e) => {
              e.preventDefault(); onSelect(s.id);
              drag.current = { mode: "move", id: s.id, startX: e.clientX, startY: e.clientY, ox: s.x_mm, oy: s.y_mm };
            }}
            style={{
              position: "absolute", pointerEvents: "auto", cursor: "move",
              left: s.x_mm * MM_PX, top: s.y_mm * MM_PX,
              width: s.w_mm * MM_PX, height: s.h_mm * MM_PX,
              opacity: s.opacity,
              outline: sel ? "2px solid #2563eb" : "1px dashed rgba(37,99,235,0.55)",
              outlineOffset: 1,
            }}
            title={`${s.label ?? ""} — ลากเพื่อย้าย · ลากมุมขวาล่างเพื่อย่อ/ขยาย`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/r2-image?key=${encodeURIComponent(s.image_key)}&w=800`} alt={s.label ?? ""}
              draggable={false} className="w-full h-full object-contain select-none pointer-events-none" />
            <div
              onPointerDown={(e) => {
                e.preventDefault(); e.stopPropagation(); onSelect(s.id);
                drag.current = { mode: "resize", id: s.id, startX: e.clientX, startY: e.clientY, ow: s.w_mm, oh: s.h_mm, ratio: s.w_mm / (s.h_mm || 1) };
              }}
              style={{ position: "absolute", right: -6, bottom: -6, width: 14, height: 14, background: "#2563eb", borderRadius: 3, cursor: "nwse-resize", border: "2px solid white" }}
              title="ลากเพื่อย่อ/ขยาย"
            />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- panel (เพิ่ม/ลบ/ความเข้ม)
export function DocStampPanel({ stamps, selectedId, onSelect, onPatch, onAdd, onRemove }: {
  stamps: readonly DocStamp[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onPatch: (id: string, body: Partial<DocStamp>, save?: boolean) => void;
  onAdd: (kind: "signature" | "stamp", file: File) => Promise<void>;
  onRemove: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sigRef = useRef<HTMLInputElement>(null);
  const stampRef = useRef<HTMLInputElement>(null);

  const pick = async (kind: "signature" | "stamp", f: File | undefined) => {
    if (!f) return;
    setBusy(true); setErr(null);
    try { await onAdd(kind, f); }
    catch (e) { setErr(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const sel = stamps.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="no-print border border-blue-200 bg-blue-50/60 rounded-lg p-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-blue-800">🖊 ลายเซ็น / ตราประทับ</span>
        <button type="button" onClick={() => sigRef.current?.click()} disabled={busy}
          className="h-8 px-3 text-xs rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          + ลายเซ็น
        </button>
        <button type="button" onClick={() => stampRef.current?.click()} disabled={busy}
          className="h-8 px-3 text-xs rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          + ตราประทับ
        </button>
        {busy && <span className="text-xs text-slate-500">กำลังอัปโหลด…</span>}
        <input ref={sigRef} type="file" accept="image/*" hidden onChange={(e) => void pick("signature", e.target.files?.[0])} />
        <input ref={stampRef} type="file" accept="image/*" hidden onChange={(e) => void pick("stamp", e.target.files?.[0])} />
      </div>

      <div className="text-[11px] text-slate-500">
        ลากรูปบนใบเพื่อย้าย · ลากจุดสีน้ำเงินมุมขวาล่างเพื่อย่อ/ขยาย · ตั้งครั้งเดียวใช้กับใบนี้ทุกใบ
        <br />แนะนำรูปพื้นหลังโปร่ง (PNG) จะได้ไม่บังตัวหนังสือ
      </div>

      {stamps.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {stamps.map((s) => (
            <button key={s.id} type="button" onClick={() => onSelect(s.id === selectedId ? null : s.id)}
              className={`h-8 px-2.5 text-xs rounded-md border flex items-center gap-1.5 ${s.id === selectedId
                ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-600"}`}>
              <span>{s.kind === "signature" ? "🖊" : "🔖"}</span>
              {s.label ?? (s.kind === "signature" ? "ลายเซ็น" : "ตราประทับ")}
              {!s.is_active && <span className="opacity-60">(ซ่อน)</span>}
            </button>
          ))}
        </div>
      )}

      {sel && (
        <div className="bg-white border border-slate-200 rounded-md p-2.5 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              ความเข้ม
              <input type="range" min={20} max={100} step={5} value={Math.round(sel.opacity * 100)}
                onChange={(e) => onPatch(sel.id, { opacity: Number(e.target.value) / 100 }, false)}
                onPointerUp={() => onPatch(sel.id, { opacity: sel.opacity })}
                className="w-28" />
              <span className="tabular-nums w-8">{Math.round(sel.opacity * 100)}%</span>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              กว้าง (มม.)
              <input type="number" step="1" value={Math.round(sel.w_mm)}
                onChange={(e) => {
                  const w = Number(e.target.value) || 5;
                  const ratio = sel.w_mm / (sel.h_mm || 1);
                  onPatch(sel.id, { w_mm: w, h_mm: Math.round((w / ratio) * 10) / 10 });
                }}
                className="w-16 h-7 px-2 text-xs border border-slate-200 rounded" />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={sel.is_active} onChange={(e) => onPatch(sel.id, { is_active: e.target.checked })}
                className="rounded border-slate-300" />
              แสดงบนใบ
            </label>
            <button type="button" onClick={() => { onRemove(sel.id); onSelect(null); }}
              className="ml-auto h-7 px-2.5 text-xs rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50">
              🗑 ลบ
            </button>
          </div>
          <input value={sel.label ?? ""} onChange={(e) => onPatch(sel.id, { label: e.target.value })}
            placeholder="ชื่อกำกับ เช่น ลายเซ็นผู้อนุมัติ"
            className="w-full h-7 px-2 text-xs border border-slate-200 rounded" />
          <div className="text-[11px] text-slate-400 tabular-nums">
            ตำแหน่ง X {Math.round(sel.x_mm)} มม. · Y {Math.round(sel.y_mm)} มม. · ขนาด {Math.round(sel.w_mm)}×{Math.round(sel.h_mm)} มม.
          </div>
        </div>
      )}

      {err && <div className="text-xs text-red-600">⚠️ {err}</div>}
    </div>
  );
}
