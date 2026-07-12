-- Speedy7 Supabase schema preview
-- Review in Supabase SQL editor before production use.

create extension if not exists pgcrypto;

create type public.app_role as enum ('customer', 'assistant', 'admin');
create type public.quote_status as enum ('draft', 'sent_to_assistants', 'assistant_replied', 'owner_approved', 'sent_to_customer', 'ordered', 'closed');
create type public.order_status as enum ('draft', 'placed', 'paid', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'customer',
  full_name text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  make text not null,
  model text not null,
  year int,
  created_at timestamptz not null default now()
);

create table public.vehicle_identifiers (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  vin text,
  engine_number text not null,
  unique (vehicle_id, engine_number)
);

create table public.part_categories (id uuid primary key default gen_random_uuid(), name text not null unique);
create table public.suppliers (id uuid primary key default gen_random_uuid(), name text not null, whatsapp_number text, service_area text, facebook_page_url text, created_at timestamptz not null default now());
create table public.parts (id uuid primary key default gen_random_uuid(), category_id uuid references public.part_categories(id), name text not null, description text, image_url text, created_at timestamptz not null default now());
create table public.stock_items (id uuid primary key default gen_random_uuid(), supplier_id uuid references public.suppliers(id), part_id uuid not null references public.parts(id) on delete cascade, sku text, condition text not null default 'new', price numeric(12,2) not null, quantity int not null default 0, created_at timestamptz not null default now());
create table public.compatibility_links (id uuid primary key default gen_random_uuid(), part_id uuid not null references public.parts(id) on delete cascade, vehicle_id uuid references public.vehicles(id) on delete cascade, vin text, engine_number text, notes text, created_at timestamptz not null default now());
create table public.quote_requests (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, vehicle_id uuid references public.vehicles(id) on delete set null, part_id uuid references public.parts(id) on delete set null, description text, status public.quote_status not null default 'draft', source text not null default 'app', created_at timestamptz not null default now());
create table public.quote_request_photos (id uuid primary key default gen_random_uuid(), quote_request_id uuid not null references public.quote_requests(id) on delete cascade, storage_path text not null, created_at timestamptz not null default now());
create table public.assistant_profiles (id uuid primary key references public.profiles(id) on delete cascade, supplier_id uuid references public.suppliers(id) on delete set null, shop_name text not null, whatsapp_number text not null, service_area text, categories text[] not null default '{}', available boolean not null default true);
create table public.assistant_quote_replies (id uuid primary key default gen_random_uuid(), quote_request_id uuid not null references public.quote_requests(id) on delete cascade, assistant_id uuid references public.assistant_profiles(id) on delete set null, supplier_id uuid references public.suppliers(id) on delete set null, price numeric(12,2) not null, quantity int not null default 1, condition text, eta text, note text, approved_by_owner boolean not null default false, created_at timestamptz not null default now());
create table public.carts (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now());
create table public.orders (id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, status public.order_status not null default 'draft', fulfilment_method text not null default 'delivery', total numeric(12,2) not null default 0, created_at timestamptz not null default now());
create table public.order_items (id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade, stock_item_id uuid references public.stock_items(id) on delete set null, assistant_quote_reply_id uuid references public.assistant_quote_replies(id) on delete set null, quantity int not null default 1, unit_price numeric(12,2) not null);
create table public.social_leads (id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id) on delete set null, source text not null, external_reference text, message text, created_at timestamptz not null default now());
create table public.audit_events (id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null, action text not null, entity_table text, entity_id uuid, created_at timestamptz not null default now());
create table public.app_intake_events (id uuid primary key default gen_random_uuid(), event_type text not null, payload jsonb not null default '{}'::jsonb, processed boolean not null default false, created_at timestamptz not null default now());

create index if not exists vehicles_user_id_idx on public.vehicles (user_id);
create index if not exists parts_category_id_idx on public.parts (category_id);
create index if not exists stock_items_supplier_id_idx on public.stock_items (supplier_id);
create index if not exists stock_items_part_id_idx on public.stock_items (part_id);
create index if not exists compatibility_links_part_id_idx on public.compatibility_links (part_id);
create index if not exists compatibility_links_vehicle_id_idx on public.compatibility_links (vehicle_id);
create index if not exists compatibility_links_vin_idx on public.compatibility_links (vin);
create index if not exists compatibility_links_engine_number_idx on public.compatibility_links (engine_number);
create index if not exists quote_requests_user_id_idx on public.quote_requests (user_id);
create index if not exists quote_requests_vehicle_id_idx on public.quote_requests (vehicle_id);
create index if not exists quote_requests_part_id_idx on public.quote_requests (part_id);
create index if not exists quote_request_photos_quote_request_id_idx on public.quote_request_photos (quote_request_id);
create index if not exists assistant_profiles_supplier_id_idx on public.assistant_profiles (supplier_id);
create index if not exists assistant_quote_replies_quote_request_id_idx on public.assistant_quote_replies (quote_request_id);
create index if not exists assistant_quote_replies_assistant_id_idx on public.assistant_quote_replies (assistant_id);
create index if not exists assistant_quote_replies_supplier_id_idx on public.assistant_quote_replies (supplier_id);
create index if not exists carts_user_id_idx on public.carts (user_id);
create index if not exists orders_user_id_idx on public.orders (user_id);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_stock_item_id_idx on public.order_items (stock_item_id);
create index if not exists order_items_assistant_quote_reply_id_idx on public.order_items (assistant_quote_reply_id);
create index if not exists social_leads_user_id_idx on public.social_leads (user_id);
create index if not exists audit_events_actor_id_idx on public.audit_events (actor_id);
create index if not exists app_intake_events_type_processed_idx on public.app_intake_events (event_type, processed, created_at desc);

-- Supabase Data API access must be explicit for new projects.
grant select on public.part_categories, public.parts, public.stock_items, public.suppliers, public.compatibility_links to anon;
grant select, insert on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant select, insert, update, delete on public.vehicles, public.vehicle_identifiers, public.quote_requests, public.quote_request_photos, public.carts, public.orders, public.order_items, public.social_leads to authenticated;
grant select on public.part_categories, public.parts, public.stock_items, public.suppliers, public.compatibility_links to authenticated;
grant select, insert, update on public.assistant_profiles, public.assistant_quote_replies to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_identifiers enable row level security;
alter table public.part_categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.parts enable row level security;
alter table public.stock_items enable row level security;
alter table public.compatibility_links enable row level security;
alter table public.quote_requests enable row level security;
alter table public.quote_request_photos enable row level security;
alter table public.assistant_profiles enable row level security;
alter table public.assistant_quote_replies enable row level security;
alter table public.carts enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.social_leads enable row level security;
alter table public.audit_events enable row level security;
alter table public.app_intake_events enable row level security;

create policy "public can browse catalog categories" on public.part_categories for select to anon, authenticated using (true);
create policy "public can browse parts" on public.parts for select to anon, authenticated using (true);
create policy "public can browse supplier stock" on public.stock_items for select to anon, authenticated using (true);
create policy "public can browse suppliers" on public.suppliers for select to anon, authenticated using (true);
create policy "public can browse compatibility hints" on public.compatibility_links for select to anon, authenticated using (true);
create policy "users can read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "users can create customer profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id and role = 'customer');
create policy "users can update own basic profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "users manage own vehicles" on public.vehicles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage identifiers for own vehicles" on public.vehicle_identifiers for all to authenticated using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = (select auth.uid()))) with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.user_id = (select auth.uid())));
create policy "users manage own quote requests" on public.quote_requests for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage own carts" on public.carts for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage own orders" on public.orders for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage own social leads" on public.social_leads for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "users manage photos for own quote requests" on public.quote_request_photos for all to authenticated
using (exists (select 1 from public.quote_requests qr where qr.id = quote_request_id and qr.user_id = (select auth.uid())))
with check (exists (select 1 from public.quote_requests qr where qr.id = quote_request_id and qr.user_id = (select auth.uid())));

create policy "assistants manage own assistant profile" on public.assistant_profiles for all to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "users read replies to own quote requests" on public.assistant_quote_replies for select to authenticated
using (exists (select 1 from public.quote_requests qr where qr.id = quote_request_id and qr.user_id = (select auth.uid())) or assistant_id = (select auth.uid()));

create policy "assistants create own quote replies" on public.assistant_quote_replies for insert to authenticated
with check (assistant_id = (select auth.uid()));

create policy "users manage own order items" on public.order_items for all to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())))
with check (exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));

create policy "no direct client access to audit events" on public.audit_events for all to anon, authenticated
using (false)
with check (false);

create policy "no direct client access to app intake events" on public.app_intake_events for all to anon, authenticated
using (false)
with check (false);

-- Some Supabase projects include an RLS helper function in public. Keep it unavailable through the Data API.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
      and p.pronargs = 0
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public';
    execute 'revoke execute on function public.rls_auto_enable() from anon';
    execute 'revoke execute on function public.rls_auto_enable() from authenticated';
  end if;
end $$;


-- Owner/admin broad policies should be implemented with server-controlled app_metadata or a trusted roles table, not user-editable metadata.
-- Do not grant browser clients update access to profiles.role. Role changes should happen through trusted server-side admin code only.
