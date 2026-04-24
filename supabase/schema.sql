create extension if not exists pgcrypto;

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text not null,
  contact_email text not null unique,
  status text not null default 'active' check (status in ('active', 'inactive', 'pending')),
  renewal_due_date date not null,
  last_payment_date date,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null default 'partner' check (role in ('admin', 'partner')),
  partner_id uuid references public.partners (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.renewal_submissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  submitted_by uuid not null references auth.users (id) on delete cascade,
  payment_month text not null,
  amount numeric(12, 2) not null,
  notes text,
  file_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  submitted_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function public.protect_profile_write()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() <> new.id and not public.is_admin() then
      raise exception 'Cannot create another user profile.';
    end if;

    if not public.is_admin() then
      new.role = 'partner';
      new.partner_id = null;
    end if;

    new.email = lower(new.email);
    return new;
  end if;

  if public.is_admin() then
    new.email = lower(new.email);
    return new;
  end if;

  if auth.uid() <> old.id then
    raise exception 'Cannot update another user profile.';
  end if;

  if new.role is distinct from old.role then
    raise exception 'Only admins can change roles.';
  end if;

  if lower(new.email) <> lower(old.email) then
    raise exception 'Only admins can change email addresses.';
  end if;

  if new.partner_id is distinct from old.partner_id then
    if not exists (
      select 1
      from public.partners
      where id = new.partner_id
        and lower(contact_email) = lower(old.email)
    ) then
      raise exception 'You can only link to a partner that matches your email.';
    end if;
  end if;

  new.email = lower(old.email);
  return new;
end;
$$;

drop trigger if exists set_partners_updated_at on public.partners;
create trigger set_partners_updated_at
before update on public.partners
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute procedure public.set_current_timestamp_updated_at();

drop trigger if exists protect_profile_write_trigger on public.profiles;
create trigger protect_profile_write_trigger
before insert or update on public.profiles
for each row
execute procedure public.protect_profile_write();

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

alter table public.partners enable row level security;
alter table public.profiles enable row level security;
alter table public.renewal_submissions enable row level security;

drop policy if exists "admins manage partners" on public.partners;
create policy "admins manage partners"
on public.partners
for all
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admins read all profiles" on public.profiles;
create policy "admins read all profiles"
on public.profiles
for select
using (public.is_admin());

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
on public.profiles
for select
using (auth.uid() = id);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
on public.profiles
for update
using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

drop policy if exists "admins read submissions" on public.renewal_submissions;
create policy "admins read submissions"
on public.renewal_submissions
for select
using (public.is_admin());

drop policy if exists "partners read own submissions" on public.renewal_submissions;
create policy "partners read own submissions"
on public.renewal_submissions
for select
using (
  submitted_by = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and partner_id = renewal_submissions.partner_id
  )
);

drop policy if exists "partners create own submissions" on public.renewal_submissions;
create policy "partners create own submissions"
on public.renewal_submissions
for insert
with check (
  submitted_by = auth.uid()
  and (
    public.is_admin()
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and partner_id = renewal_submissions.partner_id
    )
  )
);

drop policy if exists "admins update submissions" on public.renewal_submissions;
create policy "admins update submissions"
on public.renewal_submissions
for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "partners read linked partner" on public.partners;
create policy "partners read linked partner"
on public.partners
for select
using (
  public.is_admin()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and partner_id = partners.id
  )
  or lower(contact_email) = lower(coalesce((
    select email
    from public.profiles
    where id = auth.uid()
  ), ''))
);

insert into storage.buckets (id, name, public)
values ('payment-screenshots', 'payment-screenshots', false)
on conflict (id) do nothing;

drop policy if exists "authenticated upload screenshots" on storage.objects;
create policy "authenticated upload screenshots"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'payment-screenshots'
  and (
    public.is_admin()
    or coalesce((storage.foldername(name))[1], '') = coalesce((
      select partner_id::text
      from public.profiles
      where id = auth.uid()
    ), '')
  )
);

drop policy if exists "authenticated read screenshots" on storage.objects;
create policy "authenticated read screenshots"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'payment-screenshots'
  and (
    public.is_admin()
    or coalesce((storage.foldername(name))[1], '') = coalesce((
      select partner_id::text
      from public.profiles
      where id = auth.uid()
    ), '')
  )
);

comment on table public.profiles is 'User profile table. Accounts with role=admin can access the admin console.';
comment on table public.partners is 'Partner master table. contact_email is used for automatic account linking.';
comment on table public.renewal_submissions is 'Renewal uploads and reading payment screenshots submitted by partners.';
