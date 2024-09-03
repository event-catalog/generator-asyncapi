import { MessageInterface, AsyncAPIDocumentInterface } from '@asyncapi/parser';
import { OpenAPI } from 'openapi-types';
import { Operation } from '..';
// import { getFileExtentionFromSchemaFormat } from './schemas';

export const defaultMarkdown = (message: Operation) => {
  return `
## Architecture
<NodeGraph />

${
  message.externalDocs
    ? `
## External documentation
- [${message.externalDocs.description}](${message.externalDocs.url})
`
    : ''
}

`;
};

export const getSummary = (message: Operation) => {
  const messageSummary = message.summary ? message.summary : '';
  const messageDescription = message.description ? message.description : '';

  let eventCatalogMessageSummary = messageSummary;

  if (!eventCatalogMessageSummary) {
    eventCatalogMessageSummary = messageDescription && messageDescription.length < 150 ? messageDescription : '';
  }

  return eventCatalogMessageSummary;
};

// export const messageHasSchema = (message: Operation) => {
//   return message.hasPayload() && message.schemaFormat();
// };

// export const getSchemaFileName = (message: Operation) => {
//   const extension = getFileExtentionFromSchemaFormat(message.schemaFormat());
//   return `schema.${extension}`;
// };

export const getMessageName = (message: Operation) => {
  return message.operationId;
};
