// Define the types of operations available for each message type
export interface MessageOperations {
  write: (payload: any, options: any) => Promise<void>;
  version: (id: string) => Promise<any>;
  get: (id: string, version: string) => Promise<any>;
  addSchema: (id: string, schema: any, version: any) => Promise<void>;
}

// Define valid event types
export type EventType = 'event' | 'command' | 'query';
