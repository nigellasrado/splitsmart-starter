-- SplitSmart · Hour 5 — database schema
--
-- HOW TO RUN THIS:
--   1. Open your Supabase project → left sidebar → SQL Editor → + New query
--   2. Copy everything in this file, paste it in
--   3. Click Run (or Cmd/Ctrl + Enter). You should see "Success. No rows returned."
--   4. Left sidebar → Table Editor → you'll see the "expenses" table.
--
-- Safe to run more than once.

create table if not exists expenses (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  emoji      text default '🧾',
  paid_by    text not null,
  amount     numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table expenses add column if not exists people integer not null default 1;
alter table expenses add column if not exists "each" numeric not null default 0;

-- Row-Level Security: each person can only see & change their OWN expenses.
-- This is the one rule that makes a shared database safe for many users.
alter table expenses enable row level security;

-- Re-running? Drop old copies of the policies first so this stays idempotent.
drop policy if exists "read own expenses"   on expenses;
drop policy if exists "insert own expenses" on expenses;
drop policy if exists "update own expenses" on expenses;
drop policy if exists "delete own expenses" on expenses;

create policy "read own expenses"   on expenses for select using (auth.uid() = user_id);
create policy "insert own expenses" on expenses for insert with check (auth.uid() = user_id);
create policy "update own expenses" on expenses for update using (auth.uid() = user_id);
create policy "delete own expenses" on expenses for delete using (auth.uid() = user_id);
