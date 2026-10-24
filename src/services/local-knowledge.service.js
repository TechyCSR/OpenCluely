/**
 * Local Knowledge Service — Instant (<15ms) High-Impact Interview Knowledge Engine
 * 
 * Provides instantaneous, authentic, spoken-ready responses strictly grounded in
 * Jenil Soni's verified profile, production projects (ClinicOS, Vedprada, REC, AI CCTV),
 * and core engineering disciplines.
 * 
 * Engineered for bot interview NLP rubrics (HireVue, Talview, BarRaiser) and senior panels:
 *  - Spoken Launchpad (🗣️ Start with: "...") in direct 8th-to-10th grade spoken English
 *  - Left Column: Glance-and-Speak Talking Points with high-contrast bracketed [anchors]
 *  - Right Column: Practical Problem & Architecture Breakdown (The Problem, Architecture & Fix, Trade-off, Project Metric)
 */

const logger = require('../core/logger').createServiceLogger('LOCAL-KNOWLEDGE');

class LocalKnowledgeService {
  constructor() {
    this._knowledgeBase = this._initializeKnowledgeBase();
    logger.info('Local Knowledge Engine initialized with pre-compiled domain modules', {
      topicCount: this._knowledgeBase.length
    });
  }

  /**
   * Synthesize an instantaneous (<15ms) response to any interview question.
   * Runs 100% synchronously in memory without network dependency.
   */
  synthesizeInstantResponse(rawText, activeSkill = 'interview') {
    if (!rawText || typeof rawText !== 'string') {
      return this._generateGenericFallback('Technical Interview Question');
    }

    const cleanText = rawText.trim();
    const lower = cleanText.toLowerCase();

    // 1. Check exact or high-confidence domain match
    let bestMatch = null;
    let highestScore = 0;

    for (const item of this._knowledgeBase) {
      let score = 0;
      for (const pattern of item.patterns) {
        if (pattern instanceof RegExp) {
          if (pattern.test(lower)) score += 4;
        } else if (lower.includes(pattern.toLowerCase())) {
          score += 2;
        }
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = item;
      }
    }

    // 2. High-confidence match (score >= 4): Return pre-compiled rubric-grade answer
    // Must match a regex (+4) or multiple strong patterns (>= 4) to lock in an instant answer
    if (bestMatch && highestScore >= 4) {
      logger.info('Local Knowledge matched domain topic with high confidence', {
        topic: bestMatch.title,
        score: highestScore,
        preview: cleanText.substring(0, 60)
      });
      return {
        questionTitle: bestMatch.title,
        startWith: bestMatch.startWith,
        fullResponse: this._formatResponse(bestMatch),
        matchScore: highestScore,
        isHighConfidenceMatch: true,
        isInstant: true
      };
    }

    // 3. Novel or bespoke question: return null fullResponse so system does NOT
    // show a fake placeholder echoing the question. Remote LLM will produce tailored answer.
    let subject = cleanText
      .replace(/^(what is|what are|explain|can you explain|how does|how do|why do we use|tell me about|walk me through|how would you)\s+/i, '')
      .replace(/[\?\.\!]+$/, '')
      .trim();
    const title = subject.length > 36 ? subject.substring(0, 36) + '...' : (subject || 'Technical Question');

    return {
      questionTitle: title.charAt(0).toUpperCase() + title.slice(1),
      startWith: null,
      fullResponse: null,
      matchScore: highestScore,
      isHighConfidenceMatch: false,
      isInstant: false
    };
  }

  _formatResponse(item) {
    const lines = [];
    lines.push(`❓ Question: ${item.title}`);
    lines.push(`🗣️ Start with: "${item.startWith.replace(/^"|"$/g, '')}"`);
    lines.push(`⚡ Talking Points:`);
    for (const pt of item.talkingPoints) {
      lines.push(`• ${pt}`);
    }
    lines.push(`🎯 Architecture & Problem Breakdown:`);
    for (const kv of item.keyValuePairs) {
      lines.push(`• ${kv.key}: ${kv.value}`);
    }
    return lines.join('\n');
  }

  /**
   * Dynamic fallback generator that creates a perfectly structured 2-column answer
   * for any technical or behavioral question not explicitly mapped in the KB.
   */
  _generateDynamicSemanticResponse(rawQuestion, activeSkill) {
    // Extract subject/topic phrase
    let subject = rawQuestion
      .replace(/^(what is|what are|explain|can you explain|how does|how do|why do we use|tell me about|walk me through|how would you)\s+/i, '')
      .replace(/[\?\.\!]+$/, '')
      .trim();

    if (!subject || subject.length < 3) {
      subject = 'Engineering Solution';
    }

    const title = subject.length > 36 ? subject.substring(0, 36) + '...' : subject;
    const capitalizedSubject = subject.charAt(0).toUpperCase() + subject.slice(1);

    const isBehavioral = /conflict|challenge|mistake|failure|disagree|leadership|deadline|team|pressure/i.test(rawQuestion);
    const isCoding = /two sum|array|string|linked list|tree|graph|dynamic programming|complexity|dsa|algorithm|sliding window|search/i.test(rawQuestion);

    if (isBehavioral) {
      return {
        questionTitle: `Handling ${title}`,
        startWith: `In my project at Vedprada, I faced a situation where we had to deliver high-concurrency video delivery under tight deadlines with zero downtime.`,
        fullResponse: [
          `❓ Question: Handling ${title}`,
          `🗣️ Start with: "In my project at Vedprada, I faced a situation where we had to deliver high-concurrency video delivery under tight deadlines with zero downtime."`,
          `⚡ Talking Points:`,
          `• I focused on [root-cause communication] and breaking the problem into [actionable technical milestones].`,
          `• By implementing [automated testing workflows] and prioritizing [core system stability], we eliminated blockers early.`,
          `• The outcome was achieving [99.9% platform uptime] and reducing operational overhead by [70%].`,
          `🎯 Architecture & Problem Breakdown:`,
          `• 🚨 The Problem: Tight project turnaround with high-concurrency video broadcasting requirements and un-tested edge cases.`,
          `• 💡 Architecture & Fix: Aligned technical priorities, established clear rollback strategies, and automated repetitive deployment steps.`,
          `• ⚖️ Trade-off / Gotcha: Fast turnaround requires strict scope discipline; avoid adding non-critical features during high-risk rollouts.`,
          `• 🚀 Project Metric: Delivered the platform on schedule with zero downtime during peak live broadcasts across 100+ content streams.`
        ].join('\n'),
        matchScore: 1,
        isHighConfidenceMatch: false,
        isInstant: true
      };
    }

    if (isCoding) {
      return {
        questionTitle: `${capitalizedSubject} Approach`,
        startWith: `The most efficient way to approach this is by evaluating the space-time trade-off, using an auxiliary hash map or two-pointer strategy to avoid brute force.`,
        fullResponse: [
          `❓ Question: ${capitalizedSubject} Approach`,
          `🗣️ Start with: "The most efficient way to approach this is by evaluating the space-time trade-off, using an auxiliary hash map or two-pointer strategy to avoid brute force."`,
          `⚡ Talking Points:`,
          `• We first analyze the [brute force O(N²) baseline] and optimize it down to [O(N) linear time] or [O(log N) logarithmic].`,
          `• Using a [hash map for O(1) lookups] enables us to track visited elements and check complements in a single pass.`,
          `• We handle crucial edge cases such as [empty inputs], [duplicate entries], and [boundary overflow values].`,
          `🎯 Architecture & Problem Breakdown:`,
          `• 🚨 The Problem: Brute-force nested loops scale quadratically (O(N²)), crashing execution time on datasets with 100,000+ items.`,
          `• 💡 Architecture & Fix: Single-pass iteration paired with constant-time hash lookups or two-pointer array partitions.`,
          `• ⚖️ Trade-off / Gotcha: Trades O(N) auxiliary memory for speed. Edge cases include duplicate keys, negative values, and integer overflow.`,
          `• 🚀 Project Metric: Applied single-pass hash indexing logic in REC to achieve sub-second facial embedding matching.`
        ].join('\n'),
        matchScore: 1,
        isHighConfidenceMatch: false,
        isInstant: true
      };
    }

    // Default System/Technical Dynamic Response
    return {
      questionTitle: `${capitalizedSubject}`,
      startWith: `At a high level, ${subject} is designed to solve performance and maintainability bottlenecks by introducing clear abstraction and decoupling.`,
      fullResponse: [
        `❓ Question: ${capitalizedSubject}`,
        `🗣️ Start with: "At a high level, ${subject} is designed to solve performance and maintainability bottlenecks by introducing clear abstraction and decoupling."`,
        `⚡ Talking Points:`,
        `• The core purpose is providing [scalable, decoupled architecture] while reducing [runtime computational overhead].`,
        `• In production systems, we balance [throughput and latency] against [operational complexity and storage].`,
        `• In my ClinicOS and Vedprada platforms, adopting these principles reduced [query latency by over 80%].`,
        `🎯 Architecture & Problem Breakdown:`,
        `• 🚨 The Problem: Un-optimized, coupled architectures create severe latency bottlenecks and single points of failure under load.`,
        `• 💡 Architecture & Fix: Modular decoupling, strict interface contracts, and proactive resource pooling to ensure steady throughput.`,
        `• ⚖️ Trade-off / Gotcha: Extra abstraction requires disciplined observability and distributed logging to trace failure boundaries.`,
        `• 🚀 Project Metric: Applied in ClinicOS across 18+ PostgreSQL tables and 100+ endpoints with sub-20ms latency.`
      ].join('\n'),
      matchScore: 1,
      isHighConfidenceMatch: false,
      isInstant: true
    };
  }

  _generateGenericFallback(title) {
    return {
      questionTitle: title,
      startWith: `I approach this by analyzing the problem requirements first, evaluating the architectural trade-offs, and implementing a reliable, scalable solution.`,
      fullResponse: [
        `❓ Question: ${title}`,
        `🗣️ Start with: "I approach this by analyzing the problem requirements first, evaluating the architectural trade-offs, and implementing a reliable, scalable solution."`,
        `⚡ Talking Points:`,
        `• Focus on [scalability and maintainability] through modular design and strict data validation.`,
        `• Benchmark [performance trade-offs] using empirical profiling rather than premature optimization.`,
        `• Ensure [robust error boundaries] and automated testing across all integration points.`,
        `🎯 Architecture & Problem Breakdown:`,
        `• 🚨 The Problem: Rushing into code without architectural analysis creates unmaintainable systems and production regressions.`,
        `• 💡 Architecture & Fix: Modular architecture with strict unit and integration testing boundaries.`,
        `• ⚖️ Trade-off / Gotcha: Disciplined upfront design takes a few extra hours but eliminates weeks of debugging.`,
        `• 🚀 Project Metric: Implemented across ClinicOS and Vedprada delivering 99.9% uptime.`
      ].join('\n'),
      matchScore: 0,
      isHighConfidenceMatch: false,
      isInstant: true
    };
  }

  _initializeKnowledgeBase() {
    return [
      // ── 1. DATABASE INDEXING & POSTGRESQL ──
      {
        patterns: ['index', 'indexing', 'b-tree', 'btree', 'database index', 'database indexing', 'query optimization', 'explain analyze'],
        title: 'Database Indexing & B-Trees',
        startWith: 'Basically, think of a database index like the index at the back of a textbook—instead of scanning every single page from start to finish, the database jumps directly to the exact row in O(log N) time.',
        talkingPoints: [
          'An index builds a [B-Tree balanced tree] that stores [sorted leaf node pointers] pointing directly to table rows.',
          'Without an index, the engine does a [Sequential Table Scan], reading every single disk block into memory.',
          'I inspect query plans using [EXPLAIN ANALYZE] and create [compound indexes] on frequently filtered columns.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'Full table scans (O(N)) cause severe disk I/O spikes, locking queries and degrading API response times past 400ms under concurrent traffic.' },
          { key: 'Architecture & Fix', value: 'PostgreSQL B-Tree index maintains a balanced hierarchy of nodes, ensuring search, insertion, and deletion run in O(log N) time.' },
          { key: 'Trade-off / Gotcha', value: 'Every index adds write latency on INSERT/UPDATE/DELETE and consumes RAM. Never index low-cardinality boolean columns.' },
          { key: 'Project Metric', value: 'In ClinicOS, added compound indexes on (patient_id, appointment_date) across 18+ tables, slashing query latency from 420ms down to 18ms.' }
        ]
      },

      // ── 2. CONCURRENCY & DEADLOCKS ──
      {
        patterns: ['deadlock', 'deadlocks', 'concurrency', 'concurrent', 'lock', 'locking', 'race condition', 'mutex', 'transaction lock'],
        title: 'Handling Deadlocks & Concurrency',
        startWith: 'In simple terms, a deadlock happens when two transactions each hold a lock the other one needs, creating a complete standoff where neither can finish.',
        talkingPoints: [
          'A deadlock occurs when Transaction A locks Row 1 and wants Row 2, while Transaction B locks Row 2 and wants Row 1.',
          'The database detects deadlocks by running a [wait-for graph cycle check] and aborts the younger transaction.',
          'We prevent deadlocks by always acquiring table and row locks in a [strictly deterministic order].'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'Concurrent database writes block each other, causing connection pool exhaustion, request timeouts, and cascading backend failures.' },
          { key: 'Architecture & Fix', value: 'PostgreSQL MVCC (Multi-Version Concurrency Control) lets readers never block writers, while explicit deterministic locking prevents circular wait cycles.' },
          { key: 'Trade-off / Gotcha', value: 'Higher isolation levels like Serializable prevent race conditions but increase transaction abort and retry rates.' },
          { key: 'Project Metric', value: 'In ClinicOS, wrapped appointment bookings in atomic transactions with explicit row locking, eliminating double-booking with 0 deadlocks.' }
        ]
      },

      // ── 3. REDIS & CACHING STRATEGIES ──
      {
        patterns: ['redis', 'caching', 'cache', 'cache aside', 'invalidation', 'memcached', 'cache stampede', 'ttl'],
        title: 'Redis & Distributed Caching',
        startWith: 'Basically, caching is keeping your most frequently accessed data in ultra-fast RAM so your application doesn\'t have to hammer the database on every single request.',
        talkingPoints: [
          'Redis is an in-memory key-value data store that delivers [sub-millisecond lookups] directly from RAM.',
          'I use the [Cache-Aside pattern]: check Redis first; on a cache miss, query PostgreSQL, populate Redis, and return.',
          'Every cached key must have an explicit [TTL expiration time] to prevent stale data and memory leaks.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'High-traffic endpoints repeat identical expensive SQL queries, exhausting database connection pools and spiking server latency.' },
          { key: 'Architecture & Fix', value: 'Redis RAM clustering acts as a fast buffer, serving 90%+ of read requests in <2ms before traffic reaches the database.' },
          { key: 'Trade-off / Gotcha', value: 'Introduces cache invalidation complexity, cache stampede risks on expired keys, and eventual consistency lag.' },
          { key: 'Project Metric', value: 'In REC, cached 512-dimensional face embedding lookups in Redis, enabling sub-second attendee photo matching under heavy event loads.' }
        ]
      },

      // ── 4. SQL VS NOSQL ──
      {
        patterns: ['sql vs nosql', 'relational vs non relational', 'nosql', 'when to use nosql', 'postgres vs mongo', 'mongodb vs postgres'],
        title: 'SQL vs NoSQL Architecture',
        startWith: 'In simple terms, SQL databases are structured, relational, and enforce ACID transactions, while NoSQL databases are schema-flexible and optimized for horizontal scaling and unstructured data.',
        talkingPoints: [
          'I choose SQL like [PostgreSQL] when we need [strict relational integrity], ACID guarantees, and complex [multi-table JOIN queries].',
          'I choose NoSQL like [MongoDB or Redis] for [dynamic polymorphic schemas], high-write document ingestion, and distributed key-value caching.',
          'In my ClinicOS project, we used PostgreSQL for medical records and patient billing where [zero data corruption] is mandatory.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'NoSQL lacks strict referential integrity for relational data; rigid SQL schemas can slow down prototyping unstructured event logs.' },
          { key: 'Architecture & Fix', value: 'Use a polyglot architecture: PostgreSQL for transactional truth and relational foreign keys, paired with Redis for transient session caching.' },
          { key: 'Trade-off / Gotcha', value: 'SQL schema migrations require careful downtime planning; NoSQL trades strict ACID consistency for partition tolerance.' },
          { key: 'Project Metric', value: 'In ClinicOS, structured 18+ normalized tables in PostgreSQL with strict RBAC/ABAC authorization boundaries and sub-20ms query latency.' }
        ]
      },

      // ── 5. REST VS GRAPHQL ──
      {
        patterns: ['rest vs graphql', 'graphql', 'rest api', 'restful', 'api design', 'graphql vs rest'],
        title: 'REST vs GraphQL API Design',
        startWith: 'The simplest way to think about it is that REST gives you fixed menus at specific endpoints, while GraphQL lets the client order customized buffets with exact fields in one request.',
        talkingPoints: [
          'REST uses standard [HTTP verbs and status codes] with native [HTTP proxy caching], making it simple and predictable.',
          'GraphQL avoids [over-fetching and under-fetching] by letting frontend clients query exact JSON schemas in [one single POST request].',
          'However, GraphQL pushes complexity to the server with [N+1 database query waterfalls] unless you use DataLoader batching.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'Mobile clients on REST make multiple sequential API round-trips to fetch nested data, burning mobile data and battery.' },
          { key: 'Architecture & Fix', value: 'GraphQL single-endpoint schema resolvers consolidate queries; DataLoader batches SQL lookups into single WHERE IN statements.' },
          { key: 'Trade-off / Gotcha', value: 'GraphQL makes CDN-level HTTP caching and API rate limiting significantly harder compared to standard REST endpoints.' },
          { key: 'Project Metric', value: 'In ClinicOS, designed 100+ clean REST endpoints with strict OpenAPI specs and RBAC authorization, keeping endpoint latency <25ms.' }
        ]
      },

      // ── 6. MICROSERVICES VS MONOLITH ──
      {
        patterns: ['microservice', 'microservices', 'monolith', 'microservices vs monolith', 'monolithic', 'distributed system', 'service oriented'],
        title: 'Microservices vs Monolithic Architecture',
        startWith: 'The way I look at it, a monolith is like having your entire team in one room where communication is instant, while microservices gives each team their own office so they can scale independently at the cost of network overhead.',
        talkingPoints: [
          'Monoliths are unbeatable for [rapid prototyping], single-codebase debugging, and [single-transaction ACID consistency].',
          'Microservices allow [independent service deployments], isolated scaling, and localized failure domains for large engineering teams.',
          'But microservices introduce distributed network complexity: [network latency], service discovery, and [eventual consistency].'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'As engineering teams grow past 20+ devs, a monolithic codebase creates deployment bottlenecks, merge conflicts, and whole-app outages from single bugs.' },
          { key: 'Architecture & Fix', value: 'Split by domain boundaries behind an API Gateway, using asynchronous message queues (Kafka/RabbitMQ) for decoupled communication.' },
          { key: 'Trade-off / Gotcha', value: 'Distributed transactions require Saga patterns and distributed tracing (OpenTelemetry). Never start with microservices before product-market fit.' },
          { key: 'Project Metric', value: 'In Vedprada, decoupled live video streaming ingestion from the CMS admin backend, maintaining 99.9% uptime during broadcast spikes.' }
        ]
      },

      // ── 7. COMPUTER VISION & ONNX / YOLO ──
      {
        patterns: ['yolo', 'onnx', 'computer vision', 'opencv', 'object detection', 'model optimization', 'tensorrt', 'mediapipe'],
        title: 'AI Computer Vision & Inference Optimization',
        startWith: 'In simple terms, model optimization is about making your AI vision models run as fast and lightweight as possible without losing detection accuracy.',
        talkingPoints: [
          'Raw PyTorch models are heavy; converting them to [ONNX Runtime format] compiles the model into an [optimized execution graph].',
          'I apply [FP16 half-precision quantization], which cuts weight sizes by 50% with [virtually zero accuracy drop].',
          'In production, we decouple [OpenCV video frame decoding] from neural network inference using asynchronous worker threads.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'Running 6 concurrent YOLO models on raw PyTorch spikes GPU VRAM and causes frame latency to exceed 300ms, dropping video frames.' },
          { key: 'Architecture & Fix', value: 'Export PyTorch weights to ONNX with TensorRT execution provider, batching frames across worker threads to keep GPU pipelines saturated.' },
          { key: 'Trade-off / Gotcha', value: 'INT8 quantization requires calibration datasets to avoid accuracy drift; preprocessing on the main UI thread will freeze the application.' },
          { key: 'Project Metric', value: 'In AI CCTV Surveillance, optimized 6 concurrent vision models down to <100ms per frame with 95%+ detection accuracy.' }
        ]
      },

      // ── 8. WEBSOCKETS VS SSE VS LONG POLLING ──
      {
        patterns: ['websocket', 'websockets', 'sse', 'server sent events', 'real time', 'polling', 'long polling'],
        title: 'Real-Time Communication Protocols',
        startWith: 'Basically, WebSockets provide a persistent, bidirectional phone call between client and server, whereas Server-Sent Events allow the server to push updates in one direction over standard HTTP.',
        talkingPoints: [
          'WebSockets establish a [single persistent TCP connection] via an initial HTTP handshake, enabling [instant bi-directional messaging].',
          'For scenarios that only require server-to-client streaming, [Server-Sent Events (SSE)] run over standard HTTP with native browser reconnect.',
          'WebSockets eliminate [HTTP header overhead] on high-frequency messages, making them ideal for chat, live audio, and gaming.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'HTTP polling bombards the server with thousands of empty requests per minute, creating connection churn and wasted bandwidth.' },
          { key: 'Architecture & Fix', value: 'WebSockets for two-way interactive traffic (chat, collaborative editing); SSE for unidirectional live data feeds (LLM token streaming, status updates).' },
          { key: 'Trade-off / Gotcha', value: 'WebSockets require stateful sticky sessions or a distributed Redis Pub/Sub backplane when scaling horizontally across multiple servers.' },
          { key: 'Project Metric', value: 'In Vedprada, used WebSockets for live chat and SSE for real-time broadcast status updates during high-concurrency live events.' }
        ]
      },

      // ── 9. NODE.JS EVENT LOOP & ASYNCHRONOUS I/O ──
      {
        patterns: ['event loop', 'node js event loop', 'single threaded', 'async await', 'promise', 'libuv', 'non blocking'],
        title: 'Node.js Event Loop & Non-Blocking I/O',
        startWith: 'In simple words, Node.js runs JavaScript on a single thread using an event loop backed by libuv to handle thousands of concurrent I/O operations non-blockingly.',
        talkingPoints: [
          'The event loop executes in phases: [timers, pending callbacks, poll, check, and close], processing async tasks seamlessly.',
          'Heavy asynchronous I/O like disk and network requests are offloaded to [libuv thread pool worker threads].',
          'A critical rule is to [never block the event loop] with expensive CPU-bound algorithms; offload those to worker threads or microservices.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'A single CPU-heavy function (like image resizing or crypto hashing) on the main thread freezes all other concurrent incoming requests.' },
          { key: 'Architecture & Fix', value: 'Event loop processes non-blocking I/O events cooperatively; heavy computations are delegated to Node.js Worker Threads.' },
          { key: 'Trade-off / Gotcha', value: 'Node.js excels at high-throughput I/O-bound web APIs with minimal RAM, but is ill-suited for monolithic in-process numerical processing.' },
          { key: 'Project Metric', value: 'In ClinicOS, handled 100+ concurrent REST endpoints non-blockingly using Express.js async handlers with sub-25ms response times.' }
        ]
      },

      // ── 10. DOCKER & CONTAINERIZATION ──
      {
        patterns: ['docker', 'container', 'containers', 'kubernetes', 'containerization', 'k8s', 'ci/cd', 'docker compose'],
        title: 'Docker & Containerization Architecture',
        startWith: 'In simple words, Docker packages your application code, dependencies, and runtime environment into an immutable container so it runs identically on any machine.',
        talkingPoints: [
          'Containers share the [host OS kernel] rather than virtualizing full operating systems, making them [lightweight and fast to start].',
          'I use [multi-stage Docker builds] to compile dependencies in a builder stage and output a [minimal Alpine production image].',
          'In my projects, Docker eliminates the classic [works on my machine] problem and enables repeatable CI/CD deployment pipelines.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'Environmental drift between developer laptops, staging servers, and production creates silent runtime bugs and dependency hell.' },
          { key: 'Architecture & Fix', value: 'Immutable container images built via multi-stage Dockerfiles guarantee exact dependency and OS library parity across all environments.' },
          { key: 'Trade-off / Gotcha', value: 'Container layers must be optimized to keep images small; always run processes as non-root users to prevent container breakouts.' },
          { key: 'Project Metric', value: 'In REC, containerized the 2-node photography platform with Docker Compose, enabling instant event deployment with zero configuration.' }
        ]
      },

      // ── 11. SYSTEM DESIGN & HORIZONTAL SCALABILITY ──
      {
        patterns: ['scalability', 'horizontal scaling', 'load balancer', 'scale', 'high availability', 'cap theorem', 'stateless'],
        title: 'High Availability & System Scalability',
        startWith: 'Basically, scaling is about designing your system so it handles 10x or 100x traffic increases without crashing or degrading response times.',
        talkingPoints: [
          'I prioritize [horizontal scaling] by designing stateless application servers behind a [Layer 7 load balancer] like NGINX.',
          'To scale the database layer, we implement [read replicas] for query offloading and [Redis caching] for hot data.',
          'Under the [CAP Theorem], distributed systems must balance consistency against partition tolerance during network partitions.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'Vertical scaling (bigger servers) hits hardware limits and creates massive single points of failure that cause total outages.' },
          { key: 'Architecture & Fix', value: 'Stateless web application servers behind round-robin load balancers, with shared state delegated to distributed Redis and PostgreSQL.' },
          { key: 'Trade-off / Gotcha', value: 'Stateless servers require centralizing user sessions in Redis; database write scalability requires connection pooling and sharding.' },
          { key: 'Project Metric', value: 'In Vedprada, maintained 99.9% uptime during high-concurrency broadcast spikes with 100+ live streaming content assets.' }
        ]
      },

      // ── 12. BEHAVIORAL: TELL ME ABOUT YOURSELF ──
      {
        patterns: [
          /^(tell me about yourself|introduce yourself|walk me through your resume|who are you)\b/i,
          /\b(tell me about your background|give me an overview of your background|share your background)\b/i,
          'tell me about yourself', 'walk me through your resume', 'introduce yourself'
        ],
        title: 'Candidate Introduction (Jenil Soni)',
        startWith: "I'm a software engineer passionate about building real-world solutions at the intersection of backend systems, computer vision, and scalable web architectures.",
        talkingPoints: [
          "I am pursuing my [B.Tech in Computer Engineering at Indus University] with an [SGPA of 9.25], focusing on high-performance backend systems.",
          "I have engineered production platforms like [ClinicOS], a multi-tenant clinic management system with 18+ PostgreSQL tables, and [Vedprada], managing 100+ content assets.",
          "I have also built AI systems like [AI CCTV Surveillance] using YOLOv8 and ONNX Runtime, and [REC] for instant facial retrieval."
        ],
        keyValuePairs: [
          { key: 'Core Focus', value: 'FastAPI, Express.js, PostgreSQL, Redis, React, and ONNX Runtime AI optimization.' },
          { key: 'Technical Mindset', value: 'Pragmatic, metrics-driven, and focused on clean architecture with sub-20ms latency profiles.' },
          { key: 'Team Collaboration', value: 'De-escalate debates with empirical benchmarks, write clear API documentation, and automate repetitive workflows.' },
          { key: 'Production Track Record', value: 'Shipped 11+ deployed applications, reducing operational overhead by 70% and cutting query latencies by 80%+.' }
        ]
      },

      // ── 13. BEHAVIORAL: GREATEST CHALLENGE / OUTAGE ──
      {
        patterns: ['greatest challenge', 'difficult challenge', 'technical challenge', 'biggest obstacle', 'production bug', 'outage', 'production issue', 'migration', 'under pressure', 'pressure', 'tight deadline', 'deadline', 'difficult situation', 'high-stakes'],
        title: 'Resolving Production Latency Bottleneck',
        startWith: 'In my Vedprada platform, we experienced severe backend latency managing over 100 live content streams during high-concurrency broadcast events.',
        talkingPoints: [
          'The [root cause analysis] revealed that un-cached database queries and missing [connection pool tuning] were causing [server response bottlenecks].',
          'I implemented an [automated ingestion pipeline] and integrated [Redis cache clustering] to handle high-frequency requests.',
          'This dropped [operational overhead by 70%] and maintained [99.9% broadcast uptime] during live user spikes.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: '100+ concurrent broadcast streams exhausted backend server connections, causing API response times to spike past 3 seconds during live events.' },
          { key: 'Architecture & Fix', value: 'Integrated Redis caching for metadata lookups, implemented connection pool sizing, and automated content ingestion pipelines.' },
          { key: 'Trade-off / Gotcha', value: 'In a live outage, never deploy un-tested architectural rewrites; apply targeted caching buffers and monitor error rates with health probes.' },
          { key: 'Project Metric', value: 'Slashed operational overhead by 70%, maintained 99.9% uptime throughout the peak event, and prevented future streaming bottlenecks.' }
        ]
      },

      // ── 14. BEHAVIORAL: DISAGREEMENT / CONFLICT ──
      {
        patterns: ['conflict', 'disagreement', 'disagreed with teammate', 'handled disagreement', 'different opinion', 'conflict resolution'],
        title: 'Resolving Technical Disagreements with Data',
        startWith: 'Whenever I encounter a technical disagreement on an engineering team, I focus on objective benchmarks and trade-off matrices rather than personal preferences.',
        talkingPoints: [
          'When choosing between a [relational schema vs document store] on a recent project, our team had conflicting opinions on flexibility vs integrity.',
          'I built a quick [proof-of-concept benchmark] simulating our expected query volume and demonstrated the [ACID integrity risks] of un-normalized documents.',
          'By reviewing the empirical results together, the team [reached full consensus] on PostgreSQL with zero interpersonal friction.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'Architectural disagreements can stall sprint velocity and create interpersonal friction if decisions are based on subjective personal opinions.' },
          { key: 'Architecture & Fix', value: 'Create an objective evaluation matrix comparing latency, developer velocity, maintenance overhead, and failure modes.' },
          { key: 'Trade-off / Gotcha', value: 'Avoid analysis paralysis—set a strict 2-hour timebox for proof-of-concept benchmarks so the team can commit and move forward.' },
          { key: 'Project Metric', value: 'The team unanimously agreed on PostgreSQL, resulting in 0 data integrity regressions across 18+ normalized tables in production.' }
        ]
      },

      // ── 15. DSA: TWO SUM / HASH MAPS ──
      {
        patterns: ['two sum', 'find pair', 'hash table array', 'target sum', 'add up to target', 'two numbers', 'pair sum', 'indices of two'],
        title: 'Two Sum Array Problem',
        startWith: 'The best way to solve this is using a hash map so we can look up complements in O(1) time and solve it in a single O(N) pass.',
        talkingPoints: [
          'We iterate through the array once and check if the [required target complement] is already present in our [hash table].',
          'As soon as we find a match, we return the [pair indices] immediately with [O(1) constant time lookup].',
          'Time complexity is [O(N) single pass] and space complexity is [O(N)], which is optimal compared to the [O(N²) brute-force approach].'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'Brute force nested loops (O(N²)) compare every pair against every other pair, timing out on arrays with 100,000+ elements.' },
          { key: 'Architecture & Fix', value: 'Hash table lookup provides constant-time O(1) access by hashing values into bucket arrays, eliminating the inner loop.' },
          { key: 'Trade-off / Gotcha', value: 'Trades O(N) auxiliary memory for speed. Edge cases include duplicate values, negative numbers, and target complement matching itself.' },
          { key: 'Project Metric', value: 'Applied this single-pass hash indexing logic in the REC platform to match 512-dim face embeddings in sub-second latency.' }
        ]
      },

      // ── 16. INTRODUCE YOURSELF / BACKGROUND ──
      {
        patterns: ['tell me about yourself', 'introduce yourself', 'walk me through your resume', 'your background', 'who are you', 'tell us about yourself', 'brief introduction'],
        title: 'Candidate Introduction & Background',
        startWith: 'Sure! I am a software engineer specializing in backend systems and computer vision AI, currently completing my B.Tech in Computer Engineering at Indus Institute with a 9.25 SGPA.',
        talkingPoints: [
          'I focus on engineering production systems that pair [scalable Node.js and FastAPI backends] with [high-performance AI computer vision models].',
          'At [Vedprada], I architected a spiritual learning platform with live video delivery, reducing [manual operational overhead by 70%].',
          'I also built [ClinicOS], a 100+ endpoint clinic management platform, and [REC], a distributed instant face retrieval platform using [512-dimensional vector embeddings].'
        ],
        keyValuePairs: [
          { key: 'Core Stack', value: 'Node.js, Express.js, FastAPI, PostgreSQL, Redis, PyTorch, YOLOv8, ONNX Runtime, React.' },
          { key: 'Production Experience', value: '11+ applications deployed to production, 100+ REST API endpoints, and 99.9% uptime architectures.' },
          { key: 'Project Metric', value: 'Reduced manual operations by 70% at Vedprada; reduced billing processing time by 80% at Manjushri.' },
          { key: 'Engineering Mindset', value: 'Pragmatic, metrics-driven architecture with zero-trust security and sub-20ms query latency.' }
        ]
      },

      // ── 17. WHY SHOULD WE HIRE YOU ──
      {
        patterns: ['why should we hire you', 'why hire you', 'what makes you unique', 'why do you want this role', 'why are you the best candidate', 'why join us'],
        title: 'Why Should We Hire You',
        startWith: 'You should hire me because I don\'t just write backend code—I engineer production-grade systems end-to-end with deep expertise in both low-latency APIs and AI computer vision.',
        talkingPoints: [
          'I bring a proven track record of shipping [11+ production applications] that handle real traffic and generate tangible business value.',
          'I excel at taking complex technical requirements and translating them into [clean, modular, observable microservices].',
          'I work with deep engineering discipline—prioritizing [sub-20ms database queries], zero-trust security, and high reliability.'
        ],
        keyValuePairs: [
          { key: 'Key Advantage', value: 'Full-stack breadth with specialized depth in backend architecture and AI/CV inference optimization.' },
          { key: 'Speed to Value', value: 'Experienced in taking systems from initial architecture to production deployment rapidly.' },
          { key: 'Reliability Focus', value: 'Implemented RBAC/ABAC security, automated CI/CD, and structured error handling across all platforms.' },
          { key: 'Measurable Impact', value: 'Automated billing reduced processing time by 80% at Manjushri; 99.9% streaming uptime at Vedprada.' }
        ]
      },

      // ── 18. STRENGTHS & WEAKNESSES ──
      {
        patterns: ['strength', 'strengths', 'weakness', 'weaknesses', 'greatest strength', 'greatest weakness', 'areas for improvement'],
        title: 'Strengths and Weaknesses',
        startWith: 'My greatest technical strength is systemic debugging and backend optimization—I love digging into database query plans, connection pools, and latency profiles to eliminate bottlenecks.',
        talkingPoints: [
          'For my weakness, in earlier projects I sometimes [spent too long perfecting initial architecture] before getting feedback from users.',
          'To solve this, I adopted a strict [iterative milestone workflow], shipping minimal viable vertical slices and iterating rapidly based on metrics.',
          'This disciplined balance between [high architectural standards] and [rapid delivery] proved critical when delivering Vedprada.'
        ],
        keyValuePairs: [
          { key: 'Core Strength', value: 'Root-cause debugging, PostgreSQL indexing, and low-latency API design.' },
          { key: 'Constructive Weakness', value: 'Early tendency toward perfectionism, actively mitigated by rapid iteration cadences.' },
          { key: 'Mitigation Strategy', value: 'Time-boxed spike solutions and continuous user feedback loops.' },
          { key: 'Project Example', value: 'Delivered Manjushri automated billing platform in tight turnaround times by prioritizing core workflows first.' }
        ]
      },

      // ── 19. CI/CD & DEVOPS AUTOMATION ──
      {
        patterns: ['ci cd', 'continuous integration', 'continuous deployment', 'github actions', 'deployment pipeline', 'how do you deploy', 'devops workflow', 'deploy to production', 'automated testing pipeline'],
        title: 'CI/CD Pipelines & DevOps Automation',
        startWith: 'Basically, an effective CI/CD pipeline automates testing, containerization, and deployment so code moves safely from pull request to production with zero manual downtime.',
        talkingPoints: [
          'On every pull request, [GitHub Actions runs linting, unit tests, and security scans] before code can merge into main.',
          'Once merged, a docker build triggers to produce an [immutable container image] pushed to the container registry.',
          'In my production projects, this automated pipeline [prevented regression bugs] and enabled confident multi-deployment cycles per week.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'Manual deployment causes human configuration errors, untested regressions, and risky multi-hour maintenance windows.' },
          { key: 'Architecture & Fix', value: 'Trunk-based development with GitHub Actions pipeline: ESLint/Jest verification, Docker image build, and blue-green zero-downtime container rollout.' },
          { key: 'Trade-off / Gotcha', value: 'Flaky end-to-end tests can block deployments; keep CI unit test suites fast (under 3 minutes) with parallel worker runners.' },
          { key: 'Project Metric', value: 'Deployed 11+ production applications with automated CI/CD workflows, reducing release turnaround times by over 75%.' }
        ]
      },

      // ── 20. AUTHENTICATION & JWT ──
      {
        patterns: ['jwt', 'authentication', 'auth', 'jwt vs session', 'token based auth', 'oauth', 'oauth2', 'refresh token', 'access token'],
        title: 'Authentication & JWT Token Security',
        startWith: 'Basically, sessions store user state on the server in a cache like Redis, while JWTs are stateless cryptographically signed tokens stored on the client.',
        talkingPoints: [
          '[Stateless JWT tokens] eliminate server session lookups, making them ideal for distributed microservices and mobile APIs.',
          'However, JWTs [cannot be revoked instantly] without a token blacklist, whereas [server sessions] allow instant remote revocation.',
          'In ClinicOS, I used [short-lived JWT access tokens] (15 mins) paired with [httpOnly refresh tokens stored in Redis] for maximum security.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'Long-lived stateless JWTs cannot be revoked if stolen, creating critical credential exposure windows.' },
          { key: 'Architecture & Fix', value: 'Dual-token pattern: 15-minute access JWT in memory + rotating refresh token stored in secure httpOnly cookie.' },
          { key: 'Trade-off / Gotcha', value: 'Storing JWTs in localStorage exposes them to XSS attacks. Always use httpOnly, Secure, SameSite=Strict cookies.' },
          { key: 'Project Metric', value: 'Secured 100+ endpoints in ClinicOS with role-based access control (RBAC), completely preventing unauthorized access.' }
        ]
      },

      // ── 21. RATE LIMITING ──
      {
        patterns: ['rate limit', 'rate limiting', 'rate limiter', 'token bucket', 'leaky bucket', 'sliding window', 'throttle', 'throttling'],
        title: 'Rate Limiting Algorithms & Architecture',
        startWith: 'Rate limiting protects your backend APIs from brute-force attacks, abusive traffic, and accidental denial of service by throttling excessive requests.',
        talkingPoints: [
          'The [Token Bucket algorithm] adds tokens at a constant rate, allowing brief traffic bursts while strictly enforcing an average throughput cap.',
          'The [Sliding Window Counter algorithm] tracks request timestamps in a sorted set (like Redis ZSET) to eliminate burst boundary exploits.',
          'In my Express and FastAPI backends, I implement [Redis-backed sliding window rate limiters] partitioned by client IP or API key.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'Without rate limiting, malicious bots or runaway retry loops overwhelm database connection pools and crash web servers.' },
          { key: 'Architecture & Fix', value: 'Redis atomic pipeline executing sliding window checks in <1ms, returning HTTP 429 Too Many Requests when limits trip.' },
          { key: 'Trade-off / Gotcha', value: 'Fixed window counters can allow 2x traffic bursts at boundary intervals. Use sliding window log or token bucket instead.' },
          { key: 'Project Metric', value: 'Protected 100+ REST endpoints in ClinicOS with 100 req/min thresholds, preventing API scraping with zero false positives.' }
        ]
      },

      // ── 22. MESSAGE QUEUES & KAFKA ──
      {
        patterns: ['kafka', 'message queue', 'message broker', 'rabbitmq', 'pub sub', 'event driven', 'async worker', 'background jobs'],
        title: 'Message Queues & Event-Driven Architecture',
        startWith: 'Message queues decouple fast producers from slow consumers, ensuring that sudden traffic spikes are buffered safely instead of crashing your backend services.',
        talkingPoints: [
          '[RabbitMQ or Redis Streams] excel at [task queue work distribution] where messages are consumed once and acknowledged.',
          '[Apache Kafka] is a distributed append-only commit log designed for [massive event streaming] with high-throughput replayability.',
          'In my video analytics and billing systems, I offload [heavy image processing and invoice generation] to background worker queues.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'Processing long-running tasks in the HTTP request thread causes gateway 504 timeouts and connection pool exhaustion.' },
          { key: 'Architecture & Fix', value: 'HTTP handler returns HTTP 202 Accepted immediately with a Job ID, pushing payload to background worker queue.' },
          { key: 'Trade-off / Gotcha', value: 'Asynchronous processing introduces eventual consistency; clients must poll or listen via WebSockets for job completion.' },
          { key: 'Project Metric', value: 'At Manjushri, background invoice processing eliminated UI freeze, generating GST invoices in under 1 second without blocking.' }
        ]
      },

      // ── 23. SYSTEM DESIGN: URL SHORTENER ──
      {
        patterns: ['url shortener', 'tinyurl', 'bitly', 'design url shortener', 'shorten url', 'base62'],
        title: 'System Design: Scalable URL Shortener',
        startWith: 'To design a scalable URL shortener like TinyURL, we need a high-read low-latency system that maps 7-character Base62 hashes to long URLs.',
        talkingPoints: [
          'Using [Base62 encoding] (a-z, A-Z, 0-9), a 7-character string provides [62^7 = 3.5 trillion unique URLs], easily handling decades of traffic.',
          'We avoid collisions by using an [auto-incrementing distributed ID generator] (like Snowflake or Redis INCR) and converting the 64-bit integer to Base62.',
          'Because URL shorteners have a [100:1 read-to-write ratio], we aggressively cache hot URLs in [Redis using LRU eviction] for sub-5ms redirects.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'Generating random hashes causes frequent DB collision checks (O(N)), slowing write throughput.' },
          { key: 'Architecture & Fix', value: 'Distributed Snowflake ID generator + Base62 conversion + Redis LRU cache + PostgreSQL partitioned storage.' },
          { key: 'Trade-off / Gotcha', value: 'HTTP 301 Permanent Redirect saves server traffic via browser cache, but HTTP 302 Temporary Redirect is required for analytics tracking.' },
          { key: 'Project Metric', value: 'Architected with 99% cache hit ratio in Redis, delivering redirect lookups in under 4ms under simulated 10,000 RPS.' }
        ]
      },

      // ── 24. REACT PERFORMANCE & VIRTUAL DOM ──
      {
        patterns: ['virtual dom', 'react performance', 'usememo', 'usecallback', 'react re render', 'reconciliation', 'react optimization', 'react.memo'],
        title: 'React Virtual DOM & Performance Optimization',
        startWith: 'The Virtual DOM is a lightweight JavaScript representation of the real DOM tree in memory; React updates the UI by diffing the virtual tree and executing the minimal set of real DOM mutations.',
        talkingPoints: [
          'React\'s [Fiber reconciliation algorithm] uses a heuristic O(N) diffing engine with unique [keys] to determine what actually changed.',
          'We avoid unnecessary re-renders using [React.memo], [useMemo] for expensive computations, and [useCallback] for stable function references.',
          'In high-throughput dashboards, I virtualize long lists using [react-window] so only visible DOM nodes are rendered in memory.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'Direct DOM manipulation triggers expensive browser layout reflows and paint recalculations, causing 60fps frame drops and stutter.' },
          { key: 'Architecture & Fix', value: 'In-memory Virtual DOM diffing + component memoization + DOM node virtualization for large collections.' },
          { key: 'Trade-off / Gotcha', value: 'Overusing useMemo on trivial expressions introduces garbage collection overhead that exceeds the cost of re-rendering.' },
          { key: 'Project Metric', value: 'Optimized ClinicOS patient queue interface, eliminating re-renders and maintaining a butter-smooth 60fps across 500+ records.' }
        ]
      },

      // ── 25. COMPUTER VISION & ONNX OPTIMIZATION ──
      {
        patterns: ['onnx', 'tensorrt', 'fp16', 'quantization', 'yolov8', 'opencv', 'inference latency', 'cctv', 'surveillance', 'model optimization'],
        title: 'AI Computer Vision & ONNX Optimization',
        startWith: 'In my AI CCTV surveillance platform, I optimized 6 concurrent vision models by converting heavy PyTorch models into ONNX Runtime with FP16 quantization, cutting frame latency from 300ms to under 100ms.',
        talkingPoints: [
          'Raw PyTorch models carry significant Python runtime overhead and unoptimized CUDA kernel launches.',
          '[ONNX Runtime] provides [hardware-specific graph optimizations], constant folding, and multi-threaded tensor execution.',
          'I also decoupled [video frame decoding from model inference] using worker thread queues so the CPU decoding pipeline never stalls the GPU.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'Processing 6 high-definition CCTV streams on standard PyTorch exceeded 300ms per frame, causing real-time buffer overflow.' },
          { key: 'Architecture & Fix', value: 'ONNX Runtime graph execution + FP16 precision quantization + multi-threaded frame queue ingestion.' },
          { key: 'Trade-off / Gotcha', value: 'INT8 quantization can cause accuracy degradation on small objects. FP16 maintains 95%+ accuracy with 2.5x speedup.' },
          { key: 'Project Metric', value: 'Successfully maintained 95%+ detection accuracy across 15+ automated security rules with <100ms latency per frame.' }
        ]
      },

      // ── 26. DATABASE TRANSACTIONS & ACID GUARANTEES ──
      {
        patterns: ['acid', 'database transaction', 'transactions', 'isolation levels', 'read committed', 'dirty read', 'phantom read', 'atomicity'],
        title: 'Database Transactions & ACID Guarantees',
        startWith: 'Basically, ACID transactions ensure that multiple database operations either succeed completely or roll back entirely with zero data corruption.',
        talkingPoints: [
          '[Atomicity and Consistency] guarantee that money or patient status changes never get half-written if a network glitch occurs.',
          'PostgreSQL uses [Multiversion Concurrency Control (MVCC)], allowing reads to never block writes and writes to never block reads.',
          'In my ClinicOS platform, we wrap [patient billing and appointment reservation in explicit SQL transactions] to prevent race conditions.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'Concurrent requests creating duplicate bookings or partial financial ledger entries without atomic boundaries.' },
          { key: 'Architecture & Fix', value: 'Explicit BEGIN/COMMIT transaction blocks with Read Committed isolation and row-level SELECT FOR UPDATE locking.' },
          { key: 'Trade-off / Gotcha', value: 'Serializable isolation eliminates all anomalies but triggers serialization retry errors under high write concurrency.' },
          { key: 'Project Metric', value: 'Handled 100+ secure endpoints in ClinicOS with zero financial anomalies or double-booking states across 18+ tables.' }
        ]
      },

      // ── 27. WEB SECURITY & OWASP DEFENSE ──
      {
        patterns: ['owasp', 'web security', 'sql injection', 'xss', 'csrf', 'security best practices', 'how do you secure', 'rbac', 'abac'],
        title: 'Web Application Security & OWASP Defense',
        startWith: 'In my production systems, security is layered: parameterized database queries eliminate SQL injection, strict CORS and CSP prevent cross-site attacks, and RBAC governs all endpoints.',
        talkingPoints: [
          'We completely eliminate [SQL Injection] by using [parameterized queries and ORM prepared statements] rather than string concatenation.',
          'For authorization, I implement [Role-Based and Attribute-Based Access Control] so doctors, receptionists, and patients only see their authorized tenant scope.',
          'All sensitive credentials and secrets are managed via [environment variables] with token expiration and cryptographic HMAC signing.'
        ],
        keyValuePairs: [
          { key: 'The Problem', value: 'Injection attacks, broken access control, and unauthorized tenant data leaks in multi-user platforms.' },
          { key: 'Architecture & Fix', value: 'Parameterized queries + tenant-scoped middleware + bcrypt password hashing + httpOnly Secure SameSite cookies.' },
          { key: 'Trade-off / Gotcha', value: 'Overly restrictive CSP policies can break legitimate external scripts; test CSP headers in report-only mode first.' },
          { key: 'Project Metric', value: 'Enforced multi-tenant isolation with RBAC/ABAC across 100+ endpoints in ClinicOS with zero medical privacy leaks.' }
        ]
      }
    ];
  }
}

module.exports = new LocalKnowledgeService();
