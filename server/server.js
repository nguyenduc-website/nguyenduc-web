'use strict';
const http = require('http');
const app = require('./app');
const config = require('./config');
const { attachChat } = require('./realtime/chat');

const server = http.createServer(app);
attachChat(server);

server.listen(config.port, () => {
  console.log(`▶ NGUYỄN ĐỨC • Web • Store running on port ${config.port} [${config.env}]`);
  console.log(`  Base URL: ${config.baseUrl}`);
});

process.on('SIGTERM', () => { console.log('SIGTERM'); server.close(() => process.exit(0)); });
process.on('SIGINT', () => { console.log('SIGINT'); server.close(() => process.exit(0)); });