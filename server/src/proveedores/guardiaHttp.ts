// Guardián HTTP compartido entre procesos para proveedores externos con cuotas o bloqueos de IP.
//
// Todo el estado (ventana de peticiones, circuito, fallos permanentes) vive en un archivo JSON por proveedor,
// protegido por un lock de archivo, para que varios trabajadores y procesos respeten el MISMO límite global y
// lo conserven entre reinicios. Reglas:
//  - Límite global por hora (y separación mínima entre peticiones) reservado antes de enviar.
//  - 400/401/402/404: nunca se reintentan; la petición queda memorizada como fallo permanente (deduplicación) y
//    no vuelve a enviarse hasta que caduque la memoria. 402 además abre el circuito (cuota agotada): no se cambia
//    de token ni de cuenta.
//  - 403 identificado como bloqueo de IP: circuito abierto al menos `pausaBloqueoIpMs` (35 min por defecto).
//  - 429: respeta Retry-After (segundos o fecha HTTP); sin cabecera, `pausa429Ms`.
//  - 5xx, timeouts y errores de red: backoff exponencial limitado; tras `umbralCircuito` fallos seguidos, circuito.
//  - Las peticiones idénticas en curso se comparten (sin duplicados).
// Los secretos nunca se escriben en el estado, en los errores ni en los logs: la clave de deduplicación se calcula
// sobre la URL sin parámetros sensibles y cualquier texto de error se redacta.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface PoliticaProveedor {
    proveedor: string;
    maxPorHora: number;
    separacionMinimaMs?: number;
    pausaBloqueoIpMs: number;
    pausa429Ms: number;
    pausaCuotaMs: number;
    maxReintentosTransitorios: number;
    backoffBaseMs: number;
    backoffMaxMs: number;
    umbralCircuito: number;
    pausaCircuitoMs: number;
    memoriaPermanenteMs: number;
    timeoutMs: number;
    esBloqueoIp(status: number, cuerpo: string): boolean;
    estadoEnCuerpo?(cuerpo: string): number | null;
}

export interface EstadoProveedor {
    proveedor: string;
    peticiones: number[];
    circuito: { abiertoHasta: number; motivo: string | null; desde: number | null };
    fallosConsecutivos: number;
    permanentes: Record<string, { status: number; en: number }>;
    totales: Record<string, number>;
    actualizado: number;
}

export interface Dependencias {
    ahora(): number;
    dormir(ms: number): Promise<void>;
    fetch(url: string, init: RequestInit & { signal?: AbortSignal }): Promise<Response>;
}

export class ErrorProveedor extends Error {
    constructor(public codigo: string, mensaje: string, public status: number | null = null, public reanudarEn: number | null = null) {
        super(mensaje);
        this.name = "ErrorProveedor";
    }
}

const PARAMETROS_SENSIBLES = /^(token|apikey|api_key|api-key|key|access_token|subscription-key)$/i;

export function urlSinSecretos(url: string): string {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (PARAMETROS_SENSIBLES.test(k)) u.searchParams.set(k, "***");
    return u.toString();
}

export function redactar(texto: string, secretos: string[]): string {
    let t = texto;
    for (const s of secretos) if (s && s.length >= 6) t = t.split(s).join("***");
    return t.replace(/(token|apikey|api_key|key)=([^&\s"']+)/gi, "$1=***");
}

export function retryAfterMs(valor: string | null, ahora: number): number | null {
    if (!valor) return null;
    const s = Number(valor.trim());
    if (Number.isFinite(s) && s >= 0) return Math.round(s * 1000);
    const fecha = Date.parse(valor);
    return Number.isFinite(fecha) ? Math.max(0, fecha - ahora) : null;
}

const HORA = 3600000;

export class GuardiaProveedor {
    private archivo: string;
    private lock: string;
    private enCurso = new Map<string, Promise<unknown>>();
    private dep: Dependencias;

    constructor(public politica: PoliticaProveedor, directorio: string, private secretos: string[] = [], dep?: Partial<Dependencias>) {
        fs.mkdirSync(directorio, { recursive: true });
        this.archivo = path.join(directorio, `${politica.proveedor}.json`);
        this.lock = this.archivo + ".lock";
        this.dep = {
            ahora: dep?.ahora ?? (() => Date.now()),
            dormir: dep?.dormir ?? (ms => new Promise(r => setTimeout(r, ms))),
            fetch: dep?.fetch ?? ((url, init) => fetch(url, init))
        };
    }

    estado(): EstadoProveedor {
        try {
            return JSON.parse(fs.readFileSync(this.archivo, "utf8"));
        } catch (e: any) {
            if (e.code !== "ENOENT") throw e;
            return { proveedor: this.politica.proveedor, peticiones: [], circuito: { abiertoHasta: 0, motivo: null, desde: null }, fallosConsecutivos: 0, permanentes: {}, totales: {}, actualizado: 0 };
        }
    }

    private escribir(e: EstadoProveedor) {
        e.actualizado = this.dep.ahora();
        const tmp = `${this.archivo}.${process.pid}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(e));
        fs.renameSync(tmp, this.archivo);
    }

    // Lock de archivo exclusivo (O_EXCL). Un lock de más de 30 s se considera huérfano.
    private async conLock<T>(fn: (e: EstadoProveedor) => T): Promise<T> {
        for (let i = 0; ; i++) {
            try {
                const fd = fs.openSync(this.lock, "wx");
                fs.writeSync(fd, String(process.pid));
                fs.closeSync(fd);
                break;
            } catch (e: any) {
                if (e.code !== "EEXIST") throw e;
                try {
                    if (Date.now() - fs.statSync(this.lock).mtimeMs > 30000) fs.rmSync(this.lock, { force: true });
                } catch { /* otro proceso lo liberó */ }
                if (i > 2000) throw new ErrorProveedor("LOCK_NO_DISPONIBLE", `No se pudo obtener el lock de ${this.politica.proveedor}`);
                await new Promise(r => setTimeout(r, 15));
            }
        }
        try {
            const e = this.estado();
            const r = fn(e);
            this.escribir(e);
            return r;
        } finally {
            fs.rmSync(this.lock, { force: true });
        }
    }

    private contar(e: EstadoProveedor, clave: string) {
        e.totales[clave] = (e.totales[clave] ?? 0) + 1;
    }

    private abrirCircuito(e: EstadoProveedor, hasta: number, motivo: string) {
        if (hasta > e.circuito.abiertoHasta) e.circuito = { abiertoHasta: hasta, motivo, desde: this.dep.ahora() };
    }

    // Reserva un hueco dentro del límite global. Devuelve la espera necesaria (0 = reservado).
    private async reservar(clave: string): Promise<number> {
        const p = this.politica;
        return this.conLock(e => {
            const ahora = this.dep.ahora();
            e.peticiones = e.peticiones.filter(t => t > ahora - HORA);
            const perm = e.permanentes[clave];
            if (perm && ahora - perm.en < p.memoriaPermanenteMs) {
                this.contar(e, "deduplicadas_permanentes");
                throw new ErrorProveedor("FALLO_PERMANENTE_MEMORIZADO", `Petición ya rechazada con HTTP ${perm.status}; no se repite`, perm.status);
            }
            if (e.circuito.abiertoHasta > ahora) return e.circuito.abiertoHasta - ahora;
            const separacion = p.separacionMinimaMs ?? Math.ceil(HORA / p.maxPorHora);
            const ultima = e.peticiones.length ? e.peticiones[e.peticiones.length - 1] : 0;
            if (e.peticiones.length >= p.maxPorHora) return e.peticiones[e.peticiones.length - p.maxPorHora] + HORA - ahora + 1;
            if (ultima && ahora - ultima < separacion) return separacion - (ahora - ultima);
            e.peticiones.push(ahora);
            this.contar(e, "enviadas");
            return 0;
        });
    }

    /**
     * Ejecuta una petición respetando la política. `esperaMaximaMs` limita cuánto puede esperar dentro de la llamada
     * (cuota, separación o circuito); si la espera es mayor lanza CIRCUITO_ABIERTO/LIMITE_GLOBAL con `reanudarEn`,
     * para que el trabajador guarde su checkpoint y se detenga en lugar de bloquearse.
     */
    async solicitar(url: string, init: RequestInit = {}, opciones: { esperaMaximaMs?: number } = {}): Promise<{ status: number; texto: string; cabeceras: Headers }> {
        const clave = crypto.createHash("sha256").update((init.method ?? "GET") + " " + urlSinSecretos(url) + " " + String(init.body ?? "")).digest("hex");
        const existente = this.enCurso.get(clave);
        if (existente) return existente as Promise<{ status: number; texto: string; cabeceras: Headers }>;
        const promesa = this.ejecutar(url, init, clave, opciones.esperaMaximaMs ?? 2 * HORA).finally(() => this.enCurso.delete(clave));
        this.enCurso.set(clave, promesa);
        return promesa;
    }

    private async ejecutar(url: string, init: RequestInit, clave: string, esperaMaximaMs: number) {
        const p = this.politica, seguro = urlSinSecretos(url);
        for (let intento = 0; ; intento++) {
            for (;;) {
                const espera = await this.reservar(clave);
                if (espera === 0) break;
                const e = this.estado();
                const abierto = e.circuito.abiertoHasta > this.dep.ahora();
                if (espera > esperaMaximaMs)
                    throw new ErrorProveedor(abierto ? "CIRCUITO_ABIERTO" : "LIMITE_GLOBAL", `${p.proveedor}: ${abierto ? "circuito abierto (" + e.circuito.motivo + ")" : "límite global alcanzado"}; reanudar en ${Math.ceil(espera / 1000)} s`, null, this.dep.ahora() + espera);
                await this.dep.dormir(espera);
            }
            let respuesta: Response;
            const controlador = new AbortController();
            const temporizador = setTimeout(() => controlador.abort(), p.timeoutMs);
            try {
                respuesta = await this.dep.fetch(url, { ...init, signal: controlador.signal });
            } catch (error: any) {
                clearTimeout(temporizador);
                const motivo = error?.name === "AbortError" ? "TIMEOUT" : "RED";
                const seguir = await this.transitorio(motivo, intento);
                if (!seguir) throw new ErrorProveedor(motivo, `${p.proveedor}: ${motivo} en ${seguro}`);
                continue;
            }
            const texto = await respuesta.text().catch(() => "");
            clearTimeout(temporizador);
            // Algunos proveedores (FinMind) devuelven el rechazo dentro de un JSON con HTTP 200.
            const enCuerpo = respuesta.status >= 200 && respuesta.status < 300 ? p.estadoEnCuerpo?.(texto) ?? null : null;
            const status = enCuerpo ?? respuesta.status;
            if (status >= 200 && status < 300) {
                await this.conLock(e => { e.fallosConsecutivos = 0; this.contar(e, "ok"); });
                return { status, texto, cabeceras: respuesta.headers };
            }
            const cuerpo = redactar(texto.slice(0, 300), this.secretos);
            if (status === 403 && p.esBloqueoIp(status, texto)) {
                const ra = retryAfterMs(respuesta.headers.get("retry-after"), this.dep.ahora()) ?? 0;
                const hasta = this.dep.ahora() + Math.max(p.pausaBloqueoIpMs, ra);
                await this.conLock(e => { this.abrirCircuito(e, hasta, "BLOQUEO_IP_403"); this.contar(e, "bloqueo_ip"); });
                throw new ErrorProveedor("BLOQUEO_IP", `${p.proveedor}: IP bloqueada (HTTP 403); pausa hasta ${new Date(hasta).toISOString()}`, 403, hasta);
            }
            if (status === 429) {
                const ra = retryAfterMs(respuesta.headers.get("retry-after"), this.dep.ahora());
                const hasta = this.dep.ahora() + Math.max(ra ?? p.pausa429Ms, 1000);
                await this.conLock(e => { this.abrirCircuito(e, hasta, "HTTP_429"); this.contar(e, "http_429"); });
                if (intento < p.maxReintentosTransitorios && hasta - this.dep.ahora() <= esperaMaximaMs) continue;
                throw new ErrorProveedor("HTTP_429", `${p.proveedor}: límite del proveedor (HTTP 429)`, 429, hasta);
            }
            if ([400, 401, 402, 403, 404].includes(status)) {
                await this.conLock(e => {
                    e.permanentes[clave] = { status, en: this.dep.ahora() };
                    this.contar(e, "http_" + status);
                    if (status === 402) this.abrirCircuito(e, this.dep.ahora() + p.pausaCuotaMs, "CUOTA_AGOTADA_402");
                    if (status === 401) this.abrirCircuito(e, this.dep.ahora() + p.pausaCuotaMs, "CREDENCIAL_RECHAZADA_401");
                });
                throw new ErrorProveedor("HTTP_" + status, `${p.proveedor}: HTTP ${status} (sin reintento) ${seguro}: ${cuerpo}`, status);
            }
            const seguir = await this.transitorio("HTTP_" + status, intento);
            if (!seguir) throw new ErrorProveedor("HTTP_" + status, `${p.proveedor}: HTTP ${status} tras ${intento + 1} intentos ${seguro}: ${cuerpo}`, status);
        }
    }

    private async transitorio(motivo: string, intento: number): Promise<boolean> {
        const p = this.politica;
        const abrir = await this.conLock(e => {
            e.fallosConsecutivos++;
            this.contar(e, "transitorio_" + motivo.toLowerCase());
            if (e.fallosConsecutivos >= p.umbralCircuito) {
                this.abrirCircuito(e, this.dep.ahora() + p.pausaCircuitoMs, "FALLOS_CONSECUTIVOS_" + motivo);
                return true;
            }
            return false;
        });
        if (abrir || intento >= p.maxReintentosTransitorios) return false;
        await this.dep.dormir(Math.min(p.backoffMaxMs, p.backoffBaseMs * 2 ** intento));
        return true;
    }
}

const MINUTO = 60000;

export function politicaFinMind(entorno: NodeJS.ProcessEnv = process.env): PoliticaProveedor {
    return {
        proveedor: "finmind",
        maxPorHora: Math.max(1, Number(entorno.FINMIND_MAX_PETICIONES_HORA || 120)),
        pausaBloqueoIpMs: Math.max(35 * MINUTO, Number(entorno.FINMIND_PAUSA_BLOQUEO_MS || 0)),
        pausa429Ms: 2 * MINUTO,
        pausaCuotaMs: 60 * MINUTO,
        maxReintentosTransitorios: 3,
        backoffBaseMs: 5000,
        backoffMaxMs: 2 * MINUTO,
        umbralCircuito: 5,
        pausaCircuitoMs: 15 * MINUTO,
        memoriaPermanenteMs: 24 * HORA,
        timeoutMs: Number(entorno.FINMIND_PCV_TIMEOUT_MS || 30000),
        // Política oficial (finmind.github.io/BanIPPolicy): 403 con {"msg":"ip banned"}.
        esBloqueoIp: (status, cuerpo) => status === 403 && /ip\s*banned|banned/i.test(cuerpo),
        estadoEnCuerpo: cuerpo => {
            try {
                const st = Number(JSON.parse(cuerpo)?.status);
                return Number.isInteger(st) && st >= 400 ? st : null;
            } catch {
                return null;
            }
        }
    };
}

export function directorioGuardias(entorno: NodeJS.ProcessEnv = process.env): string {
    return entorno.G2_PROVIDER_GUARD_DIR || path.resolve(__dirname, __dirname.includes(`${path.sep}dist${path.sep}`) ? "../../../../private_backups/provider-guard" : "../../../private_backups/provider-guard");
}

let guardiaFinMind: GuardiaProveedor | null = null;

// Un único token (FINMIND_TOKEN, o el primero configurado). Nunca se rota de token para eludir cuotas.
export function tokenFinMind(entorno: NodeJS.ProcessEnv = process.env): string {
    return [entorno.FINMIND_TOKEN, entorno.FINMIND_TOKEN_1, entorno.TWOPT_FINMIND_TOKEN].map(t => String(t ?? "").trim()).find(Boolean) ?? "";
}

export async function finmindJson(url: string, opciones: { esperaMaximaMs?: number } = {}): Promise<any> {
    const token = tokenFinMind();
    guardiaFinMind ??= new GuardiaProveedor(politicaFinMind(), directorioGuardias(), [token]);
    const r = await guardiaFinMind.solicitar(url, { headers: token ? { Authorization: `Bearer ${token}`, Accept: "application/json" } : { Accept: "application/json" } }, { esperaMaximaMs: opciones.esperaMaximaMs ?? 15 * MINUTO });
    try {
        return JSON.parse(r.texto);
    } catch {
        throw new ErrorProveedor("RESPUESTA_NO_JSON", "FinMind devolvió una respuesta no JSON", r.status);
    }
}
