create policy "payments are server only"
on public.payments
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "inventory transactions are server only"
on public.inventory_transactions
as restrictive
for all
to anon, authenticated
using (false)
with check (false);
