import http from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import app from './server.js';
import backupModule from './backup.js';

const server = http.createServer(app);
const httpHandler = httpServerHandler(server);

function applyRuntimeEnvironment(env) {
  for (const name of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'DATA_ENCRYPTION_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']) {
    if (typeof env[name] === 'string') process.env[name] = env[name];
  }
}

export default {
  fetch(request, env, ctx) {
    applyRuntimeEnvironment(env);
    return httpHandler.fetch(request, env, ctx);
  },
  async scheduled(controller, env, ctx) {
    applyRuntimeEnvironment(env);
    ctx.waitUntil(backupModule.runGoogleDriveBackup().catch(error => console.error('Daily Google Drive backup failed:', error.message)));
  }
};
