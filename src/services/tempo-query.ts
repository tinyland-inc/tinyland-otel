



















import { getLogger } from '../config.js';
import { getObservabilityConfig } from '../observability-config.js';
import type {
	TempoSearchQuery,
	TempoSearchResponse,
	OTLPTraceResponse,
	TempoFingerprintRecord,
} from '../types.js';




export interface TempoQueryServiceOptions {
	
	tempoUrl?: string;
	
	cacheTtlMs?: number;
	
	maxCacheSize?: number;
	
	fetchTimeoutMs?: number;
	
	batchSize?: number;
}










export class TempoQueryService {
	private tempoUrl: string;

	
	private traceCache = new Map<string, { data: OTLPTraceResponse; timestamp: number }>();
	private readonly cacheTtlMs: number;
	private readonly maxCacheSize: number;
	private readonly fetchTimeoutMs: number;
	private readonly batchSize: number;

	constructor(options: TempoQueryServiceOptions = {}) {
		const obsConfig = getObservabilityConfig();
		this.tempoUrl = options.tempoUrl ?? obsConfig.tempoUrl ?? 'http://stonewall-tempo:3200';
		this.cacheTtlMs = options.cacheTtlMs ?? 60_000;
		this.maxCacheSize = options.maxCacheSize ?? 500;
		this.fetchTimeoutMs = options.fetchTimeoutMs ?? 5_000;
		this.batchSize = options.batchSize ?? 5;
	}

	


	private pruneTraceCache(): void {
		const now = Date.now();
		for (const [key, entry] of this.traceCache) {
			if (now - entry.timestamp > this.cacheTtlMs) {
				this.traceCache.delete(key);
			}
		}
		
		while (this.traceCache.size > this.maxCacheSize) {
			const firstKey = this.traceCache.keys().next().value;
			if (firstKey) this.traceCache.delete(firstKey);
		}
	}

	


	getCacheSize(): number {
		return this.traceCache.size;
	}

	


	clearCache(): void {
		this.traceCache.clear();
	}

	







	async queryFingerprints(
		timeRange: string = '7d',
		tags: Record<string, string> = {},
		limit: number = 1000
	): Promise<TempoFingerprintRecord[]> {
		const logger = getLogger();
		try {
			const { start, end } = this.parseTimeRange(timeRange);

			const query: TempoSearchQuery = {
				start,
				end,
				tags: {
					name: 'fingerprint.enrichment',
					...tags,
				},
				limit,
			};

			logger.info('Querying Tempo for fingerprint traces', {
				timeRange,
				start,
				end,
				tags: query.tags,
				limit,
			});

			const response = await this.searchTracesWithQuery(query);
			const records = await this.extractFingerprintRecords(response);

			logger.info('Tempo query successful', {
				tracesFound: response.traces?.length || 0,
				recordsExtracted: records.length,
			});

			return records;
		} catch (error) {
			logger.error('Tempo fingerprint query failed', {
				error: error instanceof Error ? error.message : String(error),
				timeRange,
				tags,
			});
			throw error;
		}
	}

	









	async getTagValueSuggestions(
		tagName: string,
		query: string,
		limit: number = 10
	): Promise<string[]> {
		const logger = getLogger();

		if (!query || query.length < 2) {
			return [];
		}

		const params = new URLSearchParams();
		params.append('q', query);
		if (limit) params.append('limit', limit.toString());

		const url = `${this.tempoUrl}/api/search/tag/${encodeURIComponent(tagName)}/values?${params.toString()}`;

		logger.debug('Tempo tag value autocomplete request', { tagName, query, limit });

		try {
			const response = await fetch(url, {
				headers: { 'Content-Type': 'application/json' },
			});

			if (!response.ok) {
				const text = await response.text();
				logger.warn('Tempo tag value autocomplete failed', {
					status: response.status,
					statusText: response.statusText,
					body: text,
				});
				return [];
			}

			const data = (await response.json()) as { tagValues?: string[] };
			const tagValues = data.tagValues || [];

			logger.debug('Tempo tag value autocomplete successful', {
				tagName,
				query,
				count: tagValues.length,
			});

			return tagValues.slice(0, limit);
		} catch (error) {
			logger.error('Tempo tag value autocomplete error', {
				error: error instanceof Error ? error.message : String(error),
				tagName,
				query,
			});
			return [];
		}
	}

	





	async fetchFullTrace(traceID: string): Promise<OTLPTraceResponse | null> {
		const logger = getLogger();

		
		const cached = this.traceCache.get(traceID);
		if (cached && Date.now() - cached.timestamp < this.cacheTtlMs) {
			return cached.data;
		}

		
		if (this.traceCache.size > this.maxCacheSize / 2) {
			this.pruneTraceCache();
		}

		const url = `${this.tempoUrl}/api/traces/${traceID}`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeoutMs);

		try {
			const response = await fetch(url, {
				headers: { Accept: 'application/json' },
				signal: controller.signal,
			});

			if (!response.ok) {
				logger.warn('Failed to fetch full trace', { traceID, status: response.status });
				return null;
			}

			const data = (await response.json()) as OTLPTraceResponse;
			this.traceCache.set(traceID, { data, timestamp: Date.now() });

			return data;
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				logger.warn('Trace fetch timed out', { traceID, timeoutMs: this.fetchTimeoutMs });
				return null;
			}
			logger.warn('Error fetching full trace', {
				traceID,
				error: error instanceof Error ? error.message : String(error),
			});
			return null;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	







	extractFingerprintFromOTLP(fullTrace: OTLPTraceResponse): TempoFingerprintRecord | null {
		for (const batch of fullTrace.batches || []) {
			for (const scopeSpan of batch.scopeSpans || []) {
				for (const span of scopeSpan.spans || []) {
					if (span.name === 'fingerprint.enrichment') {
						const attrs: Record<string, string> = {};
						for (const attr of span.attributes || []) {
							const value =
								attr.value.stringValue ||
								String(attr.value.intValue ?? '') ||
								String(attr.value.doubleValue ?? '') ||
								String(attr.value.boolValue ?? '');
							if (value) attrs[attr.key] = value;
						}

						if (!attrs['fingerprint.id']) continue;

						return {
							traceID: span.traceId || '',
							spanID: span.spanId || '',
							duration: parseInt(span.endTimeUnixNano) - parseInt(span.startTimeUnixNano),
							fingerprintId: attrs['fingerprint.id'],
							timestamp: new Date(parseInt(span.startTimeUnixNano) / 1_000_000).toISOString(),
							eventType: attrs['fingerprint.event_type'],
							fingerprintHash: attrs['fingerprint.hash'],
							sessionId: attrs['session.id'],
							userId: attrs['user.id'],
							userHandle: attrs['user.handle'],
							userRole: attrs['user.role'],
							geoCountry: attrs['geo.country'],
							geoCity: attrs['geo.city'],
							geoLatitude: parseFloat(attrs['geo.latitude']),
							geoLongitude: parseFloat(attrs['geo.longitude']),
							geoSource: attrs['geo.method'],
							vpnDetected: attrs['vpn.detected'] === 'true',
							vpnProvider: attrs['vpn.provider'],
							vpnConfidence: attrs['vpn.confidence']?.toString() || '0',
							vpnMethod: attrs['vpn.method'],
							deviceType: attrs['device.type'],
							browserName: attrs['browser.name'],
							browserVersion: attrs['browser.version'],
							browserMajorVersion: attrs['browser.major_version'] || '',
							osName: attrs['os.name'],
							osVersion: attrs['os.version'],
							engineName: attrs['engine.name'],
							engineVersion: attrs['engine.version'],
							navigationPathname: attrs['navigation.pathname'],
							navigationHostname: attrs['navigation.hostname'],
							navigationCurrentUrl: attrs['navigation.current_url'],
							navigationReferrer: attrs['navigation.referrer'],
							navigationReferrerHostname: attrs['navigation.referrer_hostname'],
							navigationIsExternalReferral: attrs['navigation.is_external_referral'] === 'true',
							riskScore: parseInt(attrs['risk.score']) || 0,
							riskTier: attrs['risk.tier'],
							riskFactors: attrs['risk.factors']?.split(',').map((f) => f.trim()),
							ipHash: attrs['ip.hash'],
							ipType: attrs['ip.type'] as 'private' | 'public' | 'unknown' | undefined,
							consentTimestamp: attrs['consent.timestamp'],
							consentVersion: attrs['consent.version'],
							consentCategoriesEssential: attrs['consent.categories.essential'] === 'true',
							consentCategoriesPreferences: attrs['consent.categories.preferences'] === 'true',
							consentCategoriesFunctional: attrs['consent.categories.functional'] === 'true',
							consentCategoriesTracking: attrs['consent.categories.tracking'] === 'true',
							consentCategoriesPerformance: attrs['consent.categories.performance'] === 'true',
							consentPreciseLocation: attrs['consent.preciseLocation'] === 'true',
							consentAgeVerified: attrs['consent.ageVerified'] === 'true',
							consentOptionalHandle: attrs['consent.optionalHandle'],
							preferencesTheme: attrs['preferences.theme'],
							preferencesDarkMode: attrs['preferences.darkMode'],
						};
					}
				}
			}
		}
		return null;
	}

	


	async searchTracesWithQuery(query: TempoSearchQuery): Promise<TempoSearchResponse> {
		const logger = getLogger();
		const params = new URLSearchParams();

		if (query.start) params.append('start', query.start.toString());
		if (query.end) params.append('end', query.end.toString());
		const cappedLimit = Math.min(query.limit ?? 200, 200);
		params.append('limit', cappedLimit.toString());

		if (query.tags) {
			for (const [key, value] of Object.entries(query.tags)) {
				params.append('tags', `${key}=${value}`);
			}
		}

		const url = `${this.tempoUrl}/api/search?${params.toString()}`;
		logger.debug('Tempo search API request', { url });

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeoutMs);

		try {
			const response = await fetch(url, {
				headers: { 'Content-Type': 'application/json' },
				signal: controller.signal,
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error(`Tempo search failed: ${response.status} ${response.statusText} - ${text}`);
			}

			return (await response.json()) as TempoSearchResponse;
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error(`Tempo search timed out after ${this.fetchTimeoutMs}ms`);
			}
			throw error;
		} finally {
			clearTimeout(timeoutId);
		}
	}

	




	private async extractFingerprintRecords(
		response: TempoSearchResponse
	): Promise<TempoFingerprintRecord[]> {
		const logger = getLogger();

		if (!response.traces || response.traces.length === 0) {
			return [];
		}

		const records: TempoFingerprintRecord[] = [];

		logger.info('Fetching full traces for fingerprint extraction', {
			traceCount: response.traces.length,
			batchSize: this.batchSize,
		});

		for (let i = 0; i < response.traces.length; i += this.batchSize) {
			const batch = response.traces.slice(i, i + this.batchSize);

			const fullTraces = await Promise.all(
				batch.map((trace) => this.fetchFullTrace(trace.traceID))
			);

			for (const fullTrace of fullTraces) {
				if (!fullTrace) continue;

				try {
					const record = this.extractFingerprintFromOTLP(fullTrace);
					if (record) {
						records.push(record);
					}
				} catch (error) {
					logger.warn('Failed to extract fingerprint from OTLP trace', {
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
		}

		logger.info('Fingerprint extraction complete', {
			totalTraces: response.traces.length,
			recordsExtracted: records.length,
		});

		return records;
	}

	







	async searchTraces(
		traceQL: string,
		start: number,
		end: number
	): Promise<TempoSearchResponse['traces']> {
		const logger = getLogger();

		try {
			const params = new URLSearchParams();
			params.append('start', start.toString());
			params.append('end', end.toString());
			params.append('q', traceQL);
			params.append('limit', '100');

			const url = `${this.tempoUrl}/api/search?${params.toString()}`;
			logger.debug('Tempo TraceQL search request', { url, traceQL });

			const response = await fetch(url, {
				headers: { 'Content-Type': 'application/json' },
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error(
					`Tempo TraceQL search failed: ${response.status} ${response.statusText} - ${text}`
				);
			}

			const result = (await response.json()) as TempoSearchResponse;

			logger.debug('Tempo TraceQL search successful', {
				traceCount: result.traces?.length || 0,
				traceQL,
			});

			const spanNameMatch = traceQL.match(/name\s*=\s*"([^"]+)"/);
			const spanName = spanNameMatch?.[1];

			const enrichedTraces = await this.enrichTracesWithAttributes(
				result.traces || [],
				spanName
			);

			logger.debug('Traces enriched with attributes', {
				totalTraces: result.traces?.length || 0,
				enrichedTraces: enrichedTraces.length,
				targetSpanName: spanName || 'any',
			});

			return enrichedTraces;
		} catch (error) {
			logger.error('Tempo TraceQL search error', {
				error: error instanceof Error ? error.message : String(error),
				traceQL,
			});
			throw error;
		}
	}

	


	private async enrichTracesWithAttributes(
		traces: TempoSearchResponse['traces'],
		spanName?: string
	): Promise<TempoSearchResponse['traces']> {
		if (traces.length === 0) return [];

		const enrichedTraces: TempoSearchResponse['traces'] = [];

		for (let i = 0; i < traces.length; i += this.batchSize) {
			const batch = traces.slice(i, i + this.batchSize);

			const fullTraces = await Promise.all(
				batch.map((trace) => this.fetchFullTrace(trace.traceID))
			);

			
			if (i + this.batchSize < traces.length) {
				await new Promise((resolve) => setTimeout(resolve, 50));
			}

			for (let j = 0; j < batch.length; j++) {
				const trace = batch[j];
				const fullTrace = fullTraces[j];

				if (!fullTrace) {
					enrichedTraces.push(trace);
					continue;
				}

				const attributes = this.extractAttributesFromOTLP(fullTrace, spanName);

				if (attributes && trace.spanSet?.spans?.[0]) {
					trace.spanSet.spans[0].attributes = attributes;
				}

				enrichedTraces.push(trace);
			}
		}

		return enrichedTraces;
	}

	


	private extractAttributesFromOTLP(
		fullTrace: OTLPTraceResponse,
		spanName?: string
	):
		| Array<{
				key: string;
				value: {
					stringValue?: string;
					intValue?: string;
					doubleValue?: number;
					boolValue?: boolean;
				};
		  }>
		| undefined {
		for (const batch of fullTrace.batches || []) {
			for (const scopeSpan of batch.scopeSpans || []) {
				for (const span of scopeSpan.spans || []) {
					const isTargetSpan = spanName
						? span.name === spanName
						: span.attributes && span.attributes.length > 0;

					if (isTargetSpan) {
						return span.attributes.map((attr) => ({
							key: attr.key,
							value: {
								stringValue: attr.value.stringValue,
								intValue: attr.value.intValue ? String(attr.value.intValue) : undefined,
								doubleValue: attr.value.doubleValue,
								boolValue: attr.value.boolValue,
							},
						}));
					}
				}
			}
		}
		return undefined;
	}

	


	parseSpanAttributes(
		attributes: Array<{
			key: string;
			value: {
				stringValue?: string;
				intValue?: string;
				doubleValue?: number;
				boolValue?: boolean;
			};
		}>
	): Record<string, string> {
		const attrs: Record<string, string> = {};

		for (const attr of attributes) {
			if (attr.value.stringValue !== undefined) {
				attrs[attr.key] = attr.value.stringValue;
			} else if (attr.value.intValue !== undefined) {
				attrs[attr.key] = attr.value.intValue;
			} else if (attr.value.doubleValue !== undefined) {
				attrs[attr.key] = attr.value.doubleValue.toString();
			} else if (attr.value.boolValue !== undefined) {
				attrs[attr.key] = attr.value.boolValue.toString();
			}
		}

		return attrs;
	}

	


	parseTimeRange(timeRange: string): { start: number; end: number } {
		const end = Math.floor(Date.now() / 1000);
		let start = end;

		const match = timeRange.match(/^(\d+)([smhdw])$/);
		if (!match) {
			throw new Error(`Invalid time range format: ${timeRange}`);
		}

		const value = parseInt(match[1]);
		const unit = match[2];

		const multipliers: Record<string, number> = {
			s: 1,
			m: 60,
			h: 3600,
			d: 86400,
			w: 604800,
		};

		start = end - value * multipliers[unit];

		return { start, end };
	}
}







export function createTempoQueryService(
	options: TempoQueryServiceOptions = {}
): TempoQueryService {
	return new TempoQueryService(options);
}
