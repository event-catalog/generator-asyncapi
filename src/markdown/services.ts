import { AsyncAPIDocumentInterface } from '@asyncapi/parser';

export const defaultMarkdown = (document: AsyncAPIDocumentInterface) => {
  return `

# Architecture diagram
<NodeGraph />

${
  document.info().externalDocs()
    ? `
### External documentation
[${document.info().externalDocs()?.description}](${document.info().externalDocs()?.url()})
`
    : ''
}
`;
};
