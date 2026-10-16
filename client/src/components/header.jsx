import '../css/header.css';
import { Link } from 'react-router-dom'


export function Header(){
    return (
        <>
            <header>
                <div className='header-left'>
                    <div className='logotipo'>
                        <Link to='/' className='inicio'><img src="../img/G2EXCHANGE.png" alt="logo" /></Link>   
                    </div>
                    <nav className='navbar'>
                        <Link to='/' className='inicio'>Inicio</Link>
                        <Link to='/' className='panel'>Panel</Link>
                        <Link to='/' className='fichaEmpresa'>Ficha empresa</Link>
                        <Link to='/' className='screener'>Screener</Link>
                        <Link to='/' className='comparador'>Comarador</Link>
                    </nav>
                </div>
            
                <div className='header-right'>
                    <div className='notificaciones'>
                        <i className="fa-regular fa-bell bell"></i> 
                    </div>
                    <div className='cartera'>
                        <i className="fa-solid fa-briefcase bag"></i>Mi Cartera
                    </div>
                    <div className='userName'>
                        U
                    </div>
                </div>
            </header>
        </>
    )
}
