import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import '../css/cuerpo.css';
import '../css/screener.css';
import '../css/comparador.css';
import { SIN_DATOS, decimal, fecha, importeGrande, moneda, nombreLegible } from '../formato';

// Comparador: hasta cuatro empresas lado a lado.
// Las métricas salen del endpoint del screener (ya cacheado) y el histórico de ingresos del detalle de cada ficha.

const API = `${import.meta.env.VITE_API_URL ?? ''}/api/landing`;
const MAXIMO = 4;
const COLORES = ['#4F86F7', '#3DD68C', '#F5B84B', '#C084FC'];

// mejor: 'alto' o 'bajo' indica qué valor se resalta; sin «mejor» no se compara
const FILAS = [
    { grupo: 'Mercado' },
    { l: 'Precio', k: 'precio', f: 'precio' },
    { l: 'Capitalización', k: 'capitalizacion', f: 'cap' },
    { l: 'Sector', k: 'sector', f: 'texto' },
    { grupo: 'Valoración' },
    { l: 'PER', k: 'per', f: 'veces', mejor: 'bajo', positivo: true },
    { l: 'PER frente a su sector', k: 'perRelativo', f: 'veces', mejor: 'bajo', positivo: true, ayuda: 'PER de la empresa / mediana del PER de su sector en su mercado' },
    { l: 'Potencial del motor', k: 'potencial', f: 'pctSigno', mejor: 'alto' },
    { l: 'Decisión del motor', k: 'decision', f: 'decision' },
    { grupo: 'Rentabilidad' },
    { l: 'ROE', k: 'roe', f: 'pct', mejor: 'alto' },
    { l: 'ROA', k: 'roa', f: 'pct', mejor: 'alto' },
    { l: 'Margen neto', k: 'margenNeto', f: 'pct', mejor: 'alto' },
    { l: 'Margen FCF', k: 'margenFcf', f: 'pct', mejor: 'alto' },
    { l: 'Crecimiento de ingresos', k: 'crecimiento', f: 'pctSigno', mejor: 'alto' },
    { grupo: 'Solidez' },
    { l: 'Deuda / EBITDA', k: 'deudaEbitda', f: 'veces', mejor: 'bajo' },
    { l: 'DFN / EBITDA', k: 'dfnEbitda', f: 'veces', mejor: 'bajo', ayuda: 'Negativo = caja neta: el efectivo supera la deuda financiera' },
    { l: 'Cobertura de intereses', k: 'cobertura', f: 'veces', mejor: 'alto' },
];

async function pedir(url, signal) {
    const respuesta = await fetch(url, { signal });
    const datos = await respuesta.json();
    if (!respuesta.ok || !datos.ok) throw new Error(datos.error ?? `HTTP ${respuesta.status}`);
    return datos;
}

const VACIO = <span className="vacioCelda">{SIN_DATOS}</span>;

function valorCelda(e, fila) {
    const v = e[fila.k];
    if (fila.f === 'decision') return v ? <span className={`insignia ${v}`}>{v}</span> : VACIO;
    if (v == null) return VACIO;
    switch (fila.f) {
        case 'precio': return moneda(v, e.moneda);
        case 'cap': return importeGrande(v, e.moneda);
        case 'texto': return v === 'N/A' ? VACIO : v;
        case 'veces': return `${decimal(Math.abs(v) < 0.05 ? 0 : v, 1)}x`;
        case 'pct': return `${decimal(v, 1)}%`;
        case 'pctSigno': return `${v > 0 ? '+' : ''}${decimal(v, 1)}%`;
        default: return v;
    }
}

// Índice del mejor valor de la fila (solo si al menos dos empresas tienen dato)
function mejorIndice(empresas, fila) {
    if (!fila.mejor) return -1;
    const candidatos = empresas
        .map((e, i) => ({ v: e[fila.k], i }))
        .filter(({ v }) => v != null && (!fila.positivo || v > 0));
    if (candidatos.length < 2) return -1;
    return candidatos.reduce((a, b) => (fila.mejor === 'alto' ? b.v > a.v : b.v < a.v) ? b : a).i;
}

// ---------------- Selector de empresas ----------------

function Selector({ todas, seleccion, onAnadir }) {
    const [texto, setTexto] = useState('');
    const resultados = useMemo(() => {
        const q = texto.trim().toLowerCase();
        if (!q) return [];
        const ids = new Set(seleccion.map(e => e.id));
        return todas
            .filter(e => !ids.has(e.id) && `${e.ticker} ${e.nombre}`.toLowerCase().includes(q))
            // Primero coincidencia exacta de ticker, luego las de mayor capitalización
            .sort((a, b) => (b.ticker.toLowerCase() === q) - (a.ticker.toLowerCase() === q) || (b.capitalizacion ?? 0) - (a.capitalizacion ?? 0))
            .slice(0, 8);
    }, [texto, todas, seleccion]);

    const lleno = seleccion.length >= MAXIMO;
    const anadir = (e) => { onAnadir(e.id); setTexto(''); };

    return (
        <div className="selector">
            <span className="campoBusqueda">
                <i className="fa-solid fa-plus"></i>
                <input type="text" value={texto} disabled={lleno || !todas.length}
                    placeholder={lleno ? `Máximo ${MAXIMO} empresas` : !todas.length ? 'Cargando empresas…' : 'Añadir empresa o ticker'}
                    onChange={e => setTexto(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && resultados[0] && anadir(resultados[0])} />
            </span>
            {texto.trim() && (
                <ul className="desplegable">
                    {resultados.length === 0 && <li className="nota sinCoincidencias">Sin coincidencias</li>}
                    {resultados.map(e => (
                        <li key={e.id}>
                            <button type="button" onClick={() => anadir(e)}>
                                <span className="nombre">{nombreLegible(e.nombre)}</span>
                                <span className="nota">{e.bolsa} · {e.ticker} · {e.moneda}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ---------------- Gráfico de ingresos (base 100) ----------------

function GraficoIngresos({ series }) {
    // series: [{ id, nombre, color, puntos: [{ anio, valor }] }]
    const conDatos = series.filter(s => s.puntos.length >= 2);
    if (!conDatos.length) return <p className="sinDatos grafica">No hay al menos dos años de ingresos para comparar.</p>;

    const anios = [...new Set(conDatos.flatMap(s => s.puntos.map(p => p.anio)))].sort();
    const indexadas = conDatos.map(s => {
        const base = s.puntos[0].valor;
        return { ...s, puntos: s.puntos.map(p => ({ ...p, indice: p.valor / base * 100 })) };
    });
    const valores = indexadas.flatMap(s => s.puntos.map(p => p.indice));
    const maximo = Math.max(110, ...valores), minimo = Math.min(90, ...valores);

    const ancho = 720, alto = 260, m = { arriba: 16, abajo: 30, izq: 44, der: 16 };
    const x = (anio) => m.izq + (anios.length === 1 ? 0.5 : anios.indexOf(anio) / (anios.length - 1)) * (ancho - m.izq - m.der);
    const y = (v) => m.arriba + (maximo - v) / (maximo - minimo) * (alto - m.arriba - m.abajo);
    // Los extremos solo se rotulan si no quedan pegados a la línea base de 100
    const separado = (v) => Math.abs(v - 100) / (maximo - minimo) > 0.1;
    const marcas = [100, ...[minimo, maximo].filter(separado)].map(Math.round);

    return (
        <svg className="grafica" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label="Evolución de ingresos, índice base 100 en el primer año">
            {marcas.map(v => (
                <g key={v}>
                    <line x1={m.izq} x2={ancho - m.der} y1={y(v)} y2={y(v)} className={v === 100 ? 'eje base' : 'eje'} />
                    <text x={m.izq - 8} y={y(v) + 4} className="valorEje">{v}</text>
                </g>
            ))}
            {anios.map(a => <text key={a} x={x(a)} y={alto - 8} className="anio">{a}</text>)}
            {indexadas.map(s => (
                <g key={s.id}>
                    <polyline fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round"
                        points={s.puntos.map(p => `${x(p.anio)},${y(p.indice)}`).join(' ')} />
                    {s.puntos.map(p => (
                        <circle key={p.anio} cx={x(p.anio)} cy={y(p.indice)} r="4" fill={s.color}>
                            <title>{`${s.nombre} · ${p.anio}: ${decimal(p.indice, 0)} (base 100)`}</title>
                        </circle>
                    ))}
                </g>
            ))}
        </svg>
    );
}

// ---------------- Página ----------------

export function Comparador() {
    const [parametros, setParametros] = useSearchParams();
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState('');
    const [historicos, setHistoricos] = useState({});

    useEffect(() => {
        pedir(`${API}/screener`)
            .then(setDatos)
            .catch(e => setError(e.message));
    }, []);

    const todas = useMemo(() => !datos ? [] : datos.empresas.map(e => {
        const perSector = datos.medianaPerSector[`${e.mercado}|${e.sector}`] ?? null;
        return { ...e, perRelativo: e.per != null && perSector ? e.per / perSector : null };
    }), [datos]);

    const porId = useMemo(() => new Map(todas.map(e => [e.id, e])), [todas]);

    // Sin selección en la URL se comparan las tres mayores cotizadas en USD
    const ids = useMemo(() => {
        const enUrl = (parametros.get('ids') ?? '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0);
        if (enUrl.length || parametros.has('ids')) return [...new Set(enUrl)].slice(0, MAXIMO);
        return todas.filter(e => e.moneda === 'USD' && e.capitalizacion != null)
            .sort((a, b) => b.capitalizacion - a.capitalizacion).slice(0, 3).map(e => e.id);
    }, [parametros, todas]);

    const seleccion = ids.map(id => porId.get(id)).filter(Boolean);
    const cambiarIds = (nuevos) => setParametros({ ids: nuevos.join(',') }, { replace: true });

    // Histórico de ingresos de cada empresa seleccionada (se pide una sola vez por empresa)
    useEffect(() => {
        const control = new AbortController();
        ids.filter(id => !(id in historicos)).forEach(id => {
            pedir(`${API}/empresas/${id}/detalle`, control.signal)
                .then(d => setHistoricos(h => ({
                    ...h,
                    [id]: d.informes
                        .filter(i => i.partidas.INGRESOS > 0)
                        .map(i => ({ anio: i.fechaFin.slice(0, 4), valor: i.partidas.INGRESOS })),
                })))
                .catch(e => e.name !== 'AbortError' && setHistoricos(h => ({ ...h, [id]: [] })));
        });
        return () => control.abort();
    // Solo depende de la selección: «historicos» se consulta para no repetir peticiones
    }, [ids.join(',')]);

    const monedas = new Set(seleccion.map(e => e.moneda));
    const series = seleccion.map((e, i) => ({ id: e.id, nombre: nombreLegible(e.nombre), color: COLORES[i], puntos: historicos[e.id] ?? [] }));
    const cargandoHistorico = seleccion.some(e => !(e.id in historicos));

    return (
        <main className="cuerpo screener comparador">
            <div className="contenedor">
                <div className="encabezado">
                    <div>
                        <p className="migas">MERCADOS / COMPARADOR</p>
                        <h1>Comparador de empresas</h1>
                        <p className="descripcion">Enfrenta hasta {MAXIMO} compañías en valoración, rentabilidad y solidez financiera.</p>
                    </div>
                    <Selector todas={todas} seleccion={seleccion} onAnadir={id => cambiarIds([...ids, id])} />
                </div>

                {error && <p className="avisoError">No se pudieron cargar los datos: {error}</p>}
                {!datos && !error && <p className="cargandoTexto">Cargando empresas…</p>}

                {datos && seleccion.length === 0 && (
                    <section className="tarjeta vacioComparador">
                        <i className="fa-solid fa-scale-balanced"></i>
                        <h4 className="titulo">Añade empresas para empezar</h4>
                        <p className="nota">Usa el buscador de arriba para elegir entre 2 y {MAXIMO} compañías.</p>
                    </section>
                )}

                {seleccion.length > 0 && (
                    <>
                        <div className="tarjetasEmpresas">
                            {seleccion.map((e, i) => (
                                <article key={e.id} className="tarjeta empresaComparada" style={{ '--color': COLORES[i] }}>
                                    <div className="cabeceraTarjeta">
                                        <div className="compania">
                                            <span className="caja">{nombreLegible(e.nombre)[0]}</span>
                                            <div>
                                                <p className="nombre">{nombreLegible(e.nombre)}</p>
                                                <p className="nota">{e.bolsa} · {e.ticker}</p>
                                            </div>
                                        </div>
                                        <button type="button" className="botonIcono" aria-label={`Quitar ${nombreLegible(e.nombre)}`}
                                            onClick={() => cambiarIds(ids.filter(id => id !== e.id))}>
                                            <i className="fa-solid fa-xmark"></i>
                                        </button>
                                    </div>
                                    <p className="cifra">{moneda(e.precio, e.moneda)}</p>
                                    <p className="nota">Cierre {fecha(e.fechaPrecio)}</p>
                                    <Link to={`/ficha/${e.id}`} className="enlaceFicha">
                                        Ver ficha <i className="fa-solid fa-arrow-right"></i>
                                    </Link>
                                </article>
                            ))}
                        </div>

                        {seleccion.length === 1 && <p className="nota avisoUna">Añade al menos otra empresa para resaltar la mejor en cada métrica.</p>}

                        <section className="tarjeta resultados">
                            <div className="cabeceraTarjeta">
                                <div>
                                    <p className="subtitulo">MÉTRICAS</p>
                                    <h4 className="titulo">Comparativa fundamental</h4>
                                </div>
                                <p className="nota leyendaMejor"><span className="puntoMejor"></span> Mejor valor de la fila</p>
                            </div>
                            <div className="tablaScroll">
                                <table>
                                    <thead>
                                        <tr>
                                            <th><span className="th">Métrica</span></th>
                                            {seleccion.map((e, i) => (
                                                <th key={e.id} className="num">
                                                    <span className="th"><span className="puntoColor" style={{ background: COLORES[i] }}></span>{e.ticker}</span>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {FILAS.map(fila => fila.grupo ? (
                                            <tr key={fila.grupo} className="grupo"><td colSpan={seleccion.length + 1}>{fila.grupo}</td></tr>
                                        ) : (
                                            <tr key={fila.k} className="estatica">
                                                <td title={fila.ayuda}>{fila.l}{fila.ayuda && <i className="fa-regular fa-circle-question ayuda"></i>}</td>
                                                {seleccion.map((e, i) => (
                                                    <td key={e.id} className={`num ${i === mejorIndice(seleccion, fila) ? 'mejor' : ''}`}>
                                                        {valorCelda(e, fila)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        <section className="tarjeta historicoIngresos">
                            <div className="cabeceraTarjeta">
                                <div>
                                    <p className="subtitulo">CRECIMIENTO</p>
                                    <h4 className="titulo">Evolución de ingresos (base 100)</h4>
                                </div>
                                <div className="leyenda">
                                    {series.map(s => (
                                        <span key={s.id}><i style={{ background: s.color }}></i>{s.nombre}</span>
                                    ))}
                                </div>
                            </div>
                            {cargandoHistorico && !series.some(s => s.puntos.length) ? <p className="sinDatos grafica">Cargando informes…</p>
                                : <GraficoIngresos series={series} />}
                            <p className="nota margen">
                                Cada línea parte de 100 en su primer informe anual disponible, así se comparan ritmos de crecimiento
                                aunque las empresas tengan tamaños o monedas distintas.
                            </p>
                        </section>
                    </>
                )}

                <p className="aviso">
                    {monedas.size > 1 && 'Las empresas cotizan en monedas distintas: precio y capitalización no son comparables directamente. '}
                    El mejor valor solo se resalta cuando al menos dos empresas tienen dato. Datos informativos, no constituyen una recomendación de inversión.
                </p>
            </div>
        </main>
    );
}
