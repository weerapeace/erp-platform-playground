/**
 * Belt Builder API — ของกลางของ 3 ทรัพยากร (parts / size-rules / designs)
 *
 * ตัว handler จริงย้ายไปเป็นของกลาง lib/crud-resource-api.ts แล้ว (ตัวประกอบสินค้าใช้ร่วม)
 * ไฟล์นี้แค่ผูกสิทธิ์ belt_builder.view / .edit ให้ทุกทรัพยากรของเข็มขัด — route เดิมเรียกชื่อเดิมได้ไม่ต้องแก้
 */
import type { NextRequest, NextResponse } from "next/server";
import * as crud from "@/lib/crud-resource-api";

export const VIEW_PERM = "belt_builder.view";
export const EDIT_PERM = "belt_builder.edit";

/** ทรัพยากรของเข็มขัด (ไม่ต้องใส่สิทธิ์เอง — ผูกให้ตรงนี้) */
export type CrudResource = Omit<crud.CrudResource, "perms">;
const withPerms = (res: CrudResource): crud.CrudResource => ({ ...res, perms: { view: VIEW_PERM, edit: EDIT_PERM } });

export const pickColumns = crud.pickColumns;
export const listHandler   = (res: CrudResource, request: NextRequest): Promise<NextResponse> => crud.listHandler(withPerms(res), request);
export const createHandler = (res: CrudResource, request: NextRequest): Promise<NextResponse> => crud.createHandler(withPerms(res), request);
export const getHandler    = (res: CrudResource, request: NextRequest, id: string): Promise<NextResponse> => crud.getHandler(withPerms(res), request, id);
export const patchHandler  = (res: CrudResource, request: NextRequest, id: string): Promise<NextResponse> => crud.patchHandler(withPerms(res), request, id);
export const deleteHandler = (res: CrudResource, request: NextRequest, id: string): Promise<NextResponse> => crud.deleteHandler(withPerms(res), request, id);
/** รายการ shops ที่เปิดอยู่ + โดเมนเว็บร้าน + รหัสพรีวิว (สิทธิ์ belt_builder.view) */
export const listShops = (request: NextRequest): Promise<NextResponse> => crud.listShops(request, VIEW_PERM);
