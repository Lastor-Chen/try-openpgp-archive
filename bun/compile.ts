// More bun single-file executable information:
// https://bun.com/docs/bundler/executables
import fs from 'node:fs'
import path from 'node:path'
import util from 'node:util'

import pkg from '../package.json'

// default root path is process.cwd()
const dest = './bun/build'
const { isWin32 } = parseArgv()
const version = pkg.version.replaceAll('.', '_')

{ // compile single-file executable
  fs.rmSync(dest, { recursive: true, force: true })

  const result = await Bun.build({
    entrypoints: ['./bun/index.ts'],
    compile: {
      target: isWin32 ? 'bun-windows-x64-modern' : 'bun-darwin-arm64',
      outfile: isWin32
        ? path.join(dest, `openpgp-cli-windows-v${version}`)
        : path.join(dest, `openpgp-cli-darwin-v${version}`),
    },
    minify: true,
    define: {
      __BUN_STANDALONE__: 'true',
    },
  })
  if (result.success) {
    console.log('Build successfully:')
    console.log(util.styleText('green', result.outputs[0]?.path || ''))
  }

  await removeBunTempFile()

  // TODO 考慮改用 cpy 等 lib
  // copy static assets
  globCopyHelper(dest, [
    { globFrom: './data', to: './data' },
  ])
}

function parseArgv() {
	const argv = util.parseArgs({
		strict: true,
		allowPositionals: true,
		args: Bun.argv,
		options: {
			windows: { type: 'boolean' },
		},
	})

	return {
		isWin32: argv.values.windows,
	}
}

/** bun 打包完單一執行檔案會產生 tmp file, 目前不會自動清除 */
async function removeBunTempFile() {
  const buildTmpGlob = new Bun.Glob('./*.bun-build')
  for await (const file of buildTmpGlob.scan({ dot: true })) {
    fs.rmSync(file, { force: true })
  }
}

/**
 * Glob copy helper for `fs.cp()` and tsdown's copy in config.
 *
 * @description
 * `fs.cp()` 只接受 dir to dir 或 file to file。例如這樣是不 work 的:
 * ```
 * { from: "dir/file.png", to: "dist" }
 * ```
 */
function globCopyHelper(
  /** `to` 的 base dir. */
  outDir: string,
  /** Copy entries, support `globFrom`. */
  entries: {
    /** 給 dir 將解析 glob 攤平到 `from`，給 file 會擷取 basename 拼到 `to`。 */
    globFrom: string
    /** 給 dir 會跟 from 的 basename 拼接，給 file 會直接以 `to` 作為輸出路徑。 */
    to: string
  }[],
) {
  const copyList = entries.flatMap(({ globFrom, to }) => {
    const fromList = fs.globSync(globFrom)

    return fromList.map((from) => {
      // from
      const fromIsFile = !!path.extname(from)
      const fromFileName = fromIsFile ? path.basename(from) : ''

      // to
      const toIsFile = !!path.extname(to)

      return {
        from,
        to: toIsFile ? path.join(outDir, to) : path.join(outDir, to, fromFileName),
      }
    })
  })

  copyList.forEach(({ from, to }) => {
    fs.cpSync(from, to, { recursive: fs.statSync(from).isDirectory() })
  })
}
