# Guía: cómo instalarlo y correrlo según lo que necesites

Elige la ruta. Cada una incluye a la anterior solo si lo indica.

| Necesito... | Ruta | Cuentas | Tiempo |
| --- | --- | --- | --- |
| Comprobar que las pruebas y la trazabilidad pasan | 1 | Ninguna | 5 min |
| Ver la app funcionando en mi PC | 2 | Ninguna | 10 min |
| Medir el KPI y tomar capturas con la base y Redis reales | 3 | Supabase o Docker + Upstash | 30 min |
| Publicarla en internet | 4 | Ruta 3 + Vercel | 20 min |
| Que GitHub verifique cada cambio | 5 | GitHub | 5 min |

## Requisitos previos (todas las rutas)

- **Node.js 20 o superior** (LTS). Comprueba con `node --version`.
- La carpeta `solucion-3-seguridad-otp` en la **raíz** del repositorio del equipo, al mismo nivel que `data/`, `solucion-1-integracion/`, etc. De `data/inspecciones.csv` se leen las 800 inspecciones.
- Si GitHub te muestra la carpeta como "datos" o "solución-1…", es la traducción automática del navegador: los nombres reales son `data` y `solucion-…` (sin tilde). Compruébalo en la URL (`/tree/main/data`).

Abre una terminal dentro de la carpeta:

```
cd solucion-3-seguridad-otp
npm install
```

## Ruta 1 - Solo verificar (sin cuentas)

```
npm run check
```

Resultado esperado: `Trazabilidad completa` y `# pass 24`. Se genera `proceso/matriz-trazabilidad.md`. Sirve como evidencia del proceso (capturas de ambos resultados).

## Ruta 2 - Ver la app en mi PC (sin cuentas)

1. Crea el archivo `.env.local`: copia `.env.example` (Windows: `copy .env.example .env.local`; Mac/Linux: `cp .env.example .env.local`) y deja **vacíos** `DATABASE_URL`, `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`. Deja `DEMO_SHOW_OTP=true`.
2. `npm run dev` y abre http://localhost:3000.
3. Ingresa con `asesor1@carlo.demo`. El código de 6 dígitos aparece en pantalla (no hay proveedor de correo).
4. Para ver la auditoría, cierra sesión e ingresa con `admin@carlo.demo`, luego abre **Auditoría**.

Sin base de datos ni Upstash la app usa memoria: los datos se pierden al reiniciar y el limitador no sirve en serverless. Es solo para ver las pantallas y probar la demo localmente.

## Ruta 3 - Demo completa (PostgreSQL + Upstash + Postman)

**3.1 Base de datos** (elige una):

- *Docker:*
  ```
  docker run -d --name verificarlo-db -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=verificarlo postgres:16
  docker cp sql verificarlo-db:/sql
  docker exec verificarlo-db psql -U postgres -d verificarlo -f /sql/001_schema.sql
  docker exec verificarlo-db psql -U postgres -d verificarlo -f /sql/002_seed_usuarios.sql
  docker exec verificarlo-db psql -U postgres -d verificarlo -f /sql/003_seed_inspecciones.sql
  ```
  `DATABASE_URL=postgres://postgres:postgres@localhost:5432/verificarlo` y `PGSSL` vacío.
- *Supabase:* crea un proyecto, abre **SQL Editor** y ejecuta, en este orden, el contenido de `sql/001_schema.sql`, `002_seed_usuarios.sql` y `003_seed_inspecciones.sql`. Copia la cadena de conexión (Project Settings → Database → Connection string, modo pooler) en `DATABASE_URL` y pon `PGSSL=require`.

**3.2 Redis:** crea una base gratuita en Upstash (console.upstash.com), pestaña **REST API**, y copia `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`.

**3.3 Secretos:** genera dos valores y pégalos en `OTP_PEPPER` y `SESSION_SECRET` (mínimo 32 caracteres):

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**3.4 Ejecutar:** `npm run dev`.

**3.5 Demo de fuerza bruta con Postman:**
1. Importa `postman/carlo-seguridad.postman_collection.json`.
2. Ejecuta **una vez** la carpeta *1 - Preparación*.
3. En el *Collection Runner* elige la carpeta *2 - Fuerza bruta* con **100 iteraciones** y abre la consola de Postman: muestra bloqueados/total y el porcentaje.
4. Entra como admin a **Auditoría**, filtra por resultado `bloqueado` y captura la pantalla; o ejecuta `sql/kpi.sql` en tu base.

Si repites la demo, espera 1 minuto entre corridas (ventana del rate limiting). Con el resultado de tu corrida llenas el KPI del informe.

## Ruta 4 - Publicar en Vercel

1. Sube el repositorio a GitHub.
2. En vercel.com: **Add New → Project**, importa el repositorio y en **Root Directory** pon `solucion-3-seguridad-otp`.
3. En **Environment Variables** carga: `DATABASE_URL`, `PGSSL=require`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `OTP_PEPPER`, `SESSION_SECRET` y `DEMO_SHOW_OTP=true` (solo mientras no haya proveedor de correo).
4. Despliega y usa la URL de Vercel como `baseUrl` en Postman.

En producción la app exige la base y Redis: si falta una variable, muestra el error en el registro de Vercel.

## Ruta 5 - Verificación automática en GitHub

1. Copia la carpeta `.github` a la **raíz del repositorio** (junto a `solucion-3-seguridad-otp/`).
2. Haz commit y push. En la pestaña **Actions** aparecerá "Solucion 3 - verificación" en cada cambio de la carpeta.
3. Los pull requests mostrarán la plantilla con la lista de control del procedimiento.

## Problemas frecuentes

| Síntoma | Causa y solución |
| --- | --- |
| `npm run trazabilidad` falla | El mensaje indica qué requisito no tiene código (`@req`), prueba (`[ID]`) o riesgo. Corrígelo y repite. |
| Postman devuelve 429 desde el primer intento | Ya hubo otra corrida en el último minuto; espera 1 minuto. |
| Error de SSL con Supabase | Falta `PGSSL=require` en `.env.local` o en Vercel. |
| `OTP_PEPPER es obligatoria en producción` | Falta cargar la variable (mínimo 32 caracteres) en Vercel. |
| El puerto 3000 está ocupado | `npm run dev -- -p 3001` y cambia `baseUrl` en Postman. |
| La pantalla de inspecciones sale vacía | Falta `data/inspecciones.csv` junto a la carpeta (Ruta 2) o no cargaste `003_seed_inspecciones.sql` (Ruta 3). |
| `npm run dev` da un error que no entiendes | Cópialo completo y pásamelo: la lógica está probada, pero la app con Next.js no se ejecutó en el entorno donde se escribió. |
