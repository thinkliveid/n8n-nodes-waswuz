import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class OpenClawWebhookAuth implements ICredentialType {
	name = 'openClawWebhookAuth';
	displayName = 'OpenClaw Webhook Auth';
	documentationUrl = '';
	properties: INodeProperties[] = [
		{
			displayName: 'Secret Header Name',
			name: 'secretHeaderName',
			type: 'string',
			default: 'x-openclaw-secret',
			required: true,
			description: 'The request header that carries the shared secret from OpenClaw',
		},
		{
			displayName: 'Secret Value',
			name: 'secretValue',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'The shared secret that incoming OpenClaw requests must match',
		},
	];
}
