# Lote nativo qa_api/ (30/10 23:5x → 31/10)

- Motor ensayado: ebbcdbec60a8b518894ada6357c20812036f3e77fd6bf39ee5b2a90547eefa01 (registrado al inicio por el arnés).
- Resultado: 16/16 VALIDADO, repairMode=false, 0 referencias rotas, 117.411 comprobaciones de fórmulas en Excel 16.0; paridad Artifact/TS en 3 escenarios; 0 fallos de identidades.
- ESTADO: SUPERADO. Durante el lote se modificaron módulos compartidos (plan.ts, workflow.cjs, exporter.mjs, registry.cjs).
  El motor vigente al terminar era 3b76805dbd8d6fd8160009110a548d4126e748ae4463ca8488acdab928c7f424.
  No vale como validación de los sectores 04/05/07/10/12/13/14 (que cambiaron de metodología) ni del resto (módulos compartidos).
  La validación vigente está en qa_api_final/ (repetición completa con el motor final).
