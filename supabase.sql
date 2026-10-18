-- Rode isto uma vez no Supabase: SQL Editor → New query → colar → Run.
create table if not exists public.estado (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  dados jsonb not null,
  alterado_em bigint not null
);

alter table public.estado enable row level security;

-- Cada pessoa só vê e mexe na própria linha.
create policy "ver o meu" on public.estado for select using (auth.uid() = user_id);
create policy "criar o meu" on public.estado for insert with check (auth.uid() = user_id);
create policy "mudar o meu" on public.estado for update using (auth.uid() = user_id);
