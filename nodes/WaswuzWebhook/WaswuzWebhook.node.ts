import {
	IDataObject,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	NodeOperationError,
} from 'n8n-workflow';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { brandConfig } from '../../config/brand.config';

const authenticationOptions: INodePropertyOptions[] = [
	{
		name: 'None',
		value: 'none',
		description: 'Accept any webhook request',
	},
	{
		name: 'Header Secret',
		value: 'headerSecret',
		description: 'Require a shared secret in a request header',
	},
	{
		name: 'HMAC Signature',
		value: 'hmacSignature',
		description: 'Validate an HMAC signature header using the credential webhook key',
	},
];

function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
	if (Array.isArray(value)) {
		return value[0];
	}

	return value;
}

function getRawRequestBody(request: { rawBody?: unknown; body?: unknown }, body: IDataObject): Buffer {
	if (Buffer.isBuffer(request.rawBody)) {
		return request.rawBody;
	}

	if (typeof request.rawBody === 'string') {
		return Buffer.from(request.rawBody, 'utf8');
	}

	if (Buffer.isBuffer(request.body)) {
		return request.body;
	}

	if (typeof request.body === 'string') {
		return Buffer.from(request.body, 'utf8');
	}

	return Buffer.from(JSON.stringify(body ?? {}), 'utf8');
}

function getRawRequestBodyIfAvailable(
	request: { rawBody?: unknown; body?: unknown },
	body: IDataObject,
): Buffer | undefined {
	if (
		Buffer.isBuffer(request.rawBody) ||
		typeof request.rawBody === 'string' ||
		Buffer.isBuffer(request.body) ||
		typeof request.body === 'string'
	) {
		return getRawRequestBody(request, body);
	}

	return undefined;
}

function signaturesMatch(expected: string, incoming: string): boolean {
	const expectedBuffer = Buffer.from(expected, 'utf8');
	const incomingBuffer = Buffer.from(incoming, 'utf8');

	if (expectedBuffer.length !== incomingBuffer.length) {
		return false;
	}

	return timingSafeEqual(expectedBuffer, incomingBuffer);
}

function normalizeSignature(incoming: string, signaturePrefix: string): string {
	let trimmed = incoming.trim();

	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		trimmed = trimmed.slice(1, -1).trim();
	}

	return trimmed;
}

function isHexString(value: string): boolean {
	return value.length > 0 && /^[0-9a-f]+$/i.test(value);
}

function signaturesMatchHex(expectedHex: string, incoming: string): boolean {
	const normalized = incoming.trim().toLowerCase();
	if (!isHexString(normalized)) {
		return false;
	}

	return signaturesMatch(expectedHex, normalized);
}

function getValueByPath(data: unknown, path: string): unknown {
	if (!path) {
		return undefined;
	}

	return path.split('.').reduce<unknown>((current, segment) => {
		if (typeof current !== 'object' || current === null) {
			return undefined;
		}

		return (current as IDataObject)[segment];
	}, data);
}

const defaultIdentifierPaths: Record<string, string[]> = {
	customer_id: [
		'customer.id',
		'customer_id',
		'contact.id',
		'sender.id',
		'data.customer.id',
		'data.customer_id',
	],
	phone_number: [
		'customer.phone_number',
		'customer.phone',
		'phone_number',
		'from',
		'contact.phone_number',
		'sender.phone_number',
		'data.customer.phone_number',
	],
	instagram_username: [
		'customer.instagram_username',
		'customer.username',
		'instagram_username',
		'username',
		'sender.username',
		'data.customer.instagram_username',
	],
};

function resolveIdentifierFromBody(
	body: IDataObject,
	lookupType: string,
	explicitPath: string,
): { value?: string; resolvedPath?: string } {
	const candidatePaths = explicitPath
		? [explicitPath]
		: (defaultIdentifierPaths[lookupType] ?? []);

	for (const candidatePath of candidatePaths) {
		const value = getValueByPath(body, candidatePath);
		if (typeof value === 'string' && value.trim() !== '') {
			return {
				value,
				resolvedPath: candidatePath,
			};
		}
	}

	return {};
}

export class WaswuzWebhook implements INodeType {
	description: INodeTypeDescription = {
		displayName: `${brandConfig.displayName} Webhook`,
		name: `${brandConfig.nodeId}Webhook`,
		icon: 'file:icon.svg',
		group: ['trigger'],
		version: 1,
		description: `Receive incoming webhook events from ${brandConfig.displayName}`,
		defaults: {
			name: `${brandConfig.displayName} Webhook`,
		},
		inputs: [],
		outputs: ['main'],
		credentials: [
			{
				name: brandConfig.credentialId,
				required: false,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				path: '={{$parameter["path"]}}',
				responseMode: 'onReceived',
				responseData: 'noData',
				responseContentType: 'text/plain',
				nodeType: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Path',
				name: 'path',
				type: 'string',
				default: 'waswuz',
				required: true,
				description: 'The webhook path appended to the base production or test URL',
			},
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				options: authenticationOptions,
				default: 'none',
				description: 'How incoming requests should be verified',
			},
			{
				displayName: 'Secret Header Name',
				name: 'secretHeaderName',
				type: 'string',
				default: 'x-waswuz-secret',
				required: true,
				displayOptions: {
					show: {
						authentication: ['headerSecret'],
					},
				},
				description: 'The request header that carries the shared secret',
			},
			{
				displayName: 'Secret Value',
				name: 'secretValue',
				type: 'string',
				typeOptions: {
					password: true,
				},
				default: '',
				required: true,
				displayOptions: {
					show: {
						authentication: ['headerSecret'],
					},
				},
				description: 'The shared secret that must match the incoming header value',
			},
			{
				displayName: 'Signature Header Name',
				name: 'signatureHeaderName',
				type: 'string',
				default: 'x-waswuz-signature',
				required: true,
				displayOptions: {
					show: {
						authentication: ['hmacSignature'],
					},
				},
				description: 'The request header that carries the HMAC signature',
			},
			{
				displayName: 'Auto Send Typing',
				name: 'autoSendTyping',
				type: 'boolean',
				default: false,
				description: 'Automatically send a typing indicator before continuing the workflow',
			},
			{
				displayName: 'Customer Lookup',
				name: 'typingCustomerLookup',
				type: 'options',
				options: [
					{
						name: 'Customer ID',
						value: 'customer_id',
					},
					{
						name: 'Phone Number',
						value: 'phone_number',
					},
					{
						name: 'Instagram Username',
						value: 'instagram_username',
					},
				],
				default: 'customer_id',
				displayOptions: {
					show: {
						autoSendTyping: [true],
					},
				},
				description: 'Which identifier should be extracted from the incoming payload',
			},
			{
				displayName: 'Customer Identifier Path',
				name: 'typingIdentifierPath',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						autoSendTyping: [true],
					},
				},
				description: 'Optional dot path in the webhook body. Leave empty to try common Waswuz payload paths automatically',
				placeholder: 'customer.id',
			},
			{
				displayName: 'Channel',
				name: 'typingChannel',
				type: 'options',
				options: [
					{
						name: 'Auto-detect',
						value: '',
					},
					{
						name: 'WhatsApp',
						value: 'whatsapp',
					},
					{
						name: 'Instagram',
						value: 'instagram',
					},
					{
						name: 'Messenger',
						value: 'messenger',
					},
				],
				default: '',
				displayOptions: {
					show: {
						autoSendTyping: [true],
					},
				},
				description: 'Messaging channel to use when sending the typing indicator',
			},
			{
				displayName: 'WhatsApp Phone Number ID',
				name: 'typingWhatsappPhoneNumberId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						autoSendTyping: [true],
						typingChannel: ['whatsapp'],
					},
				},
				description: 'Optional source phone number ID for WhatsApp typing events',
			},
			{
				displayName: 'Instagram Account ID',
				name: 'typingInstagramAccountId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						autoSendTyping: [true],
						typingChannel: ['instagram'],
					},
				},
				description: 'Optional source Instagram account ID for typing events',
			},
			{
				displayName: 'Facebook Page ID',
				name: 'typingFacebookPageId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						autoSendTyping: [true],
						typingChannel: ['messenger'],
					},
				},
				description: 'Optional source Facebook page ID for typing events',
			},
			{
				displayName: 'Response Body',
				name: 'responseBody',
				type: 'string',
				default: 'ok',
				description: 'Plain-text acknowledgement returned to the webhook sender',
			},
		],
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const authentication = this.getNodeParameter('authentication') as string;
		const headers = this.getHeaderData();
		const body = this.getBodyData();
		const request = this.getRequestObject();

		if (authentication === 'headerSecret') {
			const secretHeaderName = (this.getNodeParameter('secretHeaderName') as string).toLowerCase();
			const secretValue = this.getNodeParameter('secretValue') as string;
			const incomingSecret = normalizeHeaderValue(headers[secretHeaderName]);

			if (!incomingSecret || incomingSecret !== secretValue) {
				throw new NodeOperationError(this.getNode(), 'Webhook secret validation failed', {
					description: `The "${secretHeaderName}" header did not match the configured secret.`,
				});
			}
		}

		if (authentication === 'hmacSignature') {
			const signatureHeaderName = (
				this.getNodeParameter('signatureHeaderName') as string
			).toLowerCase();
			const incomingSignatureRaw = normalizeHeaderValue(headers[signatureHeaderName]);
			const credentials = await this.getCredentials(brandConfig.credentialId);
			const webhookKey = credentials.webhookKey as string | undefined;

			if (!webhookKey) {
				throw new NodeOperationError(this.getNode(), 'Webhook key is not configured', {
					description: `Set the "Webhook Key" field in the "${brandConfig.displayName} API" credential before enabling HMAC signature validation.`,
				});
			}

			if (!incomingSignatureRaw) {
				throw new NodeOperationError(this.getNode(), 'Webhook signature validation failed', {
					description: `The "${signatureHeaderName}" header is missing.`,
				});
			}

			const rawBody = getRawRequestBodyIfAvailable(request, body);
			if (!rawBody) {
				throw new NodeOperationError(
					this.getNode(),
					'Raw webhook body is not available for signature validation',
					{
						description:
							'The webhook signature requires the raw request body. Ensure the sender posts application/json and the webhook is configured to capture rawBody.',
					},
				);
			}
			const digest = createHmac('sha256', webhookKey).update(rawBody).digest();
			const expectedHex = digest.toString('hex');
			const incomingSignature = incomingSignatureRaw.trim();
			const normalizedIncoming = normalizeSignature(incomingSignature, '');
			const matchesHex = signaturesMatchHex(expectedHex, normalizedIncoming);

			if (!matchesHex) {
				throw new NodeOperationError(this.getNode(), 'Webhook signature validation failed', {
					description: `The "${signatureHeaderName}" header did not match the computed HMAC-SHA256 signature.`,
				});
			}
		}

		const autoSendTyping = this.getNodeParameter('autoSendTyping') as boolean;
		if (autoSendTyping) {
			const credentials = await this.getCredentials(brandConfig.credentialId);
			const baseUrl = credentials.baseUrl as string;
			const typingCustomerLookup = this.getNodeParameter('typingCustomerLookup') as string;
			const typingIdentifierPath = this.getNodeParameter('typingIdentifierPath') as string;
			const typingChannel = this.getNodeParameter('typingChannel') as string;
			const identifierResolution = resolveIdentifierFromBody(
				body,
				typingCustomerLookup,
				typingIdentifierPath,
			);
			const customerIdentifier = identifierResolution.value;

			if (!customerIdentifier) {
				const resolutionHint = typingIdentifierPath
					? `No string value was found at "${typingIdentifierPath}".`
					: `Tried: ${(defaultIdentifierPaths[typingCustomerLookup] ?? []).join(', ')}`;
				throw new NodeOperationError(
					this.getNode(),
					`Could not resolve ${typingCustomerLookup} from webhook body`,
					{
						description: resolutionHint,
					},
				);
			}

			const typingBody: Record<string, unknown> = {};
			if (typingChannel) {
				typingBody.channel = typingChannel;
			}

			if (typingChannel === 'whatsapp') {
				const whatsappPhoneNumberId = this.getNodeParameter('typingWhatsappPhoneNumberId') as string;
				if (whatsappPhoneNumberId) {
					typingBody.whatsapp_phone_number_id = whatsappPhoneNumberId;
				}
			}

			if (typingChannel === 'instagram') {
				const instagramAccountId = this.getNodeParameter('typingInstagramAccountId') as string;
				if (instagramAccountId) {
					typingBody.instagram_account_id = instagramAccountId;
				}
			}

			if (typingChannel === 'messenger') {
				const facebookPageId = this.getNodeParameter('typingFacebookPageId') as string;
				if (facebookPageId) {
					typingBody.facebook_page_id = facebookPageId;
				}
			}

			await this.helpers.httpRequestWithAuthentication.call(this, brandConfig.credentialId, {
				method: 'POST',
				url: `${baseUrl}/conversations/${customerIdentifier}/typing`,
				body: typingBody,
				json: true,
			});
		}

		const responseBody = this.getNodeParameter('responseBody') as string;
		const payload: IDataObject = {
			body,
			headers: headers as unknown as IDataObject,
			query: this.getQueryData() as IDataObject,
			params: this.getParamsData() as IDataObject,
			method: request.method,
			url: request.originalUrl ?? request.url,
		};

		return {
			webhookResponse: responseBody,
			workflowData: [[{ json: payload }]],
		};
	}
}
