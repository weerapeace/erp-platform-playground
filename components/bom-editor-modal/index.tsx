"use client";

/**
 * BomEditorModal — ของกลาง: เปิด "ตัวทำ BOM ตัวจริง" (หน้า /master/bom) เป็นป๊อปอัปจากหน้าไหนก็ได้
 *
 * ใช้หน้า BOM จริงทั้งหน้า (หัวสูตร + วัตถุดิบ + ไซส์ + งานเหมา + ค่าแรง) ผ่าน iframe ?embed=1 — ไม่เขียนฟอร์มซ้ำ
 *   sku         = รหัสสินค้าที่ผลิต (ยังไม่มีสูตร → เปิดฟอร์มสร้างใหม่ที่เติมสินค้า+รหัสสูตรให้แล้ว)
 *   newVersion  = สินค้ามีสูตรอยู่แล้ว และต้องการ "เพิ่มเวอร์ชั่นใหม่" → เด้งถามว่าจะคัดลอกจากเวอร์ชั่นไหน/เริ่มว่าง
 *
 * หน้า BOM ส่งสถานะกลับมาด้วย postMessage {type:"erp-bom-editor", dirty, saved}
 *   → ปิดป๊อปตอนมีข้อมูลยังไม่บันทึก จะถามก่อน · onClose(changed) บอกผู้เรียกว่าควรโหลดข้อมูลใหม่ไหม
 *
 * ชั้นซ้อน: z-[260] (สูงกว่า MasterRecordDrawer z-[200]) เพราะถูกเรียกจากใน drawer สินค้า
 * ใช้ที่: แท็บ BOM ในหน้า SKU (MasterDetailRelation ปุ่ม "+ เพิ่ม version")
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const BOM_EDITOR_MSG = "erp-bom-editor";

export function BomEditorModal({ sku, productName, newVersion = false, onClose }: {
  sku: string;
  /** ชื่อสินค้า — ใช้เติมลงสูตรตอนสร้างสูตรแรก (ไม่ส่ง = สูตรจะไม่มีชื่อสินค้า) */
  productName?: string | null;
  newVersion?: boolean;
  /** changed = มีการบันทึก/ลบสูตรในป๊อปนี้ → ผู้เรียกควรโหลดรายการใหม่ */
  onClose: (changed: boolean) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [mounted, setMounted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [askLeave, setAskLeave] = useState(false);
  const changedRef = useRef(false);
  useEffect(() => { setMounted(true); }, []);

  // รับสถานะจากหน้า BOM ข้างใน (เฉพาะ origin เดียวกัน + มาจาก iframe ของเราเท่านั้น)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== frameRef.current?.contentWindow) return;
      const d = e.data as { type?: string; dirty?: boolean; saved?: boolean } | null;
      if (!d || d.type !== BOM_EDITOR_MSG) return;
      if (typeof d.dirty === "boolean") setDirty(d.dirty);
      if (d.saved) changedRef.current = true;
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const requestClose = useCallback(() => {
    if (dirty) setAskLeave(true); else onClose(changedRef.current);
  }, [dirty, onClose]);

  // Esc = ปิดป๊อปนี้ (จับก่อน drawer ข้างหลัง ไม่ให้ drawer ปิดตามไปด้วย)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation(); e.preventDefault();
      if (askLeave) setAskLeave(false); else requestClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [askLeave, requestClose]);

  if (!mounted) return null;
  const q = `open=${encodeURIComponent(sku)}${newVersion ? "&newver=1" : ""}${productName ? `&name=${encodeURIComponent(productName)}` : ""}`;

  return createPortal(
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={requestClose} />
      <div className="relative w-[96vw] max-w-[1400px] h-[94vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 h-12 border-b border-slate-200 shrink-0">
          <span className="text-lg">📐</span>
          <div className="min-w-0 flex-1 text-[15px] font-semibold text-slate-800 truncate">
            {newVersion ? "เพิ่ม BOM เวอร์ชั่นใหม่" : "ทำ BOM (สูตรผลิต)"} — <span className="font-mono text-[13px] text-slate-600">{sku}</span>
          </div>
          {dirty && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">ยังไม่ได้บันทึก</span>}
          <a href={`/master/bom?open=${encodeURIComponent(sku)}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0">เปิดเต็มจอ ↗</a>
          <button onClick={requestClose} aria-label="ปิด" title="ปิด (Esc)" className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">✕</button>
        </div>
        <div className="relative flex-1 min-h-0 bg-slate-50">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-400 pointer-events-none">
              <span className="animate-spin">⏳</span> กำลังเปิดตัวทำ BOM…
            </div>
          )}
          <iframe ref={frameRef} src={`/master/bom?embed=1&${q}`} title={`BOM ${sku}`} onLoad={() => setLoaded(true)}
            className={`block w-full h-full border-0 bg-white transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`} />
        </div>

        {/* ถามก่อนปิด เมื่อมีข้อมูลยังไม่บันทึก (อยู่ในกรอบนี้เอง — ป๊อปยืนยันกลางอยู่ชั้นต่ำกว่า drawer จึงใช้ไม่ได้) */}
        {askLeave && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 p-4" role="alertdialog" aria-modal="true">
            <div className="w-full max-w-sm rounded-xl bg-white shadow-2xl p-5">
              <p className="text-[15px] font-semibold text-slate-800">คุณมีข้อมูลที่ยังไม่ได้บันทึก</p>
              <p className="text-sm text-slate-600 mt-1">ต้องการออกโดยไม่บันทึกหรือไม่? สูตรที่กรอกไว้จะหายไป</p>
              <div className="flex justify-end gap-2 mt-4">
                <button autoFocus onClick={() => setAskLeave(false)} className="h-9 px-4 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">อยู่ต่อ</button>
                <button onClick={() => onClose(changedRef.current)} className="h-9 px-4 text-sm rounded-lg bg-rose-600 text-white hover:bg-rose-700">ออกโดยไม่บันทึก</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
