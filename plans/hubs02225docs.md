# Hubs02225 API Documentation

> **Base URL:** `[Placeholder Endpoint]`
> **Authentication:** `Authorization: Bearer <your_api_key>`
> **Supported Modalities:** Text

Hubs02225 acts as a standard OpenAI-compatible API gateway/provider.

## 1. Chat Completions (Text)

`POST /v1/chat/completions`

### Request Body (OpenAI Standard)
- `model` (string, required): The ID of the model to use.
- `messages` (array, required): Array of message objects (`role`, `content`).
- `temperature` (number, optional): Controls randomness.
- `stream` (boolean, optional): Set to `true` for SSE streaming.

### Example Request
```bash
curl [Placeholder Endpoint]/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello world!"}
    ]
  }'
```


## Rate Limits & Specifics
- Always check headers like `x-ratelimit-remaining`.
- The aggregator will catch `429` errors and fall back appropriately.
