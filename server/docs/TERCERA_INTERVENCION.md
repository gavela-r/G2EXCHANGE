# Tercera intervención — estado comprobado el 12/10/2026

## A. Estado real

Backend y MySQL activos, motor 1.5.1 integrado y persistencia real habilitada. El worker Docker `valuation-watch` está activo con escritura y conciliación cada 60 minutos. No se implementó el futuro LLM, ni se modificó el código del frontend. No se considera resuelta toda la calidad financiera ni toda la cobertura.

| Objeto | Antes | Después |
|---|---:|---:|
| Empresas | 13.194 | 13.194 |
| Instrumentos | 8.417 | 8.417 |
| Versiones financieras originales | 88.468 | 88.468 |
| Snapshots | 534 | 594 |
| Runs | 532 | 592 |
| Filas de resultados | 0 | 120 |
| Ejecuciones reproducibles | 0 | 60 |
| Versiones de modelo | 1 | 2 |
| Evidencias de clasificación | 0 | 1.770 |

## B. Cambios

Configuración privada por entorno; retirada de credenciales embebidas sin romper acceso local; adaptador de clasificación con evidencia; perfil de rating basado en tamaño USD documentado; validación financiera previa; persistencia y replay; huella semántica que evita duplicados diarios; lotes paginados, reintentos y locks; recuperación ante reutilización de PID en Docker; watch con parada limpia y resume; Docker Node 22, reinicio automático y referencia explícita al volumen MySQL original; scripts de backup/restauración y revisión Git; esquema portable y CI sin credenciales. Las plantillas XLSX versionadas tienen entradas financieras vacías.

FRED/rating: corregidos nombres SQL, campos de respuesta, tratamiento de observaciones ausentes frente a cero, perfil obligatorio, cobertura cero/intereses cero y selección inequívoca del bucket. No se ejecutó una actualización masiva de tipos o spreads. Se mantuvieron y probaron las normalizaciones anteriores; no se rellenaron importes ausentes para forzar elegibilidad. Actualizados paquetes vulnerables, SheetJS desde su distribución oficial y eliminadas dependencias sin uso; los audits ejecutados de servidor y motor reportan cero vulnerabilidades conocidas.

## C–D. Migraciones

| Migración | Estado real |
|---|---|
| 10: ejecución reproducible/modelo 1.5.1 | Probada dos veces en copia, FKs y conservación verificadas; aplicada en producción |
| 15: classification_evidence | Aditiva, probada dos veces y aplicada en producción |
| 11: recuperación por renombrado | Ensayada y revertida en copia; no aplicada en producción |
| 12: identidad mercado/ticker | Pendiente de resolver unicidad; no aplicada |
| 13–14: fechas históricas | Ensayo aislado de 88.464 copias, cero diferencias de contenido/hash/referencias, ROLLBACK; no aplicada en producción |
| Engine 03 opcional | No aplicada |

Los 532 runs anteriores no se reasignaron al modelo nuevo. Los checksums de empresa, instrumento, informes, partidas, KPI, versiones, país, sector, rating y cotizaciones siguen iguales al backup inicial. El DDL no se da por reversible mediante rollback transaccional; recuperación documentada en `RECUPERACION.md`.

## E. Backup

Directorio privado local `private_backups/`, excluido de Git:

- Inicial: `g2-before-activation-20261012.sql`, 294.902.077 bytes, SHA-256 `bb853fa6f20e98dd8b4e2860facade17ec0d603561fe4f14dfacf88d8cda1288`. Restaurado y comparadas las 24 tablas originales antes de aplicar migraciones.
- Final: `g2-2026-10-12T16-25-48-542Z.sql`, 298.305.198 bytes, SHA-256 `aa07bc26d0e7a0d64ac843804818a1278abefeb3a1de9b763b39139c6a58c6a5`. Restaurado en una base nueva `g2_recovery_release_20261012`; todas las tablas coinciden con producción y replay 533 reproducido.
- `replay-config-checkpoints.tar` conserva `.env`, motores archivados y checkpoints. SHA-256 `dd4bc14e22a76e84bdd26a4761f7b35038e9991e8a0348e4641bf947882b103d`. Es privado y contiene secretos.

Los dumps y sus `.sha256` deben transferirse junto al tar por un canal privado. No existe transferencia externa configurada. GitHub contiene código y esquema, pero no la base real. Los datos de proveedores y sus respuestas no se redistribuyeron; una licencia para redistribuir los datos financieros originales o FinMind sigue sin estar verificada.

## F–I. Valoraciones y bloqueos

Elegibilidad numérica inicial: 0 de 8.417 instrumentos. Final: **40 valoraciones con advertencias**, persistidas con **120 escenarios REVIEW**, y **20 ejecuciones BLOQUEADA**, sin resultados numéricos inventados. Hay 8.357 instrumentos con datos pendientes; sumando bloqueados, 8.377 sin valoración numérica. Cero resultados APPROVED. Las 40 valoraciones todavía requieren revisar hipótesis y calidad de entrada.

Primer caso real AMD, instrumento 178, run 533, snapshot 535: persistencia, repetición sin duplicación y replay verificados. También se persistieron otros instrumentos, incluidos ABT, ADI y AGCO. Los lotes aumentaron gradualmente antes del barrido general. El primer worker general añadió diez valoraciones numéricas y veinte bloqueadas; el siguiente reutilizó las 60 ejecuciones sin duplicarlas.

| Primer bloqueo final | Instrumentos |
|---|---:|
| Clasificación pendiente | 6.666 |
| Ejercicios suficientes pendientes | 538 |
| Taxonomía ambigua | 413 |
| Perfil de rating pendiente | 334 |
| Dato financiero pendiente | 181 |
| Moneda/FX pendiente | 120 |
| Rating pendiente | 46 |
| Precio pendiente | 24 |
| Versión pendiente | 12 |
| Períodos inconsistentes | 3 |
| Input financiero inválido | 2 |
| Rating ambiguo | 1 |

Son primeros bloqueos, no una auditoría que descarte problemas posteriores. Algunos recuentos aumentan al superar clasificación y revelar el siguiente problema. El barrido final no tuvo errores técnicos.

Las hipótesis explícitas que mantienen REVIEW incluyen unidades originales pendientes de verificación, acciones reportadas como proxy sin dilución/splits/ADR completamente comprobados, primas adicionales cero como hipótesis de sistema, perfil de tamaño basado en capitalización y valor terminal heredado sin ROIC normalizado. Se conserva su advertencia y procedencia; no son entradas auditadas.

## J. Clasificación

1.725 empresas tenían clasificación utilizable por el adaptador al inicio; ahora 2.245 de 13.194 (17,0153%). Se resolvieron 543 empresas antes no utilizables; otras 23 clasificaciones originales quedaron prudentemente pendientes por evidencia contradictoria. Hay 738 empresas con evidencia aceptada de alta confianza: 560 por FinMind y 178 por SEC. Quedan 10.949 empresas sin clasificación utilizable.

FinMind: identidad TW+ticker y categorías exactas; fuentes con nombres contradictorios, categorías amplias, ETF y sectores no resolubles quedan pendientes. SEC: examinados 500 instrumentos US, 178 aceptados y 322 pendientes; 493 registros de evidencia (siete sin metadata suficiente no insertan evidencia). Se verifican ticker, nombre y CIK de submissions; no se infiere CIK desde el accession. El crosswalk SIC es conservador y distingue bancos de industriales. Se conserva sector original y todas las evidencias; una revisión humana se añade como nueva fila.

Fuentes: [API oficial SEC](https://www.sec.gov/search-filings/edgar-application-programming-interfaces), [códigos SIC SEC](https://www.sec.gov/search-filings/standard-industrial-classification-sic-code-list), [catálogo FinMind](https://finmind.github.io/tutor/TaiwanMarket/DataList/). Acceso gratuito, sin APIs de pago. El perfil por tamaño USD es una política de adaptación documentada y marcada REVIEW; no una equivalencia universal para monedas o sectores diferentes.

## K–L. Incremental y reanudación

Implementados y probados full, incremental, dry-run, resume y watch. La huella incluye estados financieros/KPI seleccionados, cotización, RF/ERP, beta, spreads, impuestos, hipótesis, clasificación, políticas y configuración/motor. No incluye identificadores diarios de run/snapshot. Cambios semánticos producen nuevas ejecuciones; entradas idénticas reutilizan las anteriores. Los JSON de configuración de plantillas se incluyen; los cambios exclusivamente visuales de XLSX no disparan recálculo.

Checkpoint atómico, paginación keyset y memoria acotada; transacción para snapshot/run/resultados; GET_LOCK por instrumento; reintentos de fallos transitorios y continuación ante errores individuales. Resume rechaza motor o parámetros distintos. Se probaron interrupción de CLI y parada real del contenedor en el instrumento/cursor 2.405; al arrancar completó 8.417 con 8.357 pendientes y 60 reutilizaciones. Docker conserva el checkpoint y reinicia el servicio salvo parada explícita.

**Activado:** conciliación MySQL cada 60 minutos, backend puerto 3000 y MySQL 3307. **No implementado/activado:** descarga periódica integral de informes, precios y parámetros macro; alojamiento remoto; monitorización externa. Sin datos nuevos en MySQL no aparece información financiera nueva. El ordenador y Docker deben seguir operativos.

## M. Pruebas ejecutadas

20 tests de motor + 28 de backend + 2 de integración MySQL: aprobados. Incluyen reglas financieras, clasificación/SIC, rating/FRED, 10.000 instrumentos sintéticos para paginación/memoria, idempotencia, concurrencia, rollback, replay, checkpoint y recuperación de locks. Compilación backend y frontend aprobada, lint frontend aprobado, 16 plantillas comprobadas. Docker reconstruido y API de valoración real/replay comprobados. Clonación real de la rama remota sin `.env`: instalación, 48 tests unitarios, build y 16 plantillas aprobados. El resultado de CI remoto no se verificó.

Las evidencias detalladas de DB, tests, lotes y restauraciones están en `private_backups/` y resultados privados locales; se publican aquí únicamente agregados. No se afirma que toda la base tenga datos normalizados ni que todos los modelos tengan cobertura real.

## N–P. GitHub

Rama segura `activation-safe-20261012` publicada en el remoto autorizado `https://github.com/gavela-r/G2EXCHANGE.git`. Historial nuevo separado del `main` anterior, que contenía credenciales. No se hizo force push ni se modificó `main`. Commits de implementación/configuración, plantillas, recuperación/dependencias y entrega final. Se revisó el contenido completo de los archivos versionados y entradas XLSX; `.env`, backups, cachés, resultados y archives están excluidos. No se cambió ni se verificó la visibilidad del repositorio. El propietario debe revisar la exposición histórica y rotar claves preservando acceso; no fusionar el historial anterior sin sanearlo.

## Q–S. Recuperación y pendientes

Código recuperable desde GitHub y compilado en un clon limpio. Base real recuperable con el dump privado y el paquete de configuración/archives, ya ensayados localmente. **La recuperación desde otro ordenador depende de transferir esos archivos privados antes de perder acceso físico.** No se subieron a GitHub y no se dispone de destino privado autorizado/configurado para su entrega externa.

Pendientes: clasificación US restante/JP y revisión de ambigüedades; FX verificable; cuatro ejercicios comparables; taxonomías y unidades; calidad de acciones/precios; modelos financieros bloqueados; normalización terminal; revisión de hipótesis; importación periódica de fuentes; reparación histórica 14; identidad única 12; revisión de licencias, seguridad del historial y visibilidad del remoto. No se ejecutaron operaciones destructivas, reparación financiera masiva, cambio de contraseñas, publicación de datos privados ni servicios de pago.

## T. Comandos de continuación

Desde un equipo nuevo, usar Node 22.12+ y clonar **esta rama**, instalar y comprobar:

```powershell
git clone --branch activation-safe-20261012 --single-branch https://github.com/gavela-r/G2EXCHANGE.git
cd G2EXCHANGE
npm.cmd --prefix valuation_engine ci
npm.cmd --prefix server ci
npm.cmd --prefix client ci
npm.cmd test
npm.cmd run build
Copy-Item .env.example .env
```

Para datos reales, seguir `RECUPERACION.md`: transferir dump/hash/tar privadamente, extraer tar, adaptar `.env` al nuevo equipo (incluido volumen), arrancar MySQL y restaurar en base **nueva**, comprobar recuentos y cambiar después DB_NAME. No copiar comandos con credenciales a Git. Ejemplo:

```powershell
tar -xf ruta-privada/replay-config-checkpoints.tar
# Configurar .env para este ordenador: G2_MYSQL_VOLUME=g2exchange-mysql-data.
docker volume create g2exchange-mysql-data
docker compose up -d mysql
node server/scripts/restaurar-db.cjs ruta-privada/g2-2026-10-12T16-25-48-542Z.sql g2_recovery_nuevo
node server/scripts/estado-db.cjs g2_recovery_nuevo
# Tras comprobar la restauración, configurar DB_NAME=g2_recovery_nuevo.
npm.cmd --prefix server run valuation:replay -- 533
npm.cmd --prefix server run test:integration
docker compose build backend
docker compose up -d --no-deps backend
docker compose --profile automation up -d --no-deps valuation-watch
```

Operación local y clasificación siguiente:

```powershell
docker compose --profile automation logs --tail 30 valuation-watch
docker compose --profile automation stop -t 30 valuation-watch
docker compose --profile automation start valuation-watch
npm.cmd run valuation -- --mode full --dry-run --directory server/resultados_valoraciones/nuevo-ensayo
node server/scripts/clasificar-sec.cjs --limit 100 --offset 500
node server/scripts/clasificar-sec.cjs --limit 100 --offset 500 --write
node server/scripts/backup-db.cjs
git status --short
```

Para reanudar un lote CLI incompleto, repetir exactamente sus opciones con `--resume`. No reutilizar un directorio del worker activo. Las opciones de escritura son explícitas; nunca promover REVIEW a APPROVED para aumentar el recuento.
