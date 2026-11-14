"use client";

/**
 * 📚 Design Library — หน้าคลังแม่แบบ (/master/design-library) + หน้าแม่แบบ (/master/design-library/[id])
 *
 * คลัง: การ์ดรูปแม่แบบ + ค้นหา + กรองทรง · กดการ์ด = หน้าแม่แบบ (สูตรทั้งหมดของแม่แบบนั้น)
 * หน้าแม่แบบ: รูปจริง/ลายเส้น · สูตร #1 #2 … (รูปปก = รูปจาก GPT ล่าสุด) · "สร้างสูตรใหม่" / "คัดลอกสูตร"
 * สิทธิ์: ดู design_library.view · สร้างสูตร design_library.edit · แม่แบบ/ตัวเลือก design_library.manage
 * ของกลาง: ERPModal / ConfirmDialog · EmptyState / LoadingState / ErrorState · useToast · Icon · กฎ lib/design-library
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePermission } from "@/components/auth";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { TemplateFormModal } from "./template-form";
import { ChoicesManager } from "./choices-manager";
import { bagTypeOf, type Choice } from "@/lib/design-library";
import { api, img, LIB_HREF, recipeHref, thaiDate, tplHref, type RecipeCard, type Template } from "./shared";

/** ชื่อประเภทกระเป๋าจากรหัส (template.category) — แม่แบบเก่าที่พิมพ์ทรงเองโชว์ข้อความเดิม */
function useBagTypes() {
  const [types, setTypes] = useState<Choice[]>([]);
  useEffect(() => { api<Choice[]>(`/api/design-library/choices?list_key=bag_type&limit=500`).then(setTypes).catch(() => setTypes([])); }, []);
  return (code: string | null | undefined) => bagTypeOf(types, code)?.name ?? (code || "");
}

function Header({ title, sub, back, children }: { title: string; sub?: string; back?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {back && <Link href={back} className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50" aria-label="กลับ"><Icon value="i:arrow-left" /></Link>}
      <div className="min-w-0 mr-auto">
        <h1 className="text-xl font-semibold text-slate-800 truncate">{title}</h1>
        {sub && <p className="text-[13px] text-slate-500">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function DesignLibrary() {
  const canManage = usePermission("design_library.manage");
  const [rows, setRows] = useState<Template[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [form, setForm] = useState<{ open: boolean; t: Template | null }>({ open: false, t: null });
  const [choicesOpen, setChoicesOpen] = useState(false);
  const router = useRouter();
  const typeName = useBagTypes();

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await api<Template[]>(`/api/design-library/bundle?overview=1`)); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const cats = useMemo(() => [...new Set((rows ?? []).map((r) => r.category?.trim()).filter(Boolean) as string[])].sort(), [rows]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => (!cat || r.category === cat) && (!s || `${r.code} ${r.name} ${typeName(r.category)} ${r.description ?? ""}`.toLowerCase().includes(s)));
  }, [rows, q, cat, typeName]);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <Header title="Design Library" sub="คลังแม่แบบกระเป๋า — เลือกแม่แบบ ปรับวัสดุ/สี/ช่อง แล้วออกใบสรุป + prompt ให้ GPT สร้างรูป">
        {canManage && <button type="button" onClick={() => setChoicesOpen(true)} className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1.5"><Icon value="i:settings" />ตัวเลือก</button>}
        {canManage && <button type="button" onClick={() => setForm({ open: true, t: null })} className="h-9 px-3 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 inline-flex items-center gap-1.5"><Icon value="i:plus" />เพิ่มแม่แบบ</button>}
      </Header>
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 h-10 flex-1 min-w-[220px] bg-white focus-within:ring-2 focus-within:ring-indigo-500">
          <Icon value="i:search" className="text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา รหัส / ชื่อแม่แบบ" className="flex-1 h-full text-sm outline-none bg-transparent" />
        </div>
        {cats.length > 0 && (
          <div className="flex flex-wrap gap-1 items-center">
            {["", ...cats].map((c) => (
              <button key={c || "all"} type="button" onClick={() => setCat(c)} className={`h-8 px-3 text-[13px] rounded-full border ${cat === c ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{c ? typeName(c) : "ทั้งหมด"}</button>
            ))}
          </div>
        )}
      </div>
      {err ? <ErrorState title="โหลดคลังแม่แบบไม่สำเร็จ" hint={err} onRetry={() => void load()} />
        : !rows ? <LoadingState label="กำลังโหลดคลังแม่แบบ…" />
        : shown.length === 0 ? (
          <EmptyState icon={<Icon value="i:shopping-bag" />} title={rows.length ? "ไม่พบแม่แบบที่ตรงกับคำค้น" : "เริ่มคลังแม่แบบใบแรก"}
            hint={rows.length ? "ลองเปลี่ยนคำค้นหรือเลือก “ทั้งหมด”" : canManage ? "กด “เพิ่มแม่แบบ” แล้วอัปโหลดรูปกระเป๋า" : "ทีมออกแบบยังไม่ได้เพิ่มแม่แบบ"}
            action={!rows.length && canManage ? { label: "เพิ่มแม่แบบ", onClick: () => setForm({ open: true, t: null }) } : undefined} />
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {shown.map((t) => (
              <button key={t.id} type="button" onClick={() => router.push(tplHref(t.id))} className="text-left rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md transition overflow-hidden flex flex-col">
                <div className="h-52 bg-white flex items-center justify-center overflow-hidden border-b border-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {t.image_key ? <img src={img(t.image_key, 480)} alt={t.name} loading="lazy" className="w-full h-full object-contain" /> : <Icon value="i:photo" className="text-3xl text-slate-300" />}
                </div>
                <div className="p-2.5">
                  <div className="text-[11px] font-mono text-slate-400">{t.code}</div>
                  <div className="text-[14px] font-medium text-slate-800 truncate">{t.name}</div>
                  <div className="text-[12px] text-slate-500 mt-0.5">{t.recipe_count ?? 0} สูตร{t.category ? ` · ${typeName(t.category)}` : ""}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      <TemplateFormModal open={form.open} initial={form.t} onClose={() => setForm({ open: false, t: null })} onSaved={(t) => { setForm({ open: false, t: null }); void load(); router.push(tplHref(t.id)); }} />
      <ChoicesManager open={choicesOpen} onClose={() => setChoicesOpen(false)} onChanged={() => undefined} />
    </div>
  );
}

export function TemplateView({ id }: { id: string }) {
  const toast = useToast();
  const router = useRouter();
  const canEdit = usePermission("design_library.edit");
  const canManage = usePermission("design_library.manage");
  const [data, setData] = useState<{ template: Template; recipes: RecipeCard[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [vector, setVector] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: "tpl" } | { kind: "recipe"; r: RecipeCard }>(null);
  const typeName = useBagTypes();

  const load = useCallback(async () => {
    setErr(null);
    try { setData(await api(`/api/design-library/bundle?template_id=${id}`)); } catch (e) { setErr((e as Error).message); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const newRecipe = async (from?: string) => {
    setBusy(true);
    try { const r = await api<{ id: string }>(`/api/design-library/actions`, { json: { action: "new_recipe", template_id: id, from_recipe_id: from } }); router.push(recipeHref(r.id)); }
    catch (e) { toast.error((e as Error).message); setBusy(false); }
  };
  const doDelete = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === "tpl") { await api(`/api/design-library/templates/${id}`, { method: "DELETE" }); toast.success("ลบแม่แบบแล้ว"); router.push(LIB_HREF); }
      else { await api(`/api/design-library/recipes/${confirm.r.id}`, { method: "DELETE" }); toast.success(`ลบสูตร #${confirm.r.seq} แล้ว`); void load(); }
    } catch (e) { toast.error((e as Error).message); }
    setConfirm(null);
  };

  if (err) return <div className="p-6"><ErrorState title="เปิดแม่แบบไม่สำเร็จ" hint={err} onRetry={() => void load()} /></div>;
  if (!data) return <div className="p-6"><LoadingState label="กำลังโหลดแม่แบบ…" /></div>;
  const t = data.template;
  const key = vector && t.vector_image_key ? t.vector_image_key : t.image_key;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <Header title={`${t.code} · ${t.name}`} sub={[typeName(t.category), t.description].filter(Boolean).join(" · ") || undefined} back={LIB_HREF}>
        {canManage && <button type="button" onClick={() => setForm(true)} className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 inline-flex items-center gap-1.5"><Icon value="i:edit" />แก้แม่แบบ</button>}
        {canManage && <button type="button" onClick={() => setConfirm({ kind: "tpl" })} className="h-9 px-3 text-sm rounded-lg border border-rose-200 text-rose-600 bg-white hover:bg-rose-50 inline-flex items-center gap-1.5"><Icon value="i:trash" />ลบ</button>}
        {canEdit && <button type="button" disabled={busy} onClick={() => void newRecipe()} className="h-9 px-3 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1.5"><Icon value="i:plus" />สร้างสูตรใหม่</button>}
      </Header>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200 bg-white p-3 self-start">
          {t.vector_image_key && (
            <div className="inline-flex mb-2 rounded-lg border border-slate-200 overflow-hidden">
              <button type="button" onClick={() => setVector(false)} className={`h-8 px-3 text-[13px] ${!vector ? "bg-indigo-50 text-indigo-700" : "text-slate-600"}`}>รูปจริง</button>
              <button type="button" onClick={() => setVector(true)} className={`h-8 px-3 text-[13px] border-l border-slate-200 ${vector ? "bg-indigo-50 text-indigo-700" : "text-slate-600"}`}>Vector</button>
            </div>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {key ? <img src={img(key, 900)} alt={t.name} className="w-full object-contain" /> : <div className="h-60 bg-slate-50" />}
        </div>
        <div>
          <div className="text-[13px] text-slate-500 mb-2">สูตรทั้งหมด {data.recipes.length} สูตร</div>
          {data.recipes.length === 0 ? (
            <EmptyState icon={<Icon value="i:sparkles" />} title="ยังไม่มีสูตรของแม่แบบนี้" hint="กด “สร้างสูตรใหม่” แล้วกดบนรูปเพื่อเลือกว่าจะเปลี่ยนอะไร" />
          ) : (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
              {data.recipes.map((r) => (
                <div key={r.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
                  <Link href={recipeHref(r.id)} className="block h-44 bg-white border-b border-slate-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img(r.cover_key ?? t.image_key, 420)} alt="" loading="lazy" className="w-full h-full object-contain" />
                  </Link>
                  <div className="p-2.5 flex-1">
                    <Link href={recipeHref(r.id)} className="text-[14px] font-medium text-slate-800 hover:text-indigo-700">สูตร #{r.seq}{r.name ? ` · ${r.name}` : ""}</Link>
                    <div className="text-[12px] text-slate-500">{r.pin_count} จุด · {r.cover_key ? "มีรูปจาก GPT" : "ยังไม่มีรูปจาก GPT"}</div>
                    <div className="text-[11px] text-slate-400">แก้ล่าสุด {thaiDate(r.updated_at)}{r.updated_by_name ? ` · ${r.updated_by_name}` : ""}</div>
                  </div>
                  {canEdit && (
                    <div className="flex border-t border-slate-100 text-[12px]">
                      <button type="button" disabled={busy} onClick={() => void newRecipe(r.id)} className="flex-1 h-8 hover:bg-slate-50 text-slate-600">คัดลอกเป็นสูตรใหม่</button>
                      <button type="button" onClick={() => setConfirm({ kind: "recipe", r })} className="h-8 px-3 border-l border-slate-100 hover:bg-rose-50 text-rose-600" aria-label="ลบสูตร"><Icon value="i:trash" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <TemplateFormModal open={form} initial={t} onClose={() => setForm(false)} onSaved={() => { setForm(false); void load(); }} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => void doDelete()} variant="danger" confirmText="ลบ"
        title={confirm?.kind === "tpl" ? `ลบแม่แบบ ${t.code}?` : `ลบสูตร #${confirm?.kind === "recipe" ? confirm.r.seq : ""}?`}
        message={confirm?.kind === "tpl" ? "แม่แบบจะหายจากคลัง (สูตรข้างในหายไปด้วย) — กู้คืนได้จากหน้า “โมดูลทั้งหมด”" : "สูตรนี้จะหายจากรายการ — กู้คืนได้จากหน้า “โมดูลทั้งหมด”"} />
    </div>
  );
}
