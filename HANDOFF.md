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
| Taiwán: anual = suma T1–T4 (28.892 PCV, lotes 1 y 2) | IMPL · PROB · MYSQL · VERIF | quedan unas 200 empresas cuya descarga de FinMind seguía en curso (§4) |
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
| Taiwán lote 1 (`0314c499…`) y lote 2 (`defddff2…`) | sí | sí, verificados | `private_backups/reparacion-tw-lote*/…rollback.sql` |
| 33 (identidad de observación) | sí | sí, verificada | `server/sql/33_pcv_identidad_observacion.rollback.sql` |
| 30 (taxonomía sectorial) | — | **no** | — |

**Incidente durante la migración 33**: el `ALTER` esperó unos 35 minutos por el bloqueo de metadatos que retenía la auditoría estructural de Codex (proceso 7180, con una transacción de solo lectura abierta). Mientras tanto quedaron en espera las consultas a `partida_contable_valor`. No se canceló nada: la auditoría terminó, la migración completó y se verificó que no hubo cambios parciales. Lección: `OPERATIONS.md` §4.5.

## 3. Procesos al cerrar la entrega
- **Recuperadores activos**: el coordinador (`recuperar-pcv-plan.cjs`), el vigilante SEC de EE. UU. y el de identidad de Japón. Se ejecutan desde el árbol operativo `G2EXCHANGE/` con su código anterior.
- **Pausas**: ninguna pausa propia vigente.
- **Para que los recuperadores usen el código entregado** (identidad de observación, selección de observaciones, cargador FinMind corregido):
  1. pausarlos (`OPERATIONS.md` §3);
  2. hacer `git checkout entrega/frontend-handoff-20261031` en el árbol operativo, conservando antes sus cambios locales sin commit;
  3. `npm run build`;
  4. reanudarlos.
- **Descarga FinMind de Taiwán** (`finmind-tw-trimestral.cjs`): al cerrar iba por unas 700 de 906 empresas, con checkpoint en `G2EXCHANGE/private_backups/finmind-tw-trimestral`. No escribe en MySQL. Para aplicar el lote 3:
  1. generar con `node sectorial/app/tools/correccion_tw_trimestral.cjs <cache> <dir>`;
  2. ensayarlo en la copia aislada;
  3. aplicarlo;
  4. recalcular sus KPI con `--ledger`.

## 4. Transferencia privada (no está en Git)
| Elemento | Ubicación original | Motivo |
|---|---|---|
| `.env` con credenciales | `G2EXCHANGE/.env` | secretos: transferir por un canal seguro o regenerar las claves (J-Quants y Eulerpool deben rotarse) |
| Volcado MySQL operativo | `G2EXCHANGE/private_backups/g2-2026-10-31T11-14-50-485Z.sql` (5,2 GB, sha256 `5b43bb22…`), o un volcado nuevo con `server/scripts/backup-db.cjs` | datos privados y sujetos a licencias |
| Registros de correcciones, rollbacks y snapshots | `G2EXCHANGE/private_backups/reparacion-*` | contienen importes; necesarios para revertir |
| Cachés de proveedores | `private_backups/pcv-us-bulk-20261029`, `jquants-v2`, `eulerpool-tw`, `finmind-tw-trimestral` | licencias (JPX y Eulerpool no permiten redistribuir) |
| Checkpoints de recuperadores | `private_backups/pcv-*` | operativos |
| Exportador corporativo de Excel | `@oai/artifact-tool` (entorno Codex) | privado; el exportador portable del repositorio basta para validar |

Comprobación tras transferir: el sha256 del volcado (`.sha256`), la restauración (`SETUP.md` §4) y `npm run sectorial:coverage`.

**Espacio en disco**: las carpetas `G2EXCHANGE/private_backups/bundle-validation-*` (≈ 34 GB) son validaciones de Codex con copias de volcados del propio `private_backups`. Los tamaños coinciden con los originales, pero falta comparar su sha256 con los archivos `.sha256` del principal. Hasta entonces se conservan. `pcv-recovery-controls-2026-10-30T02-20-10-655Z.tar` (30 GB) tiene su propio manifiesto y no es redundante.

## 5. Decisiones pendientes
1. Separar del todo el beneficio consolidado y el atribuible (nuevo concepto en EDINET y EPS/ROE por perímetro).
2. Ampliar la taxonomía IFRS japonesa del verificador EDINET.
3. Certificación de Taiwán: pedir consentimiento a TWSE o incorporar descargas manuales de MOPS (procedimiento en `DATA_SOURCES.md`).
4. Valoración de ADR (ratio de representación y tipo de cambio).
5. Calibración de primas.
6. Liberar espacio de `bundle-validation-*` después de verificar su sha256.
