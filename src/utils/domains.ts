import { AsyncAPIDocumentInterface } from '@asyncapi/parser';

export const defaultMarkdown = (document: AsyncAPIDocumentInterface) => {
  return `

## Architecture diagram
<NodeGraph />

`;
};
