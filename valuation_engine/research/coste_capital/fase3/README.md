# Capital v2 — integración ejecutada en desarrollo

La aplicación funciona en una copia MySQL identificada, con backend Node/TypeScript y la entrada React real del proyecto. Incluye conservación de sesiones y revisiones, datos oficiales de Taiwán, conciliaciones contables, diagnósticos, comparables, decisiones y simulación de las ejecuciones congeladas. **Ninguna prima real está calibrada ni autorizada. La base operativa no se ha migrado.**

Abrir **http://127.0.0.1:3100/** con el servicio arrancado. La compilación, API, MySQL y las interacciones de React con DOM en memoria tienen pruebas ejecutadas. Los PDF se renderizaron y se inspeccionaron visualmente. La inspección visual del navegador real queda sin verificar: el host de navegador/control de aplicaciones no estuvo disponible.

- [Resultados y métricas reales](../docs/15_IMPLEMENTACION_Y_RESULTADOS.md).
- [Uso y operación](../docs/16_USO_Y_OPERACION.md).
- [Archivos, compatibilidad y límites](../docs/17_ARCHIVOS_Y_LIMITACIONES.md).
- [Pruebas](evidencias/pruebas-resumen.json), [API](evidencias/api-smoke.json), [estado MySQL](evidencias/estado-final.json).
- [Reproducción Windows](evidencias/replay.json) y [Node 22 Linux aislado](evidencias/replay-node22-linux.json). Se distingue igualdad exacta de equivalencia de coma flotante; no se reescriben resultados.
- [Reproducción independiente de simulaciones nuevas](evidencias/replay-capital-v2.json). La migración 23 conserva snapshots JSON exactos; los análisis previos de desarrollo quedan identificados sin certificación de reproducción exacta.

Ejemplo real: buscar NVIDIA, seleccionar el cierre **2025-01-26** y guardar la evaluación. El cierre 2026 conserva menos información acreditada; el sistema no sustituye silenciosamente el periodo seleccionado. Para comparar cierres no simultáneos debe elegirse expresamente la cohorte anual descriptiva. No es una referencia para primas.

Desde la raíz, con las dependencias ya instaladas:

```powershell
npm.cmd --prefix server run capital:build
npm.cmd --prefix client run build
npm.cmd --prefix server run capital:start
```

Las cargas manuales tienen límites pequeños, claves idempotentes y continuación por instrumento. No se han añadido tareas programadas. El servicio se limita a `127.0.0.1` y rechaza utilizar `DB_NAME` como destino de escritura. No debe exponerse en producción con la revisión local de desarrollo.
