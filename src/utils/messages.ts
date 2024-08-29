import { MessageInterface, AsyncAPIDocumentInterface } from '@asyncapi/parser';

export const defaultMarkdown = (document: AsyncAPIDocumentInterface, message: MessageInterface) => {
  return `
## Architecture
<NodeGraph />

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
