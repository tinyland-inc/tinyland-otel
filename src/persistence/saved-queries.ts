








import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getLogger } from '../config.js';




export interface SavedQuery {
	id: string;
	name: string;
	description: string;
	query: string;
	category: 'security' | 'performance' | 'a11y' | 'trpc' | 'custom';
	createdBy: string;
	createdAt: Date;
	lastUsed?: Date;
	useCount: number;
	tags: string[];
}




export interface SavedQueriesOptions {
	
	storageDir?: string;
	
	filename?: string;
}




function resolveFilePath(options: SavedQueriesOptions = {}): string {
	const dir = options.storageDir ?? join(process.cwd(), 'content', 'traceql');
	const filename = options.filename ?? 'saved-queries.json';
	return join(dir, filename);
}




function ensureStorageExists(filePath: string): void {
	const logger = getLogger();
	const dir = dirname(filePath);

	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
		logger.info('Created saved queries directory', { path: dir });
	}

	if (!existsSync(filePath)) {
		writeFileSync(filePath, JSON.stringify([], null, 2), 'utf-8');
		logger.info('Created saved queries file', { path: filePath });
	}
}







export function loadSavedQueries(options: SavedQueriesOptions = {}): SavedQuery[] {
	const logger = getLogger();
	const filePath = resolveFilePath(options);

	try {
		ensureStorageExists(filePath);

		const data = readFileSync(filePath, 'utf-8');
		const queries = JSON.parse(data);

		return queries.map((q: SavedQuery) => ({
			...q,
			createdAt: new Date(q.createdAt),
			lastUsed: q.lastUsed ? new Date(q.lastUsed) : undefined,
		}));
	} catch (error) {
		logger.error('Failed to load saved queries', {
			error: error instanceof Error ? error.message : String(error),
			file: filePath,
		});
		return [];
	}
}








export function saveQuery(
	query: Omit<SavedQuery, 'id' | 'createdAt' | 'useCount'>,
	options: SavedQueriesOptions = {}
): SavedQuery {
	const logger = getLogger();
	const filePath = resolveFilePath(options);

	try {
		const queries = loadSavedQueries(options);

		const newQuery: SavedQuery = {
			...query,
			id: `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
			createdAt: new Date(),
			useCount: 0,
		};

		queries.push(newQuery);
		writeFileSync(filePath, JSON.stringify(queries, null, 2), 'utf-8');

		logger.info('Saved new query', {
			queryId: newQuery.id,
			category: newQuery.category,
			createdBy: newQuery.createdBy,
		});

		return newQuery;
	} catch (error) {
		logger.error('Failed to save query', {
			error: error instanceof Error ? error.message : String(error),
			query: query.name,
		});
		throw new Error('Failed to save query');
	}
}








export function deleteQuery(queryId: string, options: SavedQueriesOptions = {}): boolean {
	const logger = getLogger();
	const filePath = resolveFilePath(options);

	try {
		const queries = loadSavedQueries(options);
		const filtered = queries.filter((q) => q.id !== queryId);

		if (filtered.length === queries.length) {
			logger.warn('Query not found for deletion', { queryId });
			return false;
		}

		writeFileSync(filePath, JSON.stringify(filtered, null, 2), 'utf-8');

		logger.info('Deleted query', { queryId });
		return true;
	} catch (error) {
		logger.error('Failed to delete query', {
			error: error instanceof Error ? error.message : String(error),
			queryId,
		});
		throw new Error('Failed to delete query');
	}
}







export function trackQueryUsage(queryId: string, options: SavedQueriesOptions = {}): void {
	const logger = getLogger();
	const filePath = resolveFilePath(options);

	try {
		const queries = loadSavedQueries(options);
		const query = queries.find((q) => q.id === queryId);

		if (query) {
			query.useCount++;
			query.lastUsed = new Date();
			writeFileSync(filePath, JSON.stringify(queries, null, 2), 'utf-8');

			logger.debug('Tracked query usage', {
				queryId,
				useCount: String(query.useCount),
			});
		} else {
			logger.warn('Query not found for usage tracking', { queryId });
		}
	} catch (error) {
		logger.error('Failed to track query usage', {
			error: error instanceof Error ? error.message : String(error),
			queryId,
		});
		
	}
}








export function getQueriesByCategory(
	category: SavedQuery['category'],
	options: SavedQueriesOptions = {}
): SavedQuery[] {
	return loadSavedQueries(options).filter((q) => q.category === category);
}








export function getQueriesByUser(userId: string, options: SavedQueriesOptions = {}): SavedQuery[] {
	return loadSavedQueries(options).filter((q) => q.createdBy === userId);
}









export function updateQuery(
	queryId: string,
	updates: Partial<Omit<SavedQuery, 'id' | 'createdAt' | 'createdBy'>>,
	options: SavedQueriesOptions = {}
): SavedQuery | null {
	const logger = getLogger();
	const filePath = resolveFilePath(options);

	try {
		const queries = loadSavedQueries(options);
		const queryIndex = queries.findIndex((q) => q.id === queryId);

		if (queryIndex === -1) {
			logger.warn('Query not found for update', { queryId });
			return null;
		}

		queries[queryIndex] = {
			...queries[queryIndex],
			...updates,
		};

		writeFileSync(filePath, JSON.stringify(queries, null, 2), 'utf-8');

		logger.info('Updated query', { queryId });
		return queries[queryIndex];
	} catch (error) {
		logger.error('Failed to update query', {
			error: error instanceof Error ? error.message : String(error),
			queryId,
		});
		throw new Error('Failed to update query');
	}
}
