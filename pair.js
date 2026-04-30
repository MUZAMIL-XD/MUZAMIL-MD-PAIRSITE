const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, Browsers, delay, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const { makeid } = require('./id');   // make sure id.js exports makeid()
let router = express.Router();

function rmTemp(dir) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

router.get('/', async (req, res) => {
    let number = req.query.number;
    if (!number) return res.status(400).json({ error: "number required" });

    let sessionId = makeid(6);
    const tempFolder = `./temp/${sessionId}`;
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState(tempFolder);
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
        
        // request pairing code
        let pairingCode = null;
        if (!sock.authState.creds.registered) {
            const cleanNum = number.replace(/\D/g, '');
            pairingCode = await sock.requestPairingCode(cleanNum);
            if (!res.headersSent) {
                res.json({ code: pairingCode });
            }
        } else {
            return res.json({ code: "ALREADY_REGISTERED" });
        }

        // listen for connection open to save creds eventually
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'open') {
                await delay(2000);
                // save creds as base64 but not mandatory for pairing response
                let credsPath = `${tempFolder}/creds.json`;
                if (fs.existsSync(credsPath)) {
                    let b64 = fs.readFileSync(credsPath).toString('base64');
                    // optional: send to bot owner or store (you can expand)
                }
                await delay(800);
                await sock.logout();
                rmTemp(tempFolder);
            } else if (connection === 'close' && lastDisconnect?.error?.output?.statusCode !== 401) {
                rmTemp(tempFolder);
            }
        });
        
        // close after 25 secs cleanup
        setTimeout(() => {
            if (fs.existsSync(tempFolder)) rmTemp(tempFolder);
            sock.ws?.close();
        }, 28000);
        
    } catch (err) {
        console.error("Pair error:", err);
        if (!res.headersSent) res.status(500).json({ code: "SERVICE_ERROR" });
        rmTemp(tempFolder);
    }
});

module.exports = router;
