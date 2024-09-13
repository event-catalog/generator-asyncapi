import { join } from 'node:path';
import plugin from '../../src/index';

process.env.PROJECT_DIR = join(__dirname, 'catalog');

async function main() {
  await plugin(
    {},
    {
      path: [join(__dirname, 'account-service.asyncapi.yml'), join(__dirname, 'orders-service.asyncapi.yml')],
      domain: { id: 'orders', name: 'Street', version: '1.0.0' },
    }
  );
}

main();
