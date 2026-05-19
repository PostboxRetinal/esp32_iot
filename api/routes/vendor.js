const path = require('path');
const express = require('express');

const router = express.Router();

router.get('/vendor/chart.js', (req, res) => {
  const chartPath = path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist', 'chart.umd.js');
  res.sendFile(chartPath);
});

module.exports = router;
