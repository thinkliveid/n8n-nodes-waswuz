# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Added `Webhook Key` to `WaswuzPlatformApi` credentials for webhook signature validation.
- Added `HMAC Signature` webhook authentication mode using the credential `webhookKey`.
- Added webhook settings for `Signature Header Name` and `Signature Prefix`.

### Changed
- Webhook signature validation now computes an HMAC-SHA256 digest from the incoming raw request body when available.
- Added test coverage for valid and invalid HMAC webhook signature verification.
