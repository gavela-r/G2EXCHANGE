import { Footer } from "./Footer";
import { Header } from "./header";
import { Outlet } from "react-router-dom";

export function Layout(){
    return (
        <>
            <Header />
            <Outlet />
            <Footer />
        </>
        
    )
}

export default Layout