# Limitaciones y pendientes

## BLOQUEADO POR DATOS
- **Empresas reales**: ninguna de las 40 del censo (`evidencias/censo_real_2026-10-30.json`) reúne los cuatro históricos certificados que exige su modelo. Las causas principales son clasificación `N/A` (32), cambios de contexto entre cierres (13) y contexto financiero incompleto (11).
- **AMD (13)**: 72 observaciones CONFLICTIVO sin usar, y cierres de 52/53 semanas que exigen un calendario explícito.
- **Toyota (11658)**: 68 partidas VALIDADO, pero faltan ingresos, CapEx, NWC, cohortes, política contable y puente. Ejecución bloqueada y exportada como diagnóstico validado en Excel.
- **Microsoft (4)**: contexto que cambia entre cierres, contexto incompleto y clasificación sin resolver.
- **Banca / seguros**: la taxonomía no tiene conceptos de préstamos, depósitos, ECL, mayorista, inversiones ni pasivos por contratos de seguro.
- **Saldos fiscales de apertura, cohortes y vidas útiles**: no están en MySQL; deben acreditarse desde notas.

## PENDIENTE DE DESARROLLO (siguientes fases, no iniciadas por instrucción)
- Recuperación PCV/KPI y ampliación de la taxonomía (incluida la prudencial).
- Calibración de primas de riesgo (hoy `NO_ESTIMABLE`, ajuste operativo 0).
- Concentración de clientes.

## PENDIENTE DE DESARROLLO (técnico, menor)
- **Presentación**: las filas 71-74 de 'Proyeciones INDITEX' (separadores vacíos ocultos en el maestro) se ven con 15 pt. La entrega 0.1 ya presentaba este defecto. Corregirlo exige tocar `exporter.mjs`/`canonical.mjs` y repetir la validación nativa.
- **Semiconductores**: no se verifica la coherencia entre la capacidad y el CapEx de fábricas. Telecomunicaciones: no hay modelo específico de renovación de espectro. Seguros: no es IFRS 17 completo. Banca: RWA simplificado.
- El run `be57cde7…` (14:38, de Codex) es anterior al archivado de motores. El sistema se niega correctamente a presentarlo como replay exacto.

## PENDIENTE DE REVISIÓN FINANCIERA
- Los 16 modelos: metodología revisada por analista con empresas reales y aprobación de cada política terminal.

## PENDIENTE DE DESPLIEGUE
- Integración en G2EXCHANGE según `PLAN_INTEGRACION_Y_ROLLBACK.md` (requiere autorización).
- Excel nativo en el servidor de despliegue, o bien que las descargas queden limitadas a diagnóstico.

## BLOQUEADO POR PERMISOS
- No hay ninguno activo. Observación: los procesos no se inspeccionan con Get-CimInstance (acceso denegado en el sandbox). Se usan Get-Process y Get-NetTCPConnection.
