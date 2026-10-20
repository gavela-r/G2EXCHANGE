import '../css/cuerpo.css';
import TradingViewWidget from './TradingViewWidget';

export function Cuerpo(){
    return (
        <>
            <main className="cuerpo">
                <p>Mercados / Acciones</p>
                <h1>Panel de Inversion</h1>
                <p className="descripcion">Analiza oportunidades y toma decisiones con datos claros</p>
                <section className="principal">
                    <div className="left">
                        <p className="subtitulo">WATCHLIST</p>
                        <h4 className="titulo">Empresas destacadas</h4>
                        <form action="" className="buscador">
                            <i className="fa-solid fa-magnifying-glass lupa"></i>
                            <input type="text" className="buscar" placeholder="  Buscar empresa o ticker"/>
                        </form>
                        <div className="empresas">
                            <div className="cavecera">
                                <p className="nombre">EMPRESA</p>
                                <p className="ticker">PRECIO/HOY</p>
                            </div>
                            <div className="filas">
                                <div className="fila">
                                    <div className="caja">N</div>
                                    <div className="informacion">
                                        <p className="nombre">NVIDIA Corporation</p>
                                        <p className="nasdaq">NASDAQ NVIDIA</p>
                                    </div>
                                    <div className="precio">
                                        <p className="ticker">$139.40</p>
                                        <p className="valor">+4.82%</p>
                                    </div>
                                </div>
                                <div className="fila">
                                    <div className="caja">A</div>
                                    <div className="informacion">
                                        <p className="nombre">Microsoft Corp.</p>
                                        <p className="nasdaq">NASDAQ MSFT</p>
                                    </div>
                                    <div className="precio">
                                        <p className="ticker">$418.79</p>
                                        <p className="valor">+1.24%</p>
                                    </div>
                                </div>
                                <div className="fila">
                                    <div className="caja">A</div>
                                    <div className="informacion">
                                        <p className="nombre">Amazon.com Inc.</p>
                                        <p className="nasdaq">NASDAQ AMZN</p>
                                    </div>
                                    <div className="precio">
                                        <p className="ticker">$211.48</p>
                                        <p className="valor">+0.61%</p>
                                    </div>
                                </div>
                                <div className="fila">
                                    <div className="caja">T</div>
                                    <div className="informacion">
                                        <p className="nombre">Tesla Inc.</p>
                                        <p className="nasdaq">NASDAQ TSLA</p>
                                    </div>
                                    <div className="precio">
                                        <p className="ticker">$24898</p>
                                        <p className="valor">-1.73%</p>
                                    </div>
                                </div>
                                <div className="fila">
                                    <div className="caja">J</div>
                                    <div className="informacion">
                                        <p className="nombre">JPMorgan Chase</p>
                                        <p className="nasdaq">NASDAQ JPM</p>
                                    </div>
                                    <div className="precio">
                                        <p className="ticker">$243.03</p>
                                        <p className="valor">+0.94%</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="centro">
                        <div className="nombreEmpresa">
                            <div className="cajaEmpresa">
                                <p className="inicialEmpresa">N</p>
                                </div>
                            <div className="infoEmpresa">
                                <h1 className="nombreCorporacion">NVIDIA Corporation</h1>
                                <p className="nasdaq">NASDAQ NVDA - Semiconductores</p>
                            </div>
                            <div className="precioEmpresa">
                                <p className="precioActual">PRECIO ACTUAL</p>
                                <h2 className="precio">$139.40</h2>
                                <p className="valor">+4.82% hoy</p>
                            </div>
                        </div>
                        <div className="evolucionAccion">
                            <p className="rendimiento">RENDIMIENTO</p>
                            <h2 className="tituloEvolucion">EVOLUCION ACCION</h2>
                            <div className="precioValor">
                                <h2 className="precioAccion">$139.40 </h2>
                                <span className='valor'>+$47.12(51.06%)</span>
                                <p className="tiempo">Ultimos 12 meses</p>
                            </div>
                            <div className="grafico">
                                <div className="grafico" style={{width: "100%", height: "500px"}}>
                                    <TradingViewWidget />
                                </div>
                            </div>
                            
                            
                        </div>
                    </div>
                </section>
            </main>
        </>
    )
}  