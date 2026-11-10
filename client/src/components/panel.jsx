import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../css/cuerpo.css';
import '../css/screener.css';
import '../css/panel.css';
import { SIN_DATOS, decimal, fecha, importeGrande, nombreLegible } from '../formato';

// Panel de mercado: resumen agregado de la base de G2EXCHANGE.
// Reutiliza el endpoint del screener (una fila por empresa, cacheado en el servidor) y agrega en el navegador.

const MERCADOS = [['', 'Todos'], ['US', 'EE. UU.'], ['JP', 'Japón'], ['TW', 'Taiwán']];

const DECISIONES = [
    { k: 'BUY', l: 'Compra', color: 'verde' },
    { k: 'WATCH', l: 'Vigilar', color: 'ambar' },
    { k: 'WAIT', l: 'Esperar', color: 'rojo' },
];

const COBERTURA = [
    { k: 'precio', l: 'Precio de cierre' },
    { k: 'per', l: 'PER coherente' },
    { k: 'roe', l: 'ROE' },
    { k: 'margenFcf', l: 'Margen FCF' },
    { k: 'dfnEbitda', l: 'DFN / EBITDA' },
    { k: 'decision', l: 'Valoración del motor' },
];

const TOP = 8;
const SECTORES_VISIBLES = 12;

// En la BD muchas empresas de EE. UU. tienen el sector «N/A»: no es un sector real
const conSector = (e) => e.sector && e.sector !== 'N/A';

function mediana(valores) {
    const xs = valores.filter(v => v != null).sort((a, b) => a - b);
    if (!xs.length) return null;
    const mitad = Math.floor(xs.length / 2);
    return xs.length % 2 ? xs[mitad] : (xs[mitad - 1] + xs[mitad]) / 2;
}

const pct = (n, d = 1) => n == null ? SIN_DATOS : `${decimal(n, d)}%`;
const proporcion = (parte, total) => total ? parte / total * 100 : 0;
const signo = (n) => n == null ? '' : n >= 0 ? 'pos' : 'neg';

// Las capitalizaciones solo son comparables en la misma moneda: con «Todos» se ordenan las cotizadas en USD
const comparables = (lista, mercado) => lista.filter(e => e.capitalizacion != null && (mercado || e.moneda === 'USD'));
const porCapitalizacion = (a, b) => b.capitalizacion - a.capitalizacion;

function Metrica({ etiqueta, cifra, nota, cargando }) {
    return (
        <div className="metrica">
            <p className="etiqueta">{etiqueta}</p>
            <p className="cifra">{cargando ? '—' : cifra}</p>
            <p className="nota">{cargando ? 'Cargando…' : nota}</p>
        </div>
    );
}

function ListaEmpresas({ subtitulo, titulo, empresas, columna, vacio }) {
    const navegar = useNavigate();
    return (
        <section className="tarjeta lista">
            <div className="cabeceraTarjeta">
                <div>
                    <p className="subtitulo">{subtitulo}</p>
                    <h4 className="titulo">{titulo}</h4>
                </div>
            </div>
            {empresas.length === 0 ? <p className="vacio">{vacio}</p> : (
                <ul>
                    {empresas.map((e, i) => (
                        <li key={e.id}>
                            <button type="button" onClick={() => navegar(`/ficha/${e.id}`)}>
                                <span className="posicion">{i + 1}</span>
                                <div className="compania">
                                    <span className="caja">{nombreLegible(e.nombre)[0]}</span>
                                    <div>
                                        <p className="nombre">{nombreLegible(e.nombre)}</p>
                                        <p className="nota">{e.bolsa} · {e.ticker}</p>
                                    </div>
                                </div>
                                <div className="dato">
                                    <p className="principalDato">{importeGrande(e.capitalizacion, e.moneda)}</p>
                                    {columna(e)}
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export function Panel() {
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState('');
    const [mercado, setMercado] = useState('US');
    const [todosSectores, setTodosSectores] = useState(false);

    useEffect(() => {
        fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/landing/screener`)
            .then(r => r.json())
            .then(d => d.ok ? setDatos(d) : setError(d.error))
            .catch(e => setError(e.message));
    }, []);

    const todas = datos?.empresas ?? [];
    const empresas = useMemo(() => mercado ? todas.filter(e => e.mercado === mercado) : todas, [todas, mercado]);

    const resumen = useMemo(() => {
        const total = empresas.length;
        const conteo = (fn) => empresas.reduce((n, e) => n + (fn(e) ? 1 : 0), 0);
        const decisiones = Object.fromEntries(DECISIONES.map(d => [d.k, conteo(e => e.decision === d.k)]));
        const valoradas = conteo(e => e.decision && e.decision !== 'DATA_PENDING');

        const sectores = new Map();
        for (const e of empresas) {
            if (!conSector(e)) continue;
            sectores.set(e.sector, [...(sectores.get(e.sector) ?? []), e]);
        }
        const tablaSectores = [...sectores].map(([sector, lista]) => ({
            sector,
            empresas: lista.length,
            per: mediana(lista.map(e => e.per)),
            roe: mediana(lista.map(e => e.roe)),
            margenNeto: mediana(lista.map(e => e.margenNeto)),
            crecimiento: mediana(lista.map(e => e.crecimiento)),
            compra: lista.filter(e => e.decision === 'BUY').length,
        })).sort((a, b) => b.empresas - a.empresas);

        return {
            total,
            conPrecio: conteo(e => e.precio != null),
            valoradas,
            decisiones,
            perMediano: mediana(empresas.map(e => e.per)),
            roeMediano: mediana(empresas.map(e => e.roe)),
            cajaNeta: conteo(e => e.dfnEbitda != null && e.dfnEbitda < 0),
            conDfn: conteo(e => e.dfnEbitda != null),
            cobertura: COBERTURA.map(c => ({ ...c, n: conteo(e => e[c.k] != null) })),
            sectores: tablaSectores,
            sinSector: conteo(e => !conSector(e)),
            fechaDatos: empresas.reduce((max, e) => e.fechaPrecio > max ? e.fechaPrecio : max, ''),
            mayores: comparables(empresas, mercado).sort(porCapitalizacion).slice(0, TOP),
            compras: comparables(empresas.filter(e => e.decision === 'BUY'), mercado).sort(porCapitalizacion).slice(0, TOP),
        };
    }, [empresas, mercado]);

    const totalDecisiones = DECISIONES.reduce((n, d) => n + resumen.decisiones[d.k], 0);
    const nombreMercado = MERCADOS.find(([v]) => v === mercado)?.[1];

    return (
        <main className="cuerpo screener panel">
            <div className="contenedor">
                <div className="encabezado">
                    <div>
                        <p className="migas">MERCADOS / PANEL</p>
                        <h1>Panel de mercado</h1>
                        <p className="descripcion">Una vista general de la cobertura, las valoraciones y los sectores de G2EXCHANGE.</p>
                    </div>
                    <div className="estadoMercado">
                        <span className="punto"></span>
                        <div>
                            <p className="estado">{datos ? `${decimal(todas.length, 0)} empresas en base` : 'Cargando…'}</p>
                            <p className="cierre">{resumen.fechaDatos ? `Último cierre: ${fecha(resumen.fechaDatos)}` : 'Base de datos G2EXCHANGE'}</p>
                        </div>
                    </div>
                </div>

                {error && <p className="avisoError">No se pudieron cargar los datos: {error}</p>}

                <div className="barraMercado">
                    <div className="rangos" role="tablist" aria-label="Mercado">
                        {MERCADOS.map(([v, l]) => (
                            <button key={v} type="button" role="tab" aria-selected={mercado === v}
                                className={mercado === v ? 'activo' : ''} onClick={() => setMercado(v)}>
                                {l}
                            </button>
                        ))}
                    </div>
                    <Link to="/screener" className="boton">
                        <i className="fa-solid fa-filter"></i> Abrir screener
                    </Link>
                </div>

                <div className="metricas cuatro">
                    <Metrica cargando={!datos} etiqueta="EMPRESAS" cifra={datos ? decimal(resumen.total, 0) : '—'}
                        nota={`${decimal(resumen.conPrecio, 0)} con precio de cierre`} />
                    <Metrica cargando={!datos} etiqueta="VALORADAS POR EL MOTOR" cifra={datos ? decimal(resumen.valoradas, 0) : '—'}
                        nota={`${pct(proporcion(resumen.valoradas, resumen.total))} del universo`} />
                    <Metrica cargando={!datos} etiqueta="PER MEDIANO" cifra={resumen.perMediano == null ? '—' : `${decimal(resumen.perMediano, 1)}x`}
                        nota={mercado ? `Mercado: ${nombreMercado}` : 'Mezcla mercados: orientativo'} />
                    <Metrica cargando={!datos} etiqueta="ROE MEDIANO" cifra={resumen.roeMediano == null ? '—' : pct(resumen.roeMediano)}
                        nota={`${decimal(resumen.cajaNeta, 0)} de ${decimal(resumen.conDfn, 0)} con caja neta`} />
                </div>

                <div className="rejillaPanel">
                    <section className="tarjeta">
                        <div className="cabeceraTarjeta">
                            <div>
                                <p className="subtitulo">MOTOR DE VALORACIÓN</p>
                                <h4 className="titulo">Decisiones del escenario base</h4>
                            </div>
                        </div>
                        <div className="barraApilada" aria-hidden="true">
                            {DECISIONES.map(d => resumen.decisiones[d.k] > 0 && (
                                <div key={d.k} className={d.color}
                                    style={{ width: `${proporcion(resumen.decisiones[d.k], totalDecisiones)}%` }} />
                            ))}
                        </div>
                        <ul className="votos">
                            {DECISIONES.map(d => (
                                <li key={d.k}>
                                    <span className={`punto ${d.color}`}></span>
                                    {d.l} ({d.k})
                                    <span className="numero">
                                        {decimal(resumen.decisiones[d.k], 0)} · {pct(proporcion(resumen.decisiones[d.k], totalDecisiones), 0)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                        <p className="nota margen">
                            {decimal(resumen.total - totalDecisiones, 0)} empresas aún sin valoración completada.
                            Las valoraciones actuales tienen confianza baja y están pendientes de revisión.
                        </p>
                    </section>

                    <section className="tarjeta">
                        <div className="cabeceraTarjeta">
                            <div>
                                <p className="subtitulo">CALIDAD DE DATOS</p>
                                <h4 className="titulo">Cobertura por indicador</h4>
                            </div>
                        </div>
                        <div className="puntuaciones">
                            {resumen.cobertura.map(c => (
                                <div key={c.k}>
                                    <div className="puntuacionTexto">
                                        <span>{c.l}</span>
                                        <span className="numero">{pct(proporcion(c.n, resumen.total), 0)}</span>
                                    </div>
                                    <div className="barra"><div style={{ width: `${proporcion(c.n, resumen.total)}%` }} /></div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                <section className="tarjeta resultados">
                    <div className="cabeceraTarjeta">
                        <div>
                            <p className="subtitulo">SECTORES</p>
                            <h4 className="titulo">Medianas por sector{mercado ? ` · ${nombreMercado}` : ''}</h4>
                        </div>
                        <p className="nota">
                            {decimal(resumen.sectores.length, 0)} sectores
                            {resumen.sinSector > 0 && ` · ${decimal(resumen.sinSector, 0)} empresas sin sector asignado`}
                        </p>
                    </div>
                    {datos && resumen.sectores.length === 0 && <p className="vacio">No hay sectores asignados en este mercado.</p>}
                    {resumen.sectores.length > 0 && (
                        <div className="tablaScroll">
                            <table>
                                <thead>
                                    <tr>
                                        <th><span className="th">Sector</span></th>
                                        <th className="num"><span className="th">Empresas</span></th>
                                        <th className="num"><span className="th">PER</span></th>
                                        <th className="num"><span className="th">ROE</span></th>
                                        <th className="num"><span className="th">Margen neto</span></th>
                                        <th className="num"><span className="th">Crec. ingresos</span></th>
                                        <th className="num"><span className="th">Señales BUY</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {resumen.sectores.slice(0, todosSectores ? undefined : SECTORES_VISIBLES).map(s => (
                                        <tr key={s.sector} className="estatica">
                                            <td>{s.sector}</td>
                                            <td className="num">
                                                <span className="peso">
                                                    <span style={{ width: `${proporcion(s.empresas, resumen.sectores[0].empresas)}%` }} />
                                                </span>
                                                {decimal(s.empresas, 0)}
                                            </td>
                                            <td className="num">{s.per == null ? SIN_DATOS : `${decimal(s.per, 1)}x`}</td>
                                            <td className={`num ${signo(s.roe)}`}>{pct(s.roe)}</td>
                                            <td className={`num ${signo(s.margenNeto)}`}>{pct(s.margenNeto)}</td>
                                            <td className={`num ${signo(s.crecimiento)}`}>{pct(s.crecimiento)}</td>
                                            <td className="num">{decimal(s.compra, 0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {resumen.sectores.length > SECTORES_VISIBLES && (
                        <button type="button" className="verTodas" onClick={() => setTodosSectores(v => !v)}>
                            {todosSectores ? 'Ver menos' : `Ver los ${resumen.sectores.length} sectores`}
                            <i className={`fa-solid fa-chevron-${todosSectores ? 'up' : 'down'}`}></i>
                        </button>
                    )}
                </section>

                <div className="rejillaPanel">
                    <ListaEmpresas subtitulo="TAMAÑO" titulo="Mayores por capitalización" empresas={resumen.mayores}
                        vacio="Sin capitalizaciones coherentes en este mercado."
                        columna={e => <p className="nota">{conSector(e) ? e.sector : SIN_DATOS}</p>} />
                    <ListaEmpresas subtitulo="SEÑALES" titulo="Mayores empresas con señal BUY" empresas={resumen.compras}
                        vacio="Ninguna empresa con señal BUY y capitalización coherente."
                        columna={e => (
                            <p className={`nota ${signo(e.potencial)}`}>
                                Potencial {e.potencial == null ? SIN_DATOS : `${e.potencial > 0 ? '+' : ''}${decimal(e.potencial, 1)}%`}
                            </p>
                        )} />
                </div>

                <p className="aviso">
                    {!mercado && 'Con «Todos», las listas por capitalización solo incluyen cotizadas en USD. '}
                    Medianas calculadas sobre las empresas con dato disponible. Datos informativos, no constituyen una recomendación de inversión.
                </p>
            </div>
        </main>
    );
}
