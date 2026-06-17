const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Permitir que tu página de GitHub Pages se conecte a esta API
app.use(cors());
app.use(express.json());

// Conexión automática a la Base de Datos que creaste en Railway
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Crear las tablas de la base de datos si no existen al arrancar
const initDB = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS operaciones (
                id SERIAL PRIMARY KEY,
                fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                rut VARCHAR(12),
                kilos_vendidos NUMERIC(10,2),
                monto_uyu NUMERIC(10,2),
                metodo_pago VARCHAR(50),
                factura_serie VARCHAR(20)
            );
        `);
        console.log("Banco de datos listo y tablas verificadas.");
    } catch (err) {
        console.error("Error inicializando la base de datos:", err);
    }
};
initDB();

// RUTA PRINCIPAL: Recibe los datos del formulario de tu celular
app.post('/api/v1/ventas', async (req, res) => {
    const { cliente_rut, kilos, monto_total_uyu, metodo_pago } = req.body;

    if (!cliente_rut || !kilos || !monto_total_uyu || !metodo_pago) {
        return res.status(400).json({ status: "error", message: "Faltan datos obligatorios." });
    }

    try {
        // 1. Simulación de aprobación de Factura Electrónica (DGI)
        const numeroFactura = "A-" + Math.floor(Math.random() * (29999 - 10000) + 10000);

        // 2. Guardar la operación de forma real en la Base de Datos de Railway
        const queryText = `
            INSERT INTO operaciones (rut, kilos_vendidos, monto_uyu, metodo_pago, factura_serie)
            VALUES ($1, $2, $3, $4, $5) RETURNING *;
        `;
        const values = [cliente_rut, kilos, monto_total_uyu, metodo_pago, numeroFactura];
        await pool.query(queryText, values);

        // 3. Obtener totales acumulados históricos para devolver el estado de Caja y Stock
        const statsKilos = await pool.query('SELECT SUM(kilos_vendidos) as total_kilos FROM operaciones;');
        const statsCaja = await pool.query('SELECT SUM(monto_uyu) as total_plata FROM operaciones;');

        const stockInicialSimulado = 5000.00; 
        const stockActual = (stockInicialSimulado - parseFloat(statsKilos.rows[0].total_kilos || 0)).toFixed(2);
        const saldoCajaActual = parseFloat(statsCaja.rows[0].total_plata || 0).toFixed(2);

        // Responder al celular con éxito y datos reales guardados
        res.json({
            "status": "success",
            "timestamp": new Date().toISOString(),
            "data": {
                "facturacion_dgi": {
                    "estado": "APROBADO_DGI",
                    "tipo_cfe": "111 - e-Factura",
                    "serie_numero": numeroFactura,
                    "url_pdf_factura": "#"
                },
                "inventario": {
                    "movimiento": "EGRESO",
                    "kilos_restados": parseFloat(kilos),
                    "stock_actual_kilos": parseFloat(stockActual)
                },
                "caja_flujo": {
                    "movimiento": "INGRESO_CAJA",
                    "monto": parseFloat(monto_total_uyu),
                    "saldo_actual_caja_uyu": parseFloat(saldoCajaActual)
                }
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "error", message: "Error en el servidor de base de datos." });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});
