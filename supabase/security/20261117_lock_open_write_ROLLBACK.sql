-- ย้อนกลับ 202611171300_security_lock_open_write_tables (+ 202611171400 lookups ถ้ารันแล้ว)
-- สร้าง policy เดิมคืนจาก security_backup.policies_20261117 / policies_20261117_lookups แล้วลบ <ตาราง>_read ที่เพิ่มไว้
do $$
declare b record; bt text;
begin
  foreach bt in array array['security_backup.policies_20261117','security_backup.policies_20261117_lookups'] loop
    if to_regclass(bt) is null then continue; end if;
    for b in execute format('select * from %s', bt) loop
      execute format('drop policy if exists %I on public.%I', b.tablename || '_read', b.tablename);
      execute format('drop policy if exists %I on public.%I', b.policyname, b.tablename);
      execute format('create policy %I on public.%I as %s for %s to %s %s %s',
        b.policyname, b.tablename, b.permissive, b.cmd, array_to_string(b.roles, ','),
        case when b.qual is not null then 'using (' || b.qual || ')' else '' end,
        case when b.with_check is not null then 'with check (' || b.with_check || ')' else '' end);
    end loop;
  end loop;
end $$;
