// Laravel JSON resource envelopes (after camelCase conversion).
export interface Resource<T> {
  data: T;
}

export interface PaginationMeta {
  currentPage: number;
  lastPage: number;
  perPage: number;
  total: number;
  from: number | null;
  to: number | null;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Query-string params for list endpoints. `sort` uses Laravel/Spatie style: `mrr` asc, `-mrr` desc. */
export interface ListParams {
  page?: number;
  perPage?: number;
  search?: string;
  sort?: string;
  [filter: string]: string | number | boolean | undefined;
}
