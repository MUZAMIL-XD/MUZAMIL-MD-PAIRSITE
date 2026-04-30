const { makeid } = require('./id');
const express = require('express');
const fs = require('fs');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');

let router = express.Router();

function removeTemp(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

router.get('/', async (req, res) => {
    let number = req.query.number;
    if (!number) {
        return res.status(400).json({ error: "Number required" });
    }

    const sessionId = makeid(6);
    const tempDir = `./temp/${sessionId}`;
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState(tempDir);
        
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
            },
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS('Chrome'),
            printQRInTerminal: false,
        });

        sock.ev.on('creds.update', saveCreds);

        // Request pairing code
        const cleanNum = number.toString().replace(/\D/g, '');
        const pairingCode = await sock.requestPairingCode(cleanNum);
        
        if (!res.headersSent) {
            return res.json({ code: pairingCode });
        }

        // Cleanup after connection
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                await delay(3000);
                await sock.logout();
                removeTemp(tempDir);
            } else if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
                removeTemp(tempDir);
            }
        });

        // Auto cleanup after 30 seconds
        setTimeout(() => {
            removeTemp(tempDir);
            sock.ws?.close();
        }, 30000);

    } catch (err) {
        console.error("Pair error:", err.message);
        if (!res.headersSent) {
            return res.status(500).json({ code: "SERVICE_ERROR" });
        }
        removeTemp(tempDir);
    }
});

module.exports = router;
