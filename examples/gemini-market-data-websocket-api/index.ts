import { join } from 'node:path';
import plugin from '../../src/index';

process.env.PROJECT_DIR = join(__dirname, 'catalog');

async function main() {
  await plugin(
    {},
    {
      path: join(__dirname, 'asyncapi.yml'),
      domain: { id: 'orders', name: 'Gemini', version: '1.0.0' },
    }
  );
}

main();
