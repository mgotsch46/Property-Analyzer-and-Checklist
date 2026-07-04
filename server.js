const express = require('express');
const path = require('path');
const { runResearch } = require('./research');

const app = express();
app.use(express.json());

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, rentcast: !!process.env.RENTCAST_API_KEY });
});

app.post('/api/run', async (req, res) => {
  try {
    const { address, city, state, zip, dealtype } = req.body || {};
    const full = [address, city, state, zip].filter(Boolean).join(', ');
    if (!full) return res.status(400).json({ error: 'address required' });
    const data = await runResearch({ address, city, state, zip, full, dealType: dealtype });
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('RenewEQ DD app listening on ' + PORT));
