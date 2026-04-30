# AquaDevs API Documentation

> **Base URL:** `https://aquadevs.com/api/v1` (or `https://api.aquadevs.com/v1`)
> **Authentication:** `Authorization: Bearer <your_api_key>` (e.g. `aqua_sk_...`)

AquaDevs is a unified free AI API platform offering seamless integration for developers. It serves as a standard OpenAI drop-in replacement.

## 1. Chat Completions (Text)

`POST /v1/chat/completions`

### Request Body (OpenAI Standard)
- `model` (string, required): The ID of the model to use.
- `messages` (array, required): Array of message objects (`role`, `content`).
- `temperature` (number, optional): Controls randomness.
- `stream` (boolean, optional): Set to `true` for SSE streaming.
- `max_tokens` (integer, optional): Maximum tokens to generate.

### Example Request
```bash
curl https://api.aquadevs.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer aqua_sk_yourkey" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

## 2. Image Generation

`POST /v1/images/generations`

### Request Body
- `model` (string, required): The image model.
- `prompt` (string, required): Description of the image.
- `size` (string, optional): E.g., `1024x1024`.

## Rate Limits
- Always parse headers like `x-ratelimit-remaining`.
- Ensure the aggregator correctly catches `429 Too Many Requests` to fall back gracefully if the free limits are exhausted.
