import { useEffect } from "react";
import { Footer } from "./Footer";
import { Header } from "./header";
import { Outlet, useLocation } from "react-router-dom";

export function Layout(){
    const { pathname, search } = useLocation();

    // Cada cambio de página empieza arriba (p. ej. al abrir una ficha desde el screener)
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname, search]);

    return (
        <>
            <Header />
            <Outlet />
            <Footer />
        </>

    )
}

export default Layout
