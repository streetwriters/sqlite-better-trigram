import { run, bench, compact, summary } from "mitata";
import { Database } from "bun:sqlite";
import { LoremIpsum } from "lorem-ipsum";

const lorem = new LoremIpsum({
  sentencesPerParagraph: {
    max: 15,
    min: 10,
  },
  wordsPerSentence: {
    max: 50,
    min: 20,
  },
});

const text = lorem.generateParagraphs(100);
function initDatabase() {
  const db = new Database(":memory:");
  db.loadExtension("./dist/better-trigram.so");
  return db;
}
const db = initDatabase();
db.query(
  `CREATE VIRTUAL TABLE bt1 USING fts5(y, tokenize='better_trigram');`
).run();
db.query(`CREATE VIRTUAL TABLE t1 USING fts5(y, tokenize='trigram');`).run();
const btQuery = db.query(`INSERT INTO bt1 VALUES( ? );`);
const tQuery = db.query(`INSERT INTO t1 VALUES( ? );`);

console.log("Text length:", text.length);

compact(() => {
  summary(() => {
    bench("better-trigram", () => {
      btQuery.run(text);
    });

    bench("trigram", () => {
      tQuery.run(text);
    });
  });
});

await run();
