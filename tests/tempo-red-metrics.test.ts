


import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { TempoREDMetricsService } from '../src/services/tempo-red-metrics.js';
import { resetOtelConfig } from '../src/config.js';


const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

function createMockPrometheusResult(values: Array<[number, string]>) {
	return {
		status: 'success',
		data: {
			resultType: 'matrix',
			result: [
				{
					metric: { span_name: 'fingerprint.enrichment' },
					values,
				},
			],
		},
	};
}

function createEmptyPrometheusResult() {
	return {
		status: 'success',
		data: {
			resultType: 'matrix',
			result: [],
		},
	};
}

describe('TempoREDMetricsService', () => {
	let service: TempoREDMetricsService;

	beforeEach(() => {
		resetOtelConfig();
		mockFetch.mockReset();
		service = new TempoREDMetricsService({
			tempoUrl: 'http://test-tempo:3200',
		});
	});

	describe('constructor', () => {
		it('should accept custom tempoUrl', () => {
			const svc = new TempoREDMetricsService({ tempoUrl: 'http://custom:3200' });
			expect(svc).toBeDefined();
		});

		it('should use defaults when no options provided', () => {
			const svc = new TempoREDMetricsService();
			expect(svc).toBeDefined();
		});
	});

	describe('parseTimeRange', () => {
		it('should parse 1h correctly', () => {
			const result = service.parseTimeRange('1h');
			expect(result.end - result.start).toBe(3600);
			expect(result.step).toBe('15s');
		});

		it('should parse 24h correctly', () => {
			const result = service.parseTimeRange('24h');
			expect(result.end - result.start).toBe(86400);
			expect(result.step).toBe('1m');
		});

		it('should parse 7d correctly', () => {
			const result = service.parseTimeRange('7d');
			expect(result.end - result.start).toBe(604800);
			expect(result.step).toBe('5m');
		});

		it('should parse 2w correctly', () => {
			const result = service.parseTimeRange('2w');
			expect(result.end - result.start).toBe(1209600);
			expect(result.step).toBe('15m');
		});

		it('should throw for invalid format', () => {
			expect(() => service.parseTimeRange('invalid')).toThrow('Invalid time range format');
		});

		it('should use 15s step for sub-hour ranges', () => {
			const result = service.parseTimeRange('30m');
			expect(result.step).toBe('15s');
		});
	});

	describe('extractTimeseries', () => {
		it('should extract range query timeseries', () => {
			const result = createMockPrometheusResult([
				[1700000000, '0.5'],
				[1700000060, '0.7'],
				[1700000120, '0.3'],
			]);
			const timeseries = service.extractTimeseries(result);

			expect(timeseries).toHaveLength(3);
			expect(timeseries[0].timestamp).toBe(1700000000000);
			expect(timeseries[0].value).toBeCloseTo(0.5);
			expect(timeseries[2].value).toBeCloseTo(0.3);
		});

		it('should handle instant query result', () => {
			const result = {
				status: 'success',
				data: {
					resultType: 'vector',
					result: [
						{
							metric: { span_name: 'test' },
							value: [1700000000, '1.5'] as [number, string],
						},
					],
				},
			};
			const timeseries = service.extractTimeseries(result);

			expect(timeseries).toHaveLength(1);
			expect(timeseries[0].timestamp).toBe(1700000000000);
			expect(timeseries[0].value).toBeCloseTo(1.5);
		});

		it('should return empty for no results', () => {
			const result = createEmptyPrometheusResult();
			const timeseries = service.extractTimeseries(result);
			expect(timeseries).toEqual([]);
		});

		it('should handle missing data gracefully', () => {
			const result = { status: 'success', data: { resultType: 'matrix', result: [] } };
			const timeseries = service.extractTimeseries(result);
			expect(timeseries).toEqual([]);
		});
	});

	describe('queryPrometheus', () => {
		it('should build correct prometheus URL', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve(createEmptyPrometheusResult()),
			});

			await service.queryPrometheus('rate(test{}[5m])', 1700000000, 1700003600, '15s');

			expect(mockFetch).toHaveBeenCalledOnce();
			const calledUrl = mockFetch.mock.calls[0][0] as string;
			expect(calledUrl).toContain('/prometheus/api/v1/query_range');
			expect(calledUrl).toContain('start=1700000000');
			expect(calledUrl).toContain('end=1700003600');
			expect(calledUrl).toContain('step=15s');
		});

		it('should throw on non-ok response', async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
				text: () => Promise.resolve('query error'),
			});

			await expect(
				service.queryPrometheus('bad_query', 0, 100, '15s')
			).rejects.toThrow('Prometheus query failed');
		});
	});

	describe('getREDMetrics', () => {
		it('should return RED metrics with all fields', async () => {
			
			const rateData = createMockPrometheusResult([
				[1700000000, '2.5'],
				[1700000060, '3.0'],
			]);
			const errorData = createMockPrometheusResult([
				[1700000000, '0.1'],
				[1700000060, '0.2'],
			]);
			const totalData = createMockPrometheusResult([
				[1700000000, '2.5'],
				[1700000060, '3.0'],
			]);
			const p50Data = createMockPrometheusResult([
				[1700000000, '0.05'],
				[1700000060, '0.06'],
			]);
			const p95Data = createMockPrometheusResult([
				[1700000000, '0.2'],
				[1700000060, '0.25'],
			]);
			const p99Data = createMockPrometheusResult([
				[1700000000, '0.5'],
				[1700000060, '0.6'],
			]);

			
			mockFetch
				.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(rateData) })
				.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(errorData) })
				.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(totalData) })
				.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(p50Data) })
				.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(p95Data) })
				.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(p99Data) });

			const metrics = await service.getREDMetrics('fingerprint.enrichment', '1h');

			expect(metrics).toBeDefined();
			expect(typeof metrics.rate).toBe('number');
			expect(typeof metrics.errorRate).toBe('number');
			expect(typeof metrics.p50).toBe('number');
			expect(typeof metrics.p95).toBe('number');
			expect(typeof metrics.p99).toBe('number');
			expect(metrics.rateTimeseries).toBeInstanceOf(Array);
			expect(metrics.errorsTimeseries).toBeInstanceOf(Array);
			expect(metrics.durationTimeseries).toBeInstanceOf(Array);
		});

		it('should throw on query failure', async () => {
			mockFetch.mockRejectedValue(new Error('Network error'));

			await expect(
				service.getREDMetrics('test.span', '1h')
			).rejects.toThrow();
		});
	});

	describe('getFingerprintREDMetrics', () => {
		it('should query fingerprint.enrichment span', async () => {
			
			for (let i = 0; i < 6; i++) {
				mockFetch.mockResolvedValueOnce({
					ok: true,
					json: () => Promise.resolve(createEmptyPrometheusResult()),
				});
			}

			const metrics = await service.getFingerprintREDMetrics('1h');

			expect(metrics).toBeDefined();
			expect(metrics.rate).toBe(0);
			expect(metrics.errorRate).toBe(0);
			expect(metrics.p50).toBe(0);
			expect(metrics.p95).toBe(0);
			expect(metrics.p99).toBe(0);
		});
	});

	describe('createTempoREDMetricsService', () => {
		it('should be importable', async () => {
			const { createTempoREDMetricsService } = await import('../src/services/tempo-red-metrics.js');
			const svc = createTempoREDMetricsService({ tempoUrl: 'http://test:3200' });
			expect(svc).toBeInstanceOf(TempoREDMetricsService);
		});
	});
});
