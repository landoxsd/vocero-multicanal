const { WhatsAppMultiManager, SESSION_STATUS } = require("./WhatsAppMultiManager");

console.log("=== EJEMPLO DE USO PROGRAMÁTICO DE WHATSAPP MULTIMANAGER ===");

// 1. Instanciar el gestor
const manager = new WhatsAppMultiManager({
    sessionsPath: "./sessions",
    headless: false, // Poner en true para ejecutar en producción/servidores sin pantalla
    webhookUrl: "http://localhost:3000/webhook-test" // Opcional
});

// 2. Suscribirse a eventos
manager.onStatusChange = (sessionId, status) => {
    console.log(`🔔 [Callback] Sesión '${sessionId}' cambió a estado: ${status}`);
};

manager.onQr = (sessionId, qr) => {
    console.log(`📷 [Callback] Escanea el QR para activar '${sessionId}'`);
};

manager.onMessage = async (sessionId, msg, mgr) => {
    console.log(`📨 [Callback] Mensaje recibido en '${sessionId}' de ${msg.from}: "${msg.body}"`);

    // Ejemplo auto-respuesta simple:
    if (msg.body && msg.body.toLowerCase() === "ping") {
        console.log(`🤖 Respondiendo 'pong' desde '${sessionId}'...`);
        await mgr.sendMessage(sessionId, msg.from, `🏓 pong (desde cuenta: ${sessionId})`);
    }
};

// 3. Iniciar sesiones
console.log("Creando sesión 'cuenta-principal'...");
manager.createSession("cuenta-principal");

// Descomentar para crear más sesiones simultáneas:
// manager.createSession("cuenta-soporte");
// manager.createSession("cuenta-ventas");

console.log("Proceso iniciado. Presiona Ctrl+C para salir.");
