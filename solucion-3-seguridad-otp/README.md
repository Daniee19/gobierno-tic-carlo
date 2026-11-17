# Solución 3 - Mejora del proceso de desarrollo (NTP ISO/IEC 12207)

Prototipo con datos simulados. En producción, las fuentes serían Verificarlo (PostgreSQL) y HubSpot.

Responsable: Frantz. Tipo: proyecto de mejora de procesos conforme a la NTP ISO/IEC 12207.

**Caso piloto:** mini app "Verificarlo Demo" (Next.js + TypeScript) con login por correo + OTP seguro, rate limiting y auditoría. La app se desarrolla siguiendo el procedimiento mejorado de `proceso/PROCEDIMIENTO.md`: cada riesgo, requisito, línea de código y prueba quedan enlazados y se verifican automáticamente.

## Qué hay en la carpeta

```
proceso/        requisitos.json (riesgos y requisitos con ID), PROCEDIMIENTO.md, matriz-trazabilidad.md (generada)
scripts/        trazabilidad.ts: verifica y genera la matriz
src/            la app: pantallas, rutas API y lógica de seguridad (OTP, rate limiting, sesión, auditoría)
sql/            esquema (audit_log de solo inserción), usuarios, 800 inspecciones del dataset y consultas de KPI
tests/          24 pruebas, cada una ligada a un requisito
postman/        colección de la demo de fuerza bruta (100 intentos)
```

En la raíz del repositorio (junto a esta carpeta) van `.github/workflows/solucion-3-ci.yml` y `.github/pull_request_template.md`.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm install` | Instala dependencias |
| `npm run check` | Trazabilidad + pruebas (lo que ejecuta la integración continua) |
| `npm run trazabilidad` | Verifica enlaces requisito ↔ código ↔ prueba y regenera la matriz |
| `npm test` | Solo las pruebas |
| `npm run dev` | Levanta la app en http://localhost:3000 |

**Cómo instalarlo y correrlo según lo que necesites: ver [GUIA.md](GUIA.md).**

## Decisiones de diseño del piloto

- **OTP:** `crypto.randomInt()`, guardado como HMAC-SHA256 con sal y secreto del servidor; vence a los 5 min, 3 intentos máximo, un solo uso.
- **Rate limiting:** Upstash Redis, 5 intentos por minuto por IP y por correo. El limitador en memoria no sirve en Vercel porque cada instancia serverless tiene su propia memoria; si Redis falla, el intento se rechaza.
- **Auditoría:** `audit_log` con triggers que impiden UPDATE, DELETE y TRUNCATE; cada acción deja exactamente un evento.
- **El rate limiting vive en los endpoints y no en `middleware.ts`**, porque el middleware corre en Edge y no puede escribir en PostgreSQL; así los bloqueos también quedan auditados.

## Limitaciones [SUPUESTO]

- La entrega del OTP por correo o SMS se simula: con `DEMO_SHOW_OTP=true` el código aparece en pantalla.
- Usuarios e inspecciones son ficticios.
- Faltan: proveedor de correo, bloqueo progresivo por cuenta, revocación de sesiones y un rol de base de datos con solo INSERT sobre `audit_log`.
- La app con Next.js, Supabase y Upstash reales no se probó en el entorno donde se escribió; las 24 pruebas cubren la lógica de seguridad y el esquema SQL se probó en PostgreSQL 16.
