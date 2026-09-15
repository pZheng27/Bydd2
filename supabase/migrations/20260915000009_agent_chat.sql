-- Session 3.5 Part A: the persistent "talk to your item" pricing chat.
-- One conversation per inventory item, private to the dealer who owns it.
create table if not exists public.agent_chat_messages (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists agent_chat_item_idx
  on public.agent_chat_messages (inventory_item_id, created_at);

alter table public.agent_chat_messages enable row level security;

drop policy if exists agent_chat_owner_all on public.agent_chat_messages;
create policy agent_chat_owner_all on public.agent_chat_messages
  for all
  using (
    inventory_item_id in (
      select i.id from public.inventory_items i
      join public.dealers d on d.id = i.dealer_id
      join public.profiles p on p.id = d.profile_id
      where p.user_id = auth.uid()
    )
  )
  with check (
    inventory_item_id in (
      select i.id from public.inventory_items i
      join public.dealers d on d.id = i.dealer_id
      join public.profiles p on p.id = d.profile_id
      where p.user_id = auth.uid()
    )
  );
