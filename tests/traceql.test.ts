/**
 * Tests for TraceQL query builder
 */
import { describe, it, expect } from 'vitest';
import { TraceQL } from '../src/traceql.js';

describe('TraceQL Query Builder', () => {
	describe('findSpansByName', () => {
		it('should build basic name query', () => {
			expect(TraceQL.findSpansByName('fingerprint.enrichment')).toBe(
				'{ name="fingerprint.enrichment" }'
			);
		});

		it('should include additional filters', () => {
			const query = TraceQL.findSpansByName('fingerprint.enrichment', {
				'session.id': 'sess_abc',
			});
			expect(query).toBe(
				'{ name="fingerprint.enrichment" && span.session.id="sess_abc" }'
			);
		});

		it('should handle numeric filter values', () => {
			const query = TraceQL.findSpansByName('test', { 'risk.score': 70 });
			expect(query).toContain('span.risk.score=70');
		});

		it('should handle boolean filter values', () => {
			const query = TraceQL.findSpansByName('test', { 'vpn.detected': true });
			expect(query).toContain('span.vpn.detected=true');
		});
	});

	describe('findSpansByNamePattern', () => {
		it('should build regex name pattern query', () => {
			expect(TraceQL.findSpansByNamePattern('trpc\\..*')).toBe(
				'{ name=~"trpc\\..*" }'
			);
		});
	});

	describe('Security queries', () => {
		it('should find high risk sessions (critical only)', () => {
			expect(TraceQL.findHighRiskSessions('critical')).toBe(
				'{ span.risk.tier="critical" }'
			);
		});

		it('should find high risk sessions (high + critical)', () => {
			const query = TraceQL.findHighRiskSessions('high');
			expect(query).toContain('span.risk.tier="high"');
			expect(query).toContain('span.risk.tier="critical"');
		});

		it('should find VPN detected sessions', () => {
			expect(TraceQL.findVPNDetectedSessions()).toBe(
				'{ span.vpn.detected=true }'
			);
		});

		it('should find high confidence VPN sessions', () => {
			const query = TraceQL.findVPNDetectedSessions('high');
			expect(query).toContain('span.vpn.confidence="high"');
		});

		it('should find session hijacking attempts', () => {
			expect(TraceQL.findSessionHijackingAttempts()).toContain(
				'fingerprint_mismatch'
			);
		});
	});

	describe('Performance queries', () => {
		it('should find slow spans', () => {
			expect(TraceQL.findSlowSpans('500ms')).toBe(
				'{ duration > 500ms }'
			);
		});

		it('should find slow spans by type', () => {
			const query = TraceQL.findSlowSpans('1s', 'trpc');
			expect(query).toContain('duration > 1s');
			expect(query).toContain('trpc');
		});

		it('should find failed spans', () => {
			expect(TraceQL.findFailedSpans()).toBe('{ status=error }');
		});

		it('should find high latency traces', () => {
			expect(TraceQL.findHighLatencyTraces('2s')).toBe(
				'{ traceDuration > 2s }'
			);
		});
	});

	describe('A11y queries', () => {
		it('should find critical a11y violations', () => {
			expect(TraceQL.findA11yViolations('critical')).toContain(
				'span.a11y.critical_count > 0'
			);
		});

		it('should find screen reader users', () => {
			expect(TraceQL.findScreenReaderUsers()).toContain(
				'span.a11y.screen_reader_detected=true'
			);
		});
	});

	describe('Geographic queries', () => {
		it('should find requests by country', () => {
			expect(TraceQL.findRequestsByCountry('Germany')).toBe(
				'{ span.geo.country="Germany" }'
			);
		});

		it('should find requests by bounding box', () => {
			const query = TraceQL.findRequestsByBoundingBox(42, 43, -77, -76);
			expect(query).toContain('span.geo.latitude >= 42');
			expect(query).toContain('span.geo.latitude <= 43');
			expect(query).toContain('span.geo.longitude >= -77');
			expect(query).toContain('span.geo.longitude <= -76');
		});
	});

	describe('combineQueries', () => {
		it('should combine queries with AND', () => {
			const query = TraceQL.combineQueries([
				TraceQL.findHighRiskSessions('critical'),
				TraceQL.findVPNDetectedSessions(),
			], 'AND');

			expect(query).toContain('and');
			expect(query).toContain('span.risk.tier="critical"');
			expect(query).toContain('span.vpn.detected=true');
		});

		it('should combine queries with OR', () => {
			const query = TraceQL.combineQueries([
				TraceQL.findScreenReaderUsers(),
				TraceQL.findReducedMotionUsers(),
			], 'OR');

			expect(query).toContain('or');
		});

		it('should return empty query for no inputs', () => {
			expect(TraceQL.combineQueries([])).toBe('{}');
		});

		it('should return single query unchanged', () => {
			const single = TraceQL.findFailedSpans();
			expect(TraceQL.combineQueries([single])).toBe(single);
		});
	});

	describe('buildCustomQuery', () => {
		it('should build query from filters', () => {
			const query = TraceQL.buildCustomQuery({
				'risk.tier': 'high',
				'device.type': 'mobile',
			});

			expect(query).toContain('span.risk.tier="high"');
			expect(query).toContain('span.device.type="mobile"');
		});

		it('should include projections', () => {
			const query = TraceQL.buildCustomQuery(
				{ 'trpc.type': 'mutation' },
				['span.trpc.procedure', 'duration']
			);

			expect(query).toContain('select(');
			expect(query).toContain('span.trpc.procedure');
		});

		it('should handle operator values', () => {
			const query = TraceQL.buildCustomQuery({
				duration: '>500ms',
			});
			expect(query).toContain('duration>500ms');
		});
	});
});
