import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import '../css/cuerpo.css';
import '../css/screener.css';
import '../css/ficha.css';
import TradingViewWidget from './TradingViewWidget';
import { Indicador, etiquetaFortaleza } from './cuerpo';
import { SIN_DATOS, decimal, moneda, porcentaje, fecha, importeGrande, nombreLegible } from '../formato';

// Ficha completa de una empresa: datos de mercado, fortaleza, valoración del motor e histórico anual.

const API = `${import.meta.env.VITE_API_URL ?? ''}/api/landing`;

const RANGOS = [['1M', '1M'], ['12M', '1A'], ['60M', '5A']];

const ESCENARIOS = { CONSERVATIVE: 'Conservador', BASE: 'Base', OPTIMISTIC: 'Optimista' };

// Filas del histórico: origen (partidas o kpis), clave y formato
const HISTORICO = [
    { grupo: 'Cuenta de resultados' },
    { l: 'Ingresos', o: 'partidas', k: 'INGRESOS', f: 'importe' },
    { l: 'Beneficio neto', o: 'partidas', k: 'BENEFICIO_NETO', f: 'importe' },
    { l: 'EBITDA', o: 'kpis', k: 'EBITDA', f: 'importe' },
    { l: 'BPA diluido', o: 'partidas', k: 'EPS_DILUIDO', f: 'bpa' },
    { grupo: 'Márgenes y rentabilidad' },
    { l: 'Margen bruto', o: 'kpis', k: 'MARGEN_BRUTO', f: 'pct' },
    { l: 'Margen EBIT', o: 'kpis', k: 'MARGEN_EBIT', f: 'pct' },
    { l: 'Margen neto', o: 'kpis', k: 'MARGEN_NETO', f: 'pct' },
    { l: 'ROE', o: 'kpis', k: 'ROE', f: 'pct' },
    { l: 'ROA', o: 'kpis', k: 'ROA', f: 'pct' },
    { grupo: 'Caja' },
    { l: 'Flujo de caja operativo', o: 'partidas', k: 'FLUJO_CAJA_OPERATIVO', f: 'importe' },
    { l: 'Free cash flow', o: 'kpis', k: 'FCF', f: 'importe' },
    { l: 'Margen FCF', o: 'kpis', k: 'MARGEN_FCF', f: 'pct' },
    { l: 'Efectivo', o: 'partidas', k: 'EFECTIVO', f: 'importe' },
    { grupo: 'Deuda y solvencia' },
    { l: 'Deuda neta', o: 'kpis', k: 'DEUDA_NETA', f: 'importe', inversa: true },
    { l: 'DFN / EBITDA', o: 'kpis', k: 'DEUDA_NETA_SOBRE_EBITDA', f: 'veces', inversa: true },
    { l: 'Cobertura de intereses', o: 'kpis', k: 'COBERTURA_INTERESES', f: 'veces' },
    { l: 'Pasivo / activos', o: 'kpis', k: 'PASIVO_SOBRE_ACTIVOS', f: 'pct', inversa: true },
];

async function pedir(url, signal) {
    const respuesta = await fetch(url, { signal });
    const datos = await respuesta.json();
    if (!respuesta.ok || !datos.ok) throw new Error(datos.error ?? `HTTP ${respuesta.status}`);
    return datos;
}

// Importes grandes con signo y sin moneda (la moneda va en la cabecera de la tabla)
function compacto(n) {
    if (n == null) return null;
    const a = Math.abs(n), s = n < 0 ? '−' : '';
    if (a >= 1e12) return `${s}${decimal(a / 1e12)} bill.`;
    if (a >= 1e9) return `${s}${decimal(a / 1e9, 1)} mil M`;
    if (a >= 1e6) return `${s}${decimal(a / 1e6, 1)} M`;
    return `${s}${decimal(a, 0)}`;
}

function formatear(v, f) {
    if (v == null) return null;
    if (f === 'importe') return compacto(v);
    if (f === 'pct') return `${decimal(v, 1)}%`;
    if (f === 'veces') return `${decimal(v, 1)}x`;
    return decimal(v);
}

const anio = (iso) => iso?.slice(0, 4) ?? '—';
const VACIO = <span className="vacioCelda">{SIN_DATOS}</span>;

// ---------------- Buscador ----------------

function Buscador() {
    const navegar = useNavigate();
    const [texto, setTexto] = useState('');
    const [resultados, setResultados] = useState([]);

    useEffect(() => {
        const q = texto.trim();
        if (!q) { setResultados([]); return; }
        const control = new AbortController();
        const espera = setTimeout(() => {
            pedir(`${API}/buscar?q=${encodeURIComponent(q)}`, control.signal)
                .then(d => setResultados(d.resultados))
                .catch(() => {});
        }, 250);
        return () => { clearTimeout(espera); control.abort(); };
    }, [texto]);

    const abrir = (id) => { setTexto(''); navegar(`/ficha/${id}`); };

    return (
        <div className="buscadorFicha">
            <span className="campoBusqueda">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input type="text" placeholder="Buscar otra empresa o ticker" value={texto}
                    onChange={e => setTexto(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && resultados[0] && abrir(resultados[0].id)} />
            </span>
            {texto.trim() && (
                <ul className="desplegable">
                    {resultados.length === 0 && <li className="nota sinCoincidencias">Sin coincidencias</li>}
                    {resultados.map(r => (
                        <li key={r.id}>
                            <button type="button" onClick={() => abrir(r.id)}>
                                <span className="nombre">{nombreLegible(r.nombre)}</span>
                                <span className="nota">{r.bolsa} · {r.ticker}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ---------------- Valoración del motor ----------------

function Valoracion({ valoracion, precio, codigoMoneda }) {
    if (!valoracion) {
        return (
            <section className="tarjeta valoracion">
                <p className="subtitulo">MOTOR DE VALORACIÓN</p>
                <h4 className="titulo">Sin valoración completada</h4>
                <p className="nota margen">El motor de G2EXCHANGE todavía no ha valorado esta empresa.</p>
            </section>
        );
    }

    const esc = Object.fromEntries(valoracion.escenarios.map(e => [e.escenario, e]));
    const base = esc.BASE ?? valoracion.escenarios[0];
    const referencia = base.precioReferencia ?? precio;
    const valores = [...valoracion.escenarios.map(e => e.valorRazonable), referencia].filter(v => v != null);
    const min = Math.min(...valores) * 0.9, max = Math.max(...valores) * 1.1;
    const fraccion = (v) => (v - min) / (max - min || 1);
    const pos = (v) => `${fraccion(v) * 100}%`;
    // Las etiquetas cerca de un extremo se alinean hacia dentro para no salirse de la tarjeta
    const lado = (v) => fraccion(v) < 0.2 ? 'izquierda' : fraccion(v) > 0.8 ? 'derecha' : '';
    const bajo = esc.CONSERVATIVE?.valorRazonable, alto = esc.OPTIMISTIC?.valorRazonable;

    return (
        <section className="tarjeta valoracion">
            <div className="cabeceraTarjeta">
                <div>
                    <p className="subtitulo">MOTOR DE VALORACIÓN</p>
                    <h4 className="titulo">Valor razonable por escenarios</h4>
                </div>
                <div className="etiquetas">
                    <span className={`insignia ${base.decision}`}>{base.decision}</span>
                    <span className="chip">Confianza {base.confianza}</span>
                    <span className="chip">Validación {base.validacion}</span>
                </div>
            </div>

            <div className="escala" aria-hidden="true">
                {bajo != null && alto != null && (
                    <div className="banda" style={{ left: pos(bajo), width: `calc(${pos(alto)} - ${pos(bajo)})` }} />
                )}
                <div className={`marca razonable ${lado(base.valorRazonable)}`} style={{ left: pos(base.valorRazonable) }}>
                    <span>Valor base {moneda(base.valorRazonable, codigoMoneda)}</span>
                </div>
                <div className={`marca precio ${lado(referencia)}`} style={{ left: pos(referencia) }}>
                    <span>Precio {moneda(referencia, codigoMoneda)}</span>
                </div>
            </div>

            <div className="escenarios">
                {valoracion.escenarios.map(e => (
                    <div key={e.escenario} className={`escenario ${e.escenario === 'BASE' ? 'destacado' : ''}`}>
                        <p className="etiqueta">{(ESCENARIOS[e.escenario] ?? e.escenario).toUpperCase()}</p>
                        <p className="cifra">{moneda(e.valorRazonable, codigoMoneda)}</p>
                        <p className={`potencial ${e.potencial >= 0 ? 'pos' : 'neg'}`}>{porcentaje(e.potencial, 1)}</p>
                        <ul className="detalleKpis">
                            <li>Precio máx. de compra<span>{moneda(e.precioMaximoCompra, codigoMoneda)}</span></li>
                            <li>WACC<span>{e.wacc == null ? SIN_DATOS : `${decimal(e.wacc)}%`}</span></li>
                            <li>Crecimiento terminal<span>{e.crecimientoTerminal == null ? SIN_DATOS : `${decimal(e.crecimientoTerminal)}%`}</span></li>
                        </ul>
                    </div>
                ))}
            </div>
            <p className="nota margen">
                Método {valoracion.metodo} · plantilla {valoracion.plantilla} · motor {valoracion.version ?? '—'} ·
                calculado el {valoracion.fecha ? new Date(valoracion.fecha.replace(' ', 'T')).toLocaleDateString('es-ES') : '—'} con
                un precio de {moneda(referencia, codigoMoneda)}. El potencial compara cada valor razonable con ese precio.
            </p>
        </section>
    );
}

// ---------------- Gráfico de ingresos y beneficio ----------------

function GraficoResultados({ informes, codigoMoneda }) {
    const puntos = informes.map(i => ({ anio: anio(i.fechaFin), ingresos: i.partidas.INGRESOS ?? null, beneficio: i.partidas.BENEFICIO_NETO ?? null }));
    const valores = puntos.flatMap(p => [p.ingresos, p.beneficio]).filter(v => v != null);
    if (!valores.length) return <p className="sinDatos grafica">Sin ingresos ni beneficios en los informes anuales.</p>;

    const ancho = 640, alto = 220, margen = { arriba: 16, abajo: 28, izq: 8, der: 8 };
    const maximo = Math.max(0, ...valores), minimo = Math.min(0, ...valores);
    const y = (v) => margen.arriba + (maximo - v) / (maximo - minimo || 1) * (alto - margen.arriba - margen.abajo);
    const hueco = (ancho - margen.izq - margen.der) / puntos.length;
    const barra = Math.min(34, hueco / 3);

    return (
        <svg className="grafica" viewBox={`0 0 ${ancho} ${alto}`} role="img"
            aria-label={`Ingresos y beneficio neto por año en ${codigoMoneda}`}>
            <line x1={margen.izq} x2={ancho - margen.der} y1={y(0)} y2={y(0)} className="eje" />
            {puntos.map((p, i) => {
                const centro = margen.izq + hueco * (i + 0.5);
                return (
                    <g key={p.anio + i}>
                        {[['ingresos', -barra - 2], ['beneficio', 2]].map(([serie, desplazamiento]) => p[serie] != null && (
                            <rect key={serie} className={`${serie} ${p[serie] < 0 ? 'negativa' : ''}`}
                                x={centro + desplazamiento} width={barra} rx="3"
                                y={Math.min(y(p[serie]), y(0))} height={Math.max(1, Math.abs(y(p[serie]) - y(0)))}>
                                <title>{`${p.anio} · ${serie === 'ingresos' ? 'Ingresos' : 'Beneficio neto'}: ${compacto(p[serie])} ${codigoMoneda}`}</title>
                            </rect>
                        ))}
                        <text x={centro} y={alto - 8} className="anio">{p.anio}</text>
                    </g>
                );
            })}
        </svg>
    );
}

// ---------------- Página ----------------

export function Ficha() {
    const { id } = useParams();
    const navegar = useNavigate();
    const [empresa, setEmpresa] = useState(null);
    const [detalle, setDetalle] = useState(null);
    const [error, setError] = useState('');
    const [rango, setRango] = useState('12M');

    // Sin id se abre la primera empresa destacada
    useEffect(() => {
        if (id) return;
        const control = new AbortController();
        pedir(`${API}/empresas`, control.signal)
            .then(d => d.empresas[0] && navegar(`/ficha/${d.empresas[0].id}`, { replace: true }))
            .catch(e => e.name !== 'AbortError' && setError(e.message));
        return () => control.abort();
    }, [id, navegar]);

    useEffect(() => {
        if (!id) return;
        const control = new AbortController();
        setEmpresa(null); setDetalle(null); setError('');
        Promise.all([pedir(`${API}/empresas/${id}`, control.signal), pedir(`${API}/empresas/${id}/detalle`, control.signal)])
            .then(([f, d]) => { setEmpresa(f.empresa); setDetalle(d); })
            .catch(e => e.name !== 'AbortError' && setError(e.message));
        return () => control.abort();
    }, [id]);

    const nombre = empresa ? nombreLegible(empresa.nombre) : '';
    const m = empresa?.metricas;
    const fortaleza = empresa?.fortaleza;
    const informes = detalle?.informes ?? [];

    return (
        <main className="cuerpo screener ficha">
            <div className="contenedor">
                <div className="encabezado">
                    <div className="identidad">
                        <p className="migas">MERCADOS / FICHA EMPRESA</p>
                        <div className="tituloEmpresa">
                            {empresa && <div className="cajaEmpresa"><p className="inicialEmpresa">{nombre[0]}</p></div>}
                            <h1>{empresa ? nombre : error ? 'Ficha empresa' : 'Cargando…'}</h1>
                        </div>
                        <p className="descripcion">
                            {empresa ? `${empresa.bolsa}: ${empresa.ticker} · ${empresa.sector && empresa.sector !== 'N/A' ? empresa.sector : 'Sector sin clasificar'} · ${empresa.moneda}`
                                : 'Datos de mercado, fundamentales y valoración en una sola vista.'}
                        </p>
                    </div>
                    <div className="lateralEncabezado">
                        <Buscador />
                        {empresa && (
                            <div className="estadoMercado">
                                <div>
                                    <p className="cierre">ÚLTIMO CIERRE</p>
                                    <p className="precioCabecera">{moneda(empresa.precio, empresa.moneda)}</p>
                                    <p className="cierre">{fecha(empresa.fechaPrecio)}</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {error && <p className="avisoError">No se pudieron cargar los datos: {error}</p>}

                {empresa && (
                    <>
                        <div className="metricas cuatro">
                            <div className="metrica">
                                <p className="etiqueta">CAPITALIZACIÓN</p>
                                <p className="cifra">{importeGrande(m.capitalizacion, empresa.moneda)}</p>
                                <p className="nota">{m.accionesEnCirculacion ? `${decimal(m.accionesEnCirculacion / 1e6, 0)} M de acciones` : 'Sin acciones en circulación'}</p>
                            </div>
                            <div className="metrica">
                                <p className="etiqueta">PER</p>
                                <p className="cifra">{m.per == null ? SIN_DATOS : decimal(m.per)}</p>
                                <p className="nota">{m.epsDiluido == null ? 'Sin BPA disponible' : `BPA diluido ${moneda(m.epsDiluido, empresa.moneda)}`}</p>
                            </div>
                            <div className="metrica">
                                <p className="etiqueta">RENT. POR DIVIDENDO</p>
                                <p className="cifra">{m.rentabilidadDividendo == null ? SIN_DATOS : `${decimal(m.rentabilidadDividendo)}%`}</p>
                                <p className="nota">{m.rentabilidadDividendo == null ? 'Sin dividendos registrados' : 'Dividendos pagados / capitalización'}</p>
                            </div>
                            <div className="metrica">
                                <p className="etiqueta">DFN / EBITDA</p>
                                <p className="cifra">{m.dfnEbitda == null ? SIN_DATOS : `${decimal(m.dfnEbitda, 1)}x`}</p>
                                <p className="nota">{m.dfnEbitda == null ? 'Sin deuda neta o EBITDA' : m.dfnEbitda < 0 ? 'Caja neta: el efectivo supera la deuda' : 'Deuda financiera neta / EBITDA'}</p>
                            </div>
                        </div>

                        <div className="rejillaFicha">
                            <section className="evolucionAccion">
                                <div className="cabeceraTarjeta">
                                    <div>
                                        <p className="rendimiento">RENDIMIENTO</p>
                                        <h3 className="tituloEvolucion">Evolución de la acción</h3>
                                    </div>
                                    <div className="rangos">
                                        {RANGOS.map(([v, l]) => (
                                            <button key={v} type="button" className={v === rango ? 'activo' : ''} onClick={() => setRango(v)}>{l}</button>
                                        ))}
                                    </div>
                                </div>
                                <div className="grafico alto">
                                    {empresa.simboloTradingView
                                        ? <TradingViewWidget key={`${empresa.simboloTradingView}-${rango}`} symbol={empresa.simboloTradingView} range={rango} />
                                        : <p className="sinDatos">Gráfico no disponible para este mercado.</p>}
                                </div>
                            </section>

                            <section className="tarjeta">
                                <p className="subtitulo">ANÁLISIS G2EXCHANGE</p>
                                <h4 className="titulo">Fortaleza financiera</h4>
                                <Indicador valor={fortaleza.total} />
                                <p className="fortalezaTexto">{etiquetaFortaleza(fortaleza.total)}</p>
                                <div className="puntuaciones">
                                    {Object.entries(fortaleza.puntuaciones).map(([clave, valor]) => (
                                        <div key={clave}>
                                            <div className="puntuacionTexto">
                                                <span>{clave}</span>
                                                <span className="numero">{valor ?? SIN_DATOS}</span>
                                            </div>
                                            <div className="barra"><div style={{ width: `${valor ?? 0}%` }}></div></div>
                                        </div>
                                    ))}
                                </div>
                                <ul className="detalleKpis">
                                    <li>Crecimiento de ingresos<span>{porcentaje(m.crecimientoIngresos, 1)}</span></li>
                                    <li>ROE<span>{m.roe == null ? SIN_DATOS : `${decimal(m.roe, 1)}%`}</span></li>
                                    <li>Margen neto<span>{m.margenNeto == null ? SIN_DATOS : `${decimal(m.margenNeto, 1)}%`}</span></li>
                                    <li>Pasivo / activos<span>{m.pasivoSobreActivos == null ? SIN_DATOS : `${decimal(m.pasivoSobreActivos, 1)}%`}</span></li>
                                </ul>
                            </section>
                        </div>

                        {detalle && <Valoracion valoracion={detalle.valoracion} precio={empresa.precio} codigoMoneda={empresa.moneda} />}

                        <section className="tarjeta resultados historico">
                            <div className="cabeceraTarjeta">
                                <div>
                                    <p className="subtitulo">FUNDAMENTALES</p>
                                    <h4 className="titulo">Histórico anual</h4>
                                </div>
                                <div className="leyenda">
                                    <span><i className="ingresos"></i>Ingresos</span>
                                    <span><i className="beneficio"></i>Beneficio neto</span>
                                </div>
                            </div>
                            {!detalle && <p className="vacio">Cargando informes…</p>}
                            {detalle && informes.length === 0 && <p className="vacio">No hay informes anuales de esta empresa.</p>}
                            {informes.length > 0 && (
                                <>
                                    <div className="contenedorGrafica">
                                        <GraficoResultados informes={informes} codigoMoneda={empresa.moneda} />
                                    </div>
                                    <div className="tablaScroll">
                                        <table>
                                            <thead>
                                                <tr>
                                                    <th><span className="th">Importes en {empresa.moneda}</span></th>
                                                    {informes.map(i => (
                                                        <th key={i.fechaFin} className="num" title={`${i.documento ?? ''} cerrado el ${fecha(i.fechaFin)}`}>
                                                            <span className="th">{anio(i.fechaFin)}</span>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {HISTORICO.map(fila => fila.grupo ? (
                                                    <tr key={fila.grupo} className="grupo"><td colSpan={informes.length + 1}>{fila.grupo}</td></tr>
                                                ) : (
                                                    <tr key={fila.k} className="estatica">
                                                        <td>{fila.l}</td>
                                                        {informes.map((inf, i) => {
                                                            const v = inf[fila.o][fila.k];
                                                            const previo = i > 0 ? informes[i - 1][fila.o][fila.k] : null;
                                                            const mejora = v != null && previo != null && v !== previo ? (v > previo) !== !!fila.inversa : null;
                                                            return (
                                                                <td key={inf.fechaFin} className={`num ${mejora == null ? '' : mejora ? 'sube' : 'baja'}`}>
                                                                    {formatear(v, fila.f) ?? VACIO}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </>
                            )}
                        </section>

                        <p className="aviso">
                            {empresa.informe && `Último informe anual: ${empresa.informe.documento} cerrado el ${fecha(empresa.informe.fechaFin)}. `}
                            Verde o rojo indica mejora o empeoramiento frente al año anterior. Datos informativos, no constituyen una recomendación de inversión.
                            {' '}<Link to="/screener">Comparar en el screener</Link>
                        </p>
                    </>
                )}
            </div>
        </main>
    );
}
