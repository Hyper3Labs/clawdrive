# Security Checklist

## API Security
- [x] Bearer token authentication
- [x] Rate limiting on search endpoint
- [ ] Input sanitization for file names
- [ ] File type validation on upload
- [ ] Max file size enforcement

## Data Protection
- [x] SQLite WAL mode for crash safety
- [ ] Encrypt embeddings at rest
- [ ] Audit log for file access
- [ ] Automatic backup rotation

## Agent Security
- [ ] A2A mutual TLS
- [ ] MCP tool permission scoping
- [ ] Per-agent storage quotas
- [ ] Session token rotation
