# Changelog

All notable changes to ScraptPress will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-11-12

### Added
- 🔥 Firebase Firestore integration as primary database
- Firebase Admin SDK configuration
- Firestore indexes for optimized queries
- VehicleRepository with 15 Firestore methods
- Structured logger system (Winston)
- **Comprehensive test suite expanded to 54 tests (100% passing)**
  - API Controllers: 8 tests (scraper endpoints, error handling)
  - Authentication Middleware: 6 tests (API key, admin token validation)
  - Validation Middleware: 10 tests (request validation, sanitization)
  - Vehicle Mapper: 2 tests (data transformation)
  - Copart Extractors: 9 tests (VIN, images, highlights, details extraction)
  - VehicleRepository: 16 tests (database operations)
  - VehicleTransformer: 3 tests (API data transformation)
- CONTRIBUTING.md guide
- Organized documentation structure (api/, setup/, deployment/, architecture/)
- SECURITY.md with security policies
- LICENSE file (ISC)
- .gitattributes for line ending normalization

### Changed
- Migrated from PostgreSQL to Firestore
- Collection naming: `vehicles` → `copart_vehicles`
- Replaced all `console.log` with structured logger in core components
- Updated .env.example with detailed setup instructions
- package.json metadata (name: scraptpress, version: 1.1.0)
- Reorganized docs/ into subdirectories
- Test suite restructured and expanded (19 → 54 tests)

### Fixed
- Package.json JSON corruption (duplicate fields)
- Missing Logger import in errorHandler.ts
- TypeScript compilation errors

### Removed
- PostgreSQL dependencies and database/ folder
- Temporary test files (test-sentry.js, test-firestore.js, check-firestore-data.js)
- Test endpoint /api/test-sentry
- Temporary documentation files

### Security
- API Key authentication with timing-safe comparison
- Helmet security headers
- CORS configuration
- Zod input validation
- Rate limiting with Redis

## [1.0.0] - 2025-11-11

### Added
- Initial release
- Copart.com scraping functionality
- Anti-bot detection bypass (Incapsula/WAF)
- Playwright integration for headless scraping
- REST API with Express
- Redis caching
- Sentry error tracking
- Docker support
- GitHub Actions CI/CD pipeline
- Cloud Run deployment configuration
- 35+ vehicle data fields extraction
- 12-13 images per vehicle in 3 resolutions
- VIN extraction from individual lot pages
- Health check endpoints
- GDPR compliance endpoints

### Features
- Multi-strategy scraping (API interception, DOM parsing)
- Automatic headless mode detection for Cloud Run
- TypeScript with strict mode
- Jest testing framework
- Rate limiting
- CORS support

---

## Version History

- **1.1.0** - Firebase Firestore migration, improved logging, better documentation
- **1.0.0** - Initial release with Copart scraping

## Migration Guides

### 1.0.0 → 1.1.0 (PostgreSQL to Firestore)

**Breaking Changes:**
- Database changed from PostgreSQL to Firestore
- Environment variables: `DATABASE_URL` removed, `FIREBASE_SERVICE_ACCOUNT_PATH` added

**Migration Steps:**
1. Create Firebase project
2. Download service account key
3. Update `.env` with Firebase configuration
4. Deploy Firestore indexes: `firebase deploy --only firestore:indexes`
5. Restart application

**Data Migration:**
- No automatic migration available
- PostgreSQL data must be manually exported and imported to Firestore if needed

---

[1.1.0]: https://github.com/RenePerezRodriguez/ScraptPress/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/RenePerezRodriguez/ScraptPress/releases/tag/v1.0.0
