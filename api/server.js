const path = require('path');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const healthRoutes = require('./routes/health');
const nodesRoutes = require('./routes/nodes');
const streamRoutes = require('./routes/stream');
const vendorRoutes = require('./routes/vendor');

app.use('/api', healthRoutes);
app.use('/api', nodesRoutes);
app.use('/api', streamRoutes);
app.use('/', vendorRoutes);

app.use(express.static(path.join(__dirname, 'public')));

const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`[api] listening on :${PORT}`);
});
