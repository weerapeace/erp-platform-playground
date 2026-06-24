import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// ---- Types ----

export type SearchHit = {
  entity_type: "product" | "supplier" | "pr" | "user" | "asset";
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

// ---- GET ?q=...&limit=8 ----

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q     = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(20, Math.max(1, parseInt(searchParams.get("limit") ?? "8")));

  if (!q) return NextResponse.json({ data: [], error: null } satisfies GlobalSearchResponse);

  const sb = supabaseFromRequest(request);
  const { data, error } = await sb.rpc("erp_global_search", { p_query: q, p_limit: limit });
  if (error) {
    return NextResponse.json({ data: [], error: error.message } satisfies GlobalSearchResponse, { status: 500 });
  }
  let hits = (data as SearchHit[]) ?? [];

  // + ค้นไฟล์/artwork จากคลังกลาง (assets RLS deny-all → ใช้ admin แต่เช็ค auth ก่อน)
  try {
    const { data: auth } = await sb.auth.getUser();
    if (auth.user) {
      const admin = supabaseAdmin();
      let aq = admin.from("assets").select("id, title, file_name, source").eq("status", "active");
      for (const raw of q.split(/\s+/)) {
        const t = raw.replace(/[,()%*]/g, " ").trim();
        if (t) aq = aq.or(`title.ilike.%${t}%,file_name.ilike.%${t}%,keywords.ilike.%${t}%`);
      }
      const { data: assets } = await aq.limit(6);
      const aHits: SearchHit[] = (assets ?? []).map((a) => {
        const r = a as { id: string; title: string | null; file_name: string; source: string };
        return {
          entity_type: "asset", id: r.id, label: r.title || r.file_name,
          sublabel: r.source === "artwork" ? "Artwork" : r.source === "odoo_product" ? "รูปสินค้า" : "ไฟล์ในคลัง",
          link_url: "/master/assets", score: 0,
        };
      });
      hits = [...hits, ...aHits];
    }
  } catch { /* ไม่ให้ค้นไฟล์พังกระทบผลหลัก */ }

  return NextResponse.json({ data: hits, error: null } satisfies GlobalSearchResponse);
}
