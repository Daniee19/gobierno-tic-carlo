# Matriz de trazabilidad (generada)

> Generada por `npm run trazabilidad` desde `proceso/requisitos.json`, las etiquetas `@req` del código y los IDs en los nombres de las pruebas. No editar a mano.

- Requisitos con código: **16/16**
- Requisitos con prueba automática: **16/16** (1 con verificación manual documentada)
- Riesgos con al menos un requisito que los mitiga: **8/8**

## Requisito → riesgo → diseño → código → prueba

| ID | Requisito | Riesgos | Diseño | Código | Pruebas | Verificación |
| --- | --- | --- | --- | --- | --- | --- |
| RF-01 | Solicitar un código OTP con un correo registrado | — | POST /api/auth/request-otp → otp-service | `src/app/api/auth/request-otp/route.ts`<br>`src/app/login/page.tsx`<br>`src/lib/handlers.ts`<br>`src/lib/security/otp-service.ts` | un OTP correcto inicia sesión con cookie HttpOnly y SameSite=Lax<br>pedir un OTP nuevo invalida el anterior | Automática |
| RF-02 | Verificar el OTP e iniciar sesión | R-01 | POST /api/auth/verify-otp → otp-service + sesión | `src/app/api/auth/verify-otp/route.ts`<br>`src/app/login/page.tsx`<br>`src/lib/handlers.ts`<br>`src/lib/security/otp-service.ts` | un OTP correcto inicia sesión con cookie HttpOnly y SameSite=Lax<br>un OTP incorrecto devuelve 401 con error genérico<br>el OTP de un correo no sirve para otro correo | Automática |
| RF-03 | Consultar inspecciones solo con sesión activa | — | GET /api/inspecciones y página /inspecciones | `src/app/api/inspecciones/route.ts`<br>`src/app/inspecciones/page.tsx`<br>`src/lib/handlers.ts` | las inspecciones solo se entregan con sesión activa | Automática |
| RF-04 | Consultar y filtrar el registro de auditoría | R-04 | GET /api/audit y página /auditoria | `src/app/api/audit/route.ts`<br>`src/app/auditoria/page.tsx`<br>`src/lib/handlers.ts` | el filtro de la auditoría devuelve solo lo pedido<br>solo el rol admin ve la auditoría; el asesor recibe 403 y el intento queda registrado | Automática |
| RF-05 | Cerrar sesión | R-07 | POST /api/auth/logout | `src/app/api/auth/logout/route.ts`<br>`src/app/logout-button.tsx`<br>`src/lib/handlers.ts` | cerrar sesión borra la cookie y queda auditado | Automática |
| RNF-01 | El OTP tiene 6 dígitos y se genera con un generador criptográfico (crypto.randomInt) | R-02 | otp.ts · generateOtp | `src/lib/security/otp.ts` | genera códigos de 6 dígitos numéricos | Automática |
| RNF-02 | El OTP se guarda solo como HMAC-SHA256 con sal y secreto del servidor | R-02 | otp.ts · hashOtp / verifyOtpHash | `src/lib/security/otp.ts`<br>`sql/001_schema.sql` | el hash no contiene el código y solo valida con la sal, el correo y el secreto correctos | Automática |
| RNF-03 | El OTP vence a los 5 minutos y es de un solo uso | R-01 | otp-service · expiración y consumo atómico | `src/lib/security/otp-service.ts`<br>`src/lib/store/memory-store.ts`<br>`src/lib/store/pg-store.ts`<br>`sql/001_schema.sql` | un OTP expirado (después de 5 minutos) se rechaza aunque el código sea correcto<br>un OTP es de un solo uso: no se puede reutilizar | Automática |
| RNF-04 | Máximo 3 intentos por código; el intento se cuenta antes de comparar | R-01 | otp-service · registerAttempt (UPDATE condicional atómico) | `src/lib/security/otp-service.ts`<br>`src/lib/store/memory-store.ts`<br>`src/lib/store/pg-store.ts`<br>`sql/001_schema.sql` | máximo ${OTP_MAX_ATTEMPTS} intentos: el siguiente se bloquea aunque el código sea el correcto | Automática |
| RNF-05 | Rate limiting de 5 intentos por minuto por IP y por correo, con estado compartido y rechazo si el limitador falla | R-01, R-03 | ratelimit.ts (Upstash) + guard en handlers | `src/lib/handlers.ts`<br>`src/lib/security/ratelimit.ts` | el intento 6 en un minuto recibe 429 con Retry-After y queda auditado como bloqueado<br>rotar la IP (cabecera falsificada) no evade el límite por correo<br>el límite se libera cuando termina la ventana<br>si el limitador falla, el intento se rechaza (503) en lugar de dejarlo pasar | Automática |
| RNF-06 | Cada acción deja exactamente un evento en audit_log (usuario, acción, recurso, IP, fecha, resultado) | R-04 | appendAudit en cada flujo; tabla audit_log | `src/lib/handlers.ts`<br>`src/lib/security/otp-service.ts`<br>`src/lib/store/memory-store.ts`<br>`src/lib/store/pg-store.ts`<br>`sql/001_schema.sql` | un formato inválido devuelve 400 y deja un evento de auditoría<br>cada acción deja exactamente un evento (trazabilidad 100 %) | Automática |
| RNF-07 | audit_log es de solo inserción (no admite UPDATE, DELETE ni TRUNCATE) | R-05 | Triggers en 001_schema.sql; el almacén no expone modificar/borrar | `src/lib/store/memory-store.ts`<br>`src/lib/store/pg-store.ts`<br>`sql/001_schema.sql` | el almacén de auditoría no expone operaciones de modificar ni borrar | Manual: Prueba en psql: UPDATE, DELETE y TRUNCATE rechazados (sql/kpi.sql, punto 4) |
| RNF-08 | Error genérico al cliente y misma respuesta para correos registrados o no | R-06 | handlers · respuestas uniformes | `src/lib/handlers.ts`<br>`src/lib/security/otp-service.ts` | un OTP incorrecto devuelve 401 con error genérico<br>la respuesta es igual para un correo registrado y uno inexistente | Automática |
| RNF-09 | Sesión en cookie firmada, HttpOnly, SameSite=Lax, vigencia de 30 minutos | R-07 | session.ts | `src/lib/handlers.ts`<br>`src/lib/security/session.ts` | un OTP correcto inicia sesión con cookie HttpOnly y SameSite=Lax<br>una cookie manipulada se rechaza<br>la sesión expira a los 30 minutos | Automática |
| RNF-10 | Solo el rol admin puede consultar la auditoría | R-08 | queryAudit · verificación de rol | `src/app/api/audit/route.ts`<br>`src/app/auditoria/page.tsx`<br>`src/lib/handlers.ts` | solo el rol admin ve la auditoría; el asesor recibe 403 y el intento queda registrado | Automática |
| RNF-11 | Al menos 95 % de 100 intentos de fuerza bruta son bloqueados (KPI) | R-01 | Combinación de RNF-03, RNF-04 y RNF-05 | `src/lib/handlers.ts`<br>`src/lib/security/otp-service.ts` | bloquea al menos 95 % de 100 intentos de fuerza bruta y registra todas las peticiones | Automática |

## Riesgos

| ID | Riesgo | Probabilidad | Impacto | Requisitos que lo mitigan |
| --- | --- | --- | --- | --- |
| R-01 | Fuerza bruta para adivinar el OTP | Alta | Alto | RF-02, RNF-03, RNF-04, RNF-05, RNF-11 |
| R-02 | OTP predecible o recuperable si se filtra la base de datos | Media | Alto | RNF-01, RNF-02 |
| R-03 | Control de intentos ineficaz en entorno serverless (estado no compartido) | Alta | Alto | RNF-05 |
| R-04 | Acciones sin rastro: no se puede investigar un incidente | Media | Alto | RF-04, RNF-06 |
| R-05 | Alteración o borrado de los registros de auditoría | Baja | Alto | RNF-07 |
| R-06 | Enumeración de usuarios por mensajes de error distintos | Media | Medio | RNF-08 |
| R-07 | Robo o manipulación de la sesión | Baja | Alto | RF-05, RNF-09 |
| R-08 | Un asesor accede a la auditoría (escalada de privilegios) | Media | Medio | RNF-10 |
