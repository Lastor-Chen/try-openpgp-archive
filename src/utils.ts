import webStream from 'node:stream/web'

import * as prompts from '@clack/prompts'

// 由 Bun 注入, 也可比對 process.execPath 與 Bun.argv[0] 是否一致來判斷
export const isBunStandalone = typeof __BUN_STANDALONE__ !== 'undefined'
	? __BUN_STANDALONE__
	: false

export async function waitPressKey() {
  if (process.platform !== 'win32') return

	// HACK 從 @clack/prompts 搶回 stdin 控制權
	process.stdin.resume()
	process.stdin.setRawMode(true)

	console.info('Press any key to exit...')
	await new Promise((resolve) => process.stdin.once('data', resolve))
}

export async function exitProcess(msg = 'Operation cancelled'): Promise<never> {
	prompts.cancel(msg)
	await waitPressKey()

	process.exit()
}

export function createProgressStream(
	totalBytes: number,
	options?: {
		onTransform?(chunk: Uint8Array, percent: number): void
		onFlush?(): void
	},
) {
	let countBytes = 0
	return new webStream.TransformStream<Uint8Array>({
		transform(chunk, controller) {
			countBytes += chunk.byteLength
			const percent = Math.floor((countBytes / totalBytes) * 100)
			options?.onTransform?.(chunk, percent)

			controller.enqueue(chunk)
		},
		flush() {
			options?.onFlush?.()
		},
	})
}
