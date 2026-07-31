import {createPool} from 'mysql2/promise';

const conexion = createPool({
    host: 'localhost',
    user: 'root',
    password: 'root',
    database: '2GB',
    port: 3307
});

export default conexion;