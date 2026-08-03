import fs from 'node:fs'
import path from 'node:path'
import stream from 'node:stream'
import webStream from 'node:stream/web'

import { ZipArchive } from 'archiver'
import * as openpgp from 'openpgp'
import * as prompts from '@clack/prompts'
import { parse } from 'shell-quote'

import { exitProcess, isBunStandalone, createProgressStream } from './utils.ts'

const rootPath = isBunStandalone ? path.dirname(process.execPath) : process.cwd()

export async function generateKey() {
  const _name = await prompts.text({ message: 'User name' })
  if (prompts.isCancel(_name)) return void exitProcess()
  const name = _name.trim()

  const _email = await prompts.text({ message: 'User email' })
  if (prompts.isCancel(_email)) return void exitProcess()
  const email = _email.trim()

  const _comment = await prompts.text({ message: 'Comment' })
  if (prompts.isCancel(_comment)) return void exitProcess()
  const comment = _comment.trim()

  const keyPair = await openpgp.generateKey({
    type: 'ecc',
    curve: 'curve25519Legacy',
    userIDs: [
      { name, email, comment },
    ],
    format: 'armored',
    keyExpirationTime: 365 * 24 * 60 * 60, // 1 year in seconds
  })

  const parsedPrivateKey = await openpgp.readPrivateKey({ armoredKey: keyPair.privateKey })
  const keyId = parsedPrivateKey.getKeyID().toHex()

  const encKey = await parsedPrivateKey.getEncryptionKey()
  const encKeyId = encKey.getKeyID().toHex()

  const saveDir = path.join(rootPath, './data/keyrings', keyId)
  fs.mkdirSync(saveDir, { recursive: true })

  fs.writeFileSync(path.join(saveDir, 'private.asc'), keyPair.privateKey)
  fs.writeFileSync(path.join(saveDir, 'public.asc'), keyPair.publicKey)
  fs.writeFileSync(path.join(saveDir, 'revocation.asc'), keyPair.revocationCertificate)

  // meta
  let config: Record<string, string> = {}
  const metaFile = path.join(rootPath, './data/metadata.json')
  if (fs.existsSync(metaFile)) {
    const rawConfig = fs.readFileSync(metaFile, 'utf8')
    config = JSON.parse(rawConfig) as Record<string, string>
  }

  config[encKeyId] = keyId
  fs.writeFileSync(metaFile, JSON.stringify(config, null, 2))
}

export async function readKeyId() {
  const _keyPath = await prompts.text({ message: 'PGP key path' })
  if (prompts.isCancel(_keyPath)) return void exitProcess()
  const keyPath = parse(_keyPath)[0] as string

  const pgpKey = fs.readFileSync(keyPath, 'utf8')

  const parsedPublicKey = await openpgp.readKey({ armoredKey: pgpKey })
  const keyId = parsedPublicKey.getKeyID().toHex()
  console.log('primaryKey:', keyId)

  const encryptionKey = await parsedPublicKey.getEncryptionKey()
  console.log('encryptionKey:', encryptionKey.getKeyID().toHex())
}

export async function encrypt() {
  const _files = await prompts.multiline({
    message: 'File paths (multi)'
  })
  if (prompts.isCancel(_files)) return void exitProcess()
  const files = parse(_files) as string[]

  const _pubkeyPaths = await prompts.multiline({ message: 'Public key paths (multi)' })
  if (prompts.isCancel(_pubkeyPaths)) return void exitProcess()
  const pubkeyPaths = parse(_pubkeyPaths) as string[]

  const dest = path.join(rootPath, './output/encrypted.zip.pgp')

  // pack
  let totalBytes = 0
  files.forEach((file) => totalBytes += fs.statSync(file).size)

  const archive = new ZipArchive({
    zlib: { level: 0 },
  })

  files.forEach((file) => {
    const stat = fs.statSync(file)
    const name = path.basename(file)
    prompts.log.info(`[AddEntry] ${name}`)
  
    if (stat.isDirectory()) {
      archive.directory(file, name)
    } else {
      archive.file(file, { name })
    }
  })

  archive.finalize()
  
  // encrypt
  const encryptionKeys = await Promise.all(
    pubkeyPaths.map((keyPath) => {
      const pubkey = fs.readFileSync(keyPath, 'utf8')
      return openpgp.readKey({ armoredKey: pubkey })
    }),
  )

  const message = await openpgp.createMessage({ binary: stream.Readable.toWeb(archive) })
  const encryptStream = await openpgp.encrypt({
    message,
    encryptionKeys,
    format: 'binary',
  })

  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const writeStream = fs.createWriteStream(dest)

  // progress bar
  const p = prompts.progress({ max: totalBytes })
  const progressStream = createProgressStream(totalBytes, {
    onTransform(chunk, percent) {
      p.advance(chunk.byteLength, `${percent}%`)
    },
    onFlush() {
      p.stop('Encrypt successfully')
    },
  })

  p.start()
  await stream.promises.pipeline(
    encryptStream,
    progressStream,
    writeStream,
  )

  prompts.log.info(`Output:\n${dest}`)
}

export async function decrypt() {
  const _file = await prompts.text({ message: 'Encrypted file path' })
  if (prompts.isCancel(_file)) return void exitProcess()
  const file = _file.trim()

  const totalBytes = fs.statSync(file).size
  const readable = fs.createReadStream(file)
  const readableStream = stream.Readable.toWeb(readable)

  const message = await openpgp.readMessage({ binaryMessage: readableStream })

  const encKeyIds = message.getEncryptionKeyIDs()

  const metaFile = path.join(rootPath, './data/metadata.json')
  const rawConfig = fs.readFileSync(metaFile, 'utf8')
  const config = JSON.parse(rawConfig) as Record<string, string>
  const keyMap = new Map(Object.entries(config))

  const targetEncKeyId = encKeyIds.find((encId) => keyMap.has(encId.toHex()))
  if (!targetEncKeyId) throw new Error('Not Receiver')
  const primaryKeyId = keyMap.get(targetEncKeyId.toHex())!

  const privatePath = path.join(rootPath, './data/keyrings/', primaryKeyId, 'private.asc')
  const rawPrivateKey = fs.readFileSync(privatePath, 'utf8')

  const privateKey = await openpgp.readPrivateKey({ armoredKey: rawPrivateKey })
  // 可能有 passphrase 才需要
  // const decryptKey = await openpgp.decryptKey({ privateKey })
  const { data: decryptStream, signatures } = await openpgp.decrypt({
    message,
    decryptionKeys: privateKey,
    format: 'binary',
  })

  const parsedInput = path.parse(file)
  const outputPath = path.join(parsedInput.dir, parsedInput.name)
  const writeStream = fs.createWriteStream(outputPath)

  // progress bar
  const p = prompts.progress({ max: totalBytes })
  const progressStream = createProgressStream(totalBytes, {
    onTransform(chunk, percent) {
      p.advance(chunk.byteLength, `${percent}%`)
    },
    onFlush() {
      p.stop('Encrypt successfully')
    },
  })

  p.start()
  await stream.promises.pipeline(
    decryptStream,
    progressStream,
    writeStream,
  )
}
