alter table public.employees
  add column if not exists line_user_id text,
  add column if not exists line_display_name text,
  add column if not exists line_picture_url text,
  add column if not exists line_linked_at timestamptz;

create table if not exists public.line_memberships (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  line_user_id text not null,
  line_display_name text,
  line_picture_url text,
  status text not null default 'linked' check (status in ('pending','linked','blocked','unlinked')),
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists line_memberships_active_line_user_idx
  on public.line_memberships(line_user_id)
  where status in ('linked','blocked');

create unique index if not exists line_memberships_active_employee_idx
  on public.line_memberships(employee_id)
  where status in ('linked','blocked');

create index if not exists line_memberships_employee_idx
  on public.line_memberships(employee_id);

create index if not exists line_memberships_status_idx
  on public.line_memberships(status);

drop trigger if exists line_memberships_updated_at on public.line_memberships;
create trigger line_memberships_updated_at
  before update on public.line_memberships
  for each row execute function public.set_updated_at();

alter table public.line_memberships enable row level security;

grant select, insert, update, delete on table public.line_memberships to authenticated, service_role;

