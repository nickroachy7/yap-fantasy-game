-- Yap Fantasy — Row Level Security (build plan task 10)
--
-- The rule this file encodes: clients may READ their own game state and READ
-- reference data. Clients may never WRITE game state. There is deliberately no
-- INSERT/UPDATE/DELETE policy on card_instances, gems_ledger, gem_balances or
-- pack_openings — those tables are writable only by SECURITY DEFINER functions
-- and the service role, so RNG and gem math cannot be reached from a client.
-- Assume Charles Proxy.

alter table public.profiles             enable row level security;
alter table public.teams                enable row level security;
alter table public.players              enable row level security;
alter table public.games                enable row level security;
alter table public.stat_lines           enable row level security;
alter table public.scoring_rules        enable row level security;
alter table public.fantasy_points       enable row level security;
alter table public.dfs_salary_snapshots enable row level security;
alter table public.cards                enable row level security;
alter table public.card_instances       enable row level security;
alter table public.packs                enable row level security;
alter table public.pack_openings        enable row level security;
alter table public.gems_ledger          enable row level security;
alter table public.gem_balances         enable row level security;

-- ---------------------------------------------------------------- profiles
-- Readable by any signed-in user: the global leaderboard needs display names.
-- Writable only by their owner, and only name/avatar exist to write.

create policy "profiles are readable by authenticated users"
  on public.profiles for select to authenticated
  using (true);

create policy "users insert their own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "users update their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------------------------------------------------------------- reference data
-- Read-only to clients. Written by Edge Functions via the service role, which
-- bypasses RLS entirely.

create policy "teams are readable"          on public.teams                for select to authenticated using (true);
create policy "players are readable"        on public.players              for select to authenticated using (true);
create policy "games are readable"          on public.games                for select to authenticated using (true);
create policy "stat lines are readable"     on public.stat_lines           for select to authenticated using (true);
create policy "scoring rules are readable"  on public.scoring_rules        for select to authenticated using (true);
create policy "fantasy points are readable" on public.fantasy_points       for select to authenticated using (true);
create policy "salary snapshots are readable" on public.dfs_salary_snapshots for select to authenticated using (true);
create policy "cards are readable"          on public.cards                for select to authenticated using (true);
create policy "packs are readable"          on public.packs                for select to authenticated using (is_active);

-- ---------------------------------------------------------------- owned game state
-- SELECT only, scoped to the owner. No write policies by design.

create policy "users read their own card instances"
  on public.card_instances for select to authenticated
  using (auth.uid() = user_id);

create policy "users read their own pack openings"
  on public.pack_openings for select to authenticated
  using (auth.uid() = user_id);

create policy "users read their own gem ledger"
  on public.gems_ledger for select to authenticated
  using (auth.uid() = user_id);

create policy "users read their own gem balance"
  on public.gem_balances for select to authenticated
  using (auth.uid() = user_id);
