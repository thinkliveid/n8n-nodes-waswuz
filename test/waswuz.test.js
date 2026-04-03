const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');

const { getBrandConfig } = require('../dist/config/brand.config.js');
const { brandConfig } = require('../dist/config/brand.config.js');
const { OpenClawWebhookAuth } = require('../dist/credentials/OpenClawWebhookAuth.credentials.js');
const { WaswuzPlatformApi } = require('../dist/credentials/WaswuzPlatformApi.credentials.js');
const { OpenClawWebhook } = require('../dist/nodes/OpenClawWebhook/OpenClawWebhook.node.js');
const { WaswuzPlatform } = require('../dist/nodes/WaswuzPlatform/WaswuzPlatform.node.js');
const { WaswuzWebhook } = require('../dist/nodes/WaswuzWebhook/WaswuzWebhook.node.js');

function createExecuteContext(parametersByItem, options = {}) {
	const requests = [];
	const helperCalls = {
		httpRequestWithAuthentication: requests,
	};

	return {
		requests,
		helperCalls,
		getInputData() {
			return parametersByItem.map(() => ({ json: {} }));
		},
		async getCredentials(name) {
			assert.equal(name, brandConfig.credentialId);
			return {
				apiKey: 'wws_live_test_key',
				baseUrl: 'https://api.example.test',
			};
		},
		getNodeParameter(name, itemIndex, fallback) {
			const item = parametersByItem[itemIndex] || {};
			if (Object.prototype.hasOwnProperty.call(item, name)) {
				return item[name];
			}
			if (arguments.length >= 3) {
				return fallback;
			}
			throw new Error(`Missing parameter: ${name}`);
		},
		getNode() {
			return { name: 'WaswuzPlatform' };
		},
		continueOnFail() {
			return Boolean(options.continueOnFail);
		},
		helpers: {
			async httpRequestWithAuthentication(credentialName, request) {
				requests.push({ credentialName, request });
				if (options.httpRequestWithAuthentication) {
					return options.httpRequestWithAuthentication(credentialName, request);
				}
				return options.httpRequestWithAuthenticationResult ?? { success: true, echoed: request };
			},
			returnJsonArray(data) {
				return Array.isArray(data) ? data : [data];
			},
			constructExecutionMetaData(items, meta) {
				return items.map((json) => ({
					json,
					pairedItem: meta.itemData,
				}));
			},
		},
	};
}

function createLoadOptionsContext({ response, currentParameters = {}, throwError } = {}) {
	const requests = [];
	return {
		requests,
		async getCredentials(name) {
			assert.equal(name, brandConfig.credentialId);
			return {
				apiKey: 'wws_live_test_key',
				baseUrl: 'https://api.example.test',
			};
		},
		getCurrentNodeParameter(name) {
			if (!Object.prototype.hasOwnProperty.call(currentParameters, name)) {
				throw new Error(`Missing current parameter: ${name}`);
			}
			return currentParameters[name];
		},
		helpers: {
			async httpRequest(request) {
				requests.push(request);
				if (throwError) {
					throw throwError;
				}
				return response;
			},
		},
	};
}

function createWebhookContext({
	parameters = {},
	body = {},
	headers = {},
	query = {},
	params = {},
	request = {},
	options = {},
} = {}) {
	const requests = [];
	const credentials = {
		apiKey: 'wws_live_test_key',
		baseUrl: 'https://api.example.test',
		webhookKey: 'whk_test_secret',
		...(options.credentials || {}),
	};
	const openClawCredentials = {
		secretHeaderName: 'x-openclaw-secret',
		secretValue: 'expected',
		...(options.openClawCredentials || {}),
	};

	return {
		requests,
		getNodeParameter(name) {
			if (!Object.prototype.hasOwnProperty.call(parameters, name)) {
				throw new Error(`Missing parameter: ${name}`);
			}
			return parameters[name];
		},
		getHeaderData() {
			return headers;
		},
		getBodyData() {
			return body;
		},
		getQueryData() {
			return query;
		},
		getParamsData() {
			return params;
		},
		getRequestObject() {
			return {
				method: request.method || 'POST',
				url: request.url || '/webhook/waswuz',
				originalUrl: request.originalUrl || request.url || '/webhook/waswuz',
			};
		},
		getNode() {
			return { name: 'WaswuzWebhook' };
		},
		async getCredentials(name) {
			if (name === brandConfig.credentialId) {
				return credentials;
			}
			if (name === 'openClawWebhookAuth') {
				return openClawCredentials;
			}
			throw new Error(`Unexpected credential: ${name}`);
		},
		helpers: {
			async httpRequestWithAuthentication(credentialName, requestConfig) {
				requests.push({ credentialName, request: requestConfig });
				return options.httpRequestWithAuthenticationResult ?? { success: true };
			},
		},
	};
}

test('getBrandConfig returns defaults', () => {
	const envKeys = [
		'N8N_NODE_BRAND_NAME',
		'N8N_NODE_BRAND_ID',
		'N8N_NODE_API_KEY_PREFIX',
		'N8N_NODE_DESCRIPTION',
		'N8N_NODE_API_BASE_URL',
		'N8N_NODE_DOCS_URL',
		'N8N_NODE_HOMEPAGE',
		'N8N_NODE_SUPPORT_EMAIL',
		'N8N_NODE_AUTHOR',
	];

	const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
	for (const key of envKeys) {
		delete process.env[key];
	}

	const config = getBrandConfig();

	assert.equal(config.displayName, 'WaswuzPlatform');
	assert.equal(config.nodeId, 'WaswuzPlatform');
	assert.equal(config.credentialId, 'WaswuzPlatformApi');
	assert.equal(config.apiBaseUrl, 'https://api.waswuz.com/api/v1/public');
	assert.equal(config.apiKeyPlaceholder, 'wws_live_your_api_key_here');

	for (const [key, value] of Object.entries(previous)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
});

test('getBrandConfig honors environment overrides', () => {
	const overrides = {
		N8N_NODE_BRAND_NAME: 'CustomBrand',
		N8N_NODE_BRAND_ID: 'CustomNode',
		N8N_NODE_API_KEY_PREFIX: 'custom_',
		N8N_NODE_DESCRIPTION: 'Custom description',
		N8N_NODE_API_BASE_URL: 'https://custom.example.test/api',
		N8N_NODE_DOCS_URL: 'https://docs.example.test',
		N8N_NODE_HOMEPAGE: 'https://example.test',
		N8N_NODE_SUPPORT_EMAIL: 'ops@example.test',
		N8N_NODE_AUTHOR: 'Example Inc',
	};
	const previous = Object.fromEntries(
		Object.keys(overrides).map((key) => [key, process.env[key]])
	);

	Object.assign(process.env, overrides);
	const config = getBrandConfig();

	assert.equal(config.displayName, 'CustomBrand');
	assert.equal(config.nodeId, 'CustomNode');
	assert.equal(config.credentialId, 'CustomNodeApi');
	assert.equal(config.apiKeyPrefix, 'custom_');
	assert.equal(config.apiKeyPlaceholder, 'custom_your_api_key_here');
	assert.equal(config.author, 'Example Inc');

	for (const [key, value] of Object.entries(previous)) {
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}
});

test('credential exposes bearer auth and health test', () => {
	const credential = new WaswuzPlatformApi();

	assert.equal(credential.name, brandConfig.credentialId);
	assert.equal(credential.displayName, `${brandConfig.displayName} API`);
	assert.equal(credential.authenticate.type, 'generic');
	assert.equal(
		credential.authenticate.properties.headers.Authorization,
		'=Bearer {{$credentials.apiKey}}'
	);
	assert.equal(credential.test.request.baseURL, '={{$credentials.baseUrl}}');
	assert.equal(credential.test.request.url, '/health');
	assert.equal(credential.properties.length, 3);
	assert.equal(credential.properties[1].name, 'webhookKey');
});

test('openclaw webhook credential exposes shared secret fields', () => {
	const credential = new OpenClawWebhookAuth();

	assert.equal(credential.name, 'openClawWebhookAuth');
	assert.equal(credential.displayName, 'OpenClaw Webhook Auth');
	assert.equal(credential.properties[0].name, 'secretHeaderName');
	assert.equal(credential.properties[1].name, 'secretValue');
});

test('node description exposes expected operations', () => {
	const node = new WaswuzPlatform();
	const operationProperty = node.description.properties.find(
		(property) => property.name === 'operation'
	);

	assert.ok(operationProperty);
	assert.deepEqual(
		operationProperty.options.map((option) => option.value),
		['sendMessage', 'listTemplates', 'getTemplate', 'markAsRead', 'sendTyping']
	);
});

test('webhook description exposes POST webhook endpoint', () => {
	const node = new WaswuzWebhook();

	assert.equal(node.description.group[0], 'trigger');
	assert.equal(node.description.webhooks[0].httpMethod, 'POST');
	assert.equal(node.description.webhooks[0].responseMode, 'onReceived');
	assert.equal(node.description.webhooks[0].path, '={{$parameter["path"]}}');
});

test('openclaw webhook description exposes POST webhook endpoint', () => {
	const node = new OpenClawWebhook();

	assert.equal(node.description.group[0], 'trigger');
	assert.equal(node.description.webhooks[0].httpMethod, 'POST');
	assert.equal(node.description.webhooks[0].responseMode, 'onReceived');
	assert.equal(node.description.webhooks[0].path, '={{$parameter["path"]}}');
	assert.equal(
		node.description.webhooks[0].responseContentType,
		'={{$parameter["responseContentType"]}}'
	);
});

test('loadOptions:getWhatsAppPhoneNumbers formats auto-detect and primary entries', async () => {
	const node = new WaswuzPlatform();
	const context = createLoadOptionsContext({
		response: {
			success: true,
			data: [
				{
					id: 'pn_1',
					display_phone_number: '+6281234567890',
					verified_name: 'Support',
					is_primary: true,
					business_name: 'Waswuz',
				},
			],
		},
	});

	const options = await node.methods.loadOptions.getWhatsAppPhoneNumbers.call(context);

	assert.equal(context.requests[0].url, 'https://api.example.test/phone-numbers');
	assert.equal(options[0].value, '');
	assert.match(options[1].name, /\[Primary\]/);
	assert.equal(options[1].value, 'pn_1');
});

test('loadOptions:getTemplates filters by selected phone number and annotates variable counts', async () => {
	const node = new WaswuzPlatform();
	const context = createLoadOptionsContext({
		currentParameters: { whatsappPhoneNumberId: 'pn_123' },
		response: {
			success: true,
			data: [
				{
					id: 'tpl_1',
					template_name: 'order_update',
					language: 'en',
					category: 'UTILITY',
					content: 'Hello {{1}}, order {{2}} is ready',
					has_variables: true,
				},
			],
		},
	});

	const options = await node.methods.loadOptions.getTemplates.call(context);

	assert.equal(
		context.requests[0].url,
		'https://api.example.test/templates?status=APPROVED&limit=500&whatsapp_phone_number_id=pn_123'
	);
	assert.match(options[0].name, /\[2 var\]/);
	assert.deepEqual(JSON.parse(options[0].value), {
		name: 'order_update',
		language: 'en',
	});
});

test('loadOptions:getInstagramAccounts returns error placeholder on request failure', async () => {
	const node = new WaswuzPlatform();
	const context = createLoadOptionsContext({
		throwError: new Error('network down'),
	});

	const options = await node.methods.loadOptions.getInstagramAccounts.call(context);

	assert.equal(options.length, 1);
	assert.match(options[0].name, /Error: network down/);
	assert.equal(options[0].value, '');
});

test('execute:sendMessage sends text payload for whatsapp', async () => {
	const node = new WaswuzPlatform();
	const context = createExecuteContext([
		{
			operation: 'sendMessage',
			customerLookup: 'customer_id',
			customerId: 'cust_123',
			channel: 'whatsapp',
			whatsappPhoneNumberId: 'pn_1',
			messageType: 'text',
			content: 'Hello there',
		},
	]);

	const result = await node.execute.call(context);
	const request = context.requests[0].request;

	assert.equal(request.method, 'POST');
	assert.equal(request.url, 'https://api.example.test/messages/send');
	assert.deepEqual(request.body, {
		channel: 'whatsapp',
		message_type: 'text',
		customer_id: 'cust_123',
		whatsapp_phone_number_id: 'pn_1',
		content: 'Hello there',
	});
	assert.equal(result[0][0].json.success, true);
});

test('execute:sendMessage builds template payload with variables and auto-create customer', async () => {
	const node = new WaswuzPlatform();
	const context = createExecuteContext([
		{
			operation: 'sendMessage',
			customerLookup: 'phone_number',
			phoneNumber: '+6281234567890',
			channel: 'whatsapp',
			messageType: 'template',
			templateManualEntry: false,
			templateSelect: JSON.stringify({ name: 'order_update', language: 'id' }),
			templateVariableCount: 2,
			templateVar1: 'Berlin',
			templateVar2: '#1234',
			autoCreateCustomer: true,
			customerName: 'Berlin',
		},
	]);

	await node.execute.call(context);

	assert.deepEqual(context.requests[0].request.body, {
		channel: 'whatsapp',
		message_type: 'template',
		phone_number: '+6281234567890',
		template: {
			name: 'order_update',
			language: { code: 'id' },
			components: [
				{
					type: 'body',
					parameters: [
						{ type: 'text', text: 'Berlin' },
						{ type: 'text', text: '#1234' },
					],
				},
			],
		},
		auto_create_customer: true,
		customer_name: 'Berlin',
	});
});

test('execute:sendMessage rejects invalid template components JSON', async () => {
	const node = new WaswuzPlatform();
	const context = createExecuteContext([
		{
			operation: 'sendMessage',
			customerLookup: 'customer_id',
			customerId: 'cust_123',
			channel: 'whatsapp',
			messageType: 'template',
			templateManualEntry: true,
			templateName: 'order_update',
			templateLanguage: 'en',
			templateComponents: '{"broken"',
			templateVariableCount: 0,
		},
	]);

	await assert.rejects(
		() => node.execute.call(context),
		(error) => {
			assert.match(error.message, /Invalid JSON in Template Components/);
			return true;
		}
	);
});

test('execute:sendMessage builds interactive CTA payload', async () => {
	const node = new WaswuzPlatform();
	const context = createExecuteContext([
		{
			operation: 'sendMessage',
			customerLookup: 'customer_id',
			customerId: 'cust_123',
			channel: 'whatsapp',
			messageType: 'interactive',
			interactiveType: 'cta_url',
			interactiveBody: 'Open the portal',
			interactiveHeader: 'Header',
			interactiveFooter: 'Footer',
			ctaButtonText: 'Visit',
			ctaButtonUrl: 'https://example.test/portal',
		},
	]);

	await node.execute.call(context);

	assert.deepEqual(context.requests[0].request.body.interactive, {
		type: 'cta_url',
		body: { text: 'Open the portal' },
		header: { type: 'text', text: 'Header' },
		footer: { text: 'Footer' },
		action: {
			name: 'cta_url',
			parameters: {
				display_text: 'Visit',
				url: 'https://example.test/portal',
			},
		},
	});
});

test('execute:sendMessage rejects duplicate reply button IDs', async () => {
	const node = new WaswuzPlatform();
	const context = createExecuteContext([
		{
			operation: 'sendMessage',
			customerLookup: 'customer_id',
			customerId: 'cust_123',
			channel: 'whatsapp',
			messageType: 'interactive',
			interactiveType: 'button',
			interactiveBody: 'Choose one',
			replyButtonsAdvancedMode: false,
			replyButtonItems: {
				buttons: [
					{ id: 'yes', title: 'Yes' },
					{ id: 'yes', title: 'No' },
				],
			},
		},
	]);

	await assert.rejects(
		() => node.execute.call(context),
		(error) => {
			assert.match(error.message, /Duplicate ID "yes"/);
			return true;
		}
	);
});

test('execute:sendMessage builds list interactive payload from simple fields', async () => {
	const node = new WaswuzPlatform();
	const context = createExecuteContext([
		{
			operation: 'sendMessage',
			customerLookup: 'customer_id',
			customerId: 'cust_123',
			channel: 'whatsapp',
			messageType: 'interactive',
			interactiveType: 'list',
			interactiveBody: 'Pick an option',
			listButtonText: 'Options',
			listAdvancedMode: false,
			listSectionTitle: 'Main',
			listItems: {
				items: [
					{ id: 'item-1', title: 'Option 1', description: 'First' },
					{ id: 'item-2', title: 'Option 2', description: 'Second' },
				],
			},
		},
	]);

	await node.execute.call(context);

	assert.deepEqual(context.requests[0].request.body.interactive.action, {
		button: 'Options',
		sections: [
			{
				title: 'Main',
				rows: [
					{ id: 'item-1', title: 'Option 1', description: 'First' },
					{ id: 'item-2', title: 'Option 2', description: 'Second' },
				],
			},
		],
	});
});

test('execute:sendMessage rejects invalid media URL', async () => {
	const node = new WaswuzPlatform();
	const context = createExecuteContext([
		{
			operation: 'sendMessage',
			customerLookup: 'customer_id',
			customerId: 'cust_123',
			channel: 'instagram',
			messageType: 'image',
			mediaUrl: 'ftp://example.test/file.png',
		},
	]);

	await assert.rejects(
		() => node.execute.call(context),
		(error) => {
			assert.match(error.message, /Invalid Media URL format/);
			return true;
		}
	);
});

test('execute:markAsRead posts to read endpoint', async () => {
	const node = new WaswuzPlatform();
	const context = createExecuteContext([
		{
			operation: 'markAsRead',
			messageId: 'msg_123',
		},
	]);

	await node.execute.call(context);

	assert.equal(context.requests[0].request.method, 'POST');
	assert.equal(context.requests[0].request.url, 'https://api.example.test/messages/msg_123/read');
});

test('execute:listTemplates builds filtered query string', async () => {
	const node = new WaswuzPlatform();
	const context = createExecuteContext([
		{
			operation: 'listTemplates',
			templatePhoneNumberId: 'pn_1',
			templateStatus: 'APPROVED',
			templateCategory: 'UTILITY',
			templateLimit: 25,
		},
	]);

	await node.execute.call(context);

	assert.equal(
		context.requests[0].request.url,
		'https://api.example.test/templates?whatsapp_phone_number_id=pn_1&status=APPROVED&category=UTILITY&limit=25'
	);
});

test('execute:getTemplate fetches a single template', async () => {
	const node = new WaswuzPlatform();
	const context = createExecuteContext([
		{
			operation: 'getTemplate',
			templateId: 'tpl_123',
		},
	]);

	await node.execute.call(context);

	assert.equal(context.requests[0].request.method, 'GET');
	assert.equal(context.requests[0].request.url, 'https://api.example.test/templates/tpl_123');
});

test('execute:sendTyping posts channel-specific identifiers', async () => {
	const node = new WaswuzPlatform();
	const context = createExecuteContext([
		{
			operation: 'sendTyping',
			typingCustomerLookup: 'phone_number',
			typingPhoneNumber: '+6281234567890',
			typingChannel: 'instagram',
			typingInstagramAccountId: 'ig_123',
		},
	]);

	await node.execute.call(context);

	assert.deepEqual(context.requests[0].request.body, {
		channel: 'instagram',
		instagram_account_id: 'ig_123',
	});
	assert.equal(
		context.requests[0].request.url,
		'https://api.example.test/conversations/+6281234567890/typing'
	);
});

test('execute returns error items when continueOnFail is enabled', async () => {
	const node = new WaswuzPlatform();
	const context = createExecuteContext(
		[
			{
				operation: 'sendMessage',
				customerLookup: 'customer_id',
				customerId: 'cust_123',
				channel: 'whatsapp',
				messageType: 'interactive',
				interactiveType: 'cta_url',
				interactiveBody: '',
				ctaButtonText: 'Visit',
				ctaButtonUrl: 'https://example.test',
			},
		],
		{ continueOnFail: true }
	);

	const result = await node.execute.call(context);

	assert.equal(result[0].length, 1);
	assert.match(result[0][0].json.error, /Body Text is required/);
	assert.deepEqual(result[0][0].pairedItem, { item: 0 });
});

test('webhook returns body, headers, query, and params to the workflow', async () => {
	const node = new WaswuzWebhook();
	const context = createWebhookContext({
		parameters: {
			authentication: 'none',
			autoSendTyping: false,
			responseBody: 'received',
		},
		body: { event: 'message.received', id: 'evt_123' },
		headers: { 'content-type': 'application/json' },
		query: { source: 'test' },
		params: { tenant: 'demo' },
		request: {
			method: 'POST',
			originalUrl: '/webhook/waswuz?source=test',
		},
	});

	const result = await node.webhook.call(context);

	assert.equal(result.webhookResponse, 'received');
	assert.equal(result.workflowData[0][0].json.body.event, 'message.received');
	assert.equal(result.workflowData[0][0].json.headers['content-type'], 'application/json');
	assert.equal(result.workflowData[0][0].json.query.source, 'test');
	assert.equal(result.workflowData[0][0].json.params.tenant, 'demo');
});

test('webhook can auto-send typing before emitting workflow data', async () => {
	const node = new WaswuzWebhook();
	const context = createWebhookContext({
		parameters: {
			authentication: 'none',
			autoSendTyping: true,
			typingCustomerLookup: 'customer_id',
			typingIdentifierPath: '',
			typingChannel: 'whatsapp',
			typingWhatsappPhoneNumberId: 'pn_123',
			responseBody: 'ok',
		},
		body: {
			event: 'message.received',
			customer: {
				id: 'cust_123',
			},
		},
	});

	const result = await node.webhook.call(context);

	assert.equal(context.requests.length, 1);
	assert.equal(context.requests[0].credentialName, brandConfig.credentialId);
	assert.equal(
		context.requests[0].request.url,
		'https://api.example.test/conversations/cust_123/typing'
	);
	assert.deepEqual(context.requests[0].request.body, {
		channel: 'whatsapp',
		whatsapp_phone_number_id: 'pn_123',
	});
	assert.equal(result.workflowData[0][0].json.body.customer.id, 'cust_123');
});

test('webhook fails when auto typing cannot resolve the customer identifier', async () => {
	const node = new WaswuzWebhook();
	const context = createWebhookContext({
		parameters: {
			authentication: 'none',
			autoSendTyping: true,
			typingCustomerLookup: 'customer_id',
			typingIdentifierPath: '',
			typingChannel: '',
			responseBody: 'ok',
		},
		body: {
			event: 'message.received',
		},
	});

	await assert.rejects(
		() => node.webhook.call(context),
		/Could not resolve customer_id from webhook body/
	);
});

test('webhook rejects requests with an invalid shared secret', async () => {
	const node = new WaswuzWebhook();
	const context = createWebhookContext({
		parameters: {
			authentication: 'headerSecret',
			secretHeaderName: 'x-waswuz-secret',
			secretValue: 'expected',
			autoSendTyping: false,
			responseBody: 'ok',
		},
		headers: {
			'x-waswuz-secret': 'invalid',
		},
	});

	await assert.rejects(() => node.webhook.call(context), /Webhook secret validation failed/);
});

test('webhook validates hmac signature header using credential webhook key', async () => {
	const node = new WaswuzWebhook();
	const rawBody = JSON.stringify({ event: 'message.received', id: 'evt_123' });
	const signature = `sha256=${createHmac('sha256', 'whk_test_secret')
		.update(rawBody)
		.digest('hex')}`;
	const context = createWebhookContext({
		parameters: {
			authentication: 'hmacSignature',
			signatureHeaderName: 'x-waswuz-signature',
			signaturePrefix: 'sha256=',
			autoSendTyping: false,
			responseBody: 'ok',
		},
		body: { event: 'message.received', id: 'evt_123' },
		headers: {
			'x-waswuz-signature': signature,
		},
		request: {
			rawBody,
		},
	});

	const result = await node.webhook.call(context);

	assert.equal(result.webhookResponse, 'ok');
	assert.equal(result.workflowData[0][0].json.body.id, 'evt_123');
});

test('webhook rejects requests with an invalid hmac signature', async () => {
	const node = new WaswuzWebhook();
	const context = createWebhookContext({
		parameters: {
			authentication: 'hmacSignature',
			signatureHeaderName: 'x-waswuz-signature',
			signaturePrefix: 'sha256=',
			autoSendTyping: false,
			responseBody: 'ok',
		},
		body: { event: 'message.received', id: 'evt_123' },
		headers: {
			'x-waswuz-signature': 'sha256=invalid',
		},
		request: {
			rawBody: JSON.stringify({ event: 'message.received', id: 'evt_123' }),
		},
	});

	await assert.rejects(() => node.webhook.call(context), /Webhook signature validation failed/);
});

test('openclaw webhook returns an immediate acknowledgement and workflow payload', async () => {
	const node = new OpenClawWebhook();
	const context = createWebhookContext({
		parameters: {
			authentication: 'none',
			responseContentType: 'text/plain',
			responseBody: 'accepted',
		},
		body: { event: 'conversation.created', id: 'evt_openclaw_1' },
		headers: { 'content-type': 'application/json' },
		query: { source: 'openclaw' },
		params: { workspace: 'demo' },
		request: {
			method: 'POST',
			originalUrl: '/webhook/openclaw?source=openclaw',
		},
	});

	const result = await node.webhook.call(context);

	assert.equal(result.webhookResponse, 'accepted');
	assert.equal(result.workflowData[0][0].json.body.id, 'evt_openclaw_1');
	assert.equal(result.workflowData[0][0].json.headers['content-type'], 'application/json');
	assert.equal(result.workflowData[0][0].json.query.source, 'openclaw');
	assert.equal(result.workflowData[0][0].json.params.workspace, 'demo');
	assert.equal(result.workflowData[0][0].json.acknowledgement.contentType, 'text/plain');
	assert.equal(result.workflowData[0][0].json.acknowledgement.body, 'accepted');
});

test('openclaw webhook rejects requests with an invalid shared secret', async () => {
	const node = new OpenClawWebhook();
	const context = createWebhookContext({
		parameters: {
			authentication: 'headerSecret',
			responseContentType: 'text/plain',
			responseBody: 'ok',
		},
		headers: {
			'x-openclaw-secret': 'invalid',
		},
	});

	await assert.rejects(() => node.webhook.call(context), /Webhook secret validation failed/);
});

test('openclaw webhook validates requests with the configured credential secret', async () => {
	const node = new OpenClawWebhook();
	const context = createWebhookContext({
		parameters: {
			authentication: 'headerSecret',
			responseContentType: 'text/plain',
			responseBody: 'ok',
		},
		headers: {
			'x-openclaw-secret': 'expected',
		},
		options: {
			openClawCredentials: {
				secretHeaderName: 'x-openclaw-secret',
				secretValue: 'expected',
			},
		},
	});

	const result = await node.webhook.call(context);

	assert.equal(result.webhookResponse, 'ok');
	assert.equal(result.workflowData[0][0].json.headers['x-openclaw-secret'], 'expected');
});

test('openclaw webhook can return a JSON acknowledgement payload', async () => {
	const node = new OpenClawWebhook();
	const context = createWebhookContext({
		parameters: {
			authentication: 'none',
			responseContentType: 'application/json',
			responseJson: { success: true, accepted: true },
		},
		body: { event: 'message.created' },
	});

	const result = await node.webhook.call(context);

	assert.deepEqual(result.webhookResponse, { success: true, accepted: true });
	assert.equal(result.workflowData[0][0].json.acknowledgement.contentType, 'application/json');
	assert.deepEqual(result.workflowData[0][0].json.acknowledgement.body, {
		success: true,
		accepted: true,
	});
});
