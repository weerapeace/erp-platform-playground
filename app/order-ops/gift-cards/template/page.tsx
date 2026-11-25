"use client";

// ============================================================
// 💌 ออกแบบแม่แบบการ์ด — /order-ops/gift-cards/template?id=<แม่แบบ> (ไม่ส่ง id = แม่แบบใหม่)
// ตัวออกแบบลากวาง (ของกลาง CardDesigner) · ตั้งชื่อ · ผูกแบรนด์ · ตั้งเป็นแม่แบบหลัก (ต่อแบรนด์ / ทั่วไป)
// ชิ้นข้อความที่ตั้ง "ใช้เป็นช่อง ข้อความหลัก/ถึง/จาก" = ช่องที่พนักงานแก้ได้ตอนเขียนการ์ด (แบบ A)
// สิทธิ์ order_ops.manage · API /api/order-gift-cards (template_save) · ลบ = ถังขยะในแท็บแม่แบบ
// ============================================================

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PlaygroundShell } from "@/components/playground-shell";
import { AccessDenied, useAuth, usePermission } from "@/components/auth";
import { ErrorState, LoadingState } from "@/components/state-views";
import { SaveBar } from "@/components/save-bar";
import { BrandSelect, type BrandSelectOption } from "@/components/brand-select";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";
import { CardDesigner, type UploadedFont } from "@/components/card-designer";
import { apiFetch } from "@/lib/api";
import { builtinTemplates, hasRole, type CardDoc } from "@/lib/gift-card-design";

async function gcJson<T = Record<string, unknown>>(url: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(url, init);
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง");
  return j;
}

export default function GiftCardTemplatePage() {
  const { permsReady } = useAuth();
  const canManage = usePermission("order_ops.manage");
  return (
    <PlaygroundShell>
      <div className="mx-auto w-full max-w-7xl px-3 pb-24 pt-3 sm:px-4">
        {!permsReady ? <LoadingState label="กำลังตรวจสิทธิ์…" />
          : !canManage ? <AccessDenied message="ออกแบบแม่แบบการ์ดต้องมีสิทธิ์ order_ops.manage" />
          : <Suspense fallback={<LoadingState />}><Body /></Suspense>}
      </div>
    </PlaygroundShell>
  );
}

function Body() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const id = sp.get("id");
  const [doc, setDoc] = useState<CardDoc | null>(null);
  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saved, setSaved] = useState("");
  const [brands, setBrands] = useState<BrandSelectOption[]>([]);
  const [fonts, setFonts] = useState<UploadedFont[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const snap = (d: CardDoc | null, n: string, b: string, def: boolean) => JSON.stringify([d, n, b, def]);
  const load = useCallback(async () => {
    setErr(null);
    try {
      const [t, f, b] = await Promise.all([
        id ? gcJson<{ template: { name: string; brand_id: string | null; doc: CardDoc; is_default: boolean } }>(`/api/order-gift-cards?template=${encodeURIComponent(id)}`) : Promise.resolve(null),
        gcJson<{ fonts: UploadedFont[] }>("/api/order-gift-cards?view=fonts"),
        apiFetch("/api/brands").then((r) => r.json()).catch(() => ({ data: [] })),
      ]);
      setFonts(f.fonts);
      setBrands(((b.data ?? []) as { id: string; name: string; is_customer_job?: boolean }[]).filter((x) => !x.is_customer_job).map((x) => ({ id: x.id, name: x.name })));
      const d = t?.template.doc ?? builtinTemplates()[0].doc;
      const n = t?.template.name ?? "", br = t?.template.brand_id ?? "", def = t?.template.is_default ?? false;
      setDoc(d); setName(n); setBrandId(br); setIsDefault(def);
      setSaved(id ? snap(d, n, br, def) : "");
    } catch (e) { setErr((e as Error).message); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const dirty = !!doc && snap(doc, name, brandId, isDefault) !== saved;
  const save = async () => {
    if (!doc) return;
    if (!name.trim()) { toast.error("ตั้งชื่อแม่แบบก่อน"); return; }
    setSaving(true);
    try {
      const j = await gcJson<{ id: string }>("/api/order-gift-cards", { method: "POST", body: JSON.stringify({ action: "template_save", id, name, brand_id: brandId || null, doc, is_default: isDefault }) });
      toast.success("บันทึกแม่แบบแล้ว");
      setSaved(snap(doc, name, brandId, isDefault));
      if (!id) router.replace(`/order-ops/gift-cards/template?id=${j.id}`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  if (err) return <ErrorState title={err} onRetry={load} />;
  if (!doc) return <LoadingState />;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/order-ops/instructions?s=settings" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" aria-label="กลับ"><Icon value="i:arrow-left" /></Link>
        <h1 className="text-lg font-bold text-slate-900">{id ? "แก้แม่แบบการ์ด" : "ออกแบบแม่แบบใหม่"}</h1>
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <label className="min-w-[200px] flex-1 text-[12px] text-slate-500">ชื่อแม่แบบ
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="เช่น วันเกิด Louis Montini" className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-800" />
        </label>
        <label className="min-w-[180px] text-[12px] text-slate-500">แบรนด์
          <BrandSelect brands={brands} value={brandId} onChange={setBrandId} emptyLabel="ทุกแบรนด์" className="mt-0.5 h-9 w-full" />
        </label>
        <label className="flex h-9 items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> ใช้เป็นแม่แบบหลัก{brandId ? "ของแบรนด์นี้" : " (ทั่วไป)"}</label>
      </div>
      {!hasRole(doc, "message") && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <Icon value="i:alert-triangle" className="mr-1" /> ยังไม่มีชิ้นข้อความที่ตั้งเป็น "ข้อความหลัก" — กดชิ้นข้อความ › แก้ชิ้น › "ใช้เป็น" ช่องข้อความหลัก · ไม่ตั้ง = ระบบเพิ่มกล่องข้อความกลางการ์ดให้เอง
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <CardDesigner value={doc} onChange={setDoc} uploadedFonts={fonts} height={520} />
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={save} saveLabel="บันทึกแม่แบบ" />
    </>
  );
}
