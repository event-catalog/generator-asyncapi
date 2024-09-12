---
id: orders-service
name: Orders Service
version: 1.0.1
summary: This service is in charge of processing orders
badges: []
sends:
  - id: ordercreated
    version: 1.0.1
  - id: orderupdated
    version: 1.0.1
  - id: ordercancelled
    version: 1.0.1
  - id: ordercompleted
    version: 1.0.1
receives:
  - id: paymentprocessed
    version: 1.0.1
  - id: inventoryreserved
    version: 1.0.1
  - id: shipmentdelivered
    version: 1.0.1
schemaPath: orders-service.yml
specifications:
  asyncapiPath: orders-service.yml
---
This service is in charge of processing orders  

## Architecture diagram
<NodeGraph />
