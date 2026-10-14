import { Request, Response } from 'express';
import { RowDataPacket } from 'mysql2/promise';
import bd from '../../conexion/bd';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

interface UsuarioRow extends RowDataPacket {
    id: number,
    nombre: string,
    telefono: number,
    DNI: string,
    contrasena: string,
    fecha_alta: Date,
    rol: string,
}

async function loginUsuario(_req: Request, _res:Response): Promise<Response | void>{
    const { nombre, pass} = _req.body;
    
    if(!nombre || !pass){
        return _res.status(400).json({Error: 'Campos vacios'});
        
    }

    try{
        const sql = 'SELECT * FROM usuarios WHERE nombre = ?';
        const [rows] = await bd.query<UsuarioRow[]>(sql, [nombre]);

        if(rows.length === 0){
            return _res.status(401).json({Error: 'Credenciales incorrectas'});
        }

        const fila = rows[0];
        const passConfirm = await bcrypt.compare(pass, fila.contrasena);
        const clave = process.env.JWT_SECRET;

        if(!passConfirm){
            return _res.status(401).json({Error: 'Contraseña incorrecta'});
        }

        if(!clave){
            return _res.status(500).json({Error: 'Error en el servidor'});
        }

        const token = jwt.sign(
            {id: fila.id, nombre: fila.nombre, rol: fila.rol},
            clave,
            {expiresIn: '1h'}
        )

        return _res.status(200).json({Token: token});
    }catch(err){
        return _res.status(500).json({Error: 'Error en el servidor'});
        
    }
}


export {loginUsuario}; 