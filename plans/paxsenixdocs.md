# Paxsenix API Documentation

> **Base URL:** `https://api.paxsenix.org/v1`
> **Authentication:** `Authorization: Bearer <your_api_key>` (e.g. `sk-paxsenix-...`)

Paxsenix provides a free and flexible AI API. It uses the standard OpenAI-compatible API format and supports text, image, and audio endpoints.

## 1. Chat Completions (Text)

`POST /v1/chat/completions`

### Request Body (OpenAI Standard)
- `model` (string, required): The ID of the model to use.
- `messages` (array, required): Array of message objects (`role`, `content`).
- `temperature` (number, optional): Defaults to 0.7.
- `stream` (boolean, optional): Set to `true` for SSE streaming.

### Example Request
```bash
curl https://api.paxsenix.org/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-paxsenix-yourkey" \
  -d '{
    "model": "gpt-4-turbo",
    "messages": [
      {"role": "user", "content": "What is AI?"}
    ]
  }'
```

## 2. Image Generation

`POST /v1/images/generations`

### Request Body
- `prompt` (string, required): Text description of the image.
- `model` (string, optional): Image generation model.
- `size` (string, optional): Image dimensions.

## 3. Audio / Speech

`POST /v1/audio/speech`

### Request Body
- `input` (string, required): Text to synthesize.
- `voice` (string, required): Desired voice.
- `model` (string, required): TTS model.

## Rate Limits & Usage
- Since it is a free API, expect strict rate limits. 
- Implement fallback logic in the aggregator if a `429` error is encountered.
