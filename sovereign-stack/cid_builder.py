#!/usr/bin/env python3
"""cid_builder.py — content-addressable identifiers: CIDv1 raw + sha2-256.

Task 33-b. Native rebuild of the "IPFS-CID-Builder / Pure-Sha256-Trie" layer
for the stdlib sovereign stack: the IDENTIFIER FORMAT is a public standard —
  multibase base32-lower (prefix 'b') of
  CIDv1 version (0x01) + codec raw (0x55) + multihash sha2-256 (0x12, 0x20)
— giving every compiled markdown buffer a cryptographically immutable
address computed in-memory BEFORE anything touches the disk. Zero
dependencies, zero network: the address is derived, never fetched.

Determinism law: identical bytes → identical CID on every machine.
Refusal law: non-bytes input and malformed CID strings raise (never guess).
"""
from __future__ import annotations
import base64
import hashlib
from pathlib import Path

CIDV1_RAW_SHA256_PREFIX = bytes([0x01, 0x55, 0x12, 0x20])
_B32_ALPHA = set("abcdefghijklmnopqrstuvwxyz234567")


def cid_bytes(data: bytes) -> bytes:
    """Binary CIDv1-raw(sha2-256) of data: 4-byte prefix + 32-byte digest."""
    if not isinstance(data, (bytes, bytearray)):
        raise TypeError("cid input must be bytes")
    return CIDV1_RAW_SHA256_PREFIX + hashlib.sha256(bytes(data)).digest()


def cid(data: bytes) -> str:
    """String CID: 'b' + base32-lower (RFC4648, no padding) of cid_bytes."""
    raw = cid_bytes(data)
    return "b" + base64.b32encode(raw).decode("ascii").lower().rstrip("=")


def parse(c: str) -> bytes:
    """Decode a 'b'-multibase CID string back to its binary form."""
    if not isinstance(c, str) or not c or c[0] != "b":
        raise ValueError("not a base32-multibase CID ('b' prefix missing)")
    body = c[1:].upper()
    pad = "=" * ((8 - len(body) % 8) % 8)
    return base64.b32decode(body + pad)


def verify(c: str, data: bytes) -> bool:
    """True iff c is a valid CIDv1-raw-sha256 address OF exactly data."""
    try:
        return parse(c) == cid_bytes(data)
    except Exception:
        return False


def cid_for_file(path) -> str:
    """CID of a file's exact bytes on disk."""
    return cid(Path(path).read_bytes())


if __name__ == "__main__":
    import json
    demo = b"# deterministic markdown buffer\n"
    print(json.dumps({"cid": cid(demo), "len": len(cid(demo)),
                      "verify": verify(cid(demo), demo)}))
