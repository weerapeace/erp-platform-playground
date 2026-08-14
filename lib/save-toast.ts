/**
 * apiSave — ของกลาง: "กดบันทึกแล้วต้องรู้ผลเสมอ"
 *
 * ปัญหาที่แก้: หลายที่ในระบบยิงคำสั่งบันทึกแบบ fire-and-forget
 *   apiFetch(url, {...}).catch(() => {})
 * → พังเงียบ ผู้ใช้กดปุ่มแล้วไม่มีอะไรเกิดขึ้น นึกว่าบันทึกแล้ว (ทั้งที่ไม่ได้บันทึก)
 *
 * ตัวนี้ทำให้ทุกการบันทึก "เด้งบอกผล" เหมือนกันทั้งระบบ:
 *   - สำเร็จ → toast เขียว (ข้อความสั้น บอกว่าบันทึกอะไร)
 *   - ไม่สำเร็จ → toast แดง พร้อมเหตุผลจากเซิร์ฟเวอร์ (401 = ไม่มีสิทธิ์ / เน็ตหลุด / DB error)
 *
 * ใช้:
 *   const toast = useToast();
 *   const r = await apiSave(toast, "/api/bom/components", { body: { sku_id, fabric_width_cm: 160 } },
 *                           { ok: "บันทึกหน้ากว้างกลับเข้า SKU แล้ว", fail: "บันทึกหน้ากว้างไม่สำเร็จ" });
 *   if (!r.ok) return;   // ไม่สำเร็จ — toast เด้งให้แล้ว
 *
 * หมายเหตุ:
 *   - method ค่าเริ่มต้น = PATCH (การบันทึกส่วนใหญ่ในระบบเป็นการแก้ของเดิม)
 *   - body เป็น object ได้เลย (แปลง JSON + ใส่ Content-Type ให้อัตโนมัติ)
 *   - ถือว่า "ไม่สำเร็จ" เมื่อ HTTP ไม่ 2xx หรือ payload มี `error` (แบบมาตรฐานของ API ในระบบนี้)
 *   - quiet: true = ไม่เด้ง toast (เช่นบันทึกอัตโนมัติเบื้องหลัง) แต่ยังคืนผลให้เช็กเองได้
 */
import { apiFetch } from "@/lib/api";
import type { ToastApi } from "@/components/toast";

export type SaveResult<T = unknown> = { ok: boolean; data?: T; error?: string };

export type SaveInit = {
  method?: string;
  body?: unknown;                       // object → stringify ให้ · string → ส่งตรง
  headers?: Record<string, string>;
};

export type SaveOpts = {
  ok?: string;      // ข้อความตอนสำเร็จ (ค่าเริ่มต้น "บันทึกแล้ว")
  fail?: string;    // ข้อความนำหน้าตอนพลาด (ค่าเริ่มต้น "บันทึกไม่สำเร็จ")
  quiet?: boolean;  // true = ไม่เด้ง toast
};

export async function apiSave<T = unknown>(
  toast: ToastApi,
  url: string,
  init: SaveInit = {},
  opts: SaveOpts = {},
): Promise<SaveResult<T>> {
  const { method = "PATCH", body, headers } = init;
  const failLead = opts.fail ?? "บันทึกไม่สำเร็จ";

  try {
    const res = await apiFetch(url, {
      method,
      headers: body === undefined ? headers : { "Content-Type": "application/json", ...(headers ?? {}) },
      body: body === undefined ? undefined : (typeof body === "string" ? body : JSON.stringify(body)),
    });

    // บาง endpoint คืน 204/ข้อความเปล่า → อ่าน json ไม่ได้ ไม่ถือว่าพัง
    let payload: { error?: unknown; data?: unknown } | null = null;
    try { payload = await res.json(); } catch { payload = null; }

    const serverErr = payload?.error ? String(payload.error) : null;
    const httpErr = res.ok ? null : `เซิร์ฟเวอร์ตอบ ${res.status}`;
    const err = serverErr ?? httpErr;

    if (err) {
      if (!opts.quiet) toast.error(`${failLead} — ${err}`);
      return { ok: false, error: err };
    }
    if (!opts.quiet) toast.success(opts.ok ?? "บันทึกแล้ว");
    return { ok: true, data: (payload?.data ?? payload) as T };
  } catch (e) {
    // เน็ตหลุด / เบราว์เซอร์บล็อก — ต้องบอกผู้ใช้เหมือนกัน ห้ามเงียบ
    const msg = e instanceof Error ? e.message : "เชื่อมต่อไม่ได้";
    if (!opts.quiet) toast.error(`${failLead} — ${msg}`);
    return { ok: false, error: msg };
  }
}
