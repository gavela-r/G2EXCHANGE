# Fase 2 — auditoría de MySQL real

Fecha de corte económico: **29/10/2026**. Conexión confirmada al esquema **2GB**, MySQL **8.4.11**, usando configuración existente de G2EXCHANGE. Metadatos capturados a 29/10/26, 20:37:06 y comprobaciones finales a 29/10/26, 20:53:05, Europe/Madrid. El barrido financiero utilizado en las tablas comenzó a 29/10/26, 20:47:08 y terminó a 29/10/26, 20:49:44.

## Resultado y alcance

Hay **13.194 empresas**, **10.669 con algún informe de cualquier periodo**, y **9695 con algún dato numérico anual 2022–2026 y publicación almacenada admisible**. Esto último es cobertura numérica, **no una certificación de identidad, consolidación, moneda, definición o escala**. En particular, las 294 empresas TW con datos publicados están afectadas por la incidencia de identidad/mercado descrita abajo. Excluir ese grupo del universo candidato deja 9.401 empresas US/JP con algún importe admisible, todavía pendientes de calidad por indicador.

El esquema real confirma los problemas estructurales de fase 1. Se detectan además dos problemas poblacionales de calidad: casi todas las versiones tienen una fecha desplazada un día y hay instrumentos TW ligados a bolsa japonesa con informes EDINET. No se ha corregido ninguno.

## Protección de la aplicación

No se encontró configuración separada de usuario de lectura entre los nombres de variables inspeccionados. La cuenta existente tiene permisos adicionales, que no se han usado. Cada conexión auditora ejecutó controles **solo de sesión**: aislamiento READ COMMITTED, MAX_EXECUTION_TIME=2000 ms, lock_wait_timeout=2 s, innodb_lock_wait_timeout=2 s y TRANSACTION READ ONLY. Se comprobó **@@session.transaction_read_only=1**. Cada SELECT/SHOW/EXPLAIN se envolvió en START TRANSACTION READ ONLY y ROLLBACK inmediato. Timeout cliente: 3500 ms; una sola consulta simultánea.

Las tablas se inventariaron antes de consultar datos. Los bloques financieros utilizaron el índice informe_id, inicialmente 100 informes y después 50; pausa de 40 ms entre bloques. Un bloque alcanzó 15.001 filas: se detuvo sin aceptar resultados truncados. El primer intento parcial quedó documentado y se repitió el barrido completo con subdivisión; no se presentan sus resultados parciales como cobertura. Todas las consultas completaron dentro del límite; la mayor duración registrada fue 1.799 ms en las comprobaciones finales. No se han escaneado todos los JSON de varios GB: se leyeron metadatos de verificación, contexto reducido por informe y campos concretos de una muestra de 60 informes.

La lectura fue **progresiva, no una instantánea global atómica**. Los recuperadores siguieron incorporando información durante la auditoría. Los conteos de momentos distintos pueden variar: no se han actualizado informes o versiones para forzar su coincidencia. No se ejecutaron CHECKSUM TABLE, bloqueos de escritura, procedimientos, migraciones, recuperadores o tareas programadas. No se midió el rendimiento histórico de esos procesos; no se afirma impacto cero de I/O.

## Esquema e inventario reales

Se encontraron **29 tablas InnoDB y ninguna vista**. Se obtuvieron metadatos de todas y SHOW CREATE TABLE de las 28 no personales, excluyendo usuario de la extracción de DDL. Las 28 definiciones coinciden con server/sql/00_schema.sql tras ignorar el contador AUTO_INCREMENT y formato. No hay triggers ni eventos MySQL registrados en este esquema según las consultas de metadatos. Esto no inventaría programaciones externas del sistema operativo/contenedores, que no se han alterado.

| Tabla | Filas | Tipo de conteo |
|---|---|---|
| ajustes_noticias | 0 | Estimación InnoDB TABLE_ROWS; no es COUNT(*) |
| classification_evidence | 1624 | Estimación InnoDB TABLE_ROWS; no es COUNT(*) |
| coste_capital_referencia | 138 | COUNT(*) exacto, lectura inicial |
| cotizacion_diaria | 8241 | COUNT(*) exacto, lectura inicial |
| empresa | 13.194 | COUNT(*) exacto, lectura inicial |
| evento_corporativo | 1214 | COUNT(*) exacto, lectura inicial |
| financial_report_evidence | 10.083 | Estimación InnoDB TABLE_ROWS; no es COUNT(*) |
| informe_financiero | 60.631 | COUNT(*) exacto, lectura inicial |
| instrumento | 8417 | COUNT(*) exacto, lectura inicial |
| kpi_financiero_informe | 744.340 | Exacto: suma del GROUP BY posterior |
| lista_seguimiento | 0 | Estimación InnoDB TABLE_ROWS; no es COUNT(*) |
| mercado | 6 | Estimación InnoDB TABLE_ROWS; no es COUNT(*) |
| model_version | 2 | COUNT(*) exacto, lectura inicial |
| noticia_empresa | 885 | Estimación InnoDB TABLE_ROWS; no es COUNT(*) |
| pais | 3 | COUNT(*) exacto, lectura inicial |
| partida_contable_valor | 2.222.591 | Estimación InnoDB TABLE_ROWS; no es COUNT(*) |
| pcv_import_evidence | 333.563 | Estimación InnoDB TABLE_ROWS; no es COUNT(*) |
| pcv_verification_evidence | 630.006 | Estimación InnoDB TABLE_ROWS; no es COUNT(*) |
| rating_sintetico | 45 | COUNT(*) exacto, lectura inicial |
| sector | 46 | COUNT(*) exacto, lectura inicial |
| taxonomia_concepto | 39 | COUNT(*) exacto, lectura inicial |
| valuation_execution | 60 | COUNT(*) exacto, lectura inicial |
| valuation_input_snapshot | 594 | COUNT(*) exacto, lectura inicial |
| valuation_input_snapshot_detalle | 2309 | Estimación InnoDB TABLE_ROWS; no es COUNT(*) |
| valuation_input_version | 88.468 | COUNT(*) exacto, lectura inicial |
| valuation_run | 592 | COUNT(*) exacto, lectura inicial |
| valuation_run_parametros | 0 | COUNT(*) exacto, lectura inicial |
| valuation_run_resultado | 120 | Estimación InnoDB TABLE_ROWS; no es COUNT(*) |

Las cifras aproximadas de las tablas grandes pueden diferir sensiblemente de las exactas; por ejemplo, TABLE_ROWS estimaba 0 en model_version y su COUNT(*) real fue 2. No se emplean estimaciones InnoDB para calcular porcentajes de cobertura. Los conteos exactos iniciales son de su momento de lectura, no un compromiso de que la base siguiera inmóvil.

Diferencias respecto a hipótesis/propuestas de fase 1: no aparece prima_tamano en valuation_run_parametros; esa tabla tiene **0 filas**. La propuesta UNIQUE(mercado_id,ticker) no está aplicada: instrumento conserva UNIQUE(ticker). Cotización conserva UNIQUE(instrumento_id). Las propuestas SQL 12/14/03 no se consideran migraciones ejecutadas por existir en disco.

Relaciones verificadas: empresa→pais/sector; instrumento→empresa/mercado; cotizacion_diaria→instrumento; informe_financiero→empresa; partida_contable_valor→informe/taxonomia; valuation_input_version→empresa/informe; snapshot→empresa/referencia/rating, y detalle→snapshot/versiones; run→empresa/snapshot/model_version; resultados/parámetros/execution→run. Las tablas de evidencia enlazan con informe. evento_corporativo no declara FK de instrumento y utiliza BIGINT UNSIGNED donde instrumento.id es INT. Columnas, restricciones y nombres exactos —incluidas erratas como intrumento_id y conbertura_interes_min_exclusiva— están en la evidencia, sin renombrarlos.

## Cobertura por país: conservar todos los denominadores

País significa **pais de empresa**, no bolsa de cotización. Las diferencias entre ambos se auditan expresamente. Las empresas sin información permanecen en el denominador.

| País | Registradas (denominador) | Algún informe, cualquier periodo | Algún dato numérico anual publicado 2022–2026 | Tamaño básico, mismo informe | Liquidez parcial, mismo informe | Empresa con precio |
|---|---|---|---|---|---|---|
| US | 8017 | 6060 (75,59 %) | 5903 (73,63 %) | 3734 (46,58 %) | 1016 (12,67 %) | 4216 (52,59 %) |
| JP | 3581 | 3498 (97,68 %) | 3498 (97,68 %) | 3360 (93,83 %) | 2085 (58,22 %) | 2484 (69,37 %) |
| TW | 1596 | 1111 (69,61 %) | 294 (18,42 %) | 283 (17,73 %) | 224 (14,04 %) | 1418 (88,85 %) |

Tamaño básico = ingresos+EBITDA+activos totales disponibles en **un mismo informe anual**. Liquidez parcial = efectivo+deuda CP/LP+CFO+FCF+cobertura+deuda neta/EBITDA en un mismo informe. No incluye current/quick/cash ratio, que no pueden obtenerse. No se cruzan años o informes para completar estos conjuntos. Los conjuntos pueden utilizar KPI existentes: su presencia numérica se distingue de sus insumos verificados. Las filas TW son **candidatos numéricos bloqueados por procedencia**, no cobertura fiable de empresas taiwanesas.

De las 7.377 empresas con tamaño básico numérico, **1.378** tienen familia no financiera resuelta, **5.988** requieren resolver familia y **11** están en BANK/INSURANCE, donde EBITDA industrial no se fuerza. Para liquidez parcial: **787**, **2.534** y **4**, respectivamente. Liquidez completa con los tres ratios de circulante: **0**. Esto no significa que todas las empresas sean ilíquidas; falta información normalizada.

## Datos examinados y vigencia

El barrido usado para cobertura examinó **41.758 informes ANUALES 2022–2026**, **1.660.939 filas PCV**, **142.436 KPI seleccionados**, 72.405 filas VIV asociadas y 528.560 grupos de metadatos de verificación. No es una muestra de empresas: se recorrieron todos los informes de la población capturada. La muestra posterior de calidad sí es limitada.

Los informes trimestrales/semestrales se inventariaron aparte y se excluyeron del cómputo anual. Se detectaron 2550 informes no anuales con publicación anterior al cierre registrado; no se reinterpretan como cierres anuales válidos. En 2026 se cuentan solo cierres y publicaciones <=29/10/2026. No se anualizan trimestres ni se usan publicaciones futuras. La fecha de publicación almacenada puede requerir comprobación de origen: no equivale automáticamente a fecha oficialmente verificada.

## Incidencias de calidad que impiden un adaptador directo

1. **Fechas VIV:** 88.464 de 88.468 versiones tienen fecha_fin_periodo **un día anterior** a informe_financiero; solo 4 coinciden. En la selección de última versión por informe anual fueron 27.822 de 27.826. Ejemplo: informe 103066 cierra 2025-12-31 y versión 109562 dice 2025-12-30. El patrón sugiere revisar conversión de fechas, pero no se da su causa por demostrada ni se suma un día automáticamente. La cobertura principal usa PCV/KPI del informe, no mezcla importes de VIV desalineados.
2. **Taiwán/Japón:** 299 instrumentos de 294 empresas TW están ligados a mercado_id=4 (Tokyo Stock Exchange), moneda TWD e ISIN ausente. Esas 294 empresas tienen los **1.176 informes ANUALES EDINET** detectados en TW. La muestra contiene identificadores S100… y conceptos jpcrp_cor/jppfs_cor. Hay una incompatibilidad de mercado/moneda/procedencia que exige comprobar identidad del emisor; no se convierte JPY a TWD ni se acepta la etiqueta de moneda. No se declara demostrado que cada documento sea incorrecto, pero **se bloquea su uso analítico** hasta conciliarlo.
3. **Publicación TW:** los 3.294 informes FINMIND anuales 2022–2025 capturados carecen de fecha de publicación; sus números existen, pero no acreditan disponibilidad histórica. No se rellenan fechas por estimación. El dato publicado de las 294 empresas anteriores no resuelve esta carencia.
4. **Contexto:** 25.033 informes no tienen contexto reducido recuperable en la lectura. Se identificaron 11.018 contextos consolidados USD, 3.714 consolidados JPY y 528 individuales JPY; los restantes quedan desconocidos. Estos grupos no se suman ni mezclan para ratios/benchmarks. Un contexto por informe no prueba que todos sus importes coincidan con él.
5. **Importes incompatibles por concepto:** se excluyeron de la derivación los conceptos con varios valores distintos en el mismo informe. Incidencias, no empresas únicas: ingresos 1126, EBIT 626, D&A 2057, deuda CP 1224, deuda LP 2330. Que dos etiquetas tengan el mismo importe tampoco prueba equivalencia semántica.
6. **Signos y definiciones:** aparecen 337 D&A negativos, 73 ingresos negativos, 2 deudas CP negativas, 1 efectivo negativo y 28.286 registros CAPEX negativos dentro del barrido. Algunos signos pueden ser convenciones legítimas; otros conceptos pueden ser movimientos, no saldos. No se aplicó abs indiscriminado: la derivación directa de FCF exige CAPEX de salida positivo. FCF/EBITDA de KPI heredados quedan identificados como tales y no como insumos nuevos certificados. Intereses cero no producen cobertura infinita ni prima cero.
7. **Escala/moneda:** PCV no conserva en columnas propias moneda, escala, inicio de periodo o consolidación por hecho. Hay contexto en evidencias, pero no universal. VIV.moneda y nivel_confianza no corrigen esa ausencia ni el desplazamiento de fecha. No se hacen conversiones de moneda o multiplicadores por inferencia. No se detectaron importes superiores al entero seguro de JS en este barrido, pero ello no certifica su escala económica.

## Validación documental acotada

Se seleccionaron deliberadamente 20 empresas con informe 2025 de cada país, priorizando contexto conocido y tamaño básico numérico. **No es una muestra aleatoria ni representativa.** Para cada concepto se cotejaron registro PCV, importe candidato con la precisión DECIMAL existente, moneda, base, periodo y publicación frente a campos de evidencia. La muestra US y JP permite verificar técnicamente ingresos/EBIT/EBITDA/activos en 20 informes cada una. TW no supera esos controles en la muestra. Los resultados detallados están en 12_COBERTURA_LIQUIDEZ_TAMANO.md; no se extrapolan esos porcentajes a 13.194 empresas.

Los conteos attestationMetadata del resumen solo indican disponibilidad conjunta de metadatos positivos/contexto; **no certifican** todos los importes. CONFLICT_PRESERVED aparece 407.384 veces en las verificaciones leídas: son eventos, no empresas ni una cuenta de errores únicos. Una coincidencia verificada y un conflicto pueden coexistir para un mismo concepto.

## Referencias reales para CAPM/WACC

| País | Rf almacenado (%) | ERP total almacenado (%) | Fecha ERP | Referencia de país |
|---|---|---|---|---|
| US | 4.6800 | 4.460000 | 2026-10-08 | Damodaran - Total Equity Risk Premium |
| JP | 2.6700 | 5.142949 | 2026-10-08 | Damodaran - Total Equity Risk Premium |
| TW | 1.9600 | 5.006007 | 2026-10-08 | Damodaran - Total Equity Risk Premium |

Son datos existentes, **no primas nuevas de liquidez/tamaño**. Hay 46 betas sectoriales no nulas y 138 referencias país×sector (46 por país), con fecha 08/10/2026. pais.equity_risk_premium está NULL en los tres países; la ruta utiliza prima_riesgo_mercado. riesgo_extra_por_pais existe, pero no se suma al ERP total. No duplicar CRP. Las betas carecen de serie/fecha propia en sector y las referencias se actualizan sobre filas únicas; no permiten recuperar por sí solas una curva histórica.

rating_sintetico tiene 45 filas activas, 15 por perfil, con fecha de mercado 06/08/2026. fuente_intervalos identifica DAMODARAN_RATINGS_XLS y fuente_spread_mercado está NULL en los tres grupos. Su existencia permite recuperar referencias, pero no acredita spreads individuales observados ni suficiencia de cobertura/fecha/perfil de una empresa. El perfil tamaño ya influye en la selección de rating.

Existen 60 ejecuciones congeladas: 40 COMPLETA_CON_ADVERTENCIAS y 20 BLOQUEADA, versión 1.5.1; no son una muestra sectorial completa. Parámetros legacy tiene 0 filas; las tasas/pesos de esas ejecuciones deben buscarse en sus JSON congelados, sin editar o poblar retrospectivamente la tabla. Faltan capitalizaciones conciliadas y referencias históricas individuales para comparar WACC de todas las empresas con su sector. No se calculó un nuevo WACC.

## Evidencia y límites

Las consultas y resultados estructurados se conservan en `../fase2/evidencias/`. `metadatos.json` contiene columnas, tipos, PK/FK, UNIQUE, índices, CHECK y DDL leídos. `cobertura_resumen.json` contiene los conteos completos por empresa/ejercicio/país/sector/bolsa; `comprobaciones_finales.json` incluye la muestra de calidad. Los registros `consultas_*.json` conservan SQL, parámetros de IDs, duración y resultado de cada lectura, sin credenciales.

No se accedió a filas de usuario ni se revelaron credenciales. Los datos son reales consultados: este informe sustituye la incertidumbre de cobertura de fase 1, sin sobrescribir sus documentos. No acredita calidad universal, existencia de primas calibradas ni que el dataset siguiera inmutable tras el corte.

## Comprobación final de archivos y lectura complementaria

Se compararon **328 archivos originales**: 325 permanecían idénticos y tres informes operativos de server/docs cambiaron concurrentemente sin que esta intervención los editara (INFORME_COBERTURA_85.md, INFORME_FMP_COMPLEMENTARIO.md e INFORME_RECUPERACION_US_JP_TW.md). Se conservan ambos hashes, sin restaurarlos ni atribuir su autoría. **Ningún archivo financiero protegido cambió.** El manifiesto de motor 1.5.1 coincide con fase 1 tanto en fuente como en binario; las 16 plantillas y todos los archivos de fase 1 comprobados permanecen iguales.

La lectura complementaria terminó a 29/10/26, 21:09:22 (Europe/Madrid). En las 60 entradas de ejecución congeladas no aparecen los campos comprobados de volumen agregado, free float, bid/ask o series alternativas de precios. No se ha utilizado ese JSON como un supuesto histórico de mercado. La verificación local se conserva en verificacion_entrega.json; no son pruebas nuevas de fórmulas financieras ni una repetición de las 69 pruebas anteriores.
