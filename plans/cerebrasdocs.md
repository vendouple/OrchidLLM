> ## Documentation Index
>
> Fetch the complete documentation index at: <https://inference-docs.cerebras.ai/llms.txt>
> Use this file to discover all available pages before exploring further.

# Rate Limits

> Learn how rate limits are applied and measured.

Rate limits ensure fair usage and system stability by regulating how often users and applications can access our API within a specified timeframe. They help protect our service from abuse or misuse and keep your access fair and without slowdowns.

## How are rate limits measured?

We measure rate limits in requests sent and tokens used within a specified timeframe:

* Requests per minute/hour/day (RPM, RPH, RPD)
* Tokens per minute/hour/day (TPM, TPH, TPD)

Rate limiting can be triggered by any metric, whichever comes first. For example, you have a rate limit of 50 RPM and 200K TPM. If you submit 50 requests in one minute with just 100 tokens each, you'll hit your limit even though your total token usage (5,000) is far below the 200K token threshold.

Rate limits apply at the organization level, not the user level, and vary based on the model.

### Token Rate Limiting

When you send a request, we estimate the total tokens that will be consumed by:

1. Estimating the input tokens in your prompt
2. Adding either the `max_completion_tokens` parameter or the maximum sequence length (MSL), minus input tokens

If this estimated token consumption would exceed your available token quota, the request is rate limited before processing begins. This ensure fair usage and system stability.

**Best practice**: Set [`max_completion_tokens`](/api-reference/chat-completions#param-max-completion-tokens) appropriately for your use case to avoid overestimating token usage and triggering unnecessary rate limits.

### Quota Replenishment

Your quota is calculated as:

```
Available quota = Rate limit - Usage in current time window
```

We use the [token bucketing](https://en.wikipedia.org/wiki/Token_bucket) algorithm for rate limiting, which means your capacity replenishes continuously rather than resetting at fixed intervals. As you consume tokens or requests, your available capacity automatically refills up to your maximum limit.

This token bucketing approach ensures smoother API access and prevents the "burst at interval start, then idle" pattern.

## Limits by Tier

This provides an overview of general limits, though specific cases may vary. For precise, up-to-date rate limit information applicable to your organization, check the Limits section within your account.

<Tabs>
  <Tab title="Free">
    | Model                            | TPM | TPH | TPD | RPM | RPH | RPD   |
    | -------------------------------- | --- | --- | --- | --- | --- | ----- |
    | `gpt-oss-120b`                   | 64K | 1M  | 1M  | 30  | 900 | 14.4K |
    | `llama3.1-8b`                    | 60K | 1M  | 1M  | 30  | 900 | 14.4K |
    | `qwen-3-235b-a22b-instruct-2507` | 60K | 1M  | 1M  | 30  | 900 | 14.4K |
    | `zai-glm-4.7`                    | 60K | 1M  | 1M  | 10  | 100 | 100   |
  </Tab>

  <Tab title="Pay as You Go">
    | Model                            | TPM  | RPM |
    | -------------------------------- | ---- | --- |
    | `gpt-oss-120b`                   | 1M   | 1K  |
    | `llama3.1-8b`                    | 2M   | 2K  |
    | `qwen-3-235b-a22b-instruct-2507` | 500K | 500 |
    | `zai-glm-4.7`                    | 500K | 500 |

    <Note>Hourly and daily restrictions don't apply to Pay as You Go tier users. You can use as many tokens as needed within your budget.</Note>
  </Tab>
</Tabs>

## Rate Limit Headers

To help you monitor your usage in real time, we inject several custom headers into every API response. These headers provide insight into your current usage and when your limits will reset.

You’ll find the following headers in the response:

| Header                                | Description                                                 |
| ------------------------------------- | ----------------------------------------------------------- |
| `x-ratelimit-limit-requests-day`      | Maximum number of requests allowed per day.                 |
| `x-ratelimit-limit-tokens-minute`     | Maximum number of tokens allowed per minute.                |
| `x-ratelimit-remaining-requests-day`  | Number of requests remaining for the current day.           |
| `x-ratelimit-remaining-tokens-minute` | Number of tokens remaining for the current minute.          |
| `x-ratelimit-reset-requests-day`      | Time (in seconds) until your daily request limit resets.    |
| `x-ratelimit-reset-tokens-minute`     | Time (in seconds) until your per-minute token limit resets. |

These values update with each API call, giving you immediate visibility into your current usage.

### Example

You can view these headers by adding the `--verbose` flag to a cURL request:

```bash  theme={null}
curl --location 'https://api.cerebras.ai/v1/chat/completions' \
--header 'Content-Type: application/json' \
--header "Authorization: Bearer ${CEREBRAS_API_KEY}" \
--data '{
  "model": "llama3.1-8b",
  "stream": false,
  "messages": [{"content": "Hello!", "role": "user"}],
  "temperature": 0,
  "max_completion_tokens": -1,
  "seed": 0,
  "top_p": 1
}' \
--verbose
```

In the response, look for headers like these:

```
x-ratelimit-limit-requests-day: 1000000000
x-ratelimit-limit-tokens-minute: 1000000000
x-ratelimit-remaining-requests-day: 999997455
x-ratelimit-remaining-tokens-minute: 999998298
x-ratelimit-reset-requests-day: 33011.382867097855
x-ratelimit-reset-tokens-minute: 11.382867097854614
```

## Notes

<Note>If you exceed your rate limits, you will receive a [429 Too Many Requests error](/support/error).</Note>

If you have questions about your usage or need higher rate limits, [contact us](https://www.cerebras.ai/contact) via our website, or reach out to your account representative.

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://inference-docs.cerebras.ai/llms.txt>
> Use this file to discover all available pages before exploring further.

# OpenAI Compatibility

> Use the OpenAI Client Libraries with Cerebras Inference

We designed the Cerebras API to be mostly compatible with OpenAI's client libraries, making it simple to configure your existing applications to run on Cerebras and take advantage of our inference capabilities.

We also offer dedicated Cerebras Python and Cerebras TypeScript SDKs.

## Configuring OpenAI to Use Cerebras API

To start using Cerebras with OpenAI's client libraries, simply pass your Cerebras API key to the `apiKey` parameter and change the `baseURL` to [https://api.cerebras.ai/v1](https://api.cerebras.ai/v1):

<CodeGroup>
  ```python Python theme={null}
  import os
  import openai

  client = openai.OpenAI(
      base_url="<https://api.cerebras.ai/v1>",
      api_key=os.environ.get("CEREBRAS_API_KEY")
  )

  ```

  ```javascript Node.js theme={null}
  import OpenAI from "openai";

  const client = new OpenAI({
    apiKey: process.env.CEREBRAS_API_KEY,
    baseURL: "https://api.cerebras.ai/v1"
  });
  ```

</CodeGroup>

## Developer-Level Instructions via System Role

<Note>This info is only applicable to the `gpt-oss-120b` model. </Note>

For `gpt-oss-120b`, our API maps the `system` role to a developer-level instruction layer in the prompt hierarchy. When you send messages with `role: "system"`, these are elevated above normal user instructions and injected into the model’s internal system prompt. This gives you significant control over the assistant’s tone, style, and behavior while preserving the model’s built-in safety guardrails.

### Key Differences from OpenAI

OpenAI’s API distinguishes between `system` and `developer` roles. Our implementation does not expose `developer` directly. Instead, your system messages act at the developer level, meaning they have stronger influence than in OpenAI’s API.

As a result, the same prompt may yield different behavior here compared to OpenAI. This is expected.

## Passing Non-Standard Parameters

* **OpenAI**: Non-standard parameters (e.g., `clear_thinking` for Z.ai GLM) need to be passed through `extra_body`. Standard OpenAI parameters like `reasoning_effort` work directly.
* **Cerebras SDK**: Non-standard parameters can be passed in **either** `extra_body` **or** as regular parameters like `model`.

<Accordion title="Example: Using the OpenAI Client">
  When using the OpenAI client with Cerebras API, non-standard parameters must be passed through `extra_body`:

  <CodeGroup>
    ```python Python theme={null}
    client = OpenAI(
        base_url="https://api.cerebras.ai/v1",
        api_key=os.environ.get("CEREBRAS_API_KEY")
    )

    response = client.chat.completions.create(
        model="zai-glm-4.7",
        messages=[...],
        reasoning_effort="none",  # Standard parameter, no extra_body needed
        extra_body={
            "clear_thinking": False  # Non-standard: must use extra_body
        }
    )
    ```

    ```javascript Node.js theme={null}
    const client = new OpenAI({
        baseURL: "https://api.cerebras.ai/v1",
        apiKey: process.env.CEREBRAS_API_KEY
    });

    const response = await client.chat.completions.create({
        model: "zai-glm-4.7",
        messages: [...],
        reasoning_effort: "none",  // Standard parameter, no extra_body needed
        extra_body: {
            clear_thinking: false  // Non-standard: must use extra_body
        }
    });
    ```
  </CodeGroup>
</Accordion>

<Accordion title="Example: Using the Cerebras SDK Client">
  When using the Cerebras SDK client, non-standard parameters can be passed as regular parameters:

  <CodeGroup>
    ```python Python theme={null}
    client = Cerebras(
        api_key=os.environ.get("CEREBRAS_API_KEY")
    )

    response = client.chat.completions.create(
        model="zai-glm-4.7",
        messages=[...],
        reasoning_effort="none",  # Standard parameter
        clear_thinking=False       # Non-standard parameter
    )
    ```

    ```javascript Node.js theme={null}
    const client = new Cerebras({
        apiKey: process.env.CEREBRAS_API_KEY
    });

    const response = await client.chat.completions.create({
        model: "zai-glm-4.7",
        messages: [...],
        reasoning_effort: "none",  // Standard parameter
        clear_thinking: false       // Non-standard parameter
    });
    ```
  </CodeGroup>
</Accordion>

## Currently Unsupported OpenAI Features

Note that although Cerebras API is mostly OpenAI compatible, there are a few features we don't support just yet:

**Text Completions**\
The following fields are currently not supported and will result in a 400 error if they are supplied:

* `frequency_penalty`
* `logit_bias`
* `presence_penalty`

<https://inference-docs.cerebras.ai/>

<https://inference-docs.cerebras.ai/>

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://inference-docs.cerebras.ai/llms.txt>
> Use this file to discover all available pages before exploring further.

# Streaming Responses

> Learn how to enable streaming responses in the Cerebras API.

<Tip>**To get started with a free API key, [click here](https://cloud.cerebras.ai?utm_source=3pi_streaming\&utm_campaign=capabilities).**</Tip>

The Cerebras API supports streaming responses, allowing messages to be sent back in chunks and displayed incrementally as they are generated. To enable this feature, set the `stream` parameter to `True` within the `chat.completions.create` method. This will result in the API returning an iterable containing the chunks of the message.

Similarly, the same can be done in TypeScript by setting the `stream` property to `true` within the `chat.completions.create` method.

<Steps>
  <Step title="Initial Setup">
    Begin by importing the Cerebras SDK and setting up the client.

    <CodeGroup>
      ```python Python theme={null}
      import os
      from cerebras.cloud.sdk import Cerebras

      client = Cerebras(
          # This is the default and can be omitted
          api_key=os.environ.get("CEREBRAS_API_KEY"),
      )
      ```

      ```javascript Node.js theme={null}
      import Cerebras from 'cerebras_cloud_sdk';

      const client = new Cerebras({
        apiKey: process.env['CEREBRAS_API_KEY'], // This is the default and can be omitted
      });
      ```
    </CodeGroup>
  </Step>

  <Step title="Streaming Responses">
    Set the `stream` parameter to `True` within the `chat.completions.create` method to enable streaming responses.

    <CodeGroup>
      ```python Python theme={null}
      stream = client.chat.completions.create(
          messages=[
              {
                  "role": "user",
                  "content": "Why is fast inference important?",
              }
          ],
          model="gpt-oss-120b",
          stream=True,
      )

      for chunk in stream:
          print(chunk.choices[0].delta.content or "", end="")
      ```

      ```javascript Node.js theme={null}
      import Cerebras from 'cerebras_cloud_sdk';

      const client = new Cerebras({
        apiKey: process.env['CEREBRAS_API_KEY'], // This is the default and can be omitted
      });

      async function main() {
        const stream = await client.chat.completions.create({
          messages: [{ role: 'user', content: 'Why is fast inference important?' }],
          model: 'gpt-oss-120b',
          stream: true,
        });
        for await (const chunk of stream) {
          process.stdout.write(chunk.choices[0]?.delta?.content || '');
        }
      }

      main();
      ```
    </CodeGroup>
  </Step>
</Steps>

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://inference-docs.cerebras.ai/llms.txt>
> Use this file to discover all available pages before exploring further.

# Tool Calling

> Learn how to connect models to external tools with tool calling.

Tool calling (also known as tool use or function calling) enables models to interact with external tools, applications, or APIs to perform various actions and access real-time information beyond their initial training data.

## How It Works

1. **Define the tool**: Provide a name, description, and input parameters for each tool you want the model to access.

2. **Send the request**: The prompt is sent along with available tool definitions in your API call.

3. **Model decides**: The model analyzes the prompt and its available tools to decide if a tool can help answer the question. If it decides to use a tool, it responds with a structured output indicating which tool to call and what arguments to use.

4. **Execute the tool**: The client application receives the model's tool call request, executes the specified tool (such as calling an external API), and retrieves the result.

5. **Generate final response**: The result from the tool is sent back to the model, which can then use this new information to generate a final, accurate response to the user.

## Basic Tool Calling

<Steps>
  <Step title="Initial Setup">
    To begin, we need to import the necessary libraries and set up our Cerebras client.

    <Tip>
      If you haven't set up your Cerebras API key yet, please visit our [QuickStart guide](/quickstart) for detailed instructions on how to obtain and configure your API key.
    </Tip>

    ```python  theme={null}
    import os
    import json
    import re
    from cerebras.cloud.sdk import Cerebras

    # Initialize Cerebras client
    client = Cerebras(
        api_key=os.environ.get("CEREBRAS_API_KEY"),
    )
    ```
  </Step>

  <Step title="Setting Up the Tool">
    Our first step is to define the tool that our AI will use. In this example, we're creating a simple calculator function that can perform basic arithmetic operations.

    ```python  theme={null}
    def calculate(expression):
        expression = re.sub(r'[^0-9+\-*/().]', '', expression)
        
        try:
            result = eval(expression)
            return str(result)
        except (SyntaxError, ZeroDivisionError, NameError, TypeError, OverflowError):
            return "Error: Invalid expression"
    ```
  </Step>

  <Step title="Defining the Tool Schema">
    Next, we define the tool schema. This schema acts as a blueprint for the AI, describing the tool's functionality, when to use it, and what parameters it expects. It helps the AI understand how to interact with our custom tool effectively.

    <Note>
      With `strict: true` enabled, tool call arguments are guaranteed to match your schema exactly through constrained decoding.
    </Note>

    ```python  theme={null}
    tools = [
        {
            "type": "function",
            "function": {
                "name": "calculate",
                "strict": True,
                "description": "A calculator tool that can perform basic arithmetic operations. Use this when you need to compute mathematical expressions or solve numerical problems.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "expression": {
                            "type": "string",
                            "description": "The mathematical expression to evaluate"
                        }
                    },
                    "required": ["expression"],
                    "additionalProperties": False
                }
            }
        }
    ]
    ```
  </Step>

  <Step title="Making the API Call">
    With our tool and its schema defined, we can now set up the conversation for our AI. We will prompt the LLM using natural language to conduct a simple calculation, and make the API call.

    This call sends our messages and tool schema to the LLM, allowing it to generate a response that may include tool use.

    ```python  theme={null}
    messages = [
        {"role": "system", "content": "You are a helpful assistant with access to a calculator. Use the calculator tool to compute mathematical expressions when needed."},
        {"role": "user", "content": "What's the result of 15 multiplied by 7?"},
    ]

    response = client.chat.completions.create(
        model="gpt-oss-120b",
        messages=messages,
        tools=tools,
        parallel_tool_calls=False,
    )
    ```
  </Step>

  <Step title="Handling Tool Calls">
    Now that we've made the API call, we need to process the response and handle any tool calls the LLM might have made. Note that the LLM determines based on the prompt if it should rely on a tool to respond to the user. Therefore, we need to check for any tool calls and handle them appropriately.

    In the code below, we first check if there are any tool calls in the model's response. If a tool call is present, we proceed to execute it and ensure that the function is fulfilled correctly. The function call is logged to indicate that the model is requesting a tool call, and the result of the tool call is logged to clarify that this is not the model's final output but rather the result of fulfilling its request. The result is then passed back to the model so it can continue generating a final response.

    ```python  theme={null}
    choice = response.choices[0].message

    if choice.tool_calls:
        function_call = choice.tool_calls[0].function
        if function_call.name == "calculate":
            # Logging that the model is executing a function named "calculate".
            print(f"Model executing function '{function_call.name}' with arguments {function_call.arguments}")

            # Parse the arguments from JSON format and perform the requested calculation.
            arguments = json.loads(function_call.arguments)
            result = calculate(arguments["expression"])

            # Note: This is the result of executing the model's request (the tool call), not the model's own output.
            print(f"Calculation result sent to model: {result}")
           
           # Send the result back to the model to fulfill the request.
            messages.append({
                "role": "tool",
                "content": json.dumps(result),
                "tool_call_id": choice.tool_calls[0].id
            })
     
           # Request the final response from the model, now that it has the calculation result.
            final_response = client.chat.completions.create(
                model="gpt-oss-120b",
                messages=messages,
            )
            
            # Handle and display the model's final response.
            if final_response:
                print("Final model output:", final_response.choices[0].message.content)
            else:
                print("No final response received")
    else:
        # Handle cases where the model's response does not include expected tool calls.
        print("Unexpected response from the model")
    ```
  </Step>
</Steps>

In this case, the LLM determined that a tool call was appropriate to answer the users' question of what the result of 15 multiplied by 7 is. See the output below.

```
Model executing function 'calculate' with arguments {"expression": "15 * 7"}
Calculation result sent to model: 105
Final model output: 15 * 7 = 105
```

## Strict Mode for Tool Calling

Strict mode ensures that the model generates tool call arguments that exactly match your defined schema. This is essential for building reliable agentic workflows where invalid parameters could break your application.

### Why Strict Mode Matters for Tools

Without strict mode, tool calls might include:

* Wrong parameter types (e.g., `"2"` instead of `2`)
* Missing required parameters
* Unexpected extra parameters
* Malformed argument JSON

With strict mode, you get guaranteed schema compliance for every tool call.

### Enabling Strict Mode

Set `strict` to `true` inside the `function` object of your tool definition:

```python Python theme={null}
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "strict": True,  # Enable constrained decoding
            "description": "Get the current weather for a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "City and country, e.g., 'San Francisco, USA'"
                    },
                    "unit": {
                        "type": "string",
                        "enum": ["celsius", "fahrenheit"]
                    }
                },
                "required": ["location", "unit"],
                "additionalProperties": False
            }
        }
    }
]
```

### Schema Requirements

When using strict mode, you must set `additionalProperties: false`. This is required for every object in your schema.

For information about schema limitations that apply when using strict mode, see [Limitations in Strict Mode](/capabilities/structured-outputs#limitations-in-strict-mode).

### Strict Mode with Parallel Tool Calling

Strict mode works with parallel tool calling. When multiple tools are called simultaneously, each tool call's arguments will conform to its respective schema:

```python Python theme={null}
response = client.chat.completions.create(
    model="zai-glm-4.7",
    messages=messages,
    tools=tools,  # Each tool can have strict: true
    parallel_tool_calls=True,
)
```

## Multi-turn Tool Calling

Most real-world workflows require more than one tool invocation. Multi-turn tool calling lets a model call a tool, incorporate its output, and then, within the same conversation, decide whether it needs to call the tool (or another tool) again to finish the task.

It works as follows:

1. After every tool call you append the tool response to `messages`, then ask the model to continue.
2. The model itself decides when enough information has been gathered to produce a final answer.
3. Continue calling `client.chat.completions.create()` until you get a message without `tool_calls`.

The example below demonstrates multi-turn tool calling as an extension of the calculator example above. Before continuing, make sure you’ve completed Steps 1–3 from the calculator setup section.

```python  theme={null}
messages = [
    {
        "role": "system",
        "content": (
            "You are a helpful assistant with a calculator tool. "
            "Use it whenever math is required."
        ),
    },
    {"role": "user", "content": "First, multiply 15 by 7. Then take that result, add 20, and divide the total by 2. What's the final number?"},
]

# Register every callable tool once
available_functions = {
    "calculate": calculate,
}

while True:
    resp = client.chat.completions.create(
        model="gpt-oss-120b",
        messages=messages,
        tools=tools,
    )
    msg = resp.choices[0].message

    # If the assistant didn’t ask for a tool, we’re done
    if not msg.tool_calls:
        print("Assistant:", msg.content)
        break

    # Save the assistant turn exactly as returned
    messages.append(msg.model_dump())    

    # Run the requested tool
    call  = msg.tool_calls[0]
    fname = call.function.name

    if fname not in available_functions:
        raise ValueError(f"Unknown tool requested: {fname!r}")

    args_dict = json.loads(call.function.arguments)  # assumes JSON object
    output = available_functions[fname](**args_dict)

    # Feed the tool result back
    messages.append({
        "role": "tool",
        "tool_call_id": call.id,
        "content": json.dumps(output),
    })
```

## Parallel Tool Calling

Parallel tool calling allows models to call multiple tools simultaneously for reduced latency and faster responses.

For example, if a user asks "Is Toronto warmer than Montreal?", the model needs to check the weather in both cities. Rather than making two separate requests, parallel tool calling enables the model to request both operations at once, reducing latency and improving efficiency.

Parallel tool calling is most beneficial when:

* A single query requires multiple independent data points (e.g., comparing weather in different cities)
* Multiple tools need to be invoked that don't have dependencies on each other
* You want to reduce the number of API calls and overall response time

### Enable Parallel Tool Calling

You can explicitly control this behavior using the `parallel_tool_calls` parameter:

```python highlight={5} theme={null}
response = client.chat.completions.create(
    model="zai-glm-4.7",
    messages=messages,
    tools=tools,
    parallel_tool_calls=True,  # Enable parallel calling (default)
)
```

To disable parallel tool calling and force sequential execution:

```python highlight={5} theme={null}
response = client.chat.completions.create(
    model="zai-glm-4.7",
    messages=messages,
    tools=tools,
    parallel_tool_calls=False,  # Disable parallel calling
)
```

### Example: Weather Comparison

Let's walk through a complete example that demonstrates parallel tool calling by comparing weather in two cities.

<Steps>
  <Step title="Define the Weather Tool">
    First, we'll create a simple weather function and define the tool in our schema:

    ```python  theme={null}
    import os
    import json
    from cerebras.cloud.sdk import Cerebras

    client = Cerebras(
        api_key=os.environ.get("CEREBRAS_API_KEY"),
    )

    def get_weather(location):
        """
        Dummy function that returns mock weather data.
        In production, this would call a real weather API.
        """
        weather_data = {
            "location": location,
            "temperature": 22,
            "condition": "sunny",
            "humidity": 45,
        }
        return json.dumps(weather_data)

    tools = [
        {
            "type": "function",
            "function": {
                "name": "get_weather",
                "strict": True,
                "description": "Get temperature for a given location.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "location": {
                            "type": "string",
                            "description": "City and country e.g. Toronto, Canada"
                        }
                    },
                    "required": ["location"],
                    "additionalProperties": False
                }
            }
        }
    ]
    ```
  </Step>

  <Step title="Make the API Call with Parallel Tool Calling Enabled">
    Now we'll send a query that requires checking weather in two different cities:

    ```python  theme={null}
    messages = [
        {
            "role": "system",
            "content": "You are a helpful Cerebras Assistant."
        },
        {
            "role": "user",
            "content": "Is Toronto warmer than Montreal?"
        }
    ]

    response = client.chat.completions.create(
        model="zai-glm-4.7",
        messages=messages,
        tools=tools,
        parallel_tool_calls=True,
    )
    ```
  </Step>

  <Step title="Handle Multiple Tool Calls">
    When parallel tool calling is enabled, the model's response may contain multiple tool calls in the `tool_calls` array. We need to iterate through all of them:

    ```python  theme={null}
    choice = response.choices[0].message

    if choice.tool_calls:
        # Add the assistant message with tool_calls first
        messages.append(choice)

        # Process all tool calls
        for tool_call in choice.tool_calls:
            function_call = tool_call.function
            print(f"Model executing function '{function_call.name}' with arguments {function_call.arguments}")
            
            # Parse arguments and execute the function
            arguments = json.loads(function_call.arguments)
            result = get_weather(arguments["location"])
            
            print(f"Weather data sent to model: {result}")
            
            # Append each tool result to messages
            messages.append({
                "role": "tool",
                "content": result,
                "tool_call_id": tool_call.id
            })
        
        # Get final response after all tool calls are processed
        final_response = client.chat.completions.create(
            model="zai-glm-4.7",
            messages=messages,
        )
        
        if final_response:
            print("Final model output:", final_response.choices[0].message.content)
        else:
            print("No final response received")
    else:
        print("No tool calls in response")
    ```
  </Step>
</Steps>
> ## Documentation Index
> Fetch the complete documentation index at: https://inference-docs.cerebras.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Prompt Caching

> Store and reuse previously processed prompts to reduce latency and increase response times for similar or repeated queries.

This feature is designed to significantly reduce Time to First Token (TTFT) and improve responsiveness for long-context workloads, such as multi-turn conversations, RAG (Retrieval Augmented Generation), and agentic workflows.

## How It Works

Unlike other providers that require manual cache breakpoints or header modifications, Cerebras Prompt Caching works automatically on all supported API requests. No code changes are required.

1. **Prefix Matching**: When you send a request, the system analyzes the beginning of your prompt (the prefix). This includes system prompts, tool definitions, and few-shot examples.

2. **Block-Based Caching**: The system processes prompts in 128-token blocks. If a block matches a segment stored in our ephemeral memory from a recent request within your organization, the computation is reused.

3. **Cache Hit**: Reusing cached blocks skips the processing phase for those tokens, resulting in lower latency.

4. **Cache Miss**: If no match is found, the prompt is processed as normal, and the prefix is stored in the cache for potential future matches.

5. **Automatic Expiration**: Cached data is ephemeral. We guarantee a Time-To-Live (TTL) of 5 minutes, though caches may persist up to 1 hour depending on system load.

<Note>
  To get a cache hit, the entire beginning of your prompt must match *exactly* with a previously cached prefix. Even a single character difference in the first token will result in a cache miss for that block and all subsequent blocks.
</Note>

## Example: Multi-Turn Conversation with Tool Calling

In this scenario, a shopping assistant helps users check order status and cancel orders using two tools: `get_order_status` and `cancel_order`. The system message and tool definitions remain constant across turns and are cached, while the conversation progresses naturally.

<CodeGroup>
  ```python Python expandable theme={null}
  import os
  import json
  from cerebras.cloud.sdk import Cerebras

  client = Cerebras(api_key=os.environ.get("CEREBRAS_API_KEY"))

# Mock order database

  ORDERS = {
      "ORD-123456": {"status": "processing", "eta_days": 5},
  }

  def get_order_status(order_id: str):
      """Look up an order's status"""
      order = ORDERS.get(order_id)
      if not order:
          return {"error": "Order not found"}
      return {"order_id": order_id, "status": order["status"], "eta_days": order.get("eta_days")}

  def cancel_order(order_id: str):
      """Cancel an order"""
      order = ORDERS.get(order_id)
      if not order:
          return {"error": "Order not found"}
      if order["status"] in ["shipped", "delivered"]:
          return {"error": f"Cannot cancel - order already {order['status']}"}

      order["status"] = "cancelled"
      order.pop("eta_days", None)
      return {"order_id": order_id, "status": "cancelled"}

  tools = [
      {
          "type": "function",
          "function": {
              "name": "get_order_status",
              "description": "Look up an order status by order ID",
              "parameters": {
                  "type": "object",
                  "properties": {
                      "order_id": {"type": "string", "description": "Order ID (e.g., ORD-123456)"}
                  },
                  "required": ["order_id"]
              },
              "strict": True
          }
      },
      {
          "type": "function",
          "function": {
              "name": "cancel_order",
              "description": "Cancel an order by order ID",
              "parameters": {
                  "type": "object",
                  "properties": {
                      "order_id": {"type": "string", "description": "Order ID (e.g., ORD-123456)"}
                  },
                  "required": ["order_id"]
              },
              "strict": True
          }
      }
  ]

  available_functions = {
      "get_order_status": get_order_status,
      "cancel_order": cancel_order
  }

  messages = [
      {"role": "system", "content": "You are a shopping assistant. Help users check order status and cancel orders."},
      {"role": "user", "content": "Where is my order ORD-123456?"}
  ]

# Turn 1 - creates cache

  response = client.chat.completions.create(model="gpt-oss-120b", messages=messages, tools=tools)
  print("Turn 1 usage:", response.usage)

  msg = response.choices[0].message
  messages.append(msg.model_dump())

  if msg.tool_calls:
      for call in msg.tool_calls:
          func = available_functions[call.function.name]
          result = func(**json.loads(call.function.arguments))
          messages.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result)})

      response = client.chat.completions.create(model="gpt-oss-120b", messages=messages, tools=tools)
      messages.append(response.choices[0].message.model_dump())
      print("Turn 1 response:", response.choices[0].message.content)

# Turn 2 - uses cache

  messages.append({"role": "user", "content": "Please cancel it, I ordered by mistake."})
  response = client.chat.completions.create(model="gpt-oss-120b", messages=messages, tools=tools)
  print("\nTurn 2 usage:", response.usage)

  msg = response.choices[0].message
  messages.append(msg.model_dump())

  if msg.tool_calls:
      for call in msg.tool_calls:
          func = available_functions[call.function.name]
          result = func(**json.loads(call.function.arguments))
          messages.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result)})

      response = client.chat.completions.create(model="gpt-oss-120b", messages=messages, tools=tools)
      print("Turn 2 response:", response.choices[0].message.content)

  ```

  ```javascript Node.js expandable theme={null}
  import Cerebras from '@cerebras/cerebras_cloud_sdk';

  const client = new Cerebras({ apiKey: process.env.CEREBRAS_API_KEY });

  // Mock order database
  const ORDERS = {
    'ORD-123456': { status: 'processing', eta_days: 5 }
  };

  const getOrderStatus = (order_id) => {
    const order = ORDERS[order_id];
    if (!order) return { error: 'Order not found' };
    return { order_id, status: order.status, eta_days: order.eta_days };
  };

  const cancelOrder = (order_id) => {
    const order = ORDERS[order_id];
    if (!order) return { error: 'Order not found' };
    if (['shipped', 'delivered'].includes(order.status)) {
      return { error: `Cannot cancel - order already ${order.status}` };
    }
    order.status = 'cancelled';
    delete order.eta_days;
    return { order_id, status: 'cancelled' };
  };

  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_order_status',
        description: 'Look up an order status by order ID',
        parameters: {
          type: 'object',
          properties: {
            order_id: { type: 'string', description: 'Order ID (e.g., ORD-123456)' }
          },
          required: ['order_id']
        },
        strict: true
      }
    },
    {
      type: 'function',
      function: {
        name: 'cancel_order',
        description: 'Cancel an order by order ID',
        parameters: {
          type: 'object',
          properties: {
            order_id: { type: 'string', description: 'Order ID (e.g., ORD-123456)' }
          },
          required: ['order_id']
        },
        strict: true
      }
    }
  ];

  // Helper function to handle tool calls in a more reusable way
  async function handleToolCalls(toolCalls, messages) {
    for (const call of toolCalls) {
      const args = JSON.parse(call.function.arguments);
      const orderId = args.order_id;
      
      let result;
      if (call.function.name === 'get_order_status') {
        result = getOrderStatus(orderId);
      } else if (call.function.name === 'cancel_order') {
        result = cancelOrder(orderId);
      }
      
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  async function run() {
    const messages = [
      { role: 'system', content: 'You are a shopping assistant. Help users check order status and cancel orders.' },
      { role: 'user', content: 'Where is my order ORD-123456?' }
    ];

    // Turn 1 - creates cache
    let response = await client.chat.completions.create({ model: 'gpt-oss-120b', messages, tools });
    console.log('Turn 1 usage:', response.usage);

    let msg = response.choices[0].message;
    messages.push(msg);

    if (msg.tool_calls) {
      await handleToolCalls(msg.tool_calls, messages);
      
      response = await client.chat.completions.create({ model: 'gpt-oss-120b', messages, tools });
      messages.push(response.choices[0].message);
      console.log('Turn 1 response:', response.choices[0].message.content);
    }

    // Turn 2 - uses cache
    messages.push({ role: 'user', content: 'Please cancel it, I ordered by mistake.' });
    response = await client.chat.completions.create({ model: 'gpt-oss-120b', messages, tools });
    console.log('Turn 2 usage:', response.usage);

    msg = response.choices[0].message;
    messages.push(msg);

    if (msg.tool_calls) {
      await handleToolCalls(msg.tool_calls, messages);
      
      response = await client.chat.completions.create({ model: 'gpt-oss-120b', messages, tools });
      console.log('Turn 2 response:', response.choices[0].message.content);
    }
  }

  run().catch(console.error);
  ```

  ```bash cURL expandable theme={null}
  #!/bin/bash

  API_KEY="${CEREBRAS_API_KEY}"
  BASE_URL="https://api.cerebras.ai/v1"

  if [ -z "$API_KEY" ]; then
      echo "Error: CEREBRAS_API_KEY environment variable is not set"
      exit 1
  fi

  TOOLS='[
    {
      "type": "function",
      "function": {
        "name": "get_order_status",
        "description": "Look up an order status by order ID",
        "parameters": {
          "type": "object",
          "properties": {
            "order_id": {"type": "string", "description": "Order ID (e.g., ORD-123456)"}
          },
          "required": ["order_id"]
        },
        "strict": true
      }
    },
    {
      "type": "function",
      "function": {
        "name": "cancel_order",
        "description": "Cancel an order by order ID",
        "parameters": {
          "type": "object",
          "properties": {
            "order_id": {"type": "string", "description": "Order ID (e.g., ORD-123456)"}
          },
          "required": ["order_id"]
        },
        "strict": true
      }
    }
  ]'

  SYSTEM="You are a shopping assistant. Help users check order status and cancel orders."

  echo "=== Turn 1 (Creates Cache) ==="

  curl -s -X POST "$BASE_URL/chat/completions" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg sys "$SYSTEM" --argjson tools "$TOOLS" '{
      model: "gpt-oss-120b",
      messages: [{role: "system", content: $sys}, {role: "user", content: "Where is my order ORD-123456?"}],
      tools: $tools
    }')" | jq '{content: .choices[0].message.content, usage: .usage}'

  echo ""
  echo "=== Turn 2 (Uses Cache) ==="

  curl -s -X POST "$BASE_URL/chat/completions" \
    -H "Authorization: Bearer $API_KEY" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg sys "$SYSTEM" --argjson tools "$TOOLS" '{
      model: "gpt-oss-120b",
      messages: [
        {role: "system", content: $sys},
        {role: "user", content: "Where is my order ORD-123456?"},
        {role: "assistant", content: "Your order ORD-123456 is currently processing with an estimated delivery in 5 days."},
        {role: "user", content: "Please cancel it, I ordered by mistake."}
      ],
      tools: $tools
    }')" | jq '{content: .choices[0].message.content, usage: .usage}'
  ```

</CodeGroup>

During each turn, the system automatically caches the longest matching prefix from previous requests. In this example:

* **System message**: The shopping assistant instructions remain identical across all turns
* **Tool definitions**: Both order management tool schemas (including parameters and descriptions) stay constant
* **Conversation history**: Previous user messages, assistant responses, and tool results are all cached as the conversation grows

Only the new content at the end of each request requires fresh processing:

* New user messages (the latest question)
* New tool execution results
* The model's reasoning and decision-making for the current turn

As the conversation grows, the cache hit rate increases dramatically. The static prefix (system + tools) remains cached, and the expanding conversation history also gets cached, meaning only the newest user message and the model's fresh response require full processing.

## Structuring Prompts for Caching

To maximize cache hits and minimize latency, organize your prompts with static content first and dynamic content last.

The system caches prompts from the **beginning** of the message. If you place dynamic content (like a timestamp or a unique User ID) at the start of the prompt, the prefix will differ for every request and the cache will never be triggered.

<Steps>
  <Step title="Static Content First">
    Place content that remains the same across multiple requests at the beginning:

    * System instructions ("You are a helpful assistant...")
    * Tool definitions and schemas
    * Few-shot examples
    * Large context documents (e.g., a legal agreement or code base)
  </Step>

  <Step title="Dynamic Content Last">
    Place content that changes with each request at the end:

    * User-specific questions
    * Session variables
    * Timestamps
  </Step>
</Steps>

<Tabs>
  <Tab title="Optimized (Cache Hit)">
    The "You are a coding assistant..." instruction block remains static and can be cached in subsequent requests. Only the short timestamp and user query are processed fresh.

    ```json  theme={null}
    [
      {
        "role": "system",
        "content": "You are a coding assistant... Current Time: 12:01 PM"
      },
      {
        "role": "user",
        "content": "Debug this code."
      }
    ]
    ```

    <Check>
      **Result:** The static portion of the system prompt is cached. Subsequent requests reuse the cache and only process the timestamp and user query.
    </Check>
  </Tab>

  <Tab title="Inefficient (Cache Miss)">
    In this example, the time is included at the start of the system instructions. Because the time changes every minute, the prefix never matches. Subsequent requests will always be fully processed.

    ```json  theme={null}
    [
      {
        "role": "system",
        "content": "Current Time: 12:01 PM. You are a coding assistant..."
      },
      {
        "role": "user",
        "content": "Debug this code."
      }
    ]
    ```

    <Warning>
      **Result:** Cache miss on every request because the timestamp changes the prefix.
    </Warning>
  </Tab>
</Tabs>

## Track Cache Usage

Verify if your requests are hitting the cache by viewing the `cached_tokens` field within the [`usage.prompt_token_details`](/api-reference/chat-completions#param-prompt-tokens-details) response object. This indicates the number of prompt tokens that were found in the cache.

```json  theme={null}
"usage": {
  "prompt_tokens": 3000,
  "completion_tokens": 150,
  "total_tokens": 3150,
  "prompt_tokens_details": {
    "cached_tokens": 2800
  }
}
```

In this example, 2,800 of the 3,000 prompt tokens were served from the cache, resulting in significantly faster processing.

Additionally, log in to [cloud.cerebras.ai](https://cloud.cerebras.ai) and click **Analytics** to track your cache usage.

## FAQs

<AccordionGroup>
  <Accordion title="Do cached tokens count toward rate limits?">
    Yes. All cached tokens contribute to your standard Tokens Per Minute (TPM) rate limits.

    **Calculation:** `cached_tokens + input_tokens` (fresh) = Total TPM usage for that request.
  </Accordion>

  <Accordion title="How are cached tokens priced?">
    There is no additional fee for using prompt caching. Input tokens, whether served from the cache or processed fresh, are billed at the standard input token rate for the respective model.
  </Accordion>

  <Accordion title="I'm sending the same request but not seeing it being cached. Why is that?">
    There are three common reasons for a cache miss on identical requests:

    1. **Block Size:** We cache in 128-token blocks. If a request or prefix is shorter than 128 tokens, it may not be cached.

    2. **Data Center Routing:** While we make a best effort to route you to the same data center, traffic profiles may occasionally route you to a different location where your cache does not exist.

    3. **TTL Expiration:** If requests are sent more than 5 minutes apart, the cache may have been evicted.
  </Accordion>

  <Accordion title="Is prompt caching enabled for all customers?">
    Yes, prompt caching is automatically enabled for all users for the supported models.
  </Accordion>

  <Accordion title="Which models support prompt caching?">
    Prompt caching is enabled by default for the following models:

    * [`zai-glm-4.7`](/models/zai-glm-47)
    * [`gpt-oss-120b`](/models/openai-oss)
    * [`qwen-3-235b-a22b-instruct-2507`](/models/qwen-3-235b-2507)
  </Accordion>

  <Accordion title="Is prompt caching secure?">
    Yes, it is fully ZDR-compliant. All cached context remains ephemeral in memory and never persisted. Cached tokens are stored in key-value stores colocated in the same data center as the model instance serving your traffic.
  </Accordion>

  <Accordion title="How is data privacy maintained for caches?">
    Prompt caches are never shared between organizations. Only members of your organization can benefit from caches created by identical prompts within your team.
  </Accordion>

  <Accordion title="Does prompt caching affect output quality or speed?">
    Caching only affects the input processing phase (how we read your prompt). The output generation phase remains exactly the same speed and quality. You will receive the same quality response, just with faster prompt processing.
  </Accordion>

  <Accordion title="Can I manually clear the cache?">
    No manual cache management is required or available. The system automatically manages cache eviction based on the TTL (5 minutes to 1 hour).
  </Accordion>

  <Accordion title="What are the TTL guarantees?">
    Guaranteed TTL is 5 minutes, but up to 1 hour max depending on system load.
  </Accordion>

  <Accordion title="How can I tell when caching is working?">
    Check the `usage.prompt_tokens_details.cached_tokens` field in your API response. When it's greater than 0, caching was used for that request.

    Additionally, log in to [cloud.cerebras.ai](https://cloud.cerebras.ai) and click **Analytics** to track your cache usage.
  </Accordion>
</AccordionGroup>

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://inference-docs.cerebras.ai/llms.txt>
> Use this file to discover all available pages before exploring further.

# OpenAI Compatibility

> Use the OpenAI Client Libraries with Cerebras Inference

We designed the Cerebras API to be mostly compatible with OpenAI's client libraries, making it simple to configure your existing applications to run on Cerebras and take advantage of our inference capabilities.

We also offer dedicated Cerebras Python and Cerebras TypeScript SDKs.

## Configuring OpenAI to Use Cerebras API

To start using Cerebras with OpenAI's client libraries, simply pass your Cerebras API key to the `apiKey` parameter and change the `baseURL` to [https://api.cerebras.ai/v1](https://api.cerebras.ai/v1):

<CodeGroup>
  ```python Python theme={null}
  import os
  import openai

  client = openai.OpenAI(
      base_url="<https://api.cerebras.ai/v1>",
      api_key=os.environ.get("CEREBRAS_API_KEY")
  )

  ```

  ```javascript Node.js theme={null}
  import OpenAI from "openai";

  const client = new OpenAI({
    apiKey: process.env.CEREBRAS_API_KEY,
    baseURL: "https://api.cerebras.ai/v1"
  });
  ```

</CodeGroup>

## Developer-Level Instructions via System Role

<Note>This info is only applicable to the `gpt-oss-120b` model. </Note>

For `gpt-oss-120b`, our API maps the `system` role to a developer-level instruction layer in the prompt hierarchy. When you send messages with `role: "system"`, these are elevated above normal user instructions and injected into the model’s internal system prompt. This gives you significant control over the assistant’s tone, style, and behavior while preserving the model’s built-in safety guardrails.

### Key Differences from OpenAI

OpenAI’s API distinguishes between `system` and `developer` roles. Our implementation does not expose `developer` directly. Instead, your system messages act at the developer level, meaning they have stronger influence than in OpenAI’s API.

As a result, the same prompt may yield different behavior here compared to OpenAI. This is expected.

## Passing Non-Standard Parameters

* **OpenAI**: Non-standard parameters (e.g., `clear_thinking` for Z.ai GLM) need to be passed through `extra_body`. Standard OpenAI parameters like `reasoning_effort` work directly.
* **Cerebras SDK**: Non-standard parameters can be passed in **either** `extra_body` **or** as regular parameters like `model`.

<Accordion title="Example: Using the OpenAI Client">
  When using the OpenAI client with Cerebras API, non-standard parameters must be passed through `extra_body`:

  <CodeGroup>
    ```python Python theme={null}
    client = OpenAI(
        base_url="https://api.cerebras.ai/v1",
        api_key=os.environ.get("CEREBRAS_API_KEY")
    )

    response = client.chat.completions.create(
        model="zai-glm-4.7",
        messages=[...],
        reasoning_effort="none",  # Standard parameter, no extra_body needed
        extra_body={
            "clear_thinking": False  # Non-standard: must use extra_body
        }
    )
    ```

    ```javascript Node.js theme={null}
    const client = new OpenAI({
        baseURL: "https://api.cerebras.ai/v1",
        apiKey: process.env.CEREBRAS_API_KEY
    });

    const response = await client.chat.completions.create({
        model: "zai-glm-4.7",
        messages: [...],
        reasoning_effort: "none",  // Standard parameter, no extra_body needed
        extra_body: {
            clear_thinking: false  // Non-standard: must use extra_body
        }
    });
    ```
  </CodeGroup>
</Accordion>

<Accordion title="Example: Using the Cerebras SDK Client">
  When using the Cerebras SDK client, non-standard parameters can be passed as regular parameters:

  <CodeGroup>
    ```python Python theme={null}
    client = Cerebras(
        api_key=os.environ.get("CEREBRAS_API_KEY")
    )

    response = client.chat.completions.create(
        model="zai-glm-4.7",
        messages=[...],
        reasoning_effort="none",  # Standard parameter
        clear_thinking=False       # Non-standard parameter
    )
    ```

    ```javascript Node.js theme={null}
    const client = new Cerebras({
        apiKey: process.env.CEREBRAS_API_KEY
    });

    const response = await client.chat.completions.create({
        model: "zai-glm-4.7",
        messages: [...],
        reasoning_effort: "none",  // Standard parameter
        clear_thinking: false       // Non-standard parameter
    });
    ```
  </CodeGroup>
</Accordion>

## Currently Unsupported OpenAI Features

Note that although Cerebras API is mostly OpenAI compatible, there are a few features we don't support just yet:

**Text Completions**\
The following fields are currently not supported and will result in a 400 error if they are supplied:

* `frequency_penalty`
* `logit_bias`
* `presence_penalty`
