export declare class UnsupportedMigration extends Error {}
export declare const STORES: {
  database: string;
  sessions: string;
  configuration: string;
};
export interface Migration {
  from: number;
  to: number;
  changes: string[];
  summary: string;
  apply(database: unknown): void;
}
export declare const MIGRATIONS: Migration[];
export declare function plan(from: number, to: number): Migration[];
export declare function supported(from: number, to: number): boolean;
export declare function changedStores(steps: Migration[]): string[];
