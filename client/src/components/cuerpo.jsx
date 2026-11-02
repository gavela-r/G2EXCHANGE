import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import '../css/cuerpo.css';
import TradingViewWidget from './TradingViewWidget';

const API = '/api/landing';

const rangos = [
    { etiqueta: '1D', valor: '1D' },
    { etiqueta: '1S', valor: '5D' },
    { etiqueta: '1M', valor: '1M' },
    { etiqueta: '1A', valor: '12M' },
    { etiqueta: '5A', valor: '60M' },
];

// ---------------- Formato ----------------

const SIN_DATOS = 'Sin datos';

const decimal = (n, d = 2) =>
    new Intl.NumberFormat('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

const moneda = (n, codigo = 'USD') => n == null ? SIN_DATOS :
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: codigo || 'USD' }).format(n);

const porcentaje = (n, d = 2) => n == null ? SIN_DATOS : `${n > 0 ? '+' : ''}${decimal(n, d)}%`;

const fecha = (iso, opciones = { day: '2-digit', month: '2-digit', year: 'numeric' }) => iso == null ? SIN_DATOS :
    new Intl.DateTimeFormat('es-ES', { ...opciones, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

function importeGrande(n, codigo = 'USD') {
    if (n == null) return SIN_DATOS;
    if (n >= 1e12) return `${decimal(n / 1e12)} billones ${codigo}`;
    if (n >= 1e9) return `${decimal(n / 1e9, 1)} mil M ${codigo}`;
    if (n >= 1e6) return `${decimal(n / 1e6, 1)} M ${codigo}`;
    return `${decimal(n, 0)} ${codigo}`;
}

// En la BD muchos nombres están en mayúsculas (p. ej. "NVIDIA CORP")
function nombreLegible(nombre = '') {
    if (nombre !== nombre.toUpperCase()) return nombre;
    return nombre.toLowerCase().replace(/(^|[\s(&.-])(\p{L})/gu, (_, sep, letra) => sep + letra.toUpperCase());
}

function etiquetaFortaleza(total) {
    if (total == null) return SIN_DATOS;
    if (total >= 80) return 'Muy sólida';
    if (total >= 65) return 'Sólida';
    if (total >= 50) return 'Moderada';
    return 'Débil';
}

// Horario regular de NYSE/NASDAQ (no contempla festivos)
function estadoMercado(ahora = new Date()) {
    const partes = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    }).formatToParts(ahora).map(p => [p.type, p.value]));
    const minutos = Number(partes.hour) * 60 + Number(partes.minute);
    const laborable = !['Sat', 'Sun'].includes(partes.weekday);
    const apertura = 9 * 60 + 30, cierre = 16 * 60;
    if (laborable && minutos >= apertura && minutos < cierre) {
        const faltan = cierre - minutos;
        return { abierto: true, texto: `Cierra en ${Math.floor(faltan / 60)}h ${faltan % 60}min` };
    }
    return { abierto: false, texto: 'Horario: 15:30 – 22:00 (hora española)' };
}

async function pedir(url) {
    const respuesta = await fetch(url);
    const datos = await respuesta.json();
    if (!respuesta.ok || !datos.ok) throw new Error(datos.error ?? `HTTP ${respuesta.status}`);
    return datos;
}

// ---------------- Componentes ----------------

function Indicador({ valor }) {
    const radio = 44, circunferencia = 2 * Math.PI * radio;
    return (
        <div className="indicador">
            <svg viewBox="0 0 110 110">
                <circle cx="55" cy="55" r={radio} className="pista" />
                <circle cx="55" cy="55" r={radio} className="progreso"
                    strokeDasharray={circunferencia}
                    strokeDashoffset={circunferencia * (1 - (valor ?? 0) / 100)} />
            </svg>
            <div className="indicadorValor">{valor ?? '—'}<span>/100</span></div>
        </div>
    );
}

function FilaEmpresa({ empresa, activa, onClick }) {
    const nombre = nombreLegible(empresa.nombre);
    return (
        <button type="button" className={`fila ${activa ? 'activa' : ''}`} onClick={onClick}>
            <div className="caja">{nombre[0]}</div>
            <div className="informacion">
                <p className="nombre">{nombre}</p>
                <p className="nasdaq">{empresa.bolsa} · {empresa.ticker}</p>
            </div>
            <div className="precio">
                <p className="ticker">{moneda(empresa.precio, empresa.moneda)}</p>
                <p className="fechaFila">{fecha(empresa.fechaPrecio, { day: 'numeric', month: 'short' })}</p>
            </div>
        </button>
    );
}

export function Cuerpo(){
    const [watchlist, setWatchlist] = useState([]);
    const [empresa, setEmpresa] = useState(null);
    const [busqueda, setBusqueda] = useState('');
    const [resultados, setResultados] = useState([]);
    const [rango, setRango] = useState('12M');
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [mercado, setMercado] = useState(() => estadoMercado());

    useEffect(() => {
        pedir(`${API}/empresas`)
            .then(d => { setWatchlist(d.empresas); setEmpresa(d.empresas[0] ?? null); })
            .catch(e => setError(e.message))
            .finally(() => setCargando(false));
        const reloj = setInterval(() => setMercado(estadoMercado()), 60_000);
        return () => clearInterval(reloj);
    }, []);

    // Búsqueda en toda la base de datos, con una pequeña espera entre pulsaciones
    useEffect(() => {
        const texto = busqueda.trim();
        if (!texto) { setResultados([]); return; }
        const control = new AbortController();
        const espera = setTimeout(() => {
            fetch(`${API}/buscar?q=${encodeURIComponent(texto)}`, { signal: control.signal })
                .then(r => r.json())
                .then(d => setResultados(d.ok ? d.resultados : []))
                .catch(() => {});
        }, 250);
        return () => { clearTimeout(espera); control.abort(); };
    }, [busqueda]);

    async function seleccionar(id) {
        const enLista = watchlist.find(e => e.id === id);
        if (enLista) { setEmpresa(enLista); return; }
        try {
            const d = await pedir(`${API}/empresas/${id}`);
            setEmpresa(d.empresa);
            setBusqueda('');
        } catch (e) {
            setError(e.message);
        }
    }

    const filas = busqueda.trim() ? resultados : watchlist;
    const nombre = empresa ? nombreLegible(empresa.nombre) : '';
    const m = empresa?.metricas;
    const fortaleza = empresa?.fortaleza;
    const indicadores = fortaleza ? Object.values(fortaleza.puntuaciones).filter(v => v != null).length : 0;

    return (
        <>
            <main className="cuerpo">
                <div className="contenedor">
                    <div className="encabezado">
                        <div>
                            <p className="migas">MERCADOS / ACCIONES</p>
                            <h1>Radar de inversión</h1>
                            <p className="descripcion">Analiza oportunidades y toma decisiones con datos claros.</p>
                        </div>
                        <div className="estadoMercado">
                            <span className={`punto ${mercado.abierto ? '' : 'cerrado'}`}></span>
                            <div>
                                <p className="estado">{mercado.abierto ? 'Mercado abierto' : 'Mercado cerrado'}</p>
                                <p className="cierre">{mercado.texto}</p>
                            </div>
                        </div>
                    </div>

                    {error && <p className="avisoError">No se pudieron cargar los datos: {error}</p>}

                    <section className="principal">
                        <div className="left">
                            <div className="cabeceraTarjeta">
                                <div>
                                    <p className="subtitulo">WATCHLIST</p>
                                    <h4 className="titulo">Empresas destacadas</h4>
                                </div>
                                <button className="botonIcono" aria-label="Ver watchlist completa">
                                    <i className="fa-solid fa-chevron-right"></i>
                                </button>
                            </div>
                            <form className="buscador" onSubmit={e => e.preventDefault()}>
                                <i className="fa-solid fa-magnifying-glass lupa"></i>
                                <input type="text" className="buscar" placeholder="Buscar empresa o ticker"
                                    value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                            </form>
                            <div className="empresas">
                                <div className="cavecera">
                                    <p className="nombre">{busqueda.trim() ? 'RESULTADOS' : 'EMPRESA'}</p>
                                    <p className="ticker">ÚLTIMO CIERRE</p>
                                </div>
                                <div className="filas">
                                    {cargando && <p className="sinResultados">Cargando empresas…</p>}
                                    {filas.map(e => (
                                        <FilaEmpresa key={e.id} empresa={e} activa={e.id === empresa?.id}
                                            onClick={() => seleccionar(e.id)} />
                                    ))}
                                    {!cargando && busqueda.trim() && resultados.length === 0 && (
                                        <p className="sinResultados">No hay empresas que coincidan con “{busqueda}”.</p>
                                    )}
                                </div>
                                <Link to="/" className="verTodas">
                                    Ver todas las empresas <i className="fa-solid fa-arrow-right"></i>
                                </Link>
                            </div>
                        </div>

                        {empresa && (
                            <>
                                <div className="centro">
                                    <div className="nombreEmpresa">
                                        <div className="cajaEmpresa">
                                            <p className="inicialEmpresa">{nombre[0]}</p>
                                        </div>
                                        <div className="infoEmpresa">
                                            <h2 className="nombreCorporacion">
                                                {nombre} <i className="fa-solid fa-circle-check verificado"></i>
                                            </h2>
                                            <p className="nasdaq">{empresa.bolsa}: {empresa.ticker} · {empresa.sector ?? 'Sector sin clasificar'}</p>
                                        </div>
                                        <div className="precioEmpresa">
                                            <p className="precioActual">ÚLTIMO CIERRE</p>
                                            <h2 className="precio">{moneda(empresa.precio, empresa.moneda)}</h2>
                                            <p className="fechaCierre">{fecha(empresa.fechaPrecio)}</p>
                                        </div>
                                    </div>

                                    <div className="evolucionAccion">
                                        <div className="cabeceraTarjeta">
                                            <div>
                                                <p className="rendimiento">RENDIMIENTO</p>
                                                <h3 className="tituloEvolucion">Evolución de la acción</h3>
                                            </div>
                                            <div className="rangos">
                                                {rangos.map(r => (
                                                    <button key={r.valor} type="button"
                                                        className={r.valor === rango ? 'activo' : ''}
                                                        onClick={() => setRango(r.valor)}>{r.etiqueta}</button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="precioValor">
                                            <h2 className="precioAccion">{moneda(empresa.precio, empresa.moneda)}</h2>
                                            <p className="tiempo">Último cierre registrado · {fecha(empresa.fechaPrecio)}</p>
                                        </div>
                                        <div className="grafico">
                                            {empresa.simboloTradingView
                                                ? <TradingViewWidget key={`${empresa.simboloTradingView}-${rango}`}
                                                    symbol={empresa.simboloTradingView} range={rango} />
                                                : <p className="sinDatos">Gráfico no disponible para este mercado.</p>}
                                        </div>
                                    </div>

                                    <div className="metricas">
                                        <div className="metrica">
                                            <p className="etiqueta">CAPITALIZACIÓN</p>
                                            <p className="cifra">{importeGrande(m.capitalizacion, empresa.moneda)}</p>
                                            <p className="nota">
                                                {m.accionesEnCirculacion
                                                    ? `${decimal(m.accionesEnCirculacion / 1e6, 0)} M de acciones`
                                                    : 'Sin acciones en circulación'}
                                            </p>
                                        </div>
                                        <div className="metrica">
                                            <p className="etiqueta">PER</p>
                                            <p className="cifra">{m.per == null ? SIN_DATOS : decimal(m.per)}</p>
                                            <p className="nota">
                                                {m.epsDiluido == null ? 'Sin BPA disponible'
                                                    : `BPA diluido ${moneda(m.epsDiluido, empresa.moneda)}`}
                                            </p>
                                        </div>
                                        <div className="metrica">
                                            <p className="etiqueta">RENT. POR DIVIDENDO</p>
                                            <p className="cifra">{m.rentabilidadDividendo == null ? SIN_DATOS : `${decimal(m.rentabilidadDividendo)}%`}</p>
                                            <p className="nota">
                                                {m.rentabilidadDividendo == null ? 'Sin dividendos registrados'
                                                    : 'Dividendos pagados / capitalización'}
                                            </p>
                                        </div>
                                    </div>
                                    {empresa.informe && (
                                        <p className="fuente">
                                            Fuente: informe anual {empresa.informe.documento} cerrado el {fecha(empresa.informe.fechaFin)} y último cierre en base de datos.
                                        </p>
                                    )}
                                </div>

                                <div className="right">
                                    <div className="tarjeta fortaleza">
                                        <p className="subtitulo">ANÁLISIS G2EXCHANGE</p>
                                        <h4 className="titulo">Fortaleza financiera</h4>
                                        <Indicador valor={fortaleza.total} />
                                        <p className="fortalezaTexto">{etiquetaFortaleza(fortaleza.total)}</p>
                                        <p className="nota centrada">
                                            {indicadores ? `Media de ${indicadores} indicadores del último informe anual` : 'Sin informes anuales'}
                                        </p>
                                        <div className="puntuaciones">
                                            {Object.entries(fortaleza.puntuaciones).map(([clave, valor]) => (
                                                <div key={clave} className="puntuacion">
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
                                    </div>

                                    <div className="tarjeta consenso">
                                        <p className="subtitulo">CONSENSO DE ANALISTAS</p>
                                        <h3 className="recomendacion sinDatosTitulo">{SIN_DATOS}</h3>
                                        <p className="nota">No hay valoraciones de analistas en la base de datos.</p>
                                    </div>
                                    <p className="aviso">Datos informativos, no constituyen una recomendación de inversión.</p>
                                </div>
                            </>
                        )}
                    </section>
                </div>
            </main>
        </>
    )
}
