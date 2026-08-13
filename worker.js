import http from 'node:http';
import { httpServerHandler } from 'cloudflare:node';
import app from './server.js';

const server = http.createServer(app);

export default httpServerHandler(server);
