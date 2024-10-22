/*
 ** 2024-10-21
 **
 ** The author disclaims copyright to this source code.  In place of
 ** a legal notice, here is a blessing:
 **
 **    May you do good and not evil.
 **    May you find forgiveness for yourself and forgive others.
 **    May you share freely, never taking more than you give.
 **
 */
// to run: bun test

import { Database } from "bun:sqlite";
import { test, describe, expect, afterAll, beforeAll } from "bun:test";

const EXT =
  process.platform === "win32"
    ? ".dll"
    : process.platform === "darwin"
    ? ".dylib"
    : ".so";

if (process.platform === "darwin" && process.env.SQLITE_LIB_PATH)
  Database.setCustomSQLite(process.env.SQLITE_LIB_PATH);

function initDatabase() {
  const db = new Database(":memory:");
  db.loadExtension(`./dist/fts5${EXT}`);
  db.loadExtension(`./dist/better-trigram${EXT}`);
  return db;
}

describe("remove_diacritics", () => {
  describe("v1", () => {
    const db = initDatabase();
    afterAll(() => db.close());

    test("1.0", () => {
      [
        `CREATE VIRTUAL TABLE t1 USING fts5(y, tokenize='better_trigram remove_diacritics 1');`,
        `INSERT INTO t1 VALUES('abc\u0303defghijklm');`,
        `INSERT INTO t1 VALUES('a\u0303b\u0303c\u0303defghijklm');`,
      ].forEach((stmt) => db.query(stmt).run());
    });

    sqlTest(
      db,
      `1.1`,
      `SELECT highlight(t1, 0, '(', ')') as res FROM t1('abc');`,
      [],
      ["(abc\u0303)defghijklm", "(a\u0303b\u0303c\u0303)defghijklm"]
    );

    sqlTest(
      db,
      `1.2`,
      `SELECT highlight(t1, 0, '(', ')') as res FROM t1('bcde');`,
      [],
      ["a(bc\u0303de)fghijklm", "a\u0303(b\u0303c\u0303de)fghijklm"]
    );

    sqlTest(
      db,
      `1.3`,
      `SELECT highlight(t1, 0, '(', ')') as res FROM t1('cdef');`,
      [],
      ["ab(c\u0303def)ghijklm", "a\u0303b\u0303(c\u0303def)ghijklm"]
    );

    sqlTest(
      db,
      `1.4`,
      `SELECT highlight(t1, 0, '(', ')') as res FROM t1('def');`,
      [],
      ["abc\u0303(def)ghijklm", "a\u0303b\u0303c\u0303(def)ghijklm"]
    );
  });

  describe("v2", () => {
    const db = initDatabase();
    afterAll(() => db.close());

    test("2.0", () => {
      expect(() =>
        db
          .query(
            `CREATE VIRTUAL TABLE t2 USING fts5(
    z, tokenize='better_trigram case_sensitive 1 remove_diacritics 1'
);`
          )
          .run()
      ).toThrowError(/error in tokenizer constructor/g);
    });

    test("2.1", () => {
      expect(() =>
        db
          .query(
            `CREATE VIRTUAL TABLE t2 USING fts5(
    z, tokenize='better_trigram case_sensitive 0 remove_diacritics 1'
);`
          )
          .run()
      ).not.toThrowError();
    });

    test("2.2", () => {
      [
        `INSERT INTO t2 VALUES('\u00E3bcdef');`,
        `INSERT INTO t2 VALUES('b\u00E3cdef');`,
        `INSERT INTO t2 VALUES('bc\u00E3def');`,
        `INSERT INTO t2 VALUES('bcd\u00E3ef');`,
      ].forEach((stmt) =>
        expect(db.prepare(stmt).run().changes).toBeGreaterThan(0)
      );
    });

    sqlTest(
      db,
      "2.3",
      `SELECT highlight(t2, 0, '(', ')') as res FROM t2('abc');`,
      [],
      "(\u00E3bc)def"
    );

    sqlTest(
      db,
      "2.4",
      `SELECT highlight(t2, 0, '(', ')') as res FROM t2('bac');`,
      [],
      "(b\u00E3c)def"
    );

    sqlTest(
      db,
      "2.5",
      `SELECT highlight(t2, 0, '(', ')') as res FROM t2('bca');`,
      [],
      "(bc\u00E3)def"
    );

    sqlTest(
      db,
      "2.6",
      `SELECT highlight(t2, 0, '(', ')') as res FROM t2('\u00E3bc');`,
      [],
      "(\u00E3bc)def"
    );
  });

  describe("v3", () => {
    const db = initDatabase();
    afterAll(() => db.close());

    test("3.0", () => {
      expect(() =>
        db
          .query(
            `CREATE VIRTUAL TABLE t3 USING fts5(
      z, tokenize='better_trigram remove_diacritics 1'
);`
          )
          .run()
      ).not.toThrowError();
    });

    test("3.1", () => {
      expect(
        db.prepare(`INSERT INTO t3 VALUES ('\u0303abc\u0303');`).run().changes
      ).toBeGreaterThan(0);
    });

    sqlTest(
      db,
      "3.2",
      `SELECT highlight(t3, 0, '(', ')') as res FROM t3('abc');`,
      [],
      "\u0303(abc\u0303)"
    );
  });

  describe("v4", () => {
    const db = initDatabase();
    afterAll(() => db.close());

    test("4.0", () => {
      expect(() =>
        db
          .query(
            `CREATE VIRTUAL TABLE t4 USING fts5(z, tokenize=better_trigram);`
          )
          .run()
      ).not.toThrowError();
    });

    test("4.1", () => {
      [
        `INSERT INTO t4 VALUES('ABCD');`,
        `INSERT INTO t4 VALUES('DEFG');`,
      ].forEach((stmt) =>
        expect(db.prepare(stmt).run().changes).toBeGreaterThan(0)
      );
    });

    explainQueryPlanTest(
      db,
      "4.2",
      `SELECT rowid FROM t4 WHERE z LIKE '%abc%'`,
      [],
      "SCAN t4 VIRTUAL TABLE INDEX 0:"
      // TODO: "VIRTUAL TABLE INDEX 0:L0"
    );

    sqlTest(
      db,
      "4.3",
      `SELECT rowid as res FROM t4 WHERE z LIKE '%abc%'`,
      [],
      1
    );
  });

  describe("v5", () => {
    const db = initDatabase();
    afterAll(() => db.close());

    test("5.0", () => {
      expect(() =>
        db
          .query(
            `CREATE VIRTUAL TABLE t5 USING fts5(
      c1, tokenize='better_trigram', detail='none'
  );`
          )
          .run()
      ).not.toThrowError();

      [
        `INSERT INTO t5(rowid, c1) VALUES(1, 'abc_____xyx_yxz');`,
        `INSERT INTO t5(rowid, c1) VALUES(2, 'abc_____xyxz');`,
        `INSERT INTO t5(rowid, c1) VALUES(3, 'ac_____xyxz');`,
      ].forEach((stmt) =>
        expect(db.prepare(stmt).run().changes).toBeGreaterThan(0)
      );
    });

    sqlTest(
      db,
      "5.1",
      `SELECT rowid as res FROM t5 WHERE c1 LIKE 'abc%xyxz'`,
      [],
      2
    );
  });
});

describe("case_sensitive", () => {
  describe("v1", () => {
    const db = initDatabase();

    test("1.0", () => {
      [
        `CREATE VIRTUAL TABLE t1 USING fts5(y, tokenize = 'better_trigram');`,
        `INSERT INTO t1 VALUES('abcdefghijklm')`,
        `INSERT INTO t1 VALUES('กรุงเทพมหานคร');`,
      ].forEach((stmt) => db.query(stmt).run());
    });

    [
      ["abc", "(abc)defghijklm"],
      ["defgh", "abc(defgh)ijklm"],
      ["abcdefghijklm", "(abcdefghijklm)"],
      ["กรุ", "(กรุ)งเทพมหานคร"],
      ["งเทพมห", "กรุ(งเทพมห)านคร"],
      ["กรุงเทพมหานคร", "(กรุงเทพมหานคร)"],
      ["Abc", "(abc)defghijklm"],
      ["deFgh", "abc(defgh)ijklm"],
      ["aBcdefGhijKlm", "(abcdefghijklm)"],
    ].forEach((testCase, index) => {
      sqlTest(
        db,
        `1.1.${index + 1}`,
        `SELECT highlight(t1, 0, '(', ')') as res FROM t1(?)`,
        [testCase[0]],
        testCase[1]
      );
    });

    sqlTest(
      db,
      `1.2.0`,
      `SELECT fts5_expr('ABCD', 'tokenize=better_trigram') as res`,
      [],
      `"abc" + "bcd"`
    );

    (
      [
        ["%cDef%", 1],
        ["cDef%", undefined],
        ["%f%", 1],
        ["%f_h%", 1],
        ["%f_g%", undefined],
        ["abc%klm", 1],
        ["ABCDEFG%", 1],
        ["%รุงเ%", 2],
        ["%งเ%", 2],
      ] as const
    ).forEach((testCase, index) => {
      sqlTest(
        db,
        `1.3.${index + 1}`,
        `SELECT rowid as res FROM t1 WHERE y LIKE ?`,
        [testCase[0]],
        testCase[1]
      );
    });
  });

  describe("v2", () => {
    const db = initDatabase();

    test("2.0", () => {
      [
        `CREATE VIRTUAL TABLE t1 USING fts5(y, tokenize = 'better_trigram case_sensitive 1');`,
        `INSERT INTO t1 VALUES('abcdefghijklm')`,
        `INSERT INTO t1 VALUES('กรุงเทพมหานคร');`,
      ].forEach((stmt) => db.query(stmt).run());
    });

    (
      [
        ["abc", "(abc)defghijklm"],
        ["defgh", "abc(defgh)ijklm"],
        ["abcdefghijklm", "(abcdefghijklm)"],
        ["กรุ", "(กรุ)งเทพมหานคร"],
        ["งเทพมห", "กรุ(งเทพมห)านคร"],
        ["กรุงเทพมหานคร", "(กรุงเทพมหานคร)"],
        ["Abc", undefined],
        ["deFgh", undefined],
        ["aBcdefGhijKlm", undefined],
      ] as const
    ).forEach((testCase, index) => {
      sqlTest(
        db,
        `2.1.${index + 1}`,
        `SELECT highlight(t1, 0, '(', ')') as res FROM t1(?)`,
        [testCase[0]],
        testCase[1]
      );
    });

    (
      [
        ["%cDef%", 1],
        ["cDef%", undefined],
        ["%f%", 1],
        ["%f_h%", 1],
        ["%f_g%", undefined],
        ["abc%klm", 1],
        ["ABCDEFG%", 1],
        ["%รุงเ%", 2],
      ] as const
    ).forEach((testCase, index) => {
      sqlTest(
        db,
        `2.2.${index + 1}`,
        `SELECT rowid as res FROM t1 WHERE y LIKE ?`,
        [testCase[0]],
        testCase[1]
      );
    });

    (
      [
        ["*cdef*", 1],
        ["cdef*", undefined],
        ["*f*", 1],
        ["*f?h*", 1],
        ["*f?g*", undefined],
        ["abc*klm", 1],
        ["abcdefg*", 1],
        ["*รุงเ*", 2],
        ["abc[d]efg*", 1],
        ["abc[]d]efg*", 1],
        ["abc[^]d]efg*", undefined],
        ["abc[^]XYZ]efg*", 1],
      ] as const
    ).forEach((testCase, index) => {
      sqlTest(
        db,
        `2.3.${index + 1}`,
        `SELECT rowid as res FROM t1 WHERE y GLOB ?`,
        [testCase[0]],
        testCase[1]
      );
    });

    sqlTest(
      db,
      "2.3.null.1",
      `SELECT rowid FROM t1 WHERE y LIKE NULL`,
      [],
      undefined
    );
  });

  describe("v3", () => {
    const db = initDatabase();

    test("3.0", () => {
      expect(() =>
        db
          .query(
            `CREATE VIRTUAL TABLE ttt USING fts5(c, tokenize="better_trigram case_sensitive 2")`
          )
          .run()
      ).toThrow(/error in tokenizer constructor/g);
    });

    test("3.1", () => {
      expect(() =>
        db
          .query(
            `CREATE VIRTUAL TABLE ttt USING fts5(c, tokenize="better_trigram case_sensitive 11")`
          )
          .run()
      ).toThrow(/error in tokenizer constructor/g);
    });

    test("3.2", () => {
      expect(() =>
        db
          .query(
            `CREATE VIRTUAL TABLE ttt USING fts5(c, tokenize="better_trigram case_sensitive 1")`
          )
          .run()
      ).not.toThrow();
    });
  });

  describe("v4", () => {
    const db = initDatabase();

    test("4.0", () => {
      expect(
        db
          .query(
            `CREATE VIRTUAL TABLE t0 USING fts5(b, tokenize = "better_trigram");`
          )
          .run().changes
      ).toBeGreaterThan(0);
    });

    test("4.1", () => {
      expect(
        db.query(`INSERT INTO t0 VALUES (x'000b01');`).run().changes
      ).toBeGreaterThan(0);
    });

    test("4.2", () => {
      expect(
        db.query(`INSERT INTO t0(t0) VALUES('integrity-check');`).run().changes
      ).toBeGreaterThan(0);
    });
  });

  describe("v5", () => {
    for (const detailMode of ["full", "col", "none"]) {
      for (const flag of [0, 1]) {
        const db = initDatabase();

        test(`5.cs=${flag}.0.1 (${detailMode})`, () => {
          expect(
            db
              .prepare(
                `CREATE VIRTUAL TABLE t1 USING fts5(
              y, tokenize="better_trigram case_sensitive ${flag}", detail=${detailMode}
          );`
              )
              .run().changes
          ).toBeGreaterThan(0);
        });

        test(`5.cs=${flag}.0.2 (${detailMode})`, () => {
          [
            `INSERT INTO t1 VALUES('abcdefghijklm');`,
            `INSERT INTO t1 VALUES('กรุงเทพมหานคร');`,
          ].forEach((stmt) => {
            expect(db.prepare(stmt).run().changes).toBeGreaterThan(0);
          });
        });

        (
          [
            ["%cDef%", 1],
            ["cDef%", undefined],
            ["%f%", 1],
            ["%f_h%", 1],
            ["%f_g%", undefined],
            ["abc%klm", 1],
            ["ABCDEFG%", 1],
            ["%รุงเ%", 2],
          ] as const
        ).forEach((testCase, index) => {
          sqlTest(
            db,
            `5.cs=${flag}.1.${index + 1} (${detailMode})`,
            `SELECT rowid as res FROM t1 WHERE y LIKE ?`,
            [testCase[0]],
            testCase[1]
          );
        });
      }
    }
  });

  describe("v6", () => {
    const db = initDatabase();

    test("6.0", () => {
      [
        `CREATE VIRTUAL TABLE ci0 USING fts5(x, tokenize="better_trigram");`,
        `CREATE VIRTUAL TABLE ci1 USING fts5(x, tokenize="better_trigram case_sensitive 1");`,
      ].forEach((stmt) =>
        expect(db.prepare(stmt).run().changes).toBeGreaterThan(0)
      );
    });

    explainQueryPlanTest(
      db,
      "6.1",
      `SELECT * FROM ci0 WHERE x LIKE '??'`,
      [],
      "SCAN ci0 VIRTUAL TABLE INDEX 0:"
      // TODO: "VIRTUAL TABLE INDEX 0:L0"
    );

    explainQueryPlanTest(
      db,
      "6.2",
      `SELECT * FROM ci0 WHERE x GLOB '??'`,
      [],
      "SCAN ci0 VIRTUAL TABLE INDEX 0:"
      // TODO: "VIRTUAL TABLE INDEX 0:G0"
    );

    explainQueryPlanTest(
      db,
      "6.3",
      `SELECT * FROM ci1 WHERE x LIKE '??'`,
      [],
      "SCAN ci1 VIRTUAL TABLE INDEX 0:"
    );

    explainQueryPlanTest(
      db,
      "6.4",
      `SELECT * FROM ci1 WHERE x GLOB '??'`,
      [],
      "SCAN ci1 VIRTUAL TABLE INDEX 0:"
      // TODO: "VIRTUAL TABLE INDEX 0:G0"
    );
  });

  describe("v7", () => {
    const db = initDatabase();

    test("7.0", () => {
      [
        `CREATE VIRTUAL TABLE f USING FTS5(filename, tokenize="better_trigram");`,
        `INSERT INTO f (rowid, filename) VALUES
          (10, 'giraffe.png'),
          (20, 'жираф.png'),
          (30, 'cat.png'),
          (40, 'кот.png'),
          (50, 'misic-🎵-.mp3');`,
      ].forEach((stmt) =>
        expect(db.prepare(stmt).run().changes).toBeGreaterThan(0)
      );
    });

    sqlTest(
      db,
      "7.1",
      `SELECT rowid as res FROM f WHERE +filename GLOB '*ир*';`,
      [],
      20
    );

    sqlTest(
      db,
      "7.2",
      `SELECT rowid as res FROM f WHERE filename GLOB '*ир*';`,
      [],
      20
    );
  });

  describe("v8", () => {
    const db = initDatabase();

    test("8.0", () => {
      [
        `CREATE VIRTUAL TABLE t1 USING fts5(y, tokenize = 'better_trigram');`,
        `INSERT INTO t1 VALUES('abcdefghijklm')`,
      ].forEach((stmt) =>
        expect(db.prepare(stmt).run().changes).toBeGreaterThan(0)
      );
    });

    [
      ["abc ghi", "(abc)def(ghi)jklm"],
      ["def ghi", "abc(defghi)jklm"],
      ["efg ghi", "abcd(efghi)jklm"],
      ["efghi", "abcd(efghi)jklm"],
      ["abcd jklm", "(abcd)efghi(jklm)"],
      ["ijkl jklm", "abcdefgh(ijklm)"],
      ["ijk ijkl hijk", "abcdefg(hijkl)m"],
    ].forEach((testCase, index) => {
      sqlTest(
        db,
        `8.1.${index + 1}`,
        `SELECT highlight(t1, 0, '(', ')') as res FROM t1(?)`,
        [testCase[0]],
        testCase[1]
      );
    });

    test("8.2", () => {
      [
        `CREATE VIRTUAL TABLE ft2 USING fts5(a, tokenize="better_trigram");`,
        `INSERT INTO ft2 VALUES('abc x cde');`,
        `INSERT INTO ft2 VALUES('abc cde');`,
        `INSERT INTO ft2 VALUES('abcde');`,
      ].forEach((stmt) =>
        expect(db.prepare(stmt).run().changes).toBeGreaterThan(0)
      );
    });

    test("8.3", () => {
      const expected = ["[abc] x [cde]", "[abc] [cde]", "[abcde]"];
      db.prepare(
        `SELECT highlight(ft2, 0, '[', ']') as res FROM ft2 WHERE ft2 MATCH 'abc AND cde';`
      )
        .all()
        .forEach((result, i) => {
          expect((result as { res: string }).res).toBe(expected[i]);
        });
    });
  });

  describe("v9", () => {
    const db = initDatabase();

    test("9.0", () => {
      [
        `CREATE VIRTUAL TABLE t1 USING fts5(
          a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, 
          tokenize=better_trigram
        );`,
        `INSERT INTO t1(rowid, a12) VALUES(111, 'thats a tricky case though');`,
        `INSERT INTO t1(rowid, a12) VALUES(222, 'the query planner cannot do');`,
      ].forEach((stmt) =>
        expect(db.prepare(stmt).run().changes).toBeGreaterThan(0)
      );
    });

    sqlTest(
      db,
      "9.1",
      `SELECT rowid as res FROM t1 WHERE a12 LIKE '%tricky%'`,
      [],
      111
    );

    sqlTest(
      db,
      "9.2",
      `SELECT rowid as res FROM t1 WHERE a12 LIKE '%tricky%' AND a12 LIKE '%case%'`,
      [],
      111
    );

    sqlTest(
      db,
      "9.3",
      `SELECT rowid as res FROM t1 WHERE a12 LIKE NULL`,
      [],
      undefined
    );
  });

  describe("v10", () => {
    const db = initDatabase();

    test("10.0", () => {
      [`CREATE VIRTUAL TABLE t1 USING fts5(a, tokenize=trigram);`].forEach(
        (stmt) => expect(db.prepare(stmt).run().changes).toBeGreaterThan(0)
      );
    });

    test("10.1", () => {
      [
        `"abc UFFjklUFF"`,
        `"abc UFFFjklUFFF"`,
        `"abc UFFFFjklUFFFF"`,
        `"abc UFFFFFjklUFFFFF"`,
        `"UFFjklUFF abc"`,
        `"UFFFjklUFFF abc"`,
        `"UFFFFjklUFFFF abc"`,
        `"UFFFFFjklUFFFFF abc"`,
        `"U10001jklU10001 abc"`,
      ].forEach((val) => db.query(`INSERT INTO t1 VALUES( ${val} ) `).run());
    });

    test("10.2", () => {
      [
        `X'E18000626320646566'`,
        `X'61EDA0806320646566'`,
        `X'61EDA0806320646566'`,
        `X'61EFBFBE6320646566'`,
        `X'76686920E18000626320646566'`,
        `X'7668692061EDA0806320646566'`,
        `X'7668692061EDA0806320646566'`,
        `X'7668692061EFBFBE6320646566'`,
      ].forEach((val) => db.query(`INSERT INTO t1 VALUES( ${val} ) `).run());
    });

    test("10.3", () => {
      const a = Buffer.from([0x61, 0xf7, 0xbf, 0xbf, 0xbf, 0x62]).toString(
        "utf-8"
      );
      const b = Buffer.from([
        0x61, 0xf7, 0xbf, 0xbf, 0xbf, 0xbf, 0x62,
      ]).toString("utf-8");
      const c = Buffer.from([
        0x61, 0xf7, 0xbf, 0xbf, 0xbf, 0xbf, 0xbf, 0x62,
      ]).toString("utf-8");
      const d = Buffer.from([
        0x61, 0xf7, 0xbf, 0xbf, 0xbf, 0xbf, 0xbf, 0xbf, 0x62,
      ]).toString("utf-8");

      [
        `INSERT INTO t1 VALUES('${a}');`,
        `INSERT INTO t1 VALUES('${b}');`,
        `INSERT INTO t1 VALUES('${c}');`,
        `INSERT INTO t1 VALUES('${d}');`,

        `INSERT INTO t1 VALUES('abcd' || '${a}');`,
        `INSERT INTO t1 VALUES('abcd' || '${b}');`,
        `INSERT INTO t1 VALUES('abcd' || '${c}');`,
        `INSERT INTO t1 VALUES('abcd' || '${d}');`,
      ].forEach((val) => {
        db.query(val).run();
      });
    });
  });
});

function sqlTest(
  db: Database,
  version: string,
  query: string,
  params: string[],
  expected: string | number | undefined | (string | number | undefined)[]
) {
  test(version, () => {
    const result = db.query(query).all(...params) as {
      res: string | number;
    }[];
    if (Array.isArray(expected)) {
      expect(Array.isArray(expected)).toBeTrue();
      expect(result.length).toBe(expected.length);
      result.forEach((result, i) => expect(result.res).toBe(expected[i]!));
    } else {
      expect(result[0]?.res).toBe(expected!);
    }
  });
}

function explainQueryPlanTest(
  db: Database,
  version: string,
  query: string,
  params: string[],
  expected: string
) {
  test(version, () => {
    const result = db.query(`EXPLAIN QUERY PLAN ${query}`).get(...params) as {
      detail?: string;
    };
    expect(result?.detail).toInclude(expected);
  });
}
