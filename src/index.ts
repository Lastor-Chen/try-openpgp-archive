import * as prompts from '@clack/prompts'

import * as apis from './service.ts'
import { exitProcess } from './utils.ts'

const keys = Object.keys(apis)

const method = await prompts.autocomplete({
  message: 'OpenPGP CLI',
  options: keys.map((key) => ({
    label: key,
    value: key as keyof typeof apis,
  })),
})

if (prompts.isCancel(method)) {
  void exitProcess()
} else {
  await apis[method]()
  prompts.outro('completed')
}
