import { describe, it, expect } from "vitest";
import { detectMimeType, selectChunker } from "../../src/chunker/detect.js";

describe("detectMimeType", () => {
  it("detects PDF", () => {
    expect(detectMimeType("paper.pdf")).toBe("application/pdf");
  });
  it("detects PNG", () => {
    expect(detectMimeType("diagram.png")).toBe("image/png");
  });
  it("detects MP4", () => {
    expect(detectMimeType("lecture.mp4")).toBe("video/mp4");
  });
  it("detects markdown", () => {
    expect(detectMimeType("notes.md")).toBe("text/markdown");
  });
  it("detects typescript", () => {
    expect(detectMimeType("app.ts")).toBe("text/typescript");
  });
  it("defaults to octet-stream", () => {
    expect(detectMimeType("data.xyz")).toBe("application/octet-stream");
  });
  it("detects JPEG with .jpg", () => {
    expect(detectMimeType("photo.jpg")).toBe("image/jpeg");
  });
  it("detects JPEG with .jpeg", () => {
    expect(detectMimeType("photo.jpeg")).toBe("image/jpeg");
  });
  it("detects GIF", () => {
    expect(detectMimeType("anim.gif")).toBe("image/gif");
  });
  it("detects WebP", () => {
    expect(detectMimeType("image.webp")).toBe("image/webp");
  });
  it("detects SVG", () => {
    expect(detectMimeType("icon.svg")).toBe("image/svg+xml");
  });
  it("detects MOV", () => {
    expect(detectMimeType("clip.mov")).toBe("video/quicktime");
  });
  it("detects WebM", () => {
    expect(detectMimeType("video.webm")).toBe("video/webm");
  });
  it("detects MPEG", () => {
    expect(detectMimeType("video.mpeg")).toBe("video/mpeg");
  });
  it("detects MP3", () => {
    expect(detectMimeType("song.mp3")).toBe("audio/mpeg");
  });
  it("detects WAV", () => {
    expect(detectMimeType("sound.wav")).toBe("audio/wav");
  });
  it("detects OGG", () => {
    expect(detectMimeType("track.ogg")).toBe("audio/ogg");
  });
  it("detects M4A", () => {
    expect(detectMimeType("podcast.m4a")).toBe("audio/mp4");
  });
  it("detects plain text", () => {
    expect(detectMimeType("readme.txt")).toBe("text/plain");
  });
  it("detects JSON", () => {
    expect(detectMimeType("config.json")).toBe("application/json");
  });
  it("detects YAML with .yaml", () => {
    expect(detectMimeType("config.yaml")).toBe("text/yaml");
  });
  it("detects YAML with .yml", () => {
    expect(detectMimeType("config.yml")).toBe("text/yaml");
  });
  it("detects TSX", () => {
    expect(detectMimeType("App.tsx")).toBe("text/typescript");
  });
  it("detects JavaScript", () => {
    expect(detectMimeType("index.js")).toBe("text/javascript");
  });
  it("detects JSX", () => {
    expect(detectMimeType("App.jsx")).toBe("text/javascript");
  });
  it("detects Python", () => {
    expect(detectMimeType("main.py")).toBe("text/x-python");
  });
  it("detects Rust", () => {
    expect(detectMimeType("lib.rs")).toBe("text/x-rust");
  });
  it("detects Go", () => {
    expect(detectMimeType("main.go")).toBe("text/x-go");
  });
  it("detects HTML", () => {
    expect(detectMimeType("page.html")).toBe("text/html");
  });
  it("detects CSS", () => {
    expect(detectMimeType("style.css")).toBe("text/css");
  });
  it("detects XML", () => {
    expect(detectMimeType("data.xml")).toBe("text/xml");
  });
  it("handles filenames with multiple dots", () => {
    expect(detectMimeType("my.file.name.pdf")).toBe("application/pdf");
  });
  it("handles uppercase extensions", () => {
    expect(detectMimeType("PHOTO.PNG")).toBe("image/png");
  });
});

describe("selectChunker", () => {
  it("selects pdf chunker for PDFs", () => {
    expect(selectChunker("application/pdf")).toBe("pdf");
  });
  it("selects text chunker for markdown", () => {
    expect(selectChunker("text/markdown")).toBe("text");
  });
  it("selects video chunker for MP4", () => {
    expect(selectChunker("video/mp4")).toBe("video");
  });
  it("selects audio chunker for MP3", () => {
    expect(selectChunker("audio/mpeg")).toBe("audio");
  });
  it("selects none for single images", () => {
    expect(selectChunker("image/png")).toBe("none");
  });
  it("selects text for JSON", () => {
    expect(selectChunker("application/json")).toBe("text");
  });
  it("selects text for YAML", () => {
    expect(selectChunker("text/yaml")).toBe("text");
  });
  it("selects text for plain text", () => {
    expect(selectChunker("text/plain")).toBe("text");
  });
  it("selects text for typescript", () => {
    expect(selectChunker("text/typescript")).toBe("text");
  });
  it("selects video for quicktime", () => {
    expect(selectChunker("video/quicktime")).toBe("video");
  });
  it("selects audio for WAV", () => {
    expect(selectChunker("audio/wav")).toBe("audio");
  });
  it("selects none for unknown types", () => {
    expect(selectChunker("application/octet-stream")).toBe("none");
  });
});
