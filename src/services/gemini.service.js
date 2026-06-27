import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";

const DEFAULT_MODEL = "gemini-2.5-flash";

export class GeminiConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "GeminiConfigurationError";
  }
}

export class GeminiService {
  /**
   * @param {{ apiKey?: string, model?: string }} [options]
   */
  constructor(options = {}) {
    const apiKey = options.apiKey ?? env.geminiApiKey;
    const model = options.model ?? env.geminiModel ?? DEFAULT_MODEL;

    if (!apiKey || !String(apiKey).trim()) {
      throw new GeminiConfigurationError(
        "GEMINI_API_KEY is missing. Add it to your environment before using the Gemini service."
      );
    }

    this.apiKey = String(apiKey).trim();
    this.model = String(model).trim() || DEFAULT_MODEL;
    this.client = new GoogleGenAI({ apiKey: this.apiKey });
  }

  get modelName() {
    return this.model;
  }

  /**
   * Placeholder text-generation helper for future AI features.
   * @param {string} prompt
   * @param {{ systemInstruction?: string, temperature?: number, maxOutputTokens?: number, responseSchema?: any }} [options]
   * @returns {Promise<string>}
   */
  async generateText(prompt, options = {}) {
    const safePrompt = String(prompt ?? "").trim();

    if (!safePrompt) {
      throw new Error("Prompt is required.");
    }

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: safePrompt,
      config: {
        ...(options.systemInstruction ? { systemInstruction: options.systemInstruction } : {}),
        ...(Number.isFinite(options.temperature) ? { temperature: options.temperature } : {}),
        ...(Number.isFinite(options.maxOutputTokens) ? { maxOutputTokens: options.maxOutputTokens } : {}),
        ...(Number.isFinite(options.timeoutMs) ? { httpOptions: { timeout: options.timeoutMs } } : {}),
        ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
        ...(options.thinkingConfig ? { thinkingConfig: options.thinkingConfig } : {}),
      },
    });

    return response.text || "";
  }

  /**
   * Generates JSON output with a strict JSON response hint.
   * @param {string} prompt
   * @param {{ systemInstruction?: string, temperature?: number, maxOutputTokens?: number }} [options]
   * @returns {Promise<any>}
   */
  async generateJson(prompt, options = {}) {
    const safePrompt = String(prompt ?? "").trim();

    if (!safePrompt) {
      throw new Error("Prompt is required.");
    }

    options.onRequest?.({
      model: this.model,
      promptLength: safePrompt.length,
      systemInstructionLength: String(options.systemInstruction || '').length,
      hasResponseSchema: Boolean(options.responseSchema),
      maxOutputTokens: Number.isFinite(options.maxOutputTokens) ? options.maxOutputTokens : null,
      timeoutMs: Number.isFinite(options.timeoutMs) ? options.timeoutMs : null,
    });

    const startedAt = Date.now();

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: safePrompt,
      config: {
        responseMimeType: "application/json",
        ...(options.responseSchema ? { responseJsonSchema: options.responseSchema } : {}),
        ...(options.systemInstruction ? { systemInstruction: options.systemInstruction } : {}),
        ...(Number.isFinite(options.temperature) ? { temperature: options.temperature } : { temperature: 0.2 }),
        ...(Number.isFinite(options.maxOutputTokens) ? { maxOutputTokens: options.maxOutputTokens } : {}),
        ...(Number.isFinite(options.timeoutMs) ? { httpOptions: { timeout: options.timeoutMs } } : {}),
        ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
        ...(options.thinkingConfig ? { thinkingConfig: options.thinkingConfig } : {}),
      },
    });

    const text = response.text || "";
    options.onResponse?.({
      durationMs: Date.now() - startedAt,
      responseTextLength: text.length,
      modelVersion: response.modelVersion || null,
      responseId: response.responseId || null,
      usageMetadata: response.usageMetadata || null,
      promptFeedback: response.promptFeedback || null,
      rawText: text,
    });

    try {
      return JSON.parse(text);
    } catch {
      options.onParseError?.({
        durationMs: Date.now() - startedAt,
        responseTextLength: text.length,
        rawText: text,
      });
      return {
        text,
      };
    }
  } catch (error) {
    options.onError?.(error);
    throw error;
  }
}

let geminiServiceInstance = null;

/**
 * Returns a lazily created Gemini service instance.
 * @param {{ apiKey?: string, model?: string }} [options]
 * @returns {GeminiService}
 */
export function getGeminiService(options = {}) {
  const hasOverrides = Object.prototype.hasOwnProperty.call(options, "apiKey") || Object.prototype.hasOwnProperty.call(options, "model");

  if (hasOverrides) {
    return new GeminiService(options);
  }

  if (!geminiServiceInstance) {
    geminiServiceInstance = new GeminiService();
  }

  return geminiServiceInstance;
}

export function resetGeminiServiceCache() {
  geminiServiceInstance = null;
}
