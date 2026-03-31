# EDIT IMAGE

Edit Image
Edit or extend images based on a prompt

POST /v1/images/edits
Creates an edited or extended image given an original image and a prompt. The image must be provided as a file upload.
​
Request Body
This endpoint accepts multipart/form-data.
​
image
filerequired
The image to edit. Must be a valid PNG file, less than 4MB, and square.
​
prompt
stringrequired
A text description of the desired edit.
​
model
stringrequired
The model to use for image editing.
​
mask
file
An additional image whose fully transparent areas indicate where the image should be edited. Must be a valid PNG file with the same dimensions as the original image.
​
n
integerdefault:"1"
The number of images to generate. Must be between 1 and 10.
​
size
stringdefault:"1024x1024"
The size of the generated images.
​
response_format
stringdefault:"url"
The format of the generated images. Either url or b64_json.
​
Response
​
created
integer
Unix timestamp of when the images were created.
​
data
array
Array of edited images.
Show Image object

​
Examples
​
Edit with Mask

Python

TypeScript

cURL
from openai import OpenAI

client = OpenAI(
    api_key="sk-voidai-your_key_here",
    base_url="<https://api.voidai.app/v1>"
)

response = client.images.edit(
    model="dall-e-2",
    image=open("original.png", "rb"),
    mask=open("mask.png", "rb"),
    prompt="A sunlit indoor lounge area with a pool containing a flamingo",
    n=1,
    size="1024x1024"
)

print(response.data[0].url)
​
Edit Without Mask

Python

cURL
response = client.images.edit(
    model="dall-e-2",
    image=open("image.png", "rb"),
    prompt="Add a rainbow in the sky",
    n=1,
    size="1024x1024"
)
​
Response Example
{
  "created": 1701691200,
  "data": [
    {
      "url": "https://storage.voidai.app/images/edit-abc123.png"
    }
  ]
}

# SPEECH

Create Speech
Convert text to speech audio

POST /v1/audio/speech
Generates audio from text input using text-to-speech models.
​
Request Body
​
model
stringrequired
The TTS model to use. Options include tts-1 and tts-1-hd.
​
input
stringrequired
The text to generate audio for. Maximum length is 4096 characters.
​
voice
stringrequired
The voice to use. Supported voices: alloy, echo, fable, onyx, nova, shimmer.
​
response_format
stringdefault:"mp3"
The audio format. Supported formats: mp3, opus, aac, flac, wav, pcm.
​
speed
numberdefault:"1.0"
The speed of the generated audio. Range: 0.25 to 4.0.
​
Response
Returns the audio file content in the requested format. The response has the appropriate Content-Type header based on the format.
​
Examples
​
Basic Text-to-Speech

Python

TypeScript

cURL
from openai import OpenAI

client = OpenAI(
    api_key="sk-voidai-your_key_here",
    base_url="<https://api.voidai.app/v1>"
)

response = client.audio.speech.create(
    model="tts-1",
    voice="alloy",
    input="Hello! This is a test of the text-to-speech API."
)

response.stream_to_file("output.mp3")
​
High-Definition Audio

Python

TypeScript
response = client.audio.speech.create(
    model="tts-1-hd",
    voice="nova",
    input="Welcome to VoidAI! Experience the power of unified AI APIs.",
    response_format="flac"
)

response.stream_to_file("output.flac")
​
Adjusting Speed

Python

# Slower speech (0.5x speed)

response = client.audio.speech.create(
    model="tts-1",
    voice="onyx",
    input="This is spoken more slowly for clarity.",
    speed=0.5
)

# Faster speech (1.5x speed)

response = client.audio.speech.create(
    model="tts-1",
    voice="onyx",
    input="This is spoken more quickly.",
    speed=1.5
)
​
Voice Descriptions
Voice Description
alloy Neutral, balanced voice
echo Warm, conversational voice
fable Expressive, narrative voice
onyx Deep, authoritative voice
nova Friendly, energetic voice
shimmer Clear, refined voice
​
Audio Format Comparison
Format Quality File Size Use Case
mp3 Good Small General use, web streaming
opus Excellent Small Real-time streaming
aac Good Small Mobile apps
flac Lossless Large Archival, high quality
wav Lossless Large Professional editing
pcm Raw Large Audio processing

# TRANSCRIPTIONS

Create Transcription
Transcribe audio into text

POST /v1/audio/transcriptions
Transcribes audio into text in the language of the audio.
​
Request Body
This endpoint accepts multipart/form-data.
​
file
filerequired
The audio file to transcribe. Supported formats: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm. Maximum file size is 25MB.
​
model
stringrequired
The model to use for transcription (e.g., whisper-1).
​
language
string
The language of the audio in ISO-639-1 format (e.g., en, es, fr). Providing the language improves accuracy.
​
prompt
string
Optional text to guide the model’s style or continue a previous transcript. Should match the audio language.
​
response_format
stringdefault:"json"
The output format. Options: json, text, srt, verbose_json, vtt.
​
temperature
numberdefault:"0"
Sampling temperature between 0 and 1. Higher values make output more random.
​
Response
Varies based on response_format:
​
JSON Response (default)
​
text
string
The transcribed text.
​
Verbose JSON Response
​
task
string
The task performed (transcribe).
​
language
string
The detected language.
​
duration
number
Duration of the audio in seconds.
​
text
string
The transcribed text.
​
segments
array
Array of transcript segments with timestamps.
​
Examples
​
Basic Transcription

Python

TypeScript

cURL
from openai import OpenAI

client = OpenAI(
    api_key="sk-voidai-your_key_here",
    base_url="<https://api.voidai.app/v1>"
)

with open("audio.mp3", "rb") as audio_file:
    transcript = client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file
    )

print(transcript.text)
​
With Language Hint

Python

cURL
with open("spanish_audio.mp3", "rb") as audio_file:
    transcript = client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file,
        language="es"
    )
​
SRT Subtitles

Python

cURL
with open("video_audio.mp3", "rb") as audio_file:
    transcript = client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file,
        response_format="srt"
    )

# Save as subtitle file

with open("subtitles.srt", "w") as f:
    f.write(transcript)
​
Verbose JSON with Timestamps

Python
with open("audio.mp3", "rb") as audio_file:
    transcript = client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file,
        response_format="verbose_json"
    )

print(f"Language: {transcript.language}")
print(f"Duration: {transcript.duration}s")
for segment in transcript.segments:
    print(f"[{segment['start']:.2f}s - {segment['end']:.2f}s] {segment['text']}")
​
Response Examples
​
JSON Response
{
  "text": "Hello, this is a test transcription of an audio file."
}
​
Verbose JSON Response
{
  "task": "transcribe",
  "language": "english",
  "duration": 5.42,
  "text": "Hello, this is a test transcription of an audio file.",
  "segments": [
    {
      "id": 0,
      "start": 0.0,
      "end": 2.5,
      "text": "Hello, this is a test",
      "tokens": [50364, 2425, 11, 341, 307, 257, 1500],
      "temperature": 0.0,
      "avg_logprob": -0.25,
      "compression_ratio": 1.2,
      "no_speech_prob": 0.01
    },
    {
      "id": 1,
      "start": 2.5,
      "end": 5.42,
      "text": " transcription of an audio file.",
      "tokens": [50489, 1112, 11, 295, 364, 6279, 2058],
      "temperature": 0.0,
      "avg_logprob": -0.22,
      "compression_ratio": 1.1,
      "no_speech_prob": 0.02
    }
  ]
}
​
SRT Response
1
00:00:00,000 --> 00:00:02,500
Hello, this is a test

2
00:00:02,500 --> 00:00:05,420
transcription of an audio file.
​
Tips
Specify the language

Use prompts for context

Choose the right format

# TRANSLATION

Create Translation
Translate audio into English text

POST /v1/audio/translations
Translates audio into English text. This endpoint takes audio in any supported language and outputs the transcription in English.
​
Request Body
This endpoint accepts multipart/form-data.
​
file
filerequired
The audio file to translate. Supported formats: flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav, webm. Maximum file size is 25MB.
​
model
stringrequired
The model to use for translation (e.g., whisper-1).
​
prompt
string
Optional text to guide the model’s style. Should be in English.
​
response_format
stringdefault:"json"
The output format. Options: json, text, srt, verbose_json, vtt.
​
temperature
numberdefault:"0"
Sampling temperature between 0 and 1.
​
Response
​
text
string
The translated English text.
​
Examples
​
Basic Translation

Python

TypeScript

cURL
from openai import OpenAI

client = OpenAI(
    api_key="sk-voidai-your_key_here",
    base_url="<https://api.voidai.app/v1>"
)

# Translate French audio to English

with open("french_audio.mp3", "rb") as audio_file:
    translation = client.audio.translations.create(
        model="whisper-1",
        file=audio_file
    )

print(translation.text)
​
With Prompt Guidance

Python

cURL
with open("japanese_meeting.mp3", "rb") as audio_file:
    translation = client.audio.translations.create(
        model="whisper-1",
        file=audio_file,
        prompt="This is a business meeting discussion about quarterly sales."
    )
​
SRT Subtitles in English

Python

cURL
with open("german_video.mp3", "rb") as audio_file:
    translation = client.audio.translations.create(
        model="whisper-1",
        file=audio_file,
        response_format="srt"
    )

# Save English subtitles

with open("english_subtitles.srt", "w") as f:
    f.write(translation)
​
Response Example
{
  "text": "Hello, welcome to our presentation. Today we will discuss the new features of our product."
}
​
Supported Languages
The translation endpoint accepts audio in any of the following languages and translates to English:
Language Code Language Code
Afrikaans af Korean ko
Arabic ar Latvian lv
Chinese zh Lithuanian lt
Czech cs Malay ms
Danish da Norwegian no
Dutch nl Polish pl
Finnish fi Portuguese pt
French fr Romanian ro
German de Russian ru
Greek el Spanish es
Hebrew he Swedish sv
Hindi hi Thai th
Hungarian hu Turkish tr
Indonesian id Ukrainian uk
Italian it Vietnamese vi
Japanese ja  
Unlike transcription, translation always outputs English text regardless of the input language.

# VIDEO

Create Video
Generate videos from text prompts

POST /v1/videos
Creates a video generation task from a text prompt. Video generation is asynchronous - this endpoint returns a video ID that can be used to check the status and download the result.
Video generation can take several minutes depending on the model and parameters. Use the Get Video endpoint to check the status.
​
Request Body
This endpoint accepts multipart/form-data.
​
model
stringrequired
The video generation model to use (e.g., sora-2).
​
prompt
stringrequired
A text description of the video to generate.
​
size
string
The dimensions of the output video (e.g., 1920x1080, 1080x1920, 1280x720).
​
seconds
string
The duration of the video in seconds.
​
input_reference
file
An optional reference image or video to guide generation.
​
Response
​
id
string
Unique identifier for the video generation task.
​
status
string
The current status of the video generation. Possible values: pending, processing, completed, failed.
​
created_at
integer
Unix timestamp of when the task was created.
​
Examples
​
Basic Video Generation

Python

TypeScript

cURL
import requests

url = "<https://api.voidai.app/v1/videos>"
headers = {
    "Authorization": "Bearer sk-voidai-your_key_here"
}
data = {
    "model": "sora-2",
    "prompt": "A serene beach at sunset with gentle waves",
    "size": "1920x1080",
    "seconds": "10"
}

response = requests.post(url, headers=headers, data=data)
video = response.json()

print(f"Video ID: {video['id']}")
print(f"Status: {video['status']}")
​
With Reference Image

Python

cURL
import requests

url = "<https://api.voidai.app/v1/videos>"
headers = {
    "Authorization": "Bearer sk-voidai-your_key_here"
}
data = {
    "model": "sora-2",
    "prompt": "Animate this scene with flowing water and moving clouds",
    "size": "1920x1080",
    "seconds": "5"
}
files = {
    "input_reference": open("reference.jpg", "rb")
}

response = requests.post(url, headers=headers, data=data, files=files)
video = response.json()
​
Response Example
{
  "id": "vid_abc123def456",
  "status": "pending",
  "created_at": 1701691200
}
​
Workflow
Create Video - Submit your prompt and receive a video ID
Poll Status - Use Get Video to check when processing completes
Download - Use Download Video to retrieve the final video
import time
import requests

# 1. Create video

response = requests.post(
    "<https://api.voidai.app/v1/videos>",
    headers={"Authorization": "Bearer sk-voidai-your_key_here"},
    data={"model": "sora-2", "prompt": "A cat playing piano"}
)
video_id = response.json()["id"]

# 2. Poll for completion

while True:
    status_response = requests.get(
        f"<https://api.voidai.app/v1/videos/{video_id}>",
        headers={"Authorization": "Bearer sk-voidai-your_key_here"}
    )
    status = status_response.json()["status"]

    if status == "completed":
        break
    elif status == "failed":
        raise Exception("Video generation failed")

    time.sleep(10)  # Check every 10 seconds

# 3. Download video

video_response = requests.get(
    f"<https://api.voidai.app/v1/videos/{video_id}/content>",
    headers={"Authorization": "Bearer sk-voidai-your_key_here"}
)

with open("output.mp4", "wb") as f:
    f.write(video_response.content)

# GET VIDEO

Get Video
Get the status and details of a video generation task

GET /v1/videos/{id}
Retrieves the current status and details of a specific video generation task.
​
Path Parameters
​
id
stringrequired
The unique identifier of the video.
​
Response
​
id
string
Unique identifier for the video.
​
status
string
Current status of the video generation:
pending - Queued for processing
processing - Currently being generated
completed - Ready for download
failed - Generation failed
​
prompt
string
The original prompt used for generation.
​
model
string
The model used for generation.
​
size
string
The dimensions of the video.
​
duration
number
The duration of the video in seconds (available when completed).
​
created_at
integer
Unix timestamp of when the task was created.
​
completed_at
integer
Unix timestamp of when the task completed (if applicable).
​
error
string
Error message if the generation failed.
​
Examples
​
Check Video Status

Python

TypeScript

cURL
import requests

video_id = "vid_abc123"

response = requests.get(
    f"<https://api.voidai.app/v1/videos/{video_id}>",
    headers={"Authorization": "Bearer sk-voidai-your_key_here"}
)

video = response.json()
print(f"Status: {video['status']}")

if video['status'] == 'completed':
    print(f"Duration: {video['duration']}s")
    print("Ready for download!")
elif video['status'] == 'failed':
    print(f"Error: {video['error']}")
​
Poll Until Complete

Python

TypeScript
import time
import requests

def wait_for_video(video_id, timeout=600, interval=10):
    """Wait for video to complete, with timeout."""
    start_time = time.time()

    while time.time() - start_time < timeout:
        response = requests.get(
            f"https://api.voidai.app/v1/videos/{video_id}",
            headers={"Authorization": "Bearer sk-voidai-your_key_here"}
        )
        video = response.json()

        if video['status'] == 'completed':
            return video
        elif video['status'] == 'failed':
            raise Exception(f"Video generation failed: {video.get('error')}")

        print(f"Status: {video['status']}... waiting {interval}s")
        time.sleep(interval)

    raise TimeoutError("Video generation timed out")

video = wait_for_video("vid_abc123")
print(f"Video ready! Duration: {video['duration']}s")
​
Response Examples
​
Pending Video
{
  "id": "vid_abc123",
  "status": "pending",
  "prompt": "A serene beach at sunset with gentle waves",
  "model": "sora-2",
  "size": "1920x1080",
  "created_at": 1701691200
}
​
Completed Video
{
  "id": "vid_abc123",
  "status": "completed",
  "prompt": "A serene beach at sunset with gentle waves",
  "model": "sora-2",
  "size": "1920x1080",
  "duration": 10.0,
  "created_at": 1701691200,
  "completed_at": 1701691500
}
​
Failed Video
{
  "id": "vid_abc123",
  "status": "failed",
  "prompt": "A serene beach at sunset with gentle waves",
  "model": "sora-2",
  "size": "1920x1080",
  "created_at": 1701691200,
  "error": "Content policy violation detected"
}

# DOWNLOAD VIDEO

Download Video
Download a completed video or its assets

GET /v1/videos/{id}/content
Downloads the content of a completed video. Can retrieve the video file, thumbnail, or spritesheet.
​
Path Parameters
​
id
stringrequired
The unique identifier of the video.
​
Query Parameters
​
variant
stringdefault:"video"
The type of content to download:
video - The generated video file (MP4)
thumbnail - A thumbnail image (WebP)
spritesheet - A spritesheet preview (JPEG)
​
Response
Returns the binary content of the requested file with the appropriate Content-Type header:
Variant Content-Type
video video/mp4
thumbnail image/webp
spritesheet image/jpeg
​
Examples
​
Download Video

Python

TypeScript

cURL
import requests

video_id = "vid_abc123"

response = requests.get(
    f"<https://api.voidai.app/v1/videos/{video_id}/content>",
    headers={"Authorization": "Bearer sk-voidai-your_key_here"}
)

with open("output.mp4", "wb") as f:
    f.write(response.content)

print("Video saved as output.mp4")
​
Download Thumbnail

Python

cURL
response = requests.get(
    f"<https://api.voidai.app/v1/videos/{video_id}/content>",
    headers={"Authorization": "Bearer sk-voidai-your_key_here"},
    params={"variant": "thumbnail"}
)

with open("thumbnail.webp", "wb") as f:
    f.write(response.content)
​
Download Spritesheet

Python

cURL
response = requests.get(
    f"<https://api.voidai.app/v1/videos/{video_id}/content>",
    headers={"Authorization": "Bearer sk-voidai-your_key_here"},
    params={"variant": "spritesheet"}
)

with open("spritesheet.jpg", "wb") as f:
    f.write(response.content)
​
Complete Download Workflow
import time
import requests

headers = {"Authorization": "Bearer sk-voidai-your_key_here"}
base_url = "<https://api.voidai.app/v1/videos>"

# 1. Create video

create_response = requests.post(
    base_url,
    headers=headers,
    data={
        "model": "sora-2",
        "prompt": "A timelapse of clouds moving over a mountain",
        "size": "1920x1080",
        "seconds": "10"
    }
)
video_id = create_response.json()["id"]
print(f"Created video: {video_id}")

# 2. Wait for completion

while True:
    status_response = requests.get(f"{base_url}/{video_id}", headers=headers)
    status = status_response.json()["status"]

    if status == "completed":
        print("Video completed!")
        break
    elif status == "failed":
        print(f"Failed: {status_response.json().get('error')}")
        exit(1)

    print(f"Status: {status}")
    time.sleep(15)

# 3. Download all variants

variants = ["video", "thumbnail", "spritesheet"]
extensions = {"video": "mp4", "thumbnail": "webp", "spritesheet": "jpg"}

for variant in variants:
    response = requests.get(
        f"{base_url}/{video_id}/content",
        headers=headers,
        params={"variant": variant}
    )

    filename = f"output.{extensions[variant]}"
    with open(filename, "wb") as f:
        f.write(response.content)

    print(f"Downloaded {variant} as {filename}")
The video must have a completed status before downloading. Attempting to download a pending or failed video will return an error.

# DELETE VIDEO

Delete Video
Delete a video and its associated assets

DELETE /v1/videos/{id}
Permanently deletes a video and all its associated assets (video file, thumbnail, spritesheet).
This action is irreversible. Once deleted, the video cannot be recovered.
​
Path Parameters
​
id
stringrequired
The unique identifier of the video to delete.
​
Response
​
success
boolean
Whether the deletion was successful.
​
message
string
A confirmation message.
​
Examples
​
Delete a Video

Python

TypeScript

cURL
import requests

video_id = "vid_abc123"

response = requests.delete(
    f"<https://api.voidai.app/v1/videos/{video_id}>",
    headers={"Authorization": "Bearer sk-voidai-your_key_here"}
)

result = response.json()
print(result["message"])
​
Response Example
{
  "success": true,
  "message": "Video deleted successfully"
}
​
Error Responses
​
Video Not Found
{
  "error": {
    "message": "Video not found",
    "type": "api_error",
    "code": "NOT_FOUND"
  }
}
​
Unauthorized
{
  "error": {
    "message": "You do not have permission to delete this video",
    "type": "api_error",
    "code": "FORBIDDEN"
  }
}

# LSIT VIDEOS

List Videos
List all videos for the authenticated user

GET /v1/videos
Returns a paginated list of all video generation tasks for the authenticated user.
​
Query Parameters
​
page
integerdefault:"1"
Page number for pagination.
​
limit
integerdefault:"20"
Number of videos per page (max 100).
​
Response
​
data
array
Array of video objects.
Show Video object

​
pagination
object
Pagination information.
Show properties

​
Examples
​
List All Videos

Python

TypeScript

cURL
import requests

response = requests.get(
    "<https://api.voidai.app/v1/videos>",
    headers={"Authorization": "Bearer sk-voidai-your_key_here"},
    params={"page": 1, "limit": 10}
)

data = response.json()
for video in data["data"]:
    print(f"{video['id']}: {video['status']} - {video['prompt'][:50]}...")
​
Response Example
{
  "data": [
    {
      "id": "vid_abc123",
      "status": "completed",
      "prompt": "A serene beach at sunset with gentle waves",
      "model": "sora-2",
      "created_at": 1701691200
    },
    {
      "id": "vid_def456",
      "status": "processing",
      "prompt": "A cat playing piano in a jazz club",
      "model": "sora-2",
      "created_at": 1701691100
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25
  }
}

# LIST VIDEOS

List Videos
List all videos for the authenticated user

GET /v1/videos
Returns a paginated list of all video generation tasks for the authenticated user.
​
Query Parameters
​
page
integerdefault:"1"
Page number for pagination.
​
limit
integerdefault:"20"
Number of videos per page (max 100).
​
Response
​
data
array
Array of video objects.
Show Video object

​
pagination
object
Pagination information.
Show properties

​
Examples
​
List All Videos

Python

TypeScript

cURL
import requests

response = requests.get(
    "<https://api.voidai.app/v1/videos>",
    headers={"Authorization": "Bearer sk-voidai-your_key_here"},
    params={"page": 1, "limit": 10}
)

data = response.json()
for video in data["data"]:
    print(f"{video['id']}: {video['status']} - {video['prompt'][:50]}...")
​
Response Example
{
  "data": [
    {
      "id": "vid_abc123",
      "status": "completed",
      "prompt": "A serene beach at sunset with gentle waves",
      "model": "sora-2",
      "created_at": 1701691200
    },
    {
      "id": "vid_def456",
      "status": "processing",
      "prompt": "A cat playing piano in a jazz club",
      "model": "sora-2",
      "created_at": 1701691100
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25
  }
}

LISTING VIDEOS JUST FOR REFRENCE AS IT IS NOT A GREAT IDEA TO LIST TO EVERYONE (MAKING THE GENERATED VIDEO PUBLIC)

# LIST MODELS

List Models
List all available models

GET /v1/models
Lists all models available through VoidAI. This endpoint does not require authentication.
​
Response
​
object
string
Always list.
​
data
array
Array of model objects.
Show Model object

​
Examples
​
List All Models

Python

TypeScript

cURL
from openai import OpenAI

client = OpenAI(
    api_key="sk-voidai-your_key_here",
    base_url="<https://api.voidai.app/v1>"
)

models = client.models.list()

for model in models.data:
    print(f"{model.id} - {model.owned_by}")
​
Filter by Provider
from openai import OpenAI

client = OpenAI(
    api_key="sk-voidai-your_key_here",
    base_url="<https://api.voidai.app/v1>"
)

models = client.models.list()

# Group by provider

providers = {}
for model in models.data:
    provider = model.owned_by
    if provider not in providers:
        providers[provider] = []
    providers[provider].append(model.id)

# Print models by provider

for provider, model_ids in sorted(providers.items()):
    print(f"\n{provider}:")
    for model_id in sorted(model_ids):
        print(f"  - {model_id}")
​
Response Example
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4",
      "object": "model",
      "created": 1687882411,
      "owned_by": "openai"
    },
    {
      "id": "gpt-4o",
      "object": "model",
      "created": 1715367049,
      "owned_by": "openai"
    },
    {
      "id": "claude-3-5-sonnet",
      "object": "model",
      "created": 1718841600,
      "owned_by": "anthropic"
    },
    {
      "id": "gemini-2.0-flash",
      "object": "model",
      "created": 1701388800,
      "owned_by": "google"
    },
    {
      "id": "mistral-large",
      "object": "model",
      "created": 1708300800,
      "owned_by": "mistral"
    },
    {
      "id": "deepseek-chat",
      "object": "model",
      "created": 1704067200,
      "owned_by": "deepseek"
    }
  ]
}
​
Available Providers
VoidAI supports models from multiple providers:
Provider Examples
OpenAI gpt-4, gpt-4o, gpt-3.5-turbo, dall-e-3
Anthropic claude-3-5-sonnet, claude-3-opus, claude-3-haiku
Google gemini-2.0-flash, gemini-1.5-pro
Mistral mistral-large, mistral-medium, mistral-small
DeepSeek deepseek-chat, deepseek-coder
And more… Check the full list via the API

# GET MODELS

Get Model
Get details about a specific model

GET /v1/models/{model}
Retrieves information about a specific model. This endpoint does not require authentication.
​
Path Parameters
​
model
stringrequired
The model ID to retrieve (e.g., gpt-4, claude-3-5-sonnet).
​
Response
​
id
string
The model identifier.
​
object
string
Always model.
​
created
integer
Unix timestamp of when the model was added.
​
owned_by
string
The organization that owns the model.
​
Examples
​
Get Model Details

Python

TypeScript

cURL
from openai import OpenAI

client = OpenAI(
    api_key="sk-voidai-your_key_here",
    base_url="<https://api.voidai.app/v1>"
)

model = client.models.retrieve("gpt-4")

print(f"Model: {model.id}")
print(f"Provider: {model.owned_by}")
print(f"Created: {model.created}")
​
Check Model Exists
from openai import OpenAI, NotFoundError

client = OpenAI(
    api_key="sk-voidai-your_key_here",
    base_url="<https://api.voidai.app/v1>"
)

def model_exists(model_id):
    try:
        client.models.retrieve(model_id)
        return True
    except NotFoundError:
        return False

# Usage

if model_exists("gpt-4"):
    print("GPT-4 is available!")
else:
    print("GPT-4 is not available")
​
Response Example
{
  "id": "gpt-4",
  "object": "model",
  "created": 1687882411,
  "owned_by": "openai"
}
​
Error Response
If the model doesn’t exist:
{
  "error": {
    "message": "Model 'invalid-model' not found",
    "type": "api_error",
    "code": "MODEL_NOT_FOUND"
  }

# GET DISCOUNTS

Get My Discounts
Get your active discounts and time remaining

GET /v1/discounts/my-discounts
Returns information about your currently active discounts, including the discount percentage and time remaining until the discount expires or rotates.
VoidAI offers daily rotating discounts on select models. Discounts typically rotate at 6 PM CET.
​
Response
​
discounts
array
Array of active discount objects.
Hide Discount object

​
model
string
The model ID this discount applies to.
​
percentage
number
The discount percentage (e.g., 20 for 20% off).
​
expires_at
integer
Unix timestamp when this discount expires.
​
time_remaining
string
Human-readable time remaining (e.g., “5h 23m”).
​
next_rotation
integer
Unix timestamp of the next discount rotation.
​
Examples
​
Check Your Discounts

Python

TypeScript

cURL
import requests

response = requests.get(
    "<https://api.voidai.app/v1/discounts/my-discounts>",
    headers={"Authorization": "Bearer sk-voidai-your_key_here"}
)

data = response.json()

if data["discounts"]:
    print("Your active discounts:")
    for discount in data["discounts"]:
        print(f"  {discount['model']}: {discount['percentage']}% off")
        print(f"    Time remaining: {discount['time_remaining']}")
else:
    print("No active discounts")
​
Response Example
{
  "discounts": [
    {
      "model": "claude-3-5-sonnet",
      "percentage": 25,
      "expires_at": 1701716400,
      "time_remaining": "5h 23m"
    },
    {
      "model": "gpt-4o",
      "percentage": 15,
      "expires_at": 1701716400,
      "time_remaining": "5h 23m"
    }
  ],
  "next_rotation": 1701716400
}
​
No Active Discounts
{
  "discounts": [],
  "next_rotation": 1701716400
}

# GET ELIGIBLE DISCOUNTS

Get Eligible Models
Get models eligible for discounts

GET /v1/discounts/eligible-models
Returns a list of all models that are eligible for the daily rotating discount program.
​
Response
​
models
array
Array of model IDs that can receive discounts.
​
current_discounted
array
Array of model IDs currently receiving discounts.
​
Examples
​
Get Eligible Models

Python

TypeScript

cURL
import requests

response = requests.get(
    "<https://api.voidai.app/v1/discounts/eligible-models>",
    headers={"Authorization": "Bearer sk-voidai-your_key_here"}
)

data = response.json()

print("Models eligible for discounts:")
for model in data["models"]:
    is_discounted = model in data["current_discounted"]
    status = " (DISCOUNTED NOW)" if is_discounted else ""
    print(f"  - {model}{status}")
​
Response Example
{
  "models": [
    "gpt-4",
    "gpt-4o",
    "claude-3-5-sonnet",
    "claude-3-opus",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "mistral-large"
  ],
  "current_discounted": [
    "claude-3-5-sonnet",
    "gpt-4o"
  ]
}
​
How Discounts Work
1
Daily Rotation

Discounts rotate daily at 6 PM CET. Different models receive discounts each day.
2
Automatic Application

When you use a discounted model, the discount is automatically applied to your request cost.
3
Check Your Discounts

Use My Discounts to see your currently active discounts and time remaining.
The discount percentage varies by model and promotion. Check My Discounts to see the exact discount amounts.

# CHAT COMPLETIONS

 Create Chat Completion
Generate text completions using chat models

POST /v1/chat/completions
Creates a model response for the given chat conversation. Supports streaming, function calling, and multiple AI providers through a unified interface.
​
Request Body
​
model
stringrequired
ID of the model to use (e.g., gpt-4, claude-3-5-sonnet, gemini-2.0-flash)
​
messages
arrayrequired
A list of messages comprising the conversation so far.
Show Message object

​
stream
booleandefault:"false"
If set to true, partial message deltas will be sent as server-sent events.
​
stream_options
object
Options for streaming responses.
Show properties

​
temperature
numberdefault:"1"
Sampling temperature between 0 and 2. Higher values make output more random.
​
max_tokens
integer
Maximum number of tokens to generate in the completion.
​
max_completion_tokens
integer
An upper bound for the number of tokens that can be generated.
​
stop
string | array
Up to 4 sequences where the API will stop generating tokens.
​
presence_penalty
numberdefault:"0"
Number between -2.0 and 2.0. Positive values penalize new tokens based on presence in text.
​
frequency_penalty
numberdefault:"0"
Number between -2.0 and 2.0. Positive values penalize new tokens based on frequency in text.
​
tools
array
A list of tools the model may call.
Show Tool object

​
tool_choice
string | object
Controls which tool is called. auto lets the model decide, none prevents tool calls, or specify a tool.
​
parallel_tool_calls
booleandefault:"true"
Whether to enable parallel function calling during tool use.
​
response_format
object
Specify the output format.
Show properties

​
reasoning_effort
string
For reasoning models, controls the effort level: low, medium, or high.
​
Response
​
id
string
A unique identifier for the chat completion.
​
object
string
The object type, always chat.completion.
​
created
integer
Unix timestamp of when the completion was created.
​
model
string
The model used for completion.
​
choices
array
A list of chat completion choices.
Show Choice object

​
usage
object
Token usage statistics.
Show properties

​
Examples
​
Basic Completion

Python

TypeScript

cURL
from openai import OpenAI

client = OpenAI(
    api_key="sk-voidai-your_key_here",
    base_url="<https://api.voidai.app/v1>"
)

response = client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "What is the capital of France?"}
    ]
)

print(response.choices[0].message.content)
​
Streaming

Python

TypeScript

cURL
stream = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Tell me a short story"}],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
​
Function Calling

Python

TypeScript
tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get the current weather in a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city name"
                    },
                    "unit": {
                        "type": "string",
                        "enum": ["celsius", "fahrenheit"]
                    }
                },
                "required": ["location"]
            }
        }
    }
]

response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "What's the weather in Tokyo?"}],
    tools=tools,
    tool_choice="auto"
)

# Check if the model wants to call a function

if response.choices[0].message.tool_calls:
    tool_call = response.choices[0].message.tool_calls[0]
    print(f"Function: {tool_call.function.name}")
    print(f"Arguments: {tool_call.function.arguments}")
​
Vision (Multimodal)

Python

TypeScript
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "What's in this image?"},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": "https://example.com/image.jpg",
                        "detail": "high"
                    }
                }
            ]
        }
    ]
)

print(response.choices[0].message.content)
​
JSON Mode

Python

TypeScript
response = client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": "You are a helpful assistant that responds in JSON."},
        {"role": "user", "content": "List 3 programming languages with their year of creation"}
    ],
    response_format={"type": "json_object"}
)

import json
data = json.loads(response.choices[0].message.content)
print(data)
​
Response Example
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1701691200,
  "model": "gpt-4",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "The capital of France is Paris."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 8,
    "total_tokens": 33
  }
}
​
Streaming Response
When stream: true, responses are sent as server-sent events:
data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"The"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc123","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":" capital"},"finish_reason":null}]}

data: [DONE]

# CREATE EMBEDDINGS

Create Embeddings
Create vector embeddings from text

POST /v1/embeddings
Creates an embedding vector representing the input text. Embeddings are useful for semantic search, clustering, and similarity comparison.
​
Request Body
​
model
stringrequired
The embedding model to use (e.g., text-embedding-3-small, text-embedding-3-large, text-embedding-ada-002).
​
input
string | arrayrequired
The text to embed. Can be a single string or an array of strings for batch processing.
​
encoding_format
stringdefault:"float"
The format to return embeddings in. Options: float or base64.
​
dimensions
integer
The number of dimensions for the output embeddings. Only supported by some models.
​
Response
​
object
string
Always list.
​
data
array
Array of embedding objects.
Show Embedding object

​
model
string
The model used to generate embeddings.
​
usage
object
Token usage statistics.
Show properties

​
Examples
​
Single Text Embedding

Python

TypeScript

cURL
from openai import OpenAI

client = OpenAI(
    api_key="sk-voidai-your_key_here",
    base_url="<https://api.voidai.app/v1>"
)

response = client.embeddings.create(
    model="text-embedding-3-small",
    input="The quick brown fox jumps over the lazy dog."
)

embedding = response.data[0].embedding
print(f"Embedding dimension: {len(embedding)}")
print(f"First 5 values: {embedding[:5]}")
​
Batch Embeddings

Python

TypeScript

cURL
texts = [
    "How do I reset my password?",
    "What are your pricing plans?",
    "How can I contact support?"
]

response = client.embeddings.create(
    model="text-embedding-3-small",
    input=texts
)

for i, data in enumerate(response.data):
    print(f"Text {i}: {len(data.embedding)} dimensions")
​
Custom Dimensions

Python

TypeScript

# Use smaller dimension for efficiency

response = client.embeddings.create(
    model="text-embedding-3-large",
    input="Your text here",
    dimensions=256
)

embedding = response.data[0].embedding
print(f"Reduced dimension: {len(embedding)}")  # 256
​
Response Example
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.0023, -0.0095, 0.0152, ...]
    }
  ],
  "model": "text-embedding-3-small",
  "usage": {
    "prompt_tokens": 10,
    "total_tokens": 10
  }
}
​
Use Cases
Semantic Search
Find similar content by comparing embedding distances.
Clustering
Group similar documents together based on embeddings.
Classification
Use embeddings as features for ML classifiers.
Recommendations
Find similar items for recommendation systems.
​
Similarity Search Example
import numpy as np
from openai import OpenAI

client = OpenAI(
    api_key="sk-voidai-your_key_here",
    base_url="<https://api.voidai.app/v1>"
)

def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

# Create embeddings for documents

documents = [
    "Python is a programming language",
    "JavaScript runs in the browser",
    "Machine learning uses neural networks"
]

doc_embeddings = client.embeddings.create(
    model="text-embedding-3-small",
    input=documents
).data

# Search query

query = "How do I code in Python?"
query_embedding = client.embeddings.create(
    model="text-embedding-3-small",
    input=query
).data[0].embedding

# Find most similar document

similarities = [
    cosine_similarity(query_embedding, doc.embedding)
    for doc in doc_embeddings
]

best_match_idx = np.argmax(similarities)
print(f"Best match: {documents[best_match_idx]}")
print(f"Similarity: {similarities[best_match_idx]:.4f}")
​
Model Comparison
Model Dimensions Best For
text-embedding-3-small 1536 Cost-effective, general use
text-embedding-3-large 3072 Highest quality, customizable dimensions
text-embedding-ada-002 1536 Legacy, broad compatibility

# THE REST OF THE API REFRENCE

<https://docs.voidai.app/api-reference/>

VOID AI IS CURRENTLY CLACULATED BY A CREDIT MULTIPLIER SYSTEM. FOR FREE YOU HAVE 125K CREDITS RESETS EVERY 12:00PM WIB

Its easier to just track the error codes if its out:
Understanding and handling VoidAI API errors

VoidAI returns errors in a consistent JSON format. Understanding these errors helps you build robust applications.
​
Error Response Format
All errors follow this structure:
{
  "error": {
    "message": "Human-readable error description",
    "type": "api_error",
    "code": "ERROR_CODE",
    "reference_id": "req_1701691200_abc123",
    "timestamp": "2024-12-04T12:00:00.000Z"
  }
}
Field Description
message Human-readable description of the error
type Error category (e.g., api_error, validation_error)
code Machine-readable error code
reference_id Unique ID for support inquiries
timestamp When the error occurred
​
HTTP Status Codes
Status Description
400 Bad Request - Invalid parameters or malformed request
401 Unauthorized - Invalid or missing API key
403 Forbidden - Access denied (IP restrictions, disabled account)
404 Not Found - Resource doesn’t exist
429 Too Many Requests - Rate limit exceeded
500 Internal Server Error - Something went wrong on our end
503 Service Unavailable - Temporary outage
​
Common Error Codes
​
Authentication Errors
Code Description
MISSING_HEADER No Authorization header provided
INVALID_FORMAT Authorization header format is incorrect
INVALID_KEY API key is invalid or doesn’t exist
INVALID_OAUTH_TOKEN OAuth token is invalid
ACCOUNT_DISABLED User account has been disabled
IP_ACCESS_DENIED Request IP not in allowlist
​
Request Errors
Code Description
INVALID_MODEL Requested model doesn’t exist
INSUFFICIENT_CREDITS Not enough credits for this request
RATE_LIMIT_EXCEEDED Too many requests
VALIDATION_ERROR Request body validation failed
​
Provider Errors
Code Description
PROVIDER_ERROR Upstream provider returned an error
PROVIDER_UNAVAILABLE Provider is temporarily unavailable
MODEL_UNAVAILABLE Specific model is unavailable

So it would be INSUFFICIENT_CREDITS

SEt the RPM to 5 as it is not said
