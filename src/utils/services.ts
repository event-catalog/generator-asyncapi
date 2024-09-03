import { OpenAPI } from 'openapi-types';

export const defaultMarkdown = (document: OpenAPI.Document) => {
  return `

${document.info.description ? `${document.info.description}` : ''}  

## Architecture diagram
<NodeGraph />

${
  document.externalDocs
    ? `
## External documentation
- [${document.externalDocs.description}](${document.externalDocs.url})
`
    : ''
}
`;
};

export const getSummary = (document: OpenAPI.Document) => {
  const summary = document.info.description ? document.info.description : '';
  return summary && summary.length < 150 ? summary : '';
};
