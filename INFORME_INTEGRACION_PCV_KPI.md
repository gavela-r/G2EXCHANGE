# G2EXCHANGE — Integración de proveedores y recuperación PCV/KPI (31/10/2026)

Rama `entrega/frontend-handoff-20261031` (worktree `G2EXCHANGE_entrega`). Continúa `INFORME_FINAL_ENTREGA.md`. **No se ha hecho push.** Todas las cifras son mediciones reales; los escenarios simulados se rotulan como tales.

## Resumen

- **Cobertura certificada vigente (MySQL)**: sin cambios. No se ha escrito en la base operativa.
  - EE. UU.: 15–18,5 % de PCV y 10–12,6 % de KPI.
  - Japón: 50–68 % de PCV y 28–52 % de KPI.
  - Taiwán: 0 % en ambos.
- **Causa de casi todos los conflictos de EE. UU.**: es un error de ingesta, no una discrepancia real con la SEC. El PCV guardado es el comparativo de 1–3 ejercicios anteriores del mismo 10-K. Esto se ha probado contra los candidatos de la SEC y contra `companyfacts`.
- **Correcciones preparadas, no ejecutadas**: tres reglas versionadas y la migración 31, reversible. Si se aplicaran, el escenario simulado da:
  - EE. UU.: 43–46 % de PCV y 29–31 % de KPI.
  - Japón: 58–70 % de PCV y 48–58 % de KPI.
- **El 85 % no se alcanza en ninguna combinación** de país y año.
- **Taiwán**: siguen sin verificación oficial automatizable, porque las condiciones de TWSE la prohíben. Se han encontrado y corregido en el código dos defectos graves de datos:
  - documentos japoneses asignados a empresas taiwanesas;
  - resultados trimestrales guardados como anuales.

## 1. Estado real de J-Quants
- **Autenticación y plan**: la conexión con la clave en `x-api-key` funciona. Llamadas reales:
  - `/v2/fins/summary` responde 200;
  - `/v2/fins/details` (estados BS/PL/CF completos) responde 403, «not available on your subscription», porque es del plan Premium. Queda memorizado y no se vuelve a pedir.
- **Plan Free**: 2 años de historia con 12 semanas de retraso. En la práctica, del 08/08/2024 al ~07/08/2026. `fins/summary` tiene un límite propio de 60 peticiones por minuto; usamos 30.
- **Descarga completa**: 521 días hábiles, 37.877 resúmenes de 決算短信, de ellos 12.675 de ejercicio completo (FY). Hubo 66 días fuera del plan (400/403) y 0 bloqueos.
- **Rango de datos**: EDINET sigue siendo la fuente principal y EDINET DB el respaldo. J-Quants solo cubre ejercicios con cierre de agosto de 2024 en adelante.
- **Condiciones de uso**: JPX restringe el servicio a inversores individuales, sin uso comercial ni redistribución. Los datos se quedan en `private_backups/jquants-v2/` y no se copian a la rama.
- **Código**: `server/src/proveedores/conectores.ts` (`JQuants`) y `server/scripts/jquants-resumenes.cjs`, reanudable y con checkpoint.

## 2. Estado real de Eulerpool
- **Autenticación**: `Authorization: Bearer`, según su OpenAPI oficial. Las cabeceras indican 100.000 llamadas al mes; quedaban 99.968 tras la muestra.
- **Condiciones**: plan de uso no comercial. Su web prohíbe expresamente extraer datos del HTML; solo se usa la API. Los datos están en `private_backups/eulerpool-tw/`.
- **TSMC, Hon Hai y MediaTek**: devuelve cuenta de resultados, balance y flujos de 2022, 2023, 2024 y 2025, en millones de TWD, con ISIN. También incluye estimaciones a partir de 2026 (con sufijo `e`), que se descartan. No da fecha de publicación ni documento de origen.
- **Fiabilidad**: los agregados `allAssets`, `assets` y `equity` no son totales fiables. En Hon Hai 2024, `allAssets` vale 3,42 billones de TWD frente a 4,39 del balance. Están excluidos del mapa.
- **Uso**: solo corroboración. Por eso no certifica ningún PCV.
- **Muestra**: 30 llamadas para 10 empresas, sin fallos. La descarga de las 906 empresas taiwanesas con informe de FinMind está en curso (ver §3).

## 3. Cobertura obtenida con ambas APIs (corroboración, no certificación)

**J-Quants frente a los PCV de Japón** (`sectorial/app/coverage/contraste_jp_jquants.json`): comparación celda a celda de 6 conceptos, con el último informe anual de cada empresa.

| Año | Celdas comparables | Coinciden exacto | Coinciden salvo redondeo a millones (< 1 M¥) | Discrepan |
|---|---|---|---|---|
| 2022 | 6 | 1 | 0 | 5 |
| 2023 | 24 | 4 | 6 | 14 |
| 2024 | 3.485 | 898 | 1.795 | 792 |
| 2025 | 13.055 | 5.139 | 4.889 | 3.027 |

**J-Quants por concepto (2025)**:
- **INGRESOS, EBIT, ACTIVOS_TOTALES y FLUJO_CAJA_OPERATIVO**: coinciden en el 98–99 % de los casos.
- **BENEFICIO_NETO**: diferencia de definición. J-Quants da el atribuible a la dominante y el PCV incluye minoritarios.
- **EFECTIVO**: diferencia de definición, `CashEq` frente a `CashAndDeposits`.

**Eulerpool frente a los PCV de Taiwán (muestra de 10 empresas)**:
- Solo 6–7 de las 10 empresas tienen informe de fuente taiwanesa; TSMC y MediaTek no tienen ninguno (ver §6).
- **Cuadran** (cociente 1,000): flujos, beneficio antes de impuestos, inventarios y cuentas a pagar.
- **Valen el 21–34 % del anual**: INGRESOS, BENEFICIO_BRUTO, EBIT y BENEFICIO_NETO. Es el error trimestral explicado en §4.

**Eulerpool frente a los PCV de Taiwán, ampliación PARCIAL**: 183 empresas con informe de FinMind de las 906 previstas. La descarga sigue y se puede reanudar con `server/scripts/eulerpool-taiwan.cjs`. Resultado en `sectorial/app/coverage/contraste_tw_eulerpool.json`:

| Año | Celdas comparables | Coinciden | Discrepan | Resultados con valor en el rango del trimestre aislado (15–45 % del anual) |
|---|---|---|---|---|
| 2022 | 1.722 | 570 | 1.152 | 415 de 692 |
| 2023 | 1.857 | 584 | 1.273 | 433 de 696 |
| 2024 | 1.845 | 598 | 1.247 | 452 de 692 |
| 2025 | 1.277 | 377 | 900 | 454 de 692 |

Entre el 60 % y el 66 % de las celdas de resultados de Taiwán caen en el rango del trimestre aislado, lo que confirma el defecto a gran escala. El resto de discrepancias incluye diferencias de definición (beneficio con o sin minoritarios, CAPEX) y los agregados de Eulerpool excluidos.

**PCV nuevos certificados por J-Quants o Eulerpool: 0**, por diseño. La política del proyecto reserva la certificación a la fuente primaria (SEC, EDINET o MOPS).

## 4. Correcciones realizadas sobre FinMind
- **Causa de los bloqueos de IP**: según la política oficial (finmind.github.io/BanIPPolicy), FinMind bloquea la IP 30 minutos cuando recibe muchas respuestas 4xx en poco tiempo. No hay logs de ejecución de FinMind guardados en disco, así que la causa se ha establecido a partir del código. El cliente:
  - repetía la misma petición con otro de los 4 tokens tras un 402 (cuota agotada) o un 429;
  - reintentaba cualquier error, incluidos los 4xx (`twFetchFinMind`);
  - lanzaba 8 trabajadores a 9 peticiones por minuto por token, es decir, hasta 2.160 peticiones por hora desde una sola IP;
  - no compartía ni guardaba el estado entre procesos.
- **Implementado** en `server/src/proveedores/guardiaHttp.ts`, el guardián HTTP global que ahora usan los seis puntos que llaman a FinMind:
  - límite global de 120 peticiones por hora, compartido entre trabajadores y procesos mediante lock de archivo, con estado persistente en `private_backups/provider-guard/finmind.json` y separación mínima de 30 s;
  - circuit breaker;
  - 400/401/402/404 nunca se reintentan y quedan memorizados durante 24 h; el 402 además abre el circuito;
  - 403 con «ip banned»: pausa de al menos 35 minutos;
  - 429 con Retry-After, en segundos o como fecha HTTP;
  - backoff exponencial limitado (5/10/20 s, como máximo 3 reintentos) para 5xx, timeouts y errores de red;
  - peticiones idénticas en curso deduplicadas;
  - el `status` dentro del JSON (por ejemplo, 402 con HTTP 200) se trata como el código HTTP correspondiente;
  - un único token, sin rotación;
  - ante una pausa, los trabajadores se detienen sin marcar la empresa como error y los informes pendientes se recalculan desde MySQL, que actúa como checkpoint.
- **Error de datos corregido en el código**: `TaiwanStockFinancialStatements` da importes de trimestre aislado y la ingesta guardaba la fila del 31-12, que es solo el T4. Ahora el anual de un concepto de resultados es la suma de T1 a T4; si falta un trimestre se omite y el EPS no se deriva (`server/src/pcv/finmindTrimestral.ts`). Validación real: en Hon Hai 2024, la suma T1–T4 de FinMind da 6.859.615.493.000 TWD, igual al anual de Eulerpool; también cuadran el beneficio bruto y el operativo.
- **Uso real del guardián en esta sesión**: 1 petición a FinMind, sin errores y sin bloqueos.

## 5. Estado de los recuperadores
- **EE. UU.**: el 22200 (`recuperar-pcv-plan`) y el 9028 (`complement-sec-v5`) siguen vivos y no se han tocado.
- **Japón**: el 7068 (`complement-identity-jp`) sigue vivo y no se ha tocado.
- **Taiwán**: no había ningún trabajador activo, solo los directorios de preparación de Codex, detenidos con `stop.request`. No se ha lanzado el reproceso de Taiwán porque escribiría PCV en MySQL; el código está listo.
- **Servicio aislado** 3200 (PID 21324): sin cambios.

## 6. Nuevos conectores oficiales
- **MOPS**: las condiciones de TWSE (sección 6) prohíben descargar datos de su web con herramientas automatizadas sin consentimiento. No se ha automatizado ninguna descarga.
  - Se ha implementado `sectorial/app/tools/verificar_mops_local.cjs`, que lee informes TIFRS de MOPS descargados manualmente.
  - Comprueba empresa (CompanyID y denominación oficial del maestro de la Open Data de TWSE), documento, ejercicio, concepto, moneda, escala, norma, perímetro consolidado e importe. La fecha de publicación la toma de un manifiesto, si existe.
  - Después compara con MySQL en modo solo lectura.
  - Probado con el informe consolidado de TSMC 2022: 14 conceptos extraídos; ingresos, beneficio bruto, EBIT, inventarios y flujo operativo coinciden con Eulerpool.
- **TWSE y TPEx OpenAPI**: tienen licencia abierta, pero solo publican el último período (ROC 115 T2, es decir, 2026 T2). No sirven para 2022–2025.
- **Identidad cruzada detectada**: 1.444 informes de 294 empresas taiwanesas (964 anuales de 2022–2025) son documentos de EDINET de emisores japoneses, asignados por colisión de código bursátil. TSMC (2330) y MediaTek (2454) solo tienen esos documentos.
  - La medición ya usa únicamente informes de la fuente del país.
  - Cuarentena preparada en `server/sql/32_informe_identidad_cuarentena.sql`, no ejecutada y sin borrado.

## 7. Mejoras SEC
- **Diagnóstico** (`sectorial/app/tools/diagnostico_conflictos.cjs`, solo lectura): de 201.910 celdas en conflicto en 2022–2025, el valor guardado es el de un cierre de 1–3 ejercicios anteriores, con la misma etiqueta. Es el comparativo del 10-K tomado en lugar del dato con fecha de cierre igual al período.
  - Prueba doble: candidatos de la SEC en MySQL y `companyfacts` de la SEC (forma 10-K, etiqueta, unidad y fecha de fin).
  - Ejemplo con Apple: los ingresos guardados de FY2022 (274.515 M$) son los de FY2020; los de FY2025 (391.035 M$) son los de FY2024, cuando la SEC da 416.161 M$.
- **Regla `US_PERIODO_V1`**: resuelve 198.602 celdas (98 %). Exige que el contexto del candidato SEC esté verificado y que todos los originales distintos estén probados como cierres de 1–3 ejercicios anteriores. Las coincidencias con cierres lejanos o posteriores no se corrigen.
- **Quedan 3.308 celdas en conflicto**:
  - unas 600 al año sin explicar;
  - unas 30 reexpresiones del mismo cierre, que requieren decidir qué versión es la buena;
  - redondeos.
- **Migración 31**: auditoría de correcciones y nuevo resultado `CONFLICT_RESOLVED`. El esquema está en el repositorio; las sentencias de datos, con 213.518 celdas en 428 lotes transaccionales, `UPDATE … WHERE id=? AND importe=<antiguo>` y su rollback, están en `private_backups/sectorial-correcciones/`. **No ejecutada.**
- **Alpha Vantage**: se mantiene como verificador complementario sin cambios (24 llamadas al día).
- **FinDataEngine** (asreported.io): ya está integrado y lo usa el recuperador 9028. Devuelve estados válidos con fecha de presentación y número de accesión, y ha aportado 27 inserciones y 42 conflictos. Su cuota gratuita del mes está agotada hasta el 01/11. No se descarta, pero se deriva de la SEC y no es independiente. No he hecho llamadas nuevas para no consumir la cuota del trabajador activo.
- **FMP**: no se ha usado.

## 8. Mejoras EDINET
- **Diagnóstico**: 31.165 celdas en conflicto en 2022–2025.
- **`JP_RESUMEN_MISMO_DOC_V1`** (14.420 celdas): una fila coincide exactamente en etiqueta e importe, y las demás son el mismo concepto en «主要な経営指標等の推移» del mismo documento, con importe idéntico.
- **`JP_SIGNO_CANONICO_V1`** (496 celdas): CAPEX con la misma etiqueta y signo opuesto; el proyecto ya usa su valor absoluto como forma canónica.
- **No se certifican** (16.249 celdas restantes): `CashAndDeposits` frente a `CashAndCashEquivalents` aunque coincida el importe, resúmenes redondeados y casos sin explicar.
- **J-Quants confirma el problema de mapeo de EFECTIVO** por una vía independiente (§3).

## 9. PCV certificados por país y ejercicio — 10. KPI certificados por país y ejercicio — 11. Antes y después

«Oficial» es la cobertura vigente en MySQL. «Tras correcciones» es el escenario simulado que resultaría de aplicar la migración 31; no se ha guardado. Universo congelado, con el mismo sha256 por país que el 30/10: US `9e0113d3…`, JP `32a2836f…`, TW `e7cb71fb…`. Denominador: universo × 17 conceptos.

| País | Año | Universo | Con informe (fuente del país) | PCV cert. 30/10 | PCV cert. oficial 31/10 | **PCV tras correcciones** | KPI cert. 30/10 | KPI cert. oficial 31/10 | **KPI tras correcciones** |
|---|---|---|---|---|---|---|---|---|---|
| US | 2022 | 8017 | 5256 | 18.5 % | 18.5 % | **43.19 %** | 12.58 % | 12.58 % | **29.44 %** |
| US | 2023 | 8017 | 5529 | 16.44 % | 16.44 % | **45.34 %** | 11.08 % | 11.08 % | **30.96 %** |
| US | 2024 | 8017 | 5666 | 16.64 % | 16.64 % | **45.62 %** | 11.09 % | 11.09 % | **31.06 %** |
| US | 2025 | 8017 | 5632 | 15.23 % | 15.23 % | **44.89 %** | 10.04 % | 10.04 % | **30.46 %** |
| JP | 2022 | 3581 | 3469 | 68.19 % | 68.2 % | **70.29 %** | 52.33 % | 52.34 % | **58.08 %** |
| JP | 2023 | 3581 | 3425 | 60.01 % | 60.01 % | **67.52 %** | 35.35 % | 35.36 % | **55.7 %** |
| JP | 2024 | 3581 | 3385 | 58.99 % | 59 % | **66.48 %** | 34.53 % | 34.54 % | **54.9 %** |
| JP | 2025 | 3581 | 3004 | 50.16 % | 50.16 % | **57.58 %** | 27.68 % | 27.68 % | **47.82 %** |
| TW | 2022 | 1596 | 820 | 0 % | 0 % | **0 %** | 0 % | 0 % | **0 %** |
| TW | 2023 | 1596 | 824 | 0 % | 0 % | **0 %** | 0 % | 0 % | **0 %** |
| TW | 2024 | 1596 | 825 | 0 % | 0 % | **0 %** | 0 % | 0 % | **0 %** |
| TW | 2025 | 1596 | 825 | 0 % | 0 % | **0 %** | 0 % | 0 % | **0 %** |

La diferencia de 0,01 pp en Japón es la variación natural entre las dos mediciones, que se tomaron con 12 horas de diferencia mientras los recuperadores seguían escribiendo.

**Techos para llegar al 85 %**:
- **EE. UU.**: la cobertura bruta es del 48–52 %. Entre el 29 % y el 34 % de las empresas no tiene informe anual en la base, y eso exige recuperar más informes.
- **Japón**: la cobertura bruta es del 78–87 %. Haría falta resolver el mapeo de EFECTIVO y BENEFICIO_NETO y verificar unos 7.000 PCV pendientes al año.
- **Taiwán**: haría falta una fuente oficial verificable (§6).

## 12. Pruebas ejecutadas
- **Servidor** (`npm test`):
  - `valuation_engine`: 20/20;
  - `server`: 252 pruebas, 251 superadas, 0 fallos y 1 omitida a propósito (integración de Capital con MySQL, que requiere `CAPITAL_DB_TESTS=1`). Incluye las nuevas:
    - `guardiaHttp.test.cjs`: 14/14;
    - `conectores.test.cjs`: 4/4;
    - `finmindTrimestral.test.cjs`: 5/5.
- **Sectorial** (`npm run sectorial:test`): regresión 39/39 e integración 96/96, que incluye la nueva `correcciones.test.cjs` (8/8).
- **Motor sectorial**: sigue con el hash `3b76805d…`, por lo que la validación nativa de Excel (16/16) sigue siendo válida.
- **Llamadas reales**:
  - J-Quants: 561 enviadas, 522 correctas y 38 respuestas 400 fuera del plan;
  - Eulerpool: muestra de 30 llamadas, más la descarga completa en curso;
  - FinMind: 1 petición;
  - todas por el guardián y sin bloqueos.
- **Integridad de producción** (`tests/integridad_claude.cjs`): 228 archivos operativos sin cambios, 16 maestros intactos y 60 valoraciones congeladas idénticas (sha256 `cb0a95e3…`).

## 13. Errores pendientes
1. **Aplicar las migraciones 31 y 32** en MySQL operativo. Requisitos previos:
   - copia verificada;
   - pausar el recuperador 9028, que escribe PCV;
   - actualizar `adapter.cjs` para que reconozca `CONFLICT_RESOLVED`; esto cambia el hash del motor y exige una nueva validación nativa;
   - aprobación explícita.
2. **Reprocesar Taiwán** con la suma trimestral (escribe PCV) y reasignar a sus empresas japonesas los documentos de EDINET con identidad cruzada.
3. **Japón**: decidir el mapeo de EFECTIVO (`CashAndDeposits` o `CashAndCashEquivalents`) y la definición de BENEFICIO_NETO (con o sin minoritarios).
4. **EE. UU.**: unas 600 celdas al año sin explicar y unas 30 reexpresiones pendientes de decidir versión; además, recuperar los informes ausentes (el 29–34 % del universo).
5. **Taiwán**: conseguir el consentimiento de TWSE para descargas automatizadas o hacer descargas manuales de MOPS para el verificador local.
6. **Excel**: los defectos visuales menores del informe anterior siguen pendientes.

## 14. Limitaciones de proveedores
| Proveedor | Limitación |
|---|---|
| J-Quants Free | Solo `fins/summary`; 2 años con 12 semanas de retraso; sin BS/PL/CF completos; uso personal sin redistribución |
| Eulerpool Free | Uso no comercial; datos estandarizados de terceros sin documento ni fecha de publicación; agregados de balance poco fiables |
| FinMind | Política de bloqueo de IP por 4xx; resultados en trimestre aislado; un solo token |
| MOPS / TWSE | Descarga automatizada prohibida sin consentimiento; Open Data solo con el último período |
| FinDataEngine | Cuota gratuita mensual agotada hasta el 01/11; derivado de la SEC |
| Alpha Vantage | 25 llamadas gratuitas al día |
| FMP | HTTP 402 en nuestros endpoints; no se usa |

## 15. Estado de MySQL
- Solo lectura en todo momento: todas las consultas son `START TRANSACTION … READ ONLY` y únicamente `SELECT`.
- No se ha reiniciado: el contenedor `mysql_valoracion` lleva 2 días levantado.
- No se ha ejecutado ninguna migración, escritura ni borrado.

## 16. Estado de Git — 17. Nuevos commits
- **Rama y remoto**: rama `entrega/frontend-handoff-20261031`, con `origin` = https://github.com/gavela-r/G2EXCHANGE.git, ya configurado.
- **Árbol de trabajo**: limpio al cerrar.
- **Autor**: la identidad configurada en el repositorio.
- **Carpeta original**: el árbol de trabajo de `G2EXCHANGE` no se ha modificado salvo el `.env` local, que está en `.gitignore`.

```
<rellenado al cerrar: git log --oneline 7d67677..HEAD>
```

## 18. Secretos
Comprobado:
- **Valores reales**: las claves de J-Quants y Eulerpool y los otros 26 valores de credencial del `.env` no aparecen en ninguno de los 777 blobs alcanzables desde HEAD, es decir, en todo el historial de la rama.
- **Patrones genéricos**: los archivos nuevos no contienen ningún patrón genérico de clave; solo valores sintéticos de prueba.
- **Archivos `.env`**: no hay ninguno versionado.
- **Datos privados**: los 670 archivos de estado del guardián y de datos descargados no contienen credenciales.
- **Las claves solo están en** `G2EXCHANGE/.env`, que git ignora.
- **Seguridad del código**: ninguna clave se imprime en logs, errores ni respuestas HTTP. Las URL se registran sin parámetros sensibles y las pruebas lo verifican.
- **Commit antiguo `0bc2dbd`**: está en `origin/main`, no en esta rama, y solo tocó un `.env` vacío.

## 19. Comando pendiente para git push
```bash
cd C:\Users\Juan\Desktop\G2_EXCHAGE\G2EXCHANGE_entrega
git push -u origin entrega/frontend-handoff-20261031
```
Sin `--force`. Antes de hacerlo, comprueba que el repositorio remoto es privado. Las claves de J-Quants y Eulerpool se pegaron en una conversación, así que conviene rotarlas en sus paneles cuando termines las pruebas.
