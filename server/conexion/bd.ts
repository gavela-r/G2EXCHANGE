import {createPool} from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'node:path';

// Same configuration from source and dist, regardless of the caller's cwd.
dotenv.config({path: path.resolve(__dirname, __dirname.includes(`${path.sep}dist${path.sep}`) ? '../../../.env' : '../../.env')});
if (!process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME) {
    throw new Error('Configure DB_USER, DB_PASSWORD y DB_NAME en .env o en el entorno');
}

const conexion = createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: true,
    timezone: 'Z',
    port: Number(process.env.DB_PORT || 3307)
});

export default conexion;
