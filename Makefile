EXT = .so
SQLITE_VERSION ?= version-3.46.1

SQLITE_TARBALL_URL = https://www.sqlite.org/src/tarball/sqlite.tar.gz?r=${SQLITE_VERSION}
SQLITE_SRC = deps/$(SQLITE_VERSION)/src
SQLITE_AMALGAMATION_URL = https://sqlite.org/2024/sqlite-amalgamation-3460100.zip
SQLITE_AMALGAMATION_PATH = deps/sqlite-amalgamation-3460100

CFLAGS ?= -Ideps/$(SQLITE_VERSION)/ext/fts5 -I$(SQLITE_AMALGAMATION_PATH) -Os -Wall -Wextra
CONDITIONAL_CFLAGS = -lm

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

all: better-trigram$(EXT)

clean:
	rm -rf deps
	rm -f better-trigram$(EXT)
	rm -rf better-trigram$(EXT).dSYM
	rm -rf fts5$(EXT)

$(SQLITE_SRC):
	mkdir -p deps/$(SQLITE_VERSION)
	curl -LsS $(SQLITE_TARBALL_URL) | tar -xzf - -C deps/$(SQLITE_VERSION)/ --strip-components=1

$(SQLITE_AMALGAMATION_PATH):
	@echo Downloading SQLite amalgamation...
	wget -q $(SQLITE_AMALGAMATION_URL) -O sqlite.zip
	@echo Extracting SQLite amalgamation...
	unzip sqlite.zip -d deps/
	rm -f sqlite.zip

better-trigram$(EXT): $(SQLITE_SRC) $(SQLITE_AMALGAMATION_PATH)
	$(CC) $(CFLAGS) $(CONDITIONAL_CFLAGS) -shared -fPIC -o $@ better-trigram.c

fts5$(EXT): SHELL := /bin/bash -e
fts5$(EXT): $(SQLITE_SRC) $(SQLITE_AMALGAMATION_PATH)
	dir=deps/$(SQLITE_VERSION) \
	cwd=$$(pwd); \
	lemon $$dir/ext/fts5/fts5parse.y; \
	cd $$dir/ext/fts5; \
	tclsh $$cwd/$$dir/ext/fts5/tool/mkfts5c.tcl; \
	cd $$cwd; \
	$(CC) $(CFLAGS) $(CONDITIONAL_CFLAGS) -DSQLITE_TEST -shared -fPIC -o $@ $$dir/ext/fts5/fts5.c; \

test: fts5$(EXT) better-trigram$(EXT)
	bun test
