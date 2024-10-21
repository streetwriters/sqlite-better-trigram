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

#include <sqlite3ext.h>
#include <stdint.h>
#include <string.h>

typedef uint8_t u8;
typedef uint16_t u16;
typedef uint16_t u32;

#include "fts5_unicode2.c"

/*
** The following macro - WRITE_UTF8 - have been copied
** from the sqlite3 source file:
*https://github.com/sqlite/sqlite/blob/88282af521692b398b0d0cc58a8bdb220a8ff58c/ext/fts5/fts5_tokenize.c.
*/
static const unsigned char sqlite3Utf8Trans1[] = {
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a,
    0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15,
    0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x00,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
    0x0c, 0x0d, 0x0e, 0x0f, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
    0x07, 0x00, 0x01, 0x02, 0x03, 0x00, 0x01, 0x00, 0x00,
};

#define READ_UTF8(zIn, zTerm, c)                                               \
  c = *(zIn++);                                                                \
  if (c >= 0xc0) {                                                             \
    c = sqlite3Utf8Trans1[c - 0xc0];                                           \
    while (zIn < zTerm && (*zIn & 0xc0) == 0x80) {                             \
      c = (c << 6) + (0x3f & *(zIn++));                                        \
    }                                                                          \
    if (c < 0x80 || (c & 0xFFFFF800) == 0xD800 ||                              \
        (c & 0xFFFFFFFE) == 0xFFFE) {                                          \
      c = 0xFFFD;                                                              \
    }                                                                          \
  }

#define WRITE_UTF8(zOut, c)                                                    \
  {                                                                            \
    if (c < 0x00080) {                                                         \
      *zOut++ = (unsigned char)(c & 0xFF);                                     \
    } else if (c < 0x00800) {                                                  \
      *zOut++ = 0xC0 + (unsigned char)((c >> 6) & 0x1F);                       \
      *zOut++ = 0x80 + (unsigned char)(c & 0x3F);                              \
    } else if (c < 0x10000) {                                                  \
      *zOut++ = 0xE0 + (unsigned char)((c >> 12) & 0x0F);                      \
      *zOut++ = 0x80 + (unsigned char)((c >> 6) & 0x3F);                       \
      *zOut++ = 0x80 + (unsigned char)(c & 0x3F);                              \
    } else {                                                                   \
      *zOut++ = 0xF0 + (unsigned char)((c >> 18) & 0x07);                      \
      *zOut++ = 0x80 + (unsigned char)((c >> 12) & 0x3F);                      \
      *zOut++ = 0x80 + (unsigned char)((c >> 6) & 0x3F);                       \
      *zOut++ = 0x80 + (unsigned char)(c & 0x3F);                              \
    }                                                                          \
  }

#define FTS5_SKIP_UTF8(zIn)                                                    \
  {                                                                            \
    if (((unsigned char)(*(zIn++))) >= 0xc0) {                                 \
      while ((((unsigned char)*zIn) & 0xc0) == 0x80) {                         \
        zIn++;                                                                 \
      }                                                                        \
    }                                                                          \
  }

/* Function to optionally fold case and remove diacritics */
static inline int customFold(int iCode, int foldCase, int removeDiacritics) {
  if (iCode == 0)
    return iCode;
  if (foldCase)
    return sqlite3Fts5UnicodeFold(iCode, removeDiacritics);
  return iCode;
}

static void tokenize(const char *pText, int nText, int foldCase,
                     int removeDiacritics, void *pCtx,
                     int (*xToken)(void *, int, const char *, int, int, int)) {
  const unsigned char *zIn = (const unsigned char *)pText;
  const unsigned char *zEnd = zIn + nText;
  char aBuf[32]; /* Buffer for trigram tokens */
  char *zOut = aBuf;
  int iCode;
  int aStart[3];     // offsets for each character in a trigram
  int i = 0;         // index inside the trigram
  int isPartial = 0; // flag to indicate we are in the middle of a word

  while (zIn < zEnd) {
    int start;

    do {
      start = zIn - (const unsigned char *)pText;
      READ_UTF8(zIn, zEnd, iCode);
      if (iCode == 0)
        break;
      iCode = customFold(iCode, foldCase, removeDiacritics);
    } while (iCode == 0);

    if (iCode == 0)
      break;

    if (i == 3) {
      int result = xToken(pCtx, 0, aBuf, zOut - aBuf, aStart[0], start);
      if (result != SQLITE_OK)
        break;

      // remove first UTF-8 character from aBuf
      const char *z1 = aBuf;
      FTS5_SKIP_UTF8(z1);
      memmove(aBuf, z1, zOut - z1);
      // seek zOut back 1 step so we can add the next character
      // of the trigram
      zOut = zOut - (z1 - aBuf);

      // swap the offsets
      aStart[0] = aStart[1];
      aStart[1] = aStart[2];

      i--;
      isPartial = 1;
    }

    if (iCode == 32) {
      // write words smaller than 3 characters directly to output
      // but make sure we aren't at the end of a word
      if (!isPartial && i && i < 3) {
        int result = xToken(pCtx, 0, aBuf, zOut - aBuf, aStart[0], start);
        if (result != SQLITE_OK)
          break;
      }

      // reset for next word
      isPartial = 0;
      i = 0;
      zOut = aBuf;
      continue;
    }

    aStart[i++] = start;
    WRITE_UTF8(zOut, iCode);
  }

  // write out the remaining tokens if any
  if (i > 0) {
    xToken(pCtx, 0, aBuf, zOut - aBuf, aStart[0],
           zIn - (const unsigned char *)pText);
  }
}
