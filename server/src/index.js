require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const attendanceRoutes = require('./routes/attendance');
const delayRoutes = require('./routes/delays');
const dashboardRoutes = require('./routes/dashboards');
const referenceRoutes = require('./routes/reference');
const alertRoutes = require('./routes/alerts');
const schedulingRoutes = require('./routes/scheduling');
const gpsRoutes = require('./routes/gps');
const familyRoutes = require('./routes/family');
const operationsRoutes = require('./routes/operations');

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'InfraShield API', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/delays', delayRoutes);
app.use('/api/dashboards', dashboardRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/scheduling', schedulingRoutes);
app.use('/api/gps', gpsRoutes);
app.use('/api/family', familyRoutes);
app.use('/api/operations', operationsRoutes);
app.use('/api', referenceRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`InfraShield API listening on http://localhost:${PORT}`);
});
