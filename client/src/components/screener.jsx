import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../css/cuerpo.css';
import '../css/screener.css';
import { SIN_DATOS, decimal, fecha, nombreLegible } from '../formato';

const POR_PAGINA = 50;

const MERCADOS = [['', 'Todos'], ['US', 'Estados Unidos'], ['JP', 'Japón'], ['TW', 'Taiwán']];

// Filtros numéricos con operador; los porcentajes vienen ya en % desde la API
const NUMERICOS = [
    { k: 'roe', l: 'ROE (%)', op: '>' },
    { k: 'roa', l: 'ROA (%)', op: '>' },
    { k: 'margenNeto', l: 'Margen neto (%)', op: '>' },
    { k: 'margenFcf', l: 'Margen FCF (%)', op: '>' },
    { k: 'crecimiento', l: 'Crecimiento de ingresos (%)', op: '>' },
    { k: 'deudaEbitda', l: 'Deuda / EBITDA (veces)', op: '<' },
    { k: 'cobertura', l: 'Cobertura de intereses (veces)', op: '>' },
    { k: 'potencial', l: 'Potencial del motor (%)', op: '>' },
];

const PRESETS = [
    { l: 'Calidad a buen precio', num: { roe: '15', margenNeto: '10' }, perSector: 'inf' },
    { l: 'Alta rentabilidad', num: { roe: '20', roa: '10' } },
    { l: 'Caja generosa', num: { margenFcf: '15' } },
    { l: 'Crecimiento', num: { crecimiento: '15', margenNeto: '0' } },
];

const COLUMNAS = [
    { k: 'nombre', l: 'Compañía', texto: true },
    { k: 'sector', l: 'Sector', texto: true },
    { k: 'capitalizacion', l: 'Capitalización' },
    { k: 'precio', l: 'Precio' },
    { k: 'per', l: 'PER' },
    { k: 'perRelativo', l: 'PER / sector' },
    { k: 'roe', l: 'ROE' },
    { k: 'roa', l: 'ROA' },
    { k: 'margenFcf', l: 'Margen FCF' },
    { k: 'deudaEbitda', l: 'Deuda / EBITDA' },
    { k: 'crecimiento', l: 'Crec. ingresos' },
    { k: 'potencial', l: 'Potencial' },
    { k: 'decision', l: 'Decisión', texto: true },
];

const filtrosVacios = () => ({
    texto: '', mercado: 'US', sector: '', tamano: '', perMercado: '', perSector: '', decision: '', confianza: '',
    num: Object.fromEntries(NUMERICOS.map(x => [x.k, { op: x.op, v: '' }])),
});

const tamano = (e) => {
    if (e.moneda !== 'USD' || e.capitalizacion == null) return null;
    const milM = e.capitalizacion / 1e9;
    return milM >= 200 ? 'mega' : milM >= 10 ? 'grande' : milM >= 2 ? 'mediana' : 'pequena';
};

function capCorta(n, codigo) {
    if (n == null) return VACIO;
    if (n >= 1e12) return `${decimal(n / 1e12)} bill. ${codigo}`;
    if (n >= 1e9) return `${decimal(n / 1e9, 1)} mil M ${codigo}`;
    return `${decimal(n / 1e6, 0)} M ${codigo}`;
}

// En la tabla los huecos se muestran atenuados para no competir con las cifras
const VACIO = <span className="vacioCelda">{SIN_DATOS}</span>;

const pct = (n, d = 1) => n == null ? VACIO : `${decimal(n, d)}%`;
const veces = (n) => n == null ? VACIO : `${decimal(n, 1)}x`;
const signo = (n) => n == null ? '' : n >= 0 ? 'pos' : 'neg';

function descargarCsv(filas) {
    const columnas = ['ticker', 'nombre', 'mercado', 'sector', 'moneda', 'precio', 'capitalizacion', 'per', 'per_sector',
        'roe', 'roa', 'margen_neto', 'margen_fcf', 'deuda_ebitda', 'crecimiento_ingresos', 'potencial', 'decision', 'confianza'];
    const celda = (v) => v == null ? '' : typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v;
    const lineas = filas.map(e => [e.ticker, e.nombre, e.mercado, e.sector, e.moneda, e.precio, e.capitalizacion, e.per,
        e.perSectorMediana, e.roe, e.roa, e.margenNeto, e.margenFcf, e.deudaEbitda, e.crecimiento, e.potencial,
        e.decision, e.confianza].map(celda).join(','));
    const url = URL.createObjectURL(new Blob([[columnas.join(','), ...lineas].join('\n')], { type: 'text/csv' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'screener-g2exchange.csv';
    enlace.click();
    URL.revokeObjectURL(url);
}

function Decision({ e }) {
    if (!e.decision) return VACIO;
    return (
        <span className={`insignia ${e.decision}`}
            title={`Confianza ${e.confianza ?? '—'} · validación ${e.validacion ?? '—'}`}>
            {e.decision}
        </span>
    );
}

export function Screener() {
    const navegar = useNavigate();
    const [datos, setDatos] = useState(null);
    const [error, setError] = useState('');
    const [f, setF] = useState(filtrosVacios);
    const [orden, setOrden] = useState({ k: 'capitalizacion', asc: false });
    const [pagina, setPagina] = useState(0);

    useEffect(() => {
        fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/landing/screener`)
            .then(r => r.json())
            .then(d => d.ok ? setDatos(d) : setError(d.error))
            .catch(e => setError(e.message));
    }, []);

    // Enriquecemos cada empresa con la mediana de PER de su sector (en su mismo mercado) y de su mercado
    const empresas = useMemo(() => !datos ? [] : datos.empresas.map(e => {
        const perSectorMediana = datos.medianaPerSector[`${e.mercado}|${e.sector}`] ?? null;
        return {
            ...e,
            perSectorMediana,
            perMercadoMediana: datos.medianaPerMercado[e.mercado] ?? null,
            perRelativo: e.per != null && perSectorMediana ? Math.round(e.per / perSectorMediana * 100) / 100 : null,
        };
    }), [datos]);

    const sectores = useMemo(() => [...new Set(empresas.map(e => e.sector).filter(Boolean))].sort(), [empresas]);
    const fechaDatos = useMemo(() => empresas.reduce((max, e) => e.fechaPrecio > max ? e.fechaPrecio : max, ''), [empresas]);

    const resultados = useMemo(() => {
        const texto = f.texto.trim().toLowerCase();
        const filtradas = empresas.filter(e => {
            if (texto && !`${e.nombre} ${e.ticker}`.toLowerCase().includes(texto)) return false;
            if (f.mercado && e.mercado !== f.mercado) return false;
            if (f.sector && e.sector !== f.sector) return false;
            if (f.tamano && tamano(e) !== f.tamano) return false;
            if (f.decision && e.decision !== f.decision) return false;
            if (f.confianza && e.confianza !== f.confianza) return false;
            if (f.perMercado) {
                if (e.per == null || !e.perMercadoMediana) return false;
                const r = e.per / e.perMercadoMediana;
                if (f.perMercado === 'mayor' && r <= 1) return false;
                if (f.perMercado === 'menor' && r >= 1) return false;
                if (f.perMercado === 'igual' && Math.abs(r - 1) > 0.1) return false;
            }
            if (f.perSector) {
                if (e.perRelativo == null) return false;
                if (f.perSector === 'inf' && e.perRelativo > 1) return false;
                if (f.perSector === 'sup' && e.perRelativo <= 1) return false;
            }
            return NUMERICOS.every(({ k }) => {
                const { op, v } = f.num[k];
                if (v === '' || isNaN(Number(v.replace(',', '.')))) return true;
                const limite = Number(v.replace(',', '.'));
                if (e[k] == null) return false;
                return op === '<' ? e[k] < limite : e[k] > limite;
            });
        });
        // Los datos vacíos siempre al final, se ordene como se ordene
        return filtradas.sort((a, b) => {
            const x = a[orden.k], y = b[orden.k];
            if (x == null && y == null) return 0;
            if (x == null) return 1;
            if (y == null) return -1;
            const c = typeof x === 'string' ? x.localeCompare(y, 'es') : x - y;
            return orden.asc ? c : -c;
        });
    }, [empresas, f, orden]);

    useEffect(() => setPagina(0), [f, orden]);

    const paginas = Math.max(1, Math.ceil(resultados.length / POR_PAGINA));
    const visibles = resultados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);

    const cambiar = (campo, valor) => setF(o => ({ ...o, [campo]: valor }));
    const cambiarNum = (k, parte) => setF(o => ({ ...o, num: { ...o.num, [k]: { ...o.num[k], ...parte } } }));
    const aplicarPreset = (p) => {
        const base = filtrosVacios();
        setF({
            ...base, mercado: f.mercado, perSector: p.perSector ?? '',
            num: Object.fromEntries(NUMERICOS.map(x => [x.k, { op: x.op, v: p.num[x.k] ?? '' }])),
        });
    };
    const ordenarPor = (k) => setOrden(o => ({ k, asc: o.k === k ? !o.asc : COLUMNAS.find(c => c.k === k)?.texto ?? false }));

    return (
        <main className="cuerpo screener">
            <div className="contenedor">
                <div className="encabezado">
                    <div>
                        <p className="migas">MERCADOS / SCREENER</p>
                        <h1>Screener</h1>
                        <p className="descripcion">Filtra empresas por valoración, rentabilidad y riesgo con los datos de G2EXCHANGE.</p>
                    </div>
                    <div className="estadoMercado">
                        <span className="punto"></span>
                        <div>
                            <p className="estado">{datos ? `${decimal(empresas.length, 0)} empresas` : 'Cargando…'}</p>
                            <p className="cierre">{fechaDatos ? `Último cierre: ${fecha(fechaDatos)}` : 'Base de datos G2EXCHANGE'}</p>
                        </div>
                    </div>
                </div>

                {error && <p className="avisoError">No se pudieron cargar los datos: {error}</p>}

                <section className="tarjeta filtros">
                    <div className="cabeceraTarjeta">
                        <div>
                            <p className="subtitulo">FILTROS</p>
                            <h4 className="titulo">Encuentra empresas</h4>
                        </div>
                        <div className="acciones">
                            {PRESETS.map(p => (
                                <button key={p.l} type="button" className="boton" onClick={() => aplicarPreset(p)}>{p.l}</button>
                            ))}
                            <button type="button" className="boton" onClick={() => setF(filtrosVacios())}>
                                <i className="fa-solid fa-rotate-left"></i> Limpiar
                            </button>
                        </div>
                    </div>

                    <div className="rejillaFiltros">
                        <label className="ancho">
                            Buscar
                            <span className="campoBusqueda">
                                <i className="fa-solid fa-magnifying-glass"></i>
                                <input type="text" placeholder="Nombre o ticker" value={f.texto}
                                    onChange={e => cambiar('texto', e.target.value)} />
                            </span>
                        </label>
                        <label>
                            Mercado
                            <select value={f.mercado} onChange={e => cambiar('mercado', e.target.value)}>
                                {MERCADOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                        </label>
                        <label>
                            Sector
                            <select value={f.sector} onChange={e => cambiar('sector', e.target.value)}>
                                <option value="">Todos los sectores</option>
                                {sectores.map(s => <option key={s}>{s}</option>)}
                            </select>
                        </label>
                        <label>
                            Tamaño (solo USD)
                            <select value={f.tamano} onChange={e => cambiar('tamano', e.target.value)}>
                                <option value="">Todos</option>
                                <option value="mega">Mega (más de 200 mil M $)</option>
                                <option value="grande">Grande (10 a 200 mil M $)</option>
                                <option value="mediana">Mediana (2 a 10 mil M $)</option>
                                <option value="pequena">Pequeña (menos de 2 mil M $)</option>
                            </select>
                        </label>
                        <label>
                            PER frente al mercado
                            <select value={f.perMercado} onChange={e => cambiar('perMercado', e.target.value)}>
                                <option value="">Sin filtro</option>
                                <option value="menor">Menor que la mediana</option>
                                <option value="mayor">Mayor que la mediana</option>
                                <option value="igual">Similar (±10 %)</option>
                            </select>
                        </label>
                        <label>
                            PER frente al sector
                            <select value={f.perSector} onChange={e => cambiar('perSector', e.target.value)}>
                                <option value="">Sin filtro</option>
                                <option value="inf">Inferior o igual al sector</option>
                                <option value="sup">Superior al sector</option>
                            </select>
                        </label>
                        <label>
                            Decisión del motor
                            <select value={f.decision} onChange={e => cambiar('decision', e.target.value)}>
                                <option value="">Todas</option>
                                <option>BUY</option>
                                <option>WATCH</option>
                                <option>WAIT</option>
                                <option>DATA_PENDING</option>
                            </select>
                        </label>
                        <label>
                            Confianza
                            <select value={f.confianza} onChange={e => cambiar('confianza', e.target.value)}>
                                <option value="">Todas</option>
                                <option>HIGH</option>
                                <option>MEDIUM</option>
                                <option>LOW</option>
                            </select>
                        </label>
                        {NUMERICOS.map(x => (
                            <label key={x.k}>
                                {x.l}
                                <span className="operador">
                                    <select value={f.num[x.k].op} aria-label="Operador"
                                        onChange={e => cambiarNum(x.k, { op: e.target.value })}>
                                        <option value=">">Mayor que</option>
                                        <option value="<">Menor que</option>
                                    </select>
                                    <input inputMode="decimal" placeholder="valor" value={f.num[x.k].v}
                                        onChange={e => cambiarNum(x.k, { v: e.target.value })} />
                                </span>
                            </label>
                        ))}
                    </div>
                    <p className="nota">
                        Los filtros vacíos no se aplican. Si un filtro está activo, se excluyen las empresas sin ese dato.
                        Medianas de PER: {datos ? Object.entries(datos.medianaPerMercado).map(([m, v]) => `${m} ${decimal(v, 1)}`).join(' · ') : '—'}.
                    </p>
                </section>

                <section className="tarjeta resultados">
                    <div className="cabeceraTarjeta">
                        <div>
                            <p className="subtitulo">RESULTADOS</p>
                            <h4 className="titulo">
                                {datos ? `${decimal(resultados.length, 0)} de ${decimal(empresas.length, 0)} empresas` : 'Cargando empresas…'}
                            </h4>
                        </div>
                        <button type="button" className="boton" disabled={!resultados.length}
                            onClick={() => descargarCsv(resultados)}>
                            <i className="fa-solid fa-download"></i> Exportar CSV
                        </button>
                    </div>

                    {datos && resultados.length === 0 && (
                        <p className="vacio">Ninguna empresa cumple todos los filtros. Relaja alguno o pulsa Limpiar.</p>
                    )}

                    {resultados.length > 0 && (
                        <div className="tablaScroll">
                            <table>
                                <thead>
                                    <tr>
                                        {COLUMNAS.map(c => (
                                            <th key={c.k} className={c.texto ? '' : 'num'}>
                                                <button type="button" onClick={() => ordenarPor(c.k)}>
                                                    {c.l}
                                                    {orden.k === c.k && <i className={`fa-solid fa-caret-${orden.asc ? 'up' : 'down'}`}></i>}
                                                </button>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibles.map(e => (
                                        <tr key={e.id} tabIndex={0}
                                            onClick={() => navegar(`/?empresa=${e.id}`)}
                                            onKeyDown={k => k.key === 'Enter' && navegar(`/?empresa=${e.id}`)}>
                                            <td>
                                                <div className="compania">
                                                    <span className="caja">{nombreLegible(e.nombre)[0]}</span>
                                                    <div>
                                                        <p className="nombre">{nombreLegible(e.nombre)}</p>
                                                        <p className="nota">{e.bolsa} · {e.ticker}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="sector">{e.sector ?? VACIO}</td>
                                            <td className="num">{capCorta(e.capitalizacion, e.moneda)}</td>
                                            <td className="num">{e.precio == null ? VACIO : `${decimal(e.precio)} ${e.moneda}`}</td>
                                            <td className="num">{e.per == null ? VACIO : decimal(e.per, 1)}</td>
                                            <td className={`num ${e.perRelativo == null ? '' : e.perRelativo <= 1 ? 'pos' : 'neg'}`}>
                                                {e.perRelativo == null ? VACIO : `${decimal(e.perRelativo)}x`}
                                            </td>
                                            <td className={`num ${signo(e.roe)}`}>{pct(e.roe)}</td>
                                            <td className={`num ${signo(e.roa)}`}>{pct(e.roa)}</td>
                                            <td className={`num ${signo(e.margenFcf)}`}>{pct(e.margenFcf)}</td>
                                            <td className="num">{veces(e.deudaEbitda)}</td>
                                            <td className={`num ${signo(e.crecimiento)}`}>{pct(e.crecimiento)}</td>
                                            <td className={`num ${signo(e.potencial)}`}>{pct(e.potencial)}</td>
                                            <td><Decision e={e} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {paginas > 1 && (
                        <div className="paginacion">
                            <button type="button" className="boton" disabled={pagina === 0} onClick={() => setPagina(p => p - 1)}>
                                <i className="fa-solid fa-chevron-left"></i> Anterior
                            </button>
                            <span className="nota">Página {pagina + 1} de {paginas}</span>
                            <button type="button" className="boton" disabled={pagina >= paginas - 1} onClick={() => setPagina(p => p + 1)}>
                                Siguiente <i className="fa-solid fa-chevron-right"></i>
                            </button>
                        </div>
                    )}
                </section>
                <p className="aviso">
                    Datos del último informe anual y del último cierre registrado. Capitalización y PER solo se muestran
                    cuando acciones, beneficio y BPA son coherentes. Datos informativos, no constituyen una recomendación de inversión.
                </p>
            </div>
        </main>
    );
}
