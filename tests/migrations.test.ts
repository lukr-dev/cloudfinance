import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vite-plus/test";

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
