---
id: account-service
name: Account Service
version: 1.0.0
summary: This service is in charge of processing user signups
badges:
  - content: Events
    textColor: blue
    backgroundColor: blue
  - content: Authentication
    textColor: blue
    backgroundColor: blue
sends:
  - id: usersignedup
    version: 1.0.0
  - id: usersignedout
    version: 1.0.0
receives:
  - id: signupuser
    version: 1.0.0
schemaPath: simple.yml
specifications:
  asyncapiPath: simple.yml
---

