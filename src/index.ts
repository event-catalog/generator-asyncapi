// import utils from '@eventcatalog/sdk';
import { MessageInterface, Parser } from '@asyncapi/parser';
const parser = new Parser();
import { readFile } from 'node:fs/promises';
import utils from '@eventcatalog/sdk';
import slugify from 'slugify';
import { defaultMarkdown as generateMarkdownForMessage, getSummary as getMessageSummary } from './utils/messages';
import { defaultMarkdown as generateMarkdownForService, getSummary as getServiceSummary } from './utils/services';
import { defaultMarkdown as generateMarkdownForDomain } from './utils/domains';
import { getFileExtentionFromSchemaFormat } from './utils/schemas';

type Domain = {
  id: string;
  name: string;
};

type Props = {
  path: string | string[];
  domain?: Domain;
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
    rmCommandById,
    versionCommand,
    versionEvent,
    addSchemaToCommand,
    addSchemaToEvent,
    versionDomain,
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
    const version = document.info().version();

    // What messages does this service send and receive
    const sends = [];
    const receives = [];

    let serviceMarkdown = generateMarkdownForService(document);

    // Manage domain
    if (options.domain) {
      // Try and get the domain
      const domain = await getDomain(options.domain.id, version || 'latest');
      const currentDomain = await getDomain(options.domain.id, 'latest');
      const { id: domainId, name: domainName } = options.domain;

      // Found a domain, but the versions do not match
      if (currentDomain && currentDomain.version !== version) {
        await versionDomain(domainId);
      }

      // Do we need to create a new domain?
      if (!domain || (domain && domain.version !== version)) {
        await writeDomain({
          id: domainId,
          name: domainName,
          version,
          markdown: generateMarkdownForDomain(document),
          services: [{ id: serviceId, version: version }],
        });
      }

      // Add the service to the domain
      await addServiceToDomain(domainId, { id: serviceId, version: version }, version);
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
        const rmMessageById = eventType === 'event' ? rmEventById : rmCommandById;
        const addSchemaToMessage = eventType === 'event' ? addSchemaToEvent : addSchemaToCommand;
        const badges = message.tags().all() || [];

        // Check if the message already exists in the catalog
        const catalogedMessage = await getMessage(message.id().toLowerCase(), 'latest');

        if (catalogedMessage) {
          messageMarkdown = catalogedMessage.markdown;
          // if the version matches, we can override the message but keep markdown as it  was
          if (catalogedMessage.version === version) {
            await rmMessageById(messageId, version);
          } else {
            // if the version does not match, we need to version the message
            await versionMessage(messageId);
          }
        }

        // Write the message to the catalog
        await writeMessage(
          {
            id: messageId,
            version: version,
            name: message.hasTitle() && message.title() ? (message.title() as string) : message.id(),
            summary: getMessageSummary(message),
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
            version
          );
        }

        // Add the message to the correct array
        if (operation.action() === 'send' || operation.action() === 'publish') {
          receives.push({ id: messageId, version: version });
        }
        if (operation.action() === 'receive' || operation.action() === 'subscribe') {
          sends.push({ id: messageId, version: version });
        }
      }
    }

    // Check if service is already defined... if the versions do not match then create service.
    const latestServiceInCatalog = await getService(serviceId, 'latest');

    if (latestServiceInCatalog) {
      serviceMarkdown = latestServiceInCatalog.markdown;
      // Found a service, and versions do not match, we need to version the one already there
      if (latestServiceInCatalog.version !== version) {
        await versionService(serviceId);
      }

      // Match found, override it
      if (latestServiceInCatalog.version === version) {
        serviceMarkdown = latestServiceInCatalog.markdown;
        await rmService(document.info().title());
      }
    }

    await writeService(
      {
        id: serviceId,
        name: document.info().title(),
        version: version,
        summary: getServiceSummary(document),
        badges: documentTags.map((tag) => ({ content: tag.name(), textColor: 'blue', backgroundColor: 'blue' })),
        markdown: serviceMarkdown,
        sends,
        receives,
      },
      { path: document.info().title() }
    );
  }
};
