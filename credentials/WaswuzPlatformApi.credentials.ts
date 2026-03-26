import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';
import { brandConfig } from '../config/brand.config';

export class WaswuzPlatformApi implements ICredentialType {
	name = brandConfig.credentialId;
	displayName = `${brandConfig.displayName} API`;
	documentationUrl = brandConfig.documentationUrl;
	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: `Your ${brandConfig.displayName} API key (starts with ${brandConfig.apiKeyPrefix})`,
			placeholder: brandConfig.apiKeyPlaceholder,
		},
		{
			displayName: 'API Base URL',
			name: 'baseUrl',
			type: 'string',
			default: brandConfig.apiBaseUrl,
			required: true,
			description: '⚠️ WARNING: Only change this URL if you know what you\'re doing. Your API key will be sent to this URL. Changing this to an untrusted URL could expose your credentials.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/health',
			method: 'GET',
		},
	};
}
