/**
 * Tests for tracer factory and instrumentation helpers
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock @opentelemetry/api before importing modules
vi.mock('@opentelemetry/api', () => {
	const mockSpan = {
		setAttribute: vi.fn(),
		setStatus: vi.fn(),
		recordException: vi.fn(),
		end: vi.fn(),
	};

	const mockTracer = {
		startSpan: vi.fn(() => mockSpan),
		startActiveSpan: vi.fn((name: string, options: unknown, fn: (span: typeof mockSpan) => unknown) => {
			return fn(mockSpan);
		}),
	};

	return {
		trace: {
			getTracer: vi.fn(() => mockTracer),
			getActiveSpan: vi.fn(() => mockSpan),
			setSpan: vi.fn((_ctx: unknown, _span: unknown) => ({})),
		},
		context: {
			active: vi.fn(() => ({})),
			with: vi.fn((_ctx: unknown, fn: () => unknown) => fn()),
		},
		SpanStatusCode: {
			OK: 1,
			ERROR: 2,
		},
		SpanKind: {
			INTERNAL: 0,
			SERVER: 1,
			CLIENT: 2,
		},
	};
});

import { trace } from '@opentelemetry/api';
import {
	getServerTracer,
	getGlobalTracer,
	DEFAULT_TRACER_SCOPE,
	DEFAULT_TRACER_VERSION,
	getTracerScope,
	getTracerVersion,
} from '../src/tracers.js';
import {
	createSpan,
	createSyncSpan,
	getActiveSpan,
	getTracer,
	SpanStatusCode,
	SpanKind,
} from '../src/instrumentation.js';
import { configureOtel, resetOtelConfig } from '../src/config.js';

describe('Tracer Factory', () => {
	beforeEach(() => {
		resetOtelConfig();
		vi.clearAllMocks();
	});

	describe('getServerTracer', () => {
		it('should return a tracer with default scope', () => {
			const tracer = getServerTracer();
			expect(tracer).toBeDefined();
			expect(trace.getTracer).toHaveBeenCalledWith(
				DEFAULT_TRACER_SCOPE,
				DEFAULT_TRACER_VERSION
			);
		});

		it('should use custom name when provided', () => {
			getServerTracer('custom-scope');
			expect(trace.getTracer).toHaveBeenCalledWith(
				'custom-scope',
				DEFAULT_TRACER_VERSION
			);
		});

		it('should use config service name when configured', () => {
			configureOtel({
				config: {
					serviceName: 'my-custom-service',
					serviceVersion: '2.0.0',
				},
			});

			getServerTracer();
			expect(trace.getTracer).toHaveBeenCalledWith(
				'my-custom-service',
				'2.0.0'
			);
		});
	});

	describe('getGlobalTracer (deprecated)', () => {
		it('should delegate to getServerTracer', () => {
			const tracer = getGlobalTracer();
			expect(tracer).toBeDefined();
			expect(trace.getTracer).toHaveBeenCalled();
		});
	});

	describe('getTracerScope', () => {
		it('should return default scope without config', () => {
			expect(getTracerScope()).toBe(DEFAULT_TRACER_SCOPE);
		});

		it('should return configured scope', () => {
			configureOtel({ config: { serviceName: 'test-svc' } });
			expect(getTracerScope()).toBe('test-svc');
		});
	});

	describe('getTracerVersion', () => {
		it('should return default version without config', () => {
			expect(getTracerVersion()).toBe(DEFAULT_TRACER_VERSION);
		});

		it('should return configured version', () => {
			configureOtel({ config: { serviceVersion: '3.2.1' } });
			expect(getTracerVersion()).toBe('3.2.1');
		});
	});
});

describe('Instrumentation Helpers', () => {
	beforeEach(() => {
		resetOtelConfig();
		vi.clearAllMocks();
	});

	describe('getTracer', () => {
		it('should return a tracer instance', () => {
			const tracer = getTracer();
			expect(tracer).toBeDefined();
		});
	});

	describe('createSpan', () => {
		it('should create and complete a span successfully', async () => {
			const result = await createSpan('test-span', async (span) => {
				span.setAttribute('key', 'value');
				return 42;
			});

			expect(result).toBe(42);
		});

		it('should set OK status on success', async () => {
			let capturedSpan: { setStatus: ReturnType<typeof vi.fn> } | undefined;

			await createSpan('test-span', async (span) => {
				capturedSpan = span as unknown as typeof capturedSpan;
				return 'success';
			});

			expect(capturedSpan?.setStatus).toHaveBeenCalledWith({
				code: SpanStatusCode.OK,
			});
		});

		it('should set ERROR status and re-throw on failure', async () => {
			const error = new Error('test error');

			await expect(
				createSpan('test-span', async () => {
					throw error;
				})
			).rejects.toThrow('test error');
		});

		it('should accept span kind option', async () => {
			await createSpan(
				'server-span',
				async () => 'ok',
				{ kind: SpanKind.SERVER }
			);

			const mockTracer = getTracer();
			expect(mockTracer.startActiveSpan).toHaveBeenCalled();
		});

		it('should accept initial attributes', async () => {
			await createSpan(
				'attributed-span',
				async () => 'ok',
				{
					attributes: {
						'http.method': 'GET',
						'http.status_code': 200,
					},
				}
			);

			expect(getTracer().startActiveSpan).toHaveBeenCalled();
		});
	});

	describe('createSyncSpan', () => {
		it('should create and complete a synchronous span', () => {
			const result = createSyncSpan('sync-span', (span) => {
				span.setAttribute('sync', true);
				return 'sync-result';
			});

			expect(result).toBe('sync-result');
		});

		it('should handle synchronous errors', () => {
			expect(() =>
				createSyncSpan('error-span', () => {
					throw new Error('sync error');
				})
			).toThrow('sync error');
		});
	});

	describe('getActiveSpan', () => {
		it('should return the active span from context', () => {
			const span = getActiveSpan();
			expect(span).toBeDefined();
		});
	});
});
