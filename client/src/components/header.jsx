import '../css/header.css';
import { Link, NavLink } from 'react-router-dom'


export function Header(){
    return (
        <>
            <header>
                <div className='header-left'>
                    <div className='logotipo'>
                        <Link to='/' className='inicio'><img src="../img/G2EXCHANGE.png" alt="logo" /></Link>   
                    </div>
                    <nav className='navbar'>
                        <NavLink to='/' end className='inicio'>Inicio</NavLink>
                        <NavLink to='/panel' className='panel'>Panel</NavLink>
                        <NavLink to='/ficha' className='fichaEmpresa'>Ficha empresa</NavLink>
                        <NavLink to='/screener' className='screener'>Screener</NavLink>
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
