const fs=require('node:fs'),path=require('node:path');
const ev=path.join(__dirname,'evidencias'),docs=path.resolve(__dirname,'../docs');
const load=n=>JSON.parse(fs.readFileSync(path.join(ev,n+'.json')));
const m=load('metadatos'),s=load('cobertura_resumen'),d=load('observaciones_financieras'),f=load('comprobaciones_finales'),c=load('contexto_y_referencias'),cross=load('cruce_pais_bolsa');
const n=x=>Number(x).toLocaleString('es-ES');
const pct=(x,den)=>den?((x/den)*100).toFixed(2).replace('.',',')+' %':'n.a.';
const np=(x,den)=>`${n(x)} (${pct(x,den)})`;
const table=(headers,rows)=>'| '+headers.join(' | ')+' |\n|'+headers.map(()=>'---').join('|')+'|\n'+rows.map(r=>'| '+r.map(x=>String(x??'—').replaceAll('|','/').replaceAll('\n',' ')).join(' | ')+' |').join('\n')+'\n';
const madr=t=>new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',dateStyle:'short',timeStyle:'medium'}).format(new Date(t));
const write=(file,text)=>{if(!/^(10|11|12|13|14)_/.test(file))throw Error('Nombre de informe fuera de alcance');if(process.argv.includes('--completar'))return;fs.writeFileSync(path.join(docs,file),text,{flag:'wx'});};
const evidence='Las consultas y resultados estructurados se conservan en `../fase2/evidencias/`. `metadatos.json` contiene columnas, tipos, PK/FK, UNIQUE, índices, CHECK y DDL leídos. `cobertura_resumen.json` contiene los conteos completos por empresa/ejercicio/país/sector/bolsa; `comprobaciones_finales.json` incluye la muestra de calidad. Los registros `consultas_*.json` conservan SQL, parámetros de IDs, duración y resultado de cada lectura, sin credenciales.';
const countries=['US','JP','TW'],total=s.overall.denominatorCompanies,byPop=new Map(f.population.map(r=>[r.codigo_iso,r]));
const label={INGRESOS:'Ingresos',EBITDA:'EBITDA',EBIT:'EBIT',ACTIVOS_TOTALES:'Activos totales',EFECTIVO:'Efectivo',DEUDA_FINANCIERA:'Deuda financiera CP+LP',DEUDA_NETA:'Deuda neta',PATRIMONIO_NETO:'Patrimonio neto contable',CFO:'CFO',CAPEX:'CAPEX',FCF:'FCF',COBERTURA_INTERESES:'Cobertura intereses',DEUDA_NETA_EBITDA:'Deuda neta/EBITDA',CURRENT_RATIO:'Current ratio',QUICK_RATIO:'Quick ratio',CASH_RATIO:'Cash ratio'};
const metricIds=Object.keys(label);
const countsTable=table(['Tabla','Filas','Tipo de conteo'],m.tables.filter(t=>t.TABLE_NAME!=='usuario').map(t=>[t.TABLE_NAME,m.counts[t.TABLE_NAME]!==undefined?n(m.counts[t.TABLE_NAME]):t.TABLE_NAME==='kpi_financiero_informe'?n(f.kpiKinds.reduce((a,r)=>a+r.filas,0)):n(t.TABLE_ROWS),m.counts[t.TABLE_NAME]!==undefined?'COUNT(*) exacto, lectura inicial':t.TABLE_NAME==='kpi_financiero_informe'?'Exacto: suma del GROUP BY posterior':'Estimación InnoDB TABLE_ROWS; no es COUNT(*)']));
const countryTable=table(['País','Registradas (denominador)','Algún informe, cualquier periodo','Algún dato numérico anual publicado 2022–2026','Tamaño básico, mismo informe','Liquidez parcial, mismo informe','Empresa con precio'],countries.map(co=>{const x=s.byCountry[co],p=byPop.get(co);return[co,n(x.denominatorCompanies),np(p.empresas_informes,x.denominatorCompanies),np(x.companiesWithAnyPublishedNumeric,x.denominatorCompanies),np(x.bundles.TAMANO_BASICO.eligibleCompanies,x.denominatorCompanies),np(x.bundles.LIQUIDEZ_PARCIAL.eligibleCompanies,x.denominatorCompanies),np(x.priceCompanies,x.denominatorCompanies)];}));
const nonAnnualBad=c.reports.filter(r=>r.tipo_periodo!=='ANUAL').reduce((a,r)=>a+Number(r.publicacion_anterior_cierre||0),0);
write('10_AUDITORIA_MYSQL_REAL.md',`# Fase 2 — auditoría de MySQL real

Fecha de corte económico: **29/10/2026**. Conexión confirmada al esquema **${m.identity.schema_name}**, MySQL **${m.identity.mysql_version}**, usando configuración existente de G2EXCHANGE. Metadatos capturados a ${madr(m.capturedAtUtc)} y comprobaciones finales a ${madr(f.finishedAtUtc)}, Europe/Madrid. El barrido financiero utilizado en las tablas comenzó a ${madr(s.startedAtUtc)} y terminó a ${madr(s.endedAtUtc)}.

## Resultado y alcance

Hay **${n(total)} empresas**, **${n(f.population.reduce((a,r)=>a+r.empresas_informes,0))} con algún informe de cualquier periodo**, y **${n(s.overall.companiesWithAnyPublishedNumeric)} con algún dato numérico anual 2022–2026 y publicación almacenada admisible**. Esto último es cobertura numérica, **no una certificación de identidad, consolidación, moneda, definición o escala**. En particular, las 294 empresas TW con datos publicados están afectadas por la incidencia de identidad/mercado descrita abajo. Excluir ese grupo del universo candidato deja 9.401 empresas US/JP con algún importe admisible, todavía pendientes de calidad por indicador.

El esquema real confirma los problemas estructurales de fase 1. Se detectan además dos problemas poblacionales de calidad: casi todas las versiones tienen una fecha desplazada un día y hay instrumentos TW ligados a bolsa japonesa con informes EDINET. No se ha corregido ninguno.

## Protección de la aplicación

No se encontró configuración separada de usuario de lectura entre los nombres de variables inspeccionados. La cuenta existente tiene permisos adicionales, que no se han usado. Cada conexión auditora ejecutó controles **solo de sesión**: aislamiento READ COMMITTED, MAX_EXECUTION_TIME=2000 ms, lock_wait_timeout=2 s, innodb_lock_wait_timeout=2 s y TRANSACTION READ ONLY. Se comprobó **@@session.transaction_read_only=1**. Cada SELECT/SHOW/EXPLAIN se envolvió en START TRANSACTION READ ONLY y ROLLBACK inmediato. Timeout cliente: 3500 ms; una sola consulta simultánea.

Las tablas se inventariaron antes de consultar datos. Los bloques financieros utilizaron el índice informe_id, inicialmente 100 informes y después 50; pausa de 40 ms entre bloques. Un bloque alcanzó 15.001 filas: se detuvo sin aceptar resultados truncados. El primer intento parcial quedó documentado y se repitió el barrido completo con subdivisión; no se presentan sus resultados parciales como cobertura. Todas las consultas completaron dentro del límite; la mayor duración registrada fue 1.799 ms en las comprobaciones finales. No se han escaneado todos los JSON de varios GB: se leyeron metadatos de verificación, contexto reducido por informe y campos concretos de una muestra de 60 informes.

La lectura fue **progresiva, no una instantánea global atómica**. Los recuperadores siguieron incorporando información durante la auditoría. Los conteos de momentos distintos pueden variar: no se han actualizado informes o versiones para forzar su coincidencia. No se ejecutaron CHECKSUM TABLE, bloqueos de escritura, procedimientos, migraciones, recuperadores o tareas programadas. No se midió el rendimiento histórico de esos procesos; no se afirma impacto cero de I/O.

## Esquema e inventario reales

Se encontraron **29 tablas InnoDB y ninguna vista**. Se obtuvieron metadatos de todas y SHOW CREATE TABLE de las 28 no personales, excluyendo usuario de la extracción de DDL. Las 28 definiciones coinciden con server/sql/00_schema.sql tras ignorar el contador AUTO_INCREMENT y formato. No hay triggers ni eventos MySQL registrados en este esquema según las consultas de metadatos. Esto no inventaría programaciones externas del sistema operativo/contenedores, que no se han alterado.

${countsTable}
Las cifras aproximadas de las tablas grandes pueden diferir sensiblemente de las exactas; por ejemplo, TABLE_ROWS estimaba 0 en model_version y su COUNT(*) real fue 2. No se emplean estimaciones InnoDB para calcular porcentajes de cobertura. Los conteos exactos iniciales son de su momento de lectura, no un compromiso de que la base siguiera inmóvil.

Diferencias respecto a hipótesis/propuestas de fase 1: no aparece prima_tamano en valuation_run_parametros; esa tabla tiene **0 filas**. La propuesta UNIQUE(mercado_id,ticker) no está aplicada: instrumento conserva UNIQUE(ticker). Cotización conserva UNIQUE(instrumento_id). Las propuestas SQL 12/14/03 no se consideran migraciones ejecutadas por existir en disco.

Relaciones verificadas: empresa→pais/sector; instrumento→empresa/mercado; cotizacion_diaria→instrumento; informe_financiero→empresa; partida_contable_valor→informe/taxonomia; valuation_input_version→empresa/informe; snapshot→empresa/referencia/rating, y detalle→snapshot/versiones; run→empresa/snapshot/model_version; resultados/parámetros/execution→run. Las tablas de evidencia enlazan con informe. evento_corporativo no declara FK de instrumento y utiliza BIGINT UNSIGNED donde instrumento.id es INT. Columnas, restricciones y nombres exactos —incluidas erratas como intrumento_id y conbertura_interes_min_exclusiva— están en la evidencia, sin renombrarlos.

## Cobertura por país: conservar todos los denominadores

País significa **pais de empresa**, no bolsa de cotización. Las diferencias entre ambos se auditan expresamente. Las empresas sin información permanecen en el denominador.

${countryTable}
Tamaño básico = ingresos+EBITDA+activos totales disponibles en **un mismo informe anual**. Liquidez parcial = efectivo+deuda CP/LP+CFO+FCF+cobertura+deuda neta/EBITDA en un mismo informe. No incluye current/quick/cash ratio, que no pueden obtenerse. No se cruzan años o informes para completar estos conjuntos. Los conjuntos pueden utilizar KPI existentes: su presencia numérica se distingue de sus insumos verificados. Las filas TW son **candidatos numéricos bloqueados por procedencia**, no cobertura fiable de empresas taiwanesas.

De las 7.377 empresas con tamaño básico numérico, **1.378** tienen familia no financiera resuelta, **5.988** requieren resolver familia y **11** están en BANK/INSURANCE, donde EBITDA industrial no se fuerza. Para liquidez parcial: **787**, **2.534** y **4**, respectivamente. Liquidez completa con los tres ratios de circulante: **0**. Esto no significa que todas las empresas sean ilíquidas; falta información normalizada.

## Datos examinados y vigencia

El barrido usado para cobertura examinó **${n(d.reports.length)} informes ANUALES 2022–2026**, **${n(d.detail.pcvRowsRead)} filas PCV**, **${n(d.detail.kpiRowsRead)} KPI seleccionados**, ${n(d.vivStats.rowsRead)} filas VIV asociadas y ${n(d.detail.verificationGroupsRead)} grupos de metadatos de verificación. No es una muestra de empresas: se recorrieron todos los informes de la población capturada. La muestra posterior de calidad sí es limitada.

Los informes trimestrales/semestrales se inventariaron aparte y se excluyeron del cómputo anual. Se detectaron ${n(nonAnnualBad)} informes no anuales con publicación anterior al cierre registrado; no se reinterpretan como cierres anuales válidos. En 2026 se cuentan solo cierres y publicaciones <=29/10/2026. No se anualizan trimestres ni se usan publicaciones futuras. La fecha de publicación almacenada puede requerir comprobación de origen: no equivale automáticamente a fecha oficialmente verificada.

## Incidencias de calidad que impiden un adaptador directo

1. **Fechas VIV:** 88.464 de 88.468 versiones tienen fecha_fin_periodo **un día anterior** a informe_financiero; solo 4 coinciden. En la selección de última versión por informe anual fueron ${n(d.vivStats.reportDateMismatch)} de ${n(d.vivStats.latestReports)}. Ejemplo: informe 103066 cierra 2025-12-31 y versión 109562 dice 2025-12-30. El patrón sugiere revisar conversión de fechas, pero no se da su causa por demostrada ni se suma un día automáticamente. La cobertura principal usa PCV/KPI del informe, no mezcla importes de VIV desalineados.
2. **Taiwán/Japón:** 299 instrumentos de 294 empresas TW están ligados a mercado_id=4 (Tokyo Stock Exchange), moneda TWD e ISIN ausente. Esas 294 empresas tienen los **1.176 informes ANUALES EDINET** detectados en TW. La muestra contiene identificadores S100… y conceptos jpcrp_cor/jppfs_cor. Hay una incompatibilidad de mercado/moneda/procedencia que exige comprobar identidad del emisor; no se convierte JPY a TWD ni se acepta la etiqueta de moneda. No se declara demostrado que cada documento sea incorrecto, pero **se bloquea su uso analítico** hasta conciliarlo.
3. **Publicación TW:** los 3.294 informes FINMIND anuales 2022–2025 capturados carecen de fecha de publicación; sus números existen, pero no acreditan disponibilidad histórica. No se rellenan fechas por estimación. El dato publicado de las 294 empresas anteriores no resuelve esta carencia.
4. **Contexto:** ${n(d.detail.missingContext)} informes no tienen contexto reducido recuperable en la lectura. Se identificaron 11.018 contextos consolidados USD, 3.714 consolidados JPY y 528 individuales JPY; los restantes quedan desconocidos. Estos grupos no se suman ni mezclan para ratios/benchmarks. Un contexto por informe no prueba que todos sus importes coincidan con él.
5. **Importes incompatibles por concepto:** se excluyeron de la derivación los conceptos con varios valores distintos en el mismo informe. Incidencias, no empresas únicas: ingresos ${n(d.detail.ambiguousConcepts.INGRESOS)}, EBIT ${n(d.detail.ambiguousConcepts.EBIT)}, D&A ${n(d.detail.ambiguousConcepts.DEPRECIACION_AMORTIZACION)}, deuda CP ${n(d.detail.ambiguousConcepts.DEUDA_CORTO_PLAZO)}, deuda LP ${n(d.detail.ambiguousConcepts.DEUDA_LARGO_PLAZO)}. Que dos etiquetas tengan el mismo importe tampoco prueba equivalencia semántica.
6. **Signos y definiciones:** aparecen 337 D&A negativos, 73 ingresos negativos, 2 deudas CP negativas, 1 efectivo negativo y 28.286 registros CAPEX negativos dentro del barrido. Algunos signos pueden ser convenciones legítimas; otros conceptos pueden ser movimientos, no saldos. No se aplicó abs indiscriminado: la derivación directa de FCF exige CAPEX de salida positivo. FCF/EBITDA de KPI heredados quedan identificados como tales y no como insumos nuevos certificados. Intereses cero no producen cobertura infinita ni prima cero.
7. **Escala/moneda:** PCV no conserva en columnas propias moneda, escala, inicio de periodo o consolidación por hecho. Hay contexto en evidencias, pero no universal. VIV.moneda y nivel_confianza no corrigen esa ausencia ni el desplazamiento de fecha. No se hacen conversiones de moneda o multiplicadores por inferencia. No se detectaron importes superiores al entero seguro de JS en este barrido, pero ello no certifica su escala económica.

## Validación documental acotada

Se seleccionaron deliberadamente 20 empresas con informe 2025 de cada país, priorizando contexto conocido y tamaño básico numérico. **No es una muestra aleatoria ni representativa.** Para cada concepto se cotejaron registro PCV, importe candidato con la precisión DECIMAL existente, moneda, base, periodo y publicación frente a campos de evidencia. La muestra US y JP permite verificar técnicamente ingresos/EBIT/EBITDA/activos en 20 informes cada una. TW no supera esos controles en la muestra. Los resultados detallados están en 12_COBERTURA_LIQUIDEZ_TAMANO.md; no se extrapolan esos porcentajes a 13.194 empresas.

Los conteos attestationMetadata del resumen solo indican disponibilidad conjunta de metadatos positivos/contexto; **no certifican** todos los importes. CONFLICT_PRESERVED aparece ${n(d.detail.verificationOutcomes.CONFLICT_PRESERVED)} veces en las verificaciones leídas: son eventos, no empresas ni una cuenta de errores únicos. Una coincidencia verificada y un conflicto pueden coexistir para un mismo concepto.

## Referencias reales para CAPM/WACC

${table(['País','Rf almacenado (%)','ERP total almacenado (%)','Fecha ERP','Referencia de país'],c.reference.countries.map(r=>[r.codigo_iso,r.interes_bono_10_ano,r.prima_riesgo_mercado,r.fecha_actualizacion_prima_mercado,r.fuente_prima_mercado]))}
Son datos existentes, **no primas nuevas de liquidez/tamaño**. Hay 46 betas sectoriales no nulas y 138 referencias país×sector (46 por país), con fecha 08/10/2026. pais.equity_risk_premium está NULL en los tres países; la ruta utiliza prima_riesgo_mercado. riesgo_extra_por_pais existe, pero no se suma al ERP total. No duplicar CRP. Las betas carecen de serie/fecha propia en sector y las referencias se actualizan sobre filas únicas; no permiten recuperar por sí solas una curva histórica.

rating_sintetico tiene 45 filas activas, 15 por perfil, con fecha de mercado 06/08/2026. fuente_intervalos identifica DAMODARAN_RATINGS_XLS y fuente_spread_mercado está NULL en los tres grupos. Su existencia permite recuperar referencias, pero no acredita spreads individuales observados ni suficiencia de cobertura/fecha/perfil de una empresa. El perfil tamaño ya influye en la selección de rating.

Existen 60 ejecuciones congeladas: 40 COMPLETA_CON_ADVERTENCIAS y 20 BLOQUEADA, versión 1.5.1; no son una muestra sectorial completa. Parámetros legacy tiene 0 filas; las tasas/pesos de esas ejecuciones deben buscarse en sus JSON congelados, sin editar o poblar retrospectivamente la tabla. Faltan capitalizaciones conciliadas y referencias históricas individuales para comparar WACC de todas las empresas con su sector. No se calculó un nuevo WACC.

## Evidencia y límites

${evidence}

No se accedió a filas de usuario ni se revelaron credenciales. Los datos son reales consultados: este informe sustituye la incertidumbre de cobertura de fase 1, sin sobrescribir sus documentos. No acredita calidad universal, existencia de primas calibradas ni que el dataset siguiera inmutable tras el corte.
`);

const quotes=m.quotes.totals[0];
write('11_AUDITORIA_COTIZACIONES.md',`# Fase 2 — cotizaciones e histórico bursátil

## Resultado real

**G2EXCHANGE conserva una única fila de cotización por instrumento en la tabla actual. No conserva una serie diaria canónica por acción.** Se comprobaron ${n(quotes.filas)} filas, ${n(quotes.instrumentos)} instrumentos distintos y exactamente una fecha distinta para cada uno de ellos. El conjunto contiene ${n(quotes.fechas_globales)} fechas, desde ${quotes.fecha_min} hasta ${quotes.fecha_max}; son fechas repartidas entre instrumentos, no 104 sesiones por instrumento.

Todos los precios almacenados son positivos y las fechas no son NULL. Esto valida presencia numérica, no que sean cierres ajustados ni que la fecha corresponda al precio actual. Hay ${n(m.counts.instrumento)} instrumentos registrados: ${n(m.counts.instrumento-quotes.instrumentos)} sin fila de cotización. Las cotizaciones cubren **${n(s.overall.priceCompanies)} empresas** (${pct(s.overall.priceCompanies,total)} de ${n(total)}); varias tienen más de un instrumento.

## Claves, columnas e índices verificados

Columnas: id INT PK AUTO_INCREMENT; instrumento_id INT NULL; fecha DATE NULL; precio_cierre DECIMAL(10,4) NULL. FK cotizacion_diaria_ibfk_1 → instrumento(id). Índices reales: PRIMARY(id), **UNIQUE intrumento_id(instrumento_id)**. No hay índice compuesto instrumento+fecha, volumen, importe, fuente/feed, timestamp de obtención, moneda por fila, flag ajustado o bid/ask.

La UNIQUE es por instrumento **sin fecha**. Aunque la columna permita fecha, impide almacenar dos días del mismo instrumento. Los nombres de índices con erratas se conservan.

${table(['País de empresa','Instrumentos','Filas de precio','Empresas con precio','Fecha mínima','Fecha máxima'],m.quotes.byCountry.map(r=>[r.codigo_iso,n(r.instrumentos),n(r.cotizaciones),n(r.empresas_con_precio),r.fecha_min,r.fecha_max]))}
Las fechas máximas tienen 77 días (JP/TW, 13/08) y 80 días (US, 10/08) de antigüedad respecto al 29/10. **No se deduce de ello la antigüedad real del precio**, porque el escritor puede conservar una fecha vieja al sustituir su valor. El mínimo 2018 es un registro antiguo aislado, no evidencia de ocho años de histórico.

## Escritura y pérdida potencial

Archivo server/insercionDatos/insercionDatosCotizacionDiaria.ts; funciones **guardarCotizacionesUSA**, **guardarCotizacionesTaiwan**, **guardarCotizacionesJapon** (aproximadamente líneas 1044, 1097 y 1121). Las tres ejecutan INSERT(instrumento_id,fecha,precio_cierre) ON DUPLICATE KEY UPDATE **precio_cierre=VALUES(precio_cierre)**.

Con la UNIQUE real, una segunda cotización del instrumento colisiona incluso si es de otro día: **sustituye el precio, pero no la fecha**. El comentario de la rama USA presupone UNIQUE(instrumento_id,fecha), que no corresponde a MySQL real. La deduplicación japonesa en memoria por instrumento/fecha no cambia la restricción de la tabla.

Consecuencias: puede perderse cada precio anterior y su fecha de observación; puede quedar un precio nuevo con fecha antigua; no se conserva fuente/feed ni revisión para comprobarlo después. Esto es la semántica comprobada del código y de la restricción; no se ejecutó el escritor ni se inventó un historial de qué sobrescrituras concretas ocurrieron. No hay triggers o eventos MySQL en el esquema que añadan otra ruta de histórico.

El lector TWSE del mismo archivo conserva solo ClosingPrice y devuelve un mapa código→precio; el TPEx hace lo mismo. Que la respuesta oficial pueda contener volumen/importe no significa que G2 lo almacene. La tabla no recibe esos campos.

## Otros lugares examinados

- **valuation_input_snapshot:** ${n(c.reference.snapshots[0].filas)} snapshots de ${n(c.reference.snapshots[0].empresas)} empresas, solo ${n(c.reference.snapshots[0].fechas)} fechas de precio (${c.reference.snapshots[0].fecha_min}–${c.reference.snapshots[0].fecha_max}). Son precios usados en valoraciones, no una serie diaria ni un histórico completo por instrumento.
- **valuation_execution:** entradas/salidas de 60 runs conservan precio y fechas congelados. Son útiles para reproducibilidad, no para rellenar días ausentes, volúmenes o retornos.
- **evento_corporativo:** 20 SPLIT de 20 instrumentos, desde 29/08/2022 a 07/07/2026, además de dividendos/otros eventos. No es una serie ajustada y no prueba cobertura completa de acciones corporativas.
- **Archivos del repositorio/cachés:** la búsqueda por nombres de cotizaciones/prices/quotes/charts y el código del recuperador no localizaron un almacén diario canónico adicional. Los directorios inspeccionados de private_backups corresponden principalmente a estados/evidencias y backups. No se descomprimieron o recorrieron masivamente todos los backups SQL. Podrían contener instantáneas antiguas: no se afirma que no exista ningún precio histórico recuperable en algún respaldo. No constituyen una serie diaria validada y no se reimportaron.

## Dependencias que deben preservarse

${table(['Componente','Uso actual','Condición de compatibilidad futura'],[
 ['server/src/valoracion/datos.ts:prepararInstrumento, línea 103','Lee precio<=asOf, ORDER BY fecha DESC,id DESC LIMIT 1; usa precio para capitalización, perfil rating y pesos','Mantener precio/fecha/instrumento; marcar legado no conciliado, sin convertir fecha obsoleta en prueba histórica'],
 ['server/insercionDatos/listaSeguimiento.ts:obtenerPorUsuario, línea 154','Join al precio de fecha máxima por instrumento','Conservar selección de último dato. La consulta tiene además columnas asumidas ausentes, como instrumento_principal: no se ejecutó ni se reparó'],
 ['server/src/index.ts, POST /insercionDatos/usa/actualizar','Expone actualizarCotizacionesUSA','No cambiar contrato o programación al preparar el futuro almacenamiento'],
 ['snapshot/execution/reportes','Congelan el precio usado por una valoración y lo exportan','No reconstruir un run antiguo con una serie nueva o corregir su snapshot'],
 ['server/scripts/resumen-final.cjs','Incluye cotizacion_diaria en comprobaciones operativas','No se ejecutó CHECKSUM TABLE; prever que una migración futura cambia sus supuestos y evidencias']
])}
No se localizó un gráfico financiero conectado en el client/src inspeccionado (App.jsx es la pantalla de ejemplo Vite). Por tanto no se atribuye un fallo a un gráfico de producción no observado. Cualquier gráfico futuro que consulte esta tabla solo dispondrá de un punto por instrumento; MAX(fecha) o un ordenamiento no crean una serie.

## Efectos financieros

Amihud no es calculable: faltan retornos diarios e importe monetario negociado. La beta individual tampoco puede estimarse de un punto, y además requeriría una serie del mercado. La beta sectorial existente no se estima de cotizacion_diaria y no se cambia aquí. No se identifican sesiones sin negociación a partir de un cierre repetido o fecha ausente.

Precio×acciones históricas sin reconciliación de fecha/clase/splits no acredita capitalización. Una fecha vieja que acompaña un precio sustituido invalida también la selección histórica asOf. En TW hay además ${n(cross.taiwanTokyo.instruments)} instrumentos ligados a Tokyo y moneda TWD: no interpretar ese precio como TWD válido sin prueba de emisor/feed/mercado.

## Solución futura propuesta, sin ejecución

Reutilizar la tabla existente si una fase aprobada confirma compatibilidad: mantener sus claves/columnas públicas y valorar UNIQUE(instrumento_id,fecha), índices para último dato/rangos, campos separados de volumen en acciones e importe negociado, fuente/feed, moneda, timestamps, base de ajustes y estado de calidad. Si se necesitan precios intradía o varias versiones/feed por día, decidir expresamente su clave/versionado; no imponer una fila diaria a eventos de distinta resolución.

Antes de modificar la UNIQUE: inventariar consumidores y escritor, ensayar con copia autorizada, definir tratamiento de filas legacy con fecha no conciliada y preservar sus valores originales. No fechar retrospectivamente un precio por conveniencia. Las nuevas filas históricas deberán ser trazables; el pasado perdido no reaparece al cambiar un índice. La conservación de último precio y los resultados históricos deben mantenerse. **No se elimina, sustituye o modifica la tabla en esta fase.**

${evidence}
`);

const formulas={INGRESOS:'Importe reportado ≥0',EBITDA:'EBIT+D&A validada, o KPI existente identificado',EBIT:'Importe reportado',ACTIVOS_TOTALES:'Total reportado ≥0',EFECTIVO:'Saldo reportado ≥0; restringida/operativa no separada',DEUDA_FINANCIERA:'Deuda financiera CP+LP, ambos presentes ≥0',DEUDA_NETA:'Deuda financiera−efectivo',PATRIMONIO_NETO:'Saldo contable; no capitalización',CFO:'Flujo operativo reportado',CAPEX:'Inversión reportada; conciliar signo',FCF:'CFO−CAPEX de salida positivo; o KPI legacy identificado',COBERTURA_INTERESES:'EBIT/abs(gasto intereses), intereses≠0',DEUDA_NETA_EBITDA:'(CP+LP−efectivo)/EBITDA, EBITDA>0',CURRENT_RATIO:'Activo corriente/pasivo corriente',QUICK_RATIO:'(AC−inventarios−prepagos)/PC',CASH_RATIO:'Efectivo/PC'};
const sources={INGRESOS:'PCV INGRESOS',EBITDA:'PCV EBIT/D&A; KPI EBITDA',EBIT:'PCV EBIT',ACTIVOS_TOTALES:'PCV ACTIVOS_TOTALES',EFECTIVO:'PCV EFECTIVO',DEUDA_FINANCIERA:'PCV DEUDA_CORTO_PLAZO/DEUDA_LARGO_PLAZO',DEUDA_NETA:'PCV deuda/caja',PATRIMONIO_NETO:'PCV PATRIMONIO_NETO',CFO:'PCV FLUJO_CAJA_OPERATIVO',CAPEX:'PCV CAPEX',FCF:'PCV CFO/CAPEX; KPI FCF',COBERTURA_INTERESES:'PCV EBIT/GASTO_INTERESES',DEUDA_NETA_EBITDA:'PCV y, si corresponde, EBITDA KPI',CURRENT_RATIO:'AC/PC no normalizados',QUICK_RATIO:'Faltan AC/PC/prepagos',CASH_RATIO:'Falta PC, no basta deuda CP'};
const green=id=>countries.reduce((a,co)=>a+(f.sampleSummary[co].metrics[id]||0),0);
const allMetricRows=metricIds.map(id=>{const r=s.overall.metrics[id];return[label[id],r.eligibleCompanies?'AMARILLO':'ROJO',n(r.storedCompanies),np(r.eligibleCompanies,total),n(r.storedReports),n(green(id)),sources[id],formulas[id]];});
let years='';for(const co of countries){const den=s.byCountry[co].denominatorCompanies;years+=`### ${co}: denominador ${n(den)} empresas registradas en cada ejercicio\n\n`+table(['Ejercicio de cierre','Con informe anual','Con publicación admisible','Ingresos','EBITDA','Deuda CP+LP','Efectivo','CFO','Activos','Tamaño básico mismo informe'],s.byYear.filter(r=>r.country===co).map(r=>[r.year,np(r.companiesWithReport,den),np(r.companiesWithPublishedReport,den),np(r.metrics.INGRESOS.eligibleCompanies,den),np(r.metrics.EBITDA.eligibleCompanies,den),np(r.metrics.DEUDA_FINANCIERA.eligibleCompanies,den),np(r.metrics.EFECTIVO.eligibleCompanies,den),np(r.metrics.CFO.eligibleCompanies,den),np(r.metrics.ACTIVOS_TOTALES.eligibleCompanies,den),np(r.bundles.TAMANO_BASICO.eligibleCompanies,den)]))+'\n';}
const byMetricCountry=table(['Indicador','US / 8.017','JP / 3.581','TW / 1.596 — bloqueado por procedencia'],metricIds.map(id=>[label[id],...countries.map(co=>np(s.byCountry[co].metrics[id].eligibleCompanies,s.byCountry[co].denominatorCompanies))]));
const sampleTable=table(['Indicador','US: 20 informes','JP: 20 informes','TW: 20 informes'],metricIds.map(id=>[label[id],...countries.map(co=>n(f.sampleSummary[co].metrics[id]))]));
write('12_COBERTURA_LIQUIDEZ_TAMANO.md',`# Fase 2 — disponibilidad real de liquidez y tamaño

## Qué significan los colores

**VERDE:** observación técnicamente cotejada con importe/registro/periodo/moneda/base y evidencia de publicación, para la definición examinada. **AMARILLO:** existe número o conjunto de insumos, pero falta conciliar calidad/semántica/contexto o completar datos. **ROJO:** falta información suficiente o hay una incompatibilidad de identidad/mercado que bloquea el uso. **GRIS:** definición industrial no aplicable al modelo, como ciertos ratios de bancos/aseguradoras.

Los colores se refieren al dato, nunca autorizan una prima. No hay una clasificación global VERDE de todos los importes por tener un campo no NULL. Se dan los conteos numéricos exhaustivos y, separadamente, una muestra cotejada. Las 121 empresas con familia BANK/INSURANCE resuelta se tratan como GRIS en los indicadores industriales no aplicables; las familias pendientes no se convierten en financieras ni industriales por defecto. Los conteos numéricos que siguen incluyen todos los modelos como inventario, no como aprobación de su uso.

## Método y denominadores

La población capturada es de ${n(total)} empresas y ${n(d.reports.length)} informes ANUALES con cierre en 2022–2026. Cada empresa se cuenta como máximo una vez por indicador en el total y una vez por empresa/ejercicio en las tablas anuales. **No sumar las filas de años para obtener empresas únicas.** Un año se identifica por el año de cierre, no por el nombre fiscal del proveedor.

Presencia almacenada = importe numérico no ambiguo y con signos admisibles para la identidad diagnóstica, o KPI heredado explícitamente identificado. Derivación = todos los insumos en un mismo informe; no se usa pasivo total como deuda ni NULL como cero. Publicación admisible = fecha no NULL, >= cierre y <=29/10/2026, con cierre también <=corte. Esto es un filtro de metadatos, no validación oficial de la publicación. Las observaciones de un contexto individual se mantienen separadas de las consolidadas; las de contexto desconocido permanecen AMARILLAS.

La cobertura se calcula de PCV/KPI y se presenta VIV aparte porque sus fechas no concuerdan. Los datos físicos VIV no se mezclan con PCV para completar una fórmula. Las diferencias de importes en un mismo concepto/informe se bloquean; no se elige el mayor o más conveniente. Los KPI con insumos dudosos no se elevan a VERDE.

## Dieciséis indicadores financieros

En la tabla: “almacenada” y “con publicación” son **empresas únicas**; “informes numéricos” cuenta informes, no empresas; “verde muestra” son informes de la muestra limitada, no cobertura poblacional. PCV=partida_contable_valor unida a taxonomia_concepto; KPI=kpi_financiero_informe; IF=informe_financiero.

${table(['Indicador','Estado agregado','Empresas almacenadas','Empresas con publicación / 13.194','Informes numéricos','Verde en muestra / 60','Origen','Fórmula/definición'],allMetricRows)}
La columna verde de muestra acredita únicamente los controles técnicos descritos, no una auditoría contable completa ni que la caja esté libre de restricciones. No se transforma EBITDA negativo en un ratio interpretable de deuda/EBITDA. CAPEX con convención no conciliada queda pendiente aunque pueda existir FCF calculado previamente. La precisión de comparación de la muestra utiliza la tolerancia de redondeo DECIMAL(24,4) del importador existente, no un umbral financiero.

${byMetricCountry}
TW: las empresas con publicación admisible coinciden con el grupo EDINET/Tokyo/TWD bloqueado. **No presentar esas columnas como cifras fiables de empresas de Taiwán.** FINMIND aporta números anuales a la población almacenada, pero sin publicación histórica acreditada. En ninguna columna se convierte una moneda por el país del emisor.

Problemas y solución: deuda requiere ambos componentes y definición de arrendamientos; intereses requieren gasto/periodo coherente; activos y caja requieren saldos, no movimientos; FCF requiere signo/definición; todos requieren procedencia/periodo/moneda/escala. Solución inicial: recuperar evidencia y reutilizar normalización/KPI existentes con validaciones, sin cambiar datos históricos. **Current/quick/cash ratio necesitan desarrollo adicional de extracción/mapeo de AC, PC y prepagos:** no existen columnas VIV, conceptos estándar o KPI guardados suficientes, ni se encontraron las etiquetas exactas inspeccionadas en las partidas del barrido. Eso no afirma que no aparezcan en los documentos originales.

## Cobertura temporal por empresa y ejercicio

Los porcentajes usan todas las empresas registradas del país en cada fila, incluidas las sin informe. Son disponibilidad de un ejercicio, no cobertura continua. Los trimestrales/semestrales no entran; 2026 está separado y no representa un año completo para todo el universo.

${years}
En 2022–2025, **5.102** empresas tienen tamaño básico numérico en los cuatro ejercicios; solo **918** tienen además un contexto identificable de base común en los cuatro años. Para tamaño ampliado (añade EBIT, deuda, caja y patrimonio): **1.915** numéricas / **80** con contexto común. Para liquidez parcial: **1.198** / **42**. Esto tampoco coteja todos los importes con fuente ni demuestra suficiencia estadística. Ninguna tiene el conjunto de ratios de circulante completo con los insumos actuales.

## VIV: campos presentes no equivalen a datos conciliados

La última VIV aparece en ${n(d.vivStats.latestReports)} informes de la población, de los cuales ${n(d.vivStats.reportDateMismatch)} tienen fecha distinta. Presencia no NULL en esa última versión, sin certificar su vigencia:

${table(['Columna VIV','Informes con valor'],Object.entries(d.vivStats.storedPresence).map(([k,v])=>[k,n(v)]))}
No utilizar estos números para aumentar la cobertura PCV ni pasar moneda/acciones al módulo sin reconciliar. La calificación ALTA de la fila no repara fechas, dilución, escala o identidad.

## Liquidez bursátil: clasificación A/B/C/D

A=almacenado en MySQL; B=derivable de datos suficientes existentes; C=requiere fuente externa autorizada; D=no disponible actualmente. Una variable puede ser A parcial y requerir C para completar lo perdido.

${table(['Variable','Situación','Color','Disponibilidad real','Desarrollo adicional'],[
 ['Precio, fecha, instrumento','A parcial; C para histórico','AMARILLO','8.241 filas/8.241 instrumentos; una fecha por instrumento, fecha-precio no conciliada','Conservar diario, fuente/feed y semántica del cierre'],
 ['Moneda de negociación','A parcial','AMARILLO','instrumento.moneda existe; 299 TW/Tokyo/TWD requieren identidad y mercado','Conciliar instrumento/clase/feed; no inferir FX'],
 ['Volumen en acciones','C + D actual','ROJO','0 columnas/KPI de volumen en la estructura y datos tipificados examinados','Capturar volumen oficial con unidad y calendario'],
 ['Volumen monetario','C + D actual','ROJO','No está almacenado; no derivable de un cierre aislado','Priorizar importe transado; cierre×volumen es aproximación, no dato observado'],
 ['Retorno diario ajustado','C + D actual','ROJO','No hay serie por instrumento','Histórico y reglas de splits/dividendos coherentes'],
 ['Free float','C + D actual','ROJO','Sin número/fracción libre fechada y conciliada','Fuente por clase y fecha; acciones totales no son free float'],
 ['Bid-ask spread','C + D actual','ROJO','Sin bid/ask simultáneos','Solo cotizaciones verificadas; no proxy de cierre'],
 ['Turnover','D; B solo tras nuevos insumos','ROJO','Faltan volumen y denominador de acciones/free float fechado','Definir tipo de turnover y universo'],
 ['Número de sesiones negociadas / días sin negociación','D','ROJO','104 fechas globales no prueban sesiones por instrumento','Calendario oficial y cero negociado confirmado, separado de dato ausente'],
 ['Acciones corporativas','A parcial','AMARILLO','20 splits/20 instrumentos; no cobertura integral ni precio ajustado acreditado','Conciliar ratios/fechas/clases, sin backfill inferido'],
 ['Amihud','D','ROJO','0 series actualmente suficientes en el almacén canónico','Requiere retornos e importe positivo diario, moneda/calendario comunes']
])}
La fórmula futura sería media(|r diario|/importe monetario diario) sobre sesiones válidas. No se calculó Amihud ni una prima. Si se estima importe como precio×volumen en acciones, debe etiquetarse como **aproximado** y validar ambos insumos en la misma sesión/base. VWAP×volumen solo mejora la estimación si ambos campos cubren exactamente las mismas operaciones y filtros; tampoco se da por observado sin comprobarlo. Precios ajustados con volúmenes sin ajustar pueden producir otra incoherencia.

## Capitalización bursátil

Precio/fecha en cotizacion_diaria; acciones en PCV ACCIONES_EN_CIRCULACION y VIV.acciones_en_circulacion; fecha de referencia contable en IF y, cuando existe, fecha del hecho en evidencia; moneda en instrumento/VIV y evidencia. No hay clase de acción, base de acciones propias o conciliación universal de splits en columnas del instrumento. La etiqueta ACCIONES_EN_CIRCULACION incluye en la ruta JP una extracción de **acciones emitidas totales** (shareDefinition=TOTAL_ISSUED_SHARES_AT_FISCAL_YEAR_END); no se puede asumir que excluye autocartera.

${table(['País','Pareja numérica precio+acciones (parcial)','Sin pareja admisible','Acciones publicadas antes del precio y moneda contextual compatible','Fecha de cierre de acciones exactamente igual al precio','Capitalización integral acreditada automáticamente'],countries.map(co=>{const x=s.byCountry[co];return[co,np(x.capitalizationPartial,x.denominatorCompanies),np(x.capitalizationUnavailable,x.denominatorCompanies),n(x.capitalizationDateCompatible),n(x.capitalizationExactDate),0];}))}
Total: **6.269 parejas parciales** y **6.925 sin pareja admisible** bajo el filtro utilizado. No se ha multiplicado ninguna pareja para publicarla como capitalización fiable. “0 acreditadas automáticamente” no prueba que ninguna empresa pueda obtener una capitalización tras revisión individual: significa que no se demuestra la conciliación completa de emisor, clase, acciones efectivamente en circulación, autocartera, fecha, moneda y splits. Las 293 parejas TW parciales están además bloqueadas por identidad/procedencia. Patrimonio contable y acciones diluidas no sustituyen a capitalización observada. VIV solo puede aportar una candidata si coincide fecha con IF; no se corrige el desplazamiento de un día silenciosamente.

## Tamaño, familias y comparables

Existen 46 sectores y seis bolsas, pero no subsector normalizado. **10.431 empresas** tienen sector base N/A. Reutilizando la clasificación aceptada HIGH disponible a fecha de corte, quedan **10.001** con sector efectivo N/A (${pct(10001,total)}). La familia sigue INDETERMINADA en **10.949** empresas; no se fuerza el modelo general para resolverlas.

Se obtuvieron **84 grupos país×sector efectivo**; 65 tienen mapeo sectorial conocido. Para ingresos+EBITDA+activos en 2025 y contexto consolidado identificado, 32 de esos 65 tienen al menos dos empresas, 9 tienen una y 24 ninguna. Dos observaciones permiten una mediana aritmética, **no demuestran comparabilidad económica ni suficiencia de una prima**. No se calculan coeficientes ni primas por percentil. Los grupos N/A y modelos/actividades amplias requieren resolver clasificación; bancos/seguros van aparte.

${table(['País','Sector efectivo','Registradas','Tamaño básico numérico 2025 con contexto consolidado','Precios (empresas)','Capitalización fiable / Amihud'],s.comparable.filter(x=>x.mappingKnown&&x.sectorId!==221&&x.consolidatedContextSize>0&&!['Banking','Insurance'].includes(x.sector)).sort((a,b)=>b.consolidatedContextSize-a.consolidatedContextSize).slice(0,20).map(x=>[x.country,x.sector,n(x.registered),n(x.consolidatedContextSize),n(x.priceCompanies),'0 / 0']))}
Son conteos de candidatos para descripción, no listas de comparables ya homologadas. La evidencia JSON conserva los 84 grupos y sus conteos. No se suman cantidades monetarias USD/JPY/TWD ni se mezclan bases individuales/consolidadas. En bancos, aseguradoras y empresas sin clasificación resuelta se requiere metodología específica. El análisis **residual** de tamaño está ROJO para calibración actual: faltan capitalización conciliada, liquidez bursátil y retornos/factores compatibles, aunque existan ingresos/activos.

## Muestra de calidad cotejada, sin extrapolación

Selección deliberada de 20 empresas/informes por país, no aleatoria. Resultado de cotejar PCV con candidato, IDs, periodo, moneda/base y publicación documental:

${sampleTable}
VERDE solo describe esas observaciones y controles. El resto no se considera inexistente ni inválido por no estar en la muestra, pero permanece sin certificación individual. El número poblacional de indicadores completamente certificados no se presenta como una estimación estadística. Las 20 observaciones TW muestreadas no superan la evidencia requerida.

## Viabilidad actual

- Liquidez financiera: **AMARILLO parcial**, ROJO para ratios sin AC/PC; GRIS donde el modelo no aplica.
- Liquidez bursátil/Amihud: **ROJO** en el almacén actual.
- Tamaño operativo descriptivo: **AMARILLO**, con observaciones VERDES de la muestra y grupos candidatos limitados.
- Capitalización y tamaño residual calibrable: **ROJO para uso automático fiable**, aunque haya parejas numéricas parciales.
- No existe ninguna prima nueva de liquidez o tamaño autorizada, positiva, negativa o cero por efecto de esta auditoría. Un dato desconocido sigue desconocido; no se registra como prima cero.

${evidence}
`);

write('13_FUENTES_GRATUITAS_PENDIENTES.md',`# Fase 2 — fuentes pendientes para carencias reales

Consulta documental pública: 29/10/2026. Se reutiliza la investigación de fase 1; no se repite bibliografía académica. Se consultaron especificaciones oficiales únicamente para relacionar las carencias verificadas con fuentes posibles. **No se instalaron clientes, llamaron nuevas APIs de datos, activaron proveedores o contrataron planes.** Las URLs de abajo son referencias para una fase futura.

## Prioridad cero: recuperar contexto existente antes de descargar más

Antes de incorporar más cifras, conciliar las fechas VIV (88.464 versiones desplazadas), el grupo de 294 empresas TW/Tokyo/EDINET y las publicaciones FINMIND ausentes. Hay información numérica ya almacenada y evidencias import/verification/report que deben aprovecharse. Una descarga nueva no demuestra que el instrumento viejo, moneda o emisor fueran correctos.

Para current/quick/cash ratio faltan AC/PC/prepagos normalizados, no necesariamente los documentos fuente. Priorizar los informes públicos ya descargados y los conectores SEC/EDINET/MOPS existentes, con contexto consolidado, unidad y periodo; no crear otra taxonomía o API. Para acciones hacen falta fecha del hecho, clase y acciones propias: no basta recuperar otra vez un total emitido.

## Estados Unidos

${table(['Carencia real','Fuente candidata / reutilización','Condición y límite'],[
 ['Serie diaria, volumen y ajustes','Alpaca ya integrado; revisar históricos del feed contratado/gratuito existente','No se ha probado entitlement o licencia de esta cuenta. La consulta histórica debe declarar feed; el precio IEX no se mezcla con volumen SIP'],
 ['Importe monetario y sesiones','Operaciones del mismo feed o campo oficial de importe; calendario de bolsa y reglas de sesión','Volumen de acciones no es importe. VWAP×volumen solo con filtros coincidentes; cierre×volumen es aproximación'],
 ['Acciones, clase, autocartera, AC/PC y fecha de publicación','SEC EDGAR, ya integrado; informes y contextos XBRL del emisor','Reutilizar CIK/accesión/unidad/contexto. No usar promedio ponderado diluido como acciones en circulación'],
 ['Free float y bid/ask','Declaraciones de emisor/SEC y cotizaciones del feed autorizado, cuando existan','No hay un free float universal diario en CompanyFacts; EntityPublicFloat es un valor de mercado no afiliado, no automáticamente una fracción de acciones. No se acredita aquí un histórico gratuito completo de spreads consolidados']
])}
La [documentación oficial de Alpaca](https://docs.alpaca.markets/us/docs/market-data-faq) distingue IEX (una bolsa) de SIP (consolidado); describe acceso histórico SIP sin suscripción cuando el final consultado tiene el retraso requerido. La [tabla oficial de cobertura](https://docs.alpaca.markets/us/docs/about-market-data-api) también distingue las limitaciones de Basic. Son posibilidades documentales, **no comprobaciones de acceso, derechos comerciales o cobertura efectiva de la cuenta**. No se activó ninguna ruta. Para datos históricos de cierre, el acceso diferido merece evaluación antes de asumir que toda cobertura consolidada exige pago; para datos recientes rigen restricciones distintas.

SEC resuelve documentación financiera, no el volumen diario consolidado ni una base de microestructura. No se identifica como disponible a coste cero un almacén universal ya autorizado para cualquier uso de mercado US. La compatibilidad de uso debe quedar documentada antes de materializar datos de terceros en G2.

## Japón

${table(['Carencia real','Fuente candidata / reutilización','Condición y límite'],[
 ['Precios diarios, volumen y valor transado','JPX/TSE: tabla oficial diaria y documentación de J-Quants','La publicación y la licencia de descarga/uso empresarial son cuestiones distintas; no se acredita una fuente masiva gratuita apta para G2'],
 ['Acciones emitidas menos propias, clase y fecha','EDINET/FSA y notas del emisor ya integradas; reutilizar documentos y registro','La ruta actual JP guarda acciones emitidas totales bajo un nombre de circulación; separar definición antes de usarla'],
 ['AC/PC/prepagos, moneda/consolidación','Documentos EDINET ya descargados','Añadir mapeo/contexto en una fase autorizada, sin inferir saldos de movimientos'],
 ['Free float, suspensiones y bid/ask histórico','Información oficial JPX/emisor y datos de mercado autorizados','No se ha identificado aquí una serie gratuita completa y empresarialmente compatible; dejar pendiente']
])}
La [especificación oficial de datos de J-Quants](https://jpx-jquants.com/en/help/data) documenta Volume/Vo, TurnoverValue/Va, factores de ajuste y la distinción entre acciones emitidas y treasury shares. **No basta que exista Free:** sus [condiciones oficiales de uso](https://jpx-jquants.com/en/help/usage) limitan la API personal al uso privado de personas físicas y excluyen usos corporativos o aplicaciones con datos alojados por el operador. Por ello **no se propone J-Quants personal como proveedor gratuito utilizable por G2EXCHANGE**. La alternativa corporativa no se contrata en presupuesto cero. El [plan Free](https://jpx-jquants.com/en/help/plan), además, tiene retraso y vigencia limitados, lo que tampoco resuelve una serie actual completa.

Queda una carencia real de fuente japonesa de mercado a 0 € con derechos compatibles demostrados. No se cubre con una declaración de gratuidad ni con otra API no validada. Puede continuarse con estados y evidencia ya existentes mientras esa decisión sigue pendiente.

## Taiwán

${table(['Carencia real','Fuente candidata / reutilización','Condición y límite'],[
 ['Precio diario, volumen en acciones e importe','TWSE oficial: STOCK_DAY_ALL y consulta histórica por valor; ya hay lector de cierres en el proyecto','El lector actual desecha otros campos. Validar TradeVolume/TradeValue, fechas ROC/ISO y unidad, sin desarrollar ahora'],
 ['Datos de valores TPEx','TPEx: cotización/cierre oficial, ya referenciado por el recuperador','La documentación pública OpenAPI devolvió 403 a la herramienta de consulta; no se probó descarga ni cuota de datos. Verificar campos y cobertura antes de prometerlos'],
 ['Publicación, consolidación, acciones propias/clase y AC/PC','MOPS/filings oficiales y datos públicos de emisores; reutilizar ruta de informes','Prioridad frente a aceptar EDINET como origen de empresas TW. Conciliar stock_id, identidad legal y documento'],
 ['Free float, eventos y sesiones','Registros oficiales TWSE/TPEx y documentos del emisor','El volumen negociado no determina free float. Revisar unidad por lote/acción y cobertura de sesiones/operaciones']
])}
TWSE publica la [consulta histórica de volumen/valor por instrumento](https://www.twse.com.tw/en/trading/historical/stock-day.html) con descarga CSV y periodo publicado desde 2010, y documenta los conjuntos en [su OpenAPI](https://openapi.twse.com.tw/). Esto da una vía oficial concreta para estudiar los huecos detectados. No demuestra derecho irrestricto de redistribución, acceso automatizado masivo sin límites ni una autorización comercial específica. Deben documentarse las condiciones del dataset y el alcance de operaciones incluidas. No usar estadísticas globales del mercado como volumen de cada acción ni confundir day trading con todo el volumen.

## Qué no se necesita contratar o integrar ahora

No hacen falta primas comerciales, tablas de size premium de pago, APIs de valoración o una segunda base contable. El ERP/beta y el módulo de fase 1 ya existen; el hueco está en identidad, fechas, calidad, precio/volumen y acciones. Los factores públicos French y los agregados de Damodaran no reparan esas carencias instrumentales y no aportan automáticamente una prima calibrada. No se realiza ninguna integración en esta fase.

Toda fuente futura debe conservar mercado/feed, moneda, instrumento/clase, fecha/sesión, ajustes, volumen e importe con sus unidades, publicación/disponibilidad, límites de uso y versión del dato. Si no hay fuente gratuita compatible demostrada, el indicador queda no disponible; no se sustituye por un coeficiente o un proxy silencioso.
`);

write('14_PLAN_TECNICO_SIGUIENTE_FASE.md',`# Fase 2 — plan técnico siguiente, sin ejecución

## Decisión recomendada

**Priorizar identidad y fechas antes de alimentar el módulo o recuperar masivamente precios.** Hay 13.194 empresas, pero no una base homogénea validada para primas. Resolver primero las incidencias observadas y especificar cómo conservar histórico diario. No modificar el WACC ni activar cuantificación: Amihud y tamaño residual siguen sin datos de mercado suficientes.

## P0 — conservar y conciliar sin corregir históricos automáticamente

1. Revisar en una copia autorizada los 299 instrumentos TW/Tokyo/TWD de 294 empresas y sus 1.176 informes EDINET. Conciliar país de empresa, bolsa, moneda real, código local, ISIN, emisor legal y documento original. Investigar colisión de tickers numéricos, sin darla por causa demostrada. La UNIQUE global de ticker es un riesgo confirmado; no cambiarla antes del inventario de consumidores.
2. Revisar las 88.464 fechas VIV desplazadas un día. Distinguir error de serialización de discrepancia real de periodo. Preparar una solución versionada que conserve valores/fechas originales y soporte replay, no un UPDATE general de +1 día. Los cuatro casos coincidentes y las distintas rutas de importación deben formar parte de la validación.
3. Recuperar publicación original de los informes FINMIND y evidencias de consolidación/moneda/escala. Para propuestas históricas, una fecha supuesta o descargada hoy no equivale a disponibilidad original. No completar NULL por calendario.
4. Separar en el futuro adaptador de investigación las observaciones bloqueadas, pendientes y validadas sin borrar información, alterar valores de producción o cambiar los recuperadores en esta fase. No usar las 294 empresas TW como comparables por tener números completos.

Reutilizar empresa/instrumento/mercado, taxonomía, classification_evidence, financial_report_evidence, pcv_import_evidence y pcv_verification_evidence. Las evidencias actuales ya contienen parte de lo necesario: no crear otra capa de identidad paralela sin examinarla.

## P1 — especificar y ensayar la conservación diaria

La única tabla bursátil canónica encontrada es cotizacion_diaria. Antes de proponer otra tabla, ensayar cómo ampliar esta manteniendo id/instrumento/fecha/precio y los lectores del último precio. Diseño candidato sujeto a revisión: clave única instrumento+sesión (y feed/versión si el requisito lo exige), índice para último/rango, columnas nullable de volumen de acciones e importe negociado, moneda/feed/fuente, fecha real de observación, ajuste y estado de calidad. No escribir volumen=0 cuando no se obtuvo dato.

El escritor actual solo actualiza el precio en conflicto. La especificación futura deberá distinguir misma sesión/revisión y un nuevo día, preservar la fecha correcta y registrar procedencia. Las filas legacy precio-fecha no reconciliadas requieren un tratamiento explícito; no se insertan en un backtest como si estuvieran fechadas correctamente. Cambiar la UNIQUE no recupera precios perdidos.

Dependencias: prepararInstrumento (asOf/último precio/perfil rating/pesos), guardarCotizacionesUSA/Taiwan/Japon, ruta de actualización USA, consulta de seguimiento y lectores de snapshots/ejecuciones. Probar además supuestos de herramientas operativas y la consulta de seguimiento con columnas hoy ausentes. No eliminar ni sustituir la tabla actual. Todo DDL, cambio de escritor o programación queda **pendiente de aprobación de otra fase**.

## P2 — fuentes y consistencia de series

Reutilizar primero proveedores ya integrados y sus datos existentes con licencia compatible. TWSE ofrece una vía oficial para volumen/importe histórico; en US evaluar históricos diferidos del feed Alpaca existente y sus derechos; Japón conserva un bloqueo real de disponibilidad/licencia a 0 €. No usar la API personal J-Quants como fuente corporativa. No contratar una solución alternativa para cerrar la tarea.

Definir, antes de calcular: sesión/bolsa/calendario, cobertura del feed, precios ajustados/no ajustados, splits/dividendos, volumen de acciones frente a moneda, cero negociado confirmado frente a ausencia, exclusiones y número de observaciones. Un día sin fila no significa iliquidez. Una aproximación cierre×volumen requiere etiqueta, validación y no se presenta como importe transado observado.

## P3 — capitalización por instrumento y emisor

Usar precio y acciones en circulación de la misma clase/fecha/base; acciones emitidas menos propias cuando corresponda, sin sustituir por promedio diluido. Documentar acciones emitidas JP actualmente almacenadas, cambios de capital, ADR, clases múltiples, ISIN y número de acciones. No sumar instrumentos de un emisor duplicando capitalización.

El resultado futuro debe distinguir precio/acciones disponibles, conciliados y bloqueados. Hoy hay 6.269 parejas numéricas parciales, cero conciliaciones integrales acreditadas automáticamente y 6.925 empresas sin pareja admisible. Ninguna de esas cifras autoriza calcular un size premium.

## P4 — reutilizar indicadores e incorporar controles de calidad

Reutilizar PCV/taxonomía y KPI existentes cuando los insumos estén acreditados. No confiar en la etiqueta ALTA o en la moneda VIV sin contrastar. La deuda requiere CP/LP o una definición financiera total completa y conciliada; no pasivos. FCF legacy requiere conciliación de signo/CFO/CAPEX. Completar AC/PC/prepagos a partir de documentos ya disponibles antes de añadir fuentes innecesarias. Bancos/seguros requieren sus indicadores propios.

La auditoría exhaustiva de disponibilidad no es una auditoría de cada JSON contable. Para ampliar la certificación de calidad, priorizar campos/empresas concretos con lectura por IDs e índices; si se requiere revisar masivamente varios GB, usar una copia de solo lectura autorizada o ventana acordada, sin competir con recuperación. No ejecutar un JOIN JSON global sobre toda la evidencia. Los conteos de muestra no se extrapolan.

## P5 — comparables y adaptador al módulo de fase 1

Reutilizar clasificación aceptada HIGH y mapeo sectorial ya existentes, pero mantener N/A y familia pendiente visibles. No elegir la plantilla general para ocultar la falta de sector. El detalle por país/sector/bolsa/familia está en cobertura_resumen.json; no hay subsector normalizado. Los 32 grupos con al menos dos observaciones consolidadas de tamaño básico solo son candidatos descriptivos: comprobar actividad, duración, año fiscal, moneda/base y fuente antes de compararlos.

Preparar posteriormente un **adaptador de lectura** pequeño al contrato Dato/PeriodoFinanciero/Empresa/Benchmark de research/coste_capital/src. Debe aportar valor, unidad y escala real, moneda, fecha, conocidoDesde, fuente y validación; nunca convertir NULL a cero, completar fechas con defaults ni mezclar PCV/VIV desalineados. Mantener distintos conceptos de liquidez financiera, bursátil, insolvencia y comerciabilidad. No llamar escritores o importar módulos backend con efectos de conexión/persistencia para calcular ratios.

Para Amihud, alimentar sesiones con retorno ajustado e importe monetario validado, calendario y cobertura. Para tamaño, primero capitalización conciliada y controles de calidad, negocio, rentabilidad, deuda y liquidez; después investigación residual con retornos/factores adecuados. Con los datos actuales ese último paso sigue bloqueado. No convertir percentiles o medianas en primas. Referencias actuales de ERP total ya contienen país; no duplicarlo.

## Criterios de aceptación de una fase futura

- Identidad/país/bolsa/moneda y periodos reconciliados con evidencia, preservando originales.
- Serie diaria verificable con fuente/feed/ajustes, huecos y ceros identificados; sin afirmar amplitud suficiente solo porque se almacenó una ventana.
- Capitalización por clase y emisor documentada, con acciones propias/splits/ADR y fecha apropiada.
- Indicadores con estados VERDE/AMARILLO/ROJO/GRIS y denominadores; desconocidos sin cuantificar.
- Comparables con miembros explícitos, fuentes, corte, base, selección/exclusiones y versión, sin sesgo futuro.
- Adaptador interno probado sin conexiones de escritura, con pruebas de fechas, monedas, unidades, duplicados y familias.
- Producción, WACC/DCF, 16 maestros y valoraciones anteriores inalterados; cualquier nueva fórmula/modelo requerirá validación y aprobación separadas.

**No se han ejecutado estos pasos de implementación.** Esta fase entrega diagnóstico, consultas auditables y propuestas. No contiene una migración ejecutable nueva, recuperador, endpoint, activación o estimación de primas.

## Archivos nuevos y reproducción

Los cinco informes nuevos son docs/10_AUDITORIA_MYSQL_REAL.md, 11_AUDITORIA_COTIZACIONES.md, 12_COBERTURA_LIQUIDEZ_TAMANO.md, 13_FUENTES_GRATUITAS_PENDIENTES.md y 14_PLAN_TECNICO_SIGUIENTE_FASE.md. Los informes 01–09 y README de fase 1 no se sobrescriben.

fase2/auditar_mysql.cjs permite lectura por fases --metadatos, --contexto, --financieros y --final; utiliza dependencias existentes y controles de sesión/SQL. resumir_datos.cjs agrega localmente resultados y generar_informes.cjs genera estos informes con protección de no sobrescritura. Los logs conservan también el intento parcial que se detuvo por límite; no se usa como cobertura final.

Repetir la auditoría carga otra vez datos y puede dar cifras distintas por recuperación activa. Para consultar la entrega no hace falta volver a conectarse: usar los informes y evidencias ya conservados. No ejecutar los scripts de migración, reparación, estado/escritura o recuperación del repositorio como parte de esta lectura.

La comprobación final de integridad de archivos se registra por separado en fase2/evidencias/integridad_final.json. No se comparan checksums de tablas reales: las recuperaciones autorizadas pueden cambiar sus filas mientras la auditoría solo lee. La trazabilidad de SQL y los controles READ ONLY acreditan que esta intervención no ejecutó escrituras.
`);
const append=(file,text)=>{const dest=path.join(docs,file),marker=text.trim().split('\n')[0];if(!fs.existsSync(dest))throw Error('Falta informe nuevo para ampliar');if(!fs.readFileSync(dest,'utf8').includes(marker))fs.appendFileSync(dest,'\n'+text);};
const int=load('integridad_final'),extra=load('complementos');
append('10_AUDITORIA_MYSQL_REAL.md',`## Comprobación final de archivos y lectura complementaria

Se compararon **${n(int.comparedFiles)} archivos originales**: ${n(int.unchanged)} permanecían idénticos y tres informes operativos de server/docs cambiaron concurrentemente sin que esta intervención los editara (INFORME_COBERTURA_85.md, INFORME_FMP_COMPLEMENTARIO.md e INFORME_RECUPERACION_US_JP_TW.md). Se conservan ambos hashes, sin restaurarlos ni atribuir su autoría. **Ningún archivo financiero protegido cambió.** El manifiesto de motor 1.5.1 coincide con fase 1 tanto en fuente como en binario; las 16 plantillas y todos los archivos de fase 1 comprobados permanecen iguales.

La lectura complementaria terminó a ${madr(extra.capturedAtUtc)} (Europe/Madrid). En las 60 entradas de ejecución congeladas no aparecen los campos comprobados de volumen agregado, free float, bid/ask o series alternativas de precios. No se ha utilizado ese JSON como un supuesto histórico de mercado. La verificación local se conserva en verificacion_entrega.json; no son pruebas nuevas de fórmulas financieras ni una repetición de las 69 pruebas anteriores.
`);
append('11_AUDITORIA_COTIZACIONES.md',`## Comprobación adicional de históricos en las ejecuciones

Se consultaron de forma agregada las 60 entradas JSON de valuation_execution: 0 con risk_inputs.median_daily_dollar_volume_90d y 0 con los campos alternativos inspeccionados free_float, bid, ask, daily_prices, quotes o prices. Esto descarta esas rutas concretas como fuentes de volumen o serie diaria en los runs presentes, sin afirmar que cualquier fichero externo o respaldo no examinado carezca de precios. La búsqueda explícita de nombres de cotizaciones/precios/quotes/bars/charts dentro de private_backups tampoco encontró un almacén con esos nombres; no se descomprimió todo su contenido.
`);
append('12_COBERTURA_LIQUIDEZ_TAMANO.md',`## Distribución adicional por bolsa y familia

Bolsa **registrada** en instrumento (no se da por reconciliada con el país del emisor):

${table(['Bolsa registrada','Instrumentos','Empresas distintas','Instrumentos con precio'],s.markets.sort((a,b)=>a.marketId-b.marketId).map(r=>[c.reference.markets.find(x=>x.id===r.marketId)?.nombre_bolsa??r.marketId,n(r.instruments),n(r.companies),n(r.pricedInstruments)]))}
Las empresas pueden tener varios instrumentos o bolsas; **no sumar empresas de distintas bolsas** como universo de emisores únicos. Tokyo incluye 299 instrumentos de 294 empresas TW denominados en TWD, que deben conciliarse y no clasificarse como observaciones japonesas válidas. No se usaron como una fuente externa ni se convirtieron monedas.

${table(['Familia resuelta','US','JP','TW'],['FCFF','RESOURCE','PHARMA','BANK','INSURANCE','REIT','INDETERMINADA'].map(k=>[k,...countries.map(co=>n(s.byCountry[co].familyCounts[k]||0))]))}
La ausencia de REIT resueltos no prueba que no existan compañías inmobiliarias; Real Estate está pendiente de clasificación específica en el mapeo. Un sector amplio revisable tampoco equivale a una familia validada.

**Rentabilidad disponible:** los KPI reales incluyen ${n(f.kpiKinds.find(x=>x.kpi==='ROA').filas)} registros ROA, ${n(f.kpiKinds.find(x=>x.kpi==='ROE').filas)} ROE y márgenes bruto/EBIT/EBITDA/neto/FCF, guardados como PORCENTAJE. Son filas de informe de todos los periodos, no empresas únicas ni cifras de cobertura anual 2022–2026. No se convierten en controles residuales validados por estar presentes. Para usarlos deberán acreditarse insumos, periodo, base y escala, con bancos/aseguradoras tratados según modelo. Los conteos empresariales exhaustivos de los 16 indicadores principales se mantienen separados de este inventario adicional.

**Básico no significa suficiente para una prima:** las 7.377 empresas con ingresos/EBITDA/activos no tienen por ello liquidez bursátil o capitalización conciliada. Tras apartar las 283 del grupo TW bloqueado, quedan 7.094 candidatas numéricas US/JP, no empresas universalmente certificadas. El conjunto con liquidez financiera parcial pasa de 3.325 a 3.101 si se apartan las 224 TW afectadas. Ninguno de esos ajustes al universo es una modificación de datos o valoración.
`);
append('13_FUENTES_GRATUITAS_PENDIENTES.md',`## Precisión de la variable free float de SEC

La [definición SEC del elemento EntityPublicFloat](https://www.sec.gov/Archives/edgar/data/1514371/000122527912000078/R1.htm) lo describe como valor de mercado de equity común en manos de no afiliados. Su tipo es monetario y su fecha de referencia no es una serie diaria de acciones libres. Por eso no sustituye automáticamente a free_float como fracción o número de acciones del instrumento: requeriría conciliación adicional de precio, fecha, clases y alcance.
`);
append('14_PLAN_TECNICO_SIGUIENTE_FASE.md',`## Estado final verificable de esta entrega

La auditoría utiliza lecturas y agregaciones sobre MySQL real, sin código de modificación SQL. El guard de SQL y los logs se validan con fase2/verificar_entrega.cjs, **sin conectar de nuevo**. Este control comprueba denominadores, unicidad de informes después de subdividir bloques, conciliación de totales por país, corte temporal, DDL real frente al versionado, muestra explícita y preservación de fuentes/plantillas/manifiesto.

Las observaciones masivas y un checkpoint de la auditoría permanecen localmente bajo fase2/evidencias y se excluyen de commits mediante un .gitignore nuevo de esa carpeta; no se eliminan. Los agregados, consultas y documentos permiten revisar la entrega sin ejecutar recuperaciones o nuevas lecturas. Tres informes operativos preexistentes cambiaron fuera de esta intervención durante la sesión, con hashes registrados; no se sobrescribieron. Los informes 01–09, README y módulo de fase 1 quedan intactos.
`);
console.log('Creados/ampliados exclusivamente los informes nuevos 10–14; documentos anteriores conservados.');
