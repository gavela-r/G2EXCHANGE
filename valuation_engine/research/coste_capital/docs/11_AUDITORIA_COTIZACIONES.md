# Fase 2 — cotizaciones e histórico bursátil

## Resultado real

**G2EXCHANGE conserva una única fila de cotización por instrumento en la tabla actual. No conserva una serie diaria canónica por acción.** Se comprobaron 8241 filas, 8241 instrumentos distintos y exactamente una fecha distinta para cada uno de ellos. El conjunto contiene 104 fechas, desde 2018-07-17 hasta 2026-08-13; son fechas repartidas entre instrumentos, no 104 sesiones por instrumento.

Todos los precios almacenados son positivos y las fechas no son NULL. Esto valida presencia numérica, no que sean cierres ajustados ni que la fecha corresponda al precio actual. Hay 8417 instrumentos registrados: 176 sin fila de cotización. Las cotizaciones cubren **8118 empresas** (61,53 % de 13.194); varias tienen más de un instrumento.

## Claves, columnas e índices verificados

Columnas: id INT PK AUTO_INCREMENT; instrumento_id INT NULL; fecha DATE NULL; precio_cierre DECIMAL(10,4) NULL. FK cotizacion_diaria_ibfk_1 → instrumento(id). Índices reales: PRIMARY(id), **UNIQUE intrumento_id(instrumento_id)**. No hay índice compuesto instrumento+fecha, volumen, importe, fuente/feed, timestamp de obtención, moneda por fila, flag ajustado o bid/ask.

La UNIQUE es por instrumento **sin fecha**. Aunque la columna permita fecha, impide almacenar dos días del mismo instrumento. Los nombres de índices con erratas se conservan.

| País de empresa | Instrumentos | Filas de precio | Empresas con precio | Fecha mínima | Fecha máxima |
|---|---|---|---|---|---|
| JP | 2497 | 2492 | 2484 | 2024-07-24 | 2026-08-13 |
| TW | 1646 | 1484 | 1418 | 2018-07-17 | 2026-08-13 |
| US | 4274 | 4265 | 4216 | 2023-12-14 | 2026-08-10 |

Las fechas máximas tienen 77 días (JP/TW, 13/08) y 80 días (US, 10/08) de antigüedad respecto al 29/10. **No se deduce de ello la antigüedad real del precio**, porque el escritor puede conservar una fecha vieja al sustituir su valor. El mínimo 2018 es un registro antiguo aislado, no evidencia de ocho años de histórico.

## Escritura y pérdida potencial

Archivo server/insercionDatos/insercionDatosCotizacionDiaria.ts; funciones **guardarCotizacionesUSA**, **guardarCotizacionesTaiwan**, **guardarCotizacionesJapon** (aproximadamente líneas 1044, 1097 y 1121). Las tres ejecutan INSERT(instrumento_id,fecha,precio_cierre) ON DUPLICATE KEY UPDATE **precio_cierre=VALUES(precio_cierre)**.

Con la UNIQUE real, una segunda cotización del instrumento colisiona incluso si es de otro día: **sustituye el precio, pero no la fecha**. El comentario de la rama USA presupone UNIQUE(instrumento_id,fecha), que no corresponde a MySQL real. La deduplicación japonesa en memoria por instrumento/fecha no cambia la restricción de la tabla.

Consecuencias: puede perderse cada precio anterior y su fecha de observación; puede quedar un precio nuevo con fecha antigua; no se conserva fuente/feed ni revisión para comprobarlo después. Esto es la semántica comprobada del código y de la restricción; no se ejecutó el escritor ni se inventó un historial de qué sobrescrituras concretas ocurrieron. No hay triggers o eventos MySQL en el esquema que añadan otra ruta de histórico.

El lector TWSE del mismo archivo conserva solo ClosingPrice y devuelve un mapa código→precio; el TPEx hace lo mismo. Que la respuesta oficial pueda contener volumen/importe no significa que G2 lo almacene. La tabla no recibe esos campos.

## Otros lugares examinados

- **valuation_input_snapshot:** 594 snapshots de 573 empresas, solo 5 fechas de precio (2026-07-21–2026-08-13). Son precios usados en valoraciones, no una serie diaria ni un histórico completo por instrumento.
- **valuation_execution:** entradas/salidas de 60 runs conservan precio y fechas congelados. Son útiles para reproducibilidad, no para rellenar días ausentes, volúmenes o retornos.
- **evento_corporativo:** 20 SPLIT de 20 instrumentos, desde 29/08/2022 a 07/07/2026, además de dividendos/otros eventos. No es una serie ajustada y no prueba cobertura completa de acciones corporativas.
- **Archivos del repositorio/cachés:** la búsqueda por nombres de cotizaciones/prices/quotes/charts y el código del recuperador no localizaron un almacén diario canónico adicional. Los directorios inspeccionados de private_backups corresponden principalmente a estados/evidencias y backups. No se descomprimieron o recorrieron masivamente todos los backups SQL. Podrían contener instantáneas antiguas: no se afirma que no exista ningún precio histórico recuperable en algún respaldo. No constituyen una serie diaria validada y no se reimportaron.

## Dependencias que deben preservarse

| Componente | Uso actual | Condición de compatibilidad futura |
|---|---|---|
| server/src/valoracion/datos.ts:prepararInstrumento, línea 103 | Lee precio<=asOf, ORDER BY fecha DESC,id DESC LIMIT 1; usa precio para capitalización, perfil rating y pesos | Mantener precio/fecha/instrumento; marcar legado no conciliado, sin convertir fecha obsoleta en prueba histórica |
| server/insercionDatos/listaSeguimiento.ts:obtenerPorUsuario, línea 154 | Join al precio de fecha máxima por instrumento | Conservar selección de último dato. La consulta tiene además columnas asumidas ausentes, como instrumento_principal: no se ejecutó ni se reparó |
| server/src/index.ts, POST /insercionDatos/usa/actualizar | Expone actualizarCotizacionesUSA | No cambiar contrato o programación al preparar el futuro almacenamiento |
| snapshot/execution/reportes | Congelan el precio usado por una valoración y lo exportan | No reconstruir un run antiguo con una serie nueva o corregir su snapshot |
| server/scripts/resumen-final.cjs | Incluye cotizacion_diaria en comprobaciones operativas | No se ejecutó CHECKSUM TABLE; prever que una migración futura cambia sus supuestos y evidencias |

No se localizó un gráfico financiero conectado en el client/src inspeccionado (App.jsx es la pantalla de ejemplo Vite). Por tanto no se atribuye un fallo a un gráfico de producción no observado. Cualquier gráfico futuro que consulte esta tabla solo dispondrá de un punto por instrumento; MAX(fecha) o un ordenamiento no crean una serie.

## Efectos financieros

Amihud no es calculable: faltan retornos diarios e importe monetario negociado. La beta individual tampoco puede estimarse de un punto, y además requeriría una serie del mercado. La beta sectorial existente no se estima de cotizacion_diaria y no se cambia aquí. No se identifican sesiones sin negociación a partir de un cierre repetido o fecha ausente.

Precio×acciones históricas sin reconciliación de fecha/clase/splits no acredita capitalización. Una fecha vieja que acompaña un precio sustituido invalida también la selección histórica asOf. En TW hay además 299 instrumentos ligados a Tokyo y moneda TWD: no interpretar ese precio como TWD válido sin prueba de emisor/feed/mercado.

## Solución futura propuesta, sin ejecución

Reutilizar la tabla existente si una fase aprobada confirma compatibilidad: mantener sus claves/columnas públicas y valorar UNIQUE(instrumento_id,fecha), índices para último dato/rangos, campos separados de volumen en acciones e importe negociado, fuente/feed, moneda, timestamps, base de ajustes y estado de calidad. Si se necesitan precios intradía o varias versiones/feed por día, decidir expresamente su clave/versionado; no imponer una fila diaria a eventos de distinta resolución.

Antes de modificar la UNIQUE: inventariar consumidores y escritor, ensayar con copia autorizada, definir tratamiento de filas legacy con fecha no conciliada y preservar sus valores originales. No fechar retrospectivamente un precio por conveniencia. Las nuevas filas históricas deberán ser trazables; el pasado perdido no reaparece al cambiar un índice. La conservación de último precio y los resultados históricos deben mantenerse. **No se elimina, sustituye o modifica la tabla en esta fase.**

Las consultas y resultados estructurados se conservan en `../fase2/evidencias/`. `metadatos.json` contiene columnas, tipos, PK/FK, UNIQUE, índices, CHECK y DDL leídos. `cobertura_resumen.json` contiene los conteos completos por empresa/ejercicio/país/sector/bolsa; `comprobaciones_finales.json` incluye la muestra de calidad. Los registros `consultas_*.json` conservan SQL, parámetros de IDs, duración y resultado de cada lectura, sin credenciales.

## Comprobación adicional de históricos en las ejecuciones

Se consultaron de forma agregada las 60 entradas JSON de valuation_execution: 0 con risk_inputs.median_daily_dollar_volume_90d y 0 con los campos alternativos inspeccionados free_float, bid, ask, daily_prices, quotes o prices. Esto descarta esas rutas concretas como fuentes de volumen o serie diaria en los runs presentes, sin afirmar que cualquier fichero externo o respaldo no examinado carezca de precios. La búsqueda explícita de nombres de cotizaciones/precios/quotes/bars/charts dentro de private_backups tampoco encontró un almacén con esos nombres; no se descomprimió todo su contenido.
