import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { createDb } from "void/db";
// Exercise real Drizzle SQL and SQLite constraints without a Worker for domain unit tests.
export function testDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const name of readdirSync(new URL("../db/migrations/", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(new URL("../db/migrations/" + name, import.meta.url), "utf8"));
  class Statement {
    constructor(
      readonly query: string,
      readonly args: SQLInputValue[] = [],
    ) {}
    bind(...args: SQLInputValue[]) {
      return new Statement(this.query, args);
    }
    async all() {
      const stmt = sqlite.prepare(this.query);
      const results = stmt.columns().length ? stmt.all(...this.args) : (stmt.run(...this.args), []);
      return { results, success: true, meta: {} };
    }
    async raw() {
      const stmt = sqlite.prepare(this.query);
      stmt.setReturnArrays(true);
      return stmt.all(...this.args);
    }
    async run() {
      sqlite.prepare(this.query).run(...this.args);
      return { results: [], success: true, meta: {} };
    }
  }
  const binding = {
    withSession() {
      return this;
    },
    prepare(query: string) {
      return new Statement(query);
    },
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.all());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sqlite, db: createDb(binding as unknown as Parameters<typeof createDb>[0]) };
}
