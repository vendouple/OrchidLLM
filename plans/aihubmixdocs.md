# AiHubMix API Documentation

> **Base URL:** `https://api.aihubmix.com/v1`
> **Authentication:** `Authorization: Bearer <your_api_key>` (e.g. `sk-Ep...`)

AiHubMix is an LLM API router and proxy service that provides a single, unified endpoint compatible with the OpenAI API standard. It allows access to a wide range of models (OpenAI, Anthropic Claude, Google Gemini, DeepSeek, Qwen).

## 1. Chat Completions (Text)

`POST /v1/chat/completions`

### Request Body (OpenAI Standard)
- `model` (string, required): The ID of the model to use (e.g. `gpt-4o`, `claude-3-opus`).
- `messages` (array, required): Array of message objects (`role`, `content`).
- `temperature` (number, optional): Controls randomness.
- `stream` (boolean, optional): Set to `true` for SSE streaming.

### Example Request
```bash
curl https://api.aihubmix.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
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
- `model` (string, required): Image generation model (e.g., `dall-e-3`).
- `prompt` (string, required): Description of the image.
- `size` (string, optional): E.g., `1024x1024`.

## Rate Limits
- It utilizes load balancing for OpenAI models and operates on a Pay-as-you-go model.
- 429 Errors indicate that the balance is zero or strict concurrency limits were hit.
