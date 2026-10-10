-- OJEHLC E-CART: paste into Supabase SQL Editor and Run (safe to run once on a new project).
create extension if not exists pgcrypto;
create table profiles(id uuid primary key references auth.users on delete cascade, full_name text, phone text, role text not null default 'customer' check(role in('customer','admin')));
create table products(id uuid primary key default gen_random_uuid(), name text not null, description text default '', price numeric(12,2) not null check(price>=0), stock int not null default 0 check(stock>=0), category text default 'General', image_url text default '', active bool not null default true, created_at timestamptz default now());
create table orders(id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles, status text not null default 'pending' check(status in('pending','confirmed','shipped','delivered','cancelled')), payment_method text not null check(payment_method in('pay_on_delivery','bank_transfer')), payment_status text not null default 'unpaid' check(payment_status in('unpaid','paid')), total numeric(12,2) not null, name text, phone text, address text, note text default '', created_at timestamptz default now());
create table order_items(id uuid primary key default gen_random_uuid(), order_id uuid not null references orders on delete cascade, product_id uuid references products on delete set null, name text not null, price numeric(12,2) not null, qty int not null check(qty>0));

create function is_admin() returns bool language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where id=auth.uid() and role='admin')$$;
create function my_role() returns text language sql stable security definer set search_path=public as $$select role from profiles where id=auth.uid()$$;

-- The first account created becomes the admin. Everyone after is a customer.
create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into profiles(id,full_name,role) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),case when exists(select 1 from profiles) then 'customer' else 'admin' end);return new;end$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

alter table profiles enable row level security; alter table products enable row level security;
alter table orders enable row level security; alter table order_items enable row level security;
create policy p_read on profiles for select to authenticated using(id=auth.uid() or is_admin());
create policy p_self on profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid() and role=my_role());   -- customers can never change their own role
create policy p_admin on profiles for update to authenticated using(is_admin()) with check(is_admin());
create policy pr_read on products for select using(active or is_admin());
create policy pr_admin on products for all to authenticated using(is_admin()) with check(is_admin());
create policy o_read on orders for select to authenticated using(user_id=auth.uid() or is_admin());
create policy oi_read on order_items for select to authenticated using(exists(select 1 from orders o where o.id=order_id and (o.user_id=auth.uid() or is_admin())));
-- Orders are created and changed only through the functions below, so prices, totals and status cannot be faked from the browser.

create function place_order(items jsonb, cust jsonb, method text) returns uuid language plpgsql security definer set search_path=public as $$
declare oid uuid; it jsonb; p products; tot numeric:=0; n int;
begin
 if auth.uid() is null then raise exception 'Please sign in to place an order.'; end if;
 if method not in('pay_on_delivery','bank_transfer') then raise exception 'Choose a payment method.'; end if;
 if jsonb_typeof(items)<>'array' or jsonb_array_length(items)=0 then raise exception 'Your cart is empty.'; end if;
 if coalesce(trim(cust->>'name'),'')='' or coalesce(trim(cust->>'phone'),'')='' or coalesce(trim(cust->>'address'),'')='' then raise exception 'Enter your name, phone and delivery address.'; end if;
 insert into orders(user_id,total,payment_method,name,phone,address,note) values(auth.uid(),0,method,trim(cust->>'name'),trim(cust->>'phone'),trim(cust->>'address'),coalesce(cust->>'note','')) returning id into oid;
 for it in select * from jsonb_array_elements(items) loop
  n:=(it->>'qty')::int; if n<1 or n>100 then raise exception 'Invalid quantity.'; end if;
  update products set stock=stock-n where id=(it->>'id')::uuid and active and stock>=n returning * into p;
  if not found then raise exception 'An item in your cart is out of stock or no longer available.'; end if;
  insert into order_items(order_id,product_id,name,price,qty) values(oid,p.id,p.name,p.price,n);
  tot:=tot+p.price*n;
 end loop;
 update orders set total=tot where id=oid; return oid;
end$$;

create function admin_update_order(oid uuid, st text, pay text) returns void language plpgsql security definer set search_path=public as $$
declare o orders;
begin
 if not is_admin() then raise exception 'Admins only.'; end if;
 select * into o from orders where id=oid for update; if not found then raise exception 'Order not found.'; end if;
 if o.status='cancelled' and st<>'cancelled' then raise exception 'Cancelled orders cannot be reopened.'; end if;
 if st='cancelled' and o.status<>'cancelled' then update products p set stock=p.stock+i.qty from order_items i where i.order_id=oid and i.product_id=p.id; end if;
 update orders set status=st, payment_status=pay where id=oid;
end$$;

-- Product pictures
insert into storage.buckets(id,name,public) values('products','products',true) on conflict do nothing;
create policy "products public read" on storage.objects for select using(bucket_id='products');
create policy "products admin upload" on storage.objects for insert to authenticated with check(bucket_id='products' and is_admin());
create policy "products admin delete" on storage.objects for delete to authenticated using(bucket_id='products' and is_admin());
