EXT = .so
CFLAGS ?= -Os -Wall -Wextra -Werror -Wno-error=type-limits
SQLITE_VERSION = version-3.46.1

ifeq ($(OS),Windows_NT)
	EXT = .dll
else
	UNAME_S := $(shell uname -s)
	ifeq ($(UNAME_S),Darwin)
		EXT = .dylib
	endif
endif

.PHONY: all clean test

all: fts5_unicode2.c better-trigram$(EXT)

clean:
	rm -r fts5_unicode2.c
	rm -f better-trigram$(EXT)
	rm -rf better-trigram$(EXT).dSYM
	rm -rf fts5$(EXT)

fts5_unicode2.c:
	wget -q https://raw.githubusercontent.com/sqlite/sqlite/refs/tags/$(SQLITE_VERSION)/ext/fts5/fts5_unicode2.c

better-trigram$(EXT): better-trigram.c
	$(CC) $(CFLAGS) -g -shared -fPIC -o $@ $<

fts5$(EXT): SHELL := /bin/bash -e
fts5$(EXT):
	dir=/tmp/$$(cat /dev/urandom | tr -cd 'a-f0-9' | head -c 32); \
	cwd=$$(pwd); \
	git clone --depth=1 --branch=$(SQLITE_VERSION) https://github.com/sqlite/sqlite.git $$dir; \
	lemon $$dir/ext/fts5/fts5parse.y; \
	cd $$dir/ext/fts5; \
	tclsh $$dir/ext/fts5/tool/mkfts5c.tcl; \
	cd $$cwd; \
	$(CC) -DSQLITE_TEST -g -shared -fPIC -o fts5.so $$dir/ext/fts5/fts5.c; \
	rm -rf $$dir

test: fts5$(EXT) fts5_unicode2.c better-trigram$(EXT)
	bun test
