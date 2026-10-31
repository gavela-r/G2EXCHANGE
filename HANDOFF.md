# Traspaso de G2EXCHANGE (31/10/2026)

Versión congelada para entregar a otro desarrollador. **Fuente de verdad del código**: la rama `entrega/frontend-handoff-20261031`. Guía de documentos:
- `SETUP.md`: instalación;
- `ARCHITECTURE.md`: arquitectura;
- `DATABASE.md`: esquema, migraciones e identidad;
- `DATA_SOURCES.md`: fuentes;
- `VALUATION_ENGINE.md`: CAPM, WACC, DCF y KPI;
- `VALUATION_MODELS.md`: los 16 modelos;
- `API.md` y `FRONTEND_HANDOFF.md`: API y frontend;
- `OPERATIONS.md`: operación;
- `COVERAGE_REPORT.md`: cobertura;
- `TEST_REPORT.md`: pruebas.

Leyenda: **IMPL** implementado · **PROB** probado · **MYSQL** aplicado en MySQL operativo · **VERIF** verificado en producción · **PEND** pendiente · **EXT** bloqueado por una limitación externa.

## 1. Estado de los módulos
| Módulo | Estado | Notas |
|---|---|---|
| Backend (`server/`), motor (`valuation_engine/`), Capital v2 | IMPL · PROB | compila; ver `TEST_REPORT.md` |
| 16 modelos sectoriales + Excel | IMPL · PROB | motor `684a9340…`; Excel nativo 16/16 con el exportador portable |
| API sectorial + mocks | IMPL · PROB | `API.md` y `sectorial/app/contracts/` |
| Frontend (`client/`) | IMPL (base) | `FRONTEND_HANDOFF.md` |
| Guardián HTTP de proveedores | IMPL · PROB | FinMind, J-Quants y Eulerpool |
| Corrección del periodo SEC (582.430 PCV), equivalencias JP, efectivo JP | IMPL · PROB · MYSQL · VERIF | migración 31 |
| Identidad cruzada TW/JP (112 instrumentos, 298 informes, 1.160 en cuarentena) | IMPL · PROB · MYSQL · VERIF | migración 32 |
| Emisores extranjeros SEC en su moneda (1.188 informes) | IMPL · PROB · MYSQL · VERIF | |
| Taiwán: anual = suma T1–T4 (33.096 PCV de 2.598 informes y 666 empresas, lotes 1–3) | IMPL · PROB · MYSQL · VERIF | descarga FinMind completa (906/906, 0 fallidas); **sigue 0 % certificado** (normalizado ≠ certificado) |
| Días operativos (DSO, DPO, DIO, CCC sobre ventas y convencionales), NWC y ΔNWC históricos | IMPL · PROB · VERIF (Apple, Microsoft, ASML con datos reales) | derivados al vuelo de PCV certificados (`kpi.cjs`); sin migración; `VALUATION_ENGINE.md` §4 bis |
| Proyección del circulante por días (metodología `SOBRE_VENTAS` por defecto o `CONVENCIONAL`) en los modelos 1–12, 15 y 16 | IMPL · PROB (motor + Excel 16/16) | ΔNWC restado una vez en el FCFF; banca y seguros no aplican |
| Cargador FinMind sin sobrescritura de importes | IMPL · PROB (integración MySQL aislado) | antes `ON DUPLICATE KEY UPDATE importe`; ahora conserva la fila existente |
| `SELECCION_OBSERVACIONES_V1` (contradicciones) | IMPL · PROB · MYSQL (vía KPI) · VERIF | ningún informe queda bloqueado entero |
| Perímetro de ROE (dominante/total) | IMPL · PROB · MYSQL (vía KPI) | |
| KPI recalculados (25.950 + 906 informes) con la causa de cada retirada | IMPL · PROB · MYSQL · VERIF | snapshots reversibles |
| Identidad de observación e índice único (migración 33) | IMPL · PROB · MYSQL · VERIF | datos intactos (hash idéntico), 1.123.912 filas con identidad |
| Cargadores idempotentes | IMPL · PROB (integración en MySQL aislado) | los recuperadores en ejecución usan aún el código anterior (§3) |
| Perímetro del beneficio y del patrimonio | IMPL · PROB | cada BENEFICIO_NETO/PATRIMONIO_NETO lleva su perímetro (dominante/total); ROE solo con perímetros iguales en backend **y** capa sectorial (corregido); margen neto y ROA informan el perímetro; EPS = diluido declarado (dominante); el DCF usa EBIT (independiente del perímetro) |
| Participaciones no dominantes en el puente EV → patrimonio (motor del backend) | IMPL · PROB | antes se restaba 0 en silencio; ahora total − dominante del mismo informe o aviso `NO_ESTIMABLE` |
| Extracción de un concepto separado para el beneficio atribuible en EDINET | PEND · EXT | requiere descargar documentos EDINET; las claves EDINET están comprometidas |
| Certificación de Taiwán | EXT | condiciones de TWSE; verificador MOPS manual listo (`sectorial/app/tools/verificar_mops_local.cjs`) |
| Valoración de ADR | BLOQUEADA a propósito | backend: `ADR_RATIO_PENDIENTE` para emisores 20-F y `FX_PENDIENTE` si la moneda difiere (corregido: antes un 20-F en USD pasaba); sectorial: valor por acción ordinaria en la moneda de presentación, sin comparación con el precio del ADS |
| Taxonomía IFRS JP (Toyota, Sony: ingresos, beneficio bruto, CAPEX, acciones) | PEND · EXT | no hay documentos en caché y descargarlos exige una clave EDINET; las tres están comprometidas. Tras la rotación: ampliar `edinetAnualVerificado.ts` y verificar los cuatro ejercicios |
| Primas de liquidez y tamaño | PEND (calibración) | `NO_ESTIMABLE` con ajuste operativo 0 y valoración en `REVIEW`; Excel y PDF lo rotulan como no estimable (corregido: el Excel decía solo `REVIEW`) |

## 2. Migraciones (estado exacto)
| Migración | Ensayada en copia aislada | Aplicada | Reversible |
|---|---|---|---|
| 31 (registro `b071eb37…`) | sí (aplicar, rollback, reaplicar, idempotencia) | sí, verificada | `private_backups/reparacion-aislada/31_datos_b071eb37281c.rollback.sql` |
| KPI (snapshots) | sí (restauración con hash idéntico) | sí | `server/scripts/recalcular-kpi-correcciones.cjs --restaurar <snapshot>` |
| 32 (lote `57747083…`) | sí | sí, verificada | `private_backups/reparacion-produccion-32/32_datos_57747083e27c.rollback.sql` |
| Taiwán lote 1 (`0314c499…`), lote 2 (`defddff2…`) y lote 3 (`d60c9f8a…`, 4.204 PCV, 507 informes, 134 empresas) | sí (lote 3: aplicar, rollback con huella restaurada, reaplicar e idempotencia) | sí, verificados (lote 3: huella `509253268` idéntica a la del ensayo, 4.204 auditadas, 0 discrepancias; lotes 1 y 2 intactos) | `private_backups/reparacion-tw-lote*/…rollback.sql` |
| KPI del lote 3 | simulación previa | sí: 507 informes, 5.813 cambiados, 1 nuevo, 436 retirados (`PRERREQUISITO_DEUDA_V2`) | `private_backups/reparacion-tw-lote3/kpi_snapshot.ndjson` |
| 33 (identidad de observación) | sí | sí, verificada | `server/sql/33_pcv_identidad_observacion.rollback.sql` |
| 30 (taxonomía sectorial) | — | **no** | — |

**Incidente durante la migración 33**: el `ALTER` esperó unos 35 minutos por el bloqueo de metadatos que retenía la auditoría estructural de Codex (proceso 7180, con una transacción de solo lectura abierta). Mientras tanto quedaron en espera las consultas a `partida_contable_valor`. No se canceló nada: la auditoría terminó, la migración completó y se verificó que no hubo cambios parciales. Lección: `OPERATIONS.md` §4.5.

## 3. Recuperadores: estado y transición
- **Estado al congelar**: vigilantes US (`pcv-us-complementos-v5`) y JP (`pcv-jp-complementos-identidad-v5`) **detenidos** con `stop.request`; no habían escrito nada desde la migración 33. Coordinador (`recuperar-pcv-plan.cjs`, PID 22200): parada solicitada con `--stop`, estado `STOPPING`; espera a que termine su tarea de métricas (`auditar-cobertura-estructural.cjs --after`, solo lectura) y sale sin relanzar vigilantes. **Ningún proceso escritor activo.** Checkpoints y journals intactos.
- **Motivo**: ejecutaban el código anterior del árbol operativo (PCV sin `identidad_observacion`, KPI sin `SELECCION_OBSERVACIONES_V1` ni perímetro de ROE, cargador FinMind que sobrescribía importes). El coordinador antiguo, además, retira los `stop.request` tras su mantenimiento, así que había que detenerlo a él también.
- **Cambios locales de Codex protegidos** sin tocar su árbol ni su índice: rama local `codex-wip-20261101` (commit `b09643c`, 174 archivos, 0 secretos) y archivo `private_backups/codex-wip-20261101.tar` (sha256 `c023a5a6…`). El código de entrega contiene todo lo de esa instantánea (0 archivos perdidos; las diferencias son correcciones posteriores).
- **Transición preparada y probada**: worktree operativo `G2EXCHANGE_operativo/` (commit de entrega, `private_backups` enlazado sin copiar, sin `.env`). `node server/scripts/transicion-recuperadores.cjs --comprobar` verifica: ningún recuperador vivo, código compilado con identidad, migración 33 en MySQL, checkpoints legibles y ninguna credencial comprometida. Hoy falla **solo** por credenciales (no hay `.env` nuevo), que es el comportamiento esperado.
- **Reanudar** (cuando el propietario haya rotado las claves):
  1. copiar en `G2EXCHANGE_operativo/.env` las variables con las claves **nuevas**;
  2. `node server/scripts/transicion-recuperadores.cjs --comprobar` → todo `OK`;
  3. `node server/scripts/transicion-recuperadores.cjs --reanudar` (retira las pausas);
  4. desde `G2EXCHANGE_operativo/`: `node server/scripts/recuperar-pcv-plan.cjs --write --resume --resume-jobs`;
  5. no volver a lanzar recuperadores desde `G2EXCHANGE/`.
- **Descarga FinMind de Taiwán**: terminada (906/906); aplicada como lote 3.

## 4. Transferencia privada (no está en Git)
| Elemento | Ubicación original | Motivo |
|---|---|---|
| `.env` con credenciales | `G2EXCHANGE/.env` | secretos: transferir por un canal seguro o regenerar las claves (J-Quants y Eulerpool deben rotarse) |
| Volcado MySQL operativo | `G2EXCHANGE/private_backups/g2-2026-10-31T11-14-50-485Z.sql` (5,2 GB, sha256 `5b43bb22…`), o un volcado nuevo con `server/scripts/backup-db.cjs` | datos privados y sujetos a licencias |
| Registros de correcciones, rollbacks y snapshots | `G2EXCHANGE/private_backups/reparacion-*` | contienen importes; necesarios para revertir |
| Cachés de proveedores | `private_backups/pcv-us-bulk-20261029`, `jquants-v2`, `eulerpool-tw`, `finmind-tw-trimestral` | licencias (JPX y Eulerpool no permiten redistribuir) |
| Checkpoints de recuperadores | `private_backups/pcv-*` | operativos |
| Exportador corporativo de Excel | `@oai/artifact-tool` (entorno Codex) | privado; el exportador portable del repositorio basta para validar |

**Credenciales comprometidas (historial de `main` y `origin/main`, anterior a esta entrega).** El escaneo encontró 16 valores del `.env` escritos en versiones antiguas de `server/insercionDatos/*.ts`; otras 4 variables reutilizan alguno de esos valores. La rama `entrega/frontend-handoff-20261031` no contiene ninguno (escaneo de todo su historial, 0 coincidencias) y no se ha publicado. Las huellas SHA-256 (nunca los valores) están en `private_backups/credenciales-comprometidas.sha256.json`; `server/scripts/transicion-recuperadores.cjs` impide reanudar mientras alguna variable configurada coincida con ellas.

| Proveedor | Variables afectadas | Revocación (la hace el propietario en el panel de su cuenta) |
|---|---|---|
| FinMind | `FINMIND_TOKEN`, `FINMIND_TOKEN_1`…`_4`, `EC_FINMIND_TOKEN` | regenerar el token de cada cuenta; si no hay opción, cambiar la contraseña y emitir uno nuevo |
| EDINET (FSA) | `EDINET_API_KEY`, `EDINET_API_KEY_1`…`_3` | reemitir la clave de suscripción de la API EDINET |
| J-Quants | `EC_JQUANTS_API_KEY` | reemitir la clave de API |
| Alpaca | `ALPACA_KEY`, `ALPACA_SECRET`, `EC_ALPACA_API_KEY`, `EC_ALPACA_API_SECRET` | regenerar el par clave/secreto (invalida el anterior) |
| Finnhub | `FINNHUB_KEY`, `FINNHUB_API_KEY` | regenerar la clave |
| FRED | `FRED_API_KEY` | borrar la clave y solicitar otra |
| Twelve Data | `TWELVE_DATA_KEY` | regenerar la clave |
| Alpha Vantage | `EC_ALPHA_VANTAGE_API_KEY` | solicitar una clave nueva y pedir al proveedor la baja de la anterior |

Pasos: (1) revocar y emitir cada clave; (2) escribir las nuevas solo en el `.env` local; (3) `node server/scripts/transicion-recuperadores.cjs --comprobar` debe dar `OK credenciales_nuevas`; (4) no copiar el `.env` antiguo al entregable. Reescribir el historial de `main` exige `push --force` y no se ha hecho: es decisión del propietario.

Comprobación tras transferir: el sha256 del volcado (`.sha256`), la restauración (`SETUP.md` §4) y `npm run sectorial:coverage`.

**Espacio en disco**: las carpetas `G2EXCHANGE/private_backups/bundle-validation-*` (≈ 34 GB) son validaciones de Codex con copias de volcados del propio `private_backups`. Los tamaños coinciden con los originales, pero falta comparar su sha256 con los archivos `.sha256` del principal. Hasta entonces se conservan. `pcv-recovery-controls-2026-10-30T02-20-10-655Z.tar` (30 GB) tiene su propio manifiesto y no es redundante.

## 5. Pendiente (orden recomendado)
1. **Propietario**: revocar las 20 variables comprometidas (§4) y configurar el `.env` nuevo; después reanudar los recuperadores (§3).
2. Con una clave EDINET nueva: mapear la taxonomía IFRS (Toyota, Sony) y extraer el beneficio atribuible como concepto separado; verificar los cuatro ejercicios con evidencia primaria.
3. Certificación de Taiwán: consentimiento de TWSE o descargas manuales de MOPS (`DATA_SOURCES.md`).
4. ADR: acreditar ratio de representación y tipo de cambio (hoy bloqueado).
5. Calibrar las primas (hoy `NO_ESTIMABLE`).
6. Liberar `bundle-validation-*` tras verificar su sha256.
7. Opcional: persistir los días operativos en `kpi_financiero_informe`; aceptar inventario nulo con evidencia.
