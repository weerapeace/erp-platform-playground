"use client";

/**
 * 📧 ลงรายการจากอีเมล — วางเนื้อหาอีเมลสั่งซื้อ/ใบเสร็จ → AI แยกเป็นรายการหนังสือ → ตรวจ/แก้ → บันทึก
 *
 * ทำไมเป็นการ "วาง" ไม่ใช่ต่อ Gmail อัตโนมัติ: การอ่านกล่องเมลต้องขอสิทธิ์ชั้นเข้มงวดจาก Google
 * (ดู docs/book-library-import.md) — วิธีนี้ใช้ได้ทันทีกับเมลจากร้านไหนก็ได้ ไม่ต้องตั้งค่าอะไร
 *
 * ของกลางที่ใช้: ERPModal · MoneyInput (ช่องเงินมีลูกน้ำ) · useToast ·
 *                บันทึกผ่าน /api/master-v2/book_library/import (ตัวนำเข้ากลาง มี audit log ในตัว)
 */

import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { MoneyInput } from "@/components/money-input";
import { useToast } from "@/components/toast";
import { useAuth } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { getStatusStyle } from "@/lib/status-config";

type ParsedBook = {
  title: string; series: string; volume: string; author: string; category: string;
  isbn: string; price: number | null; currency: string; store: string;
  purchased_at: string; release_date: string; buy_url: string; status: string;
};
type Row = ParsedBook & { _use: boolean; _dup: boolean };

const STATUSES = ["owned", "wishlist", "upcoming", "skipped"] as const;

/**
 * ตัดช่องว่างทิ้งก่อนส่งเข้าตัวนำเข้ากลาง — คอลัมน์วันที่รับ "" ไม่ได้ (ต้องไม่ส่งไปเลย)
 * ช่อง "ร้าน" ส่งเป็น store_id = "ชื่อร้าน" → ตัวนำเข้ากลางแปลงชื่อ → id ให้เอง
 * (ต้องมีร้านนั้นในทะเบียนก่อน — ดู ensureStores)
 */
function toPayload(r: Row): Record<string, unknown> {
  const out: Record<string, unknown> = { title: r.title.trim(), status: r.status };
  const text = (k: keyof ParsedBook) => { const v = String(r[k] ?? "").trim(); if (v) out[k] = v; };
  (["series", "volume", "author", "category", "isbn", "buy_url", "currency"] as const).forEach(text);
  (["purchased_at", "release_date"] as const).forEach((k) => { if (r[k]) out[k] = r[k]; });
  if (r.price != null) out.price = r.price;
  if (r.store.trim()) out.store_id = r.store.trim();
  return out;
}

export function ImportMailModal({ open, onClose, onImported }: {
  open: boolean; onClose: () => void; onImported: () => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => { setText(""); setRows(null); setParsing(false); setSaving(false); };
  const close = () => { reset(); onClose(); };

  const parse = async () => {
    setParsing(true);
    try {
      const res = await apiFetch("/api/book-library/parse-email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = await res.json();
      if (j.error) { toast.error(String(j.error)); return; }
      const books = (j.books ?? []) as ParsedBook[];
      if (books.length === 0) { toast.warning("ไม่พบรายการหนังสือในข้อความนี้ — ลองวางเนื้อหาส่วนที่มีชื่อหนังสือกับราคา"); return; }

      // เล่มที่มีในคลังแล้ว → ติดป้าย "ซ้ำ" + ไม่ติ๊กให้ (ผู้ใช้ยังติ๊กเองได้ถ้าตั้งใจ)
      let dupTitles: Record<string, unknown> = {};
      try {
        const dRes = await apiFetch("/api/book-library/check-duplicates", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ titles: books.map((b) => b.title) }),
        });
        dupTitles = ((await dRes.json()).existing ?? {}) as Record<string, unknown>;
      } catch { /* เช็กไม่ได้ก็ปล่อยผ่าน — ฐานข้อมูลกันซ้ำให้อีกชั้น */ }

      const dupCount = books.filter((b) => dupTitles[b.title]).length;
      if (dupCount > 0) toast.info(`มี ${dupCount} เล่มที่อยู่ในคลังแล้ว — ไม่ติ๊กให้ กันเพิ่มซ้ำ`);
      setRows(books.map((b) => {
        const dup = !!dupTitles[b.title];
        return { ...b, _dup: dup, _use: !dup };
      }));
    } catch (e) {
      toast.error((e as Error).message ?? "อ่านอีเมลไม่สำเร็จ");
    } finally { setParsing(false); }
  };

  /**
   * ร้านที่อ่านได้จากอีเมลต้องมีในทะเบียนร้านก่อน ตัวนำเข้ากลางถึงจะแปลงชื่อ → id ได้
   * → เพิ่มร้านที่ยังไม่มีให้อัตโนมัติ (ชื่อซ้ำถูกกันด้วย unique index ฝั่ง DB อยู่แล้ว)
   */
  const ensureStores = async (names: string[]) => {
    const uniq = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
    if (uniq.length === 0) return;
    const res = await apiFetch("/api/master-v2/book_stores?limit=2000");
    const j = await res.json();
    const have = new Set(((j.data ?? []) as { name?: string }[]).map((s) => String(s.name ?? "").trim().toLowerCase()));
    for (const name of uniq) {
      if (have.has(name.toLowerCase())) continue;
      await apiFetch("/api/master-v2/book_stores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, actor: user?.name ?? user?.email }),
      }).catch(() => { /* สร้างไม่ได้ก็ปล่อย — แถวนั้นจะถูกรายงานว่าไม่พบร้าน */ });
    }
  };

  const save = async () => {
    const picked = (rows ?? []).filter((r) => r._use && r.title.trim());
    if (picked.length === 0) { toast.warning("ยังไม่ได้เลือกเล่มไหนเลย"); return; }
    setSaving(true);
    try {
      await ensureStores(picked.map((r) => r.store));
      const res = await apiFetch("/api/master-v2/book_library/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: picked.map(toPayload), mode: "create", actor: user?.name ?? user?.email }),
      });
      const j = await res.json();
      if (j.error) { toast.error(String(j.error)); return; }
      const failed = (j.failed ?? []) as { row: number; error: string }[];
      if (failed.length > 0) toast.warning(`บันทึกได้ ${j.created ?? 0} เล่ม · ไม่สำเร็จ ${failed.length} เล่ม (${failed[0].error})`);
      else toast.success(`เพิ่มเข้าคลังแล้ว ${j.created ?? picked.length} เล่ม`);
      onImported();
      close();
    } catch (e) {
      toast.error((e as Error).message ?? "บันทึกไม่สำเร็จ");
    } finally { setSaving(false); }
  };

  const patch = (i: number, p: Partial<Row>) =>
    setRows((prev) => (prev ? prev.map((r, k) => (k === i ? { ...r, ...p } : r)) : prev));

  const picked = (rows ?? []).filter((r) => r._use).length;
  const cell = "h-8 w-full px-2 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300";

  return (
    <ERPModal
      open={open}
      onClose={close}
      size="xl"
      title="📧 ลงรายการจากอีเมล"
      description="วางเนื้อหาอีเมลสั่งซื้อ/ใบเสร็จ แล้วให้ระบบแยกเป็นรายการหนังสือให้ — ตรวจแล้วค่อยกดบันทึก"
      hasUnsavedChanges={!!rows && !saving}
      storageKey="book-library-import-mail"
      footer={
        <>
          <button onClick={close} disabled={saving}
            className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">ยกเลิก</button>
          {rows && (
            <button onClick={() => setRows(null)} disabled={saving}
              className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">← วางใหม่</button>
          )}
          {rows
            ? <button onClick={save} disabled={saving || picked === 0}
                className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {saving ? "กำลังบันทึก…" : `บันทึกเข้าคลัง (${picked} เล่ม)`}
              </button>
            : <button onClick={parse} disabled={parsing || text.trim().length < 20}
                className="h-9 px-5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
                {parsing ? "กำลังอ่าน…" : "✨ แยกรายการ"}
              </button>}
        </>
      }
    >
      {!rows ? (
        <div>
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={12} autoFocus
            placeholder={"เปิดอีเมลสั่งซื้อ → เลือกข้อความทั้งหมด (Ctrl+A) → คัดลอก (Ctrl+C) → วางตรงนี้ (Ctrl+V)\n\nวางพร้อมกันหลายอีเมลก็ได้ · ร้านไหนก็ได้ · ไทย/อังกฤษ/ญี่ปุ่นก็อ่านได้"}
            className="w-full rounded-lg border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <div className="mt-2 text-xs text-slate-400">
            ระบบจะเดาให้เท่าที่อีเมลบอก — ช่องที่อีเมลไม่ได้ระบุจะเว้นว่างไว้ (ไม่มั่ว) แล้วคุณเติมเองได้ในขั้นถัดไป
          </div>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm text-slate-600">พบ {rows.length} เล่ม — ติ๊กเล่มที่จะบันทึก แล้วแก้ข้อมูลได้เลย</span>
            <button onClick={() => setRows(rows.map((r) => ({ ...r, _use: !r._dup })))}
              className="text-xs text-blue-600 hover:underline">เลือกทั้งหมด (ยกเว้นที่ซ้ำ)</button>
            <button onClick={() => setRows(rows.map((r) => ({ ...r, _use: false })))}
              className="text-xs text-slate-400 hover:underline">ไม่เลือกเลย</button>
          </div>
          <div className="overflow-auto max-h-[52vh] border border-slate-100 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="text-slate-500 text-left">
                  <th className="p-2 w-8"></th>
                  <th className="p-2 min-w-[200px]">ชื่อเรื่อง</th>
                  <th className="p-2 min-w-[130px]">ชุด/ซีรีส์</th>
                  <th className="p-2 w-16">เล่ม</th>
                  <th className="p-2 w-24">ราคา</th>
                  <th className="p-2 min-w-[110px]">ร้าน</th>
                  <th className="p-2 w-32">วันที่ซื้อ</th>
                  <th className="p-2 w-28">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={`border-t border-slate-100 ${r._use ? "" : "opacity-40"}`}>
                    <td className="p-2 align-middle">
                      <input type="checkbox" checked={r._use} onChange={(e) => patch(i, { _use: e.target.checked })} />
                    </td>
                    <td className="p-1">
                      <div className="flex items-center gap-1">
                        <input value={r.title} onChange={(e) => patch(i, { title: e.target.value, _dup: false })} className={cell} />
                        {r._dup && (
                          <span title="ชื่อนี้มีในคลังแล้ว — ติ๊กบันทึกจะซ้ำ (เปลี่ยนชื่อได้ถ้าเป็นคนละเล่ม)"
                            className="shrink-0 px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 border border-amber-200">ซ้ำ</span>
                        )}
                      </div>
                    </td>
                    <td className="p-1"><input value={r.series} onChange={(e) => patch(i, { series: e.target.value })} className={cell} /></td>
                    <td className="p-1"><input value={r.volume} onChange={(e) => patch(i, { volume: e.target.value })} className={cell} /></td>
                    <td className="p-1">
                      <MoneyInput value={r.price} onChange={(raw) => patch(i, { price: raw === "" ? null : Number(raw) })} className={`${cell} text-right`} />
                    </td>
                    <td className="p-1"><input value={r.store} onChange={(e) => patch(i, { store: e.target.value })} className={cell} /></td>
                    <td className="p-1"><input type="date" value={r.purchased_at} onChange={(e) => patch(i, { purchased_at: e.target.value })} className={cell} /></td>
                    <td className="p-1">
                      <select value={r.status} onChange={(e) => patch(i, { status: e.target.value })} className={cell}>
                        {STATUSES.map((s) => <option key={s} value={s}>{getStatusStyle(s, "book_library").label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            ช่องอื่น (ผู้แต่ง · หมวด · ISBN · รูปปก · วันวางขาย · ลิงก์สั่งซื้อ) บันทึกตามที่อ่านได้ แล้วไปแก้เพิ่มในหน้ารายละเอียดแต่ละเล่มได้
          </div>
        </div>
      )}
    </ERPModal>
  );
}
