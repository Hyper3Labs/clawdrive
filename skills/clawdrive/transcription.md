# Transcribing Audio & Video

ClawDrive embeds audio/video multimodally but does **not** extract text transcripts by default. To get searchable text transcripts, transcribe first, then add the transcript alongside the media.

Workflow:
```bash
# 1. Transcribe the file (pick a tool below)
whisperx meeting.mp4 --model large-v2 > meeting.txt

# 2. Add both the media and transcript
clawdrive add meeting.mp4 meeting.txt --pot meetings
```

## Transcription tools ranked by recommendation

### 1. WhisperX (best local, word-level timestamps + diarization)
```bash
pip install whisperx        # or: uvx whisperx
whisperx audio.wav --model large-v2
whisperx audio.wav --model large-v2 --diarize --hf_token $HF_TOKEN
```
GPU strongly preferred. CPU fallback: `--compute_type int8 --device cpu`.

### 2. mlx-whisper (best for Apple Silicon Macs)
```bash
pip install mlx-whisper
mlx_whisper audio.mp3
```
No GPU or API key needed. Runs on Metal via MLX.

### 3. whisper.cpp (lightest local binary)
```bash
# build from source or install via brew
brew install whisper-cpp
whisper-cpp -m /path/to/ggml-base.en.bin -f audio.wav
```
CPU-only by default, optional Metal/CUDA acceleration. Input must be 16kHz WAV — convert with `ffmpeg -i input.mp3 -ar 16000 -ac 1 -c:a pcm_s16le output.wav`.

### 4. OpenAI Whisper API (best managed quality, $0.006/min)
```bash
curl https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F file="@audio.mp3" -F model="gpt-4o-transcribe"
```

### 5. Groq Whisper API (fastest + cheapest API, $0.04/hr)
```bash
curl https://api.groq.com/openai/v1/audio/transcriptions \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -F file="@audio.m4a" -F model="whisper-large-v3-turbo"
```

### 6. Deepgram (best for meetings/noisy audio, $0.0077/min)
```bash
curl -X POST "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true" \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  -H "Content-Type: audio/wav" --data-binary @audio.wav
```

## Auto-detection strategy for agents

When asked to transcribe, check in this order:
1. `which whisperx` → use WhisperX
2. `which mlx_whisper` → use mlx-whisper (macOS)
3. `which whisper-cpp` or `which whisper` → use whisper.cpp
4. `$OPENAI_API_KEY` set → use OpenAI API
5. `$GROQ_API_KEY` set → use Groq API
6. `$DEEPGRAM_API_KEY` set → use Deepgram API
7. Otherwise → install whisperx (`pip install whisperx`) or mlx-whisper on macOS
