import {
	IDataObject,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	NodeOperationError,
} from 'n8n-workflow';

const authenticationOptions: INodePropertyOptions[] = [
	{
		name: 'None',
		value: 'none',
		description: 'Accept any OpenClaw webhook request',
	},
	{
		name: 'Header Secret',
		value: 'headerSecret',
		description: 'Require a shared secret in a request header',
	},
];

function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
	if (Array.isArray(value)) {
		return value[0];
	}

	return value;
}

export class OpenClawWebhook implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'OpenClaw Webhook',
		name: 'openClawWebhook',
		icon: 'file:icon.svg',
		group: ['trigger'],
		version: 1,
		description: 'Receive incoming webhook events from OpenClaw and acknowledge them immediately',
		defaults: {
			name: 'OpenClaw Webhook',
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: 'openClawWebhookAuth',
				required: false,
				displayOptions: {
					show: {
						authentication: ['headerSecret'],
					},
				},
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				path: '={{$parameter["path"]}}',
				responseMode: 'onReceived',
				responseData: 'noData',
				responseContentType: '={{$parameter["responseContentType"]}}',
				nodeType: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Path',
				name: 'path',
				type: 'string',
				default: 'openclaw',
				required: true,
				description: 'The webhook path appended to the base production or test URL',
			},
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: authenticationOptions,
				default: 'none',
				description: 'How incoming requests should be verified before they are acknowledged',
			},
			{
				displayName: 'Response Content Type',
				name: 'responseContentType',
				type: 'options',
				options: [
					{
						name: 'Plain Text',
						value: 'text/plain',
					},
					{
						name: 'JSON',
						value: 'application/json',
					},
				],
				default: 'text/plain',
				description: 'The content type returned immediately to OpenClaw',
			},
			{
				displayName: 'Response Body',
				name: 'responseBody',
				type: 'string',
				default: 'ok',
				displayOptions: {
					show: {
						responseContentType: ['text/plain'],
					},
				},
				description: 'Plain-text acknowledgement returned immediately to OpenClaw',
			},
			{
				displayName: 'Response JSON',
				name: 'responseJson',
				type: 'json',
				default: '{ "success": true }',
				displayOptions: {
					show: {
						responseContentType: ['application/json'],
					},
				},
				description: 'JSON acknowledgement returned immediately to OpenClaw',
			},
		],
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const authentication = this.getNodeParameter('authentication') as string;
		const headers = this.getHeaderData();
		const body = this.getBodyData();
		const request = this.getRequestObject();

		if (authentication === 'headerSecret') {
			const credentials = await this.getCredentials('openClawWebhookAuth');
			const secretHeaderName = (credentials.secretHeaderName as string).toLowerCase();
			const secretValue = credentials.secretValue as string;
			const incomingSecret = normalizeHeaderValue(headers[secretHeaderName]);

			if (!secretHeaderName || !secretValue) {
				throw new NodeOperationError(
					this.getNode(),
					'OpenClaw webhook credential is not configured',
					{
						description:
							'Set both "Secret Header Name" and "Secret Value" in the "OpenClaw Webhook Auth" credential.',
					},
				);
			}

			if (!incomingSecret || incomingSecret !== secretValue) {
				throw new NodeOperationError(this.getNode(), 'Webhook secret validation failed', {
					description: `The "${secretHeaderName}" header did not match the configured secret.`,
				});
			}
		}

		const responseContentType = this.getNodeParameter('responseContentType') as string;
		const responseBody =
			responseContentType === 'application/json'
				? (this.getNodeParameter('responseJson') as IDataObject)
				: (this.getNodeParameter('responseBody') as string);
		const payload: IDataObject = {
			body,
			headers: headers as unknown as IDataObject,
			query: this.getQueryData() as IDataObject,
			params: this.getParamsData() as IDataObject,
			method: request.method,
			url: request.originalUrl ?? request.url,
			acknowledgement: {
				contentType: responseContentType,
				body: responseBody,
			},
		};

		return {
			webhookResponse: responseBody,
			workflowData: [[{ json: payload }]],
		};
	}
}
