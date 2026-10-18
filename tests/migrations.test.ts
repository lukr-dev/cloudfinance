import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vite-plus/test";

it("raises legacy API-key quotas without changing custom policies or key validity", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const directory = new URL("../db/migrations/", import.meta.url);
    const migration = "20261018100333_increase_api_key_rate_limit.sql";
    for (const file of readdirSync(directory)
      .filter((name) => name.endsWith(".sql") && name < migration)
      .sort())
      db.exec(readFileSync(new URL(file, directory), "utf8"));
    const insert = db.prepare(`
      INSERT INTO apikey (id, configId, referenceId, key, createdAt, updatedAt,
        enabled, rateLimitEnabled, rateLimitMax, rateLimitTimeWindow,
        requestCount, lastRequest, expiresAt, remaining, permissions, metadata)
      VALUES (?, 'default', 'owner', ?, 1, 2, ?, ?, ?, ?, 120, 1000, ?, 42, '{}', '{}')
    `);
    insert.run("legacy", "hash-legacy", 1, 1, 120, 60000, null);
    insert.run("disabled", "hash-disabled", 0, 1, 120, 60000, null);
    insert.run("expired", "hash-expired", 1, 1, 120, 60000, 1);
    insert.run("custom-max", "hash-custom-max", 1, 1, 240, 60000, null);
    insert.run("custom-window", "hash-custom-window", 1, 1, 120, 30000, null);
    insert.run("unlimited", "hash-unlimited", 1, 0, 120, 60000, null);
    insert.run("current", "hash-current", 1, 1, 600, 60000, null);
    const rows = () => db.prepare("SELECT * FROM apikey ORDER BY id").all();
    const upgraded = new Set(["legacy", "disabled", "expired"]);
    const expected = rows().map((row) =>
      upgraded.has(String(row.id))
        ? { ...row, rateLimitMax: 600, requestCount: 0, lastRequest: null }
        : row,
    );
    const sql = readFileSync(new URL(migration, directory), "utf8");
    db.exec(sql);
    expect(rows()).toEqual(expected);
    db.exec(sql);
    expect(rows()).toEqual(expected);
  } finally {
    db.close();
  }
});

it("auth migrations apply to an empty SQLite database and enforce one user atomically", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const directory = new URL("../db/migrations/", import.meta.url);
    for (const file of readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      db.exec(readFileSync(new URL(file, directory), "utf8"));
    }
    const insert = db.prepare(
      "INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, 0, 0)",
    );
    insert.run("first", "First", "first@example.com");
    expect(() => insert.run("second", "Second", "second@example.com")).toThrow(/UNIQUE constraint/);
    expect(db.prepare("SELECT count(*) AS total FROM user").get()?.total).toBe(1);
  } finally {
    db.close();
  }
});

it("rebuilds currency tables with existing transactions and foreign keys enabled", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys=ON");
    const directory = new URL("../db/migrations/", import.meta.url);
    const migration = "20261018051930_lyrical_dagger.sql";
    for (const file of readdirSync(directory)
      .filter((name) => name.endsWith(".sql") && name < migration)
      .sort())
      db.exec(readFileSync(new URL(file, directory), "utf8"));
    db.exec(`
      INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES ('u','Owner','owner@example.com',0,0,0);
      INSERT INTO accounts (id,user_id,created_at,updated_at,name,type,currency) VALUES ('a','u','now','now','Bank','checking','CHF');
      INSERT INTO category_groups (id,user_id,created_at,updated_at,name) VALUES ('g','u','now','now','Everyday');
      INSERT INTO categories (id,user_id,created_at,updated_at,group_id,name,color) VALUES ('c','u','now','now','g','Food','teal');
      INSERT INTO budget_assignments (id,user_id,created_at,updated_at,month,category_id,currency,amount_minor) VALUES ('b','u','now','now','2026-10','c','CHF',250);
      INSERT INTO transactions (id,user_id,created_at,updated_at,account_id,date,amount_minor,currency,category_id,source,external_id) VALUES ('t','u','now','now','a','2026-10-01',-125,'CHF','c','manual','import-1');
    `);
    const tables = ["accounts", "budget_assignments", "transactions"];
    const rows = () =>
      tables.map((table) => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());
    const objects = () =>
      db
        .prepare(
          "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('index','trigger') ORDER BY type,name",
        )
        .all();
    const foreignKeys = () =>
      tables.map((table) => db.prepare(`PRAGMA foreign_key_list(${table})`).all());
    const before = { rows: rows(), objects: objects(), foreignKeys: foreignKeys() };
    // D1 applies a migration atomically with foreign keys ON; foreign_keys=OFF cannot disable them.
    db.exec("BEGIN");
    for (const statement of readFileSync(new URL(migration, directory), "utf8").split(
      "--> statement-breakpoint",
    ))
      if (statement.trim()) db.exec(statement);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    db.exec("COMMIT");
    expect(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys).toBe(1);
    expect({ rows: rows(), objects: objects(), foreignKeys: foreignKeys() }).toEqual(before);
    db.exec(
      "INSERT INTO accounts (id,user_id,created_at,updated_at,name,type,currency) VALUES ('kwd','u','now','now','Dinars','checking','KWD')",
    );
    db.exec(
      "INSERT INTO budget_assignments (id,user_id,created_at,updated_at,month,category_id,currency,amount_minor) VALUES ('kwd-b','u','now','now','2026-10','c','KWD',1)",
    );
    expect(() => db.exec("UPDATE accounts SET on_budget=2 WHERE id='kwd'")).toThrow(
      /CHECK constraint/,
    );
    expect(() => db.exec("UPDATE accounts SET type='invalid' WHERE id='kwd'")).toThrow(
      /CHECK constraint/,
    );
    expect(() => db.exec("UPDATE budget_assignments SET month='2026-13' WHERE id='kwd-b'")).toThrow(
      /CHECK constraint/,
    );
    expect(() => db.exec("UPDATE transactions SET currency='KWD' WHERE id='t'")).toThrow(
      /FOREIGN KEY constraint/,
    );
    expect(() =>
      db.exec(
        "INSERT INTO transactions SELECT 'duplicate',user_id,created_at,updated_at,account_id,date,amount_minor,currency,payee,memo,category_id,cleared,transfer_account_id,transfer_transaction_id,source,external_id FROM transactions WHERE id='t'",
      ),
    ).toThrow(/UNIQUE constraint/);
  } finally {
    db.close();
  }
});
