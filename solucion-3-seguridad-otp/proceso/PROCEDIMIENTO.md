# Procedimiento de desarrollo mejorado (caso piloto: seguridad de Verificarlo)

Objetivo: que todo cambio recorra el mismo camino **riesgo → requisito → diseño → código → prueba → revisión**, y que ese camino se pueda comprobar automáticamente.

## Flujo

| Paso | Qué se hace | Dónde queda la evidencia |
| --- | --- | --- |
| 1. Identificar | Registrar el riesgo y el requisito que lo mitiga | `proceso/requisitos.json` |
| 2. Diseñar | Anotar en el campo `diseno` qué componente lo resuelve | `proceso/requisitos.json` |
| 3. Implementar | Escribir el código y etiquetarlo con `// @req ID` | `src/`, `sql/` |
| 4. Probar | Crear la prueba con el ID entre corchetes en su nombre | `tests/` |
| 5. Comprobar | Ejecutar `npm run check` (trazabilidad + pruebas) | Matriz generada |
| 6. Revisar | Abrir un pull request con la plantilla; otro integrante lo revisa | `.github/pull_request_template.md` |
| 7. Controlar | La integración continua rechaza el cambio si hay huecos | `.github/workflows/solucion-3-ci.yml` |
| 8. Mejorar | Revisar los indicadores y ajustar el procedimiento | Sección siguiente |

## Relación con los procesos del ciclo de vida (NTP ISO/IEC 12207)

| Proceso | Cómo se aplica en el piloto |
| --- | --- |
| Definición de requisitos | Catálogo RF/RNF con ID único |
| Diseño / arquitectura | Campo `diseno` y diagrama de la solución |
| Implementación | Código en Next.js + TypeScript con etiquetas `@req` |
| Verificación | 24 pruebas automáticas ligadas a requisitos |
| Validación | Demo con Postman: 100 intentos de fuerza bruta |
| Gestión de riesgos | Registro R-01 a R-08, cada uno mitigado por requisitos |
| Gestión de la configuración | Repositorio GitHub, ramas y pull requests |
| Aseguramiento de la calidad | Revisión de pares + control automático en CI |
| Medición | Indicadores de la tabla siguiente |

> [SUPUESTO] Los nombres de los procesos deben alinearse con la edición de la NTP que use el curso.

## Indicadores del proceso

| Indicador | Cómo se mide | Meta |
| --- | --- | --- |
| Requisitos con código y prueba | `npm run trazabilidad` | 100 % |
| Riesgos mitigados por al menos un requisito | `npm run trazabilidad` | 100 % |
| Pruebas automáticas aprobadas | `npm test` | 100 % |
| Intentos de fuerza bruta bloqueados | Postman + `sql/kpi.sql` | ≥ 95 % |
| Cambios revisados por otro integrante | Pull requests aprobados | 100 % |

## Cómo agregar un requisito nuevo

1. Agregar el riesgo (si es nuevo) y el requisito en `proceso/requisitos.json`.
2. Etiquetar el código con `// @req RNF-12` (o `-- @req` en SQL).
3. Escribir la prueba: `it("[RNF-12] descripción", ...)`.
4. Ejecutar `npm run check`. Si falta algún enlace, el comando indica cuál.
