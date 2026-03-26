export interface BrandConfig {
	// Display & Identity
	displayName: string;
	nodeId: string;
	credentialId: string;
	description: string;

	// URLs
	apiBaseUrl: string;
	documentationUrl: string;
	homepage: string;

	// Support
	supportEmail: string;
	author: string;

	// API Key
	apiKeyPrefix: string;
	apiKeyPlaceholder: string;
}

/**
 * Get brand configuration from environment variables with defaults
 */
export function getBrandConfig(): BrandConfig {
	const displayName = process.env.N8N_NODE_BRAND_NAME || 'WaswuzPlatform';
	const brandId = process.env.N8N_NODE_BRAND_ID || 'WaswuzPlatform';
	const apiKeyPrefix = process.env.N8N_NODE_API_KEY_PREFIX || 'wws_live_';

	return {
		// Display & Identity
		displayName,
		nodeId: brandId,
		credentialId: `${brandId}Api`,
		description: process.env.N8N_NODE_DESCRIPTION ||
			'Send WhatsApp, Instagram & Messenger messages with interactive buttons, flexible customer lookup, and typing indicators',

		// URLs
		apiBaseUrl: process.env.N8N_NODE_API_BASE_URL || 'https://api.waswuz.com/api/v1/public',
		documentationUrl: process.env.N8N_NODE_DOCS_URL || 'https://docs.waswuz.com/developers',
		homepage: process.env.N8N_NODE_HOMEPAGE || 'https://waswuz.com',

		// Support
		supportEmail: process.env.N8N_NODE_SUPPORT_EMAIL || 'support@waswuz.com',
		author: process.env.N8N_NODE_AUTHOR || displayName,

		// API Key
		apiKeyPrefix,
		apiKeyPlaceholder: `${apiKeyPrefix}your_api_key_here`,
	};
}

// Export singleton instance for use in node/credentials
export const brandConfig = getBrandConfig();
