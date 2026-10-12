# G2EXCHANGE

Motor de valoración financiera reproducible con MySQL 8. El estado de producción está descrito en `server/docs/TERCERA_INTERVENCION.md`. Las valoraciones con hipótesis de sistema conservan `REVIEW`.

Requisitos: Node 22.12+ (también probado con Node 24), npm, MySQL 8; Docker para los procedimientos de backup incluidos. No se requieren APIs de pago para las pruebas ni para valorar los datos ya existentes.

## Instalación

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

Configurar `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` en `.env`. La configuración se carga desde la raíz incluso al ejecutar desde otra carpeta. No publicar `.env`. Los tests unitarios usan configuración sintética cuando no existe configuración local; las pruebas MySQL se ejecutan explícitamente.

Para una base vacía, crear una base MySQL nueva y restaurar **solo** `server/sql/00_schema.sql` en ella. No contiene empresas, estados financieros, precios ni credenciales. Registrar el modelo con `server/sql/10_valoracion_reproducible.sql`; los catálogos y datos requieren importación con procedencia verificable. La demo `valuation_engine/ejemplos/DEMO_NO_REAL.json` es sintética y no representa datos auditados.

Para recuperar la base real, seguir `server/docs/RECUPERACION.md`: los backups, checkpoints y motores históricos se transfieren por un canal privado, separado de GitHub.

## Ejecución

```powershell
npm.cmd run valuation -- --mode full --dry-run --directory server/resultados_valoraciones/ensayo
npm.cmd run valuation -- --mode incremental --write --instrument-id 178 --directory server/resultados_valoraciones/amd
npm.cmd run valuation -- --mode incremental --write --instrument-id 178 --resume --directory server/resultados_valoraciones/amd
npm.cmd run valuation:watch -- --once --dry-run --limit 25 --directory server/resultados_valoraciones/watch-ensayo
npm.cmd --prefix server run valuation:replay -- 533
npm.cmd --prefix server run test:integration
npm.cmd --prefix server start
```

`--write` es explícito; por defecto no se escribe en MySQL. `full` revalida las ejecuciones equivalentes sin duplicarlas; `incremental` reutiliza las huellas equivalentes. Los directorios incompletos requieren `--resume` con la misma fecha, modo, hipótesis y motor. No compartir un directorio de checkpoints entre workers. Una conexión y páginas de hasta 1.000 instrumentos acotan memoria; el bloqueo MySQL serializa workers por instrumento.

## Servicio periódico

```powershell
$env:G2_RECONCILIATION_MINUTES='60'
npm.cmd run valuation:watch -- --dry-run --directory server/resultados_valoraciones/servicio-dry
```

Arranque en primer plano; parada con Ctrl+C. SIGTERM también termina el lote tras el instrumento actual, libera la conexión y conserva el checkpoint. Para activar escrituras, ejecutar el mismo comando con `--write` en **otro directorio** después de comprobar datos y backup. No se dejó un worker masivo escribiendo sin supervisión. El watch reconcilia los datos ya presentes en MySQL; no descarga por sí solo informes ni precios. Los importadores son procesos separados y algunos requieren claves gratuitas configuradas por el propietario.

## Clasificación con evidencia

```powershell
node server/scripts/clasificar-sec.cjs --limit 25
node server/scripts/clasificar-sec.cjs --limit 100 --offset 100 --write
node server/scripts/clasificar-finmind.cjs ruta-privada/TaiwanStockInfo.json
node server/scripts/clasificar-finmind.cjs ruta-privada/TaiwanStockInfo.json --write
node server/scripts/revisar-clasificacion.cjs dictamen-privado.json
```

SEC usa `SEC_USER_AGENT` o el contacto configurado en Git, identidad exacta (nombre/ticker/CIK), códigos SIC explícitos y menos de 3 solicitudes por segundo. Metadatos y cachés permanecen privados. FinMind admite únicamente categorías exactas; identidades con nombres de fuente contradictorios quedan pendientes. El registro `classification_evidence` conserva las versiones anteriores y no cambia `empresa.sector_id`. Un dictamen JSON requiere `empresa_id`, `sector_id` (para aceptación), `source`, `reference_date`, `source_identifier`, `criterion`, `confidence` (`HIGH|MEDIUM|LOW`) y `status` (`ACCEPTED|PENDING|REJECTED`). La revisión se añade como evidencia nueva; no se sobreescribe la anterior.

## Git

La rama `activation-safe-20261012` parte de un snapshot revisado sin arrastrar el historial previo que incluía credenciales. `main` permanece intacta. No mezclar las ramas ni publicar otras referencias sin revisar su historial. Las claves anteriores se conservaron localmente en el entorno privado; su rotación y la revisión del historial remoto corresponden al propietario. CI compila y prueba sin una base de producción; las pruebas de integración requieren una conexión configurada.
