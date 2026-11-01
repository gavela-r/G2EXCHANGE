# Propuesta futura: MySQL, Excel, motor e interfaz

Este documento es una especificación revisable. No se incluye ningún script nuevo de migración ejecutable, no se aplica DDL/DML y no se implementan endpoints, recuperadores o UI. La aprobación de esta fase no implica activar primas de producción.

## Tratamiento financiero por componente

Para un modelo FCFF coherente y con bases conciliadas:

`Ke1 = Ke0 + ΔKe_liquidez + ΔKe_tamano_residual`

`Kd1 = Kd0 + ΔKd_crediticio_residual`

`WACC1 = Ke1*wE + Kd1*(1−T)*wD`

Con pesos y T constantes: `ΔWACC = wE*ΔKe + wD*(1−T)*ΔKd`. La reducción solo procede si referencia/modelo ya contiene el riesgo remunerado y la calibración demuestra la diferencia. Un CAPM con beta/ERP actuales no adquiere una prima explícita de liquidez por compararlo con un sector ilíquido. La posible remuneración media implícita en ERP requiere reconciliación del modelo, no una resta inferida del volumen.

Un cambio de estructura obliga a recalcular pesos, beta y deuda de forma conjunta. Un cambio fiscal requiere capacidad de escudo y convención del modelo. Un cambio de FCFF se proyecta en los flujos; una restricción de venta de participación puede tratarse en equity; los escenarios deben reflejar probabilidades/impactos coherentes. No representar todos esos tratamientos como ΔKe/ΔWACC. Para BANK/INSURANCE (DDM) y REIT (AFFO equity) usar Ke y flujos del accionista específicos, sin forzar WACC FCFF. Las familias RESOURCE/PHARMA requieren revisar los escenarios económicos aunque hoy entren en FCFF.

V1 solo simula ΔKe/ΔKd sobre tasas base explícitas **hipotéticas**. No cambia estructura, FCFF, equity, DCF ni valor intrínseco, y rechaza WACC hipotético para las familias equity. Esos componentes se conservan como destinos de revisión en la propuesta; no se declara implementado su cálculo. No se duplica un CAPM de producción ni se importa su política experimental.

## Reutilización de persistencia existente

| Necesidad | Reutilización | Límites |
|---|---|---|
| Datos originales y estados | IF/PCV, taxonomía, VIV y evidencias import/verification/report | No modificarlos. Un nuevo indicador derivado puede usar KPI de informe si su definición/unidad/cálculo se versionan sin sobrescribir historia |
| Identidad, sector, país y mercado | empresa/sector/pais/instrumento/mercado y classification_evidence | Necesitan fecha de vigencia para comparaciones históricas |
| Snapshot de valoración | snapshot + detalle + input_json/trace_json de execution | Capturar valores y fuentes, no solo FK a referencia mutable |
| Resultados finales y versión | run/model_version/resultados y execution.output_json/manifiesto | Cada conjunto aprobado crea **otro run**; nunca cambiar un run histórico ni su archivo de motor |
| Primas legacy y componentes | valuation_run_parametros | Tasas base son útiles para conciliación. prima_iliquidez legacy no se redefine como ΔKe. No existe prima_tamano en dump; no añadirla por reflejo |
| Benchmarks y calibración | Snapshot documental JSON de la evaluación | No existe entidad histórica adecuada para reutilizar como borrador/revisión; evitar repurponer ajustes_noticias o classification_evidence |

Los resultados congelados de execution son inmutables: no añadir revisiones a su JSON después del cálculo. En una futura **nueva ejecución** puede incluirse en input/trace/output el identificador y hash de una evaluación aprobada y su impacto, manteniendo el contrato antiguo mediante campos opcionales versionados. Un borrador pre-run o rechazo no cabe correctamente en los resultados financieros existentes.

## Migración mínima propuesta, pendiente de aprobación

Proponer **una sola tabla complementaria**, provisionalmente `capital_adjustment_review`, para evaluaciones y eventos de revisión independientes, sin nuevas tablas por indicador, benchmark o artículo. Antes de diseñar DDL final, comprobar en lectura el esquema de la instancia identificada y el volumen de consultas esperado. Reutilizar JSON para trazabilidad completa; normalizar benchmarks/evidencias solo si hay necesidad demostrada de reutilización y consultas que lo justifiquen.

| Campo conceptual | Tipo MySQL propuesto | Propósito |
|---|---|---|
| id | BIGINT UNSIGNED PK | Identificador de evento/evaluación |
| empresa_id, instrumento_id | INT NOT NULL, FK existentes | Identidad coherente del emisor e instrumento |
| referencia_run_id | INT NULL, FK valuation_run | Baseline histórico opcional; un borrador puede no tener run |
| model_version_id | INT, FK model_version | Versión del protocolo de cálculo; registrar versión propia sin sustituir versión del motor |
| valuation_date | DATE NOT NULL | Corte económico/histórico |
| input_hash, methodology_version, evaluation_hash | CHAR(64), VARCHAR version, CHAR(64) | Entrada, método y payload íntegros reproducibles |
| parent_review_id, revision | BIGINT NULL FK propia, INT positivo | Cadena append-only de correcciones/decisiones; no sobrescribir originales |
| event_type | VARCHAR o ENUM acordado | EVALUATED / APPROVED / REJECTED / MANUAL_OVERRIDE; autorizar transiciones, sin aprobar por defecto |
| actor_usuario_id, decided_at, reason | FK usuario nullable / DATETIME / texto | Evidencia de decisión y modificación manual |
| payload_json | LONGTEXT utf8mb4_bin + JSON_VALID | Indicadores, fuentes/contextos, comparables/estadísticas, exclusiones, método/evidencia, parámetros/calibración, riesgos incluidos, propuestas y límites |
| created_at | DATETIME | Momento de registro, distinto de fecha conocida de los datos |

Índices previstos: empresa/instrumento/fecha, referencia_run_id y evaluación+revisión únicos. Definir unidad y significado de cualquier columna numérica resumida antes de crearla. Importes desconocidos y primas no estimables deben seguir NULL; estados explícitos. Si se normalizan deltas, usar DECIMAL **con signo** y nulabilidad, e identificar componente/tasa anual. No hacer `NOT NULL DEFAULT 0` para ausencia de evidencia. Riesgo de DECIMAL/redondeo frente a JSON exacto: definir precisión y conciliación sin modificar snapshots.

El payload conservaría: versión de definición de indicador y comparables, cada miembro y fecha de disponibilidad, mercado/periodo, autor/año/publicación/DOI, ecuación y coeficientes con unidades e incertidumbre, calibración/validación/aprobación, baseline y prima ya contenida, ajuste propuesto/aprobado/rechazado con motivo, override antes/después y autor, componentes afectados e impacto WACC/valor intrínseco **solo cuando se calcule con motor candidato independiente**. En v1 esos impactos reales quedan no calculados, nunca 0 por defecto.

Plan de migración futuro: lectura SHOW CREATE/índices/FK; ensayo sobre copia autorizada; crear solo sidecar; validar claves y conservación histórica; ejecutar candidato bajo nueva versión; comparar replay y outputs Excel/PDF; mantener funcionalidad apagada; decisión financiera de activación separada. Reversión funcional: desactivar integración conservando evidencias. No borrar evaluaciones aprobadas/historia como rollback ordinario. No se ejecuta ningún paso operativo aquí.

## Revisión del Excel solicitado y de los maestros presentes

No se localiza `G2EXCHANGE_Modelo_Inditex_4H_5P_WACC_Escenarios(1).xlsx` en el workspace ni una hoja `G2_ESCENARIOS` entre los 16 maestros presentes. Por tanto **no se certifican** sus filas 19/20/21/23, valores o fórmulas. La descripción del usuario permite preparar la propuesta, pero no sustituye la inspección de ese archivo. La revisión específica queda pendiente de disponer de la plantilla.

Se han leído las 16 plantillas Template_01…16_v1_4 sin exportarlas ni recalcularlas. La evidencia de `07_WACC` de cada archivo está en `evidencias/plantillas_inspeccion.json`. En Template_06, aplicable al ejemplo retail, los escenarios están en H/J/L: fila 20 Ke CAPM, 24 Kd bruto, 26 Kd neto, 27/28 pesos, 29 WACC financiero, 30 iliquidez, 31 tamaño, 32 concentración, 33 otros, 34 suma y 35 WACC ajustado. Fórmula J29: `IF(AND(ISNUMBER(J20),ISNUMBER(J26),ISNUMBER(J27),ISNUMBER(J28)),J20*J27+J26*J28,"")`. J35 suma J29+J34 si válido. Estos números de fila **no** se atribuyen a G2_ESCENARIOS.

La auditoría de exportación identifica además que TS congela salidas ejecutivas/API y crea 14_MOTOR_TS, mientras 08/09 quedan como contraste heredado. Una futura actualización debe conciliar las tres representaciones, no presumir que recalcular el Excel reproduce el motor actual. El campo beta de `sector_configs/*.json` no es la beta efectiva de `calcularWacc`, que usa la entrada sector_beta.

Cambios propuestos para una versión nueva de cada maestro:

1. Separar columnas de diagnóstico, ΔKe, ΔKd, estructura, FCFF, equity y escenarios, con unidad/origen/fecha/modelo y estado. Dejar sin cuantificar una propuesta no estimable.
2. Mostrar Ke_base y Ke_ajustado; Kd_base/Kd_ajustado/Kd neto; pesos e impuesto documentados; WACC derivado por componentes, sin sumar una prima Ke completa al WACC.
3. Sustituir filas de «prima genérica» por factores desglosados y aprobación explícita; conservar concentración como un factor separado sujeto a revisión, no como proxy de tamaño.
4. Mostrar referencia que ya contiene riesgo para toda propuesta negativa, conciliación del importe incluido y límite de reducción residual. Ventaja verde no implica descuento de tasa.
5. Conservar snapshot y fórmulas históricas. Generar nuevo código/versión de maestro, pruebas por familia y cotejo TS→Excel→PDF. Para bancos/seguros/REIT mostrar tratamiento equity adecuado y WACC solo cuando sea informativo.

No se ha cambiado ningún libro ni fórmula del maestro. No se usan tasas/betas/spreads de ejemplos como constantes.

## Interfaz futura

Una sección de revisión mostraría empresa, sector, fecha, familia, baseline y WACC original; paneles separados de liquidez financiera/bursátil, insolvencia, comerciabilidad y tamaño; indicadores/valores/unidades y comparables/periodos; ventajas y riesgos; metodología, evidencia, confianza cualitativa, limitaciones y duplicidades; propuestas positivas/negativas/cero/no estimables/ya incorporadas y destino financiero.

FAVORABLE verde, DESFAVORABLE rojo, NEUTRAL gris, DESCONOCIDO ámbar, siempre con texto. Separar el color del **estado de ajuste**: tamaño mayor puede tener dirección desconocida y una liquidez favorable puede carecer de prima estimable. NO_APLICABLE tiene explicación de familia y ningún número fabricado. Mostrar aprobación/rechazo/override con fuente, actor, fecha y motivo, historial anterior y posterior. WACC candidato e impacto intrínseco solo después de un cálculo candidato válido; si faltan, mostrar «no calculado». El botón de aceptación no debe convertir automáticamente un diagnóstico en prima ni alterar el run original.
