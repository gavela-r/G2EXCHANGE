# Ampliación de la recuperación existente: Japón y Taiwán

Se mantienen los checkpoints y el objetivo por país y año. No se reinicia la intervención. Las 4.390 operaciones KPI nuevas con deuda incompleta se compensaron con trazabilidad, conservando filas y valores iniciales; la comprobación posterior devuelve cero pendientes de esa corrección. La copia previa se restauró, verificó sus 29 tablas y reprodujo la valoración 533 desde el paquete extraído. Estados Unidos y Japón continúan con los requisitos estrictos de deuda.

## Credenciales complementarias

Las nuevas claves sólo están en el `.env` y copias privadas. El gestor identifica las claves por alias, distingue 401/403/429/5xx, interpreta `Retry-After` en segundos o fecha HTTP y conserva la última comprobación para evitar repetirla. No registra valores ni fragmentos de claves.

La prueba de `/v1/usage` devuelve 429 para la clave EDINET DB principal y 200 para la secundaria. Eso no demuestra permiso para sumar cuotas. Su [documentación](https://edinetdb.com/docs/api) agrega el límite por cuenta; las [condiciones](https://edinetdb.com/legal/terms) contemplan restricciones frente al uso de claves/cuentas para eludir límites. Ambas se mantienen conservadoramente en un mismo grupo de cuota y no se alternan para aumentar capacidad. La alternancia requiere prueba independiente de cuotas separadas y permiso contractual, condiciones no acreditadas aquí. EDINET oficial sigue siendo la fuente principal.

FMP devuelve 401 en un único sondeo del perfil Basic de AAPL. No se han probado endpoints históricos de pago. Su [tarifa](https://site.financialmodelingprep.com/developer/docs/pricing) limita el acceso gratuito y sitúa la cobertura mundial en otro nivel; sus [condiciones](https://site.financialmodelingprep.com/terms-of-service) diferencian el uso comercial. No se habilita descarga financiera taiwanesa con una clave no autenticada ni con permisos no acreditados. Coste contratado: 0 EUR.

## Descargas japonesas paralelas

Se amplía el mismo coordinador con una cola central por documento y hasta tres procesos de descarga. Son procesos de descarga, no escritores financieros adicionales. El número activo se adapta a latencia y fallos; una respuesta lenta puede justificar más de uno, mientras un 429 o errores recientes reducen la actividad a uno.

Las reservas de peticiones y los contadores son atómicos entre procesos. Se mantiene el intervalo global conservador de 3.500 ms para EDINET y las cuotas existentes; no se multiplica capacidad por trabajador o clave. Una concesión por URL evita dos descargas simultáneas del mismo documento, incluso si lo solicita el escritor financiero. Éste tiene prioridad. La cola conserva estados, propietario, intentos, espera progresiva y hash de respuesta. Los trabajadores interrumpidos se detectan y reanudan; los fallos de descarga permanecen pendientes o registrados, sin convertirse en PCV recuperados.

Las pruebas multiproceso comprueban una sola petición para el mismo documento, separación global entre documentos, contadores exactos, 429 compartido y concesiones exclusivas. La inserción conserva el bloqueo por país, las transacciones idempotentes y la validación independiente del XBRL. No se modifica la firma de ningún checkpoint financiero existente; la política de transporte tiene su propio comprobante.

## Corte inicial de Taiwán

El universo original es **1.596 empresas** y el catálogo histórico taiwanés contiene **20 PCV**, no los 22 de US/JP. Acciones y dividendos figuraban como no disponibles en ese catálogo. Se conserva ese denominador para el antes/después: 31.920 slots PCV y 27.132 KPI por ejercicio. No se reduce para elevar porcentajes. Los conceptos adicionales de nuevas fuentes se informarán separadamente si se recuperan.

| Año | PCV inicial % | KPI inicial % | Anuales registrados |
|---|---:|---:|---:|
| 2022 | 45,7393 | 45,4408 | 899 |
| 2023 | 56,7763 | 56,7116 | 1.094 |
| 2024 | 56,9893 | 56,9991 | 1.097 |
| 2025 | 56,9518 | 56,9954 | 1.098 |

Hay 893 empresas con cuatro anuales registrados; 113 con los veinte PCV presentes en los cuatro años y 158 con los diecisiete KPI presentes. Son indicadores de presencia, no certificación de fuente. Veintiocho empresas carecen de instrumento. Los elegibles no se presuponen a partir de la ausencia de datos ni se excluyen del universo fijo.

## Fuentes taiwanesas comprobadas

- Se conserva el orden de proveedores existente y se audita su permiso antes de activar consultas. La [licencia de FinMind](https://finmind.github.io/en/Pricing/) distingue uso no comercial y comercial; el acceso Free no acredita permiso para el uso comercial previsto. No se ejecuta su rotación antigua de tokens para superar cuotas.
- [TWSE OpenAPI](https://openapi.twse.com.tw/) publica registro oficial y tablas parciales. La especificación consultada vincula la [licencia de datos abiertos](https://data.gov.tw/license). La respuesta de resultados examinada contiene 2026 T2, sin parámetro histórico documentado: no se inserta como 2022–2025 ni se presume que incluya flujo de efectivo completo.
- El listado oficial [MOPS XBRL](https://mopsov.twse.com.tw/mops/web/t203sb01) ofrece documentos anuales 2022–2025. Se ha descargado el iXBRL 2022 de una empresa directamente desde el enlace publicado: incluye identificador del emisor, contextos comparativos y actuales, moneda y escala. `scale=3` convierte cifras en miles a unidades; `decimals` no es un multiplicador. Los comparativos no se asignan al cierre actual.
- La fecha de auditoría o aprobación de estados no se presenta como fecha de publicación. La integración debe conservar esa distinción y no introducir información posterior como si hubiese estado disponible en una fecha anterior.

Los valores detallados, respuestas, claves y evidencias permanecen privados. La ampliación del informe de cobertura a doce combinaciones debe mostrar presencia y certificación por separado, con el déficit hasta el 85 % en cada una.
