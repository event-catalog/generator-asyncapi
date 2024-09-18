import { expect, it, describe, beforeEach, afterEach } from 'vitest';
import utils from '@eventcatalog/sdk';
import plugin from '../index';
import { join } from 'node:path';
import fs from 'fs/promises';

// Fake eventcatalog config
const config = {};

let catalogDir: string;
const asyncAPIExamplesDir = join(__dirname, 'asyncapi-files');

describe('AsyncAPI EventCatalog Plugin', () => {
  describe('service generation', () => {
    beforeEach(() => {
      catalogDir = join(__dirname, 'catalog') || '';
      process.env.PROJECT_DIR = catalogDir;
    });

    afterEach(async () => {
      await fs.rm(join(catalogDir), { recursive: true });
    });

    describe('domains', () => {
      it('if a domain is defined in the AsyncAPI file but the versions do not match, the existing domain is version and a new one is created', async () => {
        const { writeDomain, getDomain } = utils(catalogDir);

        await writeDomain({
          id: 'orders',
          name: 'Orders Domain',
          version: '0.0.1',
          markdown: '',
        });

        await plugin(config, {
          services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }],
          domain: { id: 'orders', name: 'Orders Domain', version: '1.0.0' },
        });

        const versionedDomain = await getDomain('orders', '0.0.1');
        const newDomain = await getDomain('orders', '1.0.0');

        expect(versionedDomain.version).toEqual('0.0.1');
        expect(newDomain.version).toEqual('1.0.0');
        expect(newDomain.services).toEqual([{ id: 'account-service', version: '1.0.0' }]);
      });

      it('if a domain is defined in the AsyncAPI plugin configuration and that domain exists the AsyncAPI Service is added to that domain', async () => {
        const { writeDomain, getDomain } = utils(catalogDir);

        await writeDomain({
          id: 'orders',
          name: 'Orders Domain',
          version: '1.0.0',
          markdown: '',
        });

        await plugin(config, {
          services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }],
          domain: { id: 'orders', name: 'Orders Domain', version: '1.0.0' },
        });

        const domain = await getDomain('orders', '1.0.0');
        expect(domain.services).toEqual([{ id: 'account-service', version: '1.0.0' }]);
      });

      it('if multiple asyncapi files are processed, they are all added to the domain', async () => {
        const { getDomain } = utils(catalogDir);

        await plugin(config, {
          services: [
            { path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') },
            { path: join(asyncAPIExamplesDir, 'orders-service.asyncapi.yml') },
          ],
          domain: { id: 'orders', name: 'Orders', version: '1.0.0' },
        });

        const domain = await getDomain('orders', 'latest');

        expect(domain.services).toHaveLength(2);
        expect(domain.services).toEqual([
          { id: 'account-service', version: '1.0.0' },
          { id: 'orders-service', version: '1.0.1' },
        ]);
      });

      it('if a domain is defined in the AsyncAPI plugin configuration and that domain does not exist, it is created', async () => {
        const { getDomain } = utils(catalogDir);

        expect(await getDomain('orders', '1.0.0')).toBeUndefined();

        await plugin(config, {
          services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }],
          domain: { id: 'orders', name: 'Orders Domain', version: '1.0.0' },
        });

        const domain = await getDomain('orders', '1.0.0');
        expect(domain.services).toEqual([{ id: 'account-service', version: '1.0.0' }]);
      });

      it('if a domain is not defined in the AsyncAPI plugin configuration, the service is not added to any domains', async () => {
        const { getDomain } = utils(catalogDir);
        await plugin(config, {
          services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }],
        });
        expect(await getDomain('orders', '1.0.0')).toBeUndefined();
      });
    });

    describe('services', () => {
      it('asyncapi is mapped into a service in EventCatalog when no service with this name is already defined', async () => {
        const { getService } = utils(catalogDir);

        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }] });

        const service = await getService('account-service');

        expect(service).toEqual(
          expect.objectContaining({
            id: 'account-service',
            name: 'Account Service',
            version: '1.0.0',
            summary: 'This service is in charge of processing user signups',
            badges: [
              {
                content: 'Events',
                textColor: 'blue',
                backgroundColor: 'blue',
              },
              {
                content: 'Authentication',
                textColor: 'blue',
                backgroundColor: 'blue',
              },
            ],
          })
        );
      });

      it('when the AsyncAPI service is already defined in EventCatalog and the versions match, only metadata is updated', async () => {
        // Create a service with the same name and version as the AsyncAPI file for testing
        const { writeService, getService } = utils(catalogDir);

        await writeService(
          {
            id: 'account-service',
            version: '1.0.0',
            name: 'Random Name',
            markdown: '',
          },
          { path: 'Account Service' }
        );

        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }] });

        const service = await getService('account-service', '1.0.0');
        expect(service).toEqual(
          expect.objectContaining({
            id: 'account-service',
            name: 'Account Service',
            version: '1.0.0',
            summary: 'This service is in charge of processing user signups',
            badges: [
              {
                content: 'Events',
                textColor: 'blue',
                backgroundColor: 'blue',
              },
              {
                content: 'Authentication',
                textColor: 'blue',
                backgroundColor: 'blue',
              },
            ],
          })
        );
      });

      it('when the AsyncAPI service is already defined in EventCatalog and the versions match, the markdown is persisted and not overwritten', async () => {
        // Create a service with the same name and version as the AsyncAPI file for testing
        const { writeService, getService } = utils(catalogDir);

        await writeService(
          {
            id: 'account-service',
            version: '1.0.0',
            name: 'Random Name',
            markdown: 'Here is my original markdown, please do not override this!',
          },
          { path: 'Account Service' }
        );

        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }] });

        const service = await getService('account-service', '1.0.0');
        expect(service).toEqual(
          expect.objectContaining({
            id: 'account-service',
            name: 'Account Service',
            version: '1.0.0',
            summary: 'This service is in charge of processing user signups',
            markdown: 'Here is my original markdown, please do not override this!',
            badges: [
              {
                content: 'Events',
                textColor: 'blue',
                backgroundColor: 'blue',
              },
              {
                content: 'Authentication',
                textColor: 'blue',
                backgroundColor: 'blue',
              },
            ],
          })
        );
      });

      it('when the AsyncAPI service is already defined in EventCatalog and the versions do not match, a new service is created and the old one is versioned', async () => {
        // Create a service with the same name and version as the AsyncAPI file for testing
        const { writeService, getService } = utils(catalogDir);

        await writeService(
          {
            id: 'account-service',
            version: '0.0.1',
            name: 'Account Service',
            markdown: '',
          },
          { path: 'Account Service' }
        );

        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }] });

        const versionedService = await getService('account-service', '0.0.1');
        const newService = await getService('account-service', '1.0.0');
        expect(versionedService).toBeDefined();
        expect(newService).toBeDefined();
      });

      it('any message with the operation `send` is added to the service. The service publishes this message.', async () => {
        const { getService } = utils(catalogDir);

        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }] });

        const service = await getService('account-service', '1.0.0');

        expect(service.sends).toHaveLength(2);
        expect(service.sends).toEqual([
          { id: 'usersignedup', version: '1.0.0' },
          { id: 'usersignedout', version: '1.0.0' },
        ]);
      });

      it('any message with the operation `receive` is added to the service. The service receives this message.', async () => {
        const { getService } = utils(catalogDir);

        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }] });

        const service = await getService('account-service', '1.0.0');

        expect(service.receives).toHaveLength(1);
        expect(service.receives).toEqual([{ id: 'signupuser', version: '1.0.0' }]);
      });

      it('the asyncapi file is added to the service which can be downloaded in eventcatalog', async () => {
        const { getService } = utils(catalogDir);
        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }] });

        const service = await getService('account-service', '1.0.0');

        expect(service.schemaPath).toEqual('simple.asyncapi.yml');

        const schema = await fs.readFile(join(catalogDir, 'services', 'Account Service', 'simple.asyncapi.yml'));
        expect(schema).toBeDefined();
      });

      it('the original asyncapi file is added to the service instead of parsed version', async () => {
        const { getService } = utils(catalogDir);
        await plugin(config, {
          services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }],
          saveParsedSpecFile: false,
        });

        const service = await getService('account-service', '1.0.0');

        expect(service.schemaPath).toEqual('simple.asyncapi.yml');

        const schema = await fs.readFile(join(catalogDir, 'services', 'Account Service', 'simple.asyncapi.yml'), 'utf8');
        expect(schema).toBeDefined();
        expect(schema).not.toContain('x-parser-schema-id');
      });

      it('the original asyncapi file is not added but the parsed version', async () => {
        const { getService } = utils(catalogDir);
        await plugin(config, {
          services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }],
          saveParsedSpecFile: true,
        });

        const service = await getService('account-service', '1.0.0');

        expect(service.schemaPath).toEqual('simple.asyncapi.yml');

        const schema = await fs.readFile(join(catalogDir, 'services', 'Account Service', 'simple.asyncapi.yml'), 'utf8');
        expect(schema).toBeDefined();
        expect(schema).toContain('x-parser-schema-id');
      });

      it('the asyncapi specification file path is added to the service which can be rendered and visualized in eventcatalog', async () => {
        const { getService } = utils(catalogDir);
        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }] });

        const service = await getService('account-service', '1.0.0');

        expect(service.specifications?.asyncapiPath).toEqual('simple.asyncapi.yml');

        const schema = await fs.readFile(join(catalogDir, 'services', 'Account Service', 'simple.asyncapi.yml'));
        expect(schema).toBeDefined();
      });

      it('the asyncapi specification file path is added to an existing service version without overwriting existing specifications except asyncapi spec', async () => {
        // Create a service with the same name and version as the AsyncAPI file for testing
        const { writeService, getService } = utils(catalogDir);
        const existingVersion = '1.0.0';
        await writeService(
          {
            id: 'account-service',
            version: existingVersion,
            name: 'Random Name',
            markdown: 'Here is my original markdown, please do not override this!',
            specifications: { openapiPath: 'simple.asyncapi.yml' },
          },
          { path: 'Account Service' }
        );

        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }] });

        const service = await getService('account-service', existingVersion);
        expect(service.specifications?.asyncapiPath).toEqual('simple.asyncapi.yml');
        expect(service.specifications?.openapiPath).toEqual('simple.asyncapi.yml');
      });

      it('if an `id` value is given with the service, then the generator uses that id and does not generate one from the title', async () => {
        const { getService } = utils(catalogDir);

        await plugin(config, {
          services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml'), id: 'custom-id' }],
        });

        const service = await getService('custom-id', '1.0.0');

        expect(service).toBeDefined();
      });
    });

    describe('messages', () => {
      it('messages that do not have an eventcatalog header are documented as events by default in EventCatalog', async () => {
        const { getEvent } = utils(catalogDir);

        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }] });

        const event = await getEvent('usersignedout');

        expect(event).toEqual(
          expect.objectContaining({
            id: 'usersignedout',
            name: 'UserSignedOut',
            version: '1.0.0',
            summary: 'User signed out the application',
            badges: [
              {
                content: 'New',
                textColor: 'blue',
                backgroundColor: 'blue',
              },
            ],
          })
        );
      });

      it('messages marked as "events" using the custom `ec-message-type` header in an AsyncAPI are documented in EventCatalog as events ', async () => {
        const { getEvent } = utils(catalogDir);

        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }] });

        const event = await getEvent('usersignedup');

        expect(event).toEqual(
          expect.objectContaining({
            id: 'usersignedup',
            name: 'UserSignedUp',
            version: '1.0.0',
            summary: 'User signed up the application',
            badges: [
              {
                content: 'New',
                textColor: 'blue',
                backgroundColor: 'blue',
              },
            ],
          })
        );
      });

      it('messages marked as "commands" using the custom `ec-message-type` header in an AsyncAPI are documented in EventCatalog as commands ', async () => {
        const { getCommand } = utils(catalogDir);

        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }] });

        const event = await getCommand('signupuser');

        expect(event).toEqual(
          expect.objectContaining({
            id: 'signupuser',
            name: 'SignUpUser',
            version: '1.0.0',
            summary: 'Sign up a user',
            badges: [
              {
                content: 'New',
                textColor: 'blue',
                backgroundColor: 'blue',
              },
            ],
          })
        );
      });

      it('when the message already exists in EventCatalog but the versions do not match, the existing message is versioned', async () => {
        const { writeEvent, getEvent } = utils(catalogDir);

        await writeEvent({
          id: 'usersignedup',
          version: '0.0.1',
          name: 'UserSignedUp',
          markdown: '',
        });

        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }] });

        const versionedEvent = await getEvent('usersignedup', '0.0.1');
        const newEvent = await getEvent('usersignedup', '1.0.0');

        expect(versionedEvent).toBeDefined();
        expect(newEvent).toBeDefined();
      });

      it('when a the message already exists in EventCatalog the markdown is persisted and not overwritten', async () => {
        const { writeEvent, getEvent } = utils(catalogDir);

        await writeEvent({
          id: 'usersignedup',
          version: '0.0.1',
          name: 'UserSignedUp',
          markdown: 'please dont override me!',
        });

        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }] });

        const newEvent = await getEvent('usersignedup', '1.0.0');
        expect(newEvent.markdown).toEqual('please dont override me!');
      });

      it('when a message already exists in EventCatalog with the same version the metadata is updated', async () => {
        const { writeEvent, getEvent } = utils(catalogDir);

        await writeEvent({
          id: 'usersignedup',
          version: '0.0.1',
          name: 'UserSignedUp',
          markdown: 'please dont override me!',
        });

        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }] });

        const newEvent = await getEvent('usersignedup', '1.0.0');
        expect(newEvent.markdown).toEqual('please dont override me!');
      });

      describe('schemas', () => {
        it('when a message has a schema defined in the AsyncAPI file, the schema is documented in EventCatalog', async () => {
          await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }] });

          const schema = await fs.readFile(join(catalogDir, 'events', 'UserSignedUp', 'schema.json'));
          expect(schema).toBeDefined();
        });

        it('when a message has a schema defined in the AsyncAPI file, the schema download is enabled in EventCatalog', async () => {
          const { getEvent } = utils(catalogDir);

          await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'simple.asyncapi.yml') }] });
          const event = await getEvent('usersignedup', '1.0.0');

          expect(event.schemaPath).toEqual('schema.json');
        });
      });
    });

    describe('$ref', () => {
      it('AsyncAPI files with $ref are resolved and added to the catalog', async () => {
        const { getEvent, getService } = utils(catalogDir);

        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'ref-example.asyncapi.yml') }] });

        const service = await getService('test-service', '1.1.0');
        const event = await getEvent('usersignup', '1.1.0');

        expect(service).toBeDefined();
        expect(event).toBeDefined();
        expect(event.schemaPath).toEqual('schema.json');
      });

      it('if the AsyncAPI has any $ref these are not saved to the service. The servive AsyncAPI is has no $ref', async () => {
        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'ref-example.asyncapi.yml') }] });

        const asyncAPIFile = await fs.readFile(join(catalogDir, 'services', 'Test Service', 'ref-example.asyncapi.yml'));
        const expected = await fs.readFile(join(asyncAPIExamplesDir, 'ref-example-without-refs.asyncapi.yml'));

        expect(asyncAPIFile).toEqual(expected);
      });
    });

    describe('asyncapi files with avro schemas', () => {
      it('parses the AsyncAPI file with avro schemas', async () => {
        const { getEvent, getService } = utils(catalogDir);

        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'asyncapi-with-avro.asyncapi.yml') }] });

        const service = await getService('user-signup-api', '1.0.0');
        const event = await getEvent('usersignedup', '1.0.0');

        expect(service).toBeDefined();
        expect(event).toBeDefined();

        expect(event.schemaPath).toEqual('schema.avsc');

        // Check file schema.avsc
        const schema = await fs.readFile(join(catalogDir, 'events', 'userSignedUp', 'schema.avsc'));
        expect(schema).toBeDefined();
      });
    });

    describe('AsyncAPI files as JSON', () => {
      it('parses the JSON spec file and writes the schema as JSON to the given service ', async () => {
        const { getEvent, getService } = utils(catalogDir);

        await plugin(config, { services: [{ path: join(asyncAPIExamplesDir, 'example-as-json.json') }] });

        const service = await getService('user-service', '1.0.0');
        const event = await getEvent('userupdated', '1.0.0');

        expect(service).toBeDefined();
        expect(event).toBeDefined();

        const schema = await fs.readFile(join(catalogDir, 'services', 'User Service', 'example-as-json.json'), 'utf-8');
        expect(schema).toBeDefined();

        // verify its JSON
        const parsedJSON = JSON.parse(schema);
        expect(parsedJSON).toBeDefined();

        expect(parsedJSON).toEqual(
          expect.objectContaining({
            info: {
              title: 'User Service',
              version: '1.0.0',
              description: 'CRUD based API to handle User interactions for users of Kitchenshelf app.',
            },
          })
        );
      });
    });
  });
});
