-- 041 — Alert Telegram untuk scrape GM Apps (cara B: Supabase yang mengirim, bukan PC user)
--
-- Isi:
--   1. Tabel resource_management_alerts (riwayat alert + status kirim)
--   2. rm_alert_send(): kirim ke Telegram Bot API via pg_net; token & chat id dari Vault
--      (secret: gm_alert_bot_token, gm_alert_chat_id). Dedupe 60 menit per dedupe_key.
--   3. Trigger AFTER INSERT → rm_alert_send()
--   4. rm_alert_check_stuck_runs(): run `running` tanpa heartbeat → failed + alert scrape_stuck
--      - ada metadata.heartbeat_at  : basi > 20 menit
--      - belum ada heartbeat (app lama): started_at > 6 jam
--   5. Pembersihan sekali jalan: run `running` > 6 jam (sisa macet lama) → failed TANPA alert
--   6. pg_cron 'rm_alert_stuck_runs' tiap 5 menit
--   7. rm_alert_test(): kirim alert uji
--
-- Simpan secret (dijalankan owner di SQL Editor, bukan di file ini):
--   select vault.create_secret('<BOT_TOKEN>', 'gm_alert_bot_token');
--   select vault.create_secret('<CHAT_ID>',   'gm_alert_chat_id');
-- Selama secret belum ada, alert tetap tersimpan dengan send_status = 'no_config'.

-- 1. Tabel ---------------------------------------------------------------------
create table if not exists public.resource_management_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null
    check (kind in ('scrape_failed', 'scrape_stuck', 'network_unstable', 'invite_empty', 'test')),
  severity text not null default 'error'
    check (severity in ('info', 'warning', 'error')),
  platform text check (platform in ('whatsapp', 'telegram')),
  brand text,
  account_id uuid references public.resource_management_messaging_accounts(id) on delete set null,
  account_label text,
  pc_name text,
  run_id uuid references public.resource_management_scrape_runs(id) on delete set null,
  attempts integer check (attempts is null or attempts >= 0),
  message text not null,
  dedupe_key text,
  send_status text not null default 'pending'
    check (send_status in ('pending', 'queued', 'suppressed', 'no_config', 'error')),
  send_request_id bigint,
  send_error text,
  sent_at timestamptz
);

create index if not exists rm_alerts_created_at_idx
  on public.resource_management_alerts (created_at desc);
create index if not exists rm_alerts_dedupe_idx
  on public.resource_management_alerts (dedupe_key, created_at desc)
  where dedupe_key is not null;

-- App desktop memakai service role (bypass RLS); anon/authenticated tidak diberi akses.
alter table public.resource_management_alerts enable row level security;

-- 2. Kirim ke Telegram ----------------------------------------------------------
create or replace function public.rm_alert_send(p_alert_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.resource_management_alerts%rowtype;
  v_token text;
  v_chat text;
  v_icon text;
  v_text text;
  v_req bigint;
begin
  select * into a from public.resource_management_alerts where id = p_alert_id;
  if not found then
    return;
  end if;

  -- Dedupe: alert dengan kunci sama sudah terkirim dalam 60 menit terakhir
  if a.dedupe_key is not null and exists (
    select 1
    from public.resource_management_alerts b
    where b.dedupe_key = a.dedupe_key
      and b.id <> a.id
      and b.send_status = 'queued'
      and b.created_at > now() - interval '60 minutes'
  ) then
    update public.resource_management_alerts
      set send_status = 'suppressed'
      where id = a.id;
    return;
  end if;

  select decrypted_secret into v_token
    from vault.decrypted_secrets where name = 'gm_alert_bot_token' limit 1;
  select decrypted_secret into v_chat
    from vault.decrypted_secrets where name = 'gm_alert_chat_id' limit 1;

  if coalesce(trim(v_token), '') = '' or coalesce(trim(v_chat), '') = '' then
    update public.resource_management_alerts
      set send_status = 'no_config'
      where id = a.id;
    return;
  end if;

  v_icon := case a.severity when 'error' then '🔴' when 'warning' then '🟠' else 'ℹ️' end;

  v_text := concat_ws(
    E'\n',
    v_icon || ' GM ' || upper(replace(a.kind, '_', ' '))
      || case when a.attempts is not null then ' (' || a.attempts || 'x)' else '' end,
    nullif(concat_ws(' · ',
      'Brand: ' || a.brand,
      'Akun: ' || a.account_label,
      upper(left(a.platform, 2))
    ), ''),
    'PC: ' || a.pc_name,
    a.message,
    'Waktu: ' || to_char(a.created_at at time zone 'Asia/Kuala_Lumpur', 'DD Mon HH24:MI') || ' (MYT)'
  );

  v_req := net.http_post(
    url := 'https://api.telegram.org/bot' || trim(v_token) || '/sendMessage',
    body := jsonb_build_object(
      'chat_id', trim(v_chat),
      'text', left(v_text, 3900),
      'disable_web_page_preview', true
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );

  update public.resource_management_alerts
    set send_status = 'queued', send_request_id = v_req, sent_at = now()
    where id = a.id;
exception
  when others then
    update public.resource_management_alerts
      set send_status = 'error', send_error = left(sqlerrm, 500)
      where id = p_alert_id;
end;
$$;

revoke all on function public.rm_alert_send(uuid) from public, anon, authenticated;

-- 3. Trigger -------------------------------------------------------------------
create or replace function public.rm_alert_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rm_alert_send(new.id);
  return new;
end;
$$;

revoke all on function public.rm_alert_after_insert() from public, anon, authenticated;

drop trigger if exists rm_alert_after_insert_trg on public.resource_management_alerts;
create trigger rm_alert_after_insert_trg
  after insert on public.resource_management_alerts
  for each row execute function public.rm_alert_after_insert();

-- 4. Deteksi run macet -----------------------------------------------------------
create or replace function public.rm_alert_check_stuck_runs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_brand text;
  v_label text;
  n integer := 0;
begin
  for r in
    update public.resource_management_scrape_runs s
      set status = 'failed',
          completed_at = now(),
          error_message = case
            when coalesce(s.metadata, '{}'::jsonb) ? 'heartbeat_at'
              then 'STALE_NO_HEARTBEAT: heartbeat berhenti > 20 menit (app ditutup paksa / crash / PC mati / macet)'
            else 'STALE_NO_HEARTBEAT: running > 6 jam tanpa heartbeat (app ditutup paksa / crash / PC mati / macet)'
          end
      where s.status = 'running'
        and (
          (coalesce(s.metadata, '{}'::jsonb) ? 'heartbeat_at'
            and (s.metadata->>'heartbeat_at')::timestamptz < now() - interval '20 minutes')
          or
          (not (coalesce(s.metadata, '{}'::jsonb) ? 'heartbeat_at')
            and s.started_at < now() - interval '6 hours')
        )
      returning s.id, s.account_id, s.platform, s.started_at, s.metadata, s.error_message
  loop
    select b.name, m.label into v_brand, v_label
      from public.resource_management_messaging_accounts m
      left join public.resource_management_brands b on b.id = m.brand_id
      where m.id = r.account_id;

    insert into public.resource_management_alerts
      (kind, severity, platform, brand, account_id, account_label, pc_name, run_id, message, dedupe_key)
    values (
      'scrape_stuck',
      'error',
      r.platform,
      v_brand,
      r.account_id,
      v_label,
      r.metadata->>'pc_name',
      r.id,
      r.error_message || ' — mulai ' ||
        to_char(r.started_at at time zone 'Asia/Kuala_Lumpur', 'DD Mon HH24:MI') || ' (MYT)',
      'scrape_stuck:' || coalesce(r.account_id::text, r.id::text)
    );
    n := n + 1;
  end loop;

  return n;
end;
$$;

revoke all on function public.rm_alert_check_stuck_runs() from public, anon, authenticated;

-- 5. Pembersihan sekali jalan (sebelum cron aktif → tidak ada banjir alert) ------
update public.resource_management_scrape_runs
  set status = 'failed',
      completed_at = coalesce(completed_at, now()),
      error_message = coalesce(error_message || ' | ', '') ||
        'STALE_LEGACY_RUNNING: dibersihkan migrasi 041 (running > 6 jam sebelum alert aktif)'
  where status = 'running'
    and started_at < now() - interval '6 hours';

-- 6. Jadwal cron (job dengan nama sama di-update, bukan diduplikasi) ------------
select cron.schedule(
  'rm_alert_stuck_runs',
  '*/5 * * * *',
  $cron$select public.rm_alert_check_stuck_runs();$cron$
);

-- 7. Alert uji ------------------------------------------------------------------
create or replace function public.rm_alert_test(p_message text default 'Tes alert GM Apps')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.resource_management_alerts (kind, severity, message)
  values ('test', 'info', coalesce(nullif(trim(p_message), ''), 'Tes alert GM Apps'))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.rm_alert_test(text) from public, anon, authenticated;
