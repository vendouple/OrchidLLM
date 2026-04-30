# EvolveX API Documentation

> **Base URL:** `https://api.evolvex.gg/v1`
> **Authentication:** `Authorization: Bearer <your_api_key>`

EvolveX provides an API gateway for accessing top AI models for text and image generation.

## 1. Chat Completions (Text)

`POST /v1/chat/completions`

### Request Body (OpenAI Standard)
- `model` (string, required): The ID of the model to use.
- `messages` (array, required): Array of message objects (`role`, `content`).
- `temperature` (number, optional): Controls randomness.
- `stream` (boolean, optional): Set to `true` for SSE streaming.

### Example Request
```bash
curl https://api.evolvex.gg/v1/chat/completions \
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

## Rate Limits
- Expect standard `429 Too Many Requests` headers if limits are exceeded. The aggregator must handle this correctly.
