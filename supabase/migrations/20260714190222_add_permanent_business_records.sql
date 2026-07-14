alter table public.orders
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists payment_method text not null default 'pay_on_delivery',
  add column if not exists notes text;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0),
  method text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references public.stock_items(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('opening', 'purchase', 'sale', 'return', 'adjustment', 'stock_upload')),
  quantity_change integer not null check (quantity_change <> 0),
  quantity_after integer not null check (quantity_after >= 0),
  order_id uuid references public.orders(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create unique index if not exists stock_items_sku_lower_unique_idx
  on public.stock_items (lower(sku))
  where sku is not null;

create index if not exists payments_order_id_idx on public.payments (order_id);
create index if not exists payments_status_created_at_idx on public.payments (status, created_at desc);
create index if not exists inventory_transactions_stock_item_created_at_idx
  on public.inventory_transactions (stock_item_id, created_at desc);
create index if not exists inventory_transactions_order_id_idx
  on public.inventory_transactions (order_id);
create index if not exists inventory_transactions_actor_id_idx
  on public.inventory_transactions (actor_id);

alter table public.payments enable row level security;
alter table public.inventory_transactions enable row level security;

revoke all on public.payments from anon, authenticated;
revoke all on public.inventory_transactions from anon, authenticated;
grant select, insert, update, delete on public.payments to service_role;
grant select, insert, update, delete on public.inventory_transactions to service_role;

create or replace function public.speedy7_create_order(
  p_user_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_fulfilment_method text,
  p_payment_method text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_stock_item_id uuid;
  v_quote_reply_id uuid;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_stock_before integer;
  v_stock_after integer;
  v_total numeric(12,2) := 0;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order requires at least one item';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Customer profile does not exist';
  end if;

  insert into public.orders (
    user_id,
    status,
    fulfilment_method,
    total,
    customer_name,
    customer_phone,
    payment_method
  )
  values (
    p_user_id,
    'placed'::public.order_status,
    coalesce(nullif(trim(p_fulfilment_method), ''), 'delivery'),
    0,
    nullif(trim(p_customer_name), ''),
    nullif(trim(p_customer_phone), ''),
    coalesce(nullif(trim(p_payment_method), ''), 'pay_on_delivery')
  )
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_stock_item_id := nullif(v_item ->> 'stock_item_id', '')::uuid;
    v_quote_reply_id := nullif(v_item ->> 'quote_reply_id', '')::uuid;
    v_quantity := greatest(coalesce((v_item ->> 'quantity')::integer, 1), 1);
    v_unit_price := coalesce((v_item ->> 'unit_price')::numeric, 0);

    if v_stock_item_id is null and v_quote_reply_id is null then
      raise exception 'Every order item needs stock or an approved quote';
    end if;

    if v_unit_price <= 0 then
      raise exception 'Order item price must be greater than zero';
    end if;

    if v_stock_item_id is not null then
      select quantity
      into v_stock_before
      from public.stock_items
      where id = v_stock_item_id
      for update;

      if not found then
        raise exception 'Stock item does not exist';
      end if;

      if v_stock_before < v_quantity then
        raise exception 'Not enough stock available';
      end if;

      v_stock_after := v_stock_before - v_quantity;

      update public.stock_items
      set quantity = v_stock_after
      where id = v_stock_item_id;
    end if;

    insert into public.order_items (
      order_id,
      stock_item_id,
      assistant_quote_reply_id,
      quantity,
      unit_price
    )
    values (
      v_order_id,
      v_stock_item_id,
      v_quote_reply_id,
      v_quantity,
      v_unit_price
    );

    if v_stock_item_id is not null then
      insert into public.inventory_transactions (
        stock_item_id,
        transaction_type,
        quantity_change,
        quantity_after,
        order_id,
        actor_id,
        note
      )
      values (
        v_stock_item_id,
        'sale',
        -v_quantity,
        v_stock_after,
        v_order_id,
        p_user_id,
        'Speedy7 order placed'
      );
    end if;

    v_total := v_total + (v_unit_price * v_quantity);
  end loop;

  update public.orders
  set total = v_total
  where id = v_order_id;

  insert into public.payments (order_id, amount, method, status)
  values (
    v_order_id,
    v_total,
    coalesce(nullif(trim(p_payment_method), ''), 'pay_on_delivery'),
    'pending'
  );

  insert into public.audit_events (actor_id, action, entity_table, entity_id)
  values (p_user_id, 'order_created', 'orders', v_order_id);

  return jsonb_build_object('order_id', v_order_id, 'total', v_total, 'status', 'placed');
end;
$$;

revoke all on function public.speedy7_create_order(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.speedy7_create_order(uuid, text, text, text, text, jsonb) to service_role;

create or replace function public.speedy7_upsert_stock(
  p_actor_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row jsonb;
  v_name text;
  v_category_name text;
  v_sku text;
  v_condition text;
  v_vin text;
  v_engine text;
  v_price numeric(12,2);
  v_target_quantity integer;
  v_category_id uuid;
  v_part_id uuid;
  v_stock_item_id uuid;
  v_previous_quantity integer;
  v_quantity_change integer;
  v_rows_saved integer := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Stock rows must be an array';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_actor_id and role = 'admin'::public.app_role
  ) then
    raise exception 'Admin profile required';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_name := trim(coalesce(v_row ->> 'name', ''));
    v_category_name := coalesce(nullif(trim(v_row ->> 'category'), ''), 'Service');
    v_sku := trim(coalesce(v_row ->> 'sku', ''));
    v_condition := coalesce(nullif(trim(v_row ->> 'condition'), ''), 'New');
    v_vin := nullif(trim(v_row ->> 'vin'), '');
    v_engine := nullif(trim(v_row ->> 'engine'), '');
    v_price := greatest(coalesce((v_row ->> 'price')::numeric, 0), 0);
    v_target_quantity := greatest(coalesce((v_row ->> 'quantity')::integer, 0), 0);

    if v_name = '' or v_sku = '' then
      raise exception 'Every stock row needs a part name and SKU';
    end if;

    select id
    into v_category_id
    from public.part_categories
    where lower(name) = lower(v_category_name)
    limit 1;

    if v_category_id is null then
      insert into public.part_categories (name)
      values (v_category_name)
      returning id into v_category_id;
    end if;

    v_stock_item_id := null;
    v_part_id := null;
    v_previous_quantity := 0;

    select id, part_id, quantity
    into v_stock_item_id, v_part_id, v_previous_quantity
    from public.stock_items
    where lower(sku) = lower(v_sku)
    limit 1
    for update;

    if v_stock_item_id is null then
      insert into public.parts (category_id, name)
      values (v_category_id, v_name)
      returning id into v_part_id;

      insert into public.stock_items (part_id, sku, condition, price, quantity)
      values (v_part_id, v_sku, v_condition, v_price, v_target_quantity)
      returning id into v_stock_item_id;

      v_quantity_change := v_target_quantity;
    else
      update public.parts
      set category_id = v_category_id,
          name = v_name
      where id = v_part_id;

      update public.stock_items
      set condition = v_condition,
          price = v_price,
          quantity = v_target_quantity
      where id = v_stock_item_id;

      v_quantity_change := v_target_quantity - v_previous_quantity;
    end if;

    if v_quantity_change <> 0 then
      insert into public.inventory_transactions (
        stock_item_id,
        transaction_type,
        quantity_change,
        quantity_after,
        actor_id,
        note
      )
      values (
        v_stock_item_id,
        'stock_upload',
        v_quantity_change,
        v_target_quantity,
        p_actor_id,
        'Admin stock upload'
      );
    end if;

    if v_vin is not null or v_engine is not null then
      if not exists (
        select 1
        from public.compatibility_links
        where part_id = v_part_id
          and vin is not distinct from v_vin
          and engine_number is not distinct from v_engine
      ) then
        insert into public.compatibility_links (part_id, vin, engine_number, notes)
        values (v_part_id, v_vin, v_engine, 'Added through stock upload');
      end if;
    end if;

    v_rows_saved := v_rows_saved + 1;
  end loop;

  insert into public.audit_events (actor_id, action, entity_table)
  values (p_actor_id, 'stock_uploaded', 'stock_items');

  return jsonb_build_object('rows_saved', v_rows_saved);
end;
$$;

revoke all on function public.speedy7_upsert_stock(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.speedy7_upsert_stock(uuid, jsonb) to service_role;

comment on table public.inventory_transactions is 'Permanent ledger of every Speedy7 stock quantity change.';
comment on table public.payments is 'Payment state for Speedy7 orders; payment secrets are never stored here.';
