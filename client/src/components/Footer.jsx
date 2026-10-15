import { Link } from 'react-router-dom';
import '../css/footer.css';

export function Footer(){
    return (
        <>
            <footer>
                <div className='footer-left'>
                    <img src="../img/G2EXCHANGE.png" alt="logo" />
                    <p className='parrafo'>Informacion financiera clara para tomar decisiones con perspectiva.</p>
                    <p className='parrafo2'>© 2025 G2EXCHANGE. Todos los derechos reservados.</p>
                </div>

                <div className='footer-right'>
                    <div className='section'>
                        <h5 className='seccion'>Plataforma</h5>
                        <nav className='lista'>
                            <Link to='/' className='Panel'>Panel</Link>
                            <Link to='/' className='fichaEmpresa>'>Ficha Empresa</Link>
                            <Link to='/' className='screener'>Screener</Link>
                            <Link to='/' className='comparador'>Comparador</Link>
                        </nav>
                    </div>
                    <div className='section'>
                        <h5 className='seccion'>Legal</h5>
                        <nav className='lista'>
                            <Link to='/' className='privacidad'>Privacidad</Link>
                            <Link to='/' className='terminos'>Terminos</Link>
                            <Link to='/' className='legal'>Aviso legal</Link>
                        </nav>
                    </div>
                </div>

            </footer>
        </>
    )
}