-- Buyer <-> seller messaging. Idempotent — safe to re-run.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_profile_id uuid not null references public.profiles (id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles (id) on delete cascade,
  inventory_item_id uuid references public.inventory_items (id) on delete set null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_recipient_idx on public.messages (recipient_profile_id);
create index if not exists messages_sender_idx on public.messages (sender_profile_id);
create index if not exists messages_item_idx on public.messages (inventory_item_id);

alter table public.messages enable row level security;

-- Either party in a message can read it.
drop policy if exists messages_party_select on public.messages;
create policy messages_party_select on public.messages for select using (
  sender_profile_id in (select id from public.profiles where user_id = auth.uid())
  or recipient_profile_id in (select id from public.profiles where user_id = auth.uid())
);

-- You can only send as yourself.
drop policy if exists messages_sender_insert on public.messages;
create policy messages_sender_insert on public.messages for insert with check (
  sender_profile_id in (select id from public.profiles where user_id = auth.uid())
);

-- The recipient can mark messages read.
drop policy if exists messages_recipient_update on public.messages;
create policy messages_recipient_update on public.messages for update using (
  recipient_profile_id in (select id from public.profiles where user_id = auth.uid())
) with check (
  recipient_profile_id in (select id from public.profiles where user_id = auth.uid())
);
