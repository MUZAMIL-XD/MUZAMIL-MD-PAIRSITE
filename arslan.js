const express = require('express');
const path = require('path');
const bodyParser = require("body-parser");

const app = express();
const __path = process.cwd();
const PORT = process.env.PORT || 8000;

// Import routes
const qrRoute = require('./qr');
const pairRoute = require('./pair');

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__path));

// Routes
app.use('/qr', qrRoute);
app.use('/code', pairRoute);  // /code endpoint maps to pair logic
app.use('/pair', pairRoute);   // /pair endpoint for pairing

// Serve HTML pages
app.get('/pair-page', (req, res) => {
  res.sendFile(path.join(__path, 'pair.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__path, 'main.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`\n✅ MUZAMIL-MD Pair Site Running`);
  console.log(`📍 http://localhost:${PORT}\n`);
});

module.exports = app;
