# Xeven Worker API Documentation

> **Base URL:** `https://ai-image-api.xeven.workers.dev`
> **Authentication:** Depends on implementation, typically none or query param
> **Supported Modalities:** Image Only

Xeven worker uses a custom endpoint instead of the standard OpenAI format.

## 1. Image Generation

`GET /img?prompt={prompt}`

### Example Request
```bash
curl "https://ai-image-api.xeven.workers.dev/img?prompt=A%20cat%20in%20space" --output image.jpg
```
