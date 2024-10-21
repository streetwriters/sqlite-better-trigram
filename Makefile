EXT = .so
SQLITE_VERSION ?= version-3.46.1
CFLAGS ?= -I deps/$(SQLITE_VERSION)/ext/fts5 -Os -Wall -Wextra -Werror -Wno-error=type-limits

SQLITE_TARBALL_URL = https://www.sqlite.org/src/tarball/sqlite.tar.gz?r=${SQLITE_VERSION}
SQLITE_SRC = deps/$(SQLITE_VERSION)/src

CONDITIONAL_CFLAGS =

ifeq ($(OS),Windows_NT)
	EXT = .dll
else
	UNAME_S := $(shell uname -s)
	ifeq ($(UNAME_S),Darwin)
		EXT = .dylib
		CONDITIONAL_CFLAGS = -lsqlite3
	endif
endif

.PHONY: all clean test

all: $(SQLITE_SRC)/sqlite3ext.h better-trigram$(EXT)

clean:
	rm -rf deps
	rm -f better-trigram$(EXT)
	rm -rf better-trigram$(EXT).dSYM
	rm -rf fts5$(EXT)

$(SQLITE_SRC)/sqlite3ext.h:
	mkdir -p deps/$(SQLITE_VERSION)
	curl -LsS $(SQLITE_TARBALL_URL) | tar -xzf - -C deps/$(SQLITE_VERSION)/ --strip-components=1

better-trigram$(EXT): better-trigram.c
	$(CC) $(CFLAGS) $(CONDITIONAL_CFLAGS) -g -shared -fPIC -o $@ $<

fts5$(EXT): SHELL := /bin/bash -e
fts5$(EXT): $(SQLITE_SRC)/sqlite3ext.h
	dir=deps/$(SQLITE_VERSION) \
	cwd=$$(pwd); \
	lemon $$dir/ext/fts5/fts5parse.y; \
	cd $$dir/ext/fts5; \
	tclsh $$cwd/$$dir/ext/fts5/tool/mkfts5c.tcl; \
	cd $$cwd; \
	$(CC) $(CONDITIONAL_CFLAGS) -DSQLITE_TEST -g -shared -fPIC $$dir/ext/fts5/fts5.c -o $@ $<; \

test: fts5$(EXT) better-trigram$(EXT)
	bun test
