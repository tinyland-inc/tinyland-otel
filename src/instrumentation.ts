















import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import type { Span, Tracer } from '@opentelemetry/api';
import { getServerTracer } from './tracers.js';





let globalTracer: Tracer | null = null;







export function getTracer(): Tracer {
	if (!globalTracer) {
		globalTracer = getServerTracer();
	}
	return globalTracer;
}







export function initializeTracing(): Tracer {
	console.log('[Tracing] initializeTracing() called (no-op, use initializeServerTracing)');
	globalTracer = getServerTracer();
	return globalTracer;
}



















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






export function getActiveSpan(): Span | undefined {
	return trace.getActiveSpan();
}






export async function withContext<T>(
	span: Span,
	fn: () => Promise<T>
): Promise<T> {
	return context.with(trace.setSpan(context.active(), span), fn);
}




export { trace, context, SpanStatusCode, SpanKind };
export type { Span, Tracer };
