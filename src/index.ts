// import utils from '@eventcatalog/sdk';
import { AsyncAPIDocumentInterface, MessageInterface, Parser, fromFile, fromURL } from '@asyncapi/parser';
import utils from '@eventcatalog/sdk';
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
import { z } from 'zod';

// AsyncAPI Parsers
import { AvroSchemaParser } from '@asyncapi/avro-schema-parser';
import path from 'path';
import { EventType, MessageOperations } from './types';

const parser = new Parser();

// register avro schema support
parser.registerSchemaParser(AvroSchemaParser());
const cliArgs = argv(process.argv.slice(2));

const optionsSchema = z.object({
  services: z.array(
    z.object({
      id: z.string({ required_error: 'The service id is required. please provide the service id' }),
      path: z.string({ required_error: 'The service path is required. please provide the path to specification file' }),
      name: z.string().optional(),
    }),
    { message: 'Please provide correct services configuration' }
  ),
  domain: z
    .object({
      id: z.string({ required_error: 'The domain id is required. please provide a domain id' }),
      name: z.string({ required_error: 'The domain name is required. please provide a domain name' }),
      version: z.string({ required_error: 'The domain version is required. please provide a domain version' }),
    })
    .optional(),
  debug: z.boolean().optional(),
  saveParsedSpecFile: z.boolean({ invalid_type_error: 'The saveParsedSpecFile is not a boolean in options' }).optional(),
});

type Props = z.infer<typeof optionsSchema>;
type Domain = z.infer<typeof optionsSchema>['domain'];
type Service = z.infer<typeof optionsSchema>['services'][0];

const validateOptions = (options: Props) => {
  try {
    optionsSchema.parse(options);
  } catch (error: any) {
    if (error instanceof z.ZodError) throw new Error(JSON.stringify(error.issues, null, 2));
  }
};

export default async (config: any, options: Props) => {
  if (!process.env.PROJECT_DIR) {
    throw new Error('Please provide catalog url (env variable PROJECT_DIR)');
  }

  const {
    writeService,
    writeEvent,
    writeCommand,
    writeQuery,
    getService,
    versionService,
    rmService,
    getDomain,
    writeDomain,
    addServiceToDomain,
    getCommand,
    getEvent,
    getQuery,
    rmEventById,
    rmCommandById,
    rmQueryById,
    versionCommand,
    versionEvent,
    versionQuery,
    addSchemaToCommand,
    addSchemaToEvent,
    addSchemaToQuery,
    addFileToService,
    versionDomain,
    getSpecificationFilesForService,
  } = utils(process.env.PROJECT_DIR);

  // Define the message operations mapping with proper types
  const MESSAGE_OPERATIONS: Record<EventType, MessageOperations> = {
    event: {
      write: writeEvent,
      version: versionEvent,
      get: getEvent,
      remove: rmEventById,
      addSchema: addSchemaToEvent,
    },
    command: {
      write: writeCommand,
      version: versionCommand,
      get: getCommand,
      remove: rmCommandById,
      addSchema: addSchemaToCommand,
    },
    query: {
      write: writeQuery,
      version: versionQuery,
      get: getQuery,
      remove: rmQueryById,
      addSchema: addSchemaToQuery,
    },
  };

  // Should the file that is written to the catalog be parsed (https://github.com/asyncapi/parser-js) or as it is?
  validateOptions(options);
  const { services, saveParsedSpecFile = false } = options;
  // const asyncAPIFiles = Array.isArray(options.path) ? options.path : [options.path];
  console.log(chalk.green(`Processing ${services.length} AsyncAPI files...`));
  for (const service of services) {
    console.log(chalk.gray(`Processing ${service.path}`));

    const { document, diagnostics } = service.path.startsWith('http')
      ? await fromURL(parser, service.path).parse()
      : await fromFile(parser, service.path).parse();

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

    const serviceId = service.id;

    const serviceName = service.name || document.info().title();
    const version = document.info().version();

    // What messages does this service send and receive
    let sends = [];
    let receives = [];

    let serviceSpecifications = {};
    let serviceSpecificationsFiles = [];
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
        const eventType = (message.extensions().get('x-eventcatalog-message-type')?.value() as EventType) || 'event';
        const messageVersion = message.extensions().get('x-eventcatalog-message-version')?.value() || version;

        // does this service own or just consume the message?
        const serviceOwnsMessageContract = isServiceMessageOwner(message);
        const isReceived = operation.action() === 'receive' || operation.action() === 'receive';
        const isSent = operation.action() === 'send' || operation.action() === 'publish';

        const messageId = message.id().toLowerCase();

        if (eventType !== 'event' && eventType !== 'command' && eventType !== 'query') {
          throw new Error('Invalid message type');
        }

        const {
          write: writeMessage,
          version: versionMessage,
          get: getMessage,
          remove: rmMessageById,
          addSchema: addSchemaToMessage,
        } = MESSAGE_OPERATIONS[eventType];

        let messageMarkdown = generateMarkdownForMessage(document, message);
        const badges = message.tags().all() || [];

        console.log(chalk.blue(`Processing message: ${getMessageName(message)} (v${messageVersion})`));

        if (serviceOwnsMessageContract) {
          // Check if the message already exists in the catalog
          const catalogedMessage = await getMessage(message.id().toLowerCase(), 'latest');

          if (catalogedMessage) {
            messageMarkdown = catalogedMessage.markdown;
            // if the version matches, we can override the message but keep markdown as it  was
            if (catalogedMessage.version === messageVersion) {
              await rmMessageById(messageId, messageVersion);
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
              version: messageVersion,
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

          console.log(chalk.cyan(` - Message (v${messageVersion}) created`));
          // Check if the message has a payload, if it does then document in EventCatalog
          if (messageHasSchema(message)) {
            // Get the schema from the original payload if it exists
            const schema = message.payload()?.extensions()?.get('x-parser-original-payload')?.json() || message.payload()?.json();

            addSchemaToMessage(
              messageId,
              {
                fileName: getSchemaFileName(message),
                schema: JSON.stringify(schema, null, 4),
              },
              messageVersion
            );
            console.log(chalk.cyan(` - Schema added to message (v${messageVersion})`));
          }
        } else {
          // Message is not owned by this service, therefore we don't need to document it
          console.log(chalk.yellow(` - Skipping external message: ${getMessageName(message)}(v${messageVersion})`));
        }
        // Add the message to the correct array
        if (isSent) sends.push({ id: messageId, version: messageVersion });
        if (isReceived) receives.push({ id: messageId, version: messageVersion });
      }
    }

    // Check if service is already defined... if the versions do not match then create service.
    const latestServiceInCatalog = await getService(serviceId, 'latest');

    console.log(chalk.blue(`Processing service: ${serviceId} (v${version})`));

    if (latestServiceInCatalog) {
      serviceMarkdown = latestServiceInCatalog.markdown;
      // Found a service, and versions do not match, we need to version the one already there
      if (latestServiceInCatalog.version !== version) {
        await versionService(serviceId);
        console.log(chalk.cyan(` - Versioned previous service (v${latestServiceInCatalog.version})`));
      }

      // Match found, override it
      if (latestServiceInCatalog.version === version) {
        // we want to preserve the markdown any any spec files that are already there
        serviceMarkdown = latestServiceInCatalog.markdown;
        serviceSpecifications = latestServiceInCatalog.specifications ?? {};
        sends = latestServiceInCatalog.sends ? [...latestServiceInCatalog.sends, ...sends] : sends;
        receives = latestServiceInCatalog.receives ? [...latestServiceInCatalog.receives, ...receives] : receives;
        serviceSpecificationsFiles = await getSpecificationFilesForService(serviceId, version);
        await rmService(serviceId);
      }
    }

    const fileName = path.basename(service.path);

    await writeService({
      id: serviceId,
      name: serviceName,
      version: version,
      summary: getServiceSummary(document),
      badges: documentTags.map((tag) => ({ content: tag.name(), textColor: 'blue', backgroundColor: 'blue' })),
      markdown: serviceMarkdown,
      sends,
      receives,
      schemaPath: fileName || 'asyncapi.yml',
      specifications: {
        ...serviceSpecifications,
        asyncapiPath: fileName || 'asyncapi.yml',
      },
    });

    // What files need added to the service (speficiation files)
    const specFiles = [
      // add any previous spec files to the list
      ...serviceSpecificationsFiles,
      {
        content: saveParsedSpecFile ? getParsedSpecFile(service, document) : await getRawSpecFile(service),
        fileName: path.basename(service.path) || 'asyncapi.yml',
      },
    ];

    for (const specFile of specFiles) {
      await addFileToService(
        serviceId,
        {
          fileName: specFile.fileName,
          content: specFile.content,
        },
        version
      );
    }

    console.log(chalk.cyan(` - Service (v${version}) created`));

    console.log(chalk.green(`\nFinished generating event catalog for AsyncAPI ${serviceId} (v${version})`));
  }

  await checkLicense();
};

const getParsedSpecFile = (service: Service, document: AsyncAPIDocumentInterface) => {
  const isSpecFileJSON = service.path.endsWith('.json');
  return isSpecFileJSON
    ? JSON.stringify(document.meta().asyncapi.parsed, null, 4)
    : yaml.dump(document.meta().asyncapi.parsed, { noRefs: true });
};

const getRawSpecFile = async (service: Service) => {
  if (service.path.startsWith('http')) {
    try {
      const response = await fetch(service.path);
      return response.text();
    } catch (error) {
      console.log(chalk.red(`\nFailed to request AsyncAPI file from ${service.path}`));
      return '';
    }
  } else {
    return await readFile(service.path, 'utf8');
  }
};
/**
 * Is the AsyncAPI specification (service) the owner of the message?
 * This is determined by the 'x-eventcatalog-role' extension in the message
 *
 * @param message
 * @returns boolean
 *
 * default is provider (AsyncAPI file / service owns the message)
 */
const isServiceMessageOwner = (message: MessageInterface): boolean => {
  const value = message.extensions().get('x-eventcatalog-role')?.value() || 'provider';
  return value === 'provider';
};
