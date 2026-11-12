"use client";

/**
 * 🌐 ParentWebCategories — กล่อง "หมวดบนเว็บ" ใต้ช่อง "หมวดกลางสำหรับลงขาย" ของ Parent SKU (เจ้าของขอ 2026-11-12)
 *   กด "🌐 หมวดบนเว็บ ▾" แล้วค่อยโหลด/โชว์ (จำว่าเปิดไว้ต่อคน) — ไม่โหลดทุกครั้งที่เปิดลิ้นชัก
 *   แต่ละร้าน: ชิปหมวด (★ = หมวดหลัก) เพิ่ม/ลดหมวดหรือหมวดย่อยได้ = FieldChipsPicker ตั้งค่าเดียวกับแท็บ 🛍 เว็บไซต์
 *   ยังไม่ได้จัดเอง → บอกว่าเว็บใส่ให้อะไรอยู่ (กฎแท็ก / หมวดกลาง / หมวด ERP / ค่าตั้งต้นร้าน) + ปุ่ม "ใช้" รับหมวดที่จับคู่ไว้กับหมวดกลาง
 *   ร้านที่รุ่นนี้ยังไม่ได้ลง = บอกเฉย ๆ (ลงร้านที่แท็บ 🛍 เว็บไซต์ — กันเผลอสร้างสินค้าบนร้าน)
 * อ่าน = GET /api/parent-web-listings/categories · บันทึกทันที = POST /api/parent-web-listings patch.webCategories (audit + ล้างแคชเว็บร้าน)
 * ใช้ผ่าน CentralCategoryPicker (prop webParentId) เท่านั้น
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useUserPref } from "@/lib/use-user-pref";
import { FieldChipsPicker } from "@/components/field-chips-picker";

type ShopCats = {
  shopId: string;
  name: string;
  slug: string;
  listed: boolean;
  published: boolean;
  /** null = ยังไม่ได้จัดหมวดเอง */
  manual: string[] | null;
  auto: { keys: string[]; source: "tag" | "central" | "erp" | "default" };
  suggest: string[] | null;
  shopCategories: { key: string; label: string; icon: string }[];
};

const SOURCE: Record<ShopCats["auto"]["source"], string> = {
  tag: "จากกฎแท็ก",
  central: "จากหมวดกลาง",
  erp: "จากหมวด ERP",
  default: "หมวดตั้งต้นของร้าน",
};

export function ParentWebCategories({ parentId, centralId }: { parentId: string; centralId?: string | null }) {
  const toast = useToast();
  const [open, setOpen] = useUserPref<boolean>("parent_web_categories_open", false, (v) => (typeof v === "boolean" ? v : null));
  const [shops, setShops] = useState<ShopCats[] | null>(null);
  const [err, setErr] = useState(false);
  const [status, setStatus] = useState<Record<string, "saving" | "saved" | "error">>({});

  const load = useCallback(async () => {
    setErr(false);
    try {
      const r = await apiFetch(`/api/parent-web-listings/categories?parentId=${encodeURIComponent(parentId)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error();
      setShops((j.shops ?? []) as ShopCats[]);
    } catch {
      setErr(true);
    }
  }, [parentId]);
  // เปิดอยู่ = โหลด · เปลี่ยนหมวดกลาง = โหลดใหม่ (คำแนะนำเปลี่ยนตาม)
  useEffect(() => {
    if (open) void load();
  }, [open, load, centralId]);

  // ติ๊กทีละหลายช่องเร็ว ๆ → บันทึกต่อคิวตามลำดับ (ส่งทั้งชุดทุกครั้ง · ตัวสุดท้ายชนะ) · พลาด = โหลดค่าจริงกลับมา
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const save = (s: ShopCats, next: string[] | null) => {
    setShops((list) => list?.map((x) => (x.shopId === s.shopId ? { ...x, manual: next } : x)) ?? list);
    setStatus((m) => ({ ...m, [s.shopId]: "saving" }));
    pending.current++;
    queue.current = queue.current.then(async () => {
      try {
        const r = await apiFetch("/api/parent-web-listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId, shopId: s.shopId, patch: { webCategories: next } }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(typeof j.error === "string" ? j.error : "");
        setStatus((m) => ({ ...m, [s.shopId]: "saved" }));
        if (next === null) toast.success(`${s.name}: กลับไปใช้หมวดอัตโนมัติแล้ว`);
      } catch (e) {
        setStatus((m) => ({ ...m, [s.shopId]: "error" }));
        toast.error(e instanceof Error && e.message ? e.message : "บันทึกหมวดบนเว็บไม่สำเร็จ ลองใหม่อีกครั้ง");
        await load();
      } finally {
        pending.current--;
        // เลิกจัดเอง → โหลดใหม่ให้เห็นว่าเว็บใส่หมวดอะไรให้ (รอคิวว่างก่อน)
        if (next === null && pending.current === 0) await load();
      }
    });
  };

  const labelOf = (s: ShopCats, k: string) => s.shopCategories.find((c) => c.key === k)?.label ?? k;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
      >
        🌐 หมวดบนเว็บ {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="mt-1.5 space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
          {err ? (
            <p className="text-xs text-red-600">
              โหลดหมวดบนเว็บไม่สำเร็จ{" "}
              <button type="button" onClick={() => void load()} className="underline">ลองใหม่</button>
            </p>
          ) : shops === null ? (
            <p className="text-xs text-slate-400">กำลังโหลด…</p>
          ) : shops.length === 0 ? (
            <p className="text-xs text-slate-400">ยังไม่มีร้านเว็บที่ตั้งหมวดไว้ — ตั้งได้ที่ เว็บไซต์ → 📂 หมวดหมู่</p>
          ) : (
            shops.map((s) => (
              <div key={s.shopId} className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-medium text-slate-800">{s.name}</span>
                  <span
                    className={`rounded-full border px-1.5 py-px text-[10px] ${
                      !s.listed
                        ? "border-slate-200 bg-white text-slate-400"
                        : s.published
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {!s.listed ? "ยังไม่ได้ลงร้านนี้" : s.published ? "ขึ้นเว็บอยู่" : "ปิดขายอยู่"}
                  </span>
                  {status[s.shopId] === "saving" && <span className="text-[10px] text-slate-400">กำลังบันทึก…</span>}
                  {status[s.shopId] === "saved" && <span className="text-[10px] text-emerald-600">บันทึกแล้ว ✓</span>}
                </div>
                {!s.listed ? (
                  <p className="text-[11px] text-slate-400">ลงร้านนี้ได้ที่แท็บ 🛍 เว็บไซต์ แล้วค่อยเลือกหมวด</p>
                ) : (
                  <>
                    <FieldChipsPicker
                      compact
                      value={(s.manual ?? []).filter((k) => s.shopCategories.some((c) => c.key === k))}
                      onChange={(next) => save(s, next)}
                      fields={s.shopCategories.map((c) => ({ key: c.key, label: c.label, icon: c.icon || undefined }))}
                      title={`หมวดบนเว็บ · ${s.name}`}
                      description="ติ๊กได้หลายหมวด · ★ = หมวดหลัก (กด ★ เปลี่ยนได้) — สินค้าโผล่ในทุกหมวดที่ติ๊ก"
                      addLabel="＋ เพิ่ม/ลดหมวด"
                      searchPlaceholder="ค้นหาหมวด…"
                      unit="หมวด"
                      showKeys={false}
                      markFirst="หมวดหลัก"
                      emptyText={s.manual === null ? "ยังไม่ได้จัดเอง" : "ไม่อยู่หมวดไหน"}
                    />
                    {s.manual === null ? (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        <span>
                          ตอนนี้เว็บใส่ให้: {s.auto.keys.length ? s.auto.keys.map((k) => labelOf(s, k)).join(", ") : "—"} ({SOURCE[s.auto.source]})
                        </span>
                        {s.suggest && (
                          <button
                            type="button"
                            onClick={() => save(s, s.suggest)}
                            title="ตั้งเป็นหมวดที่จับคู่ไว้กับหมวดกลางของสินค้านี้"
                            className="rounded-full border border-indigo-300 bg-white px-2 py-px text-indigo-700 hover:border-indigo-500"
                          >
                            ใช้ {s.suggest.map((k) => labelOf(s, k)).join(" + ")}
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => save(s, null)}
                        title="เลิกจัดเอง — ให้เว็บใส่หมวดให้ตามกฎ (แท็ก → หมวดกลาง → หมวด ERP)"
                        className="text-[11px] text-slate-400 hover:text-slate-700 hover:underline"
                      >
                        ↺ กลับไปใช้หมวดอัตโนมัติ
                      </button>
                    )}
                  </>
                )}
              </div>
            ))
          )}
          {shops && shops.length > 0 && (
            <p className="border-t border-slate-200 pt-1.5 text-[10px] text-slate-400">บันทึกทันที · เอาหมวดออกหมด = ไม่อยู่หมวดไหนบนเว็บ</p>
          )}
        </div>
      )}
    </div>
  );
}
