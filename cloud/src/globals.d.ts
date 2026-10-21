// workers-types declares `crypto` as a const, which is not visible as `globalThis.crypto`; src/shared/*.ts uses that form.
declare var crypto: Crypto
