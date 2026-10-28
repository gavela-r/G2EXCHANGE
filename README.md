# G2EXCHANGE

Motor de valoración financiera reproducible con MySQL 8. La activación del 12/10/2026 está descrita en `server/docs/TERCERA_INTERVENCION.md`; la intervención posterior de proveedores figura debajo. Las valoraciones con hipótesis de sistema conservan `REVIEW`.

La recuperación PCV/KPI US/JP de 2022–2025 del 28/10/2026 está documentada en [integración de proveedores](server/docs/INTEGRACION_PROVEEDORES_20261028.md) y [resultados medidos](server/docs/RESULTADOS_PROVEEDORES_20261028.md). La segunda página indica si el barrido sigue en curso o hay cuotas pendientes. Esta intervención continúa el trabajo local de Copilot en `g2-pcv-supplement-20261028`; Taiwán y el frontend quedan fuera.

Requisitos: Node 22.12+ (también probado con Node 24), npm, MySQL 8; Docker para los procedimientos de backup incluidos. No se requieren APIs de pago para las pruebas ni para valorar los datos ya existentes.

## Instalación

```powershell
git clone --branch g2-pcv-supplement-20261028 --single-branch https://github.com/gavela-r/G2EXCHANGE.git
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

Arranque en primer plano; parada con Ctrl+C. SIGTERM también termina el lote tras el instrumento actual, libera la conexión y conserva el checkpoint. El servicio Docker quedó **activo con escrituras**, después de superar los lotes progresivos y pruebas de integridad, con intervalo de 60 minutos. Reconcilia los datos ya presentes en MySQL; no descarga por sí solo informes, precios ni parámetros macroeconómicos. Los importadores son procesos separados y algunos requieren claves gratuitas configuradas por el propietario.

```powershell
docker compose --profile automation up -d --no-deps valuation-watch
docker compose --profile automation stop -t 30 valuation-watch
docker compose --profile automation start valuation-watch
docker compose --profile automation logs --tail 30 valuation-watch
```

La reanudación usa el checkpoint automáticamente. No ejecutar otro worker sobre `servicio`. Docker y el ordenador deben seguir encendidos; no hay alojamiento remoto contratado. MySQL referencia un volumen externo mediante `G2_MYSQL_VOLUME`: la configuración privada local conserva el volumen original. En otro equipo usar un volumen nuevo (`docker volume create g2exchange-mysql-data`) y restaurar el backup; el nombre de volumen del equipo original no traslada sus datos.

## Clasificación con evidencia

```powershell
node server/scripts/clasificar-sec.cjs --limit 25
node server/scripts/clasificar-sec.cjs --limit 100 --offset 500 --write
node server/scripts/clasificar-finmind.cjs ruta-privada/TaiwanStockInfo.json
node server/scripts/clasificar-finmind.cjs ruta-privada/TaiwanStockInfo.json --write
node server/scripts/revisar-clasificacion.cjs dictamen-privado.json
```

SEC usa `SEC_USER_AGENT` o el contacto configurado en Git, identidad exacta (nombre/ticker/CIK), códigos SIC explícitos y menos de 3 solicitudes por segundo. Metadatos y cachés permanecen privados. FinMind admite únicamente categorías exactas; identidades con nombres de fuente contradictorios quedan pendientes. El registro `classification_evidence` conserva las versiones anteriores y no cambia `empresa.sector_id`. Un dictamen JSON requiere `empresa_id`, `sector_id` (para aceptación), `source`, `reference_date`, `source_identifier`, `criterion`, `confidence` (`HIGH|MEDIUM|LOW`) y `status` (`ACCEPTED|PENDING|REJECTED`). La revisión se añade como evidencia nueva; no se sobreescribe la anterior.

## Git

La rama `activation-safe-20261012` parte de un snapshot revisado sin arrastrar el historial previo que incluía credenciales. La integración posterior está en `g2-pcv-supplement-20261028`, que continúa esa historia saneada. `main` permanece intacta. No mezclar el historial anterior ni publicar otras referencias sin revisarlas. Las claves se conservan únicamente en el entorno privado; la revisión de exposición histórica y su rotación corresponden al propietario. CI compila y prueba sin una base de producción; las pruebas de integración requieren una conexión configurada.
