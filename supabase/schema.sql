-- Ejecuta este archivo una sola vez en Supabase > SQL Editor.
create extension if not exists pgcrypto;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  delivery_date date not null,
  order_date date not null default current_date,
  observations text not null default '',
  total numeric(12, 2) not null default 0 check (total >= 0),
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  line_total numeric(12, 2) generated always as (quantity * unit_price) stored
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  kind text not null check (kind in ('partial', 'full')),
  created_at timestamptz not null default now()
);

create index clients_user_created_idx on public.clients(user_id, created_at desc);
create index products_user_name_idx on public.products(user_id, name) where active;
create index orders_user_date_idx on public.orders(user_id, order_date desc);
create index orders_client_idx on public.orders(client_id);
create index order_items_order_idx on public.order_items(order_id);
create index payments_client_idx on public.payments(client_id, created_at desc);

alter table public.clients enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;

create policy "Users manage their own clients"
  on public.clients for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users manage their own products"
  on public.products for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users read their own orders"
  on public.orders for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users read their own order items"
  on public.order_items for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and o.user_id = (select auth.uid())
  ));

create policy "Users read their own payments"
  on public.payments for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.clients, public.products, public.orders, public.order_items, public.payments from anon, authenticated;
grant select, insert, update, delete on public.clients, public.products to authenticated;
grant select on public.orders, public.order_items, public.payments to authenticated;

create or replace function public.create_order(
  p_client_id uuid,
  p_delivery_date date,
  p_order_date date,
  p_observations text,
  p_items jsonb
)
returns table(order_id uuid, total numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_product_id uuid;
  v_order_id uuid;
  v_total numeric(12, 2) := 0;
  v_count integer;
  v_distinct_count integer;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión para crear un pedido.';
  end if;
  if p_delivery_date is null then
    raise exception 'La fecha de entrega es obligatoria.';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido debe incluir al menos un producto.';
  end if;
  select count(*), count(distinct (item->>'product_id'))
    into v_count, v_distinct_count
    from jsonb_array_elements(p_items) as entries(item);
  if v_count <> v_distinct_count then
    raise exception 'No repitas un producto en el mismo pedido.';
  end if;

  perform 1 from public.clients c
    where c.id = p_client_id and c.user_id = v_user_id
    for update;
  if not found then
    raise exception 'El cliente no existe o no pertenece a esta cuenta.';
  end if;

  insert into public.orders (user_id, client_id, delivery_date, order_date, observations)
    values (v_user_id, p_client_id, p_delivery_date, coalesce(p_order_date, current_date), coalesce(p_observations, ''))
    returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity is null or v_quantity < 1 then
      raise exception 'La cantidad de cajas debe ser un entero positivo.';
    end if;

    select * into v_product
      from public.products p
      where p.id = v_product_id and p.user_id = v_user_id and p.active
      for share;
    if not found then
      raise exception 'Uno de los productos no existe o no pertenece a esta cuenta.';
    end if;

    insert into public.order_items (order_id, product_id, product_name, quantity, unit_price)
      values (v_order_id, v_product.id, v_product.name, v_quantity, v_product.unit_price);
    v_total := v_total + (v_product.unit_price * v_quantity);
  end loop;

  update public.orders o set total = v_total where o.id = v_order_id;
  return query select v_order_id, v_total;
end;
$$;

create or replace function public.record_payment(
  p_client_id uuid,
  p_amount numeric,
  p_kind text
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_orders numeric(12, 2);
  v_paid numeric(12, 2);
  v_balance numeric(12, 2);
  v_amount numeric(12, 2);
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión para registrar un pago.';
  end if;
  if p_kind not in ('partial', 'full') then
    raise exception 'El tipo de pago no es válido.';
  end if;
  perform 1 from public.clients c
    where c.id = p_client_id and c.user_id = v_user_id
    for update;
  if not found then
    raise exception 'El cliente no existe o no pertenece a esta cuenta.';
  end if;

  select coalesce(sum(o.total), 0) into v_orders
    from public.orders o where o.client_id = p_client_id and o.user_id = v_user_id;
  select coalesce(sum(p.amount), 0) into v_paid
    from public.payments p where p.client_id = p_client_id and p.user_id = v_user_id;
  v_balance := greatest(v_orders - v_paid, 0);
  if v_balance <= 0 then
    raise exception 'Este cliente no tiene saldo pendiente.';
  end if;
  if p_kind = 'full' then
    v_amount := v_balance;
  else
    if p_amount is null or p_amount <= 0 or p_amount > v_balance then
      raise exception 'El abono debe ser positivo y no superar el saldo pendiente.';
    end if;
    v_amount := p_amount;
  end if;

  insert into public.payments (user_id, client_id, amount, kind)
    values (v_user_id, p_client_id, v_amount, p_kind);
  return v_amount;
end;
$$;

create or replace function public.mark_order_delivered(p_order_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivered_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para actualizar una entrega.';
  end if;
  update public.orders o
    set delivered_at = coalesce(o.delivered_at, now())
    where o.id = p_order_id and o.user_id = auth.uid()
    returning o.delivered_at into v_delivered_at;
  if not found then
    raise exception 'El pedido no existe o no pertenece a esta cuenta.';
  end if;
  return v_delivered_at;
end;
$$;

revoke all on function public.create_order(uuid, date, date, text, jsonb) from public, anon, authenticated;
revoke all on function public.record_payment(uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.mark_order_delivered(uuid) from public, anon, authenticated;
grant execute on function public.create_order(uuid, date, date, text, jsonb) to authenticated;
grant execute on function public.record_payment(uuid, numeric, text) to authenticated;
grant execute on function public.mark_order_delivered(uuid) to authenticated;
