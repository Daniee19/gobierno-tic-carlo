-- Verificarlo Demo - Solución 3 (Seguridad). Prototipo con datos simulados.
-- Ejecutar completo en el SQL Editor de Supabase o con psql contra un PostgreSQL de Docker.

create table if not exists usuarios (
  email   text primary key check (email = lower(email)),
  nombre  text not null,
  rol     text not null check (rol in ('admin', 'asesor')),
  activo  boolean not null default true
);

-- Desafíos OTP: nunca se guarda el código, solo su HMAC con sal. @req RNF-02 RNF-03 RNF-04
create table if not exists otp_challenges (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  salt        text not null,
  code_hash   text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  attempts    integer not null default 0 check (attempts >= 0),
  consumed_at timestamptz
);
create index if not exists otp_challenges_email_idx
  on otp_challenges (email, created_at desc) where consumed_at is null;

create table if not exists inspecciones (
  id_inspeccion  integer primary key,
  fecha          date not null,
  nombre_cliente text not null,
  placa          text not null,
  marca          text not null,
  modelo         text not null,
  resultado      text not null,
  link_informe   text
);

-- Registro de auditoría: SOLO INSERCIÓN. @req RNF-06 RNF-07
create table if not exists audit_log (
  id        bigserial primary key,
  ts        timestamptz not null default now(),
  usuario   text,
  accion    text not null,
  recurso   text,
  ip        text,
  resultado text not null check (resultado in ('exito', 'fallo', 'bloqueado')),
  detalle   jsonb
);
create index if not exists audit_log_ts_idx on audit_log (ts desc);
create index if not exists audit_log_usuario_idx on audit_log (usuario, ts desc);
create index if not exists audit_log_accion_idx on audit_log (accion, resultado);

create or replace function audit_log_solo_insercion() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_log es de solo inserción: % no permitido', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists audit_log_no_update_delete on audit_log;
create trigger audit_log_no_update_delete
  before update or delete on audit_log
  for each row execute function audit_log_solo_insercion();

drop trigger if exists audit_log_no_truncate on audit_log;
create trigger audit_log_no_truncate
  before truncate on audit_log
  for each statement execute function audit_log_solo_insercion();

-- Defensa adicional (opcional en producción): la aplicación debería conectarse con un rol
-- que solo tenga INSERT y SELECT sobre audit_log, distinto del dueño de las tablas.
--   create role verificarlo_app login password '<contraseña-larga>';
--   grant select, insert on audit_log to verificarlo_app;
--   grant usage, select on sequence audit_log_id_seq to verificarlo_app;
--   grant select on usuarios, inspecciones to verificarlo_app;
--   grant select, insert, update on otp_challenges to verificarlo_app;
--   revoke update, delete, truncate on audit_log from verificarlo_app;
