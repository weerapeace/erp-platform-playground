import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// ---- Types ----

export type SearchHit = {
  entity_type: "page" | "guide" | "product" | "supplier" | "pr" | "user" | "asset";
  id:          string;
  label:       string;
  sublabel:    string | null;
  link_url:    string;
  score:       number;
};

export type GlobalSearchResponse = {
  data:  SearchHit[];
  error: string | null;
};

// ---- helpers ----

const norm = (s: unknown) => String(s ?? "").toLowerCase().trim();
/** แยกคำค้นเป็นคำ ๆ (เว้นวรรค) — ทุกคำต้องเจอ (AND) */
const tokensOf = (q: string) => norm(q).split(/\s+/).filter(Boolean);

type MenuRowLite = {
  id: string; label: string; href: string; section: string | null; icon: string | null;
  app_keys: string[] | null; permission_key: string | null; is_active: boolean;
  search_keywords?: string[] | null;   // คำค้นเพิ่ม/คำพ้อง (ตั้งที่ /admin/menu)
};
type AppGroupLite = { key: string; label: string; permission_key: string | null; is_active: boolean };

// cache ทะเบียนเมนู/แอป สั้น ๆ (60 วิ) — ตารางเล็ก (~200 แถว) แต่ค้นถี่ (ทุกครั้งที่พิมพ์)
let menuCache: { at: number; rows: MenuRowLite[]; apps: AppGroupLite[] } | null = null;
const MENU_TTL = 60_000;

async function loadMenuRegistry() {
  if (menuCache && Date.now() - menuCache.at < MENU_TTL) return menuCache;
  const admin = supabaseAdmin();
  const [{ data: rows }, { data: apps }] = await Promise.all([
    admin.from("erp_menu_items").select("*").eq("is_active", true),
    admin.from("erp_app_groups").select("key, label, permission_key, is_active"),
  ]);
  menuCache = { at: Date.now(), rows: (rows ?? []) as MenuRowLite[], apps: (apps ?? []) as AppGroupLite[] };
  return menuCache;
}

type CanFn = (key: string | null | undefined) => boolean;

/** สิทธิ์ของคนที่ค้น — ใช้กรองเมนู/แอปที่เขาเห็นได้เท่านั้น (admin = เห็นหมด) */
async function loadMyAccess(sb: ReturnType<typeof supabaseFromRequest>, userId: string): Promise<{ can: CanFn }> {
  const [{ data: perms }, { data: prof }] = await Promise.all([
    sb.rpc("erp_my_permissions"),
    supabaseAdmin().from("user_profiles").select("role").eq("id", userId).maybeSingle(),
  ]);
  const isAdmin = (prof as { role?: string } | null)?.role === "admin";
  const set = new Set<string>(Array.isArray(perms) ? (perms as string[]) : []);
  return { can: (key) => !key || isAdmin || set.has(key) };
}

// ---- 📄 หน้า/เมนู — จากทะเบียนเมนูกลาง (erp_menu_items) ----

async function searchPages(q: string, can: CanFn, limit: number): Promise<SearchHit[]> {
  const toks = tokensOf(q);
  if (toks.length === 0) return [];
  const { rows, apps } = await loadMenuRegistry();
  const appByKey = new Map(apps.map((a) => [a.key, a]));
  const full = norm(q);

  const hits: SearchHit[] = [];
  const seenHref = new Set<string>();
  for (const r of rows) {
    if (!r.is_active || !r.href || !r.label) continue;
    if (!can(r.permission_key)) continue;
    // แอปที่เมนูนี้สังกัด + คนนี้เข้าได้ (ถ้าเมนูไม่สังกัดแอปไหน = เห็นได้ถ้าสิทธิ์เมนูผ่าน)
    const myApps = (r.app_keys ?? []).map((k) => appByKey.get(k)).filter((a): a is AppGroupLite => !!a && a.is_active && can(a.permission_key));
    if ((r.app_keys ?? []).length > 0 && myApps.length === 0) continue;
    if (seenHref.has(r.href)) continue;

    const label = norm(r.label);
    const section = norm(r.section);
    const keywords = (r.search_keywords ?? []).map(norm).filter(Boolean);
    const appLabels = myApps.map((a) => norm(a.label));
    let hrefText = r.href.toLowerCase();
    try { hrefText = decodeURIComponent(r.href).toLowerCase(); } catch { /* href เพี้ยน ใช้ดิบ */ }

    // ทุกคำต้องเจอที่ไหนสักแห่ง (ชื่อ / คำพ้อง / หมวด / ชื่อแอป / ลิงก์)
    const hay = [label, section, ...keywords, ...appLabels, hrefText];
    if (!toks.every((t) => hay.some((h) => h.includes(t)))) continue;

    let score = 0; let via: string | null = null;
    const kwExact = keywords.find((k) => k === full);
    const kwPart  = keywords.find((k) => k.includes(full) || full.includes(k));
    const kwToks  = keywords.find((k) => toks.some((t) => k.includes(t)));
    if (label.startsWith(full)) score = 100;
    else if (label.includes(full)) score = 85;
    else if (kwExact) { score = 80; via = kwExact; }
    else if (kwPart)  { score = 70; via = kwPart; }
    else if (toks.every((t) => label.includes(t))) score = 65;
    else if (toks.every((t) => keywords.some((k) => k.includes(t)))) { score = 60; via = kwToks ?? null; }
    else if (appLabels.some((a) => a.includes(full)) || section.includes(full)) score = 40;
    else score = 30;

    seenHref.add(r.href);
    const where = [myApps.map((a) => a.label).join(" / "), r.section].filter(Boolean).join(" · ");
    hits.push({
      entity_type: "page", id: r.id, label: `${r.icon && !/^https?:|^\//.test(r.icon) ? `${r.icon} ` : ""}${r.label}`,
      sublabel: (via ? `${where} · ตรงกับคำค้น "${via}"` : where) || null,
      link_url: r.href, score,
    });
  }
  hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label, "th"));
  return hits.slice(0, limit);
}

// ---- 📖 วิธีใช้งาน — คู่มือทีละขั้น (erp_help_guides + steps) ----

type GuideRow = { id: string; title: string; description: string | null; category: string | null; icon: string | null };
type StepRow  = { guide_id: string; title: string | null; body: string | null; step_no: number };

async function searchGuides(q: string, limit: number): Promise<SearchHit[]> {
  const toks = tokensOf(q);
  if (toks.length === 0) return [];
  const admin = supabaseAdmin();
  const { data: guides } = await admin.from("erp_help_guides").select("id, title, description, category, icon").eq("is_active", true);
  const list = (guides ?? []) as GuideRow[];
  if (list.length === 0) return [];
  const { data: steps } = await admin.from("erp_help_guide_steps").select("guide_id, title, body, step_no").in("guide_id", list.map((g) => g.id));
  const stepsBy = new Map<string, StepRow[]>();
  for (const s of (steps ?? []) as StepRow[]) { const a = stepsBy.get(s.guide_id) ?? []; a.push(s); stepsBy.set(s.guide_id, a); }
  const full = norm(q);

  const hits: SearchHit[] = [];
  for (const g of list) {
    const title = norm(g.title), desc = norm(g.description), cat = norm(g.category);
    const gSteps = (stepsBy.get(g.id) ?? []).sort((a, b) => a.step_no - b.step_no);
    const stepHay = gSteps.map((s) => ({ s, text: `${norm(s.title)} ${norm(s.body)}` }));
    const hay = [title, desc, cat, ...stepHay.map((x) => x.text)];
    if (!toks.every((t) => hay.some((h) => h.includes(t)))) continue;

    let score = 0; let matchedStep: StepRow | null = null;
    if (title.startsWith(full)) score = 95;
    else if (title.includes(full)) score = 85;
    else if (toks.every((t) => title.includes(t))) score = 70;
    else if (desc.includes(full) || cat.includes(full)) score = 55;
    else {
      // เจอในเนื้อหาขั้นตอน → บอกด้วยว่าขั้นไหน
      matchedStep = stepHay.find((x) => toks.every((t) => x.text.includes(t)))?.s ?? stepHay.find((x) => x.text.includes(toks[0]))?.s ?? null;
      score = 35;
    }

    const base = g.description || `${gSteps.length} ขั้นตอน`;
    hits.push({
      entity_type: "guide", id: g.id, label: `${g.icon ? `${g.icon} ` : ""}${g.title}`,
      sublabel: matchedStep ? `${base} · ขั้นที่ ${matchedStep.step_no}: ${matchedStep.title ?? ""}` : base,
      link_url: `/master/help-guides?guide=${g.id}`, score,
    });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

// ---- GET ?q=...&limit=8 ----

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q     = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") ?? "8")));

  if (!q) return NextResponse.json({ data: [], error: null } satisfies GlobalSearchResponse);

  const sb = supabaseFromRequest(request);
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ data: [], error: "กรุณาเข้าสู่ระบบ" } satisfies GlobalSearchResponse, { status: 401 });

  // ยิงพร้อมกัน: สิทธิ์ของฉัน (ไว้กรองเมนู) + ข้อมูลธุรกิจ (RPC เดิม เช็คสิทธิ์ใน DB) + คู่มือ
  const [access, rpc, guideHits] = await Promise.all([
    loadMyAccess(sb, auth.user.id).catch((): { can: CanFn } => ({ can: (k) => !k })),
    sb.rpc("erp_global_search", { p_query: q, p_limit: limit }),
    searchGuides(q, 3).catch(() => [] as SearchHit[]),
  ]);
  if (rpc.error) {
    return NextResponse.json({ data: [], error: rpc.error.message } satisfies GlobalSearchResponse, { status: 500 });
  }
  const dataHits = (rpc.data as SearchHit[]) ?? [];

  // 📄 หน้า/เมนู — เห็นเฉพาะหน้าที่คนนี้มีสิทธิ์เข้า (สิทธิ์เมนู + สิทธิ์แอป)
  let pageHits: SearchHit[] = [];
  try { pageHits = await searchPages(q, access.can, 6); } catch { /* ค้นหน้าพังไม่ให้กระทบผลอื่น */ }

  // 🖼️ ไฟล์/artwork จากคลังกลาง (assets RLS deny-all → ใช้ admin แต่เช็ค auth แล้วข้างบน)
  let assetHits: SearchHit[] = [];
  try {
    const admin = supabaseAdmin();
    let aq = admin.from("assets").select("id, title, file_name, source").eq("status", "active");
    for (const raw of q.split(/\s+/)) {
      const t = raw.replace(/[,()%*]/g, " ").trim();
      if (t) aq = aq.or(`title.ilike.%${t}%,file_name.ilike.%${t}%,keywords.ilike.%${t}%`);
    }
    const { data: assets } = await aq.limit(6);
    assetHits = (assets ?? []).map((a) => {
      const r = a as { id: string; title: string | null; file_name: string; source: string };
      return {
        entity_type: "asset", id: r.id, label: r.title || r.file_name,
        sublabel: r.source === "artwork" ? "Artwork" : r.source === "odoo_product" ? "รูปสินค้า" : "ไฟล์ในคลัง",
        link_url: "/master/assets", score: 0,
      };
    });
  } catch { /* ไม่ให้ค้นไฟล์พังกระทบผลหลัก */ }

  // ลำดับกลุ่ม: หน้า/เมนู → วิธีใช้งาน → ข้อมูล (สินค้า/ร้าน/PR/ผู้ใช้) → ไฟล์
  const hits = [...pageHits, ...guideHits, ...dataHits, ...assetHits];
  return NextResponse.json({ data: hits, error: null } satisfies GlobalSearchResponse);
}
