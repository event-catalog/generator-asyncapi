// import utils from '@eventcatalog/sdk';
import { Parser, fromFile } from '@asyncapi/parser';
import utils from '@eventcatalog/sdk';
import slugify from 'slugify';
import { readFile } from 'node:fs/promises';
import {
  defaultMarkdown as generateMarkdownForMessage,
  getMessageName,
  getSummary as getMessageSummary,
  getSchemaFileName,
  messageHasSchema,
} from './utils/messages';
import { defaultMarkdown as generateMarkdownForService, getSummary as getServiceSummary } from './utils/services';
import { defaultMarkdown as generateMarkdownForDomain } from './utils/domains';
import chalk from 'chalk';
import checkLicense from './checkLicense';
import argv from 'minimist';
import yaml from 'js-yaml';

// AsyncAPI Parsers
import { AvroSchemaParser } from '@asyncapi/avro-schema-parser';
import { join } from 'node:path';

const parser = new Parser();

// register avro schema support
parser.registerSchemaParser(AvroSchemaParser());

const cliArgs = argv(process.argv.slice(2));

type Domain = {
  id: string;
  name: string;
  version: string;
};

type Service = {
  id?: string;
  path: string;
  folderName?: string;
};

type Props = {
  services: Service[];
  domain?: Domain;
  debug?: boolean;
  saveParsedSpecFile?: boolean;
};

const loadSpecFiles = (specifications: {}, speciFiles: { fileName: string; content: string }[], service: Service) => {
  Object.values(specifications).map(async (value) => {
    if (typeof value === 'string') {
      speciFiles.push({
        fileName: value,
        content: await readFile(join(service.path.split('/').slice(0, -1).join('/'), value), 'utf8'),
      });
    }
  });
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
    addFileToService,
    versionDomain,
  } = utils(process.env.PROJECT_DIR);

  const services = options.services;
  // const asyncAPIFiles = Array.isArray(options.path) ? options.path : [options.path];

  console.log(chalk.green(`Processing ${services.length} AsyncAPI files...`));

  for (const service of services) {
    console.log(chalk.gray(`Processing ${service.path}`));

    const { document, diagnostics } = await fromFile(parser, service.path).parse();

    if (!document) {
      console.log(chalk.red('Failed to parse AsyncAPI file'));
      if (options.debug || cliArgs.debug) {
        console.log(diagnostics);
      } else {
        console.log(chalk.red('Run with debug option in the generator to see diagnostics'));
      }
      continue;
    }

    const operations = document.allOperations();
    const documentTags = document.info().tags().all() || [];

    const serviceId = service.id || slugify(document.info().title(), { lower: true, strict: true });
    const version = document.info().version();

    // What messages does this service send and receive
    const sends = [];
    const receives = [];
    let specifications = {};
    const speciFiles: { fileName: string; content: string }[] = [];
    let serviceMarkdown = generateMarkdownForService(document);

    // Manage domain
    if (options.domain) {
      // Try and get the domain
      const { id: domainId, name: domainName, version: domainVersion } = options.domain;
      const domain = await getDomain(options.domain.id, domainVersion || 'latest');
      const currentDomain = await getDomain(options.domain.id, 'latest');

      console.log(chalk.blue(`\nProcessing domain: ${domainName} (v${domainVersion})`));

      // Found a domain, but the versions do not match
      if (currentDomain && currentDomain.version !== domainVersion) {
        await versionDomain(domainId);
        console.log(chalk.cyan(` - Versioned previous domain (v${currentDomain.version})`));
      }

      // Do we need to create a new domain?
      if (!domain || (domain && domain.version !== domainVersion)) {
        await writeDomain({
          id: domainId,
          name: domainName,
          version: domainVersion,
          markdown: generateMarkdownForDomain(document),
          // services: [{ id: serviceId, version: version }],
        });
        console.log(chalk.cyan(` - Domain (v${domainVersion}) created`));
      }

      if (currentDomain && currentDomain.version === domainVersion) {
        console.log(chalk.yellow(` - Domain (v${domainVersion}) already exists, skipped creation...`));
      }

      // Add the service to the domain
      await addServiceToDomain(domainId, { id: serviceId, version: version }, domainVersion);
    }

    // Find events/commands
    for (const operation of operations) {
      for (const message of operation.messages()) {
        const eventType = message.extensions().get('x-eventcatalog-message-type')?.value() || 'event';

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

        console.log(chalk.blue(`Processing message: ${getMessageName(message)} (v${version})`));

        if (catalogedMessage) {
          messageMarkdown = catalogedMessage.markdown;
          // if the version matches, we can override the message but keep markdown as it  was
          if (catalogedMessage.version === version) {
            await rmMessageById(messageId, version);
          } else {
            // if the version does not match, we need to version the message
            await versionMessage(messageId);
            console.log(chalk.cyan(` - Versioned previous message: (v${catalogedMessage.version})`));
          }
        }

        // Write the message to the catalog
        await writeMessage(
          {
            id: messageId,
            version: version,
            name: getMessageName(message),
            summary: getMessageSummary(message),
            markdown: messageMarkdown,
            badges: badges.map((badge) => ({ content: badge.name(), textColor: 'blue', backgroundColor: 'blue' })),
            schemaPath: messageHasSchema(message) ? getSchemaFileName(message) : undefined,
          },
          {
            path: message.id(),
          }
        );

        console.log(chalk.cyan(` - Message (v${version}) created`));

        // Check if the message has a payload, if it does then document in EventCatalog
        if (messageHasSchema(message)) {
          addSchemaToMessage(
            messageId,
            {
              fileName: getSchemaFileName(message),
              schema: JSON.stringify(message.payload()?.json(), null, 4),
            },
            version
          );
          console.log(chalk.cyan(` - Schema added to message (v${version})`));
        }

        // Add the message to the correct array
        if (operation.action() === 'send' || operation.action() === 'publish') {
          sends.push({ id: messageId, version: version });
        }
        if (operation.action() === 'receive' || operation.action() === 'subscribe') {
          receives.push({ id: messageId, version: version });
        }
      }
    }

    // Check if service is already defined... if the versions do not match then create service.
    const latestServiceInCatalog = await getService(serviceId, 'latest');

    console.log(chalk.blue(`Processing service: ${document.info().title()} (v${version})`));

    if (latestServiceInCatalog) {
      serviceMarkdown = latestServiceInCatalog.markdown;
      // Found a service, and versions do not match, we need to version the one already there
      if (latestServiceInCatalog.version !== version) {
        await versionService(serviceId);
        console.log(chalk.cyan(` - Versioned previous service (v${latestServiceInCatalog.version})`));
      }

      // Match found, override it
      if (latestServiceInCatalog.version === version) {
        serviceMarkdown = latestServiceInCatalog.markdown;
        specifications = latestServiceInCatalog.specifications ?? {};
        loadSpecFiles(specifications, speciFiles, service);
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
        schemaPath: service.path.split('/').pop() || 'asyncapi.yml',
        specifications: {
          ...specifications,
          asyncapiPath: service.path.split('/').pop() || 'asyncapi.yml',
        },
      },
      { path: service.folderName || document.info().title() }
    );

    speciFiles.map(async (value) => {
      await addFileToService(serviceId, value, version);
    });
    await addFileToService(
      serviceId,
      {
        fileName: service.path.split('/').pop() || 'asyncapi.yml',
        content:
          (options.saveParsedSpecFile ?? true)
            ? service.path.endsWith('.json')
              ? JSON.stringify(document.meta().asyncapi.parsed, null, 4)
              : yaml.dump(document.meta().asyncapi.parsed, { noRefs: true })
            : await readFile(service.path, 'utf8'),
      },
      version
    );

    console.log(chalk.cyan(` - Service (v${version}) created`));

    console.log(chalk.green(`\nFinished generating event catalog for AsyncAPI ${document.info().title()} (v${version})`));
  }

  await checkLicense();
};
