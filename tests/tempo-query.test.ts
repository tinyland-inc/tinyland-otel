/**
 * Tests for TempoQueryService
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TempoQueryService } from '../src/services/tempo-query.js';
import { resetOtelConfig } from '../src/config.js';
import type { OTLPTraceResponse, TempoSearchResponse } from '../src/types.js';

// Mock global fetch
const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

function createMockOTLPTrace(
	traceId: string,
	fingerprintId: string
): OTLPTraceResponse {
	return {
		batches: [
			{
				scopeSpans: [
					{
						spans: [
							{
								spanId: 'span-001',
								traceId: traceId,
								name: 'fingerprint.enrichment',
								startTimeUnixNano: '1700000000000000000',
								endTimeUnixNano: '1700000001000000000',
								attributes: [
									{
										key: 'fingerprint.id',
										value: { stringValue: fingerprintId },
									},
									{
										key: 'fingerprint.event_type',
										value: { stringValue: 'page_view' },
									},
									{
										key: 'geo.country',
										value: { stringValue: 'United States' },
									},
									{
										key: 'geo.city',
										value: { stringValue: 'Ithaca' },
									},
									{
										key: 'geo.latitude',
										value: { doubleValue: 42.4440 },
									},
									{
										key: 'geo.longitude',
										value: { doubleValue: -76.5019 },
									},
									{
										key: 'vpn.detected',
										value: { stringValue: 'false' },
									},
									{
										key: 'risk.score',
										value: { intValue: '15' },
									},
									{
										key: 'risk.tier',
										value: { stringValue: 'low' },
									},
								],
							},
						],
					},
				],
			},
		],
	};
}

function createMockSearchResponse(traceIds: string[]): TempoSearchResponse {
	return {
		traces: traceIds.map((id) => ({
			traceID: id,
			rootServiceName: 'sveltekit-server',
			rootTraceName: 'fingerprint.enrichment',
			startTimeUnixNano: '1700000000000000000',
			durationMs: 100,
		})),
		metrics: {
			totalBlocks: 10,
			completedJobs: 10,
			totalJobs: 10,
		},
	};
}

describe('TempoQueryService', () => {
	let service: TempoQueryService;

	beforeEach(() => {
		resetOtelConfig();
		mockFetch.mockReset();
		service = new TempoQueryService({
			tempoUrl: 'http://test-tempo:3200',
			fetchTimeoutMs: 1000,
		});
	});

	describe('constructor', () => {
		it('should accept custom options', () => {
			const svc = new TempoQueryService({
				tempoUrl: 'http://custom:3200',
				cacheTtlMs: 30000,
				maxCacheSize: 100,
				fetchTimeoutMs: 2000,
				batchSize: 10,
			});
			expect(svc).toBeDefined();
		});

		it('should use defaults when no options provided', () => {
			const svc = new TempoQueryService();
			expect(svc).toBeDefined();
		});
	});

	describe('parseTimeRange', () => {
		it('should parse seconds', () => {
			const result = service.parseTimeRange('30s');
			expect(result.end - result.start).toBe(30);
		});

		it('should parse minutes', () => {
			const result = service.parseTimeRange('5m');
			expect(result.end - result.start).toBe(300);
		});

		it('should parse hours', () => {
			const result = service.parseTimeRange('1h');
			expect(result.end - result.start).toBe(3600);
		});

		it('should parse days', () => {
			const result = service.parseTimeRange('7d');
			expect(result.end - result.start).toBe(604800);
		});

		it('should parse weeks', () => {
			const result = service.parseTimeRange('2w');
			expect(result.end - result.start).toBe(1209600);
		});

		it('should throw for invalid format', () => {
			expect(() => service.parseTimeRange('invalid')).toThrow('Invalid time range format');
		});

		it('should throw for missing unit', () => {
			expect(() => service.parseTimeRange('100')).toThrow('Invalid time range format');
		});
	});

	describe('extractFingerprintFromOTLP', () => {
		it('should extract fingerprint record from valid OTLP trace', () => {
			const trace = createMockOTLPTrace('trace-001', 'fp-abc123');
			const record = service.extractFingerprintFromOTLP(trace);

			expect(record).not.toBeNull();
			expect(record!.fingerprintId).toBe('fp-abc123');
			expect(record!.eventType).toBe('page_view');
			expect(record!.geoCountry).toBe('United States');
			expect(record!.geoCity).toBe('Ithaca');
			expect(record!.geoLatitude).toBeCloseTo(42.444, 2);
			expect(record!.geoLongitude).toBeCloseTo(-76.5019, 2);
			expect(record!.vpnDetected).toBe(false);
			expect(record!.riskScore).toBe(15);
			expect(record!.riskTier).toBe('low');
		});

		it('should return null for trace without fingerprint span', () => {
			const trace: OTLPTraceResponse = {
				batches: [
					{
						scopeSpans: [
							{
								spans: [
									{
										spanId: 'span-001',
										traceId: 'trace-001',
										name: 'http.request',
										startTimeUnixNano: '1700000000000000000',
										endTimeUnixNano: '1700000001000000000',
										attributes: [],
									},
								],
							},
						],
					},
				],
			};
			const record = service.extractFingerprintFromOTLP(trace);
			expect(record).toBeNull();
		});

		it('should return null for fingerprint span without fingerprint.id', () => {
			const trace: OTLPTraceResponse = {
				batches: [
					{
						scopeSpans: [
							{
								spans: [
									{
										spanId: 'span-001',
										traceId: 'trace-001',
										name: 'fingerprint.enrichment',
										startTimeUnixNano: '1700000000000000000',
										endTimeUnixNano: '1700000001000000000',
										attributes: [
											{
												key: 'some.other.key',
												value: { stringValue: 'value' },
											},
										],
									},
								],
							},
						],
					},
				],
			};
			const record = service.extractFingerprintFromOTLP(trace);
			expect(record).toBeNull();
		});

		it('should handle empty batches', () => {
			const trace: OTLPTraceResponse = { batches: [] };
			const record = service.extractFingerprintFromOTLP(trace);
			expect(record).toBeNull();
		});
	});

	describe('fetchFullTrace', () => {
		it('should fetch and return trace data', async () => {
			const mockTrace = createMockOTLPTrace('trace-001', 'fp-123');
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockTrace),
			});

			const result = await service.fetchFullTrace('trace-001');
			expect(result).toEqual(mockTrace);
			expect(mockFetch).toHaveBeenCalledOnce();
		});

		it('should return null for non-ok response', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 404,
			});

			const result = await service.fetchFullTrace('nonexistent');
			expect(result).toBeNull();
		});

		it('should return null on network error', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const result = await service.fetchFullTrace('trace-001');
			expect(result).toBeNull();
		});

		it('should return cached result on second call', async () => {
			const mockTrace = createMockOTLPTrace('trace-cached', 'fp-cached');
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockTrace),
			});

			// First call - fetches
			const result1 = await service.fetchFullTrace('trace-cached');
			expect(result1).toEqual(mockTrace);

			// Second call - should use cache
			const result2 = await service.fetchFullTrace('trace-cached');
			expect(result2).toEqual(mockTrace);

			// Only one fetch should have occurred
			expect(mockFetch).toHaveBeenCalledOnce();
		});
	});

	describe('cache management', () => {
		it('should report cache size correctly', () => {
			expect(service.getCacheSize()).toBe(0);
		});

		it('should clear cache', async () => {
			const mockTrace = createMockOTLPTrace('trace-001', 'fp-123');
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockTrace),
			});

			await service.fetchFullTrace('trace-001');
			expect(service.getCacheSize()).toBe(1);

			service.clearCache();
			expect(service.getCacheSize()).toBe(0);
		});
	});

	describe('searchTracesWithQuery', () => {
		it('should build correct search URL with tags', async () => {
			const mockResponse = createMockSearchResponse(['trace-001']);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse),
			});

			await service.searchTracesWithQuery({
				start: 1700000000,
				end: 1700003600,
				tags: { 'fingerprint.id': 'abc123' },
				limit: 100,
			});

			expect(mockFetch).toHaveBeenCalledOnce();
			const calledUrl = mockFetch.mock.calls[0][0] as string;
			expect(calledUrl).toContain('/api/search');
			expect(calledUrl).toContain('limit=100');
			expect(calledUrl).toContain('tags=fingerprint.id%3Dabc123');
		});

		it('should cap limit to 200', async () => {
			const mockResponse = createMockSearchResponse([]);
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(mockResponse),
			});

			await service.searchTracesWithQuery({ limit: 500 });

			const calledUrl = mockFetch.mock.calls[0][0] as string;
			expect(calledUrl).toContain('limit=200');
		});

		it('should throw on non-ok response', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				text: () => Promise.resolve('server error'),
			});

			await expect(
				service.searchTracesWithQuery({ limit: 10 })
			).rejects.toThrow('Tempo search failed');
		});
	});

	describe('getTagValueSuggestions', () => {
		it('should return tag values', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ tagValues: ['abc123', 'abc456', 'abc789'] }),
			});

			const suggestions = await service.getTagValueSuggestions('fingerprint.id', 'abc', 10);
			expect(suggestions).toEqual(['abc123', 'abc456', 'abc789']);
		});

		it('should return empty for short query', async () => {
			const suggestions = await service.getTagValueSuggestions('fingerprint.id', 'a', 10);
			expect(suggestions).toEqual([]);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should return empty for empty query', async () => {
			const suggestions = await service.getTagValueSuggestions('fingerprint.id', '', 10);
			expect(suggestions).toEqual([]);
		});

		it('should return empty on fetch error', async () => {
			mockFetch.mockRejectedValueOnce(new Error('Network error'));
			const suggestions = await service.getTagValueSuggestions('fingerprint.id', 'abc', 10);
			expect(suggestions).toEqual([]);
		});
	});

	describe('parseSpanAttributes', () => {
		it('should parse string values', () => {
			const attrs = service.parseSpanAttributes([
				{ key: 'key1', value: { stringValue: 'hello' } },
			]);
			expect(attrs['key1']).toBe('hello');
		});

		it('should parse int values', () => {
			const attrs = service.parseSpanAttributes([
				{ key: 'key1', value: { intValue: '42' } },
			]);
			expect(attrs['key1']).toBe('42');
		});

		it('should parse double values', () => {
			const attrs = service.parseSpanAttributes([
				{ key: 'key1', value: { doubleValue: 3.14 } },
			]);
			expect(attrs['key1']).toBe('3.14');
		});

		it('should parse boolean values', () => {
			const attrs = service.parseSpanAttributes([
				{ key: 'key1', value: { boolValue: true } },
			]);
			expect(attrs['key1']).toBe('true');
		});

		it('should handle empty attributes array', () => {
			const attrs = service.parseSpanAttributes([]);
			expect(attrs).toEqual({});
		});
	});
});
