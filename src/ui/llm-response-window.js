const logger = require("../core/logger");

class LLMResponseWindowUI {
  constructor() {
    this.currentLayout = "split";
    this.hasCode = false;
    this.currentSkill = "dsa";
    this.isInteractive = false;
    this.scrollableElements = [];

    this.elements = {};

    this.init();
    this.handleMouseEnter = this.handleMouseEnter.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
    this.handleWheelScroll = this.handleWheelScroll.bind(this);
  }

  init() {
    try {
      this.setupElements();
      this.setupEventListeners();
      this.configureMarked();

      logger.info("LLM response window UI initialized", {
        component: "LLMResponseWindowUI",
      });
    } catch (error) {
      logger.error("Failed to initialize LLM response window UI", {
        component: "LLMResponseWindowUI",
        error: error.message,
      });
    }
  }

  setupElements() {
    this.elements = {
      loading: document.getElementById("loading"),
      responseContent: document.getElementById("response-content"),
      splitLayout: document.getElementById("split-layout"),
      fullContent: document.getElementById("full-content"),
      textContent: document.getElementById("text-content"),
      codeContent: document.getElementById("code-content"),
      fullMarkdown: document.getElementById("full-markdown"),
    };

    // Validate required elements
    const requiredElements = ["loading", "responseContent"];
    for (const elementKey of requiredElements) {
      if (!this.elements[elementKey]) {
        throw new Error(`Required element '${elementKey}' not found`);
      }
    }
  }

  setupEventListeners() {
    const { ipcRenderer } = require("electron");

    logger.debug("Setting up event listeners", {
      component: "LLMResponseWindowUI",
    });

    // Test IPC connection
    try {
      ipcRenderer.send("test-connection");
      logger.debug("IPC connection test sent", {
        component: "LLMResponseWindowUI",
      });
    } catch (error) {
      logger.error("IPC connection test failed", {
        component: "LLMResponseWindowUI",
        error: error.message,
      });
    }

    // Core event handlers with enhanced logging
    ipcRenderer.on("show-loading", () => {
      logger.debug("show-loading event received", {
        component: "LLMResponseWindowUI",
      });
      this.showLoadingState();
    });

    ipcRenderer.on("display-llm-response", (event, data) => {
      logger.info("display-llm-response event received - ENTRY POINT", {
        component: "LLMResponseWindowUI",
        hasData: !!data,
        dataKeys: data ? Object.keys(data) : [],
        contentLength: data?.content?.length || 0,
        responseLength: data?.response?.length || 0,
        eventOrigin: event ? "valid" : "invalid",
        timestamp: new Date().toISOString(),
      });

      // Add a small delay to ensure DOM is ready
      setTimeout(() => {
        this.handleDisplayResponse(data);
      }, 50);
    });

    // Interaction state handlers
    ipcRenderer.on("interaction-enabled", () => {
      logger.debug("interaction-enabled event received", {
        component: "LLMResponseWindowUI",
      });
      this.handleInteractionEnabled();
    });

    ipcRenderer.on("interaction-disabled", () => {
      logger.debug("interaction-disabled event received", {
        component: "LLMResponseWindowUI",
      });
      this.handleInteractionDisabled();
    });

    // Window event handlers
    this.setupWindowEventHandlers();

    // Keyboard event handlers
    this.setupKeyboardHandlers();

    logger.debug("Event listeners setup complete", {
      component: "LLMResponseWindowUI",
    });

    // Add a test method to verify setup
    window.testLLMResponse = () => {
      logger.info("Manual test triggered");
      this.handleDisplayResponse({
        content: "Test content from manual trigger",
        metadata: { skill: "test" },
      });
    };
  }

  setupWindowEventHandlers() {
    window.addEventListener("focus", () => {
      logger.debug("LLM Response window focused", {
        component: "LLMResponseWindowUI",
      });
    });

    window.addEventListener("beforeunload", () => {
      logger.debug("LLM Response window closing", {
        component: "LLMResponseWindowUI",
      });
    });
  }

  setupKeyboardHandlers() {
    document.addEventListener("keydown", (e) => {
      this.handleKeyDown(e);
    });
  }

  configureMarked() {
    if (typeof marked !== "undefined") {
      marked.setOptions({
        highlight: function (code, lang) {
          if (typeof Prism !== "undefined" && Prism.languages[lang]) {
            return Prism.highlight(code, Prism.languages[lang], lang);
          }
          return code;
        },
        breaks: true,
        gfm: true,
      });
    }
  }

  handleDisplayResponse(data) {
    try {
      logger.info("LLM Response received - START", {
        component: "LLMResponseWindowUI",
        dataExists: !!data,
        timestamp: new Date().toISOString(),
      });

      // Comprehensive data validation
      if (!data || typeof data !== "object") {
        throw new Error(
          "Invalid data: expected object, received " + typeof data
        );
      }

      const response = data.content || data.response;
      if (!response || typeof response !== "string") {
        throw new Error("Invalid response: expected string content");
      }

      if (response.trim().length === 0) {
        throw new Error("Empty response content");
      }

      logger.info("Valid response data found", {
        component: "LLMResponseWindowUI",
        responseLength: response.length,
      });

      // Rest of the method...
      if (window.innerWidth < 500 || window.innerHeight < 300) {
        this.handleWindowExpansion(data);
      } else {
        this.displayResponseContent(data);
      }
    } catch (error) {
      logger.error("Failed to handle display response", {
        component: "LLMResponseWindowUI",
        error: error.message,
        stack: error.stack,
      });

      this.hideLoadingState();
      this.displayErrorMessage(`Error processing response: ${error.message}`);
    }
  }

  async handleWindowExpansion(data) {
    try {
      logger.debug("Window appears to be compact size, requesting expansion", {
        component: "LLMResponseWindowUI",
      });

      const response = data.content || data.response;
      if (!response) {
        throw new Error("No response data available for expansion calculation");
      }

      const codeBlocks = this.extractCodeBlocks(response);
      const contentMetrics = this.calculateContentMetrics(response, codeBlocks);

      const { ipcRenderer } = require("electron");

      // Add timeout to prevent hanging
      const expansionPromise = ipcRenderer.invoke(
        "expand-llm-window",
        contentMetrics
      );
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Window expansion timeout")), 5000)
      );

      const result = await Promise.race([expansionPromise, timeoutPromise]);

      logger.debug("Window expansion completed", {
        component: "LLMResponseWindowUI",
        result,
      });

      // Use a more reliable delay mechanism
      await new Promise((resolve) => setTimeout(resolve, 200));
      this.displayResponseContent(data);
    } catch (error) {
      logger.error("Failed to expand window", {
        component: "LLMResponseWindowUI",
        error: error.message,
      });

      // Fallback to display content without expansion
      this.displayResponseContent(data);
    }
  }

  displayResponseContent(data) {
    try {
      logger.debug("displayResponseContent called - START", {
        component: "LLMResponseWindowUI",
        dataKeys: Object.keys(data),
        hasContent: !!data.content,
        hasResponse: !!data.response,
      });

      // Always hide loading state first
      logger.debug("Hiding loading state...");
      this.hideLoadingState();

      // Always show response content
      logger.debug("Showing response content...");
      this.showResponseContent();

      // Validate elements exist
      if (!this.elements.responseContent) {
        logger.error("Response content element not found!", {
          component: "LLMResponseWindowUI",
        });
        return;
      }

      // Check both content and response properties for compatibility
      const response = data.content || data.response;
      if (!response) {
        logger.error("No response data received", {
          component: "LLMResponseWindowUI",
          dataKeys: Object.keys(data),
          dataContent: data,
        });

        // Show error message instead of staying in loading state
        this.displayErrorMessage("No content received");
        return;
      }

      logger.info("Processing response content", {
        component: "LLMResponseWindowUI",
        responseLength: response.length,
        responsePreview: response.substring(0, 200) + "...",
      });

      // Check if response contains code blocks
      const codeBlocks = this.extractCodeBlocks(response);
      this.hasCode = codeBlocks.length > 0;

      logger.debug("Code analysis complete", {
        component: "LLMResponseWindowUI",
        hasCode: this.hasCode,
        codeBlockCount: codeBlocks.length,
      });

      // Calculate content metrics for dynamic sizing
      const contentMetrics = this.calculateContentMetrics(response, codeBlocks);

      logger.info("About to display response content", {
        component: "LLMResponseWindowUI",
        hasCode: this.hasCode,
        responseLength: response.length,
        layoutType: this.hasCode ? "split" : "full",
      });

      // Display content based on type
      if (this.hasCode) {
        logger.debug("Displaying split layout...");
        this.displaySplitLayout(response, codeBlocks);
      } else {
        logger.debug("Displaying full layout...");
        this.displayFullLayout(response);
      }

      logger.info("Response content displayed successfully", {
        component: "LLMResponseWindowUI",
        layoutType: this.hasCode ? "split" : "full",
      });

      // Setup additional features
      this.setupScrolling();
      this.requestWindowResize(contentMetrics);

      // Final verification
      setTimeout(() => {
        const isLoadingHidden = this.elements.loading
          ? this.elements.loading.classList.contains("hidden")
          : true;
        const isContentVisible = this.elements.responseContent
          ? !this.elements.responseContent.classList.contains("hidden")
          : false;

        logger.info("Display state verification", {
          component: "LLMResponseWindowUI",
          loadingHidden: isLoadingHidden,
          contentVisible: isContentVisible,
          windowVisible: !document.hidden,
        });

        if (!isLoadingHidden || !isContentVisible) {
          logger.warn("Display state inconsistent - forcing correction", {
            component: "LLMResponseWindowUI",
          });
          this.hideLoadingState();
          this.showResponseContent();
        }
      }, 100);

      logger.debug("displayResponseContent completed - END");
    } catch (error) {
      logger.error("Failed to display response content", {
        component: "LLMResponseWindowUI",
        error: error.message,
        stack: error.stack,
      });

      // Always try to hide loading and show some content
      this.hideLoadingState();
      this.displayErrorMessage("Error displaying content: " + error.message);
    }
  }

  displayErrorMessage(message) {
    logger.info("Displaying error message", {
      component: "LLMResponseWindowUI",
      message,
    });

    this.showResponseContent();

    if (this.elements.fullContent && this.elements.fullMarkdown) {
      this.elements.splitLayout?.classList.add("hidden");
      this.elements.fullContent?.classList.remove("hidden");
      this.elements.fullMarkdown.innerHTML = `<div class="error-message" style="color: #ff6b6b; padding: 20px; text-align: center; font-family: monospace;">${message}</div>`;
    }
  }

  async requestWindowResize(contentMetrics) {
    try {
      setTimeout(async () => {
        logger.debug("Requesting window resize based on content metrics", {
          component: "LLMResponseWindowUI",
          metrics: contentMetrics,
        });

        const { ipcRenderer } = require("electron");
        const result = await ipcRenderer.invoke(
          "resize-llm-window-for-content",
          contentMetrics
        );

        logger.debug("Window resize result", {
          component: "LLMResponseWindowUI",
          result,
        });
      }, 200);
    } catch (error) {
      logger.error("Failed to resize window", {
        component: "LLMResponseWindowUI",
        error: error.message,
      });
    }
  }

  handleInteractionEnabled() {
    this.isInteractive = true;
    document.body.classList.add("interactive-scrolling");
    this.enableScrolling();

    logger.debug("Interaction mode enabled", {
      component: "LLMResponseWindowUI",
    });
  }

  handleInteractionDisabled() {
    this.isInteractive = false;
    document.body.classList.remove("interactive-scrolling");
    this.disableScrolling();

    logger.debug("Interaction mode disabled", {
      component: "LLMResponseWindowUI",
    });
  }

  handleKeyDown(e) {
    if (!this.isInteractive) return;

    const activeElement = document.activeElement;
    let targetElement = null;

    // Find the currently focused scrollable element
    for (let element of this.scrollableElements) {
      if (element === activeElement || element.contains(activeElement)) {
        targetElement = element;
        break;
      }
    }

    // Default to first scrollable element if none focused
    if (!targetElement && this.scrollableElements.length > 0) {
      targetElement = this.scrollableElements[0];
    }

    if (!targetElement) return;

    const scrollAmount = 50;

    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        targetElement.scrollBy({ top: -scrollAmount, behavior: "smooth" });
        break;
      case "ArrowDown":
        e.preventDefault();
        targetElement.scrollBy({ top: scrollAmount, behavior: "smooth" });
        break;
      case "ArrowLeft":
        e.preventDefault();
        targetElement.scrollBy({ left: -scrollAmount, behavior: "smooth" });
        break;
      case "ArrowRight":
        e.preventDefault();
        targetElement.scrollBy({ left: scrollAmount, behavior: "smooth" });
        break;
      case "PageUp":
        e.preventDefault();
        targetElement.scrollBy({
          top: -targetElement.clientHeight * 0.8,
          behavior: "smooth",
        });
        break;
      case "PageDown":
        e.preventDefault();
        targetElement.scrollBy({
          top: targetElement.clientHeight * 0.8,
          behavior: "smooth",
        });
        break;
      case "Home":
        e.preventDefault();
        targetElement.scrollTo({ top: 0, behavior: "smooth" });
        break;
      case "End":
        e.preventDefault();
        targetElement.scrollTo({
          top: targetElement.scrollHeight,
          behavior: "smooth",
        });
        break;
    }
  }

  showLoadingState() {
    if (this.elements.loading) {
      this.elements.loading.classList.remove("hidden");
    }

    if (this.elements.responseContent) {
      this.elements.responseContent.classList.add("hidden");
    }

    logger.debug("Loading state shown", { component: "LLMResponseWindowUI" });
  }

  hideLoadingState() {
    if (this.elements.loading) {
      this.elements.loading.classList.add("hidden");
      logger.debug('Loading element hidden with "hidden" class', {
        component: "LLMResponseWindowUI",
      });
    } else {
      logger.warn("Loading element not found!", {
        component: "LLMResponseWindowUI",
      });
    }

    logger.debug("Loading state hidden", { component: "LLMResponseWindowUI" });
  }

  showResponseContent() {
    if (this.elements.responseContent) {
      this.elements.responseContent.classList.remove("hidden");
      logger.debug("Response content element shown (hidden class removed)", {
        component: "LLMResponseWindowUI",
      });
    } else {
      logger.warn("Response content element not found!", {
        component: "LLMResponseWindowUI",
      });
    }

    logger.debug("Response content shown", {
      component: "LLMResponseWindowUI",
    });
  }

  extractCodeBlocks(text) {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const blocks = [];
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      blocks.push({
        language: match[1] || "text",
        code: match[2].trim(),
        fullMatch: match[0],
      });
    }

    return blocks;
  }

  calculateContentMetrics(response, codeBlocks) {
    const lineCount = response.split("\n").length;
    const hasLongLines = response.split("\n").some((line) => line.length > 80);
    const codeBlockCount = codeBlocks.length;
    const hasCode = codeBlockCount > 0;
    const isLongContent = lineCount > 30;
    const hasMultipleCodeBlocks = codeBlockCount > 2;

    return {
      lineCount,
      hasLongLines,
      codeBlocks: codeBlockCount,
      hasCode,
      isLongContent,
      hasMultipleCodeBlocks,
      complexity:
        isLongContent || hasMultipleCodeBlocks
          ? "high"
          : hasCode
          ? "medium"
          : "low",
    };
  }

  displaySplitLayout(response, codeBlocks) {
    // Show split layout, hide full layout
    this.elements.splitLayout?.classList.remove("hidden");
    this.elements.fullContent?.classList.add("hidden");

    // Remove code blocks from text content
    let textContent = response;
    codeBlocks.forEach((block) => {
      textContent = textContent.replace(block.fullMatch, "");
    });

    // Clean up text content
    textContent = textContent.replace(/\n\s*\n\s*\n/g, "\n\n").trim();

    // Render text content
    if (this.elements.textContent && typeof marked !== "undefined") {
      const textHtml = marked.parse(textContent);
      this.elements.textContent.innerHTML = textHtml;
    }

    // Render code blocks
    this.renderCodeBlocks(codeBlocks);

    // Highlight code
    this.highlightCode();

    logger.debug("Split layout displayed", {
      component: "LLMResponseWindowUI",
      codeBlockCount: codeBlocks.length,
    });
  }

  displayFullLayout(response) {
    logger.info("Displaying full layout", {
      component: "LLMResponseWindowUI",
      hasSplitLayout: !!this.elements.splitLayout,
      hasFullContent: !!this.elements.fullContent,
      hasFullMarkdown: !!this.elements.fullMarkdown,
      responseLength: response.length,
    });

    // Show full layout, hide split layout
    this.elements.splitLayout?.classList.add("hidden");
    this.elements.fullContent?.classList.remove("hidden");

    // Render full markdown
    if (this.elements.fullMarkdown && typeof marked !== "undefined") {
      const html = marked.parse(response);
      this.elements.fullMarkdown.innerHTML = html;
      logger.info("Markdown content rendered", {
        component: "LLMResponseWindowUI",
        htmlLength: html.length,
        htmlPreview: html.substring(0, 200) + "...",
      });
    } else {
      if (!this.elements.fullMarkdown) {
        logger.error("fullMarkdown element not found!", {
          component: "LLMResponseWindowUI",
        });
      }
      if (typeof marked === "undefined") {
        logger.error("marked library not available!", {
          component: "LLMResponseWindowUI",
        });
      }
    }

    // Highlight any code
    this.highlightCode();

    logger.info("Full layout displayed", { component: "LLMResponseWindowUI" });
  }

  renderCodeBlocks(codeBlocks) {
    if (!this.elements.codeContent) return;

    this.elements.codeContent.innerHTML = "";

    if (codeBlocks.length === 0) {
      this.elements.codeContent.innerHTML =
        '<div class="no-code">No code examples found</div>';
    } else {
      codeBlocks.forEach((block, index) => {
        const codeBlock = document.createElement("div");
        codeBlock.className = "code-block";
        codeBlock.innerHTML = `
                    <div class="code-header">${block.language.toUpperCase()}</div>
                    <div class="code-content">
                        <pre><code class="language-${
                          block.language
                        }">${this.escapeHtml(block.code)}</code></pre>
                    </div>
                `;
        this.elements.codeContent.appendChild(codeBlock);
      });
    }
  }

  highlightCode() {
    if (typeof Prism !== "undefined") {
      Prism.highlightAll();
    }
  }

  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  setupScrolling() {
    setTimeout(() => {
      if (this.hasCode) {
        this.scrollableElements = [
          document.querySelector(".text-panel .panel-content"),
          document.querySelector(".code-panel .panel-content"),
        ].filter((el) => el !== null);
      } else {
        this.scrollableElements = [
          document.querySelector(".full-content-inner"),
        ].filter((el) => el !== null);
      }

      logger.debug("Scrollable elements found", {
        component: "LLMResponseWindowUI",
        count: this.scrollableElements.length,
      });

      // Reset scroll positions and ensure elements are focusable
      this.scrollableElements.forEach((element) => {
        element.scrollTop = 0;
        element.scrollLeft = 0;
        element.setAttribute("tabindex", "0");
      });

      // Enable scrolling if interactive mode is on
      if (this.isInteractive) {
        this.enableScrolling();
      }
    }, 100);
  }

  enableScrolling() {
    logger.debug("Enabling scrolling", {
      component: "LLMResponseWindowUI",
      elementCount: this.scrollableElements.length,
    });

    this.scrollableElements.forEach((element) => {
      if (element) {
        element.style.scrollBehavior = "smooth";

        // Remove any existing listeners first to prevent duplicates
        element.removeEventListener("mouseenter", this.handleMouseEnter);
        element.removeEventListener("mouseleave", this.handleMouseLeave);
        element.removeEventListener("wheel", this.handleWheelScroll);

        // Add listeners with proper binding
        element.addEventListener("mouseenter", this.handleMouseEnter, {
          passive: true,
        });
        element.addEventListener("mouseleave", this.handleMouseLeave, {
          passive: true,
        });
        element.addEventListener("wheel", this.handleWheelScroll, {
          passive: false,
        });
      }
    });
  }

  destroy() {
    try {
      // Remove all event listeners
      this.disableScrolling();

      // Remove keyboard handlers
      document.removeEventListener("keydown", this.handleKeyDown);

      // Clear any pending timeouts (you'd need to track these)
      // clearTimeout(this.expansionTimeout);

      // Clear references
      this.scrollableElements = [];
      this.elements = {};

      logger.info("LLMResponseWindowUI destroyed", {
        component: "LLMResponseWindowUI",
      });
    } catch (error) {
      logger.error("Error during cleanup", {
        component: "LLMResponseWindowUI",
        error: error.message,
      });
    }
  }

  // Add method to check if dependencies are available
  checkDependencies() {
    const missing = [];

    if (typeof marked === "undefined") {
      missing.push("marked");
    }

    if (typeof Prism === "undefined") {
      missing.push("Prism");
    }

    try {
      require("electron");
    } catch (e) {
      missing.push("electron");
    }

    if (missing.length > 0) {
      logger.warn("Missing dependencies", {
        component: "LLMResponseWindowUI",
        missing: missing,
      });
      return false;
    }

    return true;
  }

  disableScrolling() {
    logger.debug("Disabling scrolling", { component: "LLMResponseWindowUI" });

    this.scrollableElements.forEach((element) => {
      if (element) {
        element.removeEventListener("mouseenter", this.handleMouseEnter);
        element.removeEventListener("mouseleave", this.handleMouseLeave);
        element.removeEventListener("wheel", this.handleWheelScroll);
      }
    });
  }

  handleMouseEnter(e) {
    e.target.focus({ preventScroll: true });
    e.target.style.cursor = "grab";
  }

  handleMouseLeave(e) {
    e.target.style.cursor = "default";
  }

  handleWheelScroll(e) {
    logger.debug("Wheel scroll detected", { component: "LLMResponseWindowUI" });
  }

  // Public methods for external access
  getCurrentLayout() {
    return this.currentLayout;
  }

  hasCodeContent() {
    return this.hasCode;
  }

  isInteractiveMode() {
    return this.isInteractive;
  }
}

// Initialize when DOM is ready - Re-enabled for better error handling
let llmResponseWindowUI;
document.addEventListener('DOMContentLoaded', () => {
    llmResponseWindowUI = new LLMResponseWindowUI();
    
    // Global access for debugging
    window.llmResponseWindowUI = llmResponseWindowUI;
});

module.exports = LLMResponseWindowUI;
