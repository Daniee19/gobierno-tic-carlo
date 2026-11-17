-- KPI de la Solución 3, calculados desde audit_log.
-- Ajusta el intervalo a la ventana de tu corrida de Postman (por ejemplo, '15 minutes').

-- 1) Intentos de fuerza bruta bloqueados (meta >= 95 %)
--    bloqueados = rate limit + máximo de intentos del OTP; intentos = todas las verificaciones.
select
  count(*)                                              as intentos_totales,
  count(*) filter (where resultado = 'bloqueado')       as bloqueados,
  round(100.0 * count(*) filter (where resultado = 'bloqueado') / nullif(count(*), 0), 1)
                                                        as pct_bloqueados
from audit_log
where accion = 'verificar_otp'
  and ts >= now() - interval '15 minutes';

-- 2) Motivo de cada bloqueo (evidencia para el informe)
select detalle->>'motivo' as motivo, count(*) as eventos
from audit_log
where resultado = 'bloqueado'
  and ts >= now() - interval '15 minutes'
group by 1
order by 2 desc;

-- 3) Eventos con trazabilidad (meta 100 %): compara este total con el número de peticiones
--    que realizó Postman (el "Runner" muestra cuántas iteraciones ejecutó).
select count(*) as filas_en_audit_log
from audit_log
where ts >= now() - interval '15 minutes';

-- 4) Prueba de solo inserción: ambas sentencias deben fallar con "audit_log es de solo inserción".
-- update audit_log set resultado = 'exito' where id = 1;
-- delete from audit_log where id = 1;
