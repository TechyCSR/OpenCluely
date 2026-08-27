const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const os = require('os');

class Logger {
  constructor() {
    this.logDir = path.join(os.homedir(), '.OpenCluely', 'logs');
    this.setupLogger();
  }

  setupLogger() {
    // Electron may outlive the terminal that launched `npm start`. Ignore a
    // closed stdout/stderr pipe so logging does not trigger an EPIPE exception
    // loop while file-based diagnostics remain available.
    for (const stream of [process.stdout, process.stderr]) {
      if (stream?.__openCluelyEpipeHandlerInstalled) continue;
      stream?.on('error', (error) => {
        if (error?.code !== 'EPIPE') return;
      });
      if (stream) stream.__openCluelyEpipeHandlerInstalled = true;
    }

    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, stack, service, ...meta }) => {
        const safeMeta = this.redactSensitiveValues(meta);
        const metaStr = Object.keys(safeMeta).length ? JSON.stringify(safeMeta, null, 2) : '';
        const serviceStr = service ? `[${service}]` : '';
        const stackStr = stack ? `\n${stack}` : '';
        return `${timestamp} ${level.toUpperCase()} ${serviceStr} ${message}${stackStr}${metaStr ? `\n${metaStr}` : ''}`;
      })
    );

    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: logFormat,
      defaultMeta: { pid: process.pid },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            logFormat
          ),
          stderrLevels: ['error', 'warn']
        }),
        new DailyRotateFile({
          filename: path.join(this.logDir, 'application-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d',
          level: 'info'
        }),
        new DailyRotateFile({
          filename: path.join(this.logDir, 'error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '30d',
          level: 'error'
        })
      ],
      exceptionHandlers: [
        new winston.transports.File({
          filename: path.join(this.logDir, 'exceptions.log')
        })
      ],
      rejectionHandlers: [
        new winston.transports.File({
          filename: path.join(this.logDir, 'rejections.log')
        })
      ]
    });
  }

  createServiceLogger(serviceName) {
    return {
      debug: (message, meta = {}) => this.logger.debug(message, { service: serviceName, ...meta }),
      info: (message, meta = {}) => this.logger.info(message, { service: serviceName, ...meta }),
      warn: (message, meta = {}) => this.logger.warn(message, { service: serviceName, ...meta }),
      error: (message, meta = {}) => this.logger.error(message, { service: serviceName, ...meta }),
      logPerformance: (operation, startTime, metadata = {}) => this.logPerformance(operation, startTime, { service: serviceName, ...metadata })
    };
  }

  getLogDirectory() {
    return this.logDir;
  }

  redactSensitiveValues(value, keyName = '') {
    // Keep timing fields such as `firstTokenMs` observable while continuing to
    // redact credential-shaped keys such as `accessToken` and `apiKey`.
    if (/(api.?key|subscription.?key|gemini.?key|azure.?key|secret|password|authorization|token(?:key|value)?$|(?:^|[_-])token(?:$|[_-]))/i.test(keyName)) {
      return '[REDACTED]';
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.redactSensitiveValues(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [
        key,
        this.redactSensitiveValues(item, key),
      ]));
    }
    return value;
  }

  redactText(text) {
    return String(text || '')
      .replace(/((?:GEMINI_API_KEY|AZURE_SPEECH_KEY|API_KEY|SUBSCRIPTION_KEY)\s*[=:]\s*)[^\s"']+/gi, '$1[REDACTED]')
      .replace(/("(?:geminiKey|azureKey|apiKey|accessToken|authorization)"\s*:\s*")[^"]*(")/gi, '$1[REDACTED]$2');
  }

  getSystemMetrics() {
    return {
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      platform: process.platform,
      nodeVersion: process.version
    };
  }

  logPerformance(operation, startTime, metadata = {}) {
    const duration = Date.now() - startTime;
    this.logger.info(`Performance: ${operation} completed`, {
      service: 'PERFORMANCE',
      duration: `${duration}ms`,
      ...metadata
    });
    return duration;
  }
}

module.exports = new Logger();
