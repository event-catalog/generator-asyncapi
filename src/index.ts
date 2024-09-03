// import utils from '@eventcatalog/sdk';
// import { Parser } from '@asyncapi/parser';
// const parser = new Parser();
import utils from '@eventcatalog/sdk';
// import slugify from 'slugify';
import { readFile } from 'node:fs/promises';
import chalk from 'chalk';
import SwaggerParser from '@apidevtools/swagger-parser';
import slugify from 'slugify';
import { defaultMarkdown as generateMarkdownForDomain } from './utils/domains';
import { defaultMarkdown as generateMarkdownForService, getSummary as getServiceSummary } from './utils/services';
import { defaultMarkdown as generateMarkdownForMessage, getSummary as getMessageSummary } from './utils/messages';

import { OpenAPI, OpenAPIV3_1 } from 'openapi-types';
import { getMessageName } from './utils/messages';

type Props = {
  path: string | string[];
  domain?: Domain;
  debug?: boolean;
};

type Domain = {
  id: string;
  name: string;
  version: string;
};

const DEFAULT_MESSAGE_TYPE = 'query';

export type Operation = {
  path: string;
  method: string;
  operationId: string;
  summary?: string;
  description?: string;
  type: string;
  externalDocs?: OpenAPIV3_1.ExternalDocumentationObject;
  tags: string[];
};

async function getOperationsByType(openApiPath: string) {
  try {
    // Parse the OpenAPI document
    const api = await SwaggerParser.validate(openApiPath);

    const operations = [];

    // Iterate through paths
    for (const path in api.paths) {
      const pathItem = api.paths[path];

      // Iterate through each HTTP method in the path
      for (const method in pathItem) {
        // @ts-ignore
        const openAPIOperation = pathItem[method];

        // Check if the x-eventcatalog-message-type field is set
        const messageType = openAPIOperation['x-eventcatalog-message-type'] || DEFAULT_MESSAGE_TYPE;

        const operation = {
          path: path,
          method: method.toUpperCase(),
          operationId: openAPIOperation.operationId,
          externalDocs: openAPIOperation.externalDocs,
          type: messageType,
          description: openAPIOperation.description,
          summary: openAPIOperation.summary,
          tags: openAPIOperation.tags || [],
        } as Operation;

        operations.push(operation);
      }
    }

    return operations;
  } catch (err) {
    console.error('Error parsing OpenAPI document:', err);
    return [];
  }
}

export default async (config: any, options: Props) => {
  if (!process.env.PROJECT_DIR) {
    throw new Error('Please provide catalog url (env variable PROJECT_DIR)');
  }

  const {
    writeEvent,
    getDomain,
    versionDomain,
    writeDomain,
    addServiceToDomain,
    getService,
    versionService,
    rmService,
    writeService,
    addFileToService,
    versionCommand,
    getEvent,
    getCommand,
    rmCommandById,
    rmEventById,
    writeCommand,
  } = utils(process.env.PROJECT_DIR);

  const openAPIFiles = Array.isArray(options.path) ? options.path : [options.path];

  for (const path of openAPIFiles) {
    console.log(chalk.green(`Processing ${path}`));

    try {
      await SwaggerParser.validate(path);
    } catch (error) {
      console.error(chalk.red(`Failed to parse OpenAPI file: ${path}`));
      console.error(chalk.red(error));
      continue;
    }

    const openAPIFile = await readFile(path, 'utf-8');
    const document = await SwaggerParser.parse(path);
    const operations = await getOperationsByType(path);

    const serviceId = slugify(document.info.title, { lower: true, strict: true });
    const version = document.info.version;
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
          markdown: generateMarkdownForDomain(),
        });
        console.log(chalk.cyan(` - Domain (v${domainVersion}) created`));
      }

      if (currentDomain && currentDomain.version === domainVersion) {
        console.log(chalk.yellow(` - Domain (v${domainVersion}) already exists, skipped creation...`));
      }

      // Add the service to the domain
      await addServiceToDomain(domainId, { id: serviceId, version: version }, domainVersion);
    }

    // parse
    // const { document } = await parser.parse(asyncAPIFile);

    // const operations = document.allOperations();
    const documentTags = document.tags || [];

    // // What messages does this service send and receive
    let sends = [];
    const receives = [];

    for (const operation of operations) {
      const messageType = operation.type;
      const messageId = getMessageName(operation);
      let messageMarkdown = generateMarkdownForMessage(operation);
      const versionMessage = versionCommand;
      const getMessage = messageType === 'event' ? getEvent : getCommand;
      const rmMessageById = messageType === 'event' ? rmEventById : rmCommandById;
      const writeMessage = messageType === 'event' ? writeEvent : writeCommand;
      // const addSchemaToMessage = messageType === 'event' ? addSchemaToEvent : addSchemaToCommand;

      // Check if the message already exists in the catalog
      const catalogedMessage = await getMessage(messageId, 'latest');

      console.log(chalk.blue(`Processing message: ${getMessageName(operation)} (v${version})`));

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

      await writeMessage(
        {
          id: messageId,
          version: version,
          name: getMessageName(operation),
          summary: getMessageSummary(operation),
          markdown: messageMarkdown,
          badges: operation.tags.map((badge) => ({ content: badge, textColor: 'blue', backgroundColor: 'blue' })),
        },
        {
          path: messageId,
        }
      );

      // messages will always be messages the service receives
      receives.push({
        id: operation.operationId,
        version: version,
      });

      console.log(chalk.cyan(` - Message (v${version}) created`));
    }

    // Check if service is already defined... if the versions do not match then create service.
    const latestServiceInCatalog = await getService(serviceId, 'latest');
    console.log(chalk.blue(`Processing service: ${document.info.title} (v${version})`));

    if (latestServiceInCatalog) {
      serviceMarkdown = latestServiceInCatalog.markdown;
      sends = latestServiceInCatalog.sends || ([] as any);
      // Found a service, and versions do not match, we need to version the one already there
      if (latestServiceInCatalog.version !== version) {
        await versionService(serviceId);
        console.log(chalk.cyan(` - Versioned previous service (v${latestServiceInCatalog.version})`));
      }

      // Match found, override it
      if (latestServiceInCatalog.version === version) {
        await rmService(document.info.title);
      }
    }

    await writeService(
      {
        id: serviceId,
        name: document.info.title,
        version: version,
        summary: getServiceSummary(document),
        badges: documentTags.map((tag) => ({ content: tag.name, textColor: 'blue', backgroundColor: 'blue' })),
        markdown: serviceMarkdown,
        sends,
        schemaPath: path.split('/').pop() || 'openapi.yml',
        receives,
      },
      { path: document.info.title }
    );

    await addFileToService(
      serviceId,
      {
        fileName: path.split('/').pop() || 'openapi.yml',
        content: openAPIFile,
      },
      version
    );

    console.log(chalk.cyan(` - Service (v${version}) created`));

    console.log(chalk.green(`\nFinished generating event catalog for AsyncAPI ${document.info.title} (v${version})`));
  }
};
