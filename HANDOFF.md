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
| Separación completa beneficio consolidado / atribuible (concepto nuevo) | PEND | hoy: perímetro por etiqueta y ROE coherente; extraer `ProfitAttributableToOwnersOfParent` en EDINET y separar EPS/ROE por perímetro |
| Certificación de Taiwán | EXT | condiciones de TWSE; verificador MOPS manual listo (`sectorial/app/tools/verificar_mops_local.cjs`) |
| Valoración de ADR en USD | PEND | falta ratio de representación y tipo de cambio acreditado |
| Taxonomía IFRS JP (Toyota, Sony: ingresos, beneficio bruto, CAPEX, acciones) | PEND | ampliar `edinetAnualVerificado.ts` y volver a verificar |
| Primas de liquidez y tamaño | PEND (calibración) | `RISK_PREMIUM.md` |

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

## 3. Procesos al cerrar la entrega
- **Vigilantes US (`pcv-us-complementos-v5`) y JP (`pcv-jp-complementos-identidad-v5`): DETENIDOS con su parada segura** (`stop.request` con motivo `entrega-codigo-anterior`, 31/10/2026 ~22:15 UTC). Estaban inactivos desde el 30/10 y el 31/10 esperando cuota (FinDataEngine mensual, EDINET DB diaria) y no habían escrito nada desde la migración 33 (0 filas nuevas sin identidad). Motivo: ejecutan el código anterior del árbol operativo, que inserta PCV sin `identidad_observacion` y recalcula KPI sin `SELECCION_OBSERVACIONES_V1` ni el control de perímetro de ROE; al renovarse la cuota habrían reintroducido esas inconsistencias. Checkpoints y journals intactos.
- **Coordinador** (`recuperar-pcv-plan.cjs`, PID 22200): sigue en ejecución; no relanza un vigilante mientras exista su `stop.request`.
- **Por qué no se ha hecho la transición automática**: el árbol operativo `G2EXCHANGE/` tiene 51 cambios de Codex sin commit y Codex sigue activo (auditoría estructural en curso). Cambiarlo de rama no es demostrablemente seguro.
- **Procedimiento para reanudar con el código entregado** (siguiente desarrollador):
  1. comprobar que no queda ningún `recuperar-pcv-watch` vivo y que no hay transacciones largas (`information_schema.innodb_trx`);
  2. en `G2EXCHANGE/`, conservar los cambios sin commit en una rama propia (`git switch -c codex-wip-<fecha> && git add -A && git commit`), sin descartarlos;
  3. `git switch entrega/frontend-handoff-20261031` (o un clon nuevo con el `.env` y `private_backups/` existentes);
  4. `npm run setup && npm run build`;
  5. renombrar cada `stop.request` a `stop.request.previous-entrega-<epoch>`; el coordinador relanza los vigilantes con el código nuevo.
- **Descarga FinMind de Taiwán**: terminada (906/906, 0 fallidas, 31/10 19:16 UTC); su resultado ya está aplicado como lote 3.

## 4. Transferencia privada (no está en Git)
| Elemento | Ubicación original | Motivo |
|---|---|---|
| `.env` con credenciales | `G2EXCHANGE/.env` | secretos: transferir por un canal seguro o regenerar las claves (J-Quants y Eulerpool deben rotarse) |
| Volcado MySQL operativo | `G2EXCHANGE/private_backups/g2-2026-10-31T11-14-50-485Z.sql` (5,2 GB, sha256 `5b43bb22…`), o un volcado nuevo con `server/scripts/backup-db.cjs` | datos privados y sujetos a licencias |
| Registros de correcciones, rollbacks y snapshots | `G2EXCHANGE/private_backups/reparacion-*` | contienen importes; necesarios para revertir |
| Cachés de proveedores | `private_backups/pcv-us-bulk-20261029`, `jquants-v2`, `eulerpool-tw`, `finmind-tw-trimestral` | licencias (JPX y Eulerpool no permiten redistribuir) |
| Checkpoints de recuperadores | `private_backups/pcv-*` | operativos |
| Exportador corporativo de Excel | `@oai/artifact-tool` (entorno Codex) | privado; el exportador portable del repositorio basta para validar |

**Claves expuestas en el historial de `main` (anterior a esta entrega)**: el escaneo del 31/10/2026 encontró 16 credenciales del `.env` escritas en versiones antiguas de `server/insercionDatos/*.ts` en la rama `main`, también en `origin/main` (GitHub). Afecta a las claves de Finnhub (2), FRED, Alpaca (clave y secreto), Twelve Data, FinMind (5 tokens), Alpha Vantage, J-Quants y EDINET (3). La rama `entrega/frontend-handoff-20261031` no contiene ninguna (880 blobs, 0 coincidencias) y no se ha publicado. **Acción obligatoria: revocar y regenerar esas 16 claves** antes de seguir usándolas, y, si el repositorio es o fue público, valorar con el propietario la reescritura del historial de `main` (no se ha hecho: exige `push --force`).

Comprobación tras transferir: el sha256 del volcado (`.sha256`), la restauración (`SETUP.md` §4) y `npm run sectorial:coverage`.

**Espacio en disco**: las carpetas `G2EXCHANGE/private_backups/bundle-validation-*` (≈ 34 GB) son validaciones de Codex con copias de volcados del propio `private_backups`. Los tamaños coinciden con los originales, pero falta comparar su sha256 con los archivos `.sha256` del principal. Hasta entonces se conservan. `pcv-recovery-controls-2026-10-30T02-20-10-655Z.tar` (30 GB) tiene su propio manifiesto y no es redundante.

## 5. Decisiones pendientes
1. Separar del todo el beneficio consolidado y el atribuible (nuevo concepto en EDINET y EPS/ROE por perímetro).
2. Ampliar la taxonomía IFRS japonesa del verificador EDINET.
3. Certificación de Taiwán: pedir consentimiento a TWSE o incorporar descargas manuales de MOPS (procedimiento en `DATA_SOURCES.md`).
4. Valoración de ADR (ratio de representación y tipo de cambio).
5. Calibración de primas.
6. Liberar espacio de `bundle-validation-*` después de verificar su sha256.
7. Reanudar los vigilantes US/JP con el código entregado (§3).
8. Persistir los días operativos en `kpi_financiero_informe` si se quieren consultar por SQL (hoy se derivan al vuelo).
9. Aceptar inventario nulo con evidencia en empresas sin existencias (hoy bloquea con `HISTORICO_PENDIENTE`).
