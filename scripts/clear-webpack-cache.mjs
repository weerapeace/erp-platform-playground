// ลบแคช webpack บนดิสก์ที่ค้างมาจาก build รุ่นก่อน (รันอัตโนมัติก่อน npm run build)
// ตั้งแต่ 2026-11-10 build จริงไม่ใช้แคชบนดิสก์แล้ว (next.config.ts → config.cache = memory)
// ถ้าไม่ลบ Vercel จะดาวน์โหลด/อัปโหลดแคชเก่า ~1 GB วนทุก build โดยไม่ได้ใช้ · คู่มือ docs/build-memory.md
import { rmSync } from "node:fs";

rmSync(".next/cache/webpack", { recursive: true, force: true });
