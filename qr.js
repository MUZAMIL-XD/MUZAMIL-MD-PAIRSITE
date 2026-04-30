const { makeid } = require('./id');
const QRCode = require('qrcode');
const express = require('express');
const fs = require('fs');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    Browsers,
    delay,
} = require("@whiskeysockets/baileys");

let router = express.Router();

function removeTemp(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

router.get('/', async (req, res) => {
    const sessionId = makeid(6);
    const tempDir = `./temp/${sessionId}`;
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState(tempDir);
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS("Desktop"),
        });

        sock.ev.on('creds.update', saveCreds);
        
        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr && !res.headersSent) {
                const qrBuffer = await QRCode.toBuffer(qr);
                return res.end(qrBuffer);
            }
            
            if (connection === "open") {
                await delay(3000);
                await sock.logout();
                removeTemp(tempDir);
            } else if (connection === "close" && lastDisconnect?.error?.output?.statusCode !== 401) {
                removeTemp(tempDir);
            }
        });
        
        // Timeout cleanup
        setTimeout(() => {
            if (!res.headersSent) {
                res.status(504).json({ error: "Timeout" });
            }
            removeTemp(tempDir);
            sock.ws?.close();
        }, 60000);
        
    } catch (err) {
        console.error("QR Error:", err.message);
        if (!res.headersSent) {
            res.status(500).json({ error: "Service unavailable" });
        }
        removeTemp(tempDir);
    }
});

module.exports = router;
