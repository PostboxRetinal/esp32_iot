const express = require('express');
const { queryLatestNodes } = require('../lib/queries');

const router = express.Router();
const SSE_INTERVAL_MS = Number(process.env.SSE_INTERVAL_MS || 5000);

router.get('/stream/latest', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendLatest = async () => {
    try {
      const items = await queryLatestNodes({ estado: null, contexto: null, limit: 200, offset: 0 });
      const payload = JSON.stringify({ items, ts: new Date().toISOString() });
      res.write(`event: latest\n`);
      res.write(`data: ${payload}\n\n`);
    } catch (err) {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: 'stream_error' })}\n\n`);
    }
  };

  await sendLatest();
  const timer = setInterval(sendLatest, SSE_INTERVAL_MS);

  req.on('close', () => {
    clearInterval(timer);
    res.end();
  });
});

module.exports = router;
