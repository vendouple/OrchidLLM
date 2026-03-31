LLM APIs
Overview
The Large Language Model (LLM) NIM API endpoints provide simple access to use natural language based generative AI. This single API endpoint provides access to top models for use in a wide range of tasks including: chat, instruction following, question answering, summarization, creative text generation, and code generation.

NOTE: Select models are available as downloadable container images and supported with an NVIDIA AI Enterprise entitlement. These select models have additional OpenAI API spec details for running self-hosted localized NIMs. Please refer to the Downloadable NIM documentation for additional information.

URL: <https://integrate.api.nvidia.com>

Endpoint: POST /v1/chat/completions

<https://docs.api.nvidia.com/nim/reference/retrieval-apis>
<https://docs.api.nvidia.com/nim/reference/models-1>
<https://docs.api.nvidia.com/nim/reference/llm-apis>
Nvidia nim has alot of different models like this. Provide an endpoint.

Nvidia NIMs rate limits are 40RPM. Unlimited per day or month. THe issue is only queueing for inference. THe rest is fine.
Models provided in the list here in the URL above.
