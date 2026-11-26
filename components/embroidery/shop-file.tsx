"use client";
/**
 * 🧵 ไฟล์ปัก — "ไฟล์จากร้าน" (ข้อเสนอ 4 รอบ 3): เก็บ .DST / .PES ที่ร้านตีบล็อกให้ไว้กับงาน · ดูภาพฝีเข็ม · ดาวน์โหลดต้นฉบับ
 *   อัปโหลด/เปลี่ยน/ลบ = บันทึกทันที (ไม่รอ SaveBar) · ลบแล้วย้อนกลับได้จากแจ้งผล · ประวัติลง audit ที่ API
 *   ตรวจไฟล์ในเบราว์เซอร์ก่อนส่ง (readShopFile) แล้ว API ตรวจซ้ำ
 */
import { useMemo, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { b64ToBytes, bytesToB64, readShopFile, SHOP_ACCEPT, SHOP_MAX_BYTES } from "@/lib/embroidery-shop";
import { API, api, downloadShopFile, fmtNum, thaiDate, type Design } from "./shared";

/** แผนฝีเข็มของไฟล์ร้าน (สำหรับภาพตัวอย่าง) · colorsHint = สีของงาน (ไฟล์ .DST ไม่มีสี) */
export function useShopPlan(d: Design | null, colorsHint: string[] = []) {
  const hint = colorsHint.join(",");
  return useMemo(() => {
    if (!d?.shop_file_b64) return null;
    try { return readShopFile(b64ToBytes(d.shop_file_b64), hint ? hint.split(",") : []).plan; } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.shop_file_b64, hint]);
}

/** อ่านไฟล์ที่เลือก → { name, b64 } (ตรวจว่าเป็นไฟล์เครื่องปักที่อ่านได้) */
export async function readShopUpload(file: File): Promise<{ name: string; b64: string }> {
  if (file.size > SHOP_MAX_BYTES) throw new Error("ไฟล์ใหญ่เกิน 1.5 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const r = readShopFile(bytes);
  if (r.plan.stitches < 1) throw new Error("ไฟล์นี้ไม่มีฝีเข็ม");
  return { name: file.name, b64: bytesToB64(bytes) };
}

export function ShopFilePanel({ design, canEdit, showing, onShow, onChange }: {
  design: Design; canEdit: boolean; showing: boolean; onShow: (v: boolean) => void; onChange: (d: Design) => void;
}) {
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const plan = useShopPlan(design);

  const put = async (shop_file: { name: string; b64: string } | null) => {
    const d = await api<Design>(`${API}/${design.id}`, { method: "PATCH", json: { shop_file } });
    onChange({ ...design, ...d, pieces: design.pieces, settings: design.settings });
    return d;
  };
  const upload = async (file: File) => {
    setBusy(true);
    try {
      const f = await readShopUpload(file);
      const old = design.shop_file_b64 ? { name: design.shop_file_name ?? "", b64: design.shop_file_b64 } : null;
      await put(f);
      onShow(true);
      if (old) toast.undo(`เปลี่ยนไฟล์จากร้านเป็น ${f.name} แล้ว`, async () => { try { await put(old); } catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); } });
      else toast.success(`เก็บไฟล์จากร้าน ${f.name} แล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    const old = design.shop_file_b64 ? { name: design.shop_file_name ?? "", b64: design.shop_file_b64 } : null;
    if (!old) return;
    setBusy(true);
    try {
      await put(null);
      onShow(false);
      toast.undo("ลบไฟล์จากร้านแล้ว", async () => { try { await put(old); } catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); } });
    } catch (e) { toast.error(e instanceof Error ? e.message : "ลบไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const btn = "inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50";
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500"><Icon name="document" /> ไฟล์จากร้าน (ร้านตีบล็อกให้)</div>
      {design.shop_file_b64 ? (
        <>
          <div className="text-sm font-medium text-slate-800 break-all">{design.shop_file_name}</div>
          <div className="text-[11px] text-slate-500">
            .{design.shop_file_kind?.toUpperCase()} · เก็บเมื่อ {thaiDate(design.shop_file_at ?? null)}
            {plan && <> · {fmtNum(plan.stitches)} ฝี · {(plan.width / 10).toFixed(1)} × {(plan.height / 10).toFixed(1)} ซม. · เปลี่ยนสี {plan.colorChanges} ครั้ง</>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {plan && (
              <button type="button" onClick={() => onShow(!showing)} className={`${btn} ${showing ? "border-indigo-300 bg-indigo-50 text-indigo-700" : ""}`}>
                <Icon name="view" /> {showing ? "กำลังดูไฟล์ร้าน" : "ดูภาพไฟล์ร้าน"}
              </button>
            )}
            <button type="button" onClick={() => downloadShopFile(design)} className={btn}><Icon name="download" /> ดาวน์โหลด</button>
            {canEdit && <button type="button" disabled={busy} onClick={() => ref.current?.click()} className={btn}><Icon name="refresh" /> เปลี่ยนไฟล์</button>}
            {canEdit && <button type="button" disabled={busy} onClick={() => void remove()} className={`${btn} text-red-600`}><Icon name="trash" /> ลบ</button>}
          </div>
        </>
      ) : (
        <>
          <p className="text-[11px] text-slate-500">ถ้าให้ร้านปักทำไฟล์ (ตีบล็อก) ให้ เก็บไฟล์ .DST / .PES ที่ร้านส่งกลับไว้ที่นี่ — ดูภาพฝีเข็มได้ และใช้ซ้ำครั้งหน้า</p>
          {canEdit && <button type="button" disabled={busy} onClick={() => ref.current?.click()} className={`${btn} mt-2`}><Icon name="upload" /> {busy ? "กำลังอัปโหลด…" : "อัปโหลดไฟล์จากร้าน"}</button>}
        </>
      )}
      <input ref={ref} type="file" accept={SHOP_ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
    </section>
  );
}
