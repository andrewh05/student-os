import http from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import app from './server.js';
import backupModule from './backup.js';

const server = http.createServer(app);
const httpHandler = httpServerHandler(server);

export default {
  fetch: httpHandler.fetch.bind(httpHandler),
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(backupModule.runGoogleDriveBackup().catch(error => console.error('Daily Google Drive backup failed:', error.message)));
  }
};
