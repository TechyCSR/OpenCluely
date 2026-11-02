const { GoogleGenAI } = require("@google/genai");
const { StreamSanitizer } = require("./sanitizer");
const { SkillManager } = require("./skills");
const { ContextManager } = require("./context");

/**
 * Universal Multi-Provider AI Router
 * Direct SSE streaming for Google Gemini, Groq, OpenAI, OpenRouter, and Ollama.
 * Integrated with StreamSanitizer to strip chain-of-thought blocks before emitting.
 */
class AIRouter {
  constructor(config = {}) {
    this.config = {
      provider: config.provider || process.env.AI_PROVIDER || "gemini",
      geminiKey: config.geminiKey || process.env.GEMINI_API_KEY || "",
      geminiModel: config.geminiModel || "gemini-2.5-flash",
      groqKey: config.groqKey || process.env.GROQ_API_KEY || "",
      groqModel: config.groqModel || "llama-3.3-70b-versatile",
      openaiKey: config.openaiKey || process.env.OPENAI_API_KEY || "",
      openaiModel: config.openaiModel || "gpt-4o-mini",
      openrouterKey: config.openrouterKey || process.env.OPENROUTER_API_KEY || "",
      openrouterModel: config.openrouterModel || "google/gemini-2.5-flash",
      ollamaEndpoint: config.ollamaEndpoint || "http://localhost:11434/v1/chat/completions",
      ollamaModel: config.ollamaModel || "llama3.2:latest",
      ...config
    };
    this.contextManager = new ContextManager();
    this.currentAbortController = null;
  }

  updateConfig(newConfig = {}) {
    this.config = { ...this.config, ...newConfig };
  }

  abortCurrentRequest() {
    if (this.currentAbortController) {
      try {
        this.currentAbortController.abort();
      } catch (_) {}
      this.currentAbortController = null;
    }
  }

  /**
   * Stream a response for given prompt and optional image.
   * @param {Object} params
   * @param {string} params.prompt
   * @param {string} [params.skill="dsa"]
   * @param {string} [params.language="cpp"]
   * @param {string} [params.imageBase64]
   * @param {Function} onChunk - (chunkText) => void
   * @param {Function} onDone - (fullSanitizedText) => void
   * @param {Function} onError - (err) => void
   */
  async stream({ prompt, skill = "dsa", language = "cpp", imageBase64 = null }, onChunk, onDone, onError) {
    this.abortCurrentRequest();
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    const sanitizer = new StreamSanitizer();
    let accumulatedText = "";

    const candidateContext = this.contextManager.buildGroundingContext();
    const systemPrompt = SkillManager.getSystemPrompt(skill, language, candidateContext);

    const safeChunkHandler = (rawChunk) => {
      const sanitized = sanitizer.processChunk(rawChunk);
      if (sanitized) {
        accumulatedText += sanitized;
        if (typeof onChunk === "function") {
          onChunk(sanitized);
        }
      }
    };

    const safeDoneHandler = () => {
      const remaining = sanitizer.flush();
      if (remaining) {
        accumulatedText += remaining;
        if (typeof onChunk === "function") {
          onChunk(remaining);
        }
      }
      this.currentAbortController = null;
      if (typeof onDone === "function") {
        onDone(accumulatedText);
      }
    };

    const provider = (this.config.provider || "gemini").toLowerCase();

    try {
      if (provider === "gemini") {
        await this._streamGemini({ prompt, systemPrompt, imageBase64, signal, onChunk: safeChunkHandler });
      } else if (provider === "groq") {
        await this._streamOpenAICompatible({
          endpoint: "https://api.groq.com/openai/v1/chat/completions",
          apiKey: this.config.groqKey,
          model: this.config.groqModel,
          prompt,
          systemPrompt,
          imageBase64,
          signal,
          onChunk: safeChunkHandler
        });
      } else if (provider === "openai") {
        await this._streamOpenAICompatible({
          endpoint: "https://api.openai.com/v1/chat/completions",
          apiKey: this.config.openaiKey,
          model: this.config.openaiModel,
          prompt,
          systemPrompt,
          imageBase64,
          signal,
          onChunk: safeChunkHandler
        });
      } else if (provider === "openrouter") {
        await this._streamOpenAICompatible({
          endpoint: "https://openrouter.ai/api/v1/chat/completions",
          apiKey: this.config.openrouterKey,
          model: this.config.openrouterModel,
          prompt,
          systemPrompt,
          imageBase64,
          signal,
          onChunk: safeChunkHandler
        });
      } else if (provider === "ollama") {
        await this._streamOpenAICompatible({
          endpoint: this.config.ollamaEndpoint,
          apiKey: "ollama",
          model: this.config.ollamaModel,
          prompt,
          systemPrompt,
          imageBase64,
          signal,
          onChunk: safeChunkHandler
        });
      } else {
        // Fallback to Gemini
        await this._streamGemini({ prompt, systemPrompt, imageBase64, signal, onChunk: safeChunkHandler });
      }

      safeDoneHandler();
    } catch (err) {
      this.currentAbortController = null;
      if (signal.aborted) {
        return; // Normal user cancellation
      }
      if (typeof onError === "function") {
        onError(err);
      }
    }
  }

  async _streamGemini({ prompt, systemPrompt, imageBase64, signal, onChunk }) {
    const apiKey = this.config.geminiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Gemini API key is required. Set GEMINI_API_KEY in .env or settings.");
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const contents = [];

      // Add image part if provided
      if (imageBase64) {
        const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
        contents.push({
          inlineData: {
            mimeType: "image/png",
            data: cleanBase64
          }
        });
      }

      contents.push({
        text: `${systemPrompt}\n\nUSER REQUEST / INTERVIEW QUESTION:\n${prompt}`
      });

      const responseStream = await ai.models.generateContentStream({
        model: this.config.geminiModel || "gemini-2.5-flash",
        contents: contents
      });

      for await (const chunk of responseStream) {
        if (signal.aborted) break;
        if (chunk && chunk.text) {
          onChunk(chunk.text);
        }
      }
    } catch (err) {
      // If genai SDK throws with model error, attempt fallback model
      if (this.config.geminiModel !== "gemini-1.5-flash" && !signal.aborted) {
        try {
          const ai = new GoogleGenAI({ apiKey });
          const contents = [{ text: `${systemPrompt}\n\nUSER REQUEST / INTERVIEW QUESTION:\n${prompt}` }];
          if (imageBase64) {
            contents.unshift({
              inlineData: {
                mimeType: "image/png",
                data: imageBase64.replace(/^data:image\/\w+;base64,/, "")
              }
            });
          }
          const responseStream = await ai.models.generateContentStream({
            model: "gemini-1.5-flash",
            contents: contents
          });
          for await (const chunk of responseStream) {
            if (signal.aborted) break;
            if (chunk && chunk.text) {
              onChunk(chunk.text);
            }
          }
          return;
        } catch (fallbackErr) {
          throw fallbackErr;
        }
      }
      throw err;
    }
  }

  async _streamOpenAICompatible({ endpoint, apiKey, model, prompt, systemPrompt, imageBase64, signal, onChunk }) {
    const messages = [
      { role: "system", content: systemPrompt }
    ];

    if (imageBase64) {
      const dataUri = imageBase64.startsWith("data:") ? imageBase64 : `data:image/png;base64,${imageBase64}`;
      messages.push({
        role: "user",
        content: [
          { type: "text", text: prompt || "Analyze this problem on screen and solve it." },
          { type: "image_url", image_url: { url: dataUri } }
        ]
      });
    } else {
      messages.push({ role: "user", content: prompt });
    }

    const headers = {
      "Content-Type": "application/json"
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: model,
        messages: messages,
        stream: true,
        temperature: 0.2
      }),
      signal
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`HTTP ${response.status} from ${endpoint}: ${errorBody}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done || signal.aborted) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // Keep partial line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const dataStr = trimmed.replace(/^data:\s*/, "");
        if (dataStr === "[DONE]") return;

        try {
          const parsed = JSON.parse(dataStr);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            onChunk(delta);
          }
        } catch (_) {}
      }
    }
  }
}

module.exports = { AIRouter };
