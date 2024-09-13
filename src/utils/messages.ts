import { MessageInterface, AsyncAPIDocumentInterface } from '@asyncapi/parser';
import { getFileExtentionFromSchemaFormat } from './schemas';

export const defaultMarkdown = (document: AsyncAPIDocumentInterface, message: MessageInterface) => {
  return `
## Architecture
<NodeGraph />

${
  messageHasSchema(message) && messageIsJSON(message)
    ? `
## Schema
<SchemaViewer file="${getSchemaFileName(message)}" title="Message Schema" maxHeight="500" />
`
    : ''
}
${
  messageHasSchema(message) && !messageIsJSON(message)
    ? `
## Schema
<Schema file="${getSchemaFileName(message)}" title="Message Schema" maxHeight="500" />
`
    : ''
}

${
  message.externalDocs()
    ? `
## External documentation
- [${message.externalDocs()?.description()}](${message.externalDocs()?.url()})
`
    : ''
}

`;
};

export const getSummary = (message: MessageInterface) => {
  const messageSummary = message.hasSummary() ? message.summary() : '';
  const messageDescription = message.hasDescription() ? message.description() : '';

  let eventCatalogMessageSummary = messageSummary;

  if (!eventCatalogMessageSummary) {
    eventCatalogMessageSummary = messageDescription && messageDescription.length < 150 ? messageDescription : '';
  }

  return eventCatalogMessageSummary;
};

export const messageHasSchema = (message: MessageInterface) => {
  return message.hasPayload() && message.schemaFormat();
};

export const messageIsJSON = (message: MessageInterface) => {
  const fileName = getSchemaFileName(message);
  return fileName.endsWith('.json');
};

export const getSchemaFileName = (message: MessageInterface) => {
  const extension = getFileExtentionFromSchemaFormat(message.schemaFormat());
  return `schema.${extension}`;
};

export const getMessageName = (message: MessageInterface) => {
  return message.hasTitle() && message.title() ? (message.title() as string) : message.id();
};
