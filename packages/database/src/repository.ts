import type { Job } from '@rj/shared';
import type { RowOf, TableKey } from './tables.js';

/** Comparison filter for one field. A bare value means equality (null means IS NULL). */
export type FieldFilter<V> =
  | V
  | null
  | { op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'; value: V | null }
  | { op: 'in' | 'notIn'; value: readonly V[] };

export type Filter<T> = { [K in keyof T]?: FieldFilter<T[K]> };

export interface ListOptions<T> {
  orderBy?: keyof T & string;
  desc?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Typed CRUD over one entity table. All methods are async so a PostgreSQL implementation can
 * satisfy the same interface. Rows are validated with the @rj/shared Zod schema on write and read.
 */
export interface EntityStore<T> {
  insert(row: T): Promise<T>;
  get(id: string): Promise<T | null>;
  /** Partial update by primary key; throws if the row does not exist. */
  update(id: string, patch: Partial<T>): Promise<T>;
  /** Insert or replace by primary key. */
  upsert(row: T): Promise<T>;
  list(filter?: Filter<T>, options?: ListOptions<T>): Promise<T[]>;
  first(filter?: Filter<T>, options?: ListOptions<T>): Promise<T | null>;
  count(filter?: Filter<T>): Promise<number>;
  /** SUM(field) over matching rows; null when there are no rows (never 0 for "no data"). */
  sum(field: keyof T & string, filter?: Filter<T>): Promise<number | null>;
  delete(id: string): Promise<boolean>;
}

export interface JobStore extends EntityStore<Job> {
  /** Atomically moves a queued job to running. Returns the claimed job, or null if someone else won. */
  claim(id: string, startedAt: string): Promise<Job | null>;
}

export type Stores = { [K in TableKey]: K extends 'jobs' ? JobStore : EntityStore<RowOf<K>> };

export interface Repository extends Stores {
  readonly dialect: 'sqlite' | 'postgres';
  /** Runs fn atomically. Other operations on this repository wait until it finishes. */
  transaction<R>(fn: (tx: Repository) => Promise<R>): Promise<R>;
  /** Typed shortcut over system_configuration. */
  getConfig<V = unknown>(key: string): Promise<V | null>;
  setConfig(key: string, value: unknown, updatedBy: string): Promise<void>;
  close(): Promise<void>;
}
