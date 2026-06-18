import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationPath = "supabase/migrations/202606180920_phase_1_2_granular_permissions.sql";
const migration = () => readFileSync(join(root, migrationPath), "utf8");
const uploadRoleGrantMigrationPath = "supabase/migrations/202606181000_phase_1_upload_role_grants.sql";
const uploadRoleGrantMigration = () => readFileSync(join(root, uploadRoleGrantMigrationPath), "utf8");

const requiredPermissions = [
  "admin.schema.view",
  "admin.schema.create_table",
  "admin.schema.add_field",
  "admin.schema.delete_field",
  "admin.module_layout.edit",
  "admin.field_registry.edit",
  "admin.field_registry.bulk_edit",
  "files.upload",
  "files.delete",
  "payroll.calculate",
];

describe("Phase 1.2 permission DB sync", () => {
  test("migration defines every granular permission key", () => {
    const source = migration();

    for (const permission of requiredPermissions) {
      expect(source).toContain(permission);
    }
  });

  test("migration grants every new permission to the admin role by default", () => {
    const source = migration();

    expect(source).toContain("insert into public.erp_role_permissions");
    expect(source).toContain("'admin'");
    expect(source).toContain("permission_key");
    for (const permission of requiredPermissions) {
      expect(source).toContain(permission);
    }
  });

  test("migration is safe to run repeatedly", () => {
    const source = migration().toLowerCase();

    expect(source).toContain("on conflict");
    expect(source).toContain("do update");
    expect(source).toContain("do nothing");
  });

  test("upload role grant migration gives file upload to working roles only", () => {
    const source = uploadRoleGrantMigration();

    expect(source).toContain("'manager'");
    expect(source).toContain("'staff'");
    expect(source).toContain("'files.upload'");
    expect(source).not.toContain("'viewer'");
    expect(source).not.toContain("'files.delete'");
    expect(source).not.toContain("'payroll.calculate'");
  });
});
