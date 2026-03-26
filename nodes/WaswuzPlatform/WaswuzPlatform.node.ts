import {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';
import { brandConfig } from '../../config/brand.config';

/**
 * Validates if a string is a valid URL
 */
function isValidUrl(urlString: string): boolean {
	try {
		const url = new URL(urlString);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

/**
 * Validates template components structure
 */
function validateTemplateComponents(components: unknown): components is Array<Record<string, unknown>> {
	if (!Array.isArray(components)) {
		return false;
	}
	return components.every(
		(component) => typeof component === 'object' && component !== null
	);
}

/**
 * Validates interactive message structure
 */
function validateInteractiveMessage(interactive: unknown): interactive is Record<string, unknown> {
	if (typeof interactive !== 'object' || interactive === null) {
		return false;
	}
	const obj = interactive as Record<string, unknown>;
	// Must have type and body
	if (!obj.type || !obj.body) {
		return false;
	}
	// type must be 'cta_url', 'button', or 'list'
	if (obj.type !== 'cta_url' && obj.type !== 'button' && obj.type !== 'list') {
		return false;
	}
	return true;
}

const MAX_TEMPLATE_VARS = 20;

const templateVariableCountOptions: INodePropertyOptions[] = [
	{ name: 'No variables', value: 0 },
	...Array.from({ length: MAX_TEMPLATE_VARS }, (_, i) => ({
		name: `${i + 1}`,
		value: i + 1,
	})),
];

// Generate individual template variable fields with displayOptions
// Each field shows only when templateVariableCount >= its number
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const templateVariableFields: any[] = Array.from({ length: MAX_TEMPLATE_VARS }, (_, idx) => {
	const varNum = idx + 1;
	return {
		displayName: `Variable {{${varNum}}}`,
		name: `templateVar${varNum}`,
		type: 'string',
		displayOptions: {
			show: {
				operation: ['sendMessage'],
				messageType: ['template'],
				templateVariableCount: Array.from({ length: MAX_TEMPLATE_VARS - idx }, (_, j) => varNum + j),
			},
		},
		default: '',
		description: `Value for template placeholder {{${varNum}}}`,
	};
});

export class WaswuzPlatform implements INodeType {
	description: INodeTypeDescription = {
		displayName: brandConfig.displayName,
		name: brandConfig.nodeId,
		icon: 'file:icon.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: brandConfig.description,
		defaults: {
			name: brandConfig.displayName,
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: brandConfig.credentialId,
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Send Message',
						value: 'sendMessage',
						description: 'Send a message to a customer via WhatsApp, Instagram, or Messenger',
						action: 'Send a message',
					},
					{
						name: 'List Templates',
						value: 'listTemplates',
						description: 'List WhatsApp message templates',
						action: 'List templates',
					},
					{
						name: 'Get Template',
						value: 'getTemplate',
						description: 'Get a specific WhatsApp message template by ID',
						action: 'Get template',
					},
					{
						name: 'Mark as Read',
						value: 'markAsRead',
						description: 'Mark a message as read',
						action: 'Mark a message as read',
					},
					{
						name: 'Send Typing Indicator',
						value: 'sendTyping',
						description: 'Send typing indicator to show you are typing',
						action: 'Send typing indicator',
					},
				],
				default: 'sendMessage',
			},

			// ============================================
			// SEND MESSAGE FIELDS
			// ============================================

			// Customer Lookup Method
			{
				displayName: 'Customer Lookup',
				name: 'customerLookup',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
					},
				},
				options: [
					{
						name: 'Customer ID',
						value: 'customer_id',
						description: 'Lookup by customer ID (e.g., cust_abc123)',
					},
					{
						name: 'Phone Number',
						value: 'phone_number',
						description: 'Lookup by phone number (e.g., +6281234567890)',
					},
					{
						name: 'Instagram Username',
						value: 'instagram_username',
						description: 'Lookup by Instagram username',
					},
				],
				default: 'customer_id',
				description: 'How to identify the customer',
			},
			{
				displayName: 'Customer ID',
				name: 'customerId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						customerLookup: ['customer_id'],
					},
				},
				default: '',
				description: 'The ID of the customer to send the message to',
				placeholder: 'cust_abc123',
			},
			{
				displayName: 'Phone Number',
				name: 'phoneNumber',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						customerLookup: ['phone_number'],
					},
				},
				default: '',
				description: 'The phone number of the customer (with country code)',
				placeholder: '+6281234567890',
			},
			{
				displayName: 'Instagram Username',
				name: 'instagramUsername',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						customerLookup: ['instagram_username'],
					},
				},
				default: '',
				description: 'The Instagram username of the customer',
				placeholder: 'username',
			},

			// Channel Selection
			{
				displayName: 'Channel',
				name: 'channel',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
					},
				},
				options: [
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
				default: 'whatsapp',
				description: 'The messaging channel to use',
			},

			// Instagram Account Selection (Multi-account support)
			{
				displayName: 'Instagram Account',
				name: 'instagramAccountId',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						channel: ['instagram'],
					},
				},
				typeOptions: {
					loadOptionsMethod: 'getInstagramAccounts',
				},
				default: '',
				description: 'Select which Instagram account to send from. Required if customer has conversations with multiple accounts.',
			},

			// Facebook Page Selection (Multi-account support)
			{
				displayName: 'Facebook Page',
				name: 'facebookPageId',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						channel: ['messenger'],
					},
				},
				typeOptions: {
					loadOptionsMethod: 'getFacebookPages',
				},
				default: '',
				description: 'Select which Facebook Page to send from. Required if customer has conversations with multiple pages.',
			},

			// WhatsApp Phone Number Selection (Multi-number support)
			{
				displayName: 'WhatsApp Phone Number',
				name: 'whatsappPhoneNumberId',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						channel: ['whatsapp'],
					},
				},
				typeOptions: {
					loadOptionsMethod: 'getWhatsAppPhoneNumbers',
				},
				default: '',
				description: 'Select which WhatsApp phone number to send from. Required if you have multiple phone numbers connected.',
			},

			// Message Type - WhatsApp
			{
				displayName: 'Message Type',
				name: 'messageType',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						channel: ['whatsapp'],
					},
				},
				options: [
					{
						name: 'Text',
						value: 'text',
					},
					{
						name: 'Image',
						value: 'image',
					},
					{
						name: 'Document',
						value: 'document',
					},
					{
						name: 'Audio',
						value: 'audio',
					},
					{
						name: 'Video',
						value: 'video',
					},
					{
						name: 'Template',
						value: 'template',
					},
					{
						name: 'Interactive (Buttons)',
						value: 'interactive',
					},
				],
				default: 'text',
				description: 'The type of message to send (WhatsApp)',
			},

			// Message Type - Instagram
			{
				displayName: 'Message Type',
				name: 'messageType',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						channel: ['instagram'],
					},
				},
				options: [
					{
						name: 'Text',
						value: 'text',
					},
					{
						name: 'Image',
						value: 'image',
					},
					{
						name: 'Media Share',
						value: 'media_share',
					},
				],
				default: 'text',
				description: 'The type of message to send (Instagram)',
			},

			// Message Type - Messenger
			{
				displayName: 'Message Type',
				name: 'messageType',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						channel: ['messenger'],
					},
				},
				options: [
					{
						name: 'Text',
						value: 'text',
					},
					{
						name: 'Image',
						value: 'image',
					},
					{
						name: 'Video',
						value: 'video',
					},
					{
						name: 'Audio',
						value: 'audio',
					},
					{
						name: 'File',
						value: 'file',
					},
				],
				default: 'text',
				description: 'The type of message to send (Messenger)',
			},

			// Text Content
			{
				displayName: 'Message Content',
				name: 'content',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['text'],
					},
				},
				default: '',
				description: 'The text content of the message',
				typeOptions: {
					rows: 4,
				},
			},

			// Media URL (for all media types)
			{
				displayName: 'Media URL',
				name: 'mediaUrl',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['image', 'document', 'audio', 'video', 'media_share', 'file'],
					},
				},
				default: '',
				description: 'URL of the media file to send (must be publicly accessible)',
				placeholder: 'https://example.com/image.jpg',
			},

			// Caption (for media messages)
			{
				displayName: 'Caption',
				name: 'caption',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['image', 'document', 'video'],
					},
				},
				default: '',
				description: 'Optional caption for media messages',
			},

			// Filename (for documents)
			{
				displayName: 'Filename',
				name: 'filename',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['document', 'file'],
					},
				},
				default: '',
				description: 'Filename for document/file messages',
				placeholder: 'invoice.pdf',
			},

			// ============================================
			// TEMPLATE FIELDS (WhatsApp only)
			// ============================================
			{
				displayName: 'Template',
				name: 'templateSelect',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['template'],
						templateManualEntry: [false],
					},
				},
				typeOptions: {
					loadOptionsMethod: 'getTemplates',
				},
				default: '',
				description: 'Select an approved WhatsApp template. Number in brackets shows variable count (e.g. [2 var] means 2 variables).',
			},
			{
				displayName: 'Enter Template Manually',
				name: 'templateManualEntry',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['template'],
					},
				},
				default: false,
				description: 'Enable to manually enter template name and language',
			},
			{
				displayName: 'Template Name',
				name: 'templateName',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['template'],
						templateManualEntry: [true],
					},
				},
				default: '',
				description: 'Name of the WhatsApp template to send',
				placeholder: 'hello_world',
			},
			{
				displayName: 'Template Language',
				name: 'templateLanguage',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['template'],
						templateManualEntry: [true],
					},
				},
				default: 'en',
				description: 'Language code for the template (e.g., en, id, es)',
				placeholder: 'en',
			},
			{
				displayName: 'Number of Variables',
				name: 'templateVariableCount',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['template'],
					},
				},
				options: templateVariableCountOptions,
				default: 0,
				noDataExpression: true,
				description: 'Match the variable count shown in template name (e.g., [12 var] = select 12)',
			},
			...templateVariableFields,
			{
				displayName: 'Advanced: Template Components (JSON)',
				name: 'templateComponents',
				type: 'json',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['template'],
						templateManualEntry: [true],
					},
				},
				default: '',
				description: 'For advanced use: Full template components JSON (header media, buttons). Overrides variable fields above if provided.',
			},

			// Auto-create customer (for template messages via phone number)
			{
				displayName: 'Auto-Create Customer',
				name: 'autoCreateCustomer',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['template'],
						customerLookup: ['phone_number'],
					},
				},
				default: true,
				description: 'Automatically create a new customer if the phone number is not found. Only works with template messages (outside 24h window).',
			},
			{
				displayName: 'Customer Name',
				name: 'customerName',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['template'],
						customerLookup: ['phone_number'],
						autoCreateCustomer: [true],
					},
				},
				default: '',
				description: 'Name for the auto-created customer (optional)',
				placeholder: 'John Doe',
			},

			// ============================================
			// INTERACTIVE MESSAGE FIELDS (WhatsApp only)
			// ============================================
			{
				displayName: 'Interactive Type',
				name: 'interactiveType',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['interactive'],
					},
				},
				options: [
					{
						name: 'CTA URL Button',
						value: 'cta_url',
						description: 'Call-to-action button that opens a URL',
					},
					{
						name: 'Reply Buttons',
						value: 'button',
						description: 'Up to 3 reply buttons',
					},
					{
						name: 'List Menu',
						value: 'list',
						description: 'Scrollable list with up to 10 options in sections',
					},
				],
				default: 'cta_url',
				description: 'Type of interactive message',
			},
			{
				displayName: 'Body Text',
				name: 'interactiveBody',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['interactive'],
					},
				},
				default: '',
				description: 'Main body text of the interactive message (max 1024 characters)',
				typeOptions: {
					rows: 3,
				},
			},
			{
				displayName: 'Header Text',
				name: 'interactiveHeader',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['interactive'],
					},
				},
				default: '',
				description: 'Optional header text (max 60 characters)',
			},
			{
				displayName: 'Footer Text',
				name: 'interactiveFooter',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['interactive'],
					},
				},
				default: '',
				description: 'Optional footer text (max 60 characters)',
			},

			// CTA URL specific fields
			{
				displayName: 'Button Text',
				name: 'ctaButtonText',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['interactive'],
						interactiveType: ['cta_url'],
					},
				},
				default: '',
				description: 'Text displayed on the button (max 20 characters)',
				placeholder: 'Visit Website',
			},
			{
				displayName: 'Button URL',
				name: 'ctaButtonUrl',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['interactive'],
						interactiveType: ['cta_url'],
					},
				},
				default: '',
				description: 'URL to open when button is clicked',
				placeholder: 'https://example.com',
			},

			// Reply buttons specific fields
			{
				displayName: 'Use Advanced Mode (JSON)',
				name: 'replyButtonsAdvancedMode',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['interactive'],
						interactiveType: ['button'],
					},
				},
				default: false,
				description: 'Enable to enter buttons as JSON. Disable for simple form input.',
			},
			// Simple mode - form fields
			{
				displayName: 'Reply Buttons',
				name: 'replyButtonItems',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
					maxValue: 3,
				},
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['interactive'],
						interactiveType: ['button'],
						replyButtonsAdvancedMode: [false],
					},
				},
				default: { buttons: [] },
				description: 'Add up to 3 reply buttons',
				options: [
					{
						name: 'buttons',
						displayName: 'Buttons',
						values: [
							{
								displayName: 'ID',
								name: 'id',
								type: 'string',
								default: '',
								description: 'Unique identifier for this button (max 256 chars)',
								placeholder: 'btn-yes',
							},
							{
								displayName: 'Title',
								name: 'title',
								type: 'string',
								default: '',
								description: 'Button text displayed to user (max 20 chars)',
								placeholder: 'Yes',
							},
						],
					},
				],
			},
			// Advanced mode (JSON)
			{
				displayName: 'Buttons (JSON)',
				name: 'replyButtons',
				type: 'json',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['interactive'],
						interactiveType: ['button'],
						replyButtonsAdvancedMode: [true],
					},
				},
				default: '[{"id": "btn1", "title": "Yes"}, {"id": "btn2", "title": "No"}]',
				description: 'Array of buttons (1-3). Each button needs "id" (max 256 chars) and "title" (max 20 chars)',
			},

			// List menu specific fields
			{
				displayName: 'List Button Text',
				name: 'listButtonText',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['interactive'],
						interactiveType: ['list'],
					},
				},
				default: '',
				description: 'Text displayed on the button to open the list (max 20 characters)',
				placeholder: 'View Options',
			},
			{
				displayName: 'Use Advanced Mode (JSON)',
				name: 'listAdvancedMode',
				type: 'boolean',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['interactive'],
						interactiveType: ['list'],
					},
				},
				default: false,
				description: 'Enable to enter sections as JSON (for multiple sections). Disable for simple form input.',
			},
			// Simple mode fields
			{
				displayName: 'Section Title',
				name: 'listSectionTitle',
				type: 'string',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['interactive'],
						interactiveType: ['list'],
						listAdvancedMode: [false],
					},
				},
				default: '',
				description: 'Optional title for the section (max 24 characters)',
				placeholder: 'Choose an option',
			},
			{
				displayName: 'List Items',
				name: 'listItems',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
					maxValue: 10,
				},
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['interactive'],
						interactiveType: ['list'],
						listAdvancedMode: [false],
					},
				},
				default: { items: [] },
				description: 'Add up to 10 items to the list',
				options: [
					{
						name: 'items',
						displayName: 'Items',
						values: [
							{
								displayName: 'ID',
								name: 'id',
								type: 'string',
								default: '',
								description: 'Unique identifier for this item (max 200 chars)',
								placeholder: 'item-1',
							},
							{
								displayName: 'Title',
								name: 'title',
								type: 'string',
								default: '',
								description: 'Display title for this item (max 24 chars)',
								placeholder: 'Option 1',
							},
							{
								displayName: 'Description',
								name: 'description',
								type: 'string',
								default: '',
								description: 'Optional description (max 72 chars)',
								placeholder: 'Description of option 1',
							},
						],
					},
				],
			},
			// Advanced mode (JSON)
			{
				displayName: 'Sections (JSON)',
				name: 'listSections',
				type: 'json',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						messageType: ['interactive'],
						interactiveType: ['list'],
						listAdvancedMode: [true],
					},
				},
				default: '[{"title": "Category 1", "rows": [{"id": "item1", "title": "Option 1", "description": "Description 1"}]}]',
				description: 'Array of sections (1-10). Each section has "title" (optional) and "rows" array. Each row needs "id" (max 200 chars), "title" (max 24 chars), and optional "description" (max 72 chars)',
			},

			// ============================================
			// MARK AS READ FIELDS
			// ============================================
			{
				displayName: 'Message ID',
				name: 'messageId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['markAsRead'],
					},
				},
				default: '',
				description: 'The ID of the message to mark as read',
				placeholder: 'msg_xyz789',
			},

			// ============================================
			// LIST TEMPLATES FIELDS
			// ============================================
			{
				displayName: 'WhatsApp Phone Number',
				name: 'templatePhoneNumberId',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['listTemplates'],
					},
				},
				typeOptions: {
					loadOptionsMethod: 'getWhatsAppPhoneNumbers',
				},
				default: '',
				description: 'Filter templates by WhatsApp phone number (each number belongs to a specific WABA with its own templates)',
			},
			{
				displayName: 'Filter by Status',
				name: 'templateStatus',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['listTemplates'],
					},
				},
				options: [
					{
						name: 'All',
						value: '',
						description: 'Return all templates',
					},
					{
						name: 'Approved',
						value: 'APPROVED',
						description: 'Only approved templates (ready to use)',
					},
					{
						name: 'Pending',
						value: 'PENDING',
						description: 'Templates pending approval',
					},
					{
						name: 'Rejected',
						value: 'REJECTED',
						description: 'Rejected templates',
					},
				],
				default: '',
				description: 'Filter templates by approval status',
			},
			{
				displayName: 'Filter by Category',
				name: 'templateCategory',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['listTemplates'],
					},
				},
				options: [
					{
						name: 'All',
						value: '',
						description: 'Return all categories',
					},
					{
						name: 'Marketing',
						value: 'MARKETING',
						description: 'Marketing templates',
					},
					{
						name: 'Utility',
						value: 'UTILITY',
						description: 'Utility templates (order updates, etc.)',
					},
					{
						name: 'Authentication',
						value: 'AUTHENTICATION',
						description: 'Authentication templates (OTP, etc.)',
					},
				],
				default: '',
				description: 'Filter templates by category',
			},
			{
				displayName: 'Limit',
				name: 'templateLimit',
				type: 'number',
				displayOptions: {
					show: {
						operation: ['listTemplates'],
					},
				},
				default: 100,
				description: 'Maximum number of templates to return (max 500)',
				typeOptions: {
					minValue: 1,
					maxValue: 500,
				},
			},

			// ============================================
			// GET TEMPLATE FIELDS
			// ============================================
			{
				displayName: 'Template ID',
				name: 'templateId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['getTemplate'],
					},
				},
				default: '',
				description: 'The ID of the template to retrieve',
				placeholder: 'tpl_abc123',
			},

			// ============================================
			// SEND TYPING FIELDS
			// ============================================
			{
				displayName: 'Customer Lookup',
				name: 'typingCustomerLookup',
				type: 'options',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendTyping'],
					},
				},
				options: [
					{
						name: 'Customer ID',
						value: 'customer_id',
						description: 'Lookup by customer ID',
					},
					{
						name: 'Phone Number',
						value: 'phone_number',
						description: 'Lookup by phone number',
					},
					{
						name: 'Instagram Username',
						value: 'instagram_username',
						description: 'Lookup by Instagram username',
					},
				],
				default: 'customer_id',
				description: 'How to identify the customer',
			},
			{
				displayName: 'Customer ID',
				name: 'typingCustomerId',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendTyping'],
						typingCustomerLookup: ['customer_id'],
					},
				},
				default: '',
				description: 'The ID of the customer to send typing indicator to',
				placeholder: 'cust_abc123',
			},
			{
				displayName: 'Phone Number',
				name: 'typingPhoneNumber',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendTyping'],
						typingCustomerLookup: ['phone_number'],
					},
				},
				default: '',
				description: 'The phone number of the customer',
				placeholder: '+6281234567890',
			},
			{
				displayName: 'Instagram Username',
				name: 'typingInstagramUsername',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['sendTyping'],
						typingCustomerLookup: ['instagram_username'],
					},
				},
				default: '',
				description: 'The Instagram username of the customer',
				placeholder: 'username',
			},
			{
				displayName: 'Channel',
				name: 'typingChannel',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['sendTyping'],
					},
				},
				options: [
					{
						name: 'Auto-detect',
						value: '',
						description: 'Automatically detect based on customer data',
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
				description: 'The messaging channel to use (leave empty for auto-detect)',
			},

			// WhatsApp Phone Number Selection for Typing (Multi-number support)
			{
				displayName: 'WhatsApp Phone Number',
				name: 'typingWhatsappPhoneNumberId',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['sendTyping'],
						typingChannel: ['whatsapp'],
					},
				},
				typeOptions: {
					loadOptionsMethod: 'getWhatsAppPhoneNumbers',
				},
				default: '',
				description: 'Select which WhatsApp phone number to send typing indicator from',
			},

			// Instagram Account Selection for Typing (Multi-account support)
			{
				displayName: 'Instagram Account',
				name: 'typingInstagramAccountId',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['sendTyping'],
						typingChannel: ['instagram'],
					},
				},
				typeOptions: {
					loadOptionsMethod: 'getInstagramAccounts',
				},
				default: '',
				description: 'Select which Instagram account to send typing indicator from',
			},

			// Facebook Page Selection for Typing (Multi-account support)
			{
				displayName: 'Facebook Page',
				name: 'typingFacebookPageId',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['sendTyping'],
						typingChannel: ['messenger'],
					},
				},
				typeOptions: {
					loadOptionsMethod: 'getFacebookPages',
				},
				default: '',
				description: 'Select which Facebook Page to send typing indicator from',
			},
		],
	};

	methods = {
		loadOptions: {
			// Load WhatsApp phone numbers for dropdown (multi-number support)
			async getWhatsAppPhoneNumbers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials(brandConfig.credentialId);
				const baseUrl = credentials.baseUrl as string;

				try {
					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/phone-numbers`,
						headers: {
							'Authorization': `Bearer ${credentials.apiKey as string}`,
							'Content-Type': 'application/json',
						},
					});

					if (!response.success || !Array.isArray(response.data) || response.data.length === 0) {
						return [{ name: '-- No WhatsApp numbers connected --', value: '' }];
					}

					const phoneNumbers = response.data as Array<{
						id: string;
						display_phone_number: string;
						verified_name: string | null;
						is_primary: boolean;
						business_name: string | null;
					}>;

					// Add "Auto-detect" option at the top
					const options: INodePropertyOptions[] = [
						{
							name: 'Auto-detect (use if single number)',
							value: '',
							description: 'Let the system detect the appropriate phone number',
						},
					];

					phoneNumbers.forEach((pn) => {
						const label = pn.verified_name
							? `${pn.display_phone_number} (${pn.verified_name})`
							: pn.display_phone_number;
						const primary = pn.is_primary ? ' [Primary]' : '';
						options.push({
							name: `${label}${primary}`,
							value: pn.id,
							description: pn.business_name
								? `WABA: ${pn.business_name}`
								: `WhatsApp number ${pn.display_phone_number}`,
						});
					});

					return options;
				} catch (error: unknown) {
					const errorMessage = error instanceof Error ? error.message : 'Unknown error';
					return [{ name: `-- Error: ${errorMessage.substring(0, 50)} --`, value: '' }];
				}
			},

			// Load Instagram accounts for dropdown (multi-account support)
			async getInstagramAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials(brandConfig.credentialId);
				const baseUrl = credentials.baseUrl as string;

				try {
					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/instagram-accounts`,
						headers: {
							'Authorization': `Bearer ${credentials.apiKey as string}`,
							'Content-Type': 'application/json',
						},
					});

					if (!response.success || !Array.isArray(response.data) || response.data.length === 0) {
						return [{ name: '-- No Instagram accounts connected --', value: '' }];
					}

					const accounts = response.data as Array<{
						id: string;
						username: string;
						connection_status: string;
					}>;

					// Add "Auto-detect" option at the top
					const options: INodePropertyOptions[] = [
						{
							name: 'Auto-detect (use if single account)',
							value: '',
							description: 'Let the system detect the appropriate account',
						},
					];

					// Add connected accounts
					accounts
						.filter((a) => a.connection_status === 'connected')
						.forEach((account) => {
							options.push({
								name: `@${account.username}`,
								value: account.id,
								description: `Instagram account @${account.username}`,
							});
						});

					return options;
				} catch (error: unknown) {
					const errorMessage = error instanceof Error ? error.message : 'Unknown error';
					return [{ name: `-- Error: ${errorMessage.substring(0, 50)} --`, value: '' }];
				}
			},

			// Load Facebook Pages for dropdown (multi-account support)
			async getFacebookPages(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials(brandConfig.credentialId);
				const baseUrl = credentials.baseUrl as string;

				try {
					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/facebook-pages`,
						headers: {
							'Authorization': `Bearer ${credentials.apiKey as string}`,
							'Content-Type': 'application/json',
						},
					});

					if (!response.success || !Array.isArray(response.data) || response.data.length === 0) {
						return [{ name: '-- No Facebook Pages connected --', value: '' }];
					}

					const pages = response.data as Array<{
						id: string;
						page_id: string;
						page_name: string;
						connection_status: string;
					}>;

					// Add "Auto-detect" option at the top
					const options: INodePropertyOptions[] = [
						{
							name: 'Auto-detect (use if single page)',
							value: '',
							description: 'Let the system detect the appropriate page',
						},
					];

					// Add connected pages
					pages
						.filter((p) => p.connection_status === 'connected')
						.forEach((page) => {
							options.push({
								name: page.page_name,
								value: page.id,
								description: `Facebook Page: ${page.page_name}`,
							});
						});

					return options;
				} catch (error: unknown) {
					const errorMessage = error instanceof Error ? error.message : 'Unknown error';
					return [{ name: `-- Error: ${errorMessage.substring(0, 50)} --`, value: '' }];
				}
			},

			// Load templates from API for dropdown (filtered by selected phone number)
			async getTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials(brandConfig.credentialId);
				const baseUrl = credentials.baseUrl as string;

				try {
					// Get the selected phone number to filter templates by WABA
					let phoneNumberFilter = '';
					try {
						const selectedPhoneNumber = this.getCurrentNodeParameter('whatsappPhoneNumberId') as string;
						if (selectedPhoneNumber) {
							phoneNumberFilter = `&whatsapp_phone_number_id=${selectedPhoneNumber}`;
						}
					} catch {
						// Parameter not available yet, skip filter
					}

					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/templates?status=APPROVED&limit=500${phoneNumberFilter}`,
						headers: {
							'Authorization': `Bearer ${credentials.apiKey as string}`,
							'Content-Type': 'application/json',
						},
					});

					if (!response.success || !response.data) {
						return [{ name: '-- No templates found --', value: '' }];
					}

					const templates = response.data as Array<{
						id: string;
						template_name: string;
						language: string;
						category: string;
						content: string;
						has_variables: boolean;
					}>;

					if (templates.length === 0) {
						return [{ name: '-- No approved templates --', value: '' }];
					}

					// Count variables in content
					const countVariables = (content: string): number => {
						const matches = content?.match(/\{\{\d+\}\}/g);
						return matches ? matches.length : 0;
					};

					return templates.map((t) => {
						const varCount = countVariables(t.content);
						const varInfo = varCount > 0 ? ` [${varCount} var]` : '';
						return {
							name: `${t.template_name} (${t.language})${varInfo}`,
							value: JSON.stringify({
								name: t.template_name,
								language: t.language,
							}),
							description: t.content?.substring(0, 100) || '',
						};
					});
				} catch (error: unknown) {
					const errorMessage = error instanceof Error ? error.message : 'Unknown error';
					return [{ name: `-- Error: ${errorMessage.substring(0, 50)} --`, value: '' }];
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials(brandConfig.credentialId);
		const baseUrl = credentials.baseUrl as string;

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				let responseData;

				if (operation === 'sendMessage') {
					// ============================================
					// SEND MESSAGE OPERATION
					// ============================================
					const customerLookup = this.getNodeParameter('customerLookup', i) as string;
					const channel = this.getNodeParameter('channel', i) as string;
					const messageType = this.getNodeParameter('messageType', i) as string;

					const body: Record<string, unknown> = {
						channel,
						message_type: messageType,
					};

					// Set customer identifier based on lookup method
					if (customerLookup === 'customer_id') {
						body.customer_id = this.getNodeParameter('customerId', i) as string;
					} else if (customerLookup === 'phone_number') {
						body.phone_number = this.getNodeParameter('phoneNumber', i) as string;
					} else if (customerLookup === 'instagram_username') {
						body.instagram_username = this.getNodeParameter('instagramUsername', i) as string;
					}

					// Add phone number ID for multi-number support (WhatsApp)
					if (channel === 'whatsapp') {
						const whatsappPhoneNumberId = this.getNodeParameter('whatsappPhoneNumberId', i, '') as string;
						if (whatsappPhoneNumberId) {
							body.whatsapp_phone_number_id = whatsappPhoneNumberId;
						}
					}

					// Add account ID for multi-account support (Instagram)
					if (channel === 'instagram') {
						const instagramAccountId = this.getNodeParameter('instagramAccountId', i, '') as string;
						if (instagramAccountId) {
							body.instagram_account_id = instagramAccountId;
						}
					}

					// Add page ID for multi-account support (Messenger)
					if (channel === 'messenger') {
						const facebookPageId = this.getNodeParameter('facebookPageId', i, '') as string;
						if (facebookPageId) {
							body.facebook_page_id = facebookPageId;
						}
					}

					// Handle different message types
					if (messageType === 'text') {
						body.content = this.getNodeParameter('content', i) as string;
					} else if (messageType === 'template') {
						// WhatsApp template message
						const manualEntry = this.getNodeParameter('templateManualEntry', i, false) as boolean;

						let templateName: string;
						let templateLanguage: string;
						let templateComponents: unknown = [];

						if (manualEntry) {
							// Manual entry mode - user types name and language
							templateName = this.getNodeParameter('templateName', i) as string;
							templateLanguage = this.getNodeParameter('templateLanguage', i) as string;

							// Check for advanced JSON components
							const templateComponentsJson = this.getNodeParameter('templateComponents', i, '[]') as string;
							if (templateComponentsJson && templateComponentsJson !== '[]') {
								try {
									templateComponents = JSON.parse(templateComponentsJson);
								} catch (error) {
									throw new NodeOperationError(
										this.getNode(),
										`Invalid JSON in Template Components: ${error instanceof Error ? error.message : 'Parse failed'}`,
										{ itemIndex: i },
									);
								}

								// Validate template components structure
								if (!validateTemplateComponents(templateComponents)) {
									throw new NodeOperationError(
										this.getNode(),
										'Template Components must be a JSON array of objects. Example: [{"type": "body", "parameters": [...]}]',
										{ itemIndex: i },
									);
								}
							}
						} else {
							// Dropdown selection mode - parse from selected value
							const templateSelectValue = this.getNodeParameter('templateSelect', i) as string;

							if (!templateSelectValue) {
								throw new NodeOperationError(
									this.getNode(),
									'Please select a template or enable manual entry',
									{ itemIndex: i },
								);
							}

							try {
								const templateData = JSON.parse(templateSelectValue) as {
									name: string;
									language: string;
								};
								templateName = templateData.name;
								templateLanguage = templateData.language;
						} catch (error) {
							throw new NodeOperationError(
								this.getNode(),
								'Invalid template selection. Please re-select the template.',
								{ itemIndex: i },
							);
						}
					}

					// Handle template variables from individual fields
					const templateVarCount = this.getNodeParameter('templateVariableCount', i, 0) as number;
					const templateVariables: string[] = [];
					for (let v = 1; v <= templateVarCount; v++) {
						const val = this.getNodeParameter(`templateVar${v}`, i, '') as string;
						templateVariables.push(val);
					}

					if (templateVariables.length > 0) {
						// Build body component with parameters
						const bodyParameters = templateVariables.map((v) => ({
							type: 'text',
							text: v,
						}));

						// If no components provided, create body component with variables
						if (!Array.isArray(templateComponents) || templateComponents.length === 0) {
							templateComponents = [
								{
									type: 'body',
									parameters: bodyParameters,
								},
							];
						}
					}

					body.template = {
						name: templateName,
						language: { code: templateLanguage },
						components: templateComponents,
					};

					// Auto-create customer support (only for phone_number lookup + template)
					if (customerLookup === 'phone_number') {
						const autoCreateCustomer = this.getNodeParameter('autoCreateCustomer', i, true) as boolean;
						body.auto_create_customer = autoCreateCustomer;

						if (autoCreateCustomer) {
							const customerName = this.getNodeParameter('customerName', i, '') as string;
							if (customerName) {
								body.customer_name = customerName;
							}
						}
					}
					} else if (messageType === 'interactive') {
						// WhatsApp interactive message
						const interactiveType = this.getNodeParameter('interactiveType', i) as string;
						const interactiveBody = (this.getNodeParameter('interactiveBody', i) as string).trim();
						const interactiveHeader = (this.getNodeParameter('interactiveHeader', i, '') as string).trim();
						const interactiveFooter = (this.getNodeParameter('interactiveFooter', i, '') as string).trim();

						// Validate body text is not empty
						if (!interactiveBody) {
							throw new NodeOperationError(
								this.getNode(),
								'Body Text is required for interactive messages',
								{ itemIndex: i },
							);
						}

						const interactive: Record<string, unknown> = {
							type: interactiveType,
							body: { text: interactiveBody },
						};

						// Add optional header
						if (interactiveHeader) {
							interactive.header = {
								type: 'text',
								text: interactiveHeader,
							};
						}

						// Add optional footer
						if (interactiveFooter) {
							interactive.footer = { text: interactiveFooter };
						}

						// Add action based on type
						if (interactiveType === 'cta_url') {
							const ctaButtonText = this.getNodeParameter('ctaButtonText', i) as string;
							const ctaButtonUrl = this.getNodeParameter('ctaButtonUrl', i) as string;

							if (!isValidUrl(ctaButtonUrl)) {
								throw new NodeOperationError(
									this.getNode(),
									`Invalid Button URL format: "${ctaButtonUrl}". URL must start with http:// or https://`,
									{ itemIndex: i },
								);
							}

							interactive.action = {
								name: 'cta_url',
								parameters: {
									display_text: ctaButtonText,
									url: ctaButtonUrl,
								},
							};
						} else if (interactiveType === 'button') {
							const advancedMode = this.getNodeParameter('replyButtonsAdvancedMode', i, false) as boolean;
							let formattedButtons: Array<{ type: string; reply: { id: string; title: string } }>;

							if (advancedMode) {
								// Advanced mode: parse JSON
								const replyButtonsJson = this.getNodeParameter('replyButtons', i) as string;

								let replyButtons: unknown;
								try {
									replyButtons = JSON.parse(replyButtonsJson);
								} catch (error) {
									throw new NodeOperationError(
										this.getNode(),
										`Invalid JSON in Reply Buttons: ${error instanceof Error ? error.message : 'Parse failed'}`,
										{ itemIndex: i },
									);
								}

								if (!Array.isArray(replyButtons) || replyButtons.length === 0 || replyButtons.length > 3) {
									throw new NodeOperationError(
										this.getNode(),
										'Reply Buttons must be a JSON array with 1-3 buttons. Example: [{"id": "btn1", "title": "Yes"}]',
										{ itemIndex: i },
									);
								}

								// Transform to WhatsApp format
								formattedButtons = replyButtons.map((btn: { id?: string; title?: string }) => ({
									type: 'reply',
									reply: {
										id: (btn.id || '').trim(),
										title: (btn.title || '').trim(),
									},
								}));
							} else {
								// Simple mode: build from form fields
								const buttonItemsData = this.getNodeParameter('replyButtonItems', i, { buttons: [] }) as {
									buttons: Array<{ id: string; title: string }>;
								};

								if (!buttonItemsData.buttons || buttonItemsData.buttons.length === 0) {
									throw new NodeOperationError(
										this.getNode(),
										'At least one reply button is required',
										{ itemIndex: i },
									);
								}

								if (buttonItemsData.buttons.length > 3) {
									throw new NodeOperationError(
										this.getNode(),
										'Maximum 3 reply buttons allowed',
										{ itemIndex: i },
									);
								}

								// Track IDs to ensure uniqueness
								const usedIds = new Set<string>();

								formattedButtons = buttonItemsData.buttons.map((btn, index) => {
									const id = (btn.id || '').trim();
									const title = (btn.title || '').trim();

									if (!id || !title) {
										throw new NodeOperationError(
											this.getNode(),
											`Button ${index + 1}: ID and Title are required (cannot be empty)`,
											{ itemIndex: i },
										);
									}

									// Check for duplicate IDs
									if (usedIds.has(id)) {
										throw new NodeOperationError(
											this.getNode(),
											`Button ${index + 1}: Duplicate ID "${id}". Each button must have a unique ID.`,
											{ itemIndex: i },
										);
									}
									usedIds.add(id);

									if (id.length > 256) {
										throw new NodeOperationError(
											this.getNode(),
											`Button ${index + 1}: ID exceeds maximum length of 256 characters`,
											{ itemIndex: i },
										);
									}
									if (title.length > 20) {
										throw new NodeOperationError(
											this.getNode(),
											`Button ${index + 1}: Title exceeds maximum length of 20 characters`,
											{ itemIndex: i },
										);
									}

									return {
										type: 'reply',
										reply: { id, title },
									};
								});
							}

							interactive.action = {
								buttons: formattedButtons,
							};
						} else if (interactiveType === 'list') {
							const listButtonText = (this.getNodeParameter('listButtonText', i) as string).trim();
							const advancedMode = this.getNodeParameter('listAdvancedMode', i, false) as boolean;

							if (!listButtonText) {
								throw new NodeOperationError(
									this.getNode(),
									'List Button Text is required for list interactive messages',
									{ itemIndex: i },
								);
							}

							if (listButtonText.length > 20) {
								throw new NodeOperationError(
									this.getNode(),
									`List Button Text exceeds maximum length of 20 characters (current: ${listButtonText.length})`,
									{ itemIndex: i },
								);
							}

							let listSections: unknown;

							if (advancedMode) {
								// Advanced mode: parse JSON
								const listSectionsJson = this.getNodeParameter('listSections', i) as string;
								try {
									listSections = JSON.parse(listSectionsJson);
								} catch (error) {
									throw new NodeOperationError(
										this.getNode(),
										`Invalid JSON in List Sections: ${error instanceof Error ? error.message : 'Parse failed'}`,
										{ itemIndex: i },
									);
								}

								if (!Array.isArray(listSections) || listSections.length === 0 || listSections.length > 10) {
									throw new NodeOperationError(
										this.getNode(),
										'List Sections must be a JSON array with 1-10 sections. Example: [{"title": "Category", "rows": [{"id": "1", "title": "Option 1"}]}]',
										{ itemIndex: i },
									);
								}

								// Validate sections structure
								for (const section of listSections as Array<{ title?: string; rows?: unknown[] }>) {
									if (!section.rows || !Array.isArray(section.rows) || section.rows.length === 0) {
										throw new NodeOperationError(
											this.getNode(),
											'Each section must have a "rows" array with at least 1 row',
											{ itemIndex: i },
										);
									}
									if (section.rows.length > 10) {
										throw new NodeOperationError(
											this.getNode(),
											'Each section can have maximum 10 rows',
											{ itemIndex: i },
										);
									}
								}
							} else {
								// Simple mode: build from form fields
								const sectionTitle = (this.getNodeParameter('listSectionTitle', i, '') as string).trim();
								const listItemsData = this.getNodeParameter('listItems', i, { items: [] }) as {
									items: Array<{ id: string; title: string; description?: string }>;
								};

								if (!listItemsData.items || listItemsData.items.length === 0) {
									throw new NodeOperationError(
										this.getNode(),
										'At least one list item is required',
										{ itemIndex: i },
									);
								}

								// Track IDs to ensure uniqueness
								const usedIds = new Set<string>();

								// Validate and build rows
								const rows = listItemsData.items.map((item, index) => {
									const id = (item.id || '').trim();
									const title = (item.title || '').trim();
									const description = (item.description || '').trim();

									if (!id || !title) {
										throw new NodeOperationError(
											this.getNode(),
											`List item ${index + 1}: ID and Title are required (cannot be empty)`,
											{ itemIndex: i },
										);
									}

									// Check for duplicate IDs
									if (usedIds.has(id)) {
										throw new NodeOperationError(
											this.getNode(),
											`List item ${index + 1}: Duplicate ID "${id}". Each item must have a unique ID.`,
											{ itemIndex: i },
										);
									}
									usedIds.add(id);

									if (id.length > 200) {
										throw new NodeOperationError(
											this.getNode(),
											`List item ${index + 1}: ID exceeds maximum length of 200 characters`,
											{ itemIndex: i },
										);
									}
									if (title.length > 24) {
										throw new NodeOperationError(
											this.getNode(),
											`List item ${index + 1}: Title exceeds maximum length of 24 characters`,
											{ itemIndex: i },
										);
									}
									if (description && description.length > 72) {
										throw new NodeOperationError(
											this.getNode(),
											`List item ${index + 1}: Description exceeds maximum length of 72 characters`,
											{ itemIndex: i },
										);
									}

									const row: { id: string; title: string; description?: string } = {
										id,
										title,
									};
									if (description) {
										row.description = description;
									}
									return row;
								});

								// Build single section
								const section: { title?: string; rows: typeof rows } = { rows };
								if (sectionTitle) {
									if (sectionTitle.length > 24) {
										throw new NodeOperationError(
											this.getNode(),
											`Section Title exceeds maximum length of 24 characters`,
											{ itemIndex: i },
										);
									}
									section.title = sectionTitle;
								}

								listSections = [section];
							}

							interactive.action = {
								button: listButtonText,
								sections: listSections,
							};
						}

						if (!validateInteractiveMessage(interactive)) {
							throw new NodeOperationError(
								this.getNode(),
								'Invalid interactive message structure',
								{ itemIndex: i },
							);
						}

						body.interactive = interactive;
					} else {
						// Media messages (image, document, audio, video, media_share, file)
						const mediaUrl = this.getNodeParameter('mediaUrl', i) as string;

						// Validate media URL is provided
						if (!mediaUrl) {
							throw new NodeOperationError(
								this.getNode(),
								`Media URL is required for ${messageType} messages`,
								{ itemIndex: i },
							);
						}

						// Validate media URL format
						if (!isValidUrl(mediaUrl)) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid Media URL format: "${mediaUrl}". URL must start with http:// or https://`,
								{ itemIndex: i },
							);
						}

						body.media_url = mediaUrl;

						// Add caption if provided
						const caption = this.getNodeParameter('caption', i, '') as string;
						if (caption) {
							body.caption = caption;
						}

						// Add filename for document/file types
						if (messageType === 'document' || messageType === 'file') {
							const filename = this.getNodeParameter('filename', i, '') as string;
							if (filename) {
								body.filename = filename;
							}
						}
					}

					responseData = await this.helpers.httpRequestWithAuthentication.call(
						this,
						brandConfig.credentialId,
						{
							method: 'POST',
							url: `${baseUrl}/messages/send`,
							body,
							json: true,
						},
					);
				} else if (operation === 'markAsRead') {
					// ============================================
					// MARK AS READ OPERATION
					// ============================================
					const messageId = this.getNodeParameter('messageId', i) as string;

					responseData = await this.helpers.httpRequestWithAuthentication.call(
						this,
						brandConfig.credentialId,
						{
							method: 'POST',
							url: `${baseUrl}/messages/${messageId}/read`,
							json: true,
						},
					);
				} else if (operation === 'listTemplates') {
					// ============================================
					// LIST TEMPLATES OPERATION
					// ============================================
					const templatePhoneNumberId = this.getNodeParameter('templatePhoneNumberId', i, '') as string;
					const templateStatus = this.getNodeParameter('templateStatus', i, '') as string;
					const templateCategory = this.getNodeParameter('templateCategory', i, '') as string;
					const templateLimit = this.getNodeParameter('templateLimit', i, 100) as number;

					// Build query string
					const queryParams: string[] = [];
					if (templatePhoneNumberId) {
						queryParams.push(`whatsapp_phone_number_id=${templatePhoneNumberId}`);
					}
					if (templateStatus) {
						queryParams.push(`status=${templateStatus}`);
					}
					if (templateCategory) {
						queryParams.push(`category=${templateCategory}`);
					}
					if (templateLimit) {
						queryParams.push(`limit=${templateLimit}`);
					}

					const queryString = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';

					responseData = await this.helpers.httpRequestWithAuthentication.call(
						this,
						brandConfig.credentialId,
						{
							method: 'GET',
							url: `${baseUrl}/templates${queryString}`,
							json: true,
						},
					);
				} else if (operation === 'getTemplate') {
					// ============================================
					// GET TEMPLATE OPERATION
					// ============================================
					const templateId = this.getNodeParameter('templateId', i) as string;

					responseData = await this.helpers.httpRequestWithAuthentication.call(
						this,
						brandConfig.credentialId,
						{
							method: 'GET',
							url: `${baseUrl}/templates/${templateId}`,
							json: true,
						},
					);
				} else if (operation === 'sendTyping') {
					// ============================================
					// SEND TYPING INDICATOR OPERATION
					// ============================================
					const typingLookup = this.getNodeParameter('typingCustomerLookup', i) as string;
					const typingChannel = this.getNodeParameter('typingChannel', i, '') as string;

					// Get customer identifier based on lookup method
					let customerIdentifier: string;
					if (typingLookup === 'customer_id') {
						customerIdentifier = this.getNodeParameter('typingCustomerId', i) as string;
					} else if (typingLookup === 'phone_number') {
						customerIdentifier = this.getNodeParameter('typingPhoneNumber', i) as string;
					} else {
						customerIdentifier = this.getNodeParameter('typingInstagramUsername', i) as string;
					}

					const typingBody: Record<string, unknown> = {};
					if (typingChannel) {
						typingBody.channel = typingChannel;
					}

					// Add phone number ID for multi-number support (WhatsApp)
					if (typingChannel === 'whatsapp') {
						const whatsappPhoneNumberId = this.getNodeParameter('typingWhatsappPhoneNumberId', i, '') as string;
						if (whatsappPhoneNumberId) {
							typingBody.whatsapp_phone_number_id = whatsappPhoneNumberId;
						}
					}

					// Add account ID for multi-account support (Instagram)
					if (typingChannel === 'instagram') {
						const instagramAccountId = this.getNodeParameter('typingInstagramAccountId', i, '') as string;
						if (instagramAccountId) {
							typingBody.instagram_account_id = instagramAccountId;
						}
					}

					// Add page ID for multi-account support (Messenger)
					if (typingChannel === 'messenger') {
						const facebookPageId = this.getNodeParameter('typingFacebookPageId', i, '') as string;
						if (facebookPageId) {
							typingBody.facebook_page_id = facebookPageId;
						}
					}

					responseData = await this.helpers.httpRequestWithAuthentication.call(
						this,
						brandConfig.credentialId,
						{
							method: 'POST',
							url: `${baseUrl}/conversations/${customerIdentifier}/typing`,
							body: typingBody,
							json: true,
						},
					);
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`The operation "${operation}" is not supported!`,
					);
				}

				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(responseData),
					{ itemData: { item: i } },
				);

				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					returnData.push({
						json: {
							error: errorMessage,
						},
						pairedItem: {
							item: i,
						},
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
