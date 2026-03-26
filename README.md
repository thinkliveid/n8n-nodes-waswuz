# n8n-nodes-waswuz

n8n community node untuk mengirim pesan WhatsApp, Instagram DM, dan Facebook Messenger.

## Features

- **Send Message** - Kirim text, image, document, audio, video, template, atau interactive message
- **List Templates** - Lihat daftar WhatsApp message templates
- **Get Template** - Ambil detail template by ID
- **Mark as Read** - Tandai pesan sebagai sudah dibaca
- **Send Typing Indicator** - Tampilkan indikator mengetik

## Installation

### Via n8n Community Nodes

1. Buka **Settings > Community Nodes**
2. Klik **Install**
3. Masukkan nama package dan confirm

### Manual Installation

```bash
cd ~/.n8n/nodes
npm install nama-package
```

## Credentials

1. Login ke dashboard platform Anda
2. Buka **Settings > Developers > API Keys**
3. Buat API Key baru
4. Di n8n, buat credentials baru dan paste API key

## Operations

### Send Message

Kirim pesan ke customer via WhatsApp, Instagram, atau Messenger.

**Customer Lookup:**
| Method | Contoh |
|--------|--------|
| Customer ID | `cust_abc123` |
| Phone Number | `+6281234567890` |
| Instagram Username | `johndoe` |

**Message Types:**
| Channel | Types |
|---------|-------|
| WhatsApp | text, image, document, audio, video, template, interactive |
| Instagram | text, image, media_share |
| Messenger | text, image, video, audio, file |

### List Templates

Filter WhatsApp templates by:
- Status: APPROVED, PENDING, REJECTED
- Category: MARKETING, UTILITY, AUTHENTICATION

### Mark as Read

Kirim read receipt untuk pesan masuk.

### Send Typing Indicator

Tampilkan typing indicator ke customer (rate limit: 1x per 3 detik).

## License

MIT
