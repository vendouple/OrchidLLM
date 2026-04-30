# OpenRouter API Documentation

> **Base URL:** `https://openrouter.ai/api/v1`
> **Authentication:** `Authorization: Bearer <your_api_key>`
> **Supported Modalities:** Text, Image

OpenRouter acts as a standard OpenAI-compatible API gateway/provider.

## 1. Chat Completions (Text)

`POST /v1/chat/completions`

### Request Body (OpenAI Standard)
- `model` (string, required): The ID of the model to use.
- `messages` (array, required): Array of message objects (`role`, `content`).
- `temperature` (number, optional): Controls randomness.
- `stream` (boolean, optional): Set to `true` for SSE streaming.

### Example Request
```bash
curl https://openrouter.ai/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello world!"}
    ]
  }'
```

## 2. Image Generation

`POST /v1/images/generations`

### Request Body
- `model` (string, required): Image generation model.
- `prompt` (string, required): Description of the image.
- `size` (string, optional): Image dimensions.

## Rate Limits & Specifics
- Always check headers like `x-ratelimit-remaining`.
- The aggregator will catch `429` errors and fall back appropriately.
