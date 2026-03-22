import { createServer } from '/Users/cheikhmb/Documents/akili-property/frontend/node_modules/vite/dist/node/index.js';
import path from 'path';

const root = '/Users/cheikhmb/Documents/akili-property/frontend';

process.chdir(root);

const server = await createServer({
  root,
  configFile: path.join(root, 'vite.config.ts'),
  server: {
    port: 5173,
    host: true,
  }
});

await server.listen();
server.printUrls();
