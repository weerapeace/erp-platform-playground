// ============================================================
// file-types — ทะเบียน "ประเภทไฟล์" กลาง + ไอคอนไฟล์ (JPG · CR2 · PSD · AI · PDF ...)
//
// ไอคอน = รูปกระดาษพับมุม + แถบสีบอกนามสกุล + รูปเล็กตามกลุ่ม (รูป/กล้อง/งานออกแบบ/เอกสาร ...)
// วาดเป็น SVG ข้อความล้วน → ใช้ได้ทั้งบนจอ (components/file-type-icon) และตอนบันทึกเป็นรูป (lib/html-to-png)
// ไม่มี React — เทสต์ได้ (lib/__tests__/file-types.test.ts)
// ใช้ที่: กล่อง "ไฟล์" ในกระดาน flowchart กลาง · ต่อไป: ไฟล์แนบ/คลังไฟล์/รายการไฟล์ Drive (ตอนนี้ยังใช้อีโมจิของใครของมัน)
// ============================================================

export const FILE_TYPE_GROUPS = [
  "image", "raw", "design", "doc", "sheet", "slides", "video", "audio", "archive", "pattern", "font", "model3d", "code", "other",
] as const;
export type FileTypeGroup = (typeof FILE_TYPE_GROUPS)[number];

/** กลุ่ม: ชื่อ + สีประจำกลุ่ม (เส้น/แถบ = color · พื้นกระดาษ = fill) */
export const FILE_GROUP_META: Record<FileTypeGroup, { th: string; en: string; color: string; fill: string }> = {
  image:   { th: "รูปภาพ",            en: "Images",        color: "#0d9488", fill: "#f0fdfa" },
  raw:     { th: "ไฟล์ดิบจากกล้อง (RAW)", en: "Camera RAW",  color: "#4f46e5", fill: "#eef2ff" },
  design:  { th: "งานออกแบบ",          en: "Design",        color: "#db2777", fill: "#fdf2f8" },
  doc:     { th: "เอกสาร",             en: "Documents",     color: "#475569", fill: "#f8fafc" },
  sheet:   { th: "ตาราง",              en: "Spreadsheets",  color: "#16a34a", fill: "#f0fdf4" },
  slides:  { th: "สไลด์",              en: "Slides",        color: "#ea580c", fill: "#fff7ed" },
  video:   { th: "วิดีโอ / ตัดต่อ",      en: "Video",         color: "#9333ea", fill: "#faf5ff" },
  audio:   { th: "เสียง",              en: "Audio",         color: "#0891b2", fill: "#ecfeff" },
  archive: { th: "ไฟล์บีบอัด",          en: "Archives",      color: "#a16207", fill: "#fefce8" },
  pattern: { th: "แพตเทิร์น / เครื่องจักร", en: "Pattern / machine", color: "#0369a1", fill: "#f0f9ff" },
  font:    { th: "ฟอนต์",              en: "Fonts",         color: "#334155", fill: "#f1f5f9" },
  model3d: { th: "3 มิติ",             en: "3D",            color: "#be123c", fill: "#fff1f2" },
  code:    { th: "ข้อมูล / เว็บ",        en: "Data / web",    color: "#1e293b", fill: "#f8fafc" },
  other:   { th: "อื่น ๆ",              en: "Other",         color: "#64748b", fill: "#f8fafc" },
};

export type FileTypeDef = { ext: string; group: FileTypeGroup; th: string; en: string; color?: string; fill?: string };

/** นามสกุลที่รู้จัก (เรียงตามกลุ่ม · ตัวที่ใช้บ่อยมาก่อน) — color/fill = สีเฉพาะตัว (ไม่ใส่ = สีกลุ่ม) */
export const FILE_TYPES: FileTypeDef[] = [
  // รูปภาพ
  { ext: "jpg",  group: "image", th: "รูปทั่วไป (JPG/JPEG)", en: "Photo (JPG/JPEG)" },
  { ext: "png",  group: "image", th: "รูปพื้นใส (PNG)", en: "Image with transparency" },
  { ext: "webp", group: "image", th: "รูปสำหรับเว็บ (ไฟล์เล็ก)", en: "Web image (small)" },
  { ext: "gif",  group: "image", th: "รูปเคลื่อนไหว", en: "Animated image" },
  { ext: "heic", group: "image", th: "รูปจาก iPhone", en: "iPhone photo" },
  { ext: "tif",  group: "image", th: "รูปคุณภาพสูงสำหรับพิมพ์ (TIFF)", en: "High-quality print image (TIFF)" },
  { ext: "bmp",  group: "image", th: "รูปแบบเก่า (BMP)", en: "Bitmap" },
  // RAW กล้อง
  { ext: "cr2",  group: "raw", th: "ไฟล์ดิบกล้อง Canon", en: "Canon RAW" },
  { ext: "cr3",  group: "raw", th: "ไฟล์ดิบกล้อง Canon (รุ่นใหม่)", en: "Canon RAW (new)" },
  { ext: "nef",  group: "raw", th: "ไฟล์ดิบกล้อง Nikon", en: "Nikon RAW" },
  { ext: "arw",  group: "raw", th: "ไฟล์ดิบกล้อง Sony", en: "Sony RAW" },
  { ext: "raf",  group: "raw", th: "ไฟล์ดิบกล้อง Fujifilm", en: "Fujifilm RAW" },
  { ext: "dng",  group: "raw", th: "ไฟล์ดิบมาตรฐานกลาง (DNG)", en: "Universal RAW (DNG)" },
  { ext: "orf",  group: "raw", th: "ไฟล์ดิบกล้อง Olympus", en: "Olympus RAW" },
  { ext: "rw2",  group: "raw", th: "ไฟล์ดิบกล้อง Panasonic", en: "Panasonic RAW" },
  // งานออกแบบ
  { ext: "psd",  group: "design", th: "Photoshop", en: "Photoshop", color: "#1d6fd6", fill: "#eff6ff" },
  { ext: "psb",  group: "design", th: "Photoshop ไฟล์ใหญ่", en: "Photoshop large", color: "#1d6fd6", fill: "#eff6ff" },
  { ext: "ai",   group: "design", th: "Illustrator (ลายเส้น/โลโก้)", en: "Illustrator", color: "#e8710a", fill: "#fff7ed" },
  { ext: "eps",  group: "design", th: "ลายเส้นสำหรับโรงพิมพ์ (EPS)", en: "Vector for print (EPS)", color: "#e8710a", fill: "#fff7ed" },
  { ext: "svg",  group: "design", th: "ลายเส้นสำหรับเว็บ (SVG)", en: "Vector for web (SVG)", color: "#d97706", fill: "#fffbeb" },
  { ext: "indd", group: "design", th: "InDesign (จัดหน้า)", en: "InDesign", color: "#d6336c", fill: "#fff1f2" },
  { ext: "cdr",  group: "design", th: "CorelDRAW", en: "CorelDRAW", color: "#15803d", fill: "#f0fdf4" },
  { ext: "fig",  group: "design", th: "Figma", en: "Figma", color: "#7c3aed", fill: "#f5f3ff" },
  { ext: "xd",   group: "design", th: "Adobe XD", en: "Adobe XD", color: "#c026d3", fill: "#fdf4ff" },
  { ext: "sketch", group: "design", th: "Sketch", en: "Sketch", color: "#d97706", fill: "#fffbeb" },
  // เอกสาร
  { ext: "pdf",  group: "doc", th: "PDF (ส่งพิมพ์/ส่งลูกค้า)", en: "PDF", color: "#dc2626", fill: "#fef2f2" },
  { ext: "docx", group: "doc", th: "Word", en: "Word", color: "#2563eb", fill: "#eff6ff" },
  { ext: "doc",  group: "doc", th: "Word แบบเก่า", en: "Word (old)", color: "#2563eb", fill: "#eff6ff" },
  { ext: "txt",  group: "doc", th: "ข้อความล้วน", en: "Plain text" },
  { ext: "rtf",  group: "doc", th: "ข้อความจัดรูปแบบ (RTF)", en: "Rich text" },
  // ตาราง
  { ext: "xlsx", group: "sheet", th: "Excel", en: "Excel" },
  { ext: "xls",  group: "sheet", th: "Excel แบบเก่า", en: "Excel (old)" },
  { ext: "csv",  group: "sheet", th: "ตารางข้อความ (CSV)", en: "CSV" },
  // สไลด์
  { ext: "pptx", group: "slides", th: "PowerPoint", en: "PowerPoint" },
  { ext: "ppt",  group: "slides", th: "PowerPoint แบบเก่า", en: "PowerPoint (old)" },
  { ext: "key",  group: "slides", th: "Keynote", en: "Keynote" },
  // วิดีโอ
  { ext: "mp4",  group: "video", th: "วิดีโอทั่วไป", en: "Video" },
  { ext: "mov",  group: "video", th: "วิดีโอจาก iPhone/กล้อง", en: "iPhone/camera video" },
  { ext: "avi",  group: "video", th: "วิดีโอแบบเก่า", en: "Video (old)" },
  { ext: "mkv",  group: "video", th: "วิดีโอ MKV", en: "MKV video" },
  { ext: "webm", group: "video", th: "วิดีโอสำหรับเว็บ", en: "Web video" },
  { ext: "prproj", group: "video", th: "งานตัดต่อ Premiere", en: "Premiere project", color: "#6d28d9", fill: "#f5f3ff" },
  { ext: "aep",  group: "video", th: "งาน After Effects", en: "After Effects project", color: "#6d28d9", fill: "#f5f3ff" },
  // เสียง
  { ext: "mp3",  group: "audio", th: "เสียง/เพลง", en: "Audio" },
  { ext: "wav",  group: "audio", th: "เสียงคุณภาพสูง", en: "High-quality audio" },
  { ext: "m4a",  group: "audio", th: "เสียงจาก iPhone", en: "iPhone audio" },
  // บีบอัด
  { ext: "zip",  group: "archive", th: "ไฟล์รวม/บีบอัด", en: "Zip archive" },
  { ext: "rar",  group: "archive", th: "ไฟล์บีบอัด RAR", en: "RAR archive" },
  { ext: "7z",   group: "archive", th: "ไฟล์บีบอัด 7-Zip", en: "7-Zip archive" },
  // แพตเทิร์น / เครื่องจักร
  { ext: "dxf",  group: "pattern", th: "แพตเทิร์น / แบบตัด (DXF)", en: "Pattern / cut file (DXF)" },
  { ext: "dwg",  group: "pattern", th: "แบบ AutoCAD", en: "AutoCAD drawing" },
  { ext: "plt",  group: "pattern", th: "ไฟล์ส่งเครื่องพล็อต/ตัด", en: "Plotter / cutter file" },
  { ext: "sew",  group: "pattern", th: "โปรแกรมจักรคอม (SUPREME)", en: "Pattern sewer program" },
  { ext: "dst",  group: "pattern", th: "ไฟล์ลายปัก (Tajima)", en: "Embroidery (Tajima)" },
  { ext: "pes",  group: "pattern", th: "ไฟล์ลายปัก (Brother)", en: "Embroidery (Brother)" },
  // ฟอนต์
  { ext: "ttf",  group: "font", th: "ฟอนต์", en: "Font" },
  { ext: "otf",  group: "font", th: "ฟอนต์ (OpenType)", en: "Font (OpenType)" },
  // 3 มิติ
  { ext: "obj",  group: "model3d", th: "โมเดล 3 มิติ", en: "3D model" },
  { ext: "fbx",  group: "model3d", th: "โมเดล 3 มิติ (FBX)", en: "3D model (FBX)" },
  { ext: "stl",  group: "model3d", th: "ไฟล์พิมพ์ 3 มิติ", en: "3D print file" },
  { ext: "glb",  group: "model3d", th: "โมเดล 3 มิติสำหรับเว็บ", en: "Web 3D model" },
  { ext: "blend", group: "model3d", th: "งาน Blender", en: "Blender project" },
  // ข้อมูล / เว็บ
  { ext: "json", group: "code", th: "ข้อมูลระบบ (JSON)", en: "Data (JSON)" },
  { ext: "html", group: "code", th: "หน้าเว็บ", en: "Web page" },
  { ext: "xml",  group: "code", th: "ข้อมูล XML", en: "XML data" },
];

/** ชื่อเรียกอื่นที่หมายถึงตัวเดียวกัน */
const ALIAS: Record<string, string> = { jpeg: "jpg", jpe: "jpg", tiff: "tif", htm: "html", mpeg: "mp4", m4v: "mp4", aiff: "wav", psdt: "psd" };
const BY_EXT = new Map(FILE_TYPES.map((d) => [d.ext, d]));

/** นามสกุลที่ปลอดภัย (ตัวเล็ก · a-z 0-9 · ยาวไม่เกิน 8) จากชื่อไฟล์ / ".PSD" / "psd" · ไม่ได้ = "" */
export function normalizeExt(nameOrExt: string): string {
  const s = String(nameOrExt ?? "").trim().toLowerCase();
  const raw = s.includes(".") ? s.slice(s.lastIndexOf(".") + 1) : s;
  const clean = raw.replace(/[^a-z0-9]/g, "").slice(0, 8);
  return ALIAS[clean] ?? clean;
}

/** ข้อมูลประเภทไฟล์ (ไม่รู้จัก = กลุ่ม "อื่น ๆ" สีเทา แต่ยังโชว์นามสกุลตามที่พิมพ์) */
export function fileTypeOf(nameOrExt: string): FileTypeDef & { color: string; fill: string; known: boolean } {
  const ext = normalizeExt(nameOrExt);
  const d = BY_EXT.get(ext);
  const g = FILE_GROUP_META[d?.group ?? "other"];
  return d
    ? { ...d, color: d.color ?? g.color, fill: d.fill ?? g.fill, known: true }
    : { ext, group: "other", th: ext ? `ไฟล์ .${ext}` : "ไฟล์", en: ext ? `.${ext} file` : "File", color: g.color, fill: g.fill, known: false };
}

/** รายการนามสกุล → ไม่ซ้ำ · ทำความสะอาด · จำกัดจำนวน */
export function cleanExtList(list: unknown, max = 12): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const v of list) {
    if (typeof v !== "string") continue;
    const e = normalizeExt(v);
    if (e && !out.includes(e)) out.push(e);
    if (out.length >= max) break;
  }
  return out;
}

/** ชื่อกลุ่มที่เหมาะเป็นชื่อกล่อง: ทุกตัวอยู่กลุ่มเดียวกัน = ชื่อกลุ่ม · ปน = "ไฟล์" */
export function suggestFileLabel(exts: string[], t: (th: string, en: string) => string): string {
  const groups = new Set(exts.map((e) => fileTypeOf(e).group));
  if (groups.size === 1) { const g = FILE_GROUP_META[[...groups][0]]; return t(g.th, g.en); }
  return t("ไฟล์", "Files");
}

// ── ไอคอน (SVG ข้อความ) ──────────────────────────────────────

/** รูปเล็กกลางกระดาษตามกลุ่ม (พิกัดใน viewBox 40×48 · พื้นที่ประมาณ y 8–24) */
function glyph(g: FileTypeGroup, c: string): string {
  const s = `fill="none" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"`;
  switch (g) {
    case "image":   return `<circle cx="15.5" cy="11.5" r="2.2" fill="${c}"/><path d="M11 23 L17 16 L20.5 19.5 L24 15 L30 23 Z" fill="${c}" opacity=".75"/>`;
    case "raw":     return `<rect x="11.5" y="12" width="19" height="11.5" rx="2.2" ${s}/><path d="M15.5 12 L17 9.5 H22 L23.5 12" ${s}/><circle cx="21" cy="17.7" r="3.2" ${s}/>`;
    case "design":  return `<path d="M21 8.5 L27.5 18.5 L21 24 L14.5 18.5 Z" ${s}/><path d="M21 8.5 V16.5" ${s}/><circle cx="21" cy="18" r="1.5" fill="${c}"/>`;
    case "doc":     return `<path d="M12.5 11 H27 M12.5 15 H29 M12.5 19 H24" ${s}/>`;
    case "sheet":   return `<rect x="12" y="10" width="18" height="13.5" rx="1.5" ${s}/><path d="M12 14.5 H30 M12 19 H30 M18.5 10 V23.5" ${s}/>`;
    case "slides":  return `<rect x="11.5" y="10" width="19" height="11" rx="1.5" ${s}/><path d="M21 21 V24 M17.5 24 H24.5" ${s}/><path d="M15.5 17.5 V15.5 M19 17.5 V13.5 M22.5 17.5 V14.5 M26 17.5 V12.5" ${s}/>`;
    case "video":   return `<rect x="11.5" y="10.5" width="19" height="13" rx="2.2" ${s}/><path d="M18.5 13.7 L24.5 17 L18.5 20.3 Z" fill="${c}"/>`;
    case "audio":   return `<path d="M18 21.5 V11 L27 9.2 V19.5" ${s}/><circle cx="15.8" cy="21.5" r="2.4" fill="${c}"/><circle cx="24.8" cy="19.6" r="2.4" fill="${c}"/>`;
    case "archive": return `<rect x="19.5" y="7.5" width="3" height="2.6" fill="${c}"/><rect x="22.5" y="10.1" width="3" height="2.6" fill="${c}"/><rect x="19.5" y="12.7" width="3" height="2.6" fill="${c}"/><rect x="22.5" y="15.3" width="3" height="2.6" fill="${c}"/><rect x="18.5" y="18.5" width="8" height="5.5" rx="1.2" ${s}/>`;
    case "pattern": return `<path d="M12.5 23.5 V10 L28 23.5 Z" ${s}/><path d="M12.5 14 H15 M12.5 18 H15.5 M16.5 23.5 V21 M20.5 23.5 V21.5" ${s}/>`;
    case "font":    return `<text x="21" y="22" text-anchor="middle" font-family="Georgia,'Times New Roman',serif" font-size="13" font-weight="700" fill="${c}">Aa</text>`;
    case "model3d": return `<path d="M21 8.5 L28 12.5 V20 L21 24 L14 20 V12.5 Z" ${s}/><path d="M14 12.5 L21 16.5 L28 12.5 M21 16.5 V24" ${s}/>`;
    case "code":    return `<path d="M16 12 L11.5 16.5 L16 21 M26 12 L30.5 16.5 L26 21 M22.5 10.5 L19.5 22.5" ${s}/>`;
    default:        return `<circle cx="16" cy="16.5" r="1.4" fill="${c}"/><circle cx="21" cy="16.5" r="1.4" fill="${c}"/><circle cx="26" cy="16.5" r="1.4" fill="${c}"/>`;
  }
}

/** ไอคอนไฟล์เป็น SVG ข้อความ (กว้าง size px · สูง size×1.2) — ใช้ได้ทั้งบนจอและในรูปที่บันทึก */
export function fileTypeSvg(nameOrExt: string, size = 40): string {
  const d = fileTypeOf(nameOrExt);
  const label = (d.ext || "?").toUpperCase().slice(0, 6);   // a-z0-9 ล้วน (normalizeExt) — ไม่ต้อง escape
  const fs = label.length <= 3 ? 10 : label.length === 4 ? 8.4 : label.length === 5 ? 7 : 6;
  const w = Math.max(8, Math.round(size)), h = Math.round(w * 1.2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 40 48" role="img" aria-label="${label}">`
    + `<path d="M9 1.5 H27 L37.5 12 V42.5 A4 4 0 0 1 33.5 46.5 H9 A4 4 0 0 1 5 42.5 V5.5 A4 4 0 0 1 9 1.5 Z" fill="${d.fill}" stroke="${d.color}" stroke-width="1.6"/>`
    + `<path d="M27 1.5 V9 A3 3 0 0 0 30 12 H37.5" fill="#ffffff" stroke="${d.color}" stroke-width="1.6" stroke-linejoin="round"/>`
    + glyph(d.group, d.color)
    + `<rect x="1.5" y="27.5" width="30" height="13" rx="3" fill="${d.color}"/>`
    + `<text x="16.5" y="${(34 + fs * 0.36).toFixed(1)}" text-anchor="middle" font-family="'Segoe UI',Arial,sans-serif" font-size="${fs}" font-weight="800" fill="#ffffff" letter-spacing=".2">${label}</text>`
    + `</svg>`;
}
