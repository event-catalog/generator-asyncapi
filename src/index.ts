// import utils from '@eventcatalog/sdk';
import { Parser } from '@asyncapi/parser';
const parser = new Parser();
import { readFile } from 'node:fs/promises';
import utils from '@eventcatalog/sdk';
import slugify from 'slugify';
import { defaultMarkdown as generateMarkdownForMessage } from './markdown/messages';
import { defaultMarkdown as generateMarkdownForService } from './markdown/services';

type Domain = {
  id: string;
  name: string;
  version: string;
};

type Props = {
  path: string | string[];
  domain?: Domain;
};

const getFileExtentionFromSchemaFormat = (format: string | undefined = '') => {
  if (format.includes('avro')) return 'avsc';
  if (format.includes('yml')) return 'yml';
  if (format.includes('json')) return 'json';
  if (format.includes('openapi')) return 'openapi';
  if (format.includes('protobuf')) return 'protobuf';
  if (format.includes('yaml')) return 'yaml';

  return 'json';
};

export default async (config: any, options: Props) => {
  if (!process.env.PROJECT_DIR) {
    throw new Error('Please provide catalog url (env variable PROJECT_DIR)');
  }

  const {
    writeService,
    writeEvent,
    writeCommand,
    getService,
    versionService,
    rmService,
    getDomain,
    writeDomain,
    addServiceToDomain,
    getCommand,
    getEvent,
    rmEventById,
    versionCommand,
    versionEvent,
    addSchemaToCommand,
    addSchemaToEvent,
  } = utils(process.env.PROJECT_DIR);

  const asyncAPIFiles = Array.isArray(options.path) ? options.path : [options.path];

  for (const path of asyncAPIFiles) {
    const asyncAPIFile = await readFile(path, 'utf-8');
    const { document } = await parser.parse(asyncAPIFile);

    if (!document) {
      console.log('FAILED ASYNCAPI FILE');
      continue;
    }

    const operations = document.allOperations();
    const documentTags = document.info().tags().all() || [];

    const serviceId = slugify(document.info().title(), { lower: true, strict: true });
    const serviceVersion = document.info().version();

    // What messages does this service send and receive
    const sends = [];
    const receives = [];

    let serviceMarkdown = generateMarkdownForService(document);

    // Manage domain
    if (options.domain) {
      // Try and get the domain
      const domain = await getDomain(options.domain.id, options.domain.version || 'latest');
      const { id: domainId, name: domainName, version: domainVersion } = options.domain;
      if (!domain) {
        // Domain does not exist, create it
        await writeDomain({
          id: domainId,
          name: domainName,
          version: domainVersion,
          markdown: '',
          services: [{ id: serviceId, version: serviceVersion }],
        });
      } else {
        await addServiceToDomain(domainId, { id: serviceId, version: serviceVersion }, domainVersion);
      }
    }

    // Find events/commands
    for (const operation of operations) {
      for (const message of operation.messages()) {
        // Is the message an event, query or command (default to event)
        const eventType = message.headers()?.property('ec-message-type')?.default() || 'event';

        const messageId = message.id().toLowerCase();

        let messageMarkdown = generateMarkdownForMessage(document, message);
        const writeMessage = eventType === 'event' ? writeEvent : writeCommand;
        const versionMessage = eventType === 'event' ? versionEvent : versionCommand;
        const getMessage = eventType === 'event' ? getEvent : getCommand;
        const addSchemaToMessage = eventType === 'event' ? addSchemaToEvent : addSchemaToCommand;
        const badges = message.tags().all() || [];

        // Check if the message already exists in the catalog
        const catalogedMessage = await getMessage(message.id().toLowerCase(), 'latest');

        if (catalogedMessage) {
          messageMarkdown = catalogedMessage.markdown;
          // if the version matches, we can override the message but keep markdown as it  was
          if (catalogedMessage.version === serviceVersion) {
            await rmEventById(messageId, serviceVersion);
          } else {
            // if the version does not match, we need to version the message
            await versionMessage(messageId);
          }
        }

        // Write the message to the catalog
        await writeMessage(
          {
            id: messageId,
            version: serviceVersion,
            name: message.id(),
            summary: message.hasDescription() ? message.description() : '',
            markdown: messageMarkdown,
            badges: badges.map((badge) => ({ content: badge.name(), textColor: 'blue', backgroundColor: 'blue' })),
          },
          {
            path: message.id(),
          }
        );

        // Check if the message has a payload, if it does then document in EventCatalog
        if (message.hasPayload() && message.schemaFormat()) {
          const extension = getFileExtentionFromSchemaFormat(message.schemaFormat());
          addSchemaToMessage(
            messageId,
            {
              fileName: `schema.${extension}`,
              schema: JSON.stringify(message.payload()?.json(), null, 4),
            },
            serviceVersion
          );
        }

        // Add the message to the correct array
        if (operation.action() === 'send' || operation.action() === 'publish') {
          sends.push({ id: messageId, version: serviceVersion });
        }
        if (operation.action() === 'receive' || operation.action() === 'subscribe') {
          receives.push({ id: messageId, version: serviceVersion });
        }
      }
    }

    // Check if service is already defined... if the versions do not match then create service.
    const latestServiceInCatalog = await getService(serviceId, 'latest');

    // Found a service, and versions do not match, we need to version the one already there
    if (latestServiceInCatalog && latestServiceInCatalog.version !== serviceVersion) {
      await versionService(serviceId);
    }

    // Match found, override it
    if (latestServiceInCatalog && latestServiceInCatalog.version === serviceVersion) {
      serviceMarkdown = latestServiceInCatalog.markdown;
      await rmService(document.info().title());
    }

    await writeService(
      {
        id: serviceId,
        name: document.info().title(),
        version: serviceVersion,
        summary: document.info().hasDescription() ? document.info().description() : '',
        badges: documentTags.map((tag) => ({ content: tag.name(), textColor: 'blue', backgroundColor: 'blue' })),
        markdown: serviceMarkdown,
        sends,
        receives,
      },
      { path: document.info().title() }
    );
  }
};
