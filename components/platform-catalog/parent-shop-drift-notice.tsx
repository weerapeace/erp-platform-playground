"use client";

/**
 * ParentShopDriftNotice — แถบเตือนเล็กบนแถบเครื่องมือของ Parent SKU หลัง "บันทึก" (ของกลาง · ไม่บังจอ)
 * เจ้าของเลือก 2026-11-21 (ข้อ 3): "ตอนบันทึกสินค้าในระบบ ขึ้นแจ้ง 'ลงอยู่ 3 ร้าน ส่งการแก้ไขไปด้วยไหม'"
 *
 * ทำงาน: version (updated_at ของ Parent) เปลี่ยนระหว่างเปิดป๊อป = เพิ่งบันทึก → เทียบสดทุกร้านที่ลงสินค้านี้
 *   (POST /api/platform-catalog/drift action recheck · ตัวตรวจกลาง lib/platform-listing-drift-server)
 *   → ร้านไหนไม่ตรง = "ลงอยู่ N ร้าน · ไม่ตรงระบบ M ร้าน" + ปุ่ม "ไปอัปเดต" (พาไปแท็บแพลตฟอร์ม → ปุ่มอัปเดตให้ตรงต่อร้าน)
 * เปิดป๊อปเฉย ๆ ไม่เทียบ (แท็บแพลตฟอร์มเทียบเองเมื่อผลเก่า) · ไม่ส่งอะไรขึ้นร้าน
 * ข้อจำกัด: แก้ราคา/สีที่ตาราง SKU ลูก หรือเปลี่ยนรูปในแกลเลอรี ไม่ได้เปลี่ยน updated_at ของ Parent → ไม่ขึ้นแถบนี้ (ป้ายในแท็บแพลตฟอร์ม/ตัวตรวจทุกคืนยังจับได้)
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { DRIFT_LABEL, type DriftKey } from "@/lib/platform-listing-drift";

const SHOP_NAME: Record<string, string> = { shopee: "Shopee", lazada: "Lazada", tiktok: "TikTok", line_shopping: "LINE" };
type Row = { platform_code: string; issues: DriftKey[]; error: string | null };
/** version ล่าสุดที่เห็นต่อสินค้า — เก็บนอกตัว component (แถบเครื่องมือถูกถอด/ใส่ใหม่ตอนสลับโหมดแก้/ดู ห้ามลืมว่าเพิ่งบันทึก) */
const lastSeen = new Map<string, string>();
/** ผลเทียบหลังบันทึก (ต่อสินค้า) — ตัวที่ใส่ใหม่หลังสลับโหมดยังเห็นผลเดิม · กดปิด = ลบ */
const pending = new Map<string, { v: string; p: Promise<Row[] | null> }>();

export function ParentShopDriftNotice({ parentId, version, goto }: { parentId: string; version?: string; goto: (t: { tab?: string; field?: string }) => boolean }) {
  const { can } = useAuth();
  const allowed = can("products.platforms.view");
  const seq = useRef(0);
  const [state, setState] = useState<{ checking: boolean; rows: Row[] | null; hidden: boolean }>({ checking: false, rows: null, hidden: false });

  useEffect(() => {
    const v = version ?? "";
    const prev = lastSeen.get(parentId);
    if (v) lastSeen.set(parentId, v);
    if (!allowed) return;
    // เพิ่งบันทึก (version เปลี่ยนระหว่างเปิดป๊อป) → เทียบสด
    if (prev && v && prev !== v) {
      pending.set(parentId, {
        v,
        p: apiFetch("/api/platform-catalog/drift", { method: "POST", body: JSON.stringify({ action: "recheck", parent_sku_id: parentId }) })
          .then((r) => r.json()).then((j) => (j.error ? null : (j.rows ?? []) as Row[])).catch(() => null),
      });
    }
    const pe = pending.get(parentId);
    if (!pe || pe.v !== v) { setState({ checking: false, rows: null, hidden: false }); return; }
    const my = ++seq.current;
    setState({ checking: true, rows: null, hidden: false });
    void pe.p.then((rows) => { if (my === seq.current) setState({ checking: false, rows, hidden: rows == null }); });
  }, [parentId, version, allowed]);
  const dismiss = () => { pending.delete(parentId); setState((s) => ({ ...s, hidden: true })); };

  // ไม่ตรง = แถบค้างไว้จนกดปิด · ตรงหมด = โชว์สั้น ๆ แล้วหายเอง
  const rows = state.rows ?? [];
  const bad = rows.filter((r) => !r.error && r.issues.length);
  useEffect(() => {
    if (!state.rows || bad.length || !rows.length) return;
    const t = setTimeout(dismiss, 6000);
    return () => clearTimeout(t);
  }, [state.rows, bad.length, rows.length]);

  if (!allowed || state.hidden) return null;
  if (state.checking) return <span className="inline-flex items-center gap-1 text-[11px] text-slate-400"><Icon name="refresh" />กำลังเช็กร้านที่ลงอยู่…</span>;
  if (!state.rows || !rows.length) return null;
  if (!bad.length) return <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700"><Icon name="done" />ร้านที่ลงอยู่ {rows.length} ร้าน ตรงกับระบบ</span>;
  const detail = bad.map((r) => `${SHOP_NAME[r.platform_code] ?? r.platform_code}: ${r.issues.map((k) => DRIFT_LABEL[k].replace(/\s*\(.*\)$/, "")).join("/")}`).join(" · ");
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900" title={detail}>
      <Icon name="warning" />
      <span className="min-w-0">ลงอยู่ {rows.length} ร้าน · ไม่ตรงระบบ {bad.length} ร้าน ({bad.map((r) => SHOP_NAME[r.platform_code] ?? r.platform_code).join(", ")}) — ส่งการแก้ไขไปด้วยไหม?</span>
      <button type="button" onClick={() => { dismiss(); goto({ tab: "platforms" }); }} className="rounded-md bg-amber-600 px-2 py-0.5 text-white hover:bg-amber-700">ไปอัปเดต</button>
      <button type="button" onClick={dismiss} aria-label="ปิดแถบเตือน" className="text-amber-700 hover:text-amber-900"><Icon name="x" /></button>
    </span>
  );
}
