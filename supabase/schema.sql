-- ap-study クラウド同期用スキーマ
-- Supabaseプロジェクトの SQL Editor でこのファイルの内容を実行する。
--
-- 注意: 認証なしの「同期コード方式」のため、anonキーを持つ人は
-- 任意の sync_code の行を読み書きできる。保存対象は学習履歴のみで
-- 機微情報を含まない前提の、自分+身近な人専用の割り切った構成。

create table if not exists public.progress (
  sync_code text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

create policy "progress_anon_all"
  on public.progress
  for all
  to anon
  using (true)
  with check (true);
