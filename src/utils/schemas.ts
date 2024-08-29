export const getFileExtentionFromSchemaFormat = (format: string | undefined = '') => {
  if (format.includes('avro')) return 'avsc';
  if (format.includes('yml')) return 'yml';
  if (format.includes('json')) return 'json';
  if (format.includes('openapi')) return 'openapi';
  if (format.includes('protobuf')) return 'protobuf';
  if (format.includes('yaml')) return 'yaml';

  return 'json';
};
