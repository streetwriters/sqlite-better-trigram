<h1 align="center">better-trigram</h1>

<p align="center">A (better) trigram tokenizer for SQLite3 FTS5</p>

While SQLite3 already has a built-in trigram tokenizer, it does not have any kind of word segmentation support. For example, `i am a bird` gets tokenized as `['i a', ' am', 'm a', ' a ', ' bi', 'bir', 'ird']` which isn't too bad but in real-world use cases users usually type queries as `SELECT * FROM fts_table WHERE title MATCH 'a bird'` which returns no results.

This tokenizer fixes this by treating spaces as a word boundary. The result is that `i am a bird` gets tokenized as `['i', 'am', 'a', 'bir', 'ird']` and `SELECT * FROM fts_table WHERE title MATCH 'a bird'` correctly returns the expected results. You get all the benefits for substring matching just with a wider range of queries.

## Compatibility with `trigram`

`better-trigram` is 99% compatible with `trigram`. This means it has full UTF-8 support, handles all the same edge cases etc. To ensure `better-trigram` remains compatible, it passes all the `trigram` tokenizer tests. Yay!

With that being said, `better-trigram` doesn't support `LIKE` & `GLOB` patterns. This is a limitation in FTS5 because it doesn't allow custom tokenizers to opt-in to this behavior. (You _could_ technically compile a custom version of FTS5 that enables support for this but I haven't looked into it.) Using `LIKE` & `GLOB` will fallback to full table scans (not recommended).

## Usage

You can use this tokenizer like any other custom tokenizer:

```sh
make
```

Load the `better-trigram.so` file as a loadable SQLite extension (e.g. `.load better-trigram.so`).

Then specify it when creating your FTS5 virtual table:

```sql
CREATE VIRTUAL TABLE t1 USING fts5(y, tokenize='better_trigram')
```

### Options

`better-trigram` supports exactly the same options as `trigram` and copies the exact behavior of the original tokenizer when specifying invalid options. This means setting `case_sensitive 1` and `remove_diacritics 1` will throw an error.

Refer to [FTS5 documentation for the Trigram tokenizer](https://sqlite.org/fts5.html#the_trigram_tokenizer) for more details on what each options does and how you can use it.

## Performance

`better-trigram` is significantly faster than `trigram`. Here are the benchmarks:

```
Text length: 289091
clk: ~4.09 GHz
cpu: AMD Ryzen 5 PRO 5650U with Radeon Graphics
runtime: bun 1.1.31 (x64-linux)

benchmark              avg (min … max) p75   p99    (min … top 1%)
-------------------------------------- -------------------------------
better-trigram            6.37 ms/iter   6.86 ms   7.31 ms ▂▅▃▂▂▃▄▇█▄▂
trigram                  10.21 ms/iter  11.23 ms  12.75 ms █▄▄▄▃▅▅▇▄▂▂

summary
  better-trigram
   1.6x faster than trigram
```

To reproduce on your own machine, run `bun bench.ts`.

## Contributing

All kinds of PRs are welcome, of course. Just make sure all the tests pass. You can run the tests like this:

```sh
make test
```

## License

```
2024-10-21

The author disclaims copyright to this source code.  In place of
a legal notice, here is a blessing:

    May you do good and not evil.
    May you find forgiveness for yourself and forgive others.
    May you share freely, never taking more than you give.
```
