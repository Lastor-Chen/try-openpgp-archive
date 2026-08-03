import * as prompts from '@clack/prompts'

import * as apis from './api.ts'

const keys = Object.keys(apis)

const method = await prompts.autocomplete({
  message: 'OpenPGP CLI',
  options: keys.map((key) => ({
    label: key,
    value: key as keyof typeof apis,
  })),
})
if (prompts.isCancel(method)) process.exit()

await apis[method]()
prompts.outro('completed')
