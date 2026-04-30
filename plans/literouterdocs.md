# LiteRouter API Documentation

> **Base URL:** `https://api.literouter.com/v1` (or `https://api.literouter.com`)
> **Authentication:** `Authorization: Bearer <your_api_key>`

LiteRouter acts as a unified aggregator for various AI models, providing OpenAI-compatible endpoints.

## 1. Chat Completions (Text)

`POST /v1/chat/completions`

### Request Body (OpenAI Standard)
- `model` (string, required): The ID of the model to use. Often prefixed or suffixed, e.g., `deepseek-free`, `mistral-free`, `llama-free`.
- `messages` (array, required): Array of message objects (`role`, `content`).
- `temperature` (number, optional): Controls randomness.
- `stream` (boolean, optional): Set to `true` for SSE streaming.

### Example Request
```bash
curl https://api.literouter.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{
    "model": "deepseek-free",
    "messages": [
      {"role": "user", "content": "Hello world!"}
    ]
  }'
```

## Rate Limits
- Free models like `deepseek-free` may have strict RPM (Requests Per Minute) limits.
- The Aggregator must catch `429` status codes and route to an alternative provider.
