/**
 * G2EXCHANGE
 * MAPEO DE SECTORES MYSQL -> MOTOR FINANCIERO v1.5
 *
 * Los identificadores pertenecen a la tabla sector de MySQL.
 *
 * Las plantillas 01-16 pertenecen al motor financiero.
 *
 * IMPORTANTE:
 * - No modifica MySQL.
 * - No modifica las betas sectoriales.
 * - No altera los identificadores originales.
 * - No modifica las configuraciones del motor.
 *
 * Las correspondencias generales requieren revisión
 * cuando se conozca la actividad concreta de la empresa.
 */

export interface MapeoSector {
    nombre: string;
    plantilla: string;
    clasificacion: "DIRECTA" | "GENERAL" | "REVISAR";
}

export const MAPEO_SECTORES: Readonly<Record<number, MapeoSector>> = {

    // TRANSPORTE Y LOGÍSTICA

    1: {
        nombre: "Logistics & Transportation",
        plantilla: "16",
        clasificacion: "GENERAL"
    },

    176: {
        nombre: "Airlines",
        plantilla: "16",
        clasificacion: "GENERAL"
    },

    131: {
        nombre: "Marine",
        plantilla: "16",
        clasificacion: "GENERAL"
    },

    336: {
        nombre: "Road & Rail",
        plantilla: "16",
        clasificacion: "GENERAL"
    },

    121: {
        nombre: "Transportation Infrastructure",
        plantilla: "10",
        clasificacion: "GENERAL"
    },


    // DEFENSA Y AEROESPACIAL

    25: {
        nombre: "Aerospace & Defense",
        plantilla: "01",
        clasificacion: "DIRECTA"
    },


    // CONSUMO, HOSTELERÍA Y DISTRIBUCIÓN

    2: {
        nombre: "Hotels, Restaurants & Leisure",
        plantilla: "06",
        clasificacion: "GENERAL"
    },

    13: {
        nombre: "Consumer Products",
        plantilla: "06",
        clasificacion: "GENERAL"
    },

    15: {
        nombre: "Retail",
        plantilla: "06",
        clasificacion: "DIRECTA"
    },

    56: {
        nombre: "Textiles, Apparel & Luxury Goods",
        plantilla: "06",
        clasificacion: "GENERAL"
    },

    182: {
        nombre: "Leisure Products",
        plantilla: "06",
        clasificacion: "GENERAL"
    },

    160: {
        nombre: "Beverages",
        plantilla: "07",
        clasificacion: "DIRECTA"
    },

    181: {
        nombre: "Food Products",
        plantilla: "07",
        clasificacion: "DIRECTA"
    },

    266: {
        nombre: "Tobacco",
        plantilla: "07",
        clasificacion: "GENERAL"
    },

    11: {
        nombre: "Trading Companies & Distributors",
        plantilla: "16",
        clasificacion: "GENERAL"
    },

    102: {
        nombre: "Distributors",
        plantilla: "16",
        clasificacion: "GENERAL"
    },

    368: {
        nombre: "Diversified Consumer Services",
        plantilla: "06",
        clasificacion: "GENERAL"
    },


    // INDUSTRIA Y FABRICACIÓN

    20: {
        nombre: "Machinery",
        plantilla: "04",
        clasificacion: "DIRECTA"
    },

    46: {
        nombre: "Electrical Equipment",
        plantilla: "04",
        clasificacion: "GENERAL"
    },

    97: {
        nombre: "Packaging",
        plantilla: "04",
        clasificacion: "GENERAL"
    },

    187: {
        nombre: "Industrial Conglomerates",
        plantilla: "04",
        clasificacion: "GENERAL"
    },

    31: {
        nombre: "Construction",
        plantilla: "04",
        clasificacion: "GENERAL"
    },

    128: {
        nombre: "Building",
        plantilla: "04",
        clasificacion: "GENERAL"
    },

    7550: {
        nombre: "Building Materials",
        plantilla: "09",
        clasificacion: "REVISAR"
    },


    // AUTOMOCIÓN

    9: {
        nombre: "Automobiles",
        plantilla: "05",
        clasificacion: "DIRECTA"
    },

    65: {
        nombre: "Auto Components",
        plantilla: "05",
        clasificacion: "DIRECTA"
    },


    // ENERGÍA Y RECURSOS NATURALES

    6: {
        nombre: "Energy",
        plantilla: "08",
        clasificacion: "GENERAL"
    },

    10: {
        nombre: "Metals & Mining",
        plantilla: "09",
        clasificacion: "DIRECTA"
    },

    3: {
        nombre: "Chemicals",
        plantilla: "09",
        clasificacion: "REVISAR"
    },


    // UTILITIES E INFRAESTRUCTURAS

    4: {
        nombre: "Utilities",
        plantilla: "10",
        clasificacion: "DIRECTA"
    },


    // TECNOLOGÍA Y SEMICONDUCTORES

    19: {
        nombre: "Semiconductors",
        plantilla: "03",
        clasificacion: "DIRECTA"
    },

    14: {
        nombre: "Technology",
        plantilla: "02",
        clasificacion: "REVISAR"
    },


    // TELECOMUNICACIONES Y COMUNICACIÓN

    62: {
        nombre: "Telecommunication",
        plantilla: "11",
        clasificacion: "DIRECTA"
    },

    27: {
        nombre: "Communications",
        plantilla: "11",
        clasificacion: "REVISAR"
    },

    35: {
        nombre: "Media",
        plantilla: "06",
        clasificacion: "REVISAR"
    },


    // FARMACIA, BIOTECNOLOGÍA Y SALUD

    23: {
        nombre: "Biotechnology",
        plantilla: "12",
        clasificacion: "DIRECTA"
    },

    137: {
        nombre: "Pharmaceuticals",
        plantilla: "12",
        clasificacion: "DIRECTA"
    },

    28: {
        nombre: "Health Care",
        plantilla: "12",
        clasificacion: "REVISAR"
    },

    73: {
        nombre: "Life Sciences Tools & Services",
        plantilla: "12",
        clasificacion: "GENERAL"
    },


    // SERVICIOS FINANCIEROS

    16: {
        nombre: "Banking",
        plantilla: "13",
        clasificacion: "DIRECTA"
    },

    5: {
        nombre: "Financial Services",
        plantilla: "13",
        clasificacion: "REVISAR"
    },

    12: {
        nombre: "Insurance",
        plantilla: "14",
        clasificacion: "DIRECTA"
    },


    // INMOBILIARIO

    26: {
        nombre: "Real Estate",
        plantilla: "15",
        clasificacion: "REVISAR"
    },


    // SERVICIOS PROFESIONALES Y COMERCIALES

    29: {
        nombre: "Commercial Services & Supplies",
        plantilla: "16",
        clasificacion: "GENERAL"
    },

    75: {
        nombre: "Professional Services",
        plantilla: "16",
        clasificacion: "GENERAL"
    },


    // SIN CLASIFICACIÓN

    221: {
        nombre: "N/A",
        plantilla: "16",
        clasificacion: "REVISAR"
    }

};

/**
 * Devuelve la información de correspondencia de un sector.
 */
export function obtenerMapeoSector(
    sectorId: number
): MapeoSector {

    const sector = MAPEO_SECTORES[sectorId];

    if (!sector) {
        throw new Error(
            `Sector MySQL ${sectorId} sin correspondencia financiera`
        );
    }

    return sector;
}


/**
 * Obtiene la plantilla financiera correspondiente.
 *
 * SEGURIDAD:
 * Los sectores marcados como REVISAR no pueden
 * seleccionarse automáticamente.
 */
export function obtenerPlantillaPorSector(
    sectorId: number
): string {
    const sector = obtenerMapeoSector(sectorId);
    return sector.plantilla;
}