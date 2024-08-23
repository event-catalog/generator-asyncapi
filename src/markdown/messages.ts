import { MessageInterface, AsyncAPIDocumentInterface } from '@asyncapi/parser';

export const defaultMarkdown = (document: AsyncAPIDocumentInterface, message: MessageInterface) => {
  return `
# Architecture
<NodeGraph />

${
  message.externalDocs()
    ? `
## External documentation
[${message.externalDocs()?.description}](${message.externalDocs()?.url()})
`
    : ''
}

`;
};
