/**
 * Link Preview (ของกลาง) — /api/link-preview?url=https://...
 * ดึง OG/meta ของหน้าเว็บ → { title, description, image, site, url }
 * ใช้กับการแนบลิงก์แบบมีพรีวิว (คอนเทนต์ Social, ฯลฯ)
 *
 * ความปลอดภัย: รับเฉพาะ http/https · ตัดเวลา 6 วิ · อ่านสูงสุด ~512KB · ไม่ส่ง cookie
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function pickMeta(html: string, names: string[]): string | null {
  for (const name of names) {
    // <meta property="og:title" content="...">  หรือ name="..." (สลับลำดับ attribute ได้)
    const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, "i");
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, "i");
    const m = html.match(re) ?? html.match(re2);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return null;
}
function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/gi, "'").replace(/&nbsp;/g, " ");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const raw = (new URL(request.url).searchParams.get("url") ?? "").trim();
  if (!raw) return NextResponse.json({ error: "ต้องระบุ url" }, { status: 400 });

  let target: URL;
  try { target = new URL(raw); } catch { return NextResponse.json({ error: "ลิงก์ไม่ถูกต้อง" }, { status: 400 }); }
  if (target.protocol !== "http:" && target.protocol !== "https:")
    return NextResponse.json({ error: "รองรับเฉพาะ http/https" }, { status: 400 });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(target.toString(), {
      signal: ctrl.signal, redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ERP-LinkPreview/1.0)", "Accept": "text/html,application/xhtml+xml" },
    });
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("text/html")) {
      // ไม่ใช่หน้า HTML — คืนแค่ข้อมูลพื้นฐาน (เช่น ลิงก์รูป/ไฟล์)
      return NextResponse.json({ data: { url: target.toString(), title: target.hostname, description: null, image: ctype.startsWith("image/") ? target.toString() : null, site: target.hostname }, error: null });
    }
    // อ่านแบบจำกัดขนาด (พอสำหรับ <head>)
    const reader = res.body?.getReader();
    let html = ""; const dec = new TextDecoder();
    if (reader) {
      let total = 0;
      while (total < 512 * 1024) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength; html += dec.decode(value, { stream: true });
        if (/<\/head>/i.test(html)) break;   // ได้ <head> ครบแล้ว พอ
      }
      try { await reader.cancel(); } catch { /* noop */ }
    } else {
      html = (await res.text()).slice(0, 512 * 1024);
    }

    const title = pickMeta(html, ["og:title", "twitter:title"]) ?? (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ? decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)![1].trim()) : null);
    const description = pickMeta(html, ["og:description", "twitter:description", "description"]);
    let image = pickMeta(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]);
    const site = pickMeta(html, ["og:site_name"]) ?? target.hostname;
    if (image && !/^https?:\/\//i.test(image)) { try { image = new URL(image, target).toString(); } catch { image = null; } }

    return NextResponse.json({ data: { url: target.toString(), title: title || target.hostname, description, image, site }, error: null });
  } catch (e) {
    const msg = (e as Error).name === "AbortError" ? "ดึงข้อมูลลิงก์หมดเวลา" : "ดึงข้อมูลลิงก์ไม่สำเร็จ";
    return NextResponse.json({ data: { url: target.toString(), title: target.hostname, description: null, image: null, site: target.hostname }, error: msg });
  } finally { clearTimeout(timer); }
}
