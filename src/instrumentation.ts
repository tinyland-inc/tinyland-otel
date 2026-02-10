/**
 * OpenTelemetry Instrumentation - ESM Compatible
 *
 * Manual tracing implementation using @opentelemetry/api (ESM-compatible)
 * with real SDK initialization (not NoopTracer).
 *
 * This module provides distributed tracing helpers for creating spans.
 *
 * SDK Initialization:
 * - SDK initialized via initializeServerTracing() in otel-node.ts
 * - This module provides helper functions for creating spans
 * - Uses unified tracer factory from tracers.ts for consistent scope naming
 *
 * @module instrumentation
 */

import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import type { Span, Tracer } from '@opentelemetry/api';
import { getServerTracer } from './tracers.js';

/**
 * Global tracer instance
 * Initialized on first access (lazy loading)
 */
let globalTracer: Tracer | null = null;

/**
 * Get or create the global tracer
 *
 * Returns the real tracer instance (SDK initialized in host app)
 * If SDK initialization failed, returns NoopTracer as graceful fallback
 */
export function getTracer(): Tracer {
	if (!globalTracer) {
		globalTracer = getServerTracer();
	}
	return globalTracer;
}

/**
 * Initialize tracing with OTLP exporter
 *
 * DEPRECATED: SDK initialization moved to initializeServerTracing().
 * This function is kept for backward compatibility but does nothing.
 */
export function initializeTracing(): Tracer {
	console.log('[Tracing] initializeTracing() called (no-op, use initializeServerTracing)');
	globalTracer = getServerTracer();
	return globalTracer;
}

/**
 * Create a span for a specific operation
 *
 * @param name - Span name (e.g., "fingerprint.enrichment")
 * @param fn - Async function to execute within span context
 * @param options - Span options (kind, attributes)
 * @returns Result of the function execution
 *
 * @example
 * ```typescript
 * const result = await createSpan('geoip.lookup', async (span) => {
 *   span.setAttribute('ip', hashIP(ip));
 *   const location = await performGeoIPLookup(ip);
 *   span.setAttribute('city', location.city);
 *   return location;
 * }, { kind: SpanKind.INTERNAL });
 * ```
 */
export async function createSpan<T>(
	name: string,
	fn: (span: Span) => Promise<T>,
	options: {
		kind?: SpanKind;
		attributes?: Record<string, string | number | boolean>;
	} = {}
): Promise<T> {
	const tracer = getTracer();

	return tracer.startActiveSpan(
		name,
		{
			kind: options.kind || SpanKind.INTERNAL,
			attributes: options.attributes || {}
		},
		async (span) => {
			try {
				const result = await fn(span);
				span.setStatus({ code: SpanStatusCode.OK });
				return result;
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: error instanceof Error ? error.message : 'Unknown error'
				});
				throw error;
			} finally {
				span.end();
			}
		}
	);
}

/**
 * Create a synchronous span (for non-async operations)
 */
export function createSyncSpan<T>(
	name: string,
	fn: (span: Span) => T,
	options: {
		kind?: SpanKind;
		attributes?: Record<string, string | number | boolean>;
	} = {}
): T {
	const tracer = getTracer();

	const span = tracer.startSpan(name, {
		kind: options.kind || SpanKind.INTERNAL,
		attributes: options.attributes || {}
	});

	try {
		const result = fn(span);
		span.setStatus({ code: SpanStatusCode.OK });
		return result;
	} catch (error) {
		span.recordException(error as Error);
		span.setStatus({
			code: SpanStatusCode.ERROR,
			message: error instanceof Error ? error.message : 'Unknown error'
		});
		throw error;
	} finally {
		span.end();
	}
}

/**
 * Get current active span
 *
 * Useful for adding attributes to parent span
 */
export function getActiveSpan(): Span | undefined {
	return trace.getActiveSpan();
}

/**
 * Run function with trace context
 *
 * Propagates trace context across async boundaries
 */
export async function withContext<T>(
	span: Span,
	fn: () => Promise<T>
): Promise<T> {
	return context.with(trace.setSpan(context.active(), span), fn);
}

/**
 * Re-export all tracing utilities from @opentelemetry/api
 */
export { trace, context, SpanStatusCode, SpanKind };
export type { Span, Tracer };
