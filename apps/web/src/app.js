import config from './config/index.js';
import { createApp } from './app/createApp.js';
import { logEvent } from './app/log.js';

const app = createApp();

// Start server
const PORT = config.port;

app.listen(PORT, () => {
  logEvent('start', { port: PORT, env: config.env });
});

export default app;
