import { waitPressKey } from '../src/utils'

try {
  // 捕獲所有例外
  await import('../src/index')
} catch (err) {
  console.error(err)
} finally {
  // windows 報錯時會直接關閉視窗, 卡一個等待才能查看 error msg
  await waitPressKey()
  process.exit()
}
