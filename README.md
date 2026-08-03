# try-openpgp-archive

This is a prototype. Try to use openpgp.js streaming encrypt and decrypt with zip pack files.

## Usage

run openpgp cli tool

```
$ pnpm dev
```

1. generateKey, save in `data/`
2. encrypt, select files and public keys to zip pack then encrypt, save in `output/`
3. decrypt, auto find private key from encrypted file for decrypt

## Build single file executable by bun 

Build for darwin arm64

```
$ bun run compile
```

Build for windows x64

```
$ bun run compile:win
```

## Other

Streaming use with tar-stream example.

https://gist.github.com/Lastor-Chen/f108dd655977ec5b2eda42f2cd907fe5
