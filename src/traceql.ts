












export type TraceQLOperator = 'AND' | 'OR';




export type RiskTier = 'low' | 'medium' | 'high' | 'critical';




export type A11ySeverity = 'critical' | 'serious' | 'moderate' | 'minor';




export type TRPCType = 'query' | 'mutation';




export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown';




export type GeoIPMethod = 'browser-geolocation' | 'maxmind-geoip' | 'mock-development';




export type VPNConfidence = 'high' | 'medium' | 'low';




export type FingerprintEventType =
	| 'session_created'
	| 'session_validated'
	| 'fingerprint_mismatch'
	| 'fingerprint_stored';







export class TraceQL {
	

	static findSpansByName(
		name: string,
		filters: Record<string, string | number | boolean> = {}
	): string {
		const filterStr = Object.entries(filters)
			.map(([k, v]) => {
				const value = typeof v === 'string' ? `"${v}"` : v;
				return `span.${k}=${value}`;
			})
			.join(' && ');

		return `{ name="${name}"${filterStr ? ' && ' + filterStr : ''} }`;
	}

	static findSpansByNamePattern(
		pattern: string,
		filters: Record<string, string | number | boolean> = {}
	): string {
		const filterStr = Object.entries(filters)
			.map(([k, v]) => {
				const value = typeof v === 'string' ? `"${v}"` : v;
				return `span.${k}=${value}`;
			})
			.join(' && ');

		return `{ name=~"${pattern}"${filterStr ? ' && ' + filterStr : ''} }`;
	}

	static findSpansBySession(sessionId: string): string {
		return `{ span.session.id="${sessionId}" }`;
	}

	static findSpansByFingerprint(fingerprintId: string): string {
		return `{ span.fingerprint.id="${fingerprintId}" }`;
	}

	static findSpansByUser(userId: string): string {
		return `{ span.user.id="${userId}" }`;
	}

	

	static findSlowSpans(minDuration: string, spanType?: string): string {
		const typeFilter = spanType ? ` && name=~"${spanType}\\\\..*"` : '';
		return `{ duration > ${minDuration}${typeFilter} }`;
	}

	static findFailedSpans(spanType?: string): string {
		const typeFilter = spanType ? ` && name=~"${spanType}\\\\..*"` : '';
		return `{ status=error${typeFilter} }`;
	}

	static findHighLatencyTraces(threshold: string): string {
		return `{ traceDuration > ${threshold} }`;
	}

	static findSlowClientOperations(minDurationMs: number): string {
		return `{ span.duration_ms > ${minDurationMs} && kind="client" }`;
	}

	

	static findHighRiskSessions(minTier: RiskTier = 'high'): string {
		if (minTier === 'critical') {
			return `{ span.risk.tier="critical" }`;
		} else if (minTier === 'high') {
			return `{ span.risk.tier="high" || span.risk.tier="critical" }`;
		} else if (minTier === 'medium') {
			return `{ span.risk.tier="medium" || span.risk.tier="high" || span.risk.tier="critical" }`;
		}
		return `{ span.risk.tier!="" }`;
	}

	static findVPNDetectedSessions(minConfidence?: VPNConfidence): string {
		if (minConfidence === 'high') {
			return `{ span.vpn.detected=true && span.vpn.confidence="high" }`;
		} else if (minConfidence === 'medium') {
			return `{ span.vpn.detected=true && (span.vpn.confidence="high" || span.vpn.confidence="medium") }`;
		}
		return `{ span.vpn.detected=true }`;
	}

	static findSessionHijackingAttempts(): string {
		return `{ span.fingerprint.event_type="fingerprint_mismatch" }`;
	}

	static findImpossibleTravel(): string {
		return `{ span.risk.recommendation="block" }`;
	}

	static findCriticalSecurityEvents(): string {
		return `{ span.enrichment.severity="critical" }`;
	}

	

	static findA11yViolations(severity?: A11ySeverity): string {
		if (severity === 'critical') {
			return `{ span.a11y.critical_count > 0 }`;
		} else if (severity === 'serious') {
			return `{ span.a11y.critical_count > 0 || span.a11y.serious_count > 0 }`;
		}
		return `{ span.a11y.violation_count > 0 }`;
	}

	static findScreenReaderUsers(): string {
		return `{ span.a11y.screen_reader_detected=true }`;
	}

	static findReducedMotionUsers(): string {
		return `{ span.a11y.reduced_motion=true }`;
	}

	static findHighContrastUsers(): string {
		return `{ span.a11y.high_contrast=true }`;
	}

	static findAccessibilityPreferenceUsers(): string {
		return `{ span.a11y.reduced_motion=true || span.a11y.high_contrast=true || span.a11y.forced_colors=true }`;
	}

	static findFailedA11yIngestion(): string {
		return `{ span.a11y.ingestion_success=false }`;
	}

	

	static findSlowMutations(threshold: string): string {
		return `{ span.trpc.type="mutation" && duration > ${threshold} }`;
	}

	static findErrorsByProcedure(procedure?: string): string {
		const procFilter = procedure ? ` && span.trpc.procedure=~"${procedure}.*"` : '';
		return `{ status=error && name=~"trpc\\\\..*"${procFilter} }`;
	}

	static findLargeInputPayloads(minSizeBytes: number): string {
		return `{ span.trpc.input_size > ${minSizeBytes} }`;
	}

	static findTRPCProceduresByType(type: TRPCType): string {
		return `{ span.trpc.type="${type}" }`;
	}

	

	static findRequestsByCountry(country: string): string {
		return `{ span.geo.country="${country}" }`;
	}

	static findRequestsByCity(city: string): string {
		return `{ span.geo.city="${city}" }`;
	}

	static findRequestsByGeoIPMethod(method: GeoIPMethod): string {
		return `{ span.geo.method="${method}" }`;
	}

	static findRequestsByBoundingBox(
		minLat: number,
		maxLat: number,
		minLng: number,
		maxLng: number
	): string {
		return `{ span.geo.latitude >= ${minLat} && span.geo.latitude <= ${maxLat} && span.geo.longitude >= ${minLng} && span.geo.longitude <= ${maxLng} }`;
	}

	static findFailedGeoIPLookups(): string {
		return `{ span.geo.lookup_result="not_found" }`;
	}

	

	static findRequestsByDevice(deviceType: DeviceType): string {
		return `{ span.device.type="${deviceType}" }`;
	}

	static findRequestsByBrowser(browser: string): string {
		return `{ span.client.browser="${browser}" }`;
	}

	static findRequestsByOS(osPattern: string): string {
		return `{ span.client.os=~".*${osPattern}.*" }`;
	}

	

	static buildCustomQuery(
		filters: Record<string, string | number | boolean>,
		projections?: string[]
	): string {
		const filterStr = Object.entries(filters)
			.map(([k, v]) => {
				if (typeof v === 'string' && (v.startsWith('>') || v.startsWith('<') || v.startsWith('='))) {
					return `${k}${v}`;
				}
				if (typeof v === 'string' && v.startsWith('~')) {
					return `${k}=~"${v.substring(1)}"`;
				}
				const prefix = k.includes('.') ? 'span.' : '';
				const value = typeof v === 'string' ? `"${v}"` : v;
				return `${prefix}${k}=${value}`;
			})
			.join(' && ');

		if (projections && projections.length > 0) {
			const projStr = projections.join(', ');
			return `{ ${filterStr} } | select(${projStr})`;
		}

		return `{ ${filterStr} }`;
	}

	static combineQueries(queries: string[], operator: TraceQLOperator = 'AND'): string {
		if (queries.length === 0) return '{}';
		if (queries.length === 1) return queries[0];

		const filters = queries.map((q) => q.replace(/^\{\s*/, '').replace(/\s*\}$/, ''));
		const combined = filters.join(` ${operator.toLowerCase()} `);
		return `{ ${combined} }`;
	}

	static findFingerprintEventsByType(eventType: FingerprintEventType): string {
		return `{ span.fingerprint.event_type="${eventType}" }`;
	}

	static findUnauthenticatedRequests(): string {
		return `{ span.fingerprint.id!="" && span.user.id="" }`;
	}

	static findAuthenticatedRequests(): string {
		return `{ span.user.id!="" && span.fingerprint.id!="" }`;
	}
}
