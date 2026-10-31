# Guía para el desarrollador frontend

No necesitas credenciales, base de datos ni Excel para empezar: la API funciona en **modo mock**, con datos sintéticos rotulados.

## Arranque (instalación limpia, probada el 31/10/2026 con Node 24 en Windows)

```bash
git clone <URL del repositorio> && cd G2EXCHANGE
git checkout entrega/frontend-handoff-20261031
npm run setup              # instala valuation_engine, server y client (npm ci)
npm run sectorial:build    # compila el motor sectorial y la UI de referencia
npm run sectorial:mock     # API + UI de referencia en http://127.0.0.1:3200 (sin MySQL)
```

Comprobación rápida: `GET http://127.0.0.1:3200/api/sectorial/health` → `{"status":"OK","mode":"MOCK_SINTETICO"}`.

Pruebas: `npm run sectorial:test` (39 de regresión + 88 de integración, sin MySQL ni Excel).

## Contratos

- Tipos TypeScript: `sectorial/app/contracts/api.d.ts`
- OpenAPI: `sectorial/app/contracts/openapi.yaml`
- Respuestas reales de ejemplo (generadas ejecutando la API): `sectorial/app/mocks/*.json` (`npm run sectorial:mocks` las regenera)
- Resumen de endpoints: `API.md`

## Datos mock

| id | Caso |
|---|---|
| -1 … -16 | Un expediente completo por sector. `GET /examples/{sector}` devuelve una configuración válida; envíala a `POST /companies/{id}/evaluate` para obtener los tres escenarios |
| -101 | Clasificación sin resolver (sector N/A): sin modelo; permite probar la clasificación declarada |
| -102 | Histórico con conceptos CONFLICTIVOS (KPI bloqueados por dependencia) |
| -103 | Conceptos ausentes: valoración BLOQUEADA |

La fecha de valoración de los mocks es fija (2026-03-31). Las ejecuciones se guardan en `sectorial/app/data/` (ignorado por Git).

## Flujo de pantallas sugerido (es el que implementa la UI de referencia en `sectorial/app/client/App.jsx`)

1. Búsqueda → `GET /companies?q=&limit=&offset=`
2. Ficha → `GET /companies/{id}?asOf=`: muestra `snapshot.periods[].fields` con su `validation` (VALIDADO / PENDIENTE / CONFLICTIVO) y `result.issues` (motivos de bloqueo).
3. PCV / KPI → `GET /companies/{id}/pcv`, `GET /companies/{id}/kpis` (los KPI tienen `status` y `cause`).
4. Hipótesis → formulario guiado por `model.drivers`, `model.constants` y `model.descriptions`. Cada valor exige `source` y `referenceDate`.
5. Cálculo → `POST /companies/{id}/evaluate` (cabecera `X-Sectorial-Token` de `GET /session`). Devuelve `id` y `result`.
6. Escenarios → `result.scenarios[0..2]`: `valuePerShare` (null si no es estimable) y `states` (5 ejercicios).
7. Coste de capital → `GET /runs/{id}/capital`. Primas → `POST /runs/{id}/premium-simulation` (simulación, nunca aprobada).
8. Excel → `POST /runs/{id}/export` → consultar `GET /runs/{id}/job` → `GET /runs/{id}/xlsx` (sólo si la validación nativa ha pasado).
9. Cobertura → `GET /coverage`.

## Reglas de presentación obligatorias

- `null` significa "no estimable" o "sin dato", **nunca cero**. Muestra la causa (`issues`, `cause`, `requiredInputs`).
- `status: BLOQUEADO` no es una valoración. Una exportación de un expediente bloqueado es un **diagnóstico**.
- `result.source === 'QA_SINTETICO_NO_EMPRESA'` debe verse claramente como dato sintético.
- `financialApproval` es siempre `PENDIENTE` en esta versión: ninguna valoración está aprobada.
- Primas: `estadoFinanciero: NO_ESTIMABLE` con `ajusteOperativo: 0` significa "sin estimación", no "riesgo cero".

## Desarrollo con Vite

Opción recomendada: proxy de Vite (sin CORS), en `vite.config.js` → `server.proxy: {'/api/sectorial': 'http://127.0.0.1:3200'}`.
Alternativa: `G2_SECTORIAL_CORS_ORIGINS=http://127.0.0.1:5173 npm run sectorial:mock`.

## Frontend existente

- `client/`: app Vite/React del proyecto; `client/src/main.jsx` monta hoy `CapitalApp.jsx` (módulo Capital, API `/api/capital` en el puerto 3100).
- `sectorial/app/client/`: UI de referencia del módulo sectorial (se compila en `sectorial/app/public` con `npm run sectorial:build`).
