"use client";

// ============================================================
// 💌 ออกแบบแม่แบบการ์ด — /order-ops/gift-cards/template?id=<แม่แบบ> (ไม่ส่ง id = แม่แบบใหม่ · ?new=fold-side|fold-top = การ์ดพับ A6)
// ?id=builtin:xxx = แก้แม่แบบในตัว → บันทึกเป็นฉบับแก้ (replaces_builtin) · กลุ่มแม่แบบ (ข้อ 2) · การ์ดพับ = CardDesignerAny (ด้านนอก/ด้านใน)
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
import { CardDesignerAny, type UploadedFont } from "@/components/card-designer";
import { apiFetch } from "@/lib/api";
import { builtinTemplates, hasRole, isBuiltinId, isFolded, isSpecialTemplate, newFoldedDoc, type CardDoc } from "@/lib/gift-card-design";

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
  const rawId = sp.get("id");
  const builtinId = isBuiltinId(rawId) ? rawId : null;   // แก้แม่แบบในตัว → บันทึกครั้งแรก = สร้างฉบับแก้
  const id = builtinId ? null : rawId;
  const newKind = sp.get("new");
  const [doc, setDoc] = useState<CardDoc | null>(null);
  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [special, setSpecial] = useState(false);
  const [group, setGroup] = useState("");
  const [groups, setGroups] = useState<string[]>([]);
  const [saved, setSaved] = useState("");
  const [brands, setBrands] = useState<BrandSelectOption[]>([]);
  const [fonts, setFonts] = useState<UploadedFont[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const snap = (d: CardDoc | null, n: string, b: string, def: boolean, g = "", sp2 = false) => JSON.stringify([d, n, b, def, g, sp2]);
  const load = useCallback(async () => {
    setErr(null);
    try {
      const [t, f, b, all] = await Promise.all([
        rawId ? gcJson<{ template: { name: string; brand_id: string | null; doc: CardDoc; is_default: boolean; is_special?: boolean | null; group?: string | null } }>(`/api/order-gift-cards?template=${encodeURIComponent(rawId)}`) : Promise.resolve(null),
        gcJson<{ fonts: UploadedFont[] }>("/api/order-gift-cards?view=fonts"),
        apiFetch("/api/brands").then((r) => r.json()).catch(() => ({ data: [] })),
        gcJson<{ templates: { group?: string | null }[] }>("/api/order-gift-cards?view=templates").catch(() => ({ templates: [] })),
      ]);
      setGroups([...new Set(all.templates.map((x) => (x.group ?? "").trim()).filter(Boolean))]);
      setFonts(f.fonts);
      setBrands(((b.data ?? []) as { id: string; name: string; is_customer_job?: boolean }[]).filter((x) => !x.is_customer_job).map((x) => ({ id: x.id, name: x.name })));
      const d = t?.template.doc ?? (newKind === "fold-side" ? newFoldedDoc("side") : newKind === "fold-top" ? newFoldedDoc("top") : builtinTemplates()[0].doc);
      const n = t?.template.name ?? "", br = t?.template.brand_id ?? "", def = t?.template.is_default ?? false, g = t?.template.group ?? sp.get("group") ?? "";
      const spc = isSpecialTemplate({ is_special: t?.template.is_special ?? null, doc: d });
      setDoc(d); setName(n); setBrandId(br); setIsDefault(def); setGroup(g); setSpecial(spc);
      setSaved(rawId ? snap(d, n, br, def, g, spc) : "");
    } catch (e) { setErr((e as Error).message); }
  }, [rawId, newKind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);

  const dirty = !!doc && snap(doc, name, brandId, isDefault, group, special) !== saved;
  const save = async () => {
    if (!doc) return;
    if (!name.trim()) { toast.error("ตั้งชื่อแม่แบบก่อน"); return; }
    setSaving(true);
    try {
      const j = await gcJson<{ id: string }>("/api/order-gift-cards", { method: "POST", body: JSON.stringify({ action: "template_save", id, name, brand_id: brandId || null, doc, is_default: isDefault, is_special: special, group_name: group || null, replaces_builtin: builtinId }) });
      toast.success(builtinId ? "บันทึกฉบับแก้แล้ว — แม่แบบในตัวเดิมกด \"คืนค่าเดิม\" ในหน้าตั้งค่าได้" : "บันทึกแม่แบบแล้ว");
      setSaved(snap(doc, name, brandId, isDefault, group, special));
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
        <h1 className="text-lg font-bold text-slate-900">{builtinId ? "แก้แม่แบบในตัว" : id ? "แก้แม่แบบการ์ด" : isFolded(doc) ? "ออกแบบการ์ดพับ A6 ใหม่" : "ออกแบบแม่แบบใหม่"}</h1>
        {builtinId && <span className="rounded bg-sky-50 px-2 py-0.5 text-[12px] text-sky-700">บันทึกแล้วใช้ฉบับนี้แทนของเดิม · คืนค่าเดิมได้</span>}
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <label className="min-w-[200px] flex-1 text-[12px] text-slate-500">ชื่อแม่แบบ
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="เช่น วันเกิด Louis Montini" className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-800" />
        </label>
        <label className="min-w-[160px] text-[12px] text-slate-500">กลุ่ม
          <input value={group} onChange={(e) => setGroup(e.target.value)} list="gc-groups" maxLength={60} placeholder="เช่น การ์ดวันเกิด" className="mt-0.5 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-800" />
          <datalist id="gc-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        </label>
        <label className="min-w-[180px] text-[12px] text-slate-500">แบรนด์
          <BrandSelect brands={brands} value={brandId} onChange={setBrandId} emptyLabel="ทุกแบรนด์" className="mt-0.5 h-9 w-full" />
        </label>
        <label className="flex h-9 items-center gap-2 text-sm text-violet-800" title="คำสั่ง การ์ดพิเศษ ในป๊อปคำสั่งพิเศษ เห็นเฉพาะแม่แบบที่ติ๊ก · การ์ดธรรมดา เห็นเฉพาะที่ไม่ติ๊ก"><input type="checkbox" checked={special} onChange={(e) => setSpecial(e.target.checked)} /> การ์ดพิเศษ</label>
        <label className="flex h-9 items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> ใช้เป็นแม่แบบหลัก{brandId ? "ของแบรนด์นี้" : " (ทั่วไป)"}</label>
      </div>
      {!hasRole(doc, "message") && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <Icon value="i:alert-triangle" className="mr-1" /> ยังไม่มีชิ้น &quot;ข้อความจากลูกค้า&quot; = แม่แบบนี้เป็น &quot;ข้อความตายตัว&quot; · อยากให้ใส่ข้อความลูกค้าได้: กดชิ้นข้อความ › แก้ชิ้น › ปุ่ม &quot;ข้อความจากลูกค้า&quot;
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <CardDesignerAny value={doc} onChange={setDoc} uploadedFonts={fonts} height={520} />
      </div>
      <SaveBar dirty={dirty} saving={saving} onSave={save} saveLabel="บันทึกแม่แบบ" />
    </>
  );
}
