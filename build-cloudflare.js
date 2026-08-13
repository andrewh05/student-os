const fs = require('node:fs');
const path = require('node:path');

const outputDirectory = path.join(__dirname, 'public');
const assets = [
  'index.html',
  'dashboard.html',
  'form.html',
  'users.html',
  'login.html',
  'signup.html',
  'backup.html',
  'styles.css',
  'script.js'
];

fs.mkdirSync(outputDirectory, { recursive: true });
for (const asset of assets) {
  fs.copyFileSync(path.join(__dirname, asset), path.join(outputDirectory, asset));
}

console.log(`Prepared ${assets.length} public assets for Cloudflare Workers.`);
